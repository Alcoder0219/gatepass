import GatePass from '../models/GatePass.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import Unit from '../models/Unit.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { buildGatePassScope, buildUserScope } from '../services/scope.service.js';
import { escapeRegex } from './gatepass.controller.js';

const EMPTY = { gatePasses: [], employees: [], departments: [], units: [] };

/**
 * Global search for the command palette / top bar. Every group is scoped:
 * gate passes through `buildGatePassScope`, employees through `buildUserScope`.
 */
export const globalSearch = asyncHandler(async (req, res) => {
  const q = (req.query.q ?? '').trim();

  if (q.length < 2) {
    return sendSuccess(res, { message: 'Query too short', data: { ...EMPTY, query: q } });
  }

  const rx = new RegExp(escapeRegex(q), 'i');
  const [gatePassScope, userScope] = await Promise.all([
    buildGatePassScope(req.user),
    buildUserScope(req.user),
  ]);

  const gatePassFilter = {
    $and: [
      ...(Object.keys(gatePassScope).length ? [gatePassScope] : []),
      { isDeleted: false },
      {
        $or: [
          { gatePassNumber: rx },
          { employeeName: rx },
          { employeeCode: rx },
          { reason: rx },
          { departmentName: rx },
          { unitName: rx },
        ],
      },
    ],
  };

  const userFilter = {
    $and: [
      ...(Object.keys(userScope).length ? [userScope] : []),
      { status: 'ACTIVE' },
      { $or: [{ name: rx }, { employeeId: rx }, { email: rx }] },
    ],
  };

  const [gatePasses, employees, departments, units] = await Promise.all([
    GatePass.find(gatePassFilter)
      .select('gatePassNumber employeeName employeeCode status type reason createdAt')
      .sort('-createdAt')
      .limit(5)
      .lean(),
    User.find(userFilter)
      .select('name employeeId email profileImage designation department unit')
      .populate('department', 'name')
      .populate('unit', 'name')
      .sort('name')
      .limit(5)
      .lean(),
    Department.find({ isActive: true, $or: [{ name: rx }, { code: rx }] })
      .select('name code unit')
      .populate('unit', 'name')
      .limit(3)
      .lean(),
    Unit.find({ isActive: true, $or: [{ name: rx }, { code: rx }] })
      .select('name code city')
      .limit(3)
      .lean(),
  ]);

  return sendSuccess(res, {
    message: 'Search results fetched',
    data: {
      query: q,
      gatePasses: gatePasses.map((gp) => ({
        ...gp,
        type: 'GATE_PASS',
        gatePassType: gp.type,
        title: gp.gatePassNumber,
        subtitle: `${gp.employeeName} (${gp.employeeCode}) — ${gp.status}`,
        link: `/gate-pass/${gp._id}`,
      })),
      employees: employees.map((user) => ({
        ...user,
        type: 'EMPLOYEE',
        title: user.name,
        subtitle: `${user.employeeId} — ${user.department?.name ?? ''}`.trim(),
        link: `/users/${user._id}`,
      })),
      departments: departments.map((department) => ({
        ...department,
        type: 'DEPARTMENT',
        title: department.name,
        subtitle: department.unit?.name ?? department.code,
        link: `/departments/${department._id}`,
      })),
      units: units.map((unit) => ({
        ...unit,
        type: 'UNIT',
        title: unit.name,
        subtitle: unit.city || unit.code,
        link: `/units/${unit._id}`,
      })),
    },
  });
});

export default { globalSearch };
