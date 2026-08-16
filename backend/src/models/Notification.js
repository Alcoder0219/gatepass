import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE } from '../constants/index.js';

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    type: { type: String, enum: NOTIFICATION_TYPES, default: NOTIFICATION_TYPE.SYSTEM, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },

    /** Deep-link target, e.g. `/gate-pass/64f…`. */
    link: { type: String, default: '' },
    gatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', default: null, index: true },

    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },

    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      push: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: false },
    },

    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    /**
     * Email delivery state for this notification.
     *
     * ADDITIVE and optional — every existing document simply reads as
     * NOT_REQUIRED, and nothing that already queries this collection changes.
     * It exists so a failed send can be retried by the background job without
     * re-running the workflow, and so support can answer "did they get the
     * email?" without reading the mail server.
     */
    emailDelivery: {
      status: {
        type: String,
        enum: ['NOT_REQUIRED', 'PENDING', 'SENT', 'FAILED'],
        default: 'NOT_REQUIRED',
        index: true,
      },
      /** Resolved from the User record — never from a request body. */
      recipientEmail: { type: String, default: '' },
      template: { type: String, default: '' },
      /** Template data, kept so a retry can re-render without the workflow. */
      payload: { type: mongoose.Schema.Types.Mixed, default: null },
      transport: { type: String, default: '' },
      messageId: { type: String, default: '' },
      attempts: { type: Number, default: 0 },
      lastAttemptAt: { type: Date, default: null },
      sentAt: { type: Date, default: null },
      error: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

/** Retry sweep: find failures still worth another attempt, oldest first. */
notificationSchema.index({ 'emailDelivery.status': 1, 'emailDelivery.attempts': 1, createdAt: 1 });

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
/** Housekeeping: notifications self-destruct after 90 days. */
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

notificationSchema.plugin(paginate);

export default mongoose.model('Notification', notificationSchema);
