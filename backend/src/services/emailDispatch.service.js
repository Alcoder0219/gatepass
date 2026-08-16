import Notification from '../models/Notification.js';
import logger from '../utils/logger.js';
import { sendTemplate as sendViaSmtp } from './email.service.js';
import {
  sendTemplateEmail as sendViaGmail,
  isEmailEnabled as isGmailEnabled,
} from './gmail.service.js';

/**
 * The single place that decides HOW a notification email leaves the system and
 * records what happened.
 *
 *     notify()  →  emailDispatch  →  Gmail API   (when configured)
 *                                 →  SMTP/console (fallback, unchanged)
 *
 * Why a separate file: `notification.service.js` keeps its existing shape and
 * gains one call, and the retry job reuses exactly the same send path — so
 * there is no second Gmail client, no duplicated template rendering, and no
 * chance of the retry behaving differently from the original attempt.
 *
 * NOTHING here ever throws. A notification email is a side effect of a gate
 * pass or leave transaction that has already been committed; failing to send it
 * must never surface as a failed approval.
 */

/** Give up after this many attempts so a permanently bad address stops churning. */
export const MAX_EMAIL_ATTEMPTS = 4;

/** Which transport is live right now. Gmail wins when fully configured. */
export const activeTransport = () => (isGmailEnabled() ? 'gmail' : 'smtp');

/**
 * Renders and sends one templated email, then writes the outcome onto the
 * Notification document.
 *
 * @param {object}  options
 * @param {object|null} options.notification  the Notification doc to stamp
 * @param {string}  options.to                recipient, resolved from the DB
 * @param {string}  options.template          key in helpers/emailTemplates.js
 * @param {object}  options.data              template data
 * @returns {Promise<{ok: boolean, transport: string, messageId?: string, error?: string}>}
 */
export const dispatchTemplateEmail = async ({ notification = null, to, template, data = {} }) => {
  if (!to || !template) {
    return { ok: false, transport: 'none', error: 'Missing recipient or template' };
  }

  const transport = activeTransport();
  const attemptNo = (notification?.emailDelivery?.attempts ?? 0) + 1;

  let outcome;
  try {
    if (transport === 'gmail') {
      const result = await sendViaGmail(template, { to, ...data });
      outcome = result?.ok
        ? { ok: true, messageId: result.messageId }
        : { ok: false, error: result?.error || result?.reason || 'Gmail send failed' };
    } else {
      // Existing nodemailer path, completely unchanged. In dev with no SMTP
      // host this is the console transport, exactly as before.
      const result = await sendViaSmtp(template, { to, ...data });
      outcome = result
        ? { ok: true, messageId: result.messageId ?? '' }
        : { ok: false, error: 'SMTP send returned no result' };
    }
  } catch (error) {
    // sendEmail/sendTemplate already swallow their own errors; this is the
    // last line of defence so a caller can never be broken by email.
    outcome = { ok: false, error: error?.message ?? String(error) };
  }

  await recordDelivery({ notification, to, template, data, transport, attemptNo, outcome });

  if (outcome.ok) {
    logger.info(`[email] ${template} → ${to} via ${transport} (attempt ${attemptNo})`);
  } else {
    logger.error(
      `[email] ${template} → ${to} FAILED via ${transport} (attempt ${attemptNo}): ${outcome.error}`
    );
  }

  return { ...outcome, transport };
};

/** Stamps the delivery outcome onto the notification. Never throws. */
const recordDelivery = async ({ notification, to, template, data, transport, attemptNo, outcome }) => {
  if (!notification?._id) return;

  try {
    await Notification.updateOne(
      { _id: notification._id },
      {
        $set: {
          'emailDelivery.status': outcome.ok ? 'SENT' : 'FAILED',
          'emailDelivery.recipientEmail': to,
          'emailDelivery.template': template,
          'emailDelivery.payload': data,
          'emailDelivery.transport': transport,
          'emailDelivery.messageId': outcome.messageId ?? '',
          'emailDelivery.attempts': attemptNo,
          'emailDelivery.lastAttemptAt': new Date(),
          'emailDelivery.sentAt': outcome.ok ? new Date() : null,
          'emailDelivery.error': outcome.ok ? '' : String(outcome.error).slice(0, 500),
        },
      }
    );
  } catch (error) {
    logger.error(`[email] could not record delivery state: ${error.message}`);
  }
};

/**
 * Retries emails that previously failed.
 *
 * DUPLICATE SAFETY: the filter only matches documents still marked FAILED. A
 * successful send flips the row to SENT in the same operation, so a message
 * that already went out can never be picked up again — even if the sweep
 * overlaps with a slow send, the second write simply re-asserts SENT.
 *
 * Called by the existing background job. Never throws.
 */
export const retryFailedEmails = async ({ limit = 25 } = {}) => {
  try {
    const stuck = await Notification.find({
      'emailDelivery.status': 'FAILED',
      'emailDelivery.attempts': { $lt: MAX_EMAIL_ATTEMPTS },
      'emailDelivery.template': { $ne: '' },
    })
      .sort({ createdAt: 1 })
      .limit(limit);

    if (!stuck.length) return { retried: 0, recovered: 0 };

    let recovered = 0;
    for (const notification of stuck) {
      const { recipientEmail, template, payload } = notification.emailDelivery;
      if (!recipientEmail) continue;

      const result = await dispatchTemplateEmail({
        notification,
        to: recipientEmail,
        template,
        data: payload ?? {},
      });
      if (result.ok) recovered += 1;
    }

    logger.info(`[email] retry sweep: ${stuck.length} attempted, ${recovered} recovered`);
    return { retried: stuck.length, recovered };
  } catch (error) {
    logger.error(`[email] retry sweep failed: ${error.message}`);
    return { retried: 0, recovered: 0, error: error.message };
  }
};

/** Delivery counters for diagnostics / an admin screen later. */
export const emailDeliveryStats = async () => {
  const rows = await Notification.aggregate([
    { $match: { 'emailDelivery.status': { $in: ['PENDING', 'SENT', 'FAILED'] } } },
    { $group: { _id: '$emailDelivery.status', count: { $sum: 1 } } },
  ]);
  const stats = { PENDING: 0, SENT: 0, FAILED: 0 };
  for (const row of rows) stats[row._id] = row.count;
  return { ...stats, transport: activeTransport() };
};

export default {
  dispatchTemplateEmail,
  retryFailedEmails,
  emailDeliveryStats,
  activeTransport,
  MAX_EMAIL_ATTEMPTS,
};
