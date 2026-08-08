import ApiError from '../../../utils/ApiError.js';
import { notify } from '../../../services/notification.service.js';
import { recordAudit } from '../../../services/audit.service.js';
import { NOTIFICATION_TYPE, AUDIT_ACTION } from '../../../constants/index.js';
import { dateFilter, dayjs } from '../../../utils/dates.js';

import LeaveRequest from '../models/LeaveRequest.js';
import { release, refund } from './leaveBalance.service.js';
import { LEAVE_STATUS, PENDING_STATUSES, APPROVED_STATUSES } from '../constants/index.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where a deleted request's days must be given back from.
 *
 *   PENDING / HR_REVIEW / CHANGES_REQUESTED → the days are RESERVED  → release()
 *   APPROVED / COMPLETED                    → the days are USED      → refund()
 *   REJECTED / CANCELLED                    → nothing is held        → no-op
 *
 * Getting this wrong in either direction is a real balance error, so the bucket
 * is decided once, here, and recorded on the document.
 */
export const restoreBucketFor = (status) => {
  if (PENDING_STATUSES.includes(status)) return 'PENDING';
  if (APPROVED_STATUSES.includes(status)) return 'USED';
  return 'NONE';
};

/** Shared filter builder for both the live list and the deletion register. */
const buildFilter = ({ search, employee, leaveType, status, unit, department, from, to }, extra = {}) => {
  const filter = { ...extra };

  if (employee) filter.employee = employee;
  if (leaveType) filter.leaveType = leaveType;
  if (status) filter.status = status;
  if (unit) filter.unit = unit;
  if (department) filter.department = department;

  const range = dateFilter(from, to);
  if (range) filter.fromDate = range;

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { leaveNumber: rx },
      { employeeName: rx },
      { employeeCode: rx },
      { reason: rx },
      { leaveTypeName: rx },
    ];
  }

  return filter;
};

/** Live (not deleted) applications — the candidates for deletion. */
export const listDeletable = async (query) => {
  const { page, limit, sort } = query;
  const filter = buildFilter(query, { isDeleted: false });
  return LeaveRequest.paginate(filter, { page, limit, sort: sort || '-createdAt', lean: true });
};

/** The deletion register — what was deleted, by whom, when and why. */
export const listDeleted = async (query) => {
  const { page, limit, sort } = query;
  const filter = buildFilter(query, { isDeleted: true });

  if (query.deletedBy) filter['deletion.deletedBy'] = query.deletedBy;
  const deletedRange = dateFilter(query.deletedFrom, query.deletedTo);
  if (deletedRange) filter['deletion.deletedAt'] = deletedRange;

  return LeaveRequest.paginate(filter, {
    page,
    limit,
    sort: sort || '-deletion.deletedAt',
    lean: true,
  });
};

/**
 * Deletion report: totals, days given back, and who has been deleting.
 * Bounded by the same filters as the register so the numbers always match the
 * table the user is looking at.
 */
export const deletionSummary = async (query) => {
  const filter = buildFilter(query, { isDeleted: true });
  if (query.deletedBy) filter['deletion.deletedBy'] = query.deletedBy;
  const deletedRange = dateFilter(query.deletedFrom, query.deletedTo);
  if (deletedRange) filter['deletion.deletedAt'] = deletedRange;

  const [facet] = await LeaveRequest.aggregate([
    { $match: filter },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              deletions: { $sum: 1 },
              daysRestored: { $sum: '$deletion.restoredDays' },
              employees: { $addToSet: '$employee' },
            },
          },
          { $project: { _id: 0, deletions: 1, daysRestored: 1, employees: { $size: '$employees' } } },
        ],
        byBucket: [
          { $group: { _id: '$deletion.restoredFrom', count: { $sum: 1 }, days: { $sum: '$deletion.restoredDays' } } },
        ],
        byStatus: [{ $group: { _id: '$deletion.statusAtDeletion', count: { $sum: 1 } } }],
        byDeleter: [
          {
            $group: {
              _id: '$deletion.deletedByName',
              count: { $sum: 1 },
              days: { $sum: '$deletion.restoredDays' },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        byLeaveType: [
          { $group: { _id: '$leaveTypeCode', count: { $sum: 1 }, days: { $sum: '$deletion.restoredDays' } } },
          { $sort: { count: -1 } },
        ],
      },
    },
  ]);

  return {
    totals: facet?.totals?.[0] ?? { deletions: 0, daysRestored: 0, employees: 0 },
    byBucket: facet?.byBucket ?? [],
    byStatus: facet?.byStatus ?? [],
    byDeleter: facet?.byDeleter ?? [],
    byLeaveType: facet?.byLeaveType ?? [],
  };
};

/**
 * Deletes one leave record and gives the days back.
 *
 * The balance is restored BEFORE the flag is set: if the restore fails the
 * request stays live and visible, which is recoverable. The reverse order would
 * hide a record whose days were never returned.
 */
export const deleteLeave = async (actor, id, { reason, req } = {}) => {
  const request = await LeaveRequest.findById(id);
  if (!request) throw ApiError.notFound('Leave application not found');

  if (request.isDeleted) {
    throw ApiError.conflict(
      `${request.leaveNumber} was already deleted by ${request.deletion?.deletedByName || 'someone'} on ${
        request.deletion?.deletedAt ? dayjs(request.deletion.deletedAt).format('DD MMM YYYY') : 'an earlier date'
      }.`
    );
  }

  if (!reason?.trim()) {
    throw ApiError.badRequest('A reason is required when deleting a leave record.');
  }

  const statusAtDeletion = request.status;
  const bucket = restoreBucketFor(statusAtDeletion);
  let restoredDays = 0;

  if (bucket === 'PENDING') {
    await release({
      employeeId: request.employee,
      leaveTypeId: request.leaveType,
      leaveYear: request.leaveYear,
      days: request.totalDays,
    });
    restoredDays = request.totalDays;
  } else if (bucket === 'USED') {
    const updated = await refund({
      employeeId: request.employee,
      leaveTypeId: request.leaveType,
      leaveYear: request.leaveYear,
      days: request.totalDays,
    });
    // A null result means the balance no longer held enough `used` days to give
    // back — record 0 rather than claiming a restore that did not happen.
    restoredDays = updated ? request.totalDays : 0;
  }

  request.isDeleted = true;
  request.deletion = {
    deletedBy: actor._id,
    deletedByName: actor.name,
    deletedAt: new Date(),
    reason: reason.trim(),
    statusAtDeletion,
    restoredDays,
    restoredFrom: bucket,
  };
  request.updatedBy = actor._id;

  request.timeline.push({
    action: 'DELETED',
    fromStatus: statusAtDeletion,
    toStatus: statusAtDeletion,
    actor: actor._id,
    actorName: actor.name,
    actorRole: actor.role?.key,
    comment: reason.trim(),
    at: new Date(),
  });

  await request.save();

  await notify({
    recipient: request.employee,
    actor,
    type: NOTIFICATION_TYPE.CANCELLED,
    title: 'Leave record deleted',
    message:
      restoredDays > 0
        ? `${request.leaveNumber} was deleted by ${actor.name}. ${restoredDays} day(s) were returned to your balance. Reason: ${reason.trim()}`
        : `${request.leaveNumber} was deleted by ${actor.name}. Reason: ${reason.trim()}`,
    link: '/leave/my-leaves',
    meta: { module: 'LEAVE', leaveRequestId: String(request._id), leaveNumber: request.leaveNumber },
  });

  await recordAudit({
    action: AUDIT_ACTION.LEAVE_DELETE,
    actor,
    entity: 'LeaveRequest',
    entityId: request._id,
    entityLabel: request.leaveNumber,
    description:
      `Deleted ${request.totalDays} day(s) of ${request.leaveTypeName} for ${request.employeeName} ` +
      `(was ${statusAtDeletion}) — ${restoredDays} day(s) restored from ${bucket.toLowerCase()}. Reason: ${reason.trim()}`,
    changes: {
      status: { from: statusAtDeletion, to: 'DELETED' },
      balance: { from: bucket, to: `restored ${restoredDays}` },
    },
    req,
    unit: request.unit,
  });

  return request;
};

/** Flat rows for the CSV export. */
export const deletionRows = async (query) => {
  const filter = buildFilter(query, { isDeleted: true });
  if (query.deletedBy) filter['deletion.deletedBy'] = query.deletedBy;
  const deletedRange = dateFilter(query.deletedFrom, query.deletedTo);
  if (deletedRange) filter['deletion.deletedAt'] = deletedRange;

  return LeaveRequest.find(filter).sort('-deletion.deletedAt').limit(5000).lean();
};

export default {
  listDeletable,
  listDeleted,
  deletionSummary,
  deleteLeave,
  deletionRows,
  restoreBucketFor,
  LEAVE_STATUS,
};
