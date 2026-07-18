import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import GatePass from '../models/GatePass.js';
import HRReview from '../models/HRReview.js';
import SecurityLog from '../models/SecurityLog.js';
import User from '../models/User.js';
import env from '../config/env.js';
import { getSettings, assertCanCreateGatePass } from './settings.service.js';
import { notify, notifyRole } from './notification.service.js';
import { recordAudit } from './audit.service.js';
import { emitToRole, emitToUser, emitToAll } from './socket.service.js';
import { generateGatePassNumber } from '../helpers/gatePassNumber.js';
import {
  GATEPASS_STATUS,
  GATEPASS_TYPE,
  WORKFLOW_STAGE,
  STATUS_TRANSITIONS,
  NOTIFICATION_TYPE,
  AUDIT_ACTION,
  SOCKET_EVENT,
  ROLE,
} from '../constants/index.js';
import { dayjs } from '../utils/dates.js';

const linkTo = (gatePass) => `${env.clientUrl}/gate-pass/${gatePass._id}`;

/** Guards every state change against the transition table. */
const assertTransition = (from, to) => {
  const allowed = STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.badRequest(
      `A gate pass that is ${from.toLowerCase().replace('_', ' ')} cannot move to ${to
        .toLowerCase()
        .replace('_', ' ')}`
    );
  }
};

/* ────────────────────────────────────────────────────────────────────────────
 * STEP 1 — Employee raises a gate pass
 * ──────────────────────────────────────────────────────────────────────────── */
export const createGatePass = async (user, payload, { req, attachments = [] } = {}) => {
  const settings = await getSettings();

  // A gate pass ALWAYS belongs to the logged-in employee. The client cannot
  // name someone else — every identity field is taken from the session.
  if (!user.reportingManager && settings.workflow.approvalRequired) {
    throw ApiError.badRequest(
      'You do not have a reporting manager assigned. Contact HR before raising a gate pass.'
    );
  }

  if (settings.workflow.reasonMandatory && !payload.reason?.trim()) {
    throw ApiError.badRequest('A reason is required');
  }
  if (settings.workflow.purposeMandatory && !payload.purpose?.trim()) {
    throw ApiError.badRequest('A purpose is required');
  }
  if (settings.workflow.attachmentMandatory && attachments.length === 0) {
    throw ApiError.badRequest('An attachment is required');
  }

  // Working hours, holidays, concurrency and quota rules.
  await assertCanCreateGatePass(user, payload);

  const unit = user.unit;
  const department = user.department;
  const managerId = user.reportingManager?._id ?? user.reportingManager;

  const gatePassNumber = await generateGatePassNumber(unit.code ?? 'GEN');

  const gatePass = new GatePass({
    gatePassNumber,
    employee: user._id,
    employeeCode: user.employeeId,
    employeeName: user.name,
    department: department._id ?? department,
    departmentName: department.name ?? '',
    unit: unit._id ?? unit,
    unitName: unit.name ?? '',
    designation: user.designation ?? '',

    type: payload.type,
    reason: payload.reason,
    purpose: payload.purpose ?? '',
    expectedOutTime: payload.expectedOutTime,
    expectedInTime: payload.expectedInTime,
    remarks: payload.remarks ?? '',
    attachments,

    reportingManager: managerId,
    reportingManagerName: user.reportingManager?.name ?? '',

    expiresAt: dayjs(payload.expectedOutTime).add(settings.workflow.expiryHours, 'hour').toDate(),
    createdBy: user._id,
  });

  // Approval can be switched off entirely — then the pass is born approved.
  if (!settings.workflow.approvalRequired) {
    gatePass.status = GATEPASS_STATUS.APPROVED;
    gatePass.stage = WORKFLOW_STAGE.SECURITY;
  } else {
    gatePass.status = GATEPASS_STATUS.PENDING;
    gatePass.stage = WORKFLOW_STAGE.MANAGER;
  }

  gatePass.pushTimeline({
    action: 'SUBMITTED',
    toStatus: gatePass.status,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment: 'Gate pass submitted',
  });

  await gatePass.save();

  // ── Notify the reporting manager ─────────────────────────────────────────
  if (gatePass.status === GATEPASS_STATUS.PENDING && managerId) {
    await notify({
      recipient: managerId,
      actor: user,
      type: NOTIFICATION_TYPE.SUBMITTED,
      title: 'New gate pass to approve',
      message: `${user.name} raised ${gatePass.gatePassNumber} (${gatePass.type.toLowerCase()})`,
      link: `/approvals/${gatePass._id}`,
      gatePass,
      email: true,
      emailTemplate: 'gatePassSubmitted',
      emailData: {
        gatePassNumber: gatePass.gatePassNumber,
        employeeName: user.name,
        type: gatePass.type,
        reason: gatePass.reason,
        link: linkTo(gatePass),
      },
    });
  }

  await recordAudit({
    action: AUDIT_ACTION.GATEPASS_CREATE,
    actor: user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: `Raised a ${gatePass.type.toLowerCase()} gate pass`,
    req,
  });

  emitToAll(SOCKET_EVENT.GATEPASS_CREATED, { id: gatePass._id, status: gatePass.status });
  return gatePass;
};

/* ────────────────────────────────────────────────────────────────────────────
 * STEP 2 — Reporting manager decides
 * ──────────────────────────────────────────────────────────────────────────── */

/** Only the routed manager (or an admin with the permission) may decide. */
const assertIsApprover = (user, gatePass) => {
  const isManager = gatePass.reportingManager?.toString() === user._id.toString();
  const isAdmin = [ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(user.role?.key);
  if (!isManager && !isAdmin) {
    throw ApiError.forbidden('Only the reporting manager for this gate pass can decide on it');
  }
  if (gatePass.employee.toString() === user._id.toString() && !isAdmin) {
    throw ApiError.forbidden('You cannot approve your own gate pass');
  }
};

export const approveGatePass = async (user, gatePass, { comment = '', req } = {}) => {
  assertIsApprover(user, gatePass);

  const settings = await getSettings();

  // HR review may be required globally, or only for personal passes.
  const needsHr =
    settings.workflow.hrReviewRequired &&
    (!settings.workflow.hrReviewForPersonalOnly || gatePass.type === GATEPASS_TYPE.PERSONAL);

  const next = needsHr ? GATEPASS_STATUS.HR_REVIEW : GATEPASS_STATUS.APPROVED;
  assertTransition(gatePass.status, next);

  const from = gatePass.status;
  gatePass.status = next;
  gatePass.stage = needsHr ? WORKFLOW_STAGE.HR : WORKFLOW_STAGE.SECURITY;
  gatePass.approval.approvedBy = user._id;
  gatePass.approval.approvedAt = new Date();
  gatePass.approval.comment = comment;
  gatePass.updatedBy = user._id;

  if (needsHr) {
    gatePass.hrReview.status = 'PENDING';
  }

  gatePass.pushTimeline({
    action: 'MANAGER_APPROVED',
    fromStatus: from,
    toStatus: next,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment,
  });

  await gatePass.save();

  if (needsHr) {
    // → HR queue
    await notifyRole(ROLE.HR, {
      actor: user,
      type: NOTIFICATION_TYPE.REVIEW,
      title: 'Gate pass awaiting HR review',
      message: `${gatePass.employeeName}'s ${gatePass.gatePassNumber} was approved by ${user.name}`,
      link: `/hr-review/${gatePass._id}`,
      gatePass,
      email: true,
      emailTemplate: 'hrReviewPending',
      emailData: {
        gatePassNumber: gatePass.gatePassNumber,
        employeeName: gatePass.employeeName,
        link: linkTo(gatePass),
      },
    });

    await notify({
      recipient: gatePass.employee,
      actor: user,
      type: NOTIFICATION_TYPE.APPROVAL,
      title: 'Manager approved your gate pass',
      message: `${gatePass.gatePassNumber} is now with HR for review`,
      link: `/my-gate-pass/${gatePass._id}`,
      gatePass,
    });
  } else {
    await notifyEmployeeApproved(gatePass, user);
    await notifySecurity(gatePass);
  }

  await recordAudit({
    action: AUDIT_ACTION.GATEPASS_APPROVE,
    actor: user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: needsHr ? 'Approved and sent to HR review' : 'Approved',
    req,
  });

  emitToAll(SOCKET_EVENT.GATEPASS_UPDATED, { id: gatePass._id, status: gatePass.status });
  return gatePass;
};

export const rejectGatePass = async (user, gatePass, { comment = '', req } = {}) => {
  // HR can also reject outright from the review queue.
  const isHr = user.role?.key === ROLE.HR;
  if (!isHr) assertIsApprover(user, gatePass);

  if (!comment?.trim()) throw ApiError.badRequest('A comment is required when rejecting a gate pass');

  assertTransition(gatePass.status, GATEPASS_STATUS.REJECTED);

  const from = gatePass.status;
  gatePass.status = GATEPASS_STATUS.REJECTED;
  gatePass.stage = WORKFLOW_STAGE.DONE;
  gatePass.approval.rejectedBy = user._id;
  gatePass.approval.rejectedAt = new Date();
  gatePass.approval.comment = comment;
  gatePass.updatedBy = user._id;

  gatePass.pushTimeline({
    action: isHr ? 'HR_REJECTED' : 'MANAGER_REJECTED',
    fromStatus: from,
    toStatus: GATEPASS_STATUS.REJECTED,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment,
  });

  await gatePass.save();

  await notify({
    recipient: gatePass.employee,
    actor: user,
    type: NOTIFICATION_TYPE.REJECT,
    title: 'Gate pass rejected',
    message: `${user.name} rejected ${gatePass.gatePassNumber}: ${comment}`,
    link: `/my-gate-pass/${gatePass._id}`,
    gatePass,
    email: true,
    emailTemplate: 'gatePassRejected',
    emailData: {
      gatePassNumber: gatePass.gatePassNumber,
      rejectedBy: user.name,
      comment,
      link: linkTo(gatePass),
    },
  });

  await recordAudit({
    action: AUDIT_ACTION.GATEPASS_REJECT,
    actor: user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: `Rejected: ${comment}`,
    req,
  });

  emitToAll(SOCKET_EVENT.GATEPASS_UPDATED, { id: gatePass._id, status: gatePass.status });
  return gatePass;
};

export const requestChanges = async (user, gatePass, { comment = '', req } = {}) => {
  assertIsApprover(user, gatePass);
  if (!comment?.trim()) throw ApiError.badRequest('Tell the employee what needs to change');

  assertTransition(gatePass.status, GATEPASS_STATUS.CHANGES_REQUESTED);

  const from = gatePass.status;
  gatePass.status = GATEPASS_STATUS.CHANGES_REQUESTED;
  gatePass.stage = WORKFLOW_STAGE.EMPLOYEE;
  gatePass.approval.comment = comment;
  gatePass.updatedBy = user._id;

  gatePass.pushTimeline({
    action: 'CHANGES_REQUESTED',
    fromStatus: from,
    toStatus: GATEPASS_STATUS.CHANGES_REQUESTED,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment,
  });

  await gatePass.save();

  await notify({
    recipient: gatePass.employee,
    actor: user,
    type: NOTIFICATION_TYPE.CHANGES_REQUESTED,
    title: 'Changes requested on your gate pass',
    message: `${user.name} asked for changes on ${gatePass.gatePassNumber}: ${comment}`,
    link: `/my-gate-pass/${gatePass._id}`,
    gatePass,
    email: true,
    emailTemplate: 'changesRequested',
    emailData: {
      gatePassNumber: gatePass.gatePassNumber,
      requestedBy: user.name,
      comment,
      link: linkTo(gatePass),
    },
  });

  await recordAudit({
    action: AUDIT_ACTION.GATEPASS_REQUEST_CHANGES,
    actor: user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: `Requested changes: ${comment}`,
    req,
  });

  emitToAll(SOCKET_EVENT.GATEPASS_UPDATED, { id: gatePass._id, status: gatePass.status });
  return gatePass;
};

/** Employee edits a sent-back pass and resubmits it → straight back to PENDING. */
export const resubmitGatePass = async (user, gatePass, payload, { req, attachments } = {}) => {
  if (gatePass.employee.toString() !== user._id.toString()) {
    throw ApiError.forbidden('You can only resubmit your own gate pass');
  }
  assertTransition(gatePass.status, GATEPASS_STATUS.PENDING);

  Object.assign(gatePass, {
    reason: payload.reason ?? gatePass.reason,
    purpose: payload.purpose ?? gatePass.purpose,
    type: payload.type ?? gatePass.type,
    expectedOutTime: payload.expectedOutTime ?? gatePass.expectedOutTime,
    expectedInTime: payload.expectedInTime ?? gatePass.expectedInTime,
    remarks: payload.remarks ?? gatePass.remarks,
    status: GATEPASS_STATUS.PENDING,
    stage: WORKFLOW_STAGE.MANAGER,
    updatedBy: user._id,
  });

  if (attachments?.length) gatePass.attachments.push(...attachments);

  gatePass.pushTimeline({
    action: 'RESUBMITTED',
    fromStatus: GATEPASS_STATUS.CHANGES_REQUESTED,
    toStatus: GATEPASS_STATUS.PENDING,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment: 'Employee resubmitted after changes',
  });

  await gatePass.save();

  await notify({
    recipient: gatePass.reportingManager,
    actor: user,
    type: NOTIFICATION_TYPE.SUBMITTED,
    title: 'Gate pass resubmitted',
    message: `${user.name} updated and resubmitted ${gatePass.gatePassNumber}`,
    link: `/approvals/${gatePass._id}`,
    gatePass,
  });

  await recordAudit({
    action: AUDIT_ACTION.GATEPASS_UPDATE,
    actor: user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: 'Resubmitted after requested changes',
    req,
  });

  emitToAll(SOCKET_EVENT.GATEPASS_UPDATED, { id: gatePass._id, status: gatePass.status });
  return gatePass;
};

/* ────────────────────────────────────────────────────────────────────────────
 * STEP 3 — HR review
 * ──────────────────────────────────────────────────────────────────────────── */
export const reviewGatePass = async (user, gatePass, { status, comment = '', req } = {}) => {
  if (gatePass.status !== GATEPASS_STATUS.HR_REVIEW) {
    throw ApiError.badRequest('This gate pass is not in the HR review queue');
  }
  if (status === 'NOT_OK' && !comment?.trim()) {
    throw ApiError.badRequest('A comment is required when marking a review as Not OK');
  }

  const from = gatePass.status;
  const isOk = status === 'OK';
  const next = isOk ? GATEPASS_STATUS.APPROVED : GATEPASS_STATUS.PENDING;
  assertTransition(from, next);

  await HRReview.create({
    gatePass: gatePass._id,
    gatePassNumber: gatePass.gatePassNumber,
    employee: gatePass.employee,
    reviewer: user._id,
    reviewerName: user.name,
    status,
    comment,
    unit: gatePass.unit,
    department: gatePass.department,
  });

  gatePass.status = next;
  gatePass.stage = isOk ? WORKFLOW_STAGE.SECURITY : WORKFLOW_STAGE.MANAGER;
  gatePass.hrReview = {
    reviewedBy: user._id,
    reviewedAt: new Date(),
    status,
    comment,
  };
  gatePass.updatedBy = user._id;

  gatePass.pushTimeline({
    action: isOk ? 'HR_REVIEW_OK' : 'HR_REVIEW_NOT_OK',
    fromStatus: from,
    toStatus: next,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment,
  });

  await gatePass.save();

  if (isOk) {
    await notifyEmployeeApproved(gatePass, user);
    await notifySecurity(gatePass);
  } else {
    // Review not OK → back to the manager for another look.
    await notify({
      recipient: gatePass.reportingManager,
      actor: user,
      type: NOTIFICATION_TYPE.REVIEW_FAILED,
      title: 'HR sent a gate pass back',
      message: `HR marked ${gatePass.gatePassNumber} as Not OK: ${comment}`,
      link: `/approvals/${gatePass._id}`,
      gatePass,
      email: true,
      emailTemplate: 'reminder',
      emailData: {
        gatePassNumber: gatePass.gatePassNumber,
        message: `HR marked this gate pass as Not OK: ${comment}`,
        link: linkTo(gatePass),
      },
    });

    await notify({
      recipient: gatePass.employee,
      actor: user,
      type: NOTIFICATION_TYPE.REVIEW_FAILED,
      title: 'HR review not OK',
      message: `${gatePass.gatePassNumber} was sent back to your manager: ${comment}`,
      link: `/my-gate-pass/${gatePass._id}`,
      gatePass,
    });
  }

  await recordAudit({
    action: isOk ? AUDIT_ACTION.HR_REVIEW_OK : AUDIT_ACTION.HR_REVIEW_NOT_OK,
    actor: user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: `HR review ${status}${comment ? `: ${comment}` : ''}`,
    req,
  });

  emitToAll(SOCKET_EVENT.GATEPASS_UPDATED, { id: gatePass._id, status: gatePass.status });
  return gatePass;
};

/* ────────────────────────────────────────────────────────────────────────────
 * STEP 4 — Security gate movement
 * ──────────────────────────────────────────────────────────────────────────── */
export const markExit = async (user, gatePass, { remark = '', photo = '', method = 'MANUAL', req } = {}) => {
  if (gatePass.status !== GATEPASS_STATUS.APPROVED) {
    throw ApiError.badRequest(
      gatePass.status === GATEPASS_STATUS.OUT
        ? 'This employee has already exited'
        : 'Only a fully approved gate pass can be used at the gate'
    );
  }

  const settings = await getSettings();
  if (settings.security.requireExitPhoto && !photo) {
    throw ApiError.badRequest('A photo is required to record the exit');
  }

  assertTransition(gatePass.status, GATEPASS_STATUS.OUT);

  const now = new Date();
  gatePass.status = GATEPASS_STATUS.OUT;
  gatePass.stage = WORKFLOW_STAGE.SECURITY;
  gatePass.security.exitBy = user._id;
  gatePass.security.actualOutTime = now;
  gatePass.security.exitPhoto = photo;
  gatePass.security.exitRemark = remark;
  gatePass.updatedBy = user._id;

  gatePass.pushTimeline({
    action: 'SECURITY_EXIT',
    fromStatus: GATEPASS_STATUS.APPROVED,
    toStatus: GATEPASS_STATUS.OUT,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment: remark,
    meta: { method },
  });

  await gatePass.save();

  await SecurityLog.create({
    gatePass: gatePass._id,
    gatePassNumber: gatePass.gatePassNumber,
    employee: gatePass.employee,
    employeeName: gatePass.employeeName,
    employeeCode: gatePass.employeeCode,
    type: 'EXIT',
    recordedBy: user._id,
    recordedByName: user.name,
    recordedAt: now,
    photo,
    remark,
    verificationMethod: method,
    unit: gatePass.unit,
  });

  await notify({
    recipient: gatePass.employee,
    actor: user,
    type: NOTIFICATION_TYPE.EXIT,
    title: 'Exit recorded',
    message: `Your exit for ${gatePass.gatePassNumber} was recorded at ${dayjs(now).format('HH:mm')}`,
    link: `/my-gate-pass/${gatePass._id}`,
    gatePass,
  });

  await recordAudit({
    action: AUDIT_ACTION.SECURITY_EXIT,
    actor: user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: `Recorded exit via ${method}`,
    req,
  });

  emitToAll(SOCKET_EVENT.GATEPASS_UPDATED, { id: gatePass._id, status: gatePass.status });
  return gatePass;
};

export const markReturn = async (user, gatePass, { remark = '', photo = '', method = 'MANUAL', req } = {}) => {
  if (gatePass.status !== GATEPASS_STATUS.OUT) {
    throw ApiError.badRequest('Only an employee who is currently out can be marked as returned');
  }

  const settings = await getSettings();
  if (settings.security.requireEntryPhoto && !photo) {
    throw ApiError.badRequest('A photo is required to record the return');
  }

  assertTransition(gatePass.status, GATEPASS_STATUS.COMPLETED);

  const now = new Date();
  const lateBy = Math.max(0, dayjs(now).diff(dayjs(gatePass.expectedInTime), 'minute'));

  gatePass.status = GATEPASS_STATUS.COMPLETED;
  gatePass.stage = WORKFLOW_STAGE.DONE;
  gatePass.security.entryBy = user._id;
  gatePass.security.actualInTime = now;
  gatePass.security.entryPhoto = photo;
  gatePass.security.entryRemark = remark;
  gatePass.isLate = lateBy > 0;
  gatePass.lateByMinutes = lateBy;
  gatePass.updatedBy = user._id;

  gatePass.pushTimeline({
    action: 'SECURITY_ENTRY',
    fromStatus: GATEPASS_STATUS.OUT,
    toStatus: GATEPASS_STATUS.COMPLETED,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment: remark,
    meta: { method, lateByMinutes: lateBy },
  });

  await gatePass.save();

  await SecurityLog.create({
    gatePass: gatePass._id,
    gatePassNumber: gatePass.gatePassNumber,
    employee: gatePass.employee,
    employeeName: gatePass.employeeName,
    employeeCode: gatePass.employeeCode,
    type: 'ENTRY',
    recordedBy: user._id,
    recordedByName: user.name,
    recordedAt: now,
    photo,
    remark,
    verificationMethod: method,
    unit: gatePass.unit,
    isLate: lateBy > 0,
    lateByMinutes: lateBy,
  });

  await notify({
    recipient: gatePass.employee,
    actor: user,
    type: NOTIFICATION_TYPE.COMPLETED,
    title: 'Gate pass completed',
    message: `Your return for ${gatePass.gatePassNumber} was recorded${lateBy ? ` (${lateBy} min late)` : ''}`,
    link: `/my-gate-pass/${gatePass._id}`,
    gatePass,
    email: true,
    emailTemplate: 'gatePassCompleted',
    emailData: {
      gatePassNumber: gatePass.gatePassNumber,
      outTime: dayjs(gatePass.security.actualOutTime).format('DD MMM YYYY, HH:mm'),
      inTime: dayjs(now).format('DD MMM YYYY, HH:mm'),
      link: linkTo(gatePass),
    },
  });

  await recordAudit({
    action: AUDIT_ACTION.SECURITY_ENTRY,
    actor: user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: `Recorded return via ${method}${lateBy ? ` — ${lateBy} min late` : ''}`,
    req,
  });

  emitToAll(SOCKET_EVENT.GATEPASS_UPDATED, { id: gatePass._id, status: gatePass.status });
  return gatePass;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Employee-initiated cancellation
 * ──────────────────────────────────────────────────────────────────────────── */
export const cancelGatePass = async (user, gatePass, { comment = '', req } = {}) => {
  const isOwner = gatePass.employee.toString() === user._id.toString();
  const isAdmin = [ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(user.role?.key);
  if (!isOwner && !isAdmin) throw ApiError.forbidden('You can only cancel your own gate pass');

  assertTransition(gatePass.status, GATEPASS_STATUS.CANCELLED);

  const from = gatePass.status;
  gatePass.status = GATEPASS_STATUS.CANCELLED;
  gatePass.stage = WORKFLOW_STAGE.DONE;
  gatePass.updatedBy = user._id;

  gatePass.pushTimeline({
    action: 'CANCELLED',
    fromStatus: from,
    toStatus: GATEPASS_STATUS.CANCELLED,
    actor: user._id,
    actorName: user.name,
    actorRole: user.role?.key,
    comment,
  });

  await gatePass.save();

  if (gatePass.reportingManager) {
    await notify({
      recipient: gatePass.reportingManager,
      actor: user,
      type: NOTIFICATION_TYPE.CANCELLED,
      title: 'Gate pass cancelled',
      message: `${gatePass.employeeName} cancelled ${gatePass.gatePassNumber}`,
      link: `/approvals`,
      gatePass,
    });
  }

  await recordAudit({
    action: AUDIT_ACTION.GATEPASS_CANCEL,
    actor: user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: `Cancelled${comment ? `: ${comment}` : ''}`,
    req,
  });

  emitToAll(SOCKET_EVENT.GATEPASS_UPDATED, { id: gatePass._id, status: gatePass.status });
  return gatePass;
};

/* ─── Shared notification helpers ────────────────────────────────────────── */
async function notifyEmployeeApproved(gatePass, actor) {
  await notify({
    recipient: gatePass.employee,
    actor,
    type: NOTIFICATION_TYPE.APPROVAL,
    title: 'Gate pass approved',
    message: `${gatePass.gatePassNumber} is approved — you can now use it at the gate`,
    link: `/my-gate-pass/${gatePass._id}`,
    gatePass,
    email: true,
    emailTemplate: 'gatePassApproved',
    emailData: {
      gatePassNumber: gatePass.gatePassNumber,
      approvedBy: actor.name,
      link: linkTo(gatePass),
    },
  });
}

async function notifySecurity(gatePass) {
  await notifyRole(ROLE.SECURITY, {
    type: NOTIFICATION_TYPE.APPROVAL,
    title: 'Approved gate pass',
    message: `${gatePass.employeeName} (${gatePass.employeeCode}) is cleared to exit — ${gatePass.gatePassNumber}`,
    link: `/security/${gatePass._id}`,
    gatePass,
    unit: gatePass.unit,
  });
  emitToRole(ROLE.SECURITY, SOCKET_EVENT.DASHBOARD_REFRESH, { reason: 'GATEPASS_APPROVED' });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Auto-close job — expires stale passes and nudges people who are still out.
 * ──────────────────────────────────────────────────────────────────────────── */
export const runExpiryJob = async () => {
  const settings = await getSettings();
  if (!settings.workflow.autoClosePass) return { expired: 0, reminded: 0 };

  const now = new Date();

  const stale = await GatePass.find({
    status: { $in: [GATEPASS_STATUS.PENDING, GATEPASS_STATUS.CHANGES_REQUESTED, GATEPASS_STATUS.HR_REVIEW, GATEPASS_STATUS.APPROVED] },
    expiresAt: { $lt: now },
    isDeleted: false,
  });

  for (const gatePass of stale) {
    gatePass.status = GATEPASS_STATUS.EXPIRED;
    gatePass.stage = WORKFLOW_STAGE.DONE;
    gatePass.pushTimeline({
      action: 'EXPIRED',
      toStatus: GATEPASS_STATUS.EXPIRED,
      actorName: 'System',
      comment: `Auto-expired after ${settings.workflow.expiryHours}h`,
    });
    await gatePass.save();

    await notify({
      recipient: gatePass.employee,
      type: NOTIFICATION_TYPE.REMINDER,
      title: 'Gate pass expired',
      message: `${gatePass.gatePassNumber} expired without being used`,
      link: `/my-gate-pass/${gatePass._id}`,
      gatePass,
    });
  }

  // Overdue returns — the employee is still out past their expected in-time.
  let reminded = 0;
  if (settings.workflow.autoReminder) {
    const overdue = await GatePass.find({
      status: GATEPASS_STATUS.OUT,
      expectedInTime: { $lt: now },
      isDeleted: false,
    }).limit(200);

    for (const gatePass of overdue) {
      const lateBy = dayjs(now).diff(dayjs(gatePass.expectedInTime), 'minute');
      // One nudge per hour of lateness, not on every tick.
      if (lateBy % 60 > 5) continue;

      await notify({
        recipient: gatePass.employee,
        type: NOTIFICATION_TYPE.REMINDER,
        title: 'You are overdue',
        message: `You are ${lateBy} minutes past the expected return time for ${gatePass.gatePassNumber}`,
        link: `/my-gate-pass/${gatePass._id}`,
        gatePass,
      });
      reminded += 1;
    }
  }

  if (stale.length || reminded) {
    logger.info(`Expiry job: expired ${stale.length}, reminded ${reminded}`);
  }
  return { expired: stale.length, reminded };
};

export default {
  createGatePass,
  approveGatePass,
  rejectGatePass,
  requestChanges,
  resubmitGatePass,
  reviewGatePass,
  markExit,
  markReturn,
  cancelGatePass,
  runExpiryJob,
};
