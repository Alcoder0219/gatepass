import ApiError from '../utils/ApiError.js';
import { ROLE } from '../constants/index.js';

/** Super Admin bypasses every permission check by design. */
const isSuperAdmin = (user) => user?.role?.key === ROLE.SUPER_ADMIN;

export const hasPermission = (user, permission) => {
  if (isSuperAdmin(user)) return true;
  const effective = user?.effectivePermissions?.() ?? [];
  return effective.includes(permission);
};

/**
 * Route guard: the caller must hold EVERY listed permission.
 *   router.post('/', authenticate, authorize(PERMISSION.USERS_CREATE), createUser)
 */
export const authorize = (...permissions) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (isSuperAdmin(req.user)) return next();

  const effective = req.permissions ?? req.user.effectivePermissions();
  const missing = permissions.filter((p) => !effective.includes(p));

  if (missing.length) {
    return next(
      ApiError.forbidden('You do not have permission to perform this action', { required: missing })
    );
  }
  return next();
};

/** Route guard: the caller must hold AT LEAST ONE of the listed permissions. */
export const authorizeAny = (...permissions) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (isSuperAdmin(req.user)) return next();

  const effective = req.permissions ?? req.user.effectivePermissions();
  if (permissions.some((p) => effective.includes(p))) return next();

  return next(
    ApiError.forbidden('You do not have permission to perform this action', { requiredAny: permissions })
  );
};

/** Route guard by role key — prefer `authorize` unless the rule is truly role-based. */
export const restrictToRoles = (...roleKeys) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (isSuperAdmin(req.user)) return next();
  if (!roleKeys.includes(req.user.role?.key)) {
    return next(ApiError.forbidden('This action is restricted to: ' + roleKeys.join(', ')));
  }
  return next();
};

export default authorize;
