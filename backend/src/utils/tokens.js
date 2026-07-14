import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      employeeId: user.employeeId,
      role: user.role?.key ?? undefined,
      tokenType: 'access',
    },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );

export const signRefreshToken = (user, { remember = false } = {}) =>
  jwt.sign({ sub: user._id.toString(), tokenType: 'refresh' }, env.jwt.refreshSecret, {
    expiresIn: remember ? env.jwt.refreshExpiresInRemember : env.jwt.refreshExpiresIn,
  });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwt.accessSecret);
export const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret);

/** Refresh tokens are stored hashed so a DB leak cannot be replayed. */
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const generateOtp = (length = 6) => {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
};

export const generateResetToken = () => {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hashed: hashToken(raw) };
};

export default {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  generateOtp,
  generateResetToken,
};
