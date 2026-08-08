import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { LEAVE_STATUS, LEAVE_STATUSES, LEAVE_STAGE, DAY_PARTS, DAY_PART } from '../constants/index.js';

/** Append-only workflow trail, mirroring the gate pass timeline. */
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
  },
  { _id: true }
);

const leaveRequestSchema = new mongoose.Schema(
  {
    /** Unit- and year-scoped, from the shared Counter: LV-MNR-2026-000123 */
    leaveNumber: { type: String, unique: true, index: true },

    // ── Employee snapshot (denormalised so historic requests stay truthful) ──
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employeeCode: { type: String, required: true },
    employeeName: { type: String, required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    departmentName: { type: String, default: '' },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    unitName: { type: String, default: '' },
    designation: { type: String, default: '' },

    // ── Request ─────────────────────────────────────────────────────────────
    leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true, index: true },
    leaveTypeCode: { type: String, default: '' },
    leaveTypeName: { type: String, default: '' },

    fromDate: { type: Date, required: true, index: true },
    toDate: { type: Date, required: true, index: true },
    fromDayPart: { type: String, enum: DAY_PARTS, default: DAY_PART.FULL },
    toDayPart: { type: String, enum: DAY_PARTS, default: DAY_PART.FULL },
    /** Working days, in 0.5 steps. Computed on write — never derived on read. */
    totalDays: { type: Number, required: true, min: 0 },

    /**
     * Per-date audit of how `totalDays` was reached. Stored rather than
     * recomputed so a disputed count can be explained months later, even after
     * the leave type's weekly-off / holiday rules have changed.
     */
    workingDaysBreakdown: {
      type: [
        {
          _id: false,
          date: Date,
          dayPart: String,
          charged: Number,
          isWeekend: Boolean,
          isHoliday: Boolean,
          holidayName: String,
          reason: String,
        },
      ],
      default: [],
    },

    /** Which leave year the days were drawn from, e.g. '2026-2027'. */
    leaveYear: { type: String, default: '', index: true },

    /** What the employee actually saw when they submitted. */
    balanceSnapshot: {
      availableAtSubmission: { type: Number, default: 0 },
      afterDeduction: { type: Number, default: 0 },
    },

    reason: { type: String, trim: true, default: '', maxlength: 1000 },
    contactDuringLeave: { type: String, trim: true, default: '', maxlength: 120 },
    handoverNotes: { type: String, trim: true, default: '', maxlength: 1000 },

    /** Set when HR raises the application for someone else. */
    appliedOnBehalf: { type: Boolean, default: false },
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Routing ─────────────────────────────────────────────────────────────
    reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reportingManagerName: { type: String, default: '' },

    // ── State ───────────────────────────────────────────────────────────────
    status: { type: String, enum: LEAVE_STATUSES, default: LEAVE_STATUS.PENDING, index: true },
    stage: { type: String, enum: Object.values(LEAVE_STAGE), default: LEAVE_STAGE.MANAGER, index: true },

    approval: {
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      approvedAt: { type: Date, default: null },
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      rejectedAt: { type: Date, default: null },
      comment: { type: String, default: '' },
    },

    hrReview: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewedAt: { type: Date, default: null },
      status: { type: String, enum: ['PENDING', 'OK', 'NOT_OK', null], default: null },
      comment: { type: String, default: '' },
    },

    timeline: { type: [timelineSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    /**
     * Deletion is a SOFT delete: the document stays so the audit trail keeps
     * pointing at something real. Every query in the module already filters on
     * `isDeleted: false`, so a deleted record disappears from the queues, the
     * dashboard and the overlap check without any of them changing.
     */
    isDeleted: { type: Boolean, default: false, index: true },
    deletion: {
      deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      deletedByName: { type: String, default: '' },
      deletedAt: { type: Date, default: null },
      reason: { type: String, trim: true, default: '', maxlength: 500 },
      /** Status the request held when it was deleted — drives the restore. */
      statusAtDeletion: { type: String, default: '' },
      /** How many days went back, and which bucket they came out of. */
      restoredDays: { type: Number, default: 0 },
      restoredFrom: { type: String, enum: ['PENDING', 'USED', 'NONE', ''], default: '' },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/* Compound indexes matching the dashboard's hot paths. */
leaveRequestSchema.index({ employee: 1, status: 1, fromDate: -1 });
leaveRequestSchema.index({ reportingManager: 1, status: 1, fromDate: -1 });
leaveRequestSchema.index({ unit: 1, department: 1, status: 1 });
leaveRequestSchema.index({ status: 1, fromDate: 1, toDate: 1 });
leaveRequestSchema.index({ createdAt: -1 });
/** The deletion register is queried by when it was deleted, newest first. */
leaveRequestSchema.index({ isDeleted: 1, 'deletion.deletedAt': -1 });

leaveRequestSchema.plugin(paginate);

export default mongoose.model('LeaveRequest', leaveRequestSchema);
