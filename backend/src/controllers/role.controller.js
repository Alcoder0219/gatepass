import Role from '../models/Role.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/ApiResponse.js';
import { recordAudit, diff } from '../services/audit.service.js';
import { clearAuthCache } from '../utils/authCache.js';
import { AUDIT_ACTION, PERMISSION_CATALOGUE, DATA_SCOPES } from '../constants/index.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ─── GET /roles/permissions ──────────────────────────────────────────────── */
export const getPermissionCatalogue = asyncHandler(async (_req, res) =>
  // The catalogue IS the payload — the client renders one toggle per entry, so
  // it is returned as a bare array rather than wrapped in another object.
  sendSuccess(res, {
    data: PERMISSION_CATALOGUE,
    message: 'Permission catalogue fetched successfully',
    meta: { dataScopes: DATA_SCOPES },
  })
);

/* ─── GET /roles ──────────────────────────────────────────────────────────── */
export const listRoles = asyncHandler(async (req, res) => {
  const { search, isActive } = req.query;

  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { key: rx }, { description: rx }];
  }

  const [roles, counts] = await Promise.all([
    Role.find(filter).sort({ level: -1, name: 1 }).lean(),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
  ]);

  const countByRole = new Map(counts.map((c) => [String(c._id), c.count]));
  const data = roles.map((role) => ({ ...role, userCount: countByRole.get(String(role._id)) ?? 0 }));

  return sendSuccess(res, { data, message: 'Roles fetched successfully' });
});

/* ─── GET /roles/:id ──────────────────────────────────────────────────────── */
export const getRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id)
    .populate('unitRestrictions', 'name code')
    .populate('departmentRestrictions', 'name code');
  if (!role) throw ApiError.notFound('Role not found');

  const userCount = await User.countDocuments({ role: role._id });

  return sendSuccess(res, {
    data: { ...role.toJSON(), userCount },
    message: 'Role fetched successfully',
  });
});

/* ─── POST /roles ─────────────────────────────────────────────────────────── */
export const createRole = asyncHandler(async (req, res) => {
  const existing = await Role.findOne({ key: req.body.key }).select('_id').lean();
  if (existing) throw ApiError.conflict(`A role with the key ${req.body.key} already exists`);

  const role = await Role.create({ ...req.body, createdBy: req.user._id, updatedBy: req.user._id });

  await recordAudit({
    action: AUDIT_ACTION.ROLE_CREATE,
    actor: req.user,
    entity: 'Role',
    entityId: role._id,
    entityLabel: role.key,
    description: `Created role ${role.name} (${role.key})`,
    req,
  });

  return sendCreated(res, { data: role.toJSON(), message: 'Role created successfully' });
});

/* ─── PATCH /roles/:id ────────────────────────────────────────────────────── */
export const updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw ApiError.notFound('Role not found');

  const payload = { ...req.body };

  // A system role's key is referenced in code (ROLE.SUPER_ADMIN, scope rules) — it cannot move.
  if (role.isSystem && payload.key && payload.key !== role.key) {
    throw ApiError.badRequest('The key of a system role cannot be changed');
  }
  if (role.isSystem) delete payload.key;

  if (payload.key && payload.key !== role.key) {
    const clash = await Role.findOne({ key: payload.key, _id: { $ne: role._id } }).select('_id').lean();
    if (clash) throw ApiError.conflict(`A role with the key ${payload.key} already exists`);
  }

  const before = snapshot(role, Object.keys(payload));
  Object.assign(role, payload);
  role.updatedBy = req.user._id;
  await role.save();
  // Permissions / dataScope / restrictions here change the effective access of
  // every user holding this role — drop all cached auth contexts so the change
  // is reflected on their next request rather than after the TTL.
  clearAuthCache();

  const changes = diff(before, snapshot(role, Object.keys(payload)));

  await recordAudit({
    action: AUDIT_ACTION.ROLE_UPDATE,
    actor: req.user,
    entity: 'Role',
    entityId: role._id,
    entityLabel: role.key,
    description: `Updated role ${role.name} (${role.key})`,
    changes,
    req,
  });

  return sendSuccess(res, { data: role.toJSON(), message: 'Role updated successfully' });
});

/* ─── DELETE /roles/:id ───────────────────────────────────────────────────── */
export const deleteRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw ApiError.notFound('Role not found');

  if (role.isSystem) throw ApiError.conflict('System roles cannot be deleted');

  const userCount = await User.countDocuments({ role: role._id });
  if (userCount) {
    throw ApiError.conflict(
      `This role is still assigned to ${userCount} user${userCount === 1 ? '' : 's'}. Reassign them first.`,
      { userCount }
    );
  }

  await role.deleteOne();

  await recordAudit({
    action: AUDIT_ACTION.ROLE_DELETE,
    actor: req.user,
    entity: 'Role',
    entityId: role._id,
    entityLabel: role.key,
    description: `Deleted role ${role.name} (${role.key})`,
    req,
  });

  return sendSuccess(res, { message: 'Role deleted successfully' });
});

/** Plain, JSON-comparable view of just the keys that were submitted. */
const snapshot = (role, keys) => {
  const plain = role.toObject();
  return Object.fromEntries(
    keys.map((key) => {
      const value = plain[key];
      if (Array.isArray(value)) return [key, value.map(String)];
      return [key, value ?? null];
    })
  );
};

export default { getPermissionCatalogue, listRoles, getRole, createRole, updateRole, deleteRole };
