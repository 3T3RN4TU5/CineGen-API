import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/response.js';
import { pollPendingGenerations } from '../services/generation.service.js';

const safeEqual = (a, b) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** Cron-triggered poll (for serverless hosts). Protected by `Authorization: Bearer <CRON_SECRET>`. */
export const pollJobs = async (req, res) => {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!env.CRON_SECRET || !token || !safeEqual(token, env.CRON_SECRET)) throw ApiError.unauthorized();
  sendSuccess(res, await pollPendingGenerations());
};
