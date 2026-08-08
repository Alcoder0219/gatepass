import LeaveType from '../models/LeaveType.js';
import LeaveRequest from '../models/LeaveRequest.js';
import LeaveBalance from '../models/LeaveBalance.js';
import ApiError from '../../../utils/ApiError.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../../utils/ApiResponse.js';
import { recordAudit, diff } from '../../../services/audit.service.js';
import { AUDIT_ACTION } from '../../../constants/index.js';
import { LEAVE_NATURE } from '../constants/index.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const AUDITED_KEYS = [
  'code', 'name', 'type', 'category', 'includeWeeklyOff', 'includeHolidays',
  'description', 'annualQuota', 'allowHalfDay', 'requiresAttachmentAfterDays', 'isActive',
];

const snapshot = (doc, keys) => {
  const plain = doc.toObject();
  return Object.fromEntries(keys.map((key) => [key, plain[key] != null ? String(plain[key]) : null]));
};

/** How many live records point at this leave type. */
const usageOf = async (id) => {
  const [requests, balances] = await Promise.all([
    LeaveRequest.countDocuments({ leaveType: id, isDeleted: false }),
    LeaveBalance.countDocuments({ leaveType: id }),
  ]);
  return { requests, balances };
};

/* ─── GET /leave/types ────────────────────────────────────────────────────── */
export const listLeaveTypes = asyncHandler(async (req, res) => {
  const { page, limit, search, sort, type, category, isActive } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (category) filter.category = category;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ code: rx }, { name: rx }, { description: rx }];
  }

  const result = await LeaveType.paginate(filter, { page, limit, sort, lean: true });

  // `lean: true` drops virtuals, so isPaid is projected explicitly.
  result.docs = result.docs.map((doc) => ({ ...doc, isPaid: doc.type === LEAVE_NATURE.PAID }));

  return sendPaginated(res, result, 'Leave types fetched successfully');
});

/* ─── GET /leave/types/lookup ─────────────────────────────────────────────── */
export const lookupLeaveTypes = asyncHandler(async (_req, res) => {
  const types = await LeaveType.find({ isActive: true })
    .select('code name type category color annualQuota allowHalfDay')
    .sort('code')
    .lean();
  return sendSuccess(res, { data: types, message: 'Leave types fetched successfully' });
});

/* ─── GET /leave/types/:id ────────────────────────────────────────────────── */
export const getLeaveType = asyncHandler(async (req, res) => {
  const leaveType = await LeaveType.findById(req.params.id);
  if (!leaveType) throw ApiError.notFound('Leave type not found');

  const usage = await usageOf(leaveType._id);
  return sendSuccess(res, {
    data: { ...leaveType.toJSON(), usage },
    message: 'Leave type fetched successfully',
  });
});

/* ─── POST /leave/types ───────────────────────────────────────────────────── */
export const createLeaveType = asyncHandler(async (req, res) => {
  const { code, name } = req.body;

  const clash = await LeaveType.findOne({
    $or: [{ code }, { name }],
  }).collation({ locale: 'en', strength: 2 });

  if (clash) {
    const field = clash.code === code ? 'code' : 'name';
    throw ApiError.conflict(
      field === 'code'
        ? `Leave code ${code} is already in use by ${clash.name}.`
        : `A leave type named "${name}" already exists.`,
      [{ field, message: field === 'code' ? 'This code is taken' : 'This name is taken' }]
    );
  }

  const leaveType = await LeaveType.create({
    ...req.body,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_TYPE_CREATE,
    actor: req.user,
    entity: 'LeaveType',
    entityId: leaveType._id,
    entityLabel: leaveType.code,
    description: `Created leave type ${leaveType.name} (${leaveType.code})`,
    req,
  });

  return sendCreated(res, { data: leaveType.toJSON(), message: 'Leave type created successfully' });
});

/* ─── PATCH /leave/types/:id ──────────────────────────────────────────────── */
export const updateLeaveType = asyncHandler(async (req, res) => {
  const leaveType = await LeaveType.findById(req.params.id);
  if (!leaveType) throw ApiError.notFound('Leave type not found');

  const { code, name, type, annualQuota } = req.body;
  const usage = await usageOf(leaveType._id);
  const inUse = usage.requests > 0 || usage.balances > 0;

  // The code is snapshotted onto every leave request. Letting it change once
  // records exist would silently rewrite history that already went out on paper.
  if (code && code !== leaveType.code && inUse) {
    throw ApiError.conflict(
      `The code cannot be changed: ${usage.requests} request(s) and ${usage.balances} balance(s) already reference ${leaveType.code}.`,
      [{ field: 'code', message: 'Locked — this leave type is already in use' }]
    );
  }

  if (code || name) {
    const clash = await LeaveType.findOne({
      _id: { $ne: leaveType._id },
      $or: [...(code ? [{ code }] : []), ...(name ? [{ name }] : [])],
    }).collation({ locale: 'en', strength: 2 });

    if (clash) {
      const field = clash.code === code ? 'code' : 'name';
      throw ApiError.conflict(
        field === 'code' ? `Leave code ${code} is already in use.` : `A leave type named "${name}" already exists.`,
        [{ field, message: 'Already taken' }]
      );
    }
  }

  // Cross-field rule against the STORED value when only one half is supplied.
  const nextType = type ?? leaveType.type;
  const nextQuota = annualQuota ?? leaveType.annualQuota;
  if (nextType === LEAVE_NATURE.PAID && nextQuota <= 0) {
    throw ApiError.unprocessable('Validation failed', [
      { field: 'annualQuota', message: 'A paid leave type must grant at least 0.5 days a year' },
    ]);
  }

  const before = snapshot(leaveType, AUDITED_KEYS);

  Object.assign(leaveType, req.body);
  leaveType.updatedBy = req.user._id;
  await leaveType.save();

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_TYPE_UPDATE,
    actor: req.user,
    entity: 'LeaveType',
    entityId: leaveType._id,
    entityLabel: leaveType.code,
    description: `Updated leave type ${leaveType.name} (${leaveType.code})`,
    changes: diff(before, snapshot(leaveType, AUDITED_KEYS)),
    req,
  });

  return sendSuccess(res, { data: leaveType.toJSON(), message: 'Leave type updated successfully' });
});

/* ─── PATCH /leave/types/:id/status ───────────────────────────────────────── */
export const toggleLeaveTypeStatus = asyncHandler(async (req, res) => {
  const leaveType = await LeaveType.findById(req.params.id);
  if (!leaveType) throw ApiError.notFound('Leave type not found');

  leaveType.isActive = req.body.isActive;
  leaveType.updatedBy = req.user._id;
  await leaveType.save();

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_TYPE_UPDATE,
    actor: req.user,
    entity: 'LeaveType',
    entityId: leaveType._id,
    entityLabel: leaveType.code,
    description: `${leaveType.isActive ? 'Activated' : 'Deactivated'} leave type ${leaveType.name}`,
    req,
  });

  return sendSuccess(res, {
    data: leaveType.toJSON(),
    message: `Leave type ${leaveType.isActive ? 'activated' : 'deactivated'} successfully`,
  });
});

/* ─── DELETE /leave/types/:id ─────────────────────────────────────────────── */
export const deleteLeaveType = asyncHandler(async (req, res) => {
  const leaveType = await LeaveType.findById(req.params.id);
  if (!leaveType) throw ApiError.notFound('Leave type not found');

  const usage = await usageOf(leaveType._id);

  // Referenced types are deactivated, never erased — deleting one would orphan
  // every request and balance that points at it.
  if (usage.requests > 0 || usage.balances > 0) {
    if (!leaveType.isActive) {
      throw ApiError.conflict(
        `${leaveType.name} is already inactive and cannot be erased: ${usage.requests} request(s) and ${usage.balances} balance(s) reference it.`,
        usage
      );
    }

    leaveType.isActive = false;
    leaveType.updatedBy = req.user._id;
    await leaveType.save();

    await recordAudit({
      action: AUDIT_ACTION.LEAVE_TYPE_DELETE,
      actor: req.user,
      entity: 'LeaveType',
      entityId: leaveType._id,
      entityLabel: leaveType.code,
      description: `Deactivated leave type ${leaveType.name} (${leaveType.code}) — in use by ${usage.requests} request(s)`,
      req,
    });

    return sendSuccess(res, {
      data: { deactivated: true, usage },
      message: `${leaveType.name} is in use, so it was deactivated instead of deleted.`,
    });
  }

  await leaveType.deleteOne();

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_TYPE_DELETE,
    actor: req.user,
    entity: 'LeaveType',
    entityId: leaveType._id,
    entityLabel: leaveType.code,
    description: `Deleted leave type ${leaveType.name} (${leaveType.code})`,
    req,
  });

  return sendSuccess(res, { data: { deactivated: false }, message: 'Leave type deleted successfully' });
});

export default {
  listLeaveTypes,
  lookupLeaveTypes,
  getLeaveType,
  createLeaveType,
  updateLeaveType,
  toggleLeaveTypeStatus,
  deleteLeaveType,
};
