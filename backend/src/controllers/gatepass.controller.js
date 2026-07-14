import GatePass from '../models/GatePass.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/ApiResponse.js';
import { dateFilter } from '../utils/dates.js';
import gatepassService from '../services/gatepass.service.js';
import { buildGatePassScope, canViewGatePass } from '../services/scope.service.js';
import { getSettings, getQuotaSnapshot } from '../services/settings.service.js';
import { recordAudit } from '../services/audit.service.js';
import { toAttachment } from '../middlewares/upload.middleware.js';
import {
  GATEPASS_STATUS,
  GATEPASS_STATUSES,
  PERMISSION,
  ROLE,
  AUDIT_ACTION,
} from '../constants/index.js';

/* ─── Shared helpers ──────────────────────────────────────────────────────── */

/** Standard populate set for every list row. */
export const LIST_POPULATE = [
  { path: 'employee', select: 'name employeeId profileImage' },
  { path: 'department', select: 'name' },
  { path: 'unit', select: 'name' },
  { path: 'reportingManager', select: 'name' },
];

/** The timeline actors + every decision-maker, for the detail / print screens. */
const DETAIL_POPULATE = [
  ...LIST_POPULATE,
  { path: 'timeline.actor', select: 'name employeeId profileImage' },
  { path: 'approval.approvedBy', select: 'name employeeId' },
  { path: 'approval.rejectedBy', select: 'name employeeId' },
  { path: 'hrReview.reviewedBy', select: 'name employeeId' },
  { path: 'security.exitBy', select: 'name employeeId' },
  { path: 'security.entryBy', select: 'name employeeId' },
];

/** The QR is only meaningful once the pass is usable at the gate. */
export const QR_VISIBLE_STATUSES = [
  GATEPASS_STATUS.APPROVED,
  GATEPASS_STATUS.OUT,
  GATEPASS_STATUS.COMPLETED,
];

/** A pass in one of these states can no longer be touched by the employee. */
const TERMINAL_STATUSES = [
  GATEPASS_STATUS.REJECTED,
  GATEPASS_STATUS.CANCELLED,
  GATEPASS_STATUS.EXPIRED,
  GATEPASS_STATUS.COMPLETED,
];

export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasPermission = (user, permission) =>
  user.role?.key === ROLE.SUPER_ADMIN || user.effectivePermissions().includes(permission);

/**
 * THE data-restriction chokepoint for every gate pass query in this module.
 * Callers may bolt extra clauses on via `extra` — they are ANDed, never ORed,
 * so they can only ever narrow the caller's scope.
 */
export const buildGatePassFilter = async (user, query = {}, extra = []) => {
  const scope = await buildGatePassScope(user);
  // An empty scope means "unrestricted" — `$and: [{}]` is not a valid match stage.
  const and = [...(Object.keys(scope).length ? [scope] : []), { isDeleted: false }, ...extra];

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    and.push({
      $or: [
        { gatePassNumber: rx },
        { employeeName: rx },
        { employeeCode: rx },
        { reason: rx },
      ],
    });
  }

  if (query.status?.length) and.push({ status: { $in: query.status } });
  if (query.type) and.push({ type: query.type });
  if (query.unit) and.push({ unit: query.unit });
  if (query.department) and.push({ department: query.department });
  if (query.employee) and.push({ employee: query.employee });
  if (query.reportingManager) and.push({ reportingManager: query.reportingManager });

  const created = dateFilter(query.from, query.to);
  if (created) and.push({ createdAt: created });

  return { $and: and };
};

/** Loads a pass or 404s. */
const loadGatePass = async (id, populate = []) => {
  const gatePass = await GatePass.findOne({ _id: id, isDeleted: false }).populate(populate);
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  return gatePass;
};

/** Loads a pass and asserts the caller is allowed to READ it. */
const loadViewableGatePass = async (user, id, populate = []) => {
  const gatePass = await loadGatePass(id, populate);
  if (!(await canViewGatePass(user, gatePass))) {
    throw ApiError.forbidden('You do not have access to this gate pass');
  }
  return gatePass;
};

/** Hides the QR from anyone looking at a pass that is not gate-ready yet. */
const present = (gatePass) => {
  const json = gatePass.toJSON();
  if (!QR_VISIBLE_STATUSES.includes(json.status)) {
    json.qrCode = '';
    json.qrToken = undefined;
  } else {
    json.qrToken = undefined; // the token lives inside the QR image only
  }
  return json;
};

/* ─── Prefill (New Gate Pass form) ────────────────────────────────────────── */
export const getPrefill = asyncHandler(async (req, res) => {
  const { user } = req;
  const [settings, quota] = await Promise.all([getSettings(), getQuotaSnapshot(user)]);

  return sendSuccess(res, {
    message: 'Prefill loaded',
    data: {
      employeeCode: user.employeeId,
      employeeName: user.name,
      department: user.department
        ? { id: user.department._id ?? user.department, name: user.department.name ?? '' }
        : null,
      unit: user.unit ? { id: user.unit._id ?? user.unit, name: user.unit.name ?? '' } : null,
      designation: user.designation ?? '',
      reportingManager: user.reportingManager
        ? {
            id: user.reportingManager._id ?? user.reportingManager,
            name: user.reportingManager.name ?? '',
          }
        : null,
      quota,
      workflow: {
        approvalRequired: settings.workflow.approvalRequired,
        attachmentMandatory: settings.workflow.attachmentMandatory,
        reasonMandatory: settings.workflow.reasonMandatory,
        purposeMandatory: settings.workflow.purposeMandatory,
        expiryHours: settings.workflow.expiryHours,
      },
      workingHours: {
        gateOpenTime: settings.workingHours.gateOpenTime,
        gateCloseTime: settings.workingHours.gateCloseTime,
        enforceGateHours: settings.workingHours.enforceGateHours,
        restrictWeekend: settings.workingHours.restrictWeekend,
        restrictHolidays: settings.workingHours.restrictHolidays,
        weekendDays: settings.workingHours.weekendDays,
      },
    },
  });
});

/* ─── Create ──────────────────────────────────────────────────────────────── */
export const createGatePass = asyncHandler(async (req, res) => {
  const attachments = (req.files ?? []).map(toAttachment);

  // The identity always comes from req.user — never from the body.
  const gatePass = await gatepassService.createGatePass(req.user, req.body, {
    req,
    attachments,
  });

  return sendCreated(res, {
    data: present(gatePass),
    message: 'Gate pass raised successfully',
  });
});

/* ─── Lists ───────────────────────────────────────────────────────────────── */
const paginateList = async (req, res, extra = [], message = 'Gate passes fetched') => {
  const { page, limit, sort } = req.query;
  const filter = await buildGatePassFilter(req.user, req.query, extra);

  const result = await GatePass.paginate(filter, {
    page,
    limit,
    sort,
    populate: LIST_POPULATE,
    lean: true,
    leanWithId: false,
  });

  result.docs = result.docs.map((doc) => {
    const row = { ...doc };
    if (!QR_VISIBLE_STATUSES.includes(row.status)) row.qrCode = '';
    delete row.qrToken;
    delete row.timeline;
    return row;
  });

  return sendPaginated(res, result, message);
};

export const listGatePasses = asyncHandler((req, res) => paginateList(req, res));

export const listMyGatePasses = asyncHandler((req, res) =>
  paginateList(req, res, [{ employee: req.user._id }], 'My gate passes fetched')
);

/** The approver's inbox. Admins with VIEW_ALL see every pending pass. */
export const listPendingApproval = asyncHandler((req, res) => {
  const seesEverything = hasPermission(req.user, PERMISSION.GATEPASS_VIEW_ALL);
  const extra = [{ status: GATEPASS_STATUS.PENDING }];
  if (!seesEverything) extra.push({ reportingManager: req.user._id });
  return paginateList(req, res, extra, 'Pending approvals fetched');
});

/** Tab badges on the list screen — counts by status inside the caller's scope. */
export const getGatePassStats = asyncHandler(async (req, res) => {
  const filter = await buildGatePassFilter(req.user, req.query);

  const rows = await GatePass.aggregate([
    { $match: filter },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = Object.fromEntries(GATEPASS_STATUSES.map((status) => [status, 0]));
  let total = 0;
  for (const row of rows) {
    if (row._id in byStatus) byStatus[row._id] = row.count;
    total += row.count;
  }

  return sendSuccess(res, { message: 'Stats fetched', data: { total, byStatus } });
});

/* ─── Detail ──────────────────────────────────────────────────────────────── */
export const getGatePass = asyncHandler(async (req, res) => {
  const gatePass = await loadViewableGatePass(req.user, req.params.id, DETAIL_POPULATE);
  return sendSuccess(res, { message: 'Gate pass fetched', data: present(gatePass) });
});

export const getGatePassQr = asyncHandler(async (req, res) => {
  const gatePass = await loadViewableGatePass(req.user, req.params.id);

  if (!QR_VISIBLE_STATUSES.includes(gatePass.status)) {
    throw ApiError.badRequest('A QR code is only available once the gate pass is approved');
  }
  if (!gatePass.qrCode) {
    throw ApiError.badRequest('No QR code was minted for this gate pass');
  }

  return sendSuccess(res, {
    message: 'QR code fetched',
    data: {
      gatePassNumber: gatePass.gatePassNumber,
      status: gatePass.status,
      qrCode: gatePass.qrCode,
      expiresAt: gatePass.expiresAt,
    },
  });
});

/** Everything the print view needs in one payload. */
export const getGatePassPrint = asyncHandler(async (req, res) => {
  const gatePass = await loadViewableGatePass(req.user, req.params.id, DETAIL_POPULATE);
  const settings = await getSettings();
  const json = present(gatePass);

  return sendSuccess(res, {
    message: 'Print payload fetched',
    data: {
      ...json,
      qrCode: QR_VISIBLE_STATUSES.includes(gatePass.status) ? gatePass.qrCode : '',
      timeline: json.timeline ?? [],
      company: {
        name: settings.company.name,
        logo: settings.company.logo,
        address: settings.company.address,
        email: settings.company.email,
        phone: settings.company.phone,
      },
      printedAt: new Date(),
      printedBy: { id: req.user._id, name: req.user.name },
    },
  });
});

/* ─── Update / resubmit ───────────────────────────────────────────────────── */
export const updateGatePass = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);

  if (gatePass.employee.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('You can only edit your own gate pass');
  }
  if (![GATEPASS_STATUS.DRAFT, GATEPASS_STATUS.CHANGES_REQUESTED].includes(gatePass.status)) {
    throw ApiError.badRequest(
      'A gate pass can only be edited while it is a draft or when changes have been requested'
    );
  }

  // Sent back by the manager → the service owns the transition back to PENDING.
  if (gatePass.status === GATEPASS_STATUS.CHANGES_REQUESTED) {
    const updated = await gatepassService.resubmitGatePass(req.user, gatePass, req.body, { req });
    return sendSuccess(res, {
      message: 'Gate pass updated and resubmitted',
      data: present(updated),
    });
  }

  Object.assign(gatePass, req.body, { updatedBy: req.user._id });
  await gatePass.save();

  await recordAudit({
    action: AUDIT_ACTION.GATEPASS_UPDATE,
    actor: req.user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: 'Updated a draft gate pass',
    req,
  });

  return sendSuccess(res, { message: 'Gate pass updated', data: present(gatePass) });
});

export const addAttachments = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);

  if (gatePass.employee.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('You can only add attachments to your own gate pass');
  }
  if (TERMINAL_STATUSES.includes(gatePass.status)) {
    throw ApiError.badRequest('This gate pass is closed — attachments can no longer be added');
  }

  const attachments = (req.files ?? []).map(toAttachment);
  if (!attachments.length) throw ApiError.badRequest('No files were uploaded');

  gatePass.attachments.push(...attachments);
  gatePass.updatedBy = req.user._id;
  await gatePass.save();

  await recordAudit({
    action: AUDIT_ACTION.GATEPASS_UPDATE,
    actor: req.user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: `Added ${attachments.length} attachment(s)`,
    req,
  });

  return sendSuccess(res, {
    message: 'Attachments added',
    data: { attachments: gatePass.attachments },
  });
});

/* ─── Decisions — every one delegates to the workflow engine ──────────────── */
export const approveGatePass = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);
  const updated = await gatepassService.approveGatePass(req.user, gatePass, {
    comment: req.body.comment,
    req,
  });
  return sendSuccess(res, { message: 'Gate pass approved', data: present(updated) });
});

export const rejectGatePass = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);
  const updated = await gatepassService.rejectGatePass(req.user, gatePass, {
    comment: req.body.comment,
    req,
  });
  return sendSuccess(res, { message: 'Gate pass rejected', data: present(updated) });
});

export const requestChanges = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);
  const updated = await gatepassService.requestChanges(req.user, gatePass, {
    comment: req.body.comment,
    req,
  });
  return sendSuccess(res, { message: 'Changes requested', data: present(updated) });
});

export const cancelGatePass = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);
  const updated = await gatepassService.cancelGatePass(req.user, gatePass, {
    comment: req.body.comment,
    req,
  });
  return sendSuccess(res, { message: 'Gate pass cancelled', data: present(updated) });
});

/* ─── Soft delete ─────────────────────────────────────────────────────────── */
export const deleteGatePass = asyncHandler(async (req, res) => {
  const gatePass = await loadGatePass(req.params.id);

  gatePass.isDeleted = true;
  gatePass.updatedBy = req.user._id;
  await gatePass.save();

  await recordAudit({
    action: AUDIT_ACTION.GATEPASS_DELETE,
    actor: req.user,
    entity: 'GatePass',
    entityId: gatePass._id,
    entityLabel: gatePass.gatePassNumber,
    description: 'Deleted a gate pass',
    req,
  });

  return sendSuccess(res, {
    message: 'Gate pass deleted',
    data: { id: gatePass._id, gatePassNumber: gatePass.gatePassNumber },
  });
});

export default {
  getPrefill,
  createGatePass,
  listGatePasses,
  listMyGatePasses,
  listPendingApproval,
  getGatePassStats,
  getGatePass,
  getGatePassQr,
  getGatePassPrint,
  updateGatePass,
  addAttachments,
  approveGatePass,
  rejectGatePass,
  requestChanges,
  cancelGatePass,
  deleteGatePass,
};
