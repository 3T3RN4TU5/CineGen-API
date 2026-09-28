import { User } from '../models/User.js';
import { Generation } from '../models/Generation.js';
import { CreditTransaction } from '../models/CreditTransaction.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Atomically reserves a daily slot and debits credits in a single conditional update, so
 * concurrent requests can never overspend or push the balance negative.
 *
 * @param {string} userId
 * @param {number} cost
 * @returns {Promise<import('mongoose').Document>} updated user
 * @throws {ApiError} 402 INSUFFICIENT_CREDITS | 429 DAILY_LIMIT_REACHED | 403 ACCOUNT_DISABLED
 */
export const debitForGeneration = async (userId, cost) => {
  const today = startOfUtcDay();
  // Reset yesterday's counter (no-op if already reset today).
  await User.updateOne(
    { _id: userId, dailyCountResetAt: { $lt: today } },
    { $set: { dailyGenerationCount: 0, dailyCountResetAt: new Date() } },
  );

  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      isActive: true,
      credits: { $gte: cost },
      dailyGenerationCount: { $lt: env.DAILY_GENERATION_LIMIT },
    },
    { $inc: { credits: -cost, dailyGenerationCount: 1 } },
    { returnDocument: 'after' },
  );

  if (!user) {
    const current = await User.findById(userId).lean();
    if (!current || !current.isActive) throw new ApiError(403, 'ACCOUNT_DISABLED', 'Your account is disabled.');
    if (current.dailyGenerationCount >= env.DAILY_GENERATION_LIMIT) {
      throw new ApiError(
        429,
        'DAILY_LIMIT_REACHED',
        `Daily generation limit of ${env.DAILY_GENERATION_LIMIT} reached. Try again tomorrow (UTC).`,
      );
    }
    throw new ApiError(402, 'INSUFFICIENT_CREDITS', `You need ${cost} credits but have ${current.credits}.`);
  }
  return user;
};

/**
 * Records the debit transaction once the generation document exists.
 * @param {{ userId: string, cost: number, generationId: string, balanceAfter: number }} args
 */
export const logGenerationDebit = ({ userId, cost, generationId, balanceAfter }) =>
  CreditTransaction.create({
    user: userId,
    amount: -cost,
    reason: 'generation',
    generation: generationId,
    balanceAfter,
  });

/**
 * Refunds a generation's credits exactly once. Safe to call from webhook, poller and
 * submit-failure paths concurrently: the `refunded` flag is flipped atomically first.
 *
 * @param {string} generationId
 * @returns {Promise<boolean>} true if a refund was issued by this call
 */
export const refundGeneration = async (generationId) => {
  const gen = await Generation.findOneAndUpdate(
    { _id: generationId, refunded: false, creditsCharged: { $gt: 0 } },
    { $set: { refunded: true } },
    { returnDocument: 'after' },
  );
  if (!gen) return false;

  const user = await User.findByIdAndUpdate(
    gen.user,
    { $inc: { credits: gen.creditsCharged, dailyGenerationCount: -1 } },
    { returnDocument: 'after' },
  );
  if (user && user.dailyGenerationCount < 0) await User.updateOne({ _id: user._id }, { dailyGenerationCount: 0 });

  await CreditTransaction.create({
    user: gen.user,
    amount: gen.creditsCharged,
    reason: 'refund',
    generation: gen._id,
    balanceAfter: user?.credits ?? 0,
  });
  logger.info({ generationId, amount: gen.creditsCharged }, 'Credits refunded');
  return true;
};

/**
 * Admin grant (positive) or revoke (negative). Revokes never take the balance below zero.
 * @param {{ userId: string, amount: number, note?: string }} args
 */
export const adjustCredits = async ({ userId, amount, note }) => {
  const filter = amount < 0 ? { _id: userId, credits: { $gte: -amount } } : { _id: userId };
  const user = await User.findOneAndUpdate(filter, { $inc: { credits: amount } }, { returnDocument: 'after' });
  if (!user) {
    const exists = await User.exists({ _id: userId });
    if (!exists) throw ApiError.notFound('User not found');
    throw new ApiError(400, 'INVALID_AMOUNT', 'Revoke amount exceeds the user balance.');
  }
  await CreditTransaction.create({
    user: userId,
    amount,
    reason: amount >= 0 ? 'admin_grant' : 'admin_revoke',
    note,
    balanceAfter: user.credits,
  });
  return user;
};

/** Logs the signup bonus for a newly created user. */
export const logSignupBonus = (user) =>
  user.credits > 0
    ? CreditTransaction.create({
        user: user._id,
        amount: user.credits,
        reason: 'signup_bonus',
        balanceAfter: user.credits,
      })
    : null;
