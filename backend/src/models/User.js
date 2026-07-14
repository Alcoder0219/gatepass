import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import paginate from 'mongoose-paginate-v2';
import env from '../config/env.js';

/**
 * A refresh token per active session (device). Stored hashed. Revoking a
 * session simply pulls the entry.
 */
const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: { type: String, required: [true, 'Employee name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
      default: '',
      match: [/^$|^[0-9+\-\s()]{7,20}$/, 'Please provide a valid phone number'],
    },
    password: { type: String, required: [true, 'Password is required'], select: false, minlength: 8 },

    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    designation: { type: String, trim: true, default: '' },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true, index: true },

    /** Drives the approval routing: a new gate pass goes to this user. */
    reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    profileImage: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true },

    /** Optional per-user overrides layered on top of the role's scope. */
    extraPermissions: { type: [String], default: [] },
    deniedPermissions: { type: [String], default: [] },

    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },

    // Auth flows
    sessions: { type: [sessionSchema], default: [], select: false },
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },
    otpHash: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null, select: false },
    otpAttempts: { type: Number, default: 0, select: false },

    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      emailNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.sessions;
        delete ret.resetTokenHash;
        delete ret.resetTokenExpiresAt;
        delete ret.otpHash;
        delete ret.otpExpiresAt;
        delete ret.otpAttempts;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

userSchema.index({ name: 'text', employeeId: 'text', email: 'text' });
userSchema.index({ unit: 1, department: 1, status: 1 });

userSchema.virtual('initials').get(function initials() {
  return (this.name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, env.security.saltRounds);
  if (!this.isNew) this.passwordChangedAt = new Date();
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** Effective permissions = role permissions + extras − denied. */
userSchema.methods.effectivePermissions = function effectivePermissions() {
  const base = new Set(this.role?.permissions ?? []);
  this.extraPermissions.forEach((p) => base.add(p));
  this.deniedPermissions.forEach((p) => base.delete(p));
  return [...base];
};

userSchema.plugin(paginate);

export default mongoose.model('User', userSchema);
