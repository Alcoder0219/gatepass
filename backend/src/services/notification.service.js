import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import logger from '../utils/logger.js';
import { getSettings } from './settings.service.js';
import { emitToUser, emitToRole } from './socket.service.js';
import { dispatchTemplateEmail } from './emailDispatch.service.js';
import { SOCKET_EVENT, NOTIFICATION_TYPE } from '../constants/index.js';

/**
 * Creates a notification, pushes it over the socket in real time and — when the
 * channel is enabled in settings and by the recipient — mirrors it to email.
 *
 * Never throws: a failed notification must not roll back the workflow action
 * that triggered it.
 */
export const notify = async ({
  recipient,
  actor = null,
  type = NOTIFICATION_TYPE.SYSTEM,
  title,
  message,
  link = '',
  gatePass = null,
  email = false,
  emailTemplate = null,
  emailData = {},
  meta = {},
}) => {
  try {
    const recipientId = recipient?._id ?? recipient;
    if (!recipientId) return null;

    const settings = await getSettings();
    const user = recipient?.email
      ? recipient
      : await User.findById(recipientId).select('email name preferences').lean();
    if (!user) return null;

    const wantsEmail =
      email && settings.notifications.email && (user.preferences?.emailNotifications ?? true);

    const doc = await Notification.create({
      recipient: recipientId,
      actor: actor?._id ?? actor ?? null,
      type,
      title,
      message,
      link,
      gatePass: gatePass?._id ?? gatePass ?? null,
      channels: {
        inApp: settings.notifications.inApp,
        email: wantsEmail,
        push: settings.notifications.push,
        sms: settings.notifications.sms,
        whatsapp: settings.notifications.whatsapp,
      },
      meta,
    });

    emitToUser(recipientId, SOCKET_EVENT.NOTIFICATION, {
      _id: doc._id,
      type,
      title,
      message,
      link,
      gatePass: doc.gatePass,
      isRead: false,
      createdAt: doc.createdAt,
    });

    if (wantsEmail && emailTemplate && user.email) {
      // Mark it queued before dispatching, so a process that dies mid-send
      // leaves a PENDING row rather than a silently lost email.
      doc.emailDelivery = {
        status: 'PENDING',
        recipientEmail: user.email,
        template: emailTemplate,
        attempts: 0,
      };
      await doc.save();

      /*
       * Deliberately NOT awaited — mail latency must not block the API
       * response, exactly as before. What changed is only the destination:
       * `dispatchTemplateEmail` picks Gmail when it is configured and falls
       * back to the original SMTP/console transport otherwise, and records the
       * outcome so the retry job can pick up failures.
       *
       * The recipient comes from the User record loaded above — never from a
       * request body.
       */
      dispatchTemplateEmail({
        notification: doc,
        to: user.email,
        template: emailTemplate,
        data: { name: user.name, ...emailData },
      }).catch((error) => logger.error(`Email dispatch failed: ${error.message}`));
    }

    return doc;
  } catch (error) {
    logger.error(`notify() failed: ${error.message}`);
    return null;
  }
};

/** Fan-out to every active holder of a role (e.g. the whole HR or security team). */
export const notifyRole = async (roleKey, payload) => {
  try {
    const role = await Role.findOne({ key: roleKey }).select('_id').lean();
    if (!role) return [];

    const filter = { role: role._id, status: 'ACTIVE' };
    // Optionally keep the fan-out inside one site.
    if (payload.unit) filter.unit = payload.unit;

    const users = await User.find(filter).select('_id email name preferences').lean();
    const results = await Promise.all(users.map((user) => notify({ ...payload, recipient: user })));

    emitToRole(roleKey, SOCKET_EVENT.DASHBOARD_REFRESH, { reason: payload.type });
    return results;
  } catch (error) {
    logger.error(`notifyRole(${roleKey}) failed: ${error.message}`);
    return [];
  }
};

export const markAsRead = async (notificationId, userId) =>
  Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

export const markAllAsRead = async (userId) =>
  Notification.updateMany(
    { recipient: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );

export const unreadCount = (userId) =>
  Notification.countDocuments({ recipient: userId, isRead: false });

export default { notify, notifyRole, markAsRead, markAllAsRead, unreadCount };
