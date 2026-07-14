import Department from '../models/Department.js';
import Unit from '../models/Unit.js';
import User from '../models/User.js';
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

/* ─── GET /departments ────────────────────────────────────────────────────── */
export const listDepartments = asyncHandler(async (req, res) => {
  const { page, limit, search, sort, isActive, unit } = req.query;

  const filter = {};
  if (unit) filter.unit = unit;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }

  const result = await Department.paginate(filter, {
    page,
    limit,
    sort,
    populate: [
      { path: 'unit', select: 'name code' },
      { path: 'hod', select: 'name employeeId email' },
    ],
    lean: true,
  });

  return sendPaginated(res, result, 'Departments fetched successfully');
});

/* ─── GET /departments/lookup ─────────────────────────────────────────────── */
export const lookupDepartments = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.unit) filter.unit = req.query.unit;
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }

  const departments = await Department.find(filter).select('name code unit').sort('name').lean();
  return sendSuccess(res, { data: departments, message: 'Departments fetched successfully' });
});

/* ─── GET /departments/:id ────────────────────────────────────────────────── */
export const getDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id)
    .populate('unit', 'name code')
    .populate('hod', 'name employeeId email');
  if (!department) throw ApiError.notFound('Department not found');

  const userCount = await User.countDocuments({ department: department._id, status: 'ACTIVE' });

  return sendSuccess(res, {
    data: { ...department.toJSON(), userCount },
    message: 'Department fetched successfully',
  });
});

/* ─── POST /departments ───────────────────────────────────────────────────── */
export const createDepartment = asyncHandler(async (req, res) => {
  const unit = await Unit.findById(req.body.unit).select('_id isActive').lean();
  if (!unit) throw ApiError.badRequest('The selected unit does not exist');

  const department = await Department.create({
    ...req.body,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await recordAudit({
    action: AUDIT_ACTION.DEPARTMENT_UPSERT,
    actor: req.user,
    entity: 'Department',
    entityId: department._id,
    entityLabel: department.code,
    description: `Created department ${department.name} (${department.code})`,
    req,
    unit: department.unit,
  });

  await department.populate([{ path: 'unit', select: 'name code' }]);

  return sendCreated(res, { data: department.toJSON(), message: 'Department created successfully' });
});

/* ─── PATCH /departments/:id ──────────────────────────────────────────────── */
export const updateDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) throw ApiError.notFound('Department not found');

  if (req.body.unit) {
    const unit = await Unit.findById(req.body.unit).select('_id').lean();
    if (!unit) throw ApiError.badRequest('The selected unit does not exist');
  }

  const keys = Object.keys(req.body);
  const before = snapshot(department, keys);

  Object.assign(department, req.body);
  department.updatedBy = req.user._id;
  await department.save();

  await recordAudit({
    action: AUDIT_ACTION.DEPARTMENT_UPSERT,
    actor: req.user,
    entity: 'Department',
    entityId: department._id,
    entityLabel: department.code,
    description: `Updated department ${department.name} (${department.code})`,
    changes: diff(before, snapshot(department, keys)),
    req,
    unit: department.unit,
  });

  await department.populate([{ path: 'unit', select: 'name code' }]);

  return sendSuccess(res, { data: department.toJSON(), message: 'Department updated successfully' });
});

/* ─── DELETE /departments/:id ─────────────────────────────────────────────── */
export const deleteDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) throw ApiError.notFound('Department not found');

  const userCount = await User.countDocuments({
    department: department._id,
    status: { $ne: 'INACTIVE' },
  });
  if (userCount) {
    throw ApiError.conflict(
      `This department still has ${userCount} active user${userCount === 1 ? '' : 's'}. Move them first.`,
      { userCount }
    );
  }

  department.isActive = false;
  department.updatedBy = req.user._id;
  await department.save();

  await recordAudit({
    action: AUDIT_ACTION.DEPARTMENT_UPSERT,
    actor: req.user,
    entity: 'Department',
    entityId: department._id,
    entityLabel: department.code,
    description: `Deactivated department ${department.name} (${department.code})`,
    req,
    unit: department.unit,
  });

  return sendSuccess(res, { message: 'Department deactivated successfully' });
});

export default {
  listDepartments,
  lookupDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
