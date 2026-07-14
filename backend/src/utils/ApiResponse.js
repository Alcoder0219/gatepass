import { StatusCodes } from 'http-status-codes';

/**
 * Uniform success envelope. Every controller answers with this shape so the
 * frontend's axios interceptor can unwrap `data` without special-casing.
 *
 *   { success: true, message: string, data: any, meta?: object }
 */
export const sendSuccess = (
  res,
  { data = null, message = 'Success', statusCode = StatusCodes.OK, meta = undefined } = {}
) => {
  const body = { success: true, message, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(statusCode).json(body);
};

export const sendCreated = (res, { data, message = 'Created successfully' }) =>
  sendSuccess(res, { data, message, statusCode: StatusCodes.CREATED });

/** Normalises a mongoose-paginate-v2 result into `{ data, meta }`. */
export const sendPaginated = (res, result, message = 'Fetched successfully') =>
  sendSuccess(res, {
    message,
    data: result.docs,
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.totalDocs,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    },
  });

export default sendSuccess;
