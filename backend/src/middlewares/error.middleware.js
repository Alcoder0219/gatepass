import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import env from '../config/env.js';

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

/** Translates mongoose / jwt / multer failures into a uniform ApiError shape. */
const normalise = (error) => {
  if (error instanceof ApiError) return error;

  if (error.name === 'CastError') {
    return ApiError.badRequest(`Invalid ${error.path}: ${error.value}`);
  }

  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return ApiError.unprocessable('Validation failed', details);
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] ?? 'field';
    const value = error.keyValue?.[field];
    return ApiError.conflict(`A record with this ${field}${value ? ` (${value})` : ''} already exists`, [
      { field, message: 'Must be unique' },
    ]);
  }

  if (error.name === 'JsonWebTokenError') return ApiError.unauthorized('Invalid token');
  if (error.name === 'TokenExpiredError') return ApiError.unauthorized('Token expired');

  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `File is too large (max ${env.upload.maxFileSizeMb}MB)`
        : error.message;
    return ApiError.badRequest(message);
  }

  return null;
};

// eslint-disable-next-line no-unused-vars -- express identifies error handlers by arity
export const errorHandler = (err, req, res, _next) => {
  const apiError = normalise(err);

  if (apiError) {
    if (apiError.statusCode >= 500) logger.error(`${req.method} ${req.originalUrl} → ${apiError.message}`, { stack: err.stack });
    else logger.warn(`${req.method} ${req.originalUrl} → ${apiError.statusCode} ${apiError.message}`);

    return res.status(apiError.statusCode).json({
      success: false,
      message: apiError.message,
      code: apiError.code ?? undefined,
      errors: apiError.details ?? undefined,
    });
  }

  // Unexpected — log with the full stack, hide internals from the client.
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`, {
    stack: err.stack,
  });

  return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: env.isProd ? 'Something went wrong. Please try again.' : err.message,
    stack: env.isProd ? undefined : err.stack,
  });
};

export default errorHandler;
