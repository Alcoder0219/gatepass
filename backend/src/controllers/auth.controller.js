import crypto from 'node:crypto';
import env from '../config/env.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  generateOtp,
  generateResetToken,
} from '../utils/tokens.js';
import { recordAudit } from '../services/audit.service.js';
import { sendTemplate } from '../services/email.service.js';
import { toPublicUrl } from '../middlewares/upload.middleware.js';
import { invalidateUser } from '../utils/authCache.js';
import { AUDIT_ACTION } from '../constants/index.js';

const REFRESH_COOKIE = 'refreshToken';
const RESET_TOKEN_EXPIRY_MINUTES = 30;
const MAX_OTP_ATTEMPTS = 5;
const GENERIC_RESET_MESSAGE =
  'If an account exists for that address, a password reset link has been sent.';

const POPULATE = [
  { path: 'role' },
  { path: 'department', select: 'name code' },
  { path: 'unit', select: 'name code' },
  { path: 'reportingManager', select: 'name employeeId email' },
];

/** "15m" / "7d" / "3600" → milliseconds. */
const durationToMs = (value) => {
  const match = String(value).trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const factor = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return amount * factor;
};

const refreshMaxAge = (remember) =>
  durationToMs(remember ? env.jwt.refreshExpiresInRemember : env.jwt.refreshExpiresIn);

const setRefreshCookie = (res, token, maxAge) =>
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge,
    path: '/',
  });

const clearRefreshCookie = (res) =>
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
  });

/**
 * Mints an access + refresh pair, records the refresh token's HASH as a session
 * and sets the cookie. Storing only the hash means a database leak cannot be
 * replayed against the API.
 */
const issueSession = async (user, req, res, { remember = false } = {}) => {
  invalidateUser(user._id); // a new/updated session must not read a stale cached copy
  const refreshToken = signRefreshToken(user, { remember });
  const maxAge = refreshMaxAge(remember);
  const now = Date.now();

  // Drop anything already expired so the array cannot grow without bound.
  user.sessions = (user.sessions ?? []).filter((s) => s.expiresAt?.getTime() > now);
  user.sessions.push({
    tokenHash: hashToken(refreshToken),
    userAgent: req.headers['user-agent'] ?? '',
    ip: req.ip ?? '',
    expiresAt: new Date(now + maxAge),
  });
  user.lastLoginAt = new Date();
  await user.save();

  setRefreshCookie(res, refreshToken, maxAge);
  return { accessToken: signAccessToken(user), refreshToken };
};

const authPayload = (user, accessToken) => ({
  user: user.toJSON(),
  accessToken,
  permissions: user.effectivePermissions(),
});

/* ─── POST /auth/login ────────────────────────────────────────────────────── */
export const login = asyncHandler(async (req, res) => {
  const { email, password, rememberMe } = req.body;

  const user = await User.findOne({ email }).select('+password +sessions').populate(POPULATE);

  // Same message for "no such user" and "wrong password" — never leak which.
  if (!user || !(await user.comparePassword(password))) {
    await recordAudit({
      action: AUDIT_ACTION.LOGIN_FAILED,
      actor: user ?? null,
      entity: 'User',
      entityId: user?._id ?? null,
      entityLabel: email,
      description: `Failed sign-in attempt for ${email}`,
      status: 'FAILED',
      req,
    });
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.status !== 'ACTIVE') {
    await recordAudit({
      action: AUDIT_ACTION.LOGIN_FAILED,
      actor: user,
      entity: 'User',
      entityId: user._id,
      entityLabel: user.employeeId,
      description: `Sign-in blocked — account is ${user.status}`,
      status: 'FAILED',
      req,
    });
    throw ApiError.forbidden(`Your account is ${user.status.toLowerCase()}. Contact an administrator.`);
  }
  if (!user.role?.isActive) throw ApiError.forbidden('Your role has been deactivated');

  const { accessToken } = await issueSession(user, req, res, { remember: rememberMe });

  await recordAudit({
    action: AUDIT_ACTION.LOGIN,
    actor: user,
    entity: 'User',
    entityId: user._id,
    entityLabel: user.employeeId,
    description: `${user.name} signed in`,
    req,
  });

  return sendSuccess(res, { data: authPayload(user, accessToken), message: 'Signed in successfully' });
});

/* ─── POST /auth/refresh ──────────────────────────────────────────────────── */
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  if (!token) throw ApiError.unauthorized('Refresh token is missing');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Refresh token is invalid or has expired');
  }
  if (payload.tokenType !== 'refresh') throw ApiError.unauthorized('Invalid token type');

  const user = await User.findById(payload.sub).select('+sessions').populate(POPULATE);
  if (!user || user.status !== 'ACTIVE') {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('This session is no longer valid');
  }

  const tokenHash = hashToken(token);
  const session = user.sessions.find((s) => s.tokenHash === tokenHash);
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('This session is no longer valid');
  }

  /**
   * Rotation: the presented token is retired and replaced in the same session
   * entry. A stolen refresh token is therefore usable at most once, and the
   * legitimate client's next refresh invalidates the thief's copy.
   */
  const remaining = session.expiresAt.getTime() - Date.now();
  const refreshToken = signRefreshToken(user, {
    remember: remaining > durationToMs(env.jwt.refreshExpiresIn),
  });
  session.tokenHash = hashToken(refreshToken);
  await user.save();

  setRefreshCookie(res, refreshToken, remaining);

  return sendSuccess(res, {
    data: { accessToken: signAccessToken(user), permissions: user.effectivePermissions() },
    message: 'Token refreshed',
  });
});

/* ─── POST /auth/logout ───────────────────────────────────────────────────── */
export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;

  if (token) {
    let userId = req.user?._id ?? null;
    try {
      userId = verifyRefreshToken(token).sub;
    } catch {
      /* an expired token still identifies the session to drop via req.user */
    }
    if (userId) {
      await User.updateOne(
        { _id: userId },
        { $pull: { sessions: { tokenHash: hashToken(token) } } }
      );
    }
  }

  clearRefreshCookie(res);

  if (req.user) {
    await recordAudit({
      action: AUDIT_ACTION.LOGOUT,
      actor: req.user,
      entity: 'User',
      entityId: req.user._id,
      entityLabel: req.user.employeeId,
      description: `${req.user.name} signed out`,
      req,
    });
  }

  return sendSuccess(res, { message: 'Signed out successfully' });
});

/* ─── POST /auth/forgot-password ──────────────────────────────────────────── */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email, status: 'ACTIVE' });

  // Always answer identically — the response must not confirm that an email exists.
  if (!user) return sendSuccess(res, { message: GENERIC_RESET_MESSAGE });

  const { raw, hashed } = generateResetToken();
  user.resetTokenHash = hashed;
  user.resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);
  await user.save();

  await sendTemplate('resetPassword', {
    to: user.email,
    name: user.name,
    resetUrl: `${env.clientUrl}/reset-password?token=${raw}`,
    expiresInMinutes: RESET_TOKEN_EXPIRY_MINUTES,
  });

  return sendSuccess(res, { message: GENERIC_RESET_MESSAGE });
});

/* ─── POST /auth/reset-password ───────────────────────────────────────────── */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const user = await User.findOne({
    resetTokenHash: hashToken(token),
    resetTokenExpiresAt: { $gt: new Date() },
  }).select('+password +sessions +resetTokenHash +resetTokenExpiresAt');

  if (!user) throw ApiError.badRequest('This password reset link is invalid or has expired');

  user.password = password;
  user.resetTokenHash = null;
  user.resetTokenExpiresAt = null;
  user.sessions = []; // every device must sign in again with the new password
  await user.save();
  invalidateUser(user._id);

  clearRefreshCookie(res);

  await recordAudit({
    action: AUDIT_ACTION.PASSWORD_RESET,
    actor: user,
    entity: 'User',
    entityId: user._id,
    entityLabel: user.employeeId,
    description: `${user.name} reset their password`,
    req,
  });

  return sendSuccess(res, { message: 'Your password has been reset. Please sign in.' });
});

/* ─── POST /auth/send-otp ─────────────────────────────────────────────────── */
export const sendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const message = 'If an account exists for that address, a verification code has been sent.';

  const user = await User.findOne({ email, status: 'ACTIVE' }).select('+otpHash +otpExpiresAt +otpAttempts');
  if (!user) return sendSuccess(res, { message });

  const otp = generateOtp(6);
  user.otpHash = hashToken(otp);
  user.otpExpiresAt = new Date(Date.now() + env.security.otpExpiryMinutes * 60 * 1000);
  user.otpAttempts = 0;
  await user.save();

  await sendTemplate('otp', {
    to: user.email,
    name: user.name,
    otp,
    expiresInMinutes: env.security.otpExpiryMinutes,
  });

  return sendSuccess(res, { data: { expiresInMinutes: env.security.otpExpiryMinutes }, message });
});

/* ─── POST /auth/verify-otp ───────────────────────────────────────────────── */
export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email })
    .select('+otpHash +otpExpiresAt +otpAttempts +sessions')
    .populate(POPULATE);

  if (!user || !user.otpHash || !user.otpExpiresAt || user.otpExpiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest('This verification code is invalid or has expired');
  }
  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden(`Your account is ${user.status.toLowerCase()}. Contact an administrator.`);
  }

  if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
    user.otpHash = null;
    user.otpExpiresAt = null;
    await user.save();
    throw ApiError.tooMany('Too many incorrect attempts. Please request a new code.');
  }

  const supplied = Buffer.from(hashToken(otp));
  const stored = Buffer.from(user.otpHash);
  const matches = supplied.length === stored.length && crypto.timingSafeEqual(supplied, stored);

  if (!matches) {
    user.otpAttempts += 1;
    await user.save();
    const left = Math.max(MAX_OTP_ATTEMPTS - user.otpAttempts, 0);
    throw ApiError.badRequest(
      left ? `Incorrect code — ${left} attempt${left === 1 ? '' : 's'} remaining` : 'Too many incorrect attempts. Please request a new code.'
    );
  }

  user.otpHash = null;
  user.otpExpiresAt = null;
  user.otpAttempts = 0;

  const { accessToken } = await issueSession(user, req, res);

  await recordAudit({
    action: AUDIT_ACTION.LOGIN,
    actor: user,
    entity: 'User',
    entityId: user._id,
    entityLabel: user.employeeId,
    description: `${user.name} signed in with a one-time code`,
    req,
  });

  return sendSuccess(res, { data: authPayload(user, accessToken), message: 'Signed in successfully' });
});

/* ─── GET /auth/me ────────────────────────────────────────────────────────── */
export const getMe = asyncHandler(async (req, res) =>
  // The user IS the payload, with `permissions` alongside its own fields — the
  // client restores its session straight from this object on reload.
  sendSuccess(res, {
    data: { ...req.user.toJSON(), permissions: req.user.effectivePermissions() },
    message: 'Profile fetched successfully',
  })
);

/* ─── PATCH /auth/me ──────────────────────────────────────────────────────── */
export const updateMe = asyncHandler(async (req, res) => {
  // Fetch a fresh, writable document — req.user may be a shared read-only copy
  // from the auth cache, which must never be mutated in place.
  const user = await User.findById(req.user._id).populate(POPULATE);
  if (!user) throw ApiError.notFound('User not found');
  const { name, phone, designation, preferences } = req.body;

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (designation !== undefined) user.designation = designation;
  if (preferences) {
    Object.entries(preferences).forEach(([key, value]) => {
      if (value !== undefined) user.preferences[key] = value;
    });
  }

  await user.save();
  invalidateUser(user._id);

  await recordAudit({
    action: AUDIT_ACTION.USER_UPDATE,
    actor: user,
    entity: 'User',
    entityId: user._id,
    entityLabel: user.employeeId,
    description: `${user.name} updated their profile`,
    req,
  });

  return sendSuccess(res, {
    data: { user: user.toJSON(), permissions: user.effectivePermissions() },
    message: 'Profile updated successfully',
  });
});

/* ─── PATCH /auth/me/password ─────────────────────────────────────────────── */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password +sessions');
  if (!user) throw ApiError.notFound('User not found');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect');
  }

  user.password = newPassword;
  user.sessions = []; // force every device to re-authenticate
  await user.save();
  invalidateUser(user._id);

  clearRefreshCookie(res);

  await recordAudit({
    action: AUDIT_ACTION.PASSWORD_RESET,
    actor: req.user,
    entity: 'User',
    entityId: user._id,
    entityLabel: user.employeeId,
    description: `${user.name} changed their password`,
    req,
  });

  return sendSuccess(res, { message: 'Password changed. Please sign in again.' });
});

/* ─── POST /auth/me/avatar ────────────────────────────────────────────────── */
export const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('An image file is required');

  // Fresh, writable document — never mutate the shared auth-cache copy.
  const user = await User.findById(req.user._id).populate(POPULATE);
  if (!user) throw ApiError.notFound('User not found');
  user.profileImage = toPublicUrl(req.file, 'avatars');
  await user.save();
  invalidateUser(user._id);

  return sendSuccess(res, {
    data: { profileImage: user.profileImage, user: user.toJSON() },
    message: 'Profile photo updated successfully',
  });
});

export default {
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  sendOtp,
  verifyOtp,
  getMe,
  updateMe,
  changePassword,
  updateAvatar,
};
