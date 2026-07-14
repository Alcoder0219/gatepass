import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';

const departmentSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Department code is required'],
      uppercase: true,
      trim: true,
    },
    name: { type: String, required: [true, 'Department name is required'], trim: true },
    description: { type: String, trim: true, default: '' },

    /** A department may exist in one unit only; the same code can repeat across units. */
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    hod: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

departmentSchema.index({ code: 1, unit: 1 }, { unique: true });
departmentSchema.index({ isActive: 1 });

departmentSchema.plugin(paginate);

export default mongoose.model('Department', departmentSchema);
