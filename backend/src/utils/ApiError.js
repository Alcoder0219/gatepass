import { StatusCodes } from 'http-status-codes';

/**
 * Operational error thrown from anywhere in the request lifecycle. The global
 * error handler serialises it; anything that is not an ApiError is treated as
 * an unexpected 500 and logged with its stack.
 */
export default class ApiError extends Error {
  constructor(statusCode, message, { details = null, code = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(StatusCodes.BAD_REQUEST, message, { details });
  }

  static unauthorized(message = 'Authentication required', details) {
    return new ApiError(StatusCodes.UNAUTHORIZED, message, { details });
  }

  static forbidden(message = 'You do not have permission to perform this action', details) {
    return new ApiError(StatusCodes.FORBIDDEN, message, { details });
  }

  static notFound(message = 'Resource not found', details) {
    return new ApiError(StatusCodes.NOT_FOUND, message, { details });
  }

  static conflict(message = 'Resource already exists', details) {
    return new ApiError(StatusCodes.CONFLICT, message, { details });
  }

  static unprocessable(message = 'Validation failed', details) {
    return new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, message, { details });
  }

  static tooMany(message = 'Too many requests', details) {
    return new ApiError(StatusCodes.TOO_MANY_REQUESTS, message, { details });
  }

  static internal(message = 'Something went wrong', details) {
    return new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, message, { details });
  }
}
