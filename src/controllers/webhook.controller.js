import { env } from '../config/env.js';
import { verifyFalWebhook } from '../services/webhook.service.js';
import { applyFalResult } from '../services/generation.service.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

/**
 * fal.ai webhook: { request_id, status: 'OK' | 'ERROR', payload, error, payload_error }.
 * Idempotent — repeated deliveries for a finished generation are acknowledged and ignored.
 */
export const falWebhook = async (req, res) => {
  if (env.FAL_WEBHOOK_VERIFY) {
    const valid = await verifyFalWebhook(req.headers, req.rawBody);
    if (!valid) throw new ApiError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
  }

  const { request_id: requestId, status, payload, error, payload_error: payloadError } = req.body ?? {};
  if (!requestId) throw ApiError.badRequest('request_id missing');

  const ok = status === 'OK' && !payloadError;
  const errorText = error ?? payloadError ?? payload?.detail;
  const outcome = await applyFalResult(requestId, {
    ok,
    data: payload,
    error: typeof errorText === 'string' ? errorText : errorText ? JSON.stringify(errorText) : undefined,
  });
  logger.info({ requestId, status, outcome }, 'fal webhook processed');
  res.status(200).json({ success: true, data: { outcome } });
};
