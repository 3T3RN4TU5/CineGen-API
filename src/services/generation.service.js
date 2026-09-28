import { fal } from '../config/fal.js';
import { env } from '../config/env.js';
import { getModel, isEnabled, calculateCost, isVideoType } from '../config/models.config.js';
import { Generation, TERMINAL_STATUSES } from '../models/Generation.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { enhancePrompt } from './prompt.service.js';
import { debitForGeneration, logGenerationDebit, refundGeneration } from './credit.service.js';
import { uploadFromUrl, deleteAsset } from './storage.service.js';

const LOCK_TTL_MS = 5 * 60 * 1000;
const STALE_CHECK_MS = 60 * 1000;

/** fal cannot reach localhost, so only send a webhook URL when the API is publicly reachable. */
export const getWebhookUrl = () => {
  const url = new URL('/api/v1/webhooks/fal', env.API_BASE_URL);
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname) ? undefined : url.toString();
};

const sanitizeError = (err) => {
  const msg = err?.body?.detail ?? err?.message ?? 'Generation failed';
  const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
  return text.slice(0, 500);
};

/**
 * Validates the request against the model catalog and returns normalized params.
 * @throws {ApiError} 400 on any mismatch
 */
export const resolveModelAndParams = ({ type, modelKey, imageUrl, params = {} }) => {
  const model = getModel(modelKey);
  if (!model || !isEnabled(model)) throw ApiError.badRequest(`Unknown or disabled model "${modelKey}".`);
  if (model.type !== type) throw ApiError.badRequest(`Model "${modelKey}" does not support type "${type}".`);
  if (type === 'image-to-video' && !imageUrl) throw ApiError.badRequest('imageUrl is required for image-to-video.');

  const duration = isVideoType(type) ? (params.duration ?? model.durations[0]) : undefined;
  if (isVideoType(type) && !model.durations.includes(duration)) {
    throw ApiError.badRequest(
      `Duration ${duration}s not supported by ${modelKey}. Allowed: ${model.durations.join(', ')}.`,
    );
  }
  const aspectRatio = params.aspectRatio ?? model.aspectRatios[0];
  if (!model.aspectRatios.includes(aspectRatio)) {
    throw ApiError.badRequest(
      `Aspect ratio ${aspectRatio} not supported by ${modelKey}. Allowed: ${model.aspectRatios.join(', ')}.`,
    );
  }
  let resolution;
  if (model.resolutions?.length) {
    resolution = params.resolution ?? model.resolutions[0];
    if (!model.resolutions.includes(resolution)) {
      throw ApiError.badRequest(
        `Resolution ${resolution} not supported by ${modelKey}. Allowed: ${model.resolutions.join(', ')}.`,
      );
    }
  }
  return { model, params: { duration, aspectRatio, resolution } };
};

/**
 * Full creation flow: validate → debit → enhance → create → submit to fal (refund on failure).
 * @param {object} user  authenticated user document
 * @param {object} body  validated request body
 * @returns {Promise<object>} generation document
 */
export const createGeneration = async (user, body) => {
  const { model, params } = resolveModelAndParams(body);
  const cost = calculateCost(model, params);

  const updatedUser = await debitForGeneration(user._id, cost);

  const enhancedPrompt = enhancePrompt({
    prompt: body.prompt,
    cameraPreset: body.cameraPreset,
    stylePreset: body.stylePreset,
    type: body.type,
    maxLength: model.maxPromptLength,
  });

  let generation;
  try {
    generation = await Generation.create({
      user: user._id,
      type: body.type,
      modelKey: model.key,
      userPrompt: body.prompt,
      enhancedPrompt,
      cameraPreset: body.cameraPreset,
      stylePreset: body.stylePreset,
      inputImageUrl: body.imageUrl ?? undefined,
      params,
      status: 'queued',
      creditsCharged: cost,
    });
  } catch (err) {
    // Could not even create the record: give the credits straight back.
    await updatedUser.updateOne({ $inc: { credits: cost, dailyGenerationCount: -1 } });
    throw err;
  }
  await logGenerationDebit({ userId: user._id, cost, generationId: generation._id, balanceAfter: updatedUser.credits });

  try {
    const input = model.buildInput({ prompt: enhancedPrompt, ...params, imageUrl: body.imageUrl });
    const { request_id: requestId } = await fal.queue.submit(model.falModelId, { input, webhookUrl: getWebhookUrl() });
    generation.falRequestId = requestId;
    generation.status = 'processing';
    await generation.save();
    logger.info({ generationId: generation.id, requestId, model: model.key }, 'Generation submitted to fal');
  } catch (err) {
    logger.error({ err, generationId: generation.id }, 'fal submission failed');
    generation.status = 'failed';
    generation.errorMessage = 'Could not submit the job to the AI provider. Your credits have been refunded.';
    generation.completedAt = new Date();
    await generation.save();
    await refundGeneration(generation._id);
  }
  return Generation.findById(generation._id).lean();
};

/**
 * Applies a finished fal result to a generation. Idempotent: terminal generations are left
 * untouched, and a short-lived lock stops the webhook and poller from finalizing twice.
 *
 * @param {string} requestId  fal request id
 * @param {{ ok: boolean, data?: object, error?: string }} outcome
 * @returns {Promise<'ignored'|'completed'|'failed'|'locked'>}
 */
export const applyFalResult = async (requestId, outcome) => {
  const existing = await Generation.findOne({ falRequestId: requestId }).lean();
  if (!existing || TERMINAL_STATUSES.includes(existing.status)) return 'ignored';

  const now = new Date();
  const gen = await Generation.findOneAndUpdate(
    {
      _id: existing._id,
      status: { $nin: TERMINAL_STATUSES },
      $or: [{ lockedAt: null }, { lockedAt: { $exists: false } }, { lockedAt: { $lt: new Date(now - LOCK_TTL_MS) } }],
    },
    { $set: { lockedAt: now } },
    { returnDocument: 'after' },
  );
  if (!gen) return 'locked';

  const model = getModel(gen.modelKey);
  const falUrl = outcome.ok ? model?.extractOutputUrl(outcome.data) : undefined;

  if (!outcome.ok || !falUrl) {
    await Generation.updateOne(
      { _id: gen._id },
      {
        $set: {
          status: 'failed',
          errorMessage: outcome.error
            ? sanitizeError({ message: outcome.error })
            : 'The AI provider returned no output.',
          completedAt: new Date(),
        },
        $unset: { lockedAt: 1 },
      },
    );
    await refundGeneration(gen._id);
    logger.warn({ generationId: gen.id, requestId }, 'Generation failed');
    return 'failed';
  }

  const resourceType = isVideoType(gen.type) ? 'video' : 'image';
  let stored;
  try {
    stored = await uploadFromUrl(falUrl, resourceType);
  } catch (err) {
    const timedOut = now - gen.createdAt > env.JOB_TIMEOUT_MINUTES * 60 * 1000;
    if (!timedOut) {
      await Generation.updateOne({ _id: gen._id }, { $unset: { lockedAt: 1 } });
      logger.error({ err, generationId: gen.id }, 'Cloudinary upload failed; will retry');
      throw err;
    }
    // Out of retries: keep the provider URL rather than lose a paid result.
    logger.error({ err, generationId: gen.id }, 'Cloudinary upload failed; storing provider URL');
    stored = { url: falUrl };
  }

  await Generation.updateOne(
    { _id: gen._id },
    {
      $set: {
        status: 'completed',
        outputUrl: stored.url,
        outputPublicId: stored.publicId,
        thumbnailUrl: stored.thumbnailUrl ?? (resourceType === 'image' ? stored.url : undefined),
        completedAt: new Date(),
      },
      $unset: { lockedAt: 1 },
    },
  );
  logger.info({ generationId: gen.id, requestId }, 'Generation completed');
  return 'completed';
};

/**
 * Asks fal directly about one in-flight generation (used by the poller and on-read refresh).
 * Marks it failed + refunds when it exceeds JOB_TIMEOUT_MINUTES.
 * @param {object} gen lean generation
 */
export const checkGenerationWithFal = async (gen) => {
  const model = getModel(gen.modelKey);
  const timeoutMs = env.JOB_TIMEOUT_MINUTES * 60 * 1000;
  const timedOut = Date.now() - new Date(gen.createdAt).getTime() > timeoutMs;
  await Generation.updateOne({ _id: gen._id }, { $set: { lastCheckedAt: new Date() } });

  if (!model || !gen.falRequestId) {
    if (timedOut) return failTimedOut(gen);
    return 'pending';
  }

  try {
    const status = await fal.queue.status(model.falModelId, { requestId: gen.falRequestId });
    if (status.status === 'COMPLETED') {
      try {
        const result = await fal.queue.result(model.falModelId, { requestId: gen.falRequestId });
        return applyFalResult(gen.falRequestId, { ok: true, data: result.data });
      } catch (err) {
        return applyFalResult(gen.falRequestId, { ok: false, error: sanitizeError(err) });
      }
    }
  } catch (err) {
    logger.warn({ err: err.message, generationId: String(gen._id) }, 'fal status check failed');
  }
  if (timedOut) return failTimedOut(gen);
  return 'pending';
};

const failTimedOut = async (gen) => {
  const res = await Generation.updateOne(
    { _id: gen._id, status: { $nin: TERMINAL_STATUSES } },
    {
      $set: {
        status: 'failed',
        errorMessage: `Timed out after ${env.JOB_TIMEOUT_MINUTES} minutes. Your credits have been refunded.`,
        completedAt: new Date(),
      },
    },
  );
  if (res.modifiedCount) await refundGeneration(gen._id);
  return 'failed';
};

/**
 * Checks every generation stuck in processing/queued for over a minute.
 * @returns {Promise<{ checked: number }>}
 */
export const pollPendingGenerations = async ({ limit = 25 } = {}) => {
  const cutoff = new Date(Date.now() - STALE_CHECK_MS);
  const pending = await Generation.find({
    status: { $in: ['processing', 'queued'] },
    createdAt: { $lt: cutoff },
    $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lt: cutoff } }],
  })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean();

  for (const gen of pending) {
    try {
      await checkGenerationWithFal(gen);
    } catch (err) {
      logger.error({ err, generationId: String(gen._id) }, 'Poll check failed');
    }
  }
  return { checked: pending.length };
};

/**
 * Returns a user's generation. When it has been processing for a while, it checks fal first —
 * this keeps serverless deployments (no background poller) moving as the client polls.
 */
export const getOwnGeneration = async (userId, id) => {
  let gen = await Generation.findOne({ _id: id, user: userId }).lean();
  if (!gen) throw ApiError.notFound('Generation not found');

  const stale = Date.now() - new Date(gen.lastCheckedAt ?? gen.createdAt).getTime() > STALE_CHECK_MS;
  if (!TERMINAL_STATUSES.includes(gen.status) && stale) {
    try {
      await checkGenerationWithFal(gen);
      gen = await Generation.findById(id).lean();
    } catch (err) {
      logger.warn({ err: err.message, generationId: id }, 'On-read refresh failed');
    }
  }
  return gen;
};

/** Deletes a finished generation and its stored asset. */
export const deleteOwnGeneration = async (userId, id) => {
  const gen = await Generation.findOne({ _id: id, user: userId });
  if (!gen) throw ApiError.notFound('Generation not found');
  if (!TERMINAL_STATUSES.includes(gen.status)) {
    throw new ApiError(409, 'GENERATION_IN_PROGRESS', 'Only completed or failed generations can be deleted.');
  }
  if (gen.outputPublicId) {
    try {
      await deleteAsset(gen.outputPublicId, isVideoType(gen.type) ? 'video' : 'image');
    } catch (err) {
      logger.warn({ err: err.message, generationId: id }, 'Cloudinary delete failed');
    }
  }
  await gen.deleteOne();
};
