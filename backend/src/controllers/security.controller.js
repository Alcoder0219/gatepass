import GatePass from '../models/GatePass.js';
import SecurityLog from '../models/SecurityLog.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/ApiResponse.js';
import { dateFilter, dayjs } from '../utils/dates.js';
import gatepassService from '../services/gatepass.service.js';
import { canViewGatePass } from '../services/scope.service.js';
import { parseQrPayload } from '../helpers/gatePassNumber.js';
import { toPublicUrl } from '../middlewares/upload.middleware.js';
import { GATEPASS_STATUS } from '../constants/index.js';
import { buildGatePassFilter, LIST_POPULATE, escapeRegex } from './gatepass.controller.js';

const GUARD_POPULATE = [
  ...LIST_POPULATE,
  { path: 'security.exitBy', select: 'name employeeId' },
  { path: 'security.entryBy', select: 'name employeeId' },
];

const loadGatePass = async (id, populate = []) => {
  const gatePass = await GatePass.findOne({ _id: id, isDeleted: false }).populate(populate);
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  return gatePass;
};

/* ─── Ready to exit ───────────────────────────────────────────────────────── */
export const getQueue = asyncHandler(async (req, res) => {
  const { page, limit, sort } = req.query;
  const filter = await buildGatePassFilter(req.user, req.query, [
    { status: GATEPASS_STATUS.APPROVED },
  ]);

  const result = await GatePass.paginate(filter, {
    page,
    limit,
    sort: sort || 'expectedOutTime',
    populate: LIST_POPULATE,
    lean: true,
    leanWithId: false,
  });

  return sendPaginated(res, result, 'Exit queue fetched');
});

/* ─── Currently outside the gate ──────────────────────────────────────────── */
export const getOut = asyncHandler(async (req, res) => {
  const { page, limit, sort } = req.query;
  const filter = await buildGatePassFilter(req.user, req.query, [
    { status: GATEPASS_STATUS.OUT },
  ]);

  const result = await GatePass.paginate(filter, {
    page,
    limit,
    sort: sort === 'expectedOutTime' ? 'expectedInTime' : sort,
    populate: LIST_POPULATE,
    lean: true,
    leanWithId: false,
  });

  const now = dayjs();
  result.docs = result.docs.map((doc) => {
    const overdueBy = doc.expectedInTime ? now.diff(dayjs(doc.expectedInTime), 'minute') : 0;
    return {
      ...doc,
      isOverdue: overdueBy > 0,
      overdueByMinutes: Math.max(0, overdueBy),
    };
  });

  return sendPaginated(res, result, 'Employees currently out fetched');
});

/* ─── Gate movement ledger ────────────────────────────────────────────────── */
export const getHistory = asyncHandler(async (req, res) => {
  const { page, limit, sort, search, type, employee, unit, from, to } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (employee) filter.employee = employee;
  if (unit) filter.unit = unit;

  const recordedAt = dateFilter(from, to);
  if (recordedAt) filter.recordedAt = recordedAt;

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ gatePassNumber: rx }, { employeeName: rx }, { employeeCode: rx }];
  }

  const result = await SecurityLog.paginate(filter, {
    page,
    limit,
    sort,
    populate: [
      { path: 'employee', select: 'name employeeId profileImage' },
      { path: 'recordedBy', select: 'name employeeId' },
      { path: 'unit', select: 'name' },
    ],
    lean: true,
    leanWithId: false,
  });

  return sendPaginated(res, result, 'Security history fetched');
});

/* ─── Guard console KPIs ──────────────────────────────────────────────────── */
export const getStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfToday = dayjs().startOf('day').toDate();
  const endOfToday = dayjs().endOf('day').toDate();

  const [approvedFilter, outFilter] = await Promise.all([
    buildGatePassFilter(req.user, {}, [{ status: GATEPASS_STATUS.APPROVED }]),
    buildGatePassFilter(req.user, {}, [{ status: GATEPASS_STATUS.OUT }]),
  ]);

  const overdueFilter = {
    $and: [...outFilter.$and, { expectedInTime: { $lt: now } }],
  };

  const todayLog = { recordedAt: { $gte: startOfToday, $lte: endOfToday } };

  const [readyToExit, currentlyOut, overdue, exitsToday, returnsToday] = await Promise.all([
    GatePass.countDocuments(approvedFilter),
    GatePass.countDocuments(outFilter),
    GatePass.countDocuments(overdueFilter),
    SecurityLog.countDocuments({ ...todayLog, type: 'EXIT' }),
    SecurityLog.countDocuments({ ...todayLog, type: 'ENTRY' }),
  ]);

  return sendSuccess(res, {
    message: 'Security stats fetched',
    data: { readyToExit, currentlyOut, overdue, exitsToday, returnsToday },
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The scanner endpoint. Strict by design: a guard must be told exactly WHY a
 * pass cannot be used, and must never be shown a green light on a stale QR.
 * ──────────────────────────────────────────────────────────────────────────── */
const invalid = (reason) => ({ valid: false, reason, canExit: false, canReturn: false });

export const verify = asyncHandler(async (req, res) => {
  const { token, gatePassNumber } = parseQrPayload(req.body.code);

  if (!token && !gatePassNumber) {
    return sendSuccess(res, {
      message: 'Verification failed',
      data: { gatePass: null, verification: invalid('The scanned code could not be read') },
    });
  }

  const gatePass = await GatePass.findOne({
    ...(token ? { qrToken: token } : { gatePassNumber }),
    isDeleted: false,
  }).populate(GUARD_POPULATE);

  if (!gatePass) {
    return sendSuccess(res, {
      message: 'Verification failed',
      data: {
        gatePass: null,
        verification: invalid('No gate pass matches this code'),
      },
    });
  }

  const fail = (reason) =>
    sendSuccess(res, {
      message: 'Verification failed',
      data: { gatePass: gatePass.toJSON(), verification: invalid(reason) },
    });

  // The guard may only act on passes inside their own data scope.
  if (!(await canViewGatePass(req.user, gatePass))) {
    return fail('This gate pass belongs to a unit you do not have access to');
  }

  // The QR carried both a token and a number — they must describe the same pass.
  if (token && gatePassNumber && gatePass.gatePassNumber !== gatePassNumber) {
    return fail('The QR code does not match this gate pass');
  }
  if (token && gatePass.qrToken !== token) {
    return fail('The QR code is not valid for this gate pass');
  }
  // Typed / searched number for an approved pass that carries a QR: no token to check.

  if (gatePass.status === GATEPASS_STATUS.EXPIRED) {
    return fail('This gate pass has expired');
  }
  if (![GATEPASS_STATUS.APPROVED, GATEPASS_STATUS.OUT].includes(gatePass.status)) {
    return fail(`This gate pass is ${gatePass.status.toLowerCase().replace('_', ' ')} — it cannot be used at the gate`);
  }
  if (
    gatePass.status === GATEPASS_STATUS.APPROVED &&
    gatePass.expiresAt &&
    dayjs(gatePass.expiresAt).isBefore(dayjs())
  ) {
    return fail('This gate pass has expired');
  }

  const isExit = gatePass.status === GATEPASS_STATUS.APPROVED;

  return sendSuccess(res, {
    message: 'Gate pass verified',
    data: {
      gatePass: gatePass.toJSON(),
      verification: {
        valid: true,
        reason: isExit ? 'Approved — cleared to exit' : 'Currently out — cleared to return',
        canExit: isExit,
        canReturn: !isExit,
      },
    },
  });
});

/* ─── Gate movements — the workflow engine writes the SecurityLog + audit ──── */
export const markExit = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);

  const updated = await gatepassService.markExit(req.user, gatePass, {
    remark: req.body.remark,
    photo: toPublicUrl(req.file, 'security'),
    method: req.body.method,
    req,
  });

  return sendSuccess(res, { message: 'Exit recorded', data: updated.toJSON() });
});

export const markReturn = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);

  const updated = await gatepassService.markReturn(req.user, gatePass, {
    remark: req.body.remark,
    photo: toPublicUrl(req.file, 'security'),
    method: req.body.method,
    req,
  });

  return sendSuccess(res, { message: 'Return recorded', data: updated.toJSON() });
});

/* ─── Guard's detail screen ───────────────────────────────────────────────── */
export const getGatePass = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id, GUARD_POPULATE);

  if (!(await canViewGatePass(req.user, gatePass))) {
    throw ApiError.forbidden('You do not have access to this gate pass');
  }

  const overdueBy =
    gatePass.status === GATEPASS_STATUS.OUT && gatePass.expectedInTime
      ? dayjs().diff(dayjs(gatePass.expectedInTime), 'minute')
      : 0;

  return sendSuccess(res, {
    message: 'Gate pass fetched',
    data: {
      ...gatePass.toJSON(),
      isOverdue: overdueBy > 0,
      overdueByMinutes: Math.max(0, overdueBy),
      canExit: gatePass.status === GATEPASS_STATUS.APPROVED,
      canReturn: gatePass.status === GATEPASS_STATUS.OUT,
    },
  });
});

export default { getQueue, getOut, getHistory, getStats, verify, markExit, markReturn, getGatePass };
