import ApiError from '../../../utils/ApiError.js';
import User from '../../../models/User.js';
import Counter from '../../../models/Counter.js';
import { notify } from '../../../services/notification.service.js';
import { recordAudit } from '../../../services/audit.service.js';
import { emitToUser } from '../../../services/socket.service.js';
import { NOTIFICATION_TYPE, AUDIT_ACTION, SOCKET_EVENT } from '../../../constants/index.js';
import { dayjs } from '../../../utils/dates.js';
import env from '../../../config/env.js';

import LeaveType from '../models/LeaveType.js';
import LeaveRequest from '../models/LeaveRequest.js';
import { computeLeaveDays } from './leaveCalendar.service.js';
import { reserve, release, getBalance } from './leaveBalance.service.js';
import { currentLeaveYear } from './leaveDashboard.service.js';
import { LEAVE_STATUS, LEAVE_STAGE, DAY_PART, ACTIVE_HOLD_STATUSES } from '../constants/index.js';

const linkTo = (request) => `${env.clientUrl}/leave/${request._id}`;

/** Statuses that still hold a claim on the employee's calendar. */
const OVERLAP_STATUSES = ACTIVE_HOLD_STATUSES;

const generateLeaveNumber = async (unitCode, year) => {
  const seq = await Counter.next(`leave:${unitCode}:${year}`);
  return `LV-${unitCode}-${year}-${String(seq).padStart(6, '0')}`;
};

/** Hydrates the employee with the refs the application needs. */
const loadEmployee = async (employeeId) => {
  const employee = await User.findById(employeeId)
    .populate('unit', 'code name')
    .populate('department', 'name')
    .populate('reportingManager', 'name email');

  if (!employee) throw ApiError.notFound('Employee not found');
  if (employee.status !== 'ACTIVE') {
    throw ApiError.badRequest(`${employee.name} is ${employee.status.toLowerCase()} and cannot apply for leave.`);
  }
  return employee;
};

/**
 * Everything the apply form needs in one call: the employee's identity, their
 * routing manager, the active leave types and the balance for each.
 */
export const getPrefill = async (user, targetEmployeeId = null) => {
  const employee = targetEmployeeId ? await loadEmployee(targetEmployeeId) : user;
  const leaveYear = currentLeaveYear();

  const types = await LeaveType.find({ isActive: true }).sort('code').lean();

  const leaveTypes = await Promise.all(
    types.map(async (type) => {
      const balance = await getBalance(employee._id, type._id, leaveYear);
      return {
        _id: String(type._id),
        code: type.code,
        name: type.name,
        type: type.type,
        category: type.category,
        color: type.color,
        allowHalfDay: type.allowHalfDay,
        includeWeeklyOff: type.includeWeeklyOff,
        includeHolidays: type.includeHolidays,
        annualQuota: type.annualQuota,
        balance: balance ?? { entitled: 0, used: 0, pending: 0, available: 0 },
      };
    })
  );

  return {
    leaveYear,
    employee: {
      _id: String(employee._id),
      name: employee.name,
      employeeId: employee.employeeId,
      designation: employee.designation ?? '',
      department: employee.department?.name ?? '',
      unit: employee.unit?.name ?? '',
      reportingManager: employee.reportingManager?.name ?? '',
      hasManager: Boolean(employee.reportingManager),
    },
    leaveTypes,
  };
};

/**
 * Dry run: the duration and balance impact of a range, without writing
 * anything. Powers the live "Leave Duration" panel on the form.
 */
export const previewApplication = async (user, payload, targetEmployeeId = null) => {
  const employee = targetEmployeeId ? await loadEmployee(targetEmployeeId) : user;
  const leaveType = await LeaveType.findById(payload.leaveType).lean();
  if (!leaveType) throw ApiError.notFound('Leave type not found');
  if (!leaveType.isActive) throw ApiError.badRequest(`${leaveType.name} is not available.`);

  const computed = await computeLeaveDays({
    leaveType,
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    fromDayPart: payload.fromDayPart,
    toDayPart: payload.toDayPart,
    unitId: employee.unit?._id ?? employee.unit,
  });

  const leaveYear = currentLeaveYear();
  const balance = await getBalance(employee._id, leaveType._id, leaveYear);
  const available = balance?.available ?? 0;

  const overlap = await LeaveRequest.findOne({
    employee: employee._id,
    isDeleted: false,
    status: { $in: OVERLAP_STATUSES },
    fromDate: { $lte: dayjs(payload.toDate).endOf('day').toDate() },
    toDate: { $gte: dayjs(payload.fromDate).startOf('day').toDate() },
  })
    .select('leaveNumber fromDate toDate status')
    .lean();

  return {
    ...computed,
    leaveYear,
    balance: balance ?? { entitled: 0, used: 0, pending: 0, available: 0 },
    // UNPAID types draw down nothing, so they can never be short.
    sufficient: leaveType.type === 'UNPAID' || available >= computed.totalDays,
    shortfall:
      leaveType.type === 'UNPAID' ? 0 : Math.max(0, computed.totalDays - available),
    overlap: overlap
      ? { leaveNumber: overlap.leaveNumber, fromDate: overlap.fromDate, toDate: overlap.toDate, status: overlap.status }
      : null,
  };
};

/**
 * Creates one leave application.
 *
 * Order matters: the balance is reserved BEFORE the request is written, and
 * released if the write fails. Standalone MongoDB has no transactions, so the
 * reserve/compensate pair is what keeps the two in step.
 */
export const applyForLeave = async (actor, payload, { req, onBehalfOf = null } = {}) => {
  const employee = onBehalfOf ? await loadEmployee(onBehalfOf) : actor;
  const isOnBehalf = Boolean(onBehalfOf) && String(onBehalfOf) !== String(actor._id);

  const leaveType = await LeaveType.findById(payload.leaveType).lean();
  if (!leaveType) throw ApiError.notFound('Leave type not found');
  if (!leaveType.isActive) throw ApiError.badRequest(`${leaveType.name} is not available for application.`);

  if (!employee.reportingManager) {
    throw ApiError.badRequest(
      `${isOnBehalf ? employee.name + ' has' : 'You have'} no reporting manager assigned. Contact HR before applying for leave.`
    );
  }

  const computed = await computeLeaveDays({
    leaveType,
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    fromDayPart: payload.fromDayPart,
    toDayPart: payload.toDayPart,
    unitId: employee.unit?._id ?? employee.unit,
  });

  // A range made entirely of uncharged weekends/holidays costs nothing, which
  // means there is nothing to apply for.
  if (computed.totalDays <= 0) {
    throw ApiError.badRequest(
      'That range contains no chargeable days — every date is a weekly off or holiday for this leave type.'
    );
  }

  const overlap = await LeaveRequest.findOne({
    employee: employee._id,
    isDeleted: false,
    status: { $in: OVERLAP_STATUSES },
    fromDate: { $lte: dayjs(payload.toDate).endOf('day').toDate() },
    toDate: { $gte: dayjs(payload.fromDate).startOf('day').toDate() },
  })
    .select('leaveNumber fromDate toDate')
    .lean();

  if (overlap) {
    throw ApiError.conflict(
      `This overlaps ${overlap.leaveNumber} (${dayjs(overlap.fromDate).format('DD MMM')} – ${dayjs(overlap.toDate).format('DD MMM')}).`,
      { leaveNumber: overlap.leaveNumber }
    );
  }

  const leaveYear = currentLeaveYear();

  // ── Insufficient balance check — atomic, so concurrent applications cannot
  //    both slip through. Throws with a specific message on failure.
  const reservation = await reserve({
    employeeId: employee._id,
    leaveType,
    leaveYear,
    days: computed.totalDays,
    employeeName: isOnBehalf ? employee.name : null,
  });

  let request;
  try {
    const unitCode = employee.unit?.code ?? 'GEN';
    const leaveNumber = await generateLeaveNumber(unitCode, dayjs(payload.fromDate).year());

    request = await LeaveRequest.create({
      leaveNumber,
      employee: employee._id,
      employeeCode: employee.employeeId,
      employeeName: employee.name,
      department: employee.department?._id ?? employee.department,
      departmentName: employee.department?.name ?? '',
      unit: employee.unit?._id ?? employee.unit,
      unitName: employee.unit?.name ?? '',
      designation: employee.designation ?? '',

      leaveType: leaveType._id,
      leaveTypeCode: leaveType.code,
      leaveTypeName: leaveType.name,

      fromDate: dayjs(payload.fromDate).startOf('day').toDate(),
      toDate: dayjs(payload.toDate).startOf('day').toDate(),
      fromDayPart: payload.fromDayPart ?? DAY_PART.FULL,
      toDayPart: payload.toDayPart ?? DAY_PART.FULL,
      totalDays: computed.totalDays,
      workingDaysBreakdown: computed.breakdown,

      reason: payload.reason,
      contactDuringLeave: payload.contactDuringLeave ?? '',
      handoverNotes: payload.handoverNotes ?? '',

      reportingManager: employee.reportingManager?._id ?? employee.reportingManager,
      reportingManagerName: employee.reportingManager?.name ?? '',

      status: LEAVE_STATUS.PENDING,
      stage: LEAVE_STAGE.MANAGER,
      leaveYear,
      balanceSnapshot: {
        availableAtSubmission: reservation.balance
          ? reservation.balance.available + computed.totalDays
          : 0,
        afterDeduction: reservation.balance?.available ?? 0,
      },
      appliedOnBehalf: isOnBehalf,
      appliedBy: actor._id,

      timeline: [
        {
          action: isOnBehalf ? 'SUBMITTED_ON_BEHALF' : 'SUBMITTED',
          toStatus: LEAVE_STATUS.PENDING,
          actor: actor._id,
          actorName: actor.name,
          actorRole: actor.role?.key,
          comment: isOnBehalf ? `Applied by ${actor.name} on behalf of ${employee.name}` : 'Leave applied',
        },
      ],
      createdBy: actor._id,
    });
  } catch (error) {
    // The reservation must not survive a failed write.
    if (!reservation.skipped) {
      await release({
        employeeId: employee._id,
        leaveTypeId: leaveType._id,
        leaveYear,
        days: computed.totalDays,
      });
    }
    throw error;
  }

  // ── Side effects. None of these may fail the application. ────────────────
  await notify({
    recipient: employee.reportingManager?._id ?? employee.reportingManager,
    actor,
    type: NOTIFICATION_TYPE.SUBMITTED,
    title: 'New leave application to approve',
    message: `${employee.name} applied for ${computed.totalDays} day(s) of ${leaveType.name}`,
    link: `/leave/approvals`,
    // The leave module rides on `meta` rather than adding a ref field to the
    // shared Notification model.
    meta: { module: 'LEAVE', leaveRequestId: String(request._id), leaveNumber: request.leaveNumber },
  });

  if (isOnBehalf) {
    await notify({
      recipient: employee._id,
      actor,
      type: NOTIFICATION_TYPE.SUBMITTED,
      title: 'Leave applied on your behalf',
      message: `${actor.name} applied for ${computed.totalDays} day(s) of ${leaveType.name} for you`,
      link: `/leave/my-leaves`,
      meta: { module: 'LEAVE', leaveRequestId: String(request._id), leaveNumber: request.leaveNumber },
    });
  }

  await recordAudit({
    action: isOnBehalf ? AUDIT_ACTION.LEAVE_APPLY_BULK : AUDIT_ACTION.LEAVE_APPLY,
    actor,
    entity: 'LeaveRequest',
    entityId: request._id,
    entityLabel: request.leaveNumber,
    description: isOnBehalf
      ? `Applied ${computed.totalDays} day(s) of ${leaveType.name} for ${employee.name}`
      : `Applied for ${computed.totalDays} day(s) of ${leaveType.name}`,
    req,
    unit: employee.unit?._id ?? employee.unit,
  });

  emitToUser(employee.reportingManager?._id ?? employee.reportingManager, SOCKET_EVENT.DASHBOARD_REFRESH, {
    reason: 'LEAVE_APPLIED',
  });

  return request;
};

/**
 * HR applies the same leave to many employees.
 *
 * Each employee is independent — one person's insufficient balance must not
 * block the rest — so failures are collected and reported per employee rather
 * than aborting the batch.
 */
export const applyBulk = async (actor, payload, { req } = {}) => {
  const { employees, ...rest } = payload;
  const applied = [];
  const failed = [];

  for (const employeeId of employees) {
    try {
      const request = await applyForLeave(actor, rest, { req, onBehalfOf: employeeId });
      applied.push({
        employee: employeeId,
        employeeName: request.employeeName,
        leaveNumber: request.leaveNumber,
        totalDays: request.totalDays,
      });
    } catch (error) {
      const person = await User.findById(employeeId).select('name').lean();
      failed.push({
        employee: employeeId,
        employeeName: person?.name ?? String(employeeId),
        reason: error.message,
      });
    }
  }

  return { requested: employees.length, applied, failed };
};

export default { getPrefill, previewApplication, applyForLeave, applyBulk };
