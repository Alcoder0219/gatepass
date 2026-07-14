import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';

/** One company, many units (Corporate, Manesar, Chennai, Bawal, Bilaspur, …). */
const unitSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Unit code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: { type: String, required: [true, 'Unit name is required'], trim: true },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'India' },
    timezone: { type: String, default: 'Asia/Kolkata' },

    /** Unit-level override of the global working hours; null → inherit settings. */
    gateOpenTime: { type: String, default: null }, // "08:00"
    gateCloseTime: { type: String, default: null }, // "20:00"

    headOfUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

unitSchema.index({ isActive: 1 });

unitSchema.plugin(paginate);

export default mongoose.model('Unit', unitSchema);
