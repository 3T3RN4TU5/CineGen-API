import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

const handler = (_req, res, _next, options) =>
  res.status(options.statusCode).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' },
  });

const common = { standardHeaders: 'draft-7', legacyHeaders: false, handler, skip: () => env.isTest };

export const globalLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 300 });
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 10 });
export const generationLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
});
