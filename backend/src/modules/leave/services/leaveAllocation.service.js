import User from '../../../models/User.js';
import ApiError from '../../../utils/ApiError.js';
import LeaveType from '../models/LeaveType.js';
import LeaveBalance from '../models/LeaveBalance.js';
import { buildUserScope } from '../../../services/scope.service.js';
import { LEAVE_NATURE } from '../constants/index.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Entitled = everything granted; available = what is left to take. */
export const derive = (row) => {
  const entitled =
    (row.opening ?? 0) + (row.accrued ?? 0) + (row.carriedForward ?? 0) + (row.adjusted ?? 0);
  const used = row.used ?? 0;
  const pending = row.pending ?? 0;
  return { entitled, used, pending, available: Math.max(0, entitled - used - pending) };
};

/**
 * The allocation register: one row per EMPLOYEE, each carrying that employee's
 * allocations for the selected leave year.
 *
 * Pagination runs over employees rather than balance rows, because that is the
 * unit the screen actually lists — paginating raw balances would split one
 * person's leave types across two pages.
 *
 * Employee visibility reuses the shared `buildUserScope` unchanged, so an
 * employee sees only themselves and an HOD only their reportees.
 */
export const listAllocations = async (user, query) => {
  const { page, limit, year, unit, department, employee, search, sort, allocatedOnly } = query;

  const scope = await buildUserScope(user);
  const filter = { ...scope, status: 'ACTIVE' };

  if (unit) filter.unit = unit;
  if (department) filter.department = department;
  if (employee) filter._id = employee;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$and = [...(filter.$and ?? []), { $or: [{ name: rx }, { employeeId: rx }, { email: rx }] }];
  }

  // When the caller only wants people who already hold an allocation, resolve
  // that set first and intersect — otherwise every active employee is listed.
  if (allocatedOnly && year) {
    const allocated = await LeaveBalance.distinct('employee', { leaveYear: year });
    filter.$and = [...(filter.$and ?? []), { _id: { $in: allocated } }];
  }

  const total = await User.countDocuments(filter);
  const employees = await User.find(filter)
    .select('name employeeId email designation department unit')
    .populate('department', 'name code')
    .populate('unit', 'name code')
    .sort(sort || 'name')
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const balances = employees.length
    ? await LeaveBalance.find({
        employee: { $in: employees.map((e) => e._id) },
        ...(year ? { leaveYear: year } : {}),
      })
        .populate('leaveType', 'code name color type annualQuota isActive')
        .lean()
    : [];

  const byEmployee = new Map();
  for (const row of balances) {
    if (!row.leaveType) continue;
    const key = String(row.employee);
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key).push({
      _id: String(row._id),
      leaveType: {
        _id: String(row.leaveType._id),
        code: row.leaveType.code,
        name: row.leaveType.name,
        color: row.leaveType.color,
        type: row.leaveType.type,
      },
      leaveYear: row.leaveYear,
      opening: row.opening ?? 0,
      accrued: row.accrued ?? 0,
      carriedForward: row.carriedForward ?? 0,
      adjusted: row.adjusted ?? 0,
      remarks: row.remarks ?? '',
      allocatedAt: row.allocatedAt,
      ...derive(row),
    });
  }

  const items = employees.map((person) => {
    const allocations = (byEmployee.get(String(person._id)) ?? []).sort((a, b) =>
      a.leaveType.code.localeCompare(b.leaveType.code)
    );
    return {
      employee: {
        _id: String(person._id),
        name: person.name,
        employeeId: person.employeeId,
        email: person.email,
        designation: person.designation ?? '',
      },
      department: person.department ? { _id: String(person.department._id), name: person.department.name } : null,
      unit: person.unit ? { _id: String(person.unit._id), name: person.unit.name } : null,
      leaveYear: year ?? null,
      allocations,
      totals: allocations.reduce(
        (acc, row) => ({
          entitled: acc.entitled + row.entitled,
          used: acc.used + row.used,
          available: acc.available + row.available,
        }),
        { entitled: 0, used: 0, available: 0 }
      ),
    };
  });

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
};

/**
 * Creates or revises allocations for a set of employees across several leave
 * types at once.
 *
 * Business rules enforced here:
 *   1. The employee must exist and be ACTIVE.
 *   2. The leave type must exist and be active.
 *   3. UNPAID types carry no entitlement, so they cannot be allocated.
 *   4. An existing row is only overwritten when `overwrite` is set.
 *   5. The new entitlement can never fall below what is already used + pending —
 *      that would hand the employee a negative balance retroactively.
 */
export const allocate = async (actor, payload) => {
  const { leaveYear, employees, allocations, remarks, overwrite } = payload;

  const [people, types] = await Promise.all([
    User.find({ _id: { $in: employees } }).select('name employeeId status').lean(),
    LeaveType.find({ _id: { $in: allocations.map((a) => a.leaveType) } }).lean(),
  ]);

  const peopleById = new Map(people.map((p) => [String(p._id), p]));
  const typesById = new Map(types.map((t) => [String(t._id), t]));

  for (const id of employees) {
    const person = peopleById.get(id);
    if (!person) throw ApiError.badRequest(`Employee ${id} was not found`);
    if (person.status !== 'ACTIVE') {
      throw ApiError.badRequest(`${person.name} is ${person.status.toLowerCase()} and cannot be allocated leave.`);
    }
  }

  for (const line of allocations) {
    const type = typesById.get(line.leaveType);
    if (!type) throw ApiError.badRequest(`Leave type ${line.leaveType} was not found`);
    if (!type.isActive) {
      throw ApiError.badRequest(`${type.name} is inactive and cannot be allocated.`);
    }
    if (type.type === LEAVE_NATURE.UNPAID) {
      throw ApiError.badRequest(
        `${type.name} is unpaid — it has no entitlement to allocate.`,
        [{ field: 'allocations', message: `${type.code} is an unpaid leave type` }]
      );
    }
  }

  const existing = await LeaveBalance.find({
    employee: { $in: employees },
    leaveType: { $in: allocations.map((a) => a.leaveType) },
    leaveYear,
  }).lean();

  const existingByKey = new Map(
    existing.map((row) => [`${row.employee}:${row.leaveType}`, row])
  );

  // Refuse the whole submission before writing anything, so a partial batch can
  // never land — there is no transaction to roll one back on standalone mongo.
  if (!overwrite) {
    const clashes = [];
    for (const id of employees) {
      for (const line of allocations) {
        const found = existingByKey.get(`${id}:${line.leaveType}`);
        if (found) clashes.push(`${peopleById.get(id).name} · ${typesById.get(line.leaveType).code}`);
      }
    }
    if (clashes.length) {
      throw ApiError.conflict(
        `${clashes.length} allocation(s) already exist for ${leaveYear}. Tick "Overwrite existing" to revise them.`,
        { clashes: clashes.slice(0, 10), total: clashes.length }
      );
    }
  }

  const shortfalls = [];
  const operations = [];
  const now = new Date();

  for (const id of employees) {
    for (const line of allocations) {
      const found = existingByKey.get(`${id}:${line.leaveType}`);
      const used = found?.used ?? 0;
      const pending = found?.pending ?? 0;
      const entitled = line.opening + line.accrued + line.carriedForward + line.adjusted;

      if (entitled < used + pending) {
        shortfalls.push(
          `${peopleById.get(id).name} · ${typesById.get(line.leaveType).code}: ${entitled} allocated but ${used + pending} already used or pending`
        );
        continue;
      }

      operations.push({
        updateOne: {
          filter: { employee: id, leaveType: line.leaveType, leaveYear },
          update: {
            $set: {
              opening: line.opening,
              accrued: line.accrued,
              carriedForward: line.carriedForward,
              adjusted: line.adjusted,
              remarks,
              allocatedBy: actor._id,
              allocatedAt: now,
              updatedBy: actor._id,
            },
            $setOnInsert: { used: 0, pending: 0 },
          },
          upsert: true,
        },
      });
    }
  }

  if (shortfalls.length) {
    throw ApiError.unprocessable(
      'Some allocations are below what has already been taken.',
      shortfalls.slice(0, 10).map((message) => ({ field: 'allocations', message }))
    );
  }

  const result = await LeaveBalance.bulkWrite(operations, { ordered: false });

  return {
    employees: employees.length,
    leaveTypes: allocations.length,
    created: result.upsertedCount ?? 0,
    updated: result.modifiedCount ?? 0,
  };
};

export default { listAllocations, allocate, derive };
