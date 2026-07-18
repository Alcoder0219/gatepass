import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';
import User from '../models/User.js';
import { getCachedUser, setCachedUser } from '../utils/authCache.js';

/**
 * Verifies the access token and hydrates `req.user` with the role populated.
 * Everything downstream (RBAC, data scoping, audit) reads from `req.user`.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.cookies?.accessToken;

  if (!token) throw ApiError.unauthorized('Authentication token is missing');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Access token expired', { code: 'TOKEN_EXPIRED' });
    }
    throw ApiError.unauthorized('Invalid access token');
  }

  if (payload.tokenType !== 'access') throw ApiError.unauthorized('Invalid token type');

  // Hot path: reuse the recently-resolved user (see utils/authCache.js) so the
  // five populate round trips below run at most once per user per TTL, not on
  // every request. The cached document is read-only for every handler except
  // the profile writers, which re-fetch and invalidate.
  let user = getCachedUser(payload.sub);
  if (!user) {
    user = await User.findById(payload.sub)
      .populate('role')
      .populate('department', 'name code')
      .populate('unit', 'name code')
      .populate('reportingManager', 'name employeeId email');
    if (user) setCachedUser(payload.sub, user);
  }

  if (!user) throw ApiError.unauthorized('The account for this token no longer exists');
  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden(`Your account is ${user.status.toLowerCase()}. Contact an administrator.`);
  }
  if (!user.role?.isActive) throw ApiError.forbidden('Your role has been deactivated');

  // A password change invalidates tokens minted before it.
  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime()) {
    throw new ApiError(401, 'Password was changed — please sign in again', { code: 'TOKEN_EXPIRED' });
  }

  req.user = user;
  req.permissions = user.effectivePermissions();
  return next();
});

/** Attaches `req.user` when a token is present, but never rejects. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    const payload = verifyAccessToken(header.slice(7));
    const user = await User.findById(payload.sub).populate('role');
    if (user && user.status === 'ACTIVE') {
      req.user = user;
      req.permissions = user.effectivePermissions();
    }
  } catch {
    /* ignore — the route is public */
  }
  return next();
});

export default authenticate;
