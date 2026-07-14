import User from '../models/User.js';
import { DATA_SCOPE, PERMISSION, ROLE, GATEPASS_STATUS } from '../constants/index.js';

/**
 * Turns a caller into the mongo filter that bounds what they may READ.
 *
 * This is the single chokepoint for the data-restriction matrix in the spec:
 *   Employee  → own gate passes only
 *   HOD       → gate passes of the people reporting to them (+ their own)
 *   HR        → everything that has cleared the manager (HR review onwards)
 *   Security  → approved passes only (approved / out / completed)
 *   Admin     → everything
 *
 * The rules are driven by the role's `dataScope` + permissions rather than by
 * hardcoded role keys, so a custom role gets a coherent scope for free.
 */
export const buildGatePassScope = async (user) => {
  const roleKey = user.role?.key;
  const scope = user.role?.dataScope ?? DATA_SCOPE.OWN;
  const permissions = user.effectivePermissions();

  // Super Admin / Admin — unrestricted.
  if (roleKey === ROLE.SUPER_ADMIN) return {};
  if (scope === DATA_SCOPE.ALL && permissions.includes(PERMISSION.GATEPASS_VIEW_ALL)) {
    return applyRoleRestrictions({}, user);
  }

  const clauses = [];

  // Everyone can always see what they raised themselves.
  if (permissions.includes(PERMISSION.GATEPASS_VIEW_OWN)) {
    clauses.push({ employee: user._id });
  }

  // Manager view: passes routed to me, plus passes raised by my reportees.
  if (scope === DATA_SCOPE.REPORTEES || roleKey === ROLE.HOD) {
    const reportees = await User.find({ reportingManager: user._id }).select('_id').lean();
    clauses.push({ reportingManager: user._id });
    if (reportees.length) {
      clauses.push({ employee: { $in: reportees.map((r) => r._id) } });
    }
  }

  // Department view.
  if (scope === DATA_SCOPE.DEPARTMENT || permissions.includes(PERMISSION.GATEPASS_VIEW_DEPARTMENT)) {
    const departmentId = user.department?._id ?? user.department;
    if (departmentId) clauses.push({ department: departmentId });
  }

  // Unit view.
  if (scope === DATA_SCOPE.UNIT) {
    const unitId = user.unit?._id ?? user.unit;
    if (unitId) clauses.push({ unit: unitId });
  }

  // HR: sees every pass that has reached (or passed) the HR stage.
  if (permissions.includes(PERMISSION.HR_REVIEW_VIEW)) {
    clauses.push({
      status: {
        $in: [
          GATEPASS_STATUS.HR_REVIEW,
          GATEPASS_STATUS.APPROVED,
          GATEPASS_STATUS.OUT,
          GATEPASS_STATUS.COMPLETED,
          GATEPASS_STATUS.REJECTED,
          GATEPASS_STATUS.EXPIRED,
        ],
      },
    });
  }

  // Security: approved passes only — never anything still in the approval chain.
  if (permissions.includes(PERMISSION.SECURITY_ACCESS)) {
    clauses.push({
      status: {
        $in: [GATEPASS_STATUS.APPROVED, GATEPASS_STATUS.OUT, GATEPASS_STATUS.COMPLETED],
      },
    });
  }

  // No clause matched → the user may see nothing.
  if (!clauses.length) return { _id: null };

  return applyRoleRestrictions({ $or: clauses }, user);
};

/**
 * Layers the role's unit / department restriction lists on top of the scope.
 * An empty restriction list means "no restriction".
 */
const applyRoleRestrictions = (filter, user) => {
  const { unitRestrictions = [], departmentRestrictions = [] } = user.role ?? {};
  const constraints = [];

  if (unitRestrictions.length) constraints.push({ unit: { $in: unitRestrictions } });
  if (departmentRestrictions.length) {
    constraints.push({ department: { $in: departmentRestrictions } });
  }

  if (!constraints.length) return filter;
  return Object.keys(filter).length ? { $and: [filter, ...constraints] } : { $and: constraints };
};

/** Equivalent scope for the Users collection (who may I see in a picker / list). */
export const buildUserScope = async (user) => {
  const roleKey = user.role?.key;
  if (roleKey === ROLE.SUPER_ADMIN) return {};

  const scope = user.role?.dataScope ?? DATA_SCOPE.OWN;

  if (scope === DATA_SCOPE.ALL) return applyRoleRestrictions({}, user);
  if (scope === DATA_SCOPE.UNIT) return { unit: user.unit?._id ?? user.unit };
  if (scope === DATA_SCOPE.DEPARTMENT) return { department: user.department?._id ?? user.department };
  if (scope === DATA_SCOPE.REPORTEES || roleKey === ROLE.HOD) {
    return { $or: [{ reportingManager: user._id }, { _id: user._id }] };
  }
  return { _id: user._id };
};

/**
 * Can this user READ this specific gate pass? Used on the detail route, where a
 * filter alone would return 404 and hide the difference between "missing" and
 * "forbidden" — we want an explicit 403 there.
 */
export const canViewGatePass = async (user, gatePass) => {
  const scope = await buildGatePassScope(user);
  if (!Object.keys(scope).length) return true; // unrestricted

  // Re-evaluate the scope filter against this one document.
  const { default: GatePass } = await import('../models/GatePass.js');
  const match = await GatePass.exists({ $and: [{ _id: gatePass._id }, scope] });
  return Boolean(match);
};

export default { buildGatePassScope, buildUserScope, canViewGatePass };
