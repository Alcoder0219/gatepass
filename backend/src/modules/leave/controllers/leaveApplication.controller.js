import ApiError from '../../../utils/ApiError.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../../utils/ApiResponse.js';
import { hasPermission } from '../../../middlewares/rbac.middleware.js';
import { PERMISSION } from '../../../constants/index.js';
import { dateFilter } from '../../../utils/dates.js';

import LeaveRequest from '../models/LeaveRequest.js';
import { buildLeaveScope } from '../services/leaveScope.service.js';
import {
  getPrefill,
  previewApplication,
  applyForLeave,
  applyBulk,
} from '../services/leaveApplication.service.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reading someone else's prefill or preview is only for the bulk-apply flow,
 * so it is gated on that permission rather than on plain apply.
 */
const assertMayTarget = (user, employeeId) => {
  if (!employeeId || String(employeeId) === String(user._id)) return;
  if (!hasPermission(user, PERMISSION.LEAVE_APPLY_BULK)) {
    throw ApiError.forbidden('You may only apply for leave for yourself.');
  }
};

/* ─── GET /leave/requests/prefill ─────────────────────────────────────────── */
export const prefill = asyncHandler(async (req, res) => {
  assertMayTarget(req.user, req.query.employee);
  const data = await getPrefill(req.user, req.query.employee ?? null);
  return sendSuccess(res, { data, message: 'Apply form loaded' });
});

/* ─── POST /leave/requests/preview ────────────────────────────────────────── */
export const preview = asyncHandler(async (req, res) => {
  const { employee, ...payload } = req.body;
  assertMayTarget(req.user, employee);
  const data = await previewApplication(req.user, payload, employee ?? null);
  return sendSuccess(res, { data, message: 'Leave duration calculated' });
});

/* ─── POST /leave/requests ────────────────────────────────────────────────── */
export const apply = asyncHandler(async (req, res) => {
  const request = await applyForLeave(req.user, req.body, { req });
  return sendCreated(res, { data: request.toJSON(), message: 'Leave applied successfully' });
});

/* ─── POST /leave/requests/bulk ───────────────────────────────────────────── */
export const bulkApply = asyncHandler(async (req, res) => {
  const summary = await applyBulk(req.user, req.body, { req });

  // A batch where nothing landed is a failure, not a success with notes.
  if (summary.applied.length === 0) {
    throw ApiError.unprocessable(
      'No leave could be applied.',
      summary.failed.map((row) => ({ field: row.employeeName, message: row.reason }))
    );
  }

  return sendCreated(res, {
    data: summary,
    message:
      summary.failed.length === 0
        ? `Leave applied for ${summary.applied.length} employee(s)`
        : `Leave applied for ${summary.applied.length} of ${summary.requested} employee(s) — ${summary.failed.length} could not be processed`,
  });
});

/* ─── GET /leave/requests/mine ────────────────────────────────────────────── */
export const listMine = asyncHandler(async (req, res) => {
  const { page, limit, status, leaveType, from, to, search, sort } = req.query;

  const filter = { employee: req.user._id, isDeleted: false };
  if (status) filter.status = status;
  if (leaveType) filter.leaveType = leaveType;
  const range = dateFilter(from, to);
  if (range) filter.fromDate = range;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ leaveNumber: rx }, { reason: rx }, { leaveTypeName: rx }];
  }

  const result = await LeaveRequest.paginate(filter, { page, limit, sort, lean: true });
  return sendPaginated(res, result, 'Leave applications fetched successfully');
});

/* ─── GET /leave/requests/:id ─────────────────────────────────────────────── */
export const getOne = asyncHandler(async (req, res) => {
  const request = await LeaveRequest.findById(req.params.id).lean();
  if (!request || request.isDeleted) throw ApiError.notFound('Leave application not found');

  // Explicit 403 rather than a filtered 404 — the caller should know the record
  // exists but is not theirs to read.
  const scope = await buildLeaveScope(req.user);
  const visible = await LeaveRequest.exists({ $and: [{ _id: request._id }, scope] });
  if (!visible) throw ApiError.forbidden('You do not have access to this leave application.');

  return sendSuccess(res, { data: request, message: 'Leave application fetched successfully' });
});

export default { prefill, preview, apply, bulkApply, listMine, getOne };
