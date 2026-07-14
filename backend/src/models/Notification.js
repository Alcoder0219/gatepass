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
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
/** Housekeeping: notifications self-destruct after 90 days. */
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

notificationSchema.plugin(paginate);

export default mongoose.model('Notification', notificationSchema);
