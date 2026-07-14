import mongoose from 'mongoose';

/** Quota block reused for official/personal and for every override level. */
const limitSchema = new mongoose.Schema(
  {
    daily: { type: Number, default: 2, min: 0 },
    weekly: { type: Number, default: 6, min: 0 },
    monthly: { type: Number, default: 15, min: 0 },
    yearly: { type: Number, default: 120, min: 0 },
  },
  { _id: false }
);

/**
 * Override rows. Resolution order (most specific wins):
 *   role → department → unit → global
 * A `null` field inside an override means "inherit from the next level up".
 */
const overrideSchema = new mongoose.Schema(
  {
    official: { type: limitSchema, default: () => ({}) },
    personal: { type: limitSchema, default: () => ({}) },
  },
  { _id: false }
);

const unitOverrideSchema = new mongoose.Schema(
  { unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true }, limits: overrideSchema },
  { _id: false }
);
const deptOverrideSchema = new mongoose.Schema(
  {
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    limits: overrideSchema,
  },
  { _id: false }
);
const roleOverrideSchema = new mongoose.Schema(
  { role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true }, limits: overrideSchema },
  { _id: false }
);

/**
 * Singleton document (`key: 'GLOBAL'`). Read through `settingsService.get()`,
 * which caches it in memory and busts the cache on update.
 */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'GLOBAL', unique: true, immutable: true },

    company: {
      name: { type: String, default: 'GatePass Pro' },
      logo: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      address: { type: String, default: '' },
    },

    // ── Gate pass quotas ──────────────────────────────────────────────────
    limits: {
      official: { type: limitSchema, default: () => ({ daily: 3, weekly: 10, monthly: 30, yearly: 250 }) },
      personal: { type: limitSchema, default: () => ({ daily: 1, weekly: 3, monthly: 8, yearly: 60 }) },
    },
    unitLimits: { type: [unitOverrideSchema], default: [] },
    departmentLimits: { type: [deptOverrideSchema], default: [] },
    roleLimits: { type: [roleOverrideSchema], default: [] },

    maxActiveGatePasses: { type: Number, default: 2, min: 1 },
    allowMultiplePending: { type: Boolean, default: false },

    // ── Working hours ─────────────────────────────────────────────────────
    workingHours: {
      gateOpenTime: { type: String, default: '08:00' },
      gateCloseTime: { type: String, default: '20:00' },
      /** 0 = Sunday … 6 = Saturday */
      weekendDays: { type: [Number], default: [0] },
      restrictWeekend: { type: Boolean, default: false },
      restrictHolidays: { type: Boolean, default: true },
      /** Reject requests whose expectedOutTime falls outside gate hours. */
      enforceGateHours: { type: Boolean, default: true },
    },

    // ── Workflow toggles ──────────────────────────────────────────────────
    workflow: {
      approvalRequired: { type: Boolean, default: true },
      hrReviewRequired: { type: Boolean, default: true },
      securityApprovalRequired: { type: Boolean, default: true },
      attachmentMandatory: { type: Boolean, default: false },
      reasonMandatory: { type: Boolean, default: true },
      purposeMandatory: { type: Boolean, default: false },
      /** Personal passes may be forced through HR even when hrReviewRequired is off. */
      hrReviewForPersonalOnly: { type: Boolean, default: false },
      autoClosePass: { type: Boolean, default: true },
      expiryHours: { type: Number, default: 24, min: 1 },
      autoReminder: { type: Boolean, default: true },
      reminderBeforeMinutes: { type: Number, default: 30, min: 5 },
    },

    // ── Notification channels ─────────────────────────────────────────────
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: false },
      inApp: { type: Boolean, default: true },
    },

    security: {
      requireExitPhoto: { type: Boolean, default: false },
      requireEntryPhoto: { type: Boolean, default: false },
      allowManualVerification: { type: Boolean, default: true },
      qrEnabled: { type: Boolean, default: true },
    },

    branding: {
      primaryColor: { type: String, default: '#6366f1' },
      accentColor: { type: String, default: '#06b6d4' },
      defaultTheme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false }
);

/** Fetches the singleton, creating it with defaults on first boot. */
settingsSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne({ key: 'GLOBAL' });
  if (!doc) doc = await this.create({ key: 'GLOBAL' });
  return doc;
};

export default mongoose.model('Settings', settingsSchema);
