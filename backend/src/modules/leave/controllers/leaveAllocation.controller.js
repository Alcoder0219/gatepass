import ApiError from '../../../utils/ApiError.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../../../utils/ApiResponse.js';
import { recordAudit, diff } from '../../../services/audit.service.js';
import { AUDIT_ACTION } from '../../../constants/index.js';
import LeaveBalance from '../models/LeaveBalance.js';
import { listAllocations, allocate, derive } from '../services/leaveAllocation.service.js';
import { currentLeaveYear } from '../services/leaveDashboard.service.js';

const AUDITED_KEYS = ['opening', 'accrued', 'carriedForward', 'adjusted', 'remarks'];

const snapshot = (doc) =>
  Object.fromEntries(AUDITED_KEYS.map((key) => [key, doc[key] != null ? String(doc[key]) : null]));

/* ─── GET /leave/allocations ──────────────────────────────────────────────── */
export const list = asyncHandler(async (req, res) => {
  const year = req.query.year ?? currentLeaveYear();
  const result = await listAllocations(req.user, { ...req.query, year });

  return sendSuccess(res, {
    data: result.items,
    meta: result.meta,
    message: 'Leave allocations fetched successfully',
  });
});

/* ─── GET /leave/allocations/years ────────────────────────────────────────── */
export const listYears = asyncHandler(async (_req, res) => {
  const stored = await LeaveBalance.distinct('leaveYear');
  const current = currentLeaveYear();

  // Always offer the current year and the next one, even before anything is
  // allocated — otherwise the very first allocation has no year to pick.
  const [start] = current.split('-').map(Number);
  const years = [...new Set([...stored, current, `${start + 1}-${start + 2}`])].sort().reverse();

  return sendSuccess(res, { data: { years, current }, message: 'Leave years fetched successfully' });
});

/* ─── POST /leave/allocations ─────────────────────────────────────────────── */
export const create = asyncHandler(async (req, res) => {
  const summary = await allocate(req.user, req.body);

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_ALLOCATION_CREATE,
    actor: req.user,
    entity: 'LeaveBalance',
    entityLabel: req.body.leaveYear,
    description:
      `Allocated ${summary.leaveTypes} leave type(s) to ${summary.employees} employee(s) for ${req.body.leaveYear} ` +
      `(${summary.created} created, ${summary.updated} revised)`,
    req,
  });

  return sendCreated(res, { data: summary, message: 'Leave allocated successfully' });
});

/* ─── PATCH /leave/allocations/:id ────────────────────────────────────────── */
export const update = asyncHandler(async (req, res) => {
  const balance = await LeaveBalance.findById(req.params.id).populate('leaveType', 'code name');
  if (!balance) throw ApiError.notFound('Allocation not found');

  const before = snapshot(balance.toObject());

  Object.assign(balance, req.body);

  // Same floor as the bulk path: an allocation may never drop below what the
  // employee has already taken or has awaiting approval.
  const { entitled, used, pending } = derive(balance.toObject());
  if (entitled < used + pending) {
    throw ApiError.unprocessable('Validation failed', [
      {
        field: 'accrued',
        message: `${entitled} day(s) allocated but ${used + pending} already used or pending`,
      },
    ]);
  }

  balance.allocatedBy = req.user._id;
  balance.allocatedAt = new Date();
  balance.updatedBy = req.user._id;
  await balance.save();

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_ALLOCATION_UPDATE,
    actor: req.user,
    entity: 'LeaveBalance',
    entityId: balance._id,
    entityLabel: `${balance.leaveType?.code ?? ''} ${balance.leaveYear}`,
    description: `Revised ${balance.leaveType?.name ?? 'leave'} allocation for ${balance.leaveYear}`,
    changes: diff(before, snapshot(balance.toObject())),
    req,
  });

  return sendSuccess(res, {
    data: { ...balance.toObject(), ...derive(balance.toObject()) },
    message: 'Allocation updated successfully',
  });
});

/* ─── DELETE /leave/allocations/:id ───────────────────────────────────────── */
export const remove = asyncHandler(async (req, res) => {
  const balance = await LeaveBalance.findById(req.params.id).populate('leaveType', 'code name');
  if (!balance) throw ApiError.notFound('Allocation not found');

  // Erasing an allocation that has already been drawn against would strand the
  // approved requests that consumed it.
  if ((balance.used ?? 0) > 0 || (balance.pending ?? 0) > 0) {
    throw ApiError.conflict(
      `This allocation cannot be removed: ${balance.used} day(s) used and ${balance.pending} pending. Revise the days instead.`,
      { used: balance.used, pending: balance.pending }
    );
  }

  await balance.deleteOne();

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_ALLOCATION_DELETE,
    actor: req.user,
    entity: 'LeaveBalance',
    entityId: balance._id,
    entityLabel: `${balance.leaveType?.code ?? ''} ${balance.leaveYear}`,
    description: `Removed ${balance.leaveType?.name ?? 'leave'} allocation for ${balance.leaveYear}`,
    req,
  });

  return sendSuccess(res, { message: 'Allocation removed successfully' });
});

export default { list, listYears, create, update, remove };
