import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';

/**
 * One row per HR decision. A pass can be reviewed more than once (Not OK sends
 * it back to the manager, who may re-approve it), so this is a history, not a
 * one-to-one — the latest entry is mirrored onto `GatePass.hrReview`.
 */
const hrReviewSchema = new mongoose.Schema(
  {
    gatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', required: true, index: true },
    gatePassNumber: { type: String, required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reviewerName: { type: String, default: '' },

    status: { type: String, enum: ['OK', 'NOT_OK'], required: true, index: true },
    comment: { type: String, trim: true, default: '', maxlength: 1000 },

    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    reviewedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

hrReviewSchema.index({ gatePass: 1, reviewedAt: -1 });

hrReviewSchema.plugin(paginate);

export default mongoose.model('HRReview', hrReviewSchema);
