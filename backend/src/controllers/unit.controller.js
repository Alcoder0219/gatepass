import Unit from '../models/Unit.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/ApiResponse.js';
import { recordAudit, diff } from '../services/audit.service.js';
import { AUDIT_ACTION } from '../constants/index.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const snapshot = (doc, keys) => {
  const plain = doc.toObject();
  return Object.fromEntries(keys.map((key) => [key, plain[key] != null ? String(plain[key]) : null]));
};

/* ─── GET /units ──────────────────────────────────────────────────────────── */
export const listUnits = asyncHandler(async (req, res) => {
  const { page, limit, search, sort, isActive } = req.query;

  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { city: rx }];
  }

  const result = await Unit.paginate(filter, {
    page,
    limit,
    sort,
    populate: [{ path: 'headOfUnit', select: 'name employeeId email' }],
    lean: true,
  });

  return sendPaginated(res, result, 'Units fetched successfully');
});

/* ─── GET /units/lookup ───────────────────────────────────────────────────── */
export const lookupUnits = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }

  const units = await Unit.find(filter).select('name code').sort('name').lean();
  return sendSuccess(res, { data: units, message: 'Units fetched successfully' });
});

/* ─── GET /units/:id ──────────────────────────────────────────────────────── */
export const getUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.findById(req.params.id).populate('headOfUnit', 'name employeeId email');
  if (!unit) throw ApiError.notFound('Unit not found');

  const [userCount, departmentCount] = await Promise.all([
    User.countDocuments({ unit: unit._id, status: 'ACTIVE' }),
    Department.countDocuments({ unit: unit._id, isActive: true }),
  ]);

  return sendSuccess(res, {
    data: { ...unit.toJSON(), userCount, departmentCount },
    message: 'Unit fetched successfully',
  });
});

/* ─── POST /units ─────────────────────────────────────────────────────────── */
export const createUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.create({ ...req.body, createdBy: req.user._id, updatedBy: req.user._id });

  await recordAudit({
    action: AUDIT_ACTION.UNIT_UPSERT,
    actor: req.user,
    entity: 'Unit',
    entityId: unit._id,
    entityLabel: unit.code,
    description: `Created unit ${unit.name} (${unit.code})`,
    req,
    unit: unit._id,
  });

  return sendCreated(res, { data: unit.toJSON(), message: 'Unit created successfully' });
});

/* ─── PATCH /units/:id ────────────────────────────────────────────────────── */
export const updateUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.findById(req.params.id);
  if (!unit) throw ApiError.notFound('Unit not found');

  const keys = Object.keys(req.body);
  const before = snapshot(unit, keys);

  Object.assign(unit, req.body);
  unit.updatedBy = req.user._id;
  await unit.save();

  await recordAudit({
    action: AUDIT_ACTION.UNIT_UPSERT,
    actor: req.user,
    entity: 'Unit',
    entityId: unit._id,
    entityLabel: unit.code,
    description: `Updated unit ${unit.name} (${unit.code})`,
    changes: diff(before, snapshot(unit, keys)),
    req,
    unit: unit._id,
  });

  return sendSuccess(res, { data: unit.toJSON(), message: 'Unit updated successfully' });
});

/* ─── DELETE /units/:id ───────────────────────────────────────────────────── */
export const deleteUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.findById(req.params.id);
  if (!unit) throw ApiError.notFound('Unit not found');

  const userCount = await User.countDocuments({ unit: unit._id, status: { $ne: 'INACTIVE' } });
  if (userCount) {
    throw ApiError.conflict(
      `This unit still has ${userCount} active user${userCount === 1 ? '' : 's'}. Move them first.`,
      { userCount }
    );
  }

  // Soft delete — gate passes and audit logs keep pointing at the unit.
  unit.isActive = false;
  unit.updatedBy = req.user._id;
  await unit.save();

  await recordAudit({
    action: AUDIT_ACTION.UNIT_UPSERT,
    actor: req.user,
    entity: 'Unit',
    entityId: unit._id,
    entityLabel: unit.code,
    description: `Deactivated unit ${unit.name} (${unit.code})`,
    req,
    unit: unit._id,
  });

  return sendSuccess(res, { message: 'Unit deactivated successfully' });
});

export default { listUnits, lookupUnits, getUnit, createUnit, updateUnit, deleteUnit };
