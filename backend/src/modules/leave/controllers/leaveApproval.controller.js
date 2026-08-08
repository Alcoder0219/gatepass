import asyncHandler from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import { sendSuccess, sendPaginated } from '../../../utils/ApiResponse.js';
import { hasPermission } from '../../../middlewares/rbac.middleware.js';
import { PERMISSION } from '../../../constants/index.js';

import {
  listQueue,
  getQueueCounts,
  getForDecision,
  approveRequest,
  rejectRequest,
  sendBackToManager,
} from '../services/leaveApproval.service.js';
import { LEAVE_STATUS } from '../constants/index.js';

/* ─── GET /leave/approvals ────────────────────────────────────────────────── */
export const queue = asyncHandler(async (req, res) => {
  const { stage } = req.query;

  if (stage === 'MANAGER' && !hasPermission(req.user, PERMISSION.LEAVE_APPROVE)) {
    throw ApiError.forbidden('You do not have access to the manager approval queue.');
  }
  if (stage === 'HR' && !hasPermission(req.user, PERMISSION.LEAVE_HR_REVIEW)) {
    throw ApiError.forbidden('You do not have access to the HR review queue.');
  }

  const result = await listQueue(req.user, req.query);
  return sendPaginated(res, result, 'Approval queue fetched successfully');
});

/* ─── GET /leave/approvals/counts ─────────────────────────────────────────── */
export const counts = asyncHandler(async (req, res) => {
  const data = await getQueueCounts(req.user);
  return sendSuccess(res, { data, message: 'Queue counts fetched successfully' });
});

/* ─── GET /leave/approvals/:id ────────────────────────────────────────────── */
export const detail = asyncHandler(async (req, res) => {
  const request = await getForDecision(req.user, req.params.id);
  return sendSuccess(res, { data: request.toJSON(), message: 'Leave application fetched successfully' });
});

/* ─── POST /leave/approvals/:id/approve ───────────────────────────────────── */
export const approve = asyncHandler(async (req, res) => {
  const request = await getForDecision(req.user, req.params.id);
  const updated = await approveRequest(req.user, request, { remarks: req.body.remarks, req });

  return sendSuccess(res, {
    data: updated.toJSON(),
    message:
      updated.status === LEAVE_STATUS.APPROVED
        ? `${updated.leaveNumber} approved — ${updated.totalDays} day(s) deducted from the balance.`
        : `${updated.leaveNumber} approved and sent to HR.`,
  });
});

/* ─── POST /leave/approvals/:id/reject ────────────────────────────────────── */
export const reject = asyncHandler(async (req, res) => {
  const request = await getForDecision(req.user, req.params.id);
  const updated = await rejectRequest(req.user, request, { remarks: req.body.remarks, req });

  return sendSuccess(res, {
    data: updated.toJSON(),
    message: `${updated.leaveNumber} rejected. The balance was released, not deducted.`,
  });
});

/* ─── POST /leave/approvals/:id/send-back ─────────────────────────────────── */
export const sendBack = asyncHandler(async (req, res) => {
  const request = await getForDecision(req.user, req.params.id);

  if (!hasPermission(req.user, PERMISSION.LEAVE_HR_REVIEW)) {
    throw ApiError.forbidden('Only HR may send an application back to the manager.');
  }

  const updated = await sendBackToManager(req.user, request, { remarks: req.body.remarks, req });
  return sendSuccess(res, {
    data: updated.toJSON(),
    message: `${updated.leaveNumber} sent back to ${updated.reportingManagerName || 'the manager'}.`,
  });
});

export default { queue, counts, detail, approve, reject, sendBack };
