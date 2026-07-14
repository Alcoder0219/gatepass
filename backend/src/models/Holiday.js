import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';

const holidaySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Holiday name is required'], trim: true },
    date: { type: Date, required: [true, 'Holiday date is required'], index: true },
    type: { type: String, enum: ['PUBLIC', 'RESTRICTED', 'COMPANY'], default: 'PUBLIC' },

    /** Empty = applies to every unit. */
    units: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Unit' }],

    /** When true, gate passes cannot be raised on this date. */
    restrictGatePass: { type: Boolean, default: true },
    description: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

holidaySchema.index({ date: 1, isActive: 1 });

holidaySchema.plugin(paginate);

export default mongoose.model('Holiday', holidaySchema);
