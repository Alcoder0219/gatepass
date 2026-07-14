import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { DATA_SCOPES, DATA_SCOPE, PERMISSIONS } from '../constants/index.js';

/**
 * Roles are fully dynamic — an admin can create new ones at runtime. The six
 * seeded roles carry `isSystem: true`, which blocks deletion (but not editing
 * of their permissions, so an org can still tailor them).
 */
const roleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Role key is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9_]+$/, 'Role key may only contain A-Z, 0-9 and underscores'],
    },
    name: { type: String, required: [true, 'Role name is required'], trim: true },
    description: { type: String, trim: true, default: '' },

    /** Flat list of `module.action` permission keys. */
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (values) => values.every((v) => PERMISSIONS.includes(v)),
        message: 'One or more permissions are not recognised',
      },
    },

    /** How much gate pass data holders of this role may read. */
    dataScope: { type: String, enum: DATA_SCOPES, default: DATA_SCOPE.OWN },

    /** Empty array = no restriction (all units / all departments). */
    unitRestrictions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Unit' }],
    departmentRestrictions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],

    /** Approval hierarchy weight — higher can approve for lower. */
    level: { type: Number, default: 0 },

    color: { type: String, default: '#6366f1' },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

roleSchema.index({ isActive: 1 });

roleSchema.methods.can = function can(permission) {
  return this.permissions.includes(permission);
};

roleSchema.plugin(paginate);

export default mongoose.model('Role', roleSchema);
