import Notification from '../models/Notification.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/ApiResponse.js';
import { markAsRead, markAllAsRead, unreadCount } from '../services/notification.service.js';
import { NOTIFICATION_TYPES } from '../constants/index.js';

/**
 * Notifications are strictly personal — `recipient` is pinned to req.user on
 * every query here, so there is nothing for RBAC to gate beyond authentication.
 */
const ownerFilter = (req) => ({ recipient: req.user._id });

/** GET /notifications?isRead=&type=&page=&limit= */
export const listNotifications = asyncHandler(async (req, res) => {
  const filter = ownerFilter(req);

  if (req.query.isRead !== undefined && req.query.isRead !== '') {
    filter.isRead = req.query.isRead === 'true' || req.query.isRead === true;
  }

  if (req.query.type) {
    const types = String(req.query.type)
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter((t) => NOTIFICATION_TYPES.includes(t));
    if (!types.length) throw ApiError.badRequest('Unknown notification type');
    filter.type = { $in: types };
  }

  const page = Math.max(Number.parseInt(req.query.page ?? '1', 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '20', 10) || 20, 1), 100);

  const result = await Notification.paginate(filter, {
    page,
    limit,
    sort: { createdAt: -1 },
    populate: [{ path: 'actor', select: 'name employeeId profileImage' }],
    lean: true,
  });

  return sendPaginated(res, result, 'Notifications fetched');
});

/** GET /notifications/unread-count */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await unreadCount(req.user._id);
  return sendSuccess(res, { message: 'Unread count fetched', data: { count } });
});

/** PATCH /notifications/:id/read */
export const readOne = asyncHandler(async (req, res) => {
  const notification = await markAsRead(req.params.id, req.user._id);
  if (!notification) throw ApiError.notFound('Notification not found');

  return sendSuccess(res, { message: 'Notification marked as read', data: notification });
});

/** PATCH /notifications/read-all */
export const readAll = asyncHandler(async (req, res) => {
  const result = await markAllAsRead(req.user._id);
  return sendSuccess(res, {
    message: 'All notifications marked as read',
    data: { updated: result?.modifiedCount ?? 0 },
  });
});

/** DELETE /notifications/:id */
export const removeOne = asyncHandler(async (req, res) => {
  const deleted = await Notification.findOneAndDelete({
    _id: req.params.id,
    recipient: req.user._id,
  });
  if (!deleted) throw ApiError.notFound('Notification not found');

  return sendSuccess(res, { message: 'Notification deleted', data: { id: req.params.id } });
});

/** DELETE /notifications — clears everything the user has already read. */
export const clearRead = asyncHandler(async (req, res) => {
  const result = await Notification.deleteMany({ recipient: req.user._id, isRead: true });
  return sendSuccess(res, {
    message: 'Read notifications cleared',
    data: { deleted: result?.deletedCount ?? 0 },
  });
});

export default { listNotifications, getUnreadCount, readOne, readAll, removeOne, clearRead };
