import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';

/**
 * An employee's balance for one leave type in one leave year.
 *
 * `available` is a virtual, never a stored column — a stored total drifts the
 * moment any one component is written without it. The dashboard reads this
 * model; nothing writes it yet beyond the seeder.
 */
const leaveBalanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true, index: true },
    /** Label form of the leave period, e.g. '2026-2027'. */
    leaveYear: { type: String, required: true, index: true },

    opening: { type: Number, default: 0, min: 0 },
    accrued: { type: Number, default: 0, min: 0 },
    carriedForward: { type: Number, default: 0, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    /** Reserved by requests that are submitted but not yet decided. */
    pending: { type: Number, default: 0, min: 0 },
    adjusted: { type: Number, default: 0 },

    /** Allocation provenance — who granted this balance, when, and why. */
    remarks: { type: String, trim: true, default: '', maxlength: 250 },
    allocatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    allocatedAt: { type: Date, default: null },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

leaveBalanceSchema.index({ employee: 1, leaveType: 1, leaveYear: 1 }, { unique: true });

leaveBalanceSchema.virtual('entitled').get(function entitled() {
  return (this.opening ?? 0) + (this.accrued ?? 0) + (this.carriedForward ?? 0) + (this.adjusted ?? 0);
});

leaveBalanceSchema.virtual('available').get(function available() {
  return Math.max(0, this.entitled - (this.used ?? 0) - (this.pending ?? 0));
});

leaveBalanceSchema.plugin(paginate);

export default mongoose.model('LeaveBalance', leaveBalanceSchema);
