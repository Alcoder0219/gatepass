import crypto from 'node:crypto';
import env from '../config/env.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/ApiResponse.js';
import { recordAudit, diff } from '../services/audit.service.js';
import { sendTemplate } from '../services/email.service.js';
import { buildUserScope } from '../services/scope.service.js';
import { toPublicUrl } from '../middlewares/upload.middleware.js';
import { parseCsv, validateRows, importUsers, templateCsv } from '../services/userImport.service.js';
import { invalidateUser } from '../utils/authCache.js';
import { AUDIT_ACTION, ROLE } from '../constants/index.js';

const POPULATE = [
  { path: 'role', select: 'key name color level dataScope permissions' },
  { path: 'department', select: 'name code' },
  { path: 'unit', select: 'name code' },
  { path: 'reportingManager', select: 'name employeeId email' },
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Temp password for admin-created accounts: satisfies the 8-char minimum. */
const generatePassword = () => `Gp@${crypto.randomBytes(6).toString('base64url')}9`;

/** Intersects the caller's data scope with the requested filters. */
const scopedFilter = async (user, filter) => {
  const scope = await buildUserScope(user);
  if (!Object.keys(scope).length) return filter;
  return Object.keys(filter).length ? { $and: [scope, filter] } : scope;
};

/* ─── GET /users ──────────────────────────────────────────────────────────── */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, search, role, department, unit, status, sort } = req.query;

  const filter = {};
  if (role) filter.role = role;
  if (department) filter.department = department;
  if (unit) filter.unit = unit;
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { employeeId: rx }, { email: rx }];
  }

  const result = await User.paginate(await scopedFilter(req.user, filter), {
    page,
    limit,
    sort,
    populate: POPULATE,
    lean: true,
    leanWithId: false,
  });

  return sendPaginated(res, result, 'Users fetched successfully');
});

/* ─── GET /users/managers ─────────────────────────────────────────────────── */
export const listManagers = asyncHandler(async (req, res) => {
  const { search, unit, department } = req.query;

  // A manager is anyone holding a role above level 0, or anyone who already has reportees.
  const [managerRoleIds, existingManagerIds] = await Promise.all([
    Role.find({ level: { $gt: 0 }, isActive: true }).distinct('_id'),
    User.distinct('reportingManager', { reportingManager: { $ne: null } }),
  ]);

  const filter = {
    status: 'ACTIVE',
    $or: [{ role: { $in: managerRoleIds } }, { _id: { $in: existingManagerIds.filter(Boolean) } }],
  };
  if (unit) filter.unit = unit;
  if (department) filter.department = department;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$and = [{ $or: [{ name: rx }, { employeeId: rx }, { email: rx }] }];
  }

  const managers = await User.find(filter)
    .select('name employeeId email designation role department unit')
    .populate('role', 'key name level')
    .populate('department', 'name code')
    .populate('unit', 'name code')
    .sort('name')
    .lean();

  return sendSuccess(res, { data: managers, message: 'Reporting managers fetched successfully' });
});

/* ─── GET /users/lookup ───────────────────────────────────────────────────── */
export const lookupUsers = asyncHandler(async (req, res) => {
  const { search, department, unit, limit } = req.query;

  const filter = { status: 'ACTIVE' };
  if (department) filter.department = department;
  if (unit) filter.unit = unit;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { employeeId: rx }, { email: rx }];
  }

  const users = await User.find(await scopedFilter(req.user, filter))
    .select('name employeeId email designation')
    .sort('name')
    .limit(limit)
    .lean();

  return sendSuccess(res, { data: users, message: 'Users fetched successfully' });
});

/* ─── GET /users/:id ──────────────────────────────────────────────────────── */
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate(POPULATE);
  if (!user) throw ApiError.notFound('User not found');

  return sendSuccess(res, {
    data: { user: user.toJSON(), permissions: user.effectivePermissions() },
    message: 'User fetched successfully',
  });
});

/* ─── POST /users ─────────────────────────────────────────────────────────── */
export const createUser = asyncHandler(async (req, res) => {
  const payload = { ...req.body };

  const existing = await User.findOne({
    $or: [{ email: payload.email }, { employeeId: payload.employeeId.toUpperCase() }],
  })
    .select('email employeeId')
    .lean();

  if (existing) {
    const field = existing.email === payload.email ? 'email' : 'employeeId';
    throw ApiError.conflict(`A user with this ${field} already exists`, [
      { field, message: 'Must be unique' },
    ]);
  }

  const role = await Role.findById(payload.role);
  if (!role || !role.isActive) throw ApiError.badRequest('The selected role does not exist');

  // No password supplied → generate one and email it as a temporary credential.
  const generated = payload.password ? null : generatePassword();

  const user = await User.create({
    ...payload,
    password: payload.password ?? generated,
    profileImage: req.file ? toPublicUrl(req.file, 'avatars') : '',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  // Best-effort: a slow/unreachable SMTP server must not hold the response open.
  void sendTemplate('welcome', {
    to: user.email,
    name: user.name,
    email: user.email,
    password: generated ?? '(the password chosen by your administrator)',
    loginUrl: `${env.clientUrl}/login`,
  }).catch(() => {});

  await recordAudit({
    action: AUDIT_ACTION.USER_CREATE,
    actor: req.user,
    entity: 'User',
    entityId: user._id,
    entityLabel: user.employeeId,
    description: `Created user ${user.name} (${user.employeeId})`,
    req,
    unit: user.unit,
  });

  await user.populate(POPULATE);

  return sendCreated(res, { data: user.toJSON(), message: 'User created successfully' });
});

/* ─── Bulk import ─────────────────────────────────────────────────────────────
 * Two endpoints, one code path. The UI calls this first with dryRun=true to show
 * the administrator exactly what will happen, then again to commit — so the
 * validation that gates the write is the same validation they were shown, rather
 * than a preview that might disagree with it.
 * ────────────────────────────────────────────────────────────────────────── */

export const downloadImportTemplate = asyncHandler(async (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="gatepass-users-template.csv"');
  return res.send(templateCsv());
});

export const bulkImportUsers = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Attach a CSV file in the `file` field.');

  const dryRun = req.body?.dryRun === 'true' || req.body?.dryRun === true;
  const skipInvalid = req.body?.skipInvalid === 'true' || req.body?.skipInvalid === true;

  const records = parseCsv(req.file.buffer);
  if (records.length > 500) {
    throw ApiError.badRequest(
      `That file has ${records.length} rows. Import at most 500 at a time.`
    );
  }

  const results = await validateRows(records);
  const summary = await importUsers(results, { dryRun, skipInvalid, actor: req.user });

  if (summary.refused) {
    throw ApiError.badRequest(
      `${summary.invalid} of ${summary.total} rows have errors, so nothing was imported. ` +
        'Fix the file, or re-run allowing invalid rows to be skipped.',
      summary.rows.filter((row) => !row.valid).flatMap((row) =>
        row.errors.map((error) => ({ field: `row ${row.line}: ${error.field}`, message: error.message }))
      )
    );
  }

  if (dryRun) {
    return sendSuccess(res, {
      data: summary,
      message: `${summary.valid} of ${summary.total} rows are ready to import`,
    });
  }

  await recordAudit({
    action: AUDIT_ACTION.USER_CREATE,
    actor: req.user,
    entity: 'User',
    entityLabel: 'BULK_IMPORT',
    description: `Bulk imported ${summary.created} user(s) from CSV`,
    req,
  });

  /* Welcome emails are best-effort and deliberately not awaited as a group with
   * the response: a slow SMTP server should not hold up (or fail) an import that
   * has already been written. The generated passwords are also returned to the
   * administrator, which is the only reliable channel when SMTP is unconfigured. */
  summary.credentials
    .filter((credential) => credential.temporaryPassword)
    .forEach((credential) => {
      void sendTemplate('welcome', {
        to: credential.email,
        name: credential.name,
        email: credential.email,
        password: credential.temporaryPassword,
        loginUrl: `${env.clientUrl}/login`,
      }).catch(() => {
        /* Logged by the mailer; an undeliverable welcome must not fail the import. */
      });
    });

  return sendCreated(res, {
    data: summary,
    message: `Imported ${summary.created} user(s)`,
  });
});

/* ─── PATCH /users/:id ────────────────────────────────────────────────────── */
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  // The password is never settable here — use the dedicated reset endpoint.
  const { password: _ignored, ...payload } = req.body;
  if (req.file) payload.profileImage = toPublicUrl(req.file, 'avatars');

  if (payload.role) {
    const role = await Role.findById(payload.role);
    if (!role || !role.isActive) throw ApiError.badRequest('The selected role does not exist');
  }
  if (payload.reportingManager && String(payload.reportingManager) === String(user._id)) {
    throw ApiError.badRequest('A user cannot report to themselves');
  }

  const before = user.toObject();

  Object.entries(payload).forEach(([key, value]) => {
    if (key === 'preferences') {
      Object.entries(value ?? {}).forEach(([pk, pv]) => {
        if (pv !== undefined) user.preferences[pk] = pv;
      });
      return;
    }
    user[key] = value;
  });
  user.updatedBy = req.user._id;

  await user.save();
  invalidateUser(user._id); // role/dept/unit/manager/status may have changed

  const after = user.toObject();
  const changes = diff(
    Object.fromEntries(Object.keys(payload).map((k) => [k, normalise(before[k])])),
    Object.fromEntries(Object.keys(payload).map((k) => [k, normalise(after[k])]))
  );

  await recordAudit({
    action: AUDIT_ACTION.USER_UPDATE,
    actor: req.user,
    entity: 'User',
    entityId: user._id,
    entityLabel: user.employeeId,
    description: `Updated user ${user.name} (${user.employeeId})`,
    changes,
    req,
    unit: user.unit,
  });

  await user.populate(POPULATE);

  return sendSuccess(res, { data: user.toJSON(), message: 'User updated successfully' });
});

/** ObjectIds and dates must be stringified before they can be JSON-diffed. */
const normalise = (value) => {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(normalise);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof value.toHexString === 'function') return value.toString();
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v)]));
  }
  return value;
};

/* ─── PATCH /users/:id/status ─────────────────────────────────────────────── */
export const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const user = await User.findById(req.params.id).select('+sessions').populate('role', 'key');
  if (!user) throw ApiError.notFound('User not found');

  if (String(user._id) === String(req.user._id) && status !== 'ACTIVE') {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  if (user.role?.key === ROLE.SUPER_ADMIN && status !== 'ACTIVE') {
    await assertNotLastSuperAdmin(user);
  }

  const from = user.status;
  user.status = status;
  user.updatedBy = req.user._id;
  if (status !== 'ACTIVE') user.sessions = []; // a suspended user must lose their sessions immediately
  await user.save();
  invalidateUser(user._id); // a status change must take effect immediately, not after the TTL

  await recordAudit({
    action: AUDIT_ACTION.USER_UPDATE,
    actor: req.user,
    entity: 'User',
    entityId: user._id,
    entityLabel: user.employeeId,
    description: `Changed status of ${user.name} from ${from} to ${status}`,
    changes: { status: { from, to: status } },
    req,
    unit: user.unit,
  });

  return sendSuccess(res, { data: user.toJSON(), message: `User is now ${status.toLowerCase()}` });
});

/* ─── PATCH /users/:id/reset-password ─────────────────────────────────────── */
export const resetUserPassword = asyncHandler(async (req, res) => {
  const { password, notify } = req.body;

  const user = await User.findById(req.params.id).select('+password +sessions');
  if (!user) throw ApiError.notFound('User not found');

  user.password = password;
  user.sessions = []; // the old credential is gone — drop every device
  user.updatedBy = req.user._id;
  await user.save();
  invalidateUser(user._id);

  if (notify) {
    // Fire-and-forget — SMTP latency must not hold the response open.
    void sendTemplate('welcome', {
      to: user.email,
      name: user.name,
      email: user.email,
      password,
      loginUrl: `${env.clientUrl}/login`,
    }).catch(() => {});
  }

  await recordAudit({
    action: AUDIT_ACTION.PASSWORD_RESET,
    actor: req.user,
    entity: 'User',
    entityId: user._id,
    entityLabel: user.employeeId,
    description: `Reset the password of ${user.name} (${user.employeeId})`,
    req,
    unit: user.unit,
  });

  return sendSuccess(res, { message: 'Password reset successfully' });
});

/* ─── DELETE /users/:id ───────────────────────────────────────────────────── */
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('+sessions').populate('role', 'key');
  if (!user) throw ApiError.notFound('User not found');

  if (String(user._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  if (user.role?.key === ROLE.SUPER_ADMIN) await assertNotLastSuperAdmin(user);

  // Soft delete — audit trails and gate pass history must keep referencing the user.
  user.status = 'INACTIVE';
  user.sessions = [];
  user.updatedBy = req.user._id;
  await user.save();
  invalidateUser(user._id);

  await recordAudit({
    action: AUDIT_ACTION.USER_DELETE,
    actor: req.user,
    entity: 'User',
    entityId: user._id,
    entityLabel: user.employeeId,
    description: `Deactivated user ${user.name} (${user.employeeId})`,
    req,
    unit: user.unit,
  });

  return sendSuccess(res, { message: 'User deactivated successfully' });
});

/* ─── GET /users/:id/reportees ────────────────────────────────────────────── */
export const listReportees = asyncHandler(async (req, res) => {
  const manager = await User.findById(req.params.id).select('_id name');
  if (!manager) throw ApiError.notFound('User not found');

  const reportees = await User.find({ reportingManager: manager._id })
    .select('name employeeId email designation status role department unit')
    .populate('role', 'key name color')
    .populate('department', 'name code')
    .populate('unit', 'name code')
    .sort('name')
    .lean();

  return sendSuccess(res, { data: reportees, message: 'Reportees fetched successfully' });
});

/** The system must never be left without an active Super Admin. */
const assertNotLastSuperAdmin = async (user) => {
  const superAdminRole = await Role.findOne({ key: ROLE.SUPER_ADMIN }).select('_id').lean();
  if (!superAdminRole) return;

  const remaining = await User.countDocuments({
    role: superAdminRole._id,
    status: 'ACTIVE',
    _id: { $ne: user._id },
  });

  if (!remaining) throw ApiError.conflict('The last active Super Admin cannot be removed');
};

export default {
  listUsers,
  listManagers,
  lookupUsers,
  getUser,
  createUser,
  bulkImportUsers,
  downloadImportTemplate,
  updateUser,
  updateUserStatus,
  resetUserPassword,
  deleteUser,
  listReportees,
};
