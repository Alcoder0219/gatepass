import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/ApiResponse.js';
import { dateFilter, dayjs } from '../utils/dates.js';
import { AUDIT_ACTIONS } from '../constants/index.js';

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildAuditFilter = (query = {}) => {
  const filter = {};

  if (query.action) {
    const actions = String(query.action)
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter((a) => AUDIT_ACTIONS.includes(a));
    if (actions.length) filter.action = { $in: actions };
  }

  if (query.actor && mongoose.isValidObjectId(query.actor)) {
    filter.actor = new mongoose.Types.ObjectId(String(query.actor));
  }

  if (query.entity) filter.entity = query.entity;
  if (query.entityId && mongoose.isValidObjectId(query.entityId)) {
    filter.entityId = new mongoose.Types.ObjectId(String(query.entityId));
  }

  if (query.status && ['SUCCESS', 'FAILURE'].includes(String(query.status).toUpperCase())) {
    filter.status = String(query.status).toUpperCase();
  }

  const created = dateFilter(query.from, query.to);
  if (created) filter.createdAt = created;

  if (query.search) {
    const rx = new RegExp(escapeRegExp(query.search), 'i');
    filter.$or = [{ actorName: rx }, { description: rx }, { entityLabel: rx }];
  }

  return filter;
};

/** GET /audit-logs */
export const listAuditLogs = asyncHandler(async (req, res) => {
  const filter = buildAuditFilter(req.query);

  const page = Math.max(Number.parseInt(req.query.page ?? '1', 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '20', 10) || 20, 1), 200);

  const result = await AuditLog.paginate(filter, {
    page,
    limit,
    sort: { createdAt: -1 },
    populate: [{ path: 'actor', select: 'name employeeId email profileImage' }],
    lean: true,
  });

  return sendPaginated(res, result, 'Audit logs fetched');
});

/** GET /audit-logs/actions — feeds the filter dropdown. */
export const getActions = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    message: 'Audit actions fetched',
    data: AUDIT_ACTIONS.map((action) => ({
      value: action,
      label: action
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
    })),
  })
);

/** GET /audit-logs/stats */
export const getAuditStats = asyncHandler(async (req, res) => {
  const filter = buildAuditFilter(req.query);
  const todayStart = dayjs().startOf('day').toDate();

  const [facet] = await AuditLog.aggregate([
    { $match: filter },
    {
      $facet: {
        total: [{ $count: 'count' }],
        today: [{ $match: { createdAt: { $gte: todayStart } } }, { $count: 'count' }],
        byAction: [
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 25 },
        ],
        topActors: [
          { $match: { actor: { $ne: null } } },
          {
            $group: {
              _id: '$actor',
              name: { $first: '$actorName' },
              role: { $first: '$actorRole' },
              count: { $sum: 1 },
              lastActiveAt: { $max: '$createdAt' },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        failures: [{ $match: { status: 'FAILURE' } }, { $count: 'count' }],
      },
    },
  ]);

  return sendSuccess(res, {
    message: 'Audit stats fetched',
    data: {
      total: facet?.total?.[0]?.count ?? 0,
      today: facet?.today?.[0]?.count ?? 0,
      failures: facet?.failures?.[0]?.count ?? 0,
      byAction: (facet?.byAction ?? []).map((r) => ({ action: r._id, count: r.count })),
      topActors: (facet?.topActors ?? []).map((r) => ({
        id: r._id,
        name: r.name || 'Unknown',
        role: r.role || '',
        count: r.count,
        lastActiveAt: r.lastActiveAt,
      })),
    },
  });
});

export default { listAuditLogs, getActions, getAuditStats };
