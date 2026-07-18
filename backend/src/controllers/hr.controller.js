import GatePass from '../models/GatePass.js';
import HRReview from '../models/HRReview.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/ApiResponse.js';
import { dateFilter, dayjs } from '../utils/dates.js';
import gatepassService from '../services/gatepass.service.js';
import { GATEPASS_STATUS } from '../constants/index.js';
import { buildGatePassFilter, LIST_POPULATE } from './gatepass.controller.js';

const loadGatePass = async (id) => {
  const gatePass = await GatePass.findOne({ _id: id, isDeleted: false });
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  return gatePass;
};

const stripQr = (doc) => {
  const row = { ...doc };
  delete row.qrCode;
  delete row.qrToken;
  delete row.timeline;
  return row;
};

/* ─── The HR queue — everything the manager cleared, waiting on HR ─────────── */
export const getQueue = asyncHandler(async (req, res) => {
  const { page, limit, sort } = req.query;
  const filter = await buildGatePassFilter(req.user, req.query, [
    { status: GATEPASS_STATUS.HR_REVIEW },
  ]);

  const result = await GatePass.paginate(filter, {
    page,
    limit,
    sort,
    populate: LIST_POPULATE,
    lean: true,
    leanWithId: false,
  });
  result.docs = result.docs.map(stripQr);

  return sendPaginated(res, result, 'HR review queue fetched');
});

/* ─── Review history ──────────────────────────────────────────────────────── */
export const listReviews = asyncHandler(async (req, res) => {
  const { page, limit, sort, gatePass, reviewer, status, from, to } = req.query;

  const filter = {};
  if (gatePass) filter.gatePass = gatePass;
  if (reviewer) filter.reviewer = reviewer;
  if (status) filter.status = status;

  const reviewedAt = dateFilter(from, to);
  if (reviewedAt) filter.reviewedAt = reviewedAt;

  const result = await HRReview.paginate(filter, {
    page,
    limit,
    sort,
    populate: [
      { path: 'employee', select: 'name employeeId profileImage' },
      { path: 'reviewer', select: 'name employeeId' },
      { path: 'unit', select: 'name' },
      { path: 'department', select: 'name' },
    ],
    lean: true,
    leanWithId: false,
  });

  return sendPaginated(res, result, 'HR reviews fetched');
});

/* ─── Queue KPIs ──────────────────────────────────────────────────────────── */
export const getStats = asyncHandler(async (req, res) => {
  const startOfToday = dayjs().startOf('day').toDate();
  const endOfToday = dayjs().endOf('day').toDate();
  const todayFilter = { reviewedAt: { $gte: startOfToday, $lte: endOfToday } };

  const pendingFilter = await buildGatePassFilter(req.user, {}, [
    { status: GATEPASS_STATUS.HR_REVIEW },
  ]);

  const [pending, okToday, notOkToday, avg] = await Promise.all([
    GatePass.countDocuments(pendingFilter),
    HRReview.countDocuments({ ...todayFilter, status: 'OK' }),
    HRReview.countDocuments({ ...todayFilter, status: 'NOT_OK' }),
    // Average manager-approval → HR-decision turnaround over the last 30 days.
    HRReview.aggregate([
      { $match: { reviewedAt: { $gte: dayjs().subtract(30, 'day').toDate() } } },
      {
        $lookup: {
          from: 'gatepasses',
          localField: 'gatePass',
          foreignField: '_id',
          as: 'pass',
        },
      },
      { $unwind: '$pass' },
      { $match: { 'pass.approval.approvedAt': { $ne: null } } },
      {
        $project: {
          minutes: {
            $divide: [{ $subtract: ['$reviewedAt', '$pass.approval.approvedAt'] }, 60000],
          },
        },
      },
      { $match: { minutes: { $gte: 0 } } },
      { $group: { _id: null, avgReviewMinutes: { $avg: '$minutes' } } },
    ]),
  ]);

  return sendSuccess(res, {
    message: 'HR stats fetched',
    data: {
      pending,
      okToday,
      notOkToday,
      avgReviewMinutes: Math.round(avg[0]?.avgReviewMinutes ?? 0),
    },
  });
});

/* ─── Decisions — the workflow engine owns the transition ─────────────────── */
export const reviewGatePass = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);

  const updated = await gatepassService.reviewGatePass(req.user, gatePass, {
    status: req.body.status,
    comment: req.body.comment,
    req,
  });

  return sendSuccess(res, {
    message: `HR review recorded as ${req.body.status}`,
    data: updated.toJSON(),
  });
});

export const rejectGatePass = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);

  const updated = await gatepassService.rejectGatePass(req.user, gatePass, {
    comment: req.body.comment,
    req,
  });

  return sendSuccess(res, { message: 'Gate pass rejected', data: updated.toJSON() });
});

export default { getQueue, listReviews, getStats, reviewGatePass, rejectGatePass };
