import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import {
  LEAVE_NATURE,
  LEAVE_NATURES,
  LEAVE_CATEGORY,
  LEAVE_CATEGORIES,
} from '../constants/index.js';

/**
 * A kind of leave an employee may take — CL, SL, EL, LOP and so on.
 *
 * `type` (PAID / UNPAID) and `category` carry the business meaning; `isPaid` is
 * deliberately NOT stored — it is derived from `type` wherever it is needed, so
 * the two can never disagree.
 *
 * `includeWeeklyOff` and `includeHolidays` are the sandwich rule: when true, a
 * weekly off or holiday falling INSIDE the leave range is counted as a leave
 * day. Both default to false — the employee is not charged for a day the
 * company was closed anyway.
 */
const leaveTypeSchema = new mongoose.Schema(
  {
    /** Leave Code */
    code: {
      type: String,
      required: [true, 'Leave code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: [2, 'Leave code must be at least 2 characters'],
      maxlength: [10, 'Leave code cannot exceed 10 characters'],
      match: [/^[A-Z0-9_]+$/, 'Leave code may only contain A-Z, 0-9 and underscores'],
    },

    /** Leave Name */
    name: {
      type: String,
      required: [true, 'Leave name is required'],
      trim: true,
      minlength: [2, 'Leave name must be at least 2 characters'],
      maxlength: [60, 'Leave name cannot exceed 60 characters'],
    },

    /** Leave Type — PAID or UNPAID. */
    type: {
      type: String,
      enum: { values: LEAVE_NATURES, message: 'Leave type must be PAID or UNPAID' },
      required: [true, 'Leave type is required'],
      default: LEAVE_NATURE.PAID,
      index: true,
    },

    /** Leave Category */
    category: {
      type: String,
      enum: { values: LEAVE_CATEGORIES, message: 'Not a recognised leave category' },
      required: [true, 'Leave category is required'],
      default: LEAVE_CATEGORY.REGULAR,
      index: true,
    },

    /** Weekly Off Include — count weekly offs inside the range as leave. */
    includeWeeklyOff: { type: Boolean, default: false },

    /** Holiday Off Include — count holidays inside the range as leave. */
    includeHolidays: { type: Boolean, default: false },

    description: { type: String, trim: true, default: '', maxlength: 250 },

    /** Days granted per leave year. Always 0 for an UNPAID type. */
    annualQuota: { type: Number, default: 0, min: [0, 'Annual quota cannot be negative'] },
    allowHalfDay: { type: Boolean, default: true },
    requiresAttachmentAfterDays: { type: Number, default: 0, min: 0 },

    /** Presentation — mirrors how gate pass types carry their own colour. */
    color: { type: String, default: '#6366f1' },

    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/** Case-insensitive uniqueness on the name, alongside the unique code. */
leaveTypeSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
leaveTypeSchema.index({ type: 1, category: 1, isActive: 1 });

leaveTypeSchema.virtual('isPaid').get(function isPaid() {
  return this.type === LEAVE_NATURE.PAID;
});

/**
 * An unpaid type has nothing to draw down, so its quota is pinned to 0 rather
 * than rejected — the rule holds however the document is written.
 */
leaveTypeSchema.pre('validate', function pinUnpaidQuota(next) {
  if (this.type === LEAVE_NATURE.UNPAID) this.annualQuota = 0;
  next();
});

leaveTypeSchema.plugin(paginate);

export default mongoose.model('LeaveType', leaveTypeSchema);
