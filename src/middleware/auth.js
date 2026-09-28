import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

/** Requires a valid Bearer token and an active user; attaches `req.user`. */
export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

  const payload = jwt.verify(token, env.JWT_SECRET);
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (!user.isActive) throw new ApiError(403, 'ACCOUNT_DISABLED', 'Your account is disabled.');
  req.user = user;
  next();
});

/** Restricts a route to the given roles. Use after `protect`. */
export const requireRole =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user?.role) ? next() : next(ApiError.forbidden());
