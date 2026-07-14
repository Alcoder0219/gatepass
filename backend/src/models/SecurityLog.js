import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';

/** Immutable gate movement ledger — one row per physical EXIT or ENTRY event. */
const securityLogSchema = new mongoose.Schema(
  {
    gatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', required: true, index: true },
    gatePassNumber: { type: String, required: true, index: true },

    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employeeName: { type: String, required: true },
    employeeCode: { type: String, required: true },

    type: { type: String, enum: ['EXIT', 'ENTRY'], required: true, index: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedByName: { type: String, default: '' },

    recordedAt: { type: Date, default: Date.now, index: true },
    photo: { type: String, default: '' },
    remark: { type: String, trim: true, default: '', maxlength: 500 },

    /** How the guard identified the pass — helps audit manual overrides. */
    verificationMethod: { type: String, enum: ['QR', 'MANUAL', 'SEARCH'], default: 'MANUAL' },

    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', index: true },
    gate: { type: String, default: 'MAIN' },

    /** Set on ENTRY when the employee came back after `expectedInTime`. */
    isLate: { type: Boolean, default: false },
    lateByMinutes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

securityLogSchema.index({ unit: 1, recordedAt: -1 });
securityLogSchema.index({ type: 1, recordedAt: -1 });

securityLogSchema.plugin(paginate);

export default mongoose.model('SecurityLog', securityLogSchema);
