import ApiError from '../../../utils/ApiError.js';
import env from '../../../config/env.js';
import { dayjs } from '../../../utils/dates.js';
import User from '../../../models/User.js';
import { notify, notifyRole } from '../../../services/notification.service.js';
import { recordAudit } from '../../../services/audit.service.js';
import { emitToUser } from '../../../services/socket.service.js';
import { hasPermission } from '../../../middlewares/rbac.middleware.js';
import {
  NOTIFICATION_TYPE,
  AUDIT_ACTION,
  SOCKET_EVENT,
  PERMISSION,
  ROLE,
} from '../../../constants/index.js';

import LeaveRequest from '../models/LeaveRequest.js';
import { commit, release } from './leaveBalance.service.js';
import { buildLeaveScope } from './leaveScope.service.js';
import {
  LEAVE_STATUS,
  LEAVE_STAGE,
  LEAVE_TRANSITIONS,
  PENDING_STATUSES,
} from '../constants/index.js';

/* ────────────────────────────────────────────────────────────────────────────
 * THE BALANCE CONTRACT
 *
 *   apply    → RESERVE   pending += days      (a hold, NOT a deduction)
 *   HR OK    → COMMIT    pending -= days ; used += days
 *   reject   → RELEASE   pending -= days      (`used` is never touched)
 *
 * So the balance is deducted on final approval and only on final approval. A
 * rejection at either stage gives the days straight back. `used` is written in
 * exactly one place — `commit()` — which is what makes that guarantee hold.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Guards every state change against the transition table. */
const assertTransition = (from, to) => {
  const allowed = LEAVE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.badRequest(
      `A leave application that is ${from.toLowerCase().replace('_', ' ')} cannot move to ${to
        .toLowerCase()
        .replace('_', ' ')}. It may already have been decided.`
    );
  }
};

/** Only the routed manager may decide the manager stage — or an admin. */
const assertIsManagerApprover = (user, request) => {
  if (user.role?.key === ROLE.SUPER_ADMIN || user.role?.key === ROLE.ADMIN) return;
  const routed = String(request.reportingManager ?? '') === String(user._id);
  if (!routed) {
    throw ApiError.forbidden(
      `${request.leaveNumber} is routed to ${request.reportingManagerName || 'another manager'} for approval.`
    );
  }
};

/** Nobody decides their own application. */
const assertNotSelf = (user, request) => {
  if (String(request.employee) === String(user._id)) {
    throw ApiError.forbidden('You cannot decide your own leave application.');
  }
};

const pushTimeline = (request, entry) => {
  request.timeline.push({ at: new Date(), ...entry });
};

/**
 * Standard fact sheet for leave decision emails. Mirrors the gate pass
 * `emailFacts` so the templates receive a consistent shape.
 */
const leaveFacts = (request, extra = {}) => ({
  leaveNumber: request.leaveNumber,
  employeeName: request.employeeName,
  employeeCode: request.employeeCode,
  departmentName: request.departmentName,
  unitName: request.unitName,
  designation: request.designation,
  leaveTypeName: request.leaveTypeName,
  fromDate: dayjs(request.fromDate).format('DD MMM YYYY'),
  toDate: dayjs(request.toDate).format('DD MMM YYYY'),
  totalDays: request.totalDays,
  reason: request.reason,
  status: request.status,
  link: `${env.clientUrl}/leave/my-leaves`,
  ...extra,
});

const notifyEmployee = async (request, actor, { title, message, template, data }) => {
  await notify({
    recipient: request.employee,
    actor,
    type: NOTIFICATION_TYPE.APPROVAL,
    title,
    message,
    link: '/leave/my-leaves',
    meta: { module: 'LEAVE', leaveRequestId: String(request._id), leaveNumber: request.leaveNumber },
    // Email only when the caller supplies a template; recipient resolves from
    // the User record inside notify(), never from a request body.
    email: Boolean(template),
    emailTemplate: template,
    emailData: data,
  });
};

/* ────────────────────────────────────────────────────────────────────────────
 * QUEUES
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What is waiting on this caller.
 *   MANAGER → applications routed to them and still PENDING
 *   HR      → everything that has cleared its manager
 */
export const listQueue = async (user, { stage, page, limit, sort, status, search }) => {
  const filter = { isDeleted: false };

  if (stage === 'MANAGER') {
    filter.status = LEAVE_STATUS.PENDING;
    // An admin oversees every manager queue; a manager sees only their own.
    if (![ROLE.SUPER_ADMIN, ROLE.ADMIN].includes(user.role?.key)) {
      filter.reportingManager = user._id;
    }
  } else if (stage === 'HR') {
    filter.status = LEAVE_STATUS.HR_REVIEW;
  } else {
    // History — everything the caller may see that has been decided.
    const scope = await buildLeaveScope(user);
    Object.assign(filter, scope);
    filter.status = status ?? {
      $in: [LEAVE_STATUS.APPROVED, LEAVE_STATUS.REJECTED, LEAVE_STATUS.COMPLETED, LEAVE_STATUS.CANCELLED],
    };
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ leaveNumber: rx }, { employeeName: rx }, { employeeCode: rx }, { reason: rx }];
  }

  return LeaveRequest.paginate(filter, { page, limit, sort: sort || '-createdAt', lean: true });
};

/** Counts for the queue badges. */
export const getQueueCounts = async (user) => {
  const managerFilter = { isDeleted: false, status: LEAVE_STATUS.PENDING };
  if (![ROLE.SUPER_ADMIN, ROLE.ADMIN].includes(user.role?.key)) {
    managerFilter.reportingManager = user._id;
  }

  const [manager, hr] = await Promise.all([
    hasPermission(user, PERMISSION.LEAVE_APPROVE) ? LeaveRequest.countDocuments(managerFilter) : 0,
    hasPermission(user, PERMISSION.LEAVE_HR_REVIEW)
      ? LeaveRequest.countDocuments({ isDeleted: false, status: LEAVE_STATUS.HR_REVIEW })
      : 0,
  ]);

  return { manager, hr };
};

/** One application with its full decision history. */
export const getForDecision = async (user, id) => {
  const request = await LeaveRequest.findById(id);
  if (!request || request.isDeleted) throw ApiError.notFound('Leave application not found');

  const mayDecide =
    hasPermission(user, PERMISSION.LEAVE_APPROVE) || hasPermission(user, PERMISSION.LEAVE_HR_REVIEW);

  if (!mayDecide) {
    const scope = await buildLeaveScope(user);
    const visible = await LeaveRequest.exists({ $and: [{ _id: request._id }, scope] });
    if (!visible) throw ApiError.forbidden('You do not have access to this leave application.');
  }

  return request;
};

/* ────────────────────────────────────────────────────────────────────────────
 * STAGE 1 — the reporting manager (HOD) decides
 * ──────────────────────────────────────────────────────────────────────────── */

export const approveByManager = async (user, request, { remarks = '', req } = {}) => {
  assertNotSelf(user, request);
  assertIsManagerApprover(user, request);
  assertTransition(request.status, LEAVE_STATUS.HR_REVIEW);

  request.status = LEAVE_STATUS.HR_REVIEW;
  request.stage = LEAVE_STAGE.HR;
  request.approval.approvedBy = user._id;
  request.approval.approvedAt = new Date();
  request.approval.comment = remarks;
  request.hrReview.status = 'PENDING';
  request.updatedBy = user._id;

  pushTimeline(request, {
    action: 'MANAGER_APPROVED',
    fromStatus: LEAVE_STATUS.PENDING,
    toStatus: LEAVE_STATUS.HR_REVIEW,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment: remarks || 'Approved by the reporting manager',
  });

  await request.save();

  // The balance is deliberately untouched here: the days stay RESERVED until
  // HR gives the final approval.
  await notifyEmployee(request, user, {
    title: 'Leave approved by your manager',
    message: `${request.leaveNumber} cleared ${user.name} and is now with HR.`,
    template: 'leaveForwarded',
    data: leaveFacts(request, { approvedBy: user.name, remarks }),
  });

  await notifyRole(ROLE.HR, {
    actor: user,
    type: NOTIFICATION_TYPE.REVIEW,
    title: 'Leave awaiting HR review',
    message: `${request.employeeName} · ${request.totalDays} day(s) of ${request.leaveTypeName}`,
    link: '/leave/approvals',
    meta: { module: 'LEAVE', leaveRequestId: String(request._id), leaveNumber: request.leaveNumber },
    email: true,
    emailTemplate: 'leaveHrReview',
    emailData: leaveFacts(request, {
      approvedBy: user.name,
      link: `${env.clientUrl}/leave/approvals`,
    }),
  });

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_APPROVE,
    actor: user,
    entity: 'LeaveRequest',
    entityId: request._id,
    entityLabel: request.leaveNumber,
    description: `Manager approved ${request.totalDays} day(s) of ${request.leaveTypeName} for ${request.employeeName} — sent to HR`,
    req,
    unit: request.unit,
  });

  emitToUser(request.employee, SOCKET_EVENT.DASHBOARD_REFRESH, { reason: 'LEAVE_APPROVED' });
  return request;
};

/* ────────────────────────────────────────────────────────────────────────────
 * STAGE 2 — HR decides. This is where the balance is actually deducted.
 * ──────────────────────────────────────────────────────────────────────────── */

export const approveByHr = async (user, request, { remarks = '', req } = {}) => {
  assertNotSelf(user, request);
  assertTransition(request.status, LEAVE_STATUS.APPROVED);

  request.status = LEAVE_STATUS.APPROVED;
  request.stage = LEAVE_STAGE.DONE;
  request.hrReview.reviewedBy = user._id;
  request.hrReview.reviewedAt = new Date();
  request.hrReview.status = 'OK';
  request.hrReview.comment = remarks;
  request.updatedBy = user._id;

  pushTimeline(request, {
    action: 'HR_APPROVED',
    fromStatus: LEAVE_STATUS.HR_REVIEW,
    toStatus: LEAVE_STATUS.APPROVED,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment: remarks || 'Approved by HR',
  });

  await request.save();

  // ── THE DEDUCTION. Reserved days become used days — the only place in the
  //    module that writes `used`. It runs after the status is committed, so a
  //    failure here cannot leave an approved request with an untouched hold.
  const balance = await commit({
    employeeId: request.employee,
    leaveTypeId: request.leaveType,
    leaveYear: request.leaveYear,
    days: request.totalDays,
  });

  await notifyEmployee(request, user, {
    title: 'Leave approved',
    message: `${request.leaveNumber} is approved. ${request.totalDays} day(s) of ${request.leaveTypeName} have been deducted from your balance.`,
    template: 'leaveApproved',
    data: leaveFacts(request, {
      approvedBy: user.name,
      remarks,
      balanceDeducted: `${request.totalDays} day(s)`,
    }),
  });

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_HR_APPROVE,
    actor: user,
    entity: 'LeaveRequest',
    entityId: request._id,
    entityLabel: request.leaveNumber,
    description: `HR approved ${request.totalDays} day(s) of ${request.leaveTypeName} for ${request.employeeName} — balance deducted`,
    changes: balance
      ? { balance: { from: `pending ${request.totalDays}`, to: `used ${balance.used}` } }
      : null,
    req,
    unit: request.unit,
  });

  emitToUser(request.employee, SOCKET_EVENT.DASHBOARD_REFRESH, { reason: 'LEAVE_APPROVED' });
  return request;
};

/** HR is not satisfied — back to the manager, balance still merely reserved. */
export const sendBackToManager = async (user, request, { remarks = '', req } = {}) => {
  assertTransition(request.status, LEAVE_STATUS.PENDING);

  request.status = LEAVE_STATUS.PENDING;
  request.stage = LEAVE_STAGE.MANAGER;
  request.hrReview.reviewedBy = user._id;
  request.hrReview.reviewedAt = new Date();
  request.hrReview.status = 'NOT_OK';
  request.hrReview.comment = remarks;
  request.updatedBy = user._id;

  pushTimeline(request, {
    action: 'HR_SENT_BACK',
    fromStatus: LEAVE_STATUS.HR_REVIEW,
    toStatus: LEAVE_STATUS.PENDING,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment: remarks || 'HR sent it back to the manager',
  });

  await request.save();

  await notify({
    recipient: request.reportingManager,
    actor: user,
    type: NOTIFICATION_TYPE.REVIEW_FAILED,
    title: 'HR sent a leave application back',
    message: `${request.leaveNumber} (${request.employeeName}) needs another look.`,
    link: '/leave/approvals',
    meta: { module: 'LEAVE', leaveRequestId: String(request._id), leaveNumber: request.leaveNumber },
    email: true,
    emailTemplate: 'leaveSentBack',
    emailData: leaveFacts(request, { remarks, link: `${env.clientUrl}/leave/approvals` }),
  });

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_SEND_BACK,
    actor: user,
    entity: 'LeaveRequest',
    entityId: request._id,
    entityLabel: request.leaveNumber,
    description: `HR sent ${request.leaveNumber} back to the manager`,
    req,
    unit: request.unit,
  });

  return request;
};

/* ────────────────────────────────────────────────────────────────────────────
 * REJECTION — at either stage. Releases the hold; never deducts.
 * ──────────────────────────────────────────────────────────────────────────── */

export const rejectRequest = async (user, request, { remarks = '', req } = {}) => {
  assertNotSelf(user, request);

  const stage = request.status === LEAVE_STATUS.PENDING ? 'MANAGER' : 'HR';

  if (stage === 'MANAGER') {
    assertIsManagerApprover(user, request);
    if (!hasPermission(user, PERMISSION.LEAVE_APPROVE)) {
      throw ApiError.forbidden('You do not have permission to decide at the manager stage.');
    }
  } else if (!hasPermission(user, PERMISSION.LEAVE_HR_REVIEW)) {
    throw ApiError.forbidden('You do not have permission to decide at the HR stage.');
  }

  assertTransition(request.status, LEAVE_STATUS.REJECTED);

  if (!remarks.trim()) {
    throw ApiError.badRequest('A reason is required when rejecting a leave application.');
  }

  const fromStatus = request.status;

  request.status = LEAVE_STATUS.REJECTED;
  request.stage = LEAVE_STAGE.DONE;
  request.approval.rejectedBy = user._id;
  request.approval.rejectedAt = new Date();
  request.approval.comment = remarks;
  if (stage === 'HR') {
    request.hrReview.reviewedBy = user._id;
    request.hrReview.reviewedAt = new Date();
    request.hrReview.status = 'NOT_OK';
    request.hrReview.comment = remarks;
  }
  request.updatedBy = user._id;

  pushTimeline(request, {
    action: stage === 'MANAGER' ? 'MANAGER_REJECTED' : 'HR_REJECTED',
    fromStatus,
    toStatus: LEAVE_STATUS.REJECTED,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment: remarks,
  });

  await request.save();

  // ── RELEASE, not deduct. `used` is untouched: a rejected application must
  //    cost the employee nothing.
  await release({
    employeeId: request.employee,
    leaveTypeId: request.leaveType,
    leaveYear: request.leaveYear,
    days: request.totalDays,
  });

  await notifyEmployee(request, user, {
    title: 'Leave rejected',
    message: `${request.leaveNumber} was rejected by ${user.name}. Your balance is unchanged. Reason: ${remarks}`,
    template: 'leaveRejected',
    data: leaveFacts(request, {
      rejectedBy: user.name,
      remarks,
      stage: stage === 'MANAGER' ? 'Reporting manager' : 'HR review',
    }),
  });

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_REJECT,
    actor: user,
    entity: 'LeaveRequest',
    entityId: request._id,
    entityLabel: request.leaveNumber,
    description: `${stage === 'MANAGER' ? 'Manager' : 'HR'} rejected ${request.totalDays} day(s) of ${request.leaveTypeName} for ${request.employeeName} — balance released`,
    req,
    unit: request.unit,
  });

  emitToUser(request.employee, SOCKET_EVENT.DASHBOARD_REFRESH, { reason: 'LEAVE_REJECTED' });
  return request;
};

/** Routes an approval to the right stage handler. */
export const approveRequest = async (user, request, options) => {
  if (request.status === LEAVE_STATUS.PENDING) {
    if (!hasPermission(user, PERMISSION.LEAVE_APPROVE)) {
      throw ApiError.forbidden('You do not have permission to decide at the manager stage.');
    }
    return approveByManager(user, request, options);
  }

  if (request.status === LEAVE_STATUS.HR_REVIEW) {
    if (!hasPermission(user, PERMISSION.LEAVE_HR_REVIEW)) {
      throw ApiError.forbidden('You do not have permission to decide at the HR stage.');
    }
    return approveByHr(user, request, options);
  }

  throw ApiError.badRequest(
    `${request.leaveNumber} is ${request.status.toLowerCase().replace('_', ' ')} and is not awaiting approval.`
  );
};

export default {
  listQueue,
  getQueueCounts,
  getForDecision,
  approveRequest,
  approveByManager,
  approveByHr,
  sendBackToManager,
  rejectRequest,
  PENDING_STATUSES,
};
