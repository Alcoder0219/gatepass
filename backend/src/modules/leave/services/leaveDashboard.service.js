import LeaveType from '../models/LeaveType.js';
import LeaveRequest from '../models/LeaveRequest.js';
import LeaveBalance from '../models/LeaveBalance.js';
import { buildLeaveScope, hasTeamVisibility } from './leaveScope.service.js';
import { dayjs } from '../../../utils/dates.js';
import { LEAVE_STATUS, PENDING_STATUSES, APPROVED_STATUSES } from '../constants/index.js';

/**
 * The leave year label an April–March period falls in, e.g. '2026-2027'.
 * Assumption A5 from the implementation plan — the one place to change it if the
 * business blueprint says Jan–Dec.
 */
export const currentLeaveYear = (at = new Date()) => {
  const d = dayjs(at);
  const startYear = d.month() >= 3 ? d.year() : d.year() - 1; // month is 0-indexed; 3 = April
  return `${startYear}-${startYear + 1}`;
};

/** Every dashboard query starts from what the caller is allowed to read. */
const scopedMatch = async (user, extra = {}) => {
  const scope = await buildLeaveScope(user);
  return { ...scope, isDeleted: false, ...extra };
};

/**
 * The six counters plus the two feeds behind the Leave Dashboard, resolved in
 * one pass. Counts are scoped; the balance summary is always the caller's own.
 */
export const getDashboardStats = async (user) => {
  const match = await scopedMatch(user);
  const now = dayjs();
  const todayStart = now.startOf('day').toDate();
  const todayEnd = now.endOf('day').toDate();

  const [totalLeaveTypes, statusFacet, onLeaveToday, recent, balances] = await Promise.all([
    LeaveType.countDocuments({ isActive: true }),

    LeaveRequest.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 }, days: { $sum: '$totalDays' } } },
    ]),

    // Approved leave whose date range straddles today.
    LeaveRequest.find({
      ...match,
      status: { $in: APPROVED_STATUSES },
      fromDate: { $lte: todayEnd },
      toDate: { $gte: todayStart },
    })
      .select('employeeName employeeCode departmentName leaveTypeName leaveTypeCode fromDate toDate totalDays')
      .sort({ fromDate: 1 })
      .limit(50)
      .lean(),

    LeaveRequest.find(match)
      .select('leaveNumber employeeName leaveTypeName leaveTypeCode fromDate toDate totalDays status createdAt')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),

    // NOT `.lean({ virtuals: true })` — that option needs the mongoose-lean-virtuals
    // plugin, which is not installed; without it mongoose ignores it silently and
    // every virtual comes back undefined. The totals are computed below instead.
    LeaveBalance.find({ employee: user._id, leaveYear: currentLeaveYear() })
      .populate('leaveType', 'code name color type annualQuota')
      .lean(),
  ]);

  const countBy = (statuses) =>
    statusFacet.filter((row) => statuses.includes(row._id)).reduce((sum, row) => sum + row.count, 0);

  return {
    leaveYear: currentLeaveYear(),
    scope: hasTeamVisibility(user) ? 'TEAM' : 'OWN',

    totals: {
      leaveTypes: totalLeaveTypes,
      pending: countBy(PENDING_STATUSES),
      approved: countBy([LEAVE_STATUS.APPROVED]),
      rejected: countBy([LEAVE_STATUS.REJECTED]),
      onLeaveToday: onLeaveToday.length,
      totalRequests: statusFacet.reduce((sum, row) => sum + row.count, 0),
    },

    onLeaveToday: onLeaveToday.map((row) => ({
      id: String(row._id),
      employeeName: row.employeeName,
      employeeCode: row.employeeCode,
      departmentName: row.departmentName,
      leaveTypeName: row.leaveTypeName,
      leaveTypeCode: row.leaveTypeCode,
      fromDate: row.fromDate,
      toDate: row.toDate,
      totalDays: row.totalDays,
    })),

    recentApplications: recent.map((row) => ({
      id: String(row._id),
      leaveNumber: row.leaveNumber,
      employeeName: row.employeeName,
      leaveTypeName: row.leaveTypeName,
      leaveTypeCode: row.leaveTypeCode,
      fromDate: row.fromDate,
      toDate: row.toDate,
      totalDays: row.totalDays,
      status: row.status,
      createdAt: row.createdAt,
    })),

    balanceSummary: balances
      .filter((row) => row.leaveType)
      .map((row) => {
        const entitled =
          (row.opening ?? 0) + (row.accrued ?? 0) + (row.carriedForward ?? 0) + (row.adjusted ?? 0);
        const used = row.used ?? 0;
        const pending = row.pending ?? 0;
        return {
          id: String(row._id),
          code: row.leaveType.code,
          name: row.leaveType.name,
          color: row.leaveType.color,
          // `isPaid` is a virtual and .lean() drops virtuals — derive it here.
          isPaid: row.leaveType.type === 'PAID',
          entitled,
          used,
          pending,
          available: Math.max(0, entitled - used - pending),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
};

export default { getDashboardStats, currentLeaveYear };
