import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export const notFound = (req, _res, next) =>
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));

const normalize = (err) => {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) {
    return ApiError.badRequest(err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return ApiError.badRequest(
      Object.values(err.errors)
        .map((e) => e.message)
        .join('; '),
    );
  }
  if (err instanceof mongoose.Error.CastError) return ApiError.notFound('Resource not found');
  if (err?.code === 11000)
    return ApiError.conflict(`Duplicate value for ${Object.keys(err.keyValue ?? {}).join(', ') || 'field'}`);
  if (err instanceof jwt.TokenExpiredError)
    return new ApiError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please log in again.');
  if (err instanceof jwt.JsonWebTokenError) return new ApiError(401, 'INVALID_TOKEN', 'Invalid authentication token.');
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? new ApiError(413, 'FILE_TOO_LARGE', 'File is too large (max 10 MB).')
      : ApiError.badRequest(err.message);
  }
  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body');
  if (err?.type === 'entity.too.large') return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  return null;
};

export const errorHandler = (err, req, res, _next) => {
  const apiErr = normalize(err);
  if (!apiErr) {
    logger.error({ err, path: req.originalUrl }, 'Unhandled error');
    return res
      .status(500)
      .json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
  }
  if (apiErr.statusCode >= 500) logger.error({ err }, apiErr.message);
  res.status(apiErr.statusCode).json({
    success: false,
    error: { code: apiErr.code, message: apiErr.message, ...(apiErr.details ? { details: apiErr.details } : {}) },
  });
};
