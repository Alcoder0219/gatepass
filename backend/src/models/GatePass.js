import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import {
  GATEPASS_STATUS,
  GATEPASS_STATUSES,
  GATEPASS_TYPES,
  GATEPASS_TYPE,
  WORKFLOW_STAGE,
} from '../constants/index.js';

const attachmentSchema = new mongoose.Schema(
  {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

/** Append-only workflow trail. Every approve / reject / review / scan lands here. */
const timelineSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    fromStatus: String,
    toStatus: String,
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    actorRole: String,
    comment: { type: String, default: '' },
    at: { type: Date, default: Date.now },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: true }
);

const gatePassSchema = new mongoose.Schema(
  {
    /** Human-readable, unit-scoped, monotonically increasing: GP-MNR-2026-000123 */
    gatePassNumber: { type: String, unique: true, index: true },

    // ── Employee snapshot (denormalised so historic passes stay truthful) ──
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employeeCode: { type: String, required: true },
    employeeName: { type: String, required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    departmentName: { type: String, required: true },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    unitName: { type: String, required: true },
    designation: { type: String, default: '' },

    // ── Request ───────────────────────────────────────────────────────────
    type: { type: String, enum: GATEPASS_TYPES, required: true, index: true },
    reason: { type: String, required: [true, 'Reason is required'], trim: true, maxlength: 500 },
    purpose: { type: String, trim: true, default: '', maxlength: 1000 },
    expectedOutTime: { type: Date, required: [true, 'Expected out time is required'] },
    expectedInTime: { type: Date, required: [true, 'Expected in time is required'] },
    attachments: { type: [attachmentSchema], default: [] },
    remarks: { type: String, trim: true, default: '', maxlength: 1000 },

    // ── Routing ───────────────────────────────────────────────────────────
    reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportingManagerName: { type: String, default: '' },

    // ── State ─────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: GATEPASS_STATUSES,
      default: GATEPASS_STATUS.PENDING,
      index: true,
    },
    stage: { type: String, enum: Object.values(WORKFLOW_STAGE), default: WORKFLOW_STAGE.MANAGER, index: true },

    // ── Manager decision ──────────────────────────────────────────────────
    approval: {
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      approvedAt: { type: Date, default: null },
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      rejectedAt: { type: Date, default: null },
      comment: { type: String, default: '' },
    },

    // ── HR review (mirrors the HRReview collection's latest entry) ─────────
    hrReview: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewedAt: { type: Date, default: null },
      status: { type: String, enum: ['PENDING', 'OK', 'NOT_OK', null], default: null },
      comment: { type: String, default: '' },
    },

    // ── Security gate movement ────────────────────────────────────────────
    security: {
      exitBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      actualOutTime: { type: Date, default: null },
      exitPhoto: { type: String, default: '' },
      exitRemark: { type: String, default: '' },
      entryBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      actualInTime: { type: Date, default: null },
      entryPhoto: { type: String, default: '' },
      entryRemark: { type: String, default: '' },
    },

    /** Data-URL PNG minted the moment the pass reaches APPROVED. */
    qrCode: { type: String, default: '' },
    /** Opaque token embedded in the QR; security scans resolve the pass by it. */
    qrToken: { type: String, default: null, index: true },

    expiresAt: { type: Date, default: null },
    isLate: { type: Boolean, default: false },
    lateByMinutes: { type: Number, default: 0 },

    timeline: { type: [timelineSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/* Compound indexes matching the hot query paths (list screens + dashboards). */
gatePassSchema.index({ employee: 1, status: 1, createdAt: -1 });
gatePassSchema.index({ reportingManager: 1, status: 1, createdAt: -1 });
gatePassSchema.index({ unit: 1, department: 1, status: 1, createdAt: -1 });
gatePassSchema.index({ status: 1, createdAt: -1 });
gatePassSchema.index({ type: 1, createdAt: -1 });
gatePassSchema.index({ gatePassNumber: 'text', employeeName: 'text', employeeCode: 'text', reason: 'text' });

gatePassSchema.virtual('isActive').get(function isActive() {
  return [
    GATEPASS_STATUS.PENDING,
    GATEPASS_STATUS.CHANGES_REQUESTED,
    GATEPASS_STATUS.HR_REVIEW,
    GATEPASS_STATUS.APPROVED,
    GATEPASS_STATUS.OUT,
  ].includes(this.status);
});

gatePassSchema.virtual('isPersonal').get(function isPersonal() {
  return this.type === GATEPASS_TYPE.PERSONAL;
});

/** Minutes the employee was actually outside the gate; null until returned. */
gatePassSchema.virtual('actualDurationMinutes').get(function actualDuration() {
  const { actualOutTime, actualInTime } = this.security ?? {};
  if (!actualOutTime || !actualInTime) return null;
  return Math.max(0, Math.round((actualInTime - actualOutTime) / 60_000));
});

gatePassSchema.methods.pushTimeline = function pushTimeline(entry) {
  this.timeline.push({ at: new Date(), ...entry });
  return this;
};

gatePassSchema.plugin(paginate);

export default mongoose.model('GatePass', gatePassSchema);
