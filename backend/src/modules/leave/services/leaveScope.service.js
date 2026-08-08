import User from '../../../models/User.js';
import { DATA_SCOPE, ROLE } from '../../../constants/index.js';

/**
 * Turns a caller into the mongo filter that bounds which LEAVE REQUESTS they may
 * read. The leave equivalent of `scope.service.js#buildGatePassScope`, kept
 * separate because the two modules restrict on different grounds.
 *
 *   Employee → own requests only
 *   HOD      → requests of the people reporting to them (+ their own)
 *   HR       → everything
 *   Admin    → everything
 *   Security → nothing: a gate guard has no business seeing who is on sick leave
 *
 * Driven by the role's `dataScope`, NOT by hardcoded role keys, so a custom role
 * gets a coherent scope for free. It deliberately reads no `leave.*` permission
 * — that vocabulary does not exist yet, and inventing it here would silently
 * change the RBAC contract.
 */
export const buildLeaveScope = async (user) => {
  const roleKey = user.role?.key;
  const scope = user.role?.dataScope ?? DATA_SCOPE.OWN;

  if (roleKey === ROLE.SUPER_ADMIN) return {};

  // Security has no leave visibility at all, whatever its data scope says.
  if (roleKey === ROLE.SECURITY) return { _id: null };

  if (scope === DATA_SCOPE.ALL) return applyRoleRestrictions({}, user);

  const clauses = [{ employee: user._id }]; // always your own

  if (scope === DATA_SCOPE.REPORTEES || roleKey === ROLE.HOD) {
    const reportees = await User.find({ reportingManager: user._id }).select('_id').lean();
    clauses.push({ reportingManager: user._id });
    if (reportees.length) clauses.push({ employee: { $in: reportees.map((r) => r._id) } });
  }

  if (scope === DATA_SCOPE.DEPARTMENT) {
    const departmentId = user.department?._id ?? user.department;
    if (departmentId) clauses.push({ department: departmentId });
  }

  if (scope === DATA_SCOPE.UNIT) {
    const unitId = user.unit?._id ?? user.unit;
    if (unitId) clauses.push({ unit: unitId });
  }

  return applyRoleRestrictions({ $or: clauses }, user);
};

/** Layers the role's unit / department restriction lists on top of the scope. */
const applyRoleRestrictions = (filter, user) => {
  const { unitRestrictions = [], departmentRestrictions = [] } = user.role ?? {};
  const constraints = [];

  if (unitRestrictions.length) constraints.push({ unit: { $in: unitRestrictions } });
  if (departmentRestrictions.length) constraints.push({ department: { $in: departmentRestrictions } });

  if (!constraints.length) return filter;
  return Object.keys(filter).length ? { $and: [filter, ...constraints] } : { $and: constraints };
};

/** True when the caller sees more than just their own requests. */
export const hasTeamVisibility = (user) => {
  const roleKey = user.role?.key;
  if (roleKey === ROLE.SUPER_ADMIN) return true;
  if (roleKey === ROLE.SECURITY) return false;
  return (user.role?.dataScope ?? DATA_SCOPE.OWN) !== DATA_SCOPE.OWN;
};

export default { buildLeaveScope, hasTeamVisibility };
