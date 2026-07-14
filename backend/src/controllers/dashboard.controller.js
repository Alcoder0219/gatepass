import GatePass from '../models/GatePass.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { buildGatePassScope } from '../services/scope.service.js';
import { dayjs } from '../utils/dates.js';
import { GATEPASS_STATUS, GATEPASS_TYPE } from '../constants/index.js';

/**
 * Every pipeline on this controller starts from the caller's scope — an HOD's
 * dashboard counts their reportees, an employee's counts only their own passes.
 */
const scopedMatch = async (user, extra = {}) => {
  const scope = await buildGatePassScope(user);
  return { ...scope, isDeleted: false, ...extra };
};

const PENDING_STATUSES = [
  GATEPASS_STATUS.PENDING,
  GATEPASS_STATUS.HR_REVIEW,
  GATEPASS_STATUS.CHANGES_REQUESTED,
];
const APPROVED_LIKE = [GATEPASS_STATUS.APPROVED, GATEPASS_STATUS.OUT, GATEPASS_STATUS.COMPLETED];

const pct = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

const round = (value, dp = 1) => {
  const factor = 10 ** dp;
  return Math.round((Number(value) || 0) * factor) / factor;
};

/* ─────────────────────────────────────────────────────────────────────────────
 * GET /dashboard/stats
 * ────────────────────────────────────────────────────────────────────────── */
export const getStats = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number.parseInt(req.query.days ?? '30', 10) || 30, 1), 365);
  const match = await scopedMatch(req.user);

  const now = dayjs();
  const todayStart = now.startOf('day').toDate();
  const todayEnd = now.endOf('day').toDate();
  const periodStart = now.subtract(days, 'day').toDate();
  const previousStart = now.subtract(days * 2, 'day').toDate();

  const [facet] = await GatePass.aggregate([
    { $match: match },
    {
      $facet: {
        cards: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              pending: { $sum: { $cond: [{ $in: ['$status', PENDING_STATUSES] }, 1, 0] } },
              approved: { $sum: { $cond: [{ $in: ['$status', APPROVED_LIKE] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $eq: ['$status', GATEPASS_STATUS.REJECTED] }, 1, 0] } },
              completed: { $sum: { $cond: [{ $eq: ['$status', GATEPASS_STATUS.COMPLETED] }, 1, 0] } },
              cancelled: { $sum: { $cond: [{ $eq: ['$status', GATEPASS_STATUS.CANCELLED] }, 1, 0] } },
              official: { $sum: { $cond: [{ $eq: ['$type', GATEPASS_TYPE.OFFICIAL] }, 1, 0] } },
              personal: { $sum: { $cond: [{ $eq: ['$type', GATEPASS_TYPE.PERSONAL] }, 1, 0] } },
              currentlyOut: { $sum: { $cond: [{ $eq: ['$status', GATEPASS_STATUS.OUT] }, 1, 0] } },
              todayTotal: {
                $sum: {
                  $cond: [
                    { $and: [{ $gte: ['$createdAt', todayStart] }, { $lte: ['$createdAt', todayEnd] }] },
                    1,
                    0,
                  ],
                },
              },
              // Still outside the gate although the expected in-time has passed.
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$status', GATEPASS_STATUS.OUT] },
                        { $lt: ['$expectedInTime', now.toDate()] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
        current: [{ $match: { createdAt: { $gte: periodStart } } }, { $count: 'count' }],
        previous: [
          { $match: { createdAt: { $gte: previousStart, $lt: periodStart } } },
          { $count: 'count' },
        ],
      },
    },
  ]);

  const cards = facet?.cards?.[0] ?? {};
  const current = facet?.current?.[0]?.count ?? 0;
  const previous = facet?.previous?.[0]?.count ?? 0;
  const change = pct(current, previous);

  return sendSuccess(res, {
    message: 'Dashboard stats fetched',
    data: {
      pending: cards.pending ?? 0,
      approved: cards.approved ?? 0,
      rejected: cards.rejected ?? 0,
      completed: cards.completed ?? 0,
      cancelled: cards.cancelled ?? 0,
      todayTotal: cards.todayTotal ?? 0,
      personal: cards.personal ?? 0,
      official: cards.official ?? 0,
      currentlyOut: cards.currentlyOut ?? 0,
      overdue: cards.overdue ?? 0,
      total: cards.total ?? 0,
      trend: {
        days,
        current,
        previous,
        changePercent: change,
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
        label: `${change > 0 ? '+' : ''}${change}% vs the previous ${days} days`,
      },
    },
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * GET /dashboard/charts?days=30
 * ────────────────────────────────────────────────────────────────────────── */
export const getCharts = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number.parseInt(req.query.days ?? '30', 10) || 30, 1), 365);
  const from = dayjs().subtract(days, 'day').startOf('day').toDate();
  const match = await scopedMatch(req.user, { createdAt: { $gte: from } });

  // Daily buckets for short windows, monthly once the window gets long.
  const byMonth = days > 90;
  const format = byMonth ? '%Y-%m' : '%Y-%m-%d';

  const [facet] = await GatePass.aggregate([
    { $match: match },
    {
      $facet: {
        monthlyTrend: [
          {
            $group: {
              _id: { $dateToString: { format, date: '$createdAt' } },
              official: { $sum: { $cond: [{ $eq: ['$type', GATEPASS_TYPE.OFFICIAL] }, 1, 0] } },
              personal: { $sum: { $cond: [{ $eq: ['$type', GATEPASS_TYPE.PERSONAL] }, 1, 0] } },
              total: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        byDepartment: [
          { $group: { _id: '$departmentName', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 12 },
        ],
        byUnit: [{ $group: { _id: '$unitName', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        byManager: [
          {
            $group: {
              _id: '$reportingManager',
              name: { $first: '$reportingManagerName' },
              approved: { $sum: { $cond: [{ $in: ['$status', APPROVED_LIKE] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $eq: ['$status', GATEPASS_STATUS.REJECTED] }, 1, 0] } },
              pending: { $sum: { $cond: [{ $in: ['$status', PENDING_STATUSES] }, 1, 0] } },
              total: { $sum: 1 },
            },
          },
          { $sort: { total: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]);

  const labelOf = (key) =>
    byMonth ? dayjs(`${key}-01`).format('MMM YYYY') : dayjs(key).format('DD MMM');

  return sendSuccess(res, {
    message: 'Dashboard charts fetched',
    data: {
      range: { days, from, granularity: byMonth ? 'month' : 'day' },
      monthlyTrend: (facet?.monthlyTrend ?? []).map((r) => ({
        key: r._id,
        label: labelOf(r._id),
        official: r.official,
        personal: r.personal,
        total: r.total,
      })),
      byDepartment: (facet?.byDepartment ?? []).map((r) => ({ name: r._id ?? 'Unassigned', count: r.count })),
      byUnit: (facet?.byUnit ?? []).map((r) => ({ name: r._id ?? 'Unassigned', count: r.count })),
      byStatus: (facet?.byStatus ?? []).map((r) => ({ status: r._id, count: r.count })),
      byManager: (facet?.byManager ?? []).map((r) => ({
        id: r._id,
        name: r.name || 'Unassigned',
        approved: r.approved,
        rejected: r.rejected,
        pending: r.pending,
      })),
    },
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * GET /dashboard/activity?limit=10
 * ────────────────────────────────────────────────────────────────────────── */
export const getActivity = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '10', 10) || 10, 1), 50);
  const match = await scopedMatch(req.user);

  const events = await GatePass.aggregate([
    { $match: match },
    { $unwind: '$timeline' },
    { $sort: { 'timeline.at': -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        id: '$timeline._id',
        gatePassId: '$_id',
        gatePassNumber: 1,
        employeeName: 1,
        action: '$timeline.action',
        fromStatus: '$timeline.fromStatus',
        toStatus: '$timeline.toStatus',
        actorName: '$timeline.actorName',
        actorRole: '$timeline.actorRole',
        comment: '$timeline.comment',
        at: '$timeline.at',
      },
    },
  ]);

  return sendSuccess(res, { message: 'Recent activity fetched', data: events });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * GET /dashboard/insights — "AI Dashboard Insights", pure statistics.
 * ────────────────────────────────────────────────────────────────────────── */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Least-squares slope/intercept over [{x, y}] — the 8-week volume projection. */
const linearFit = (points) => {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (!denominator) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
};

export const getInsights = asyncHandler(async (req, res) => {
  const now = dayjs();
  const eightWeeksAgo = now.subtract(8, 'week').startOf('day').toDate();
  const weekStart = now.subtract(7, 'day').toDate();
  const priorWeekStart = now.subtract(14, 'day').toDate();

  const match = await scopedMatch(req.user);

  const [facet] = await GatePass.aggregate([
    { $match: match },
    {
      $facet: {
        // Peak weekday / hour over the whole visible history.
        byWeekday: [
          { $group: { _id: { $dayOfWeek: '$expectedOutTime' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        byHour: [
          { $group: { _id: { $hour: '$expectedOutTime' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        // Week-over-week movement per department.
        deptWoW: [
          { $match: { createdAt: { $gte: priorWeekStart } } },
          {
            $group: {
              _id: '$departmentName',
              thisWeek: { $sum: { $cond: [{ $gte: ['$createdAt', weekStart] }, 1, 0] } },
              lastWeek: { $sum: { $cond: [{ $lt: ['$createdAt', weekStart] }, 1, 0] } },
            },
          },
        ],
        approval: [
          { $match: { 'approval.approvedAt': { $ne: null } } },
          {
            $group: {
              _id: null,
              avgMinutes: {
                $avg: { $divide: [{ $subtract: ['$approval.approvedAt', '$createdAt'] }, 60_000] },
              },
              count: { $sum: 1 },
            },
          },
        ],
        returns: [
          { $match: { 'security.actualInTime': { $ne: null } } },
          {
            $group: {
              _id: null,
              returned: { $sum: 1 },
              late: { $sum: { $cond: [{ $eq: ['$isLate', true] }, 1, 0] } },
              avgLateMinutes: {
                $avg: { $cond: [{ $eq: ['$isLate', true] }, '$lateByMinutes', null] },
              },
            },
          },
        ],
        // 8 weekly buckets for the linear projection.
        weekly: [
          { $match: { createdAt: { $gte: eightWeeksAgo } } },
          {
            $group: {
              _id: { $dateToString: { format: '%G-W%V', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        mix: [
          { $match: { createdAt: { $gte: weekStart } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              personal: { $sum: { $cond: [{ $eq: ['$type', GATEPASS_TYPE.PERSONAL] }, 1, 0] } },
            },
          },
        ],
      },
    },
  ]);

  const insights = [];
  const push = (id, title, message, sentiment = 'neutral', metric) =>
    insights.push({ id, title, message, sentiment, ...(metric ? { metric } : {}) });

  /* 1 — peak day + hour */
  const peakDay = facet?.byWeekday?.[0];
  const peakHour = facet?.byHour?.[0];
  if (peakDay?._id) {
    const dayName = DAY_NAMES[peakDay._id - 1] ?? 'Weekday';
    const hourText =
      peakHour?._id != null ? ` and the busiest hour is ${String(peakHour._id).padStart(2, '0')}:00` : '';
    push(
      'peak-window',
      'Peak gate traffic',
      `${dayName} carries the most gate passes (${peakDay.count} in total)${hourText}. Staffing the gate a little heavier in that window will cut queueing.`,
      'neutral',
      `${dayName}${peakHour?._id != null ? ` · ${String(peakHour._id).padStart(2, '0')}:00` : ''}`
    );
  }

  /* 2 — department trending up week over week */
  const trending = (facet?.deptWoW ?? [])
    .map((row) => ({
      name: row._id ?? 'Unassigned',
      thisWeek: row.thisWeek,
      lastWeek: row.lastWeek,
      change: pct(row.thisWeek, row.lastWeek),
    }))
    .filter((row) => row.thisWeek >= 2)
    .sort((a, b) => b.change - a.change)[0];

  if (trending && trending.change > 0) {
    push(
      'dept-trending',
      `${trending.name} is trending up`,
      `${trending.name} raised ${trending.thisWeek} gate pass(es) this week against ${trending.lastWeek} last week — a ${trending.change}% rise. Worth a look if it is not a planned activity.`,
      trending.change >= 50 ? 'warning' : 'neutral',
      `+${trending.change}%`
    );
  } else if (trending) {
    push(
      'dept-trending',
      'Volumes are settling',
      `No department is trending up this week; ${trending.name} leads with ${trending.thisWeek} pass(es), level with last week.`,
      'positive',
      `${trending.change}%`
    );
  }

  /* 3 — approval turnaround */
  const approval = facet?.approval?.[0];
  if (approval?.count) {
    const minutes = round(approval.avgMinutes);
    const readable = minutes >= 60 ? `${round(minutes / 60)}h` : `${Math.round(minutes)}m`;
    const good = minutes <= 120;
    push(
      'approval-turnaround',
      'Approval turnaround',
      good
        ? `Managers are approving in ${readable} on average across ${approval.count} decided pass(es) — comfortably inside a working session.`
        : `Approvals are taking ${readable} on average across ${approval.count} pass(es). Anything over two hours starts to strand employees at the gate.`,
      good ? 'positive' : 'warning',
      readable
    );
  }

  /* 4 — late-return rate */
  const returns = facet?.returns?.[0];
  if (returns?.returned) {
    const rate = round((returns.late / returns.returned) * 100);
    const sentiment = rate >= 20 ? 'warning' : rate > 0 ? 'neutral' : 'positive';
    push(
      'late-returns',
      'Late-return rate',
      rate === 0
        ? `Every one of the ${returns.returned} returned pass(es) came back on time. Gate discipline is holding.`
        : `${rate}% of the ${returns.returned} returned pass(es) came back late${
            returns.avgLateMinutes ? `, by ${Math.round(returns.avgLateMinutes)} minutes on average` : ''
          }.${rate >= 20 ? ' That is high enough to warrant a reminder to the departments concerned.' : ''}`,
      sentiment,
      `${rate}%`
    );
  }

  /* 5 — next-week projection from a linear fit over the last 8 weeks */
  const weekly = facet?.weekly ?? [];
  if (weekly.length >= 3) {
    const points = weekly.map((row, index) => ({ x: index, y: row.count }));
    const { slope, intercept } = linearFit(points);
    const projected = Math.max(0, Math.round(slope * points.length + intercept));
    const lastWeek = points[points.length - 1].y;
    const direction = slope > 0.5 ? 'rising' : slope < -0.5 ? 'falling' : 'flat';
    push(
      'projection',
      'Next-week projection',
      `Fitting a trend line across the last ${points.length} week(s) — where volume is ${direction} — next week should land near ${projected} gate pass(es), against ${lastWeek} in the week just gone.`,
      direction === 'rising' ? 'warning' : 'neutral',
      `≈ ${projected} passes`
    );
  }

  /* 6 — personal vs official mix */
  const mix = facet?.mix?.[0];
  if (mix?.total) {
    const share = round((mix.personal / mix.total) * 100);
    push(
      'type-mix',
      'Personal vs official mix',
      `${share}% of this week's ${mix.total} pass(es) were personal. ${
        share > 60
          ? 'Personal exits are dominating — quota settings may need a review.'
          : 'The balance between official and personal movement looks healthy.'
      }`,
      share > 60 ? 'warning' : 'positive',
      `${share}% personal`
    );
  }

  if (!insights.length) {
    push(
      'no-data',
      'Not enough data yet',
      'There are not enough gate passes in your view to draw conclusions. Insights appear once a handful of passes have been raised and decided.',
      'neutral'
    );
  }

  return sendSuccess(res, {
    message: 'Insights generated',
    data: insights.slice(0, 6),
    meta: { generatedAt: new Date() },
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * GET /dashboard/calendar?from=&to=
 * ────────────────────────────────────────────────────────────────────────── */
export const getCalendar = asyncHandler(async (req, res) => {
  const from = req.query.from ? dayjs(req.query.from) : dayjs().startOf('month');
  const to = req.query.to ? dayjs(req.query.to) : dayjs().endOf('month');

  const match = await scopedMatch(req.user, {
    expectedOutTime: { $gte: from.startOf('day').toDate(), $lte: to.endOf('day').toDate() },
  });

  const passes = await GatePass.find(match)
    .select('gatePassNumber employeeName type status expectedOutTime expectedInTime departmentName unitName')
    .sort({ expectedOutTime: 1 })
    .limit(500)
    .lean();

  const events = passes.map((pass) => ({
    id: pass._id,
    title: `${pass.gatePassNumber} · ${pass.employeeName}`,
    start: pass.expectedOutTime,
    end: pass.expectedInTime,
    status: pass.status,
    type: pass.type,
    employeeName: pass.employeeName,
    department: pass.departmentName,
    unit: pass.unitName,
  }));

  return sendSuccess(res, {
    message: 'Calendar fetched',
    data: events,
    meta: { from: from.toDate(), to: to.toDate(), count: events.length },
  });
});

export default { getStats, getCharts, getActivity, getInsights, getCalendar };
