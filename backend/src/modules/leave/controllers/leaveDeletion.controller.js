import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../../../utils/ApiResponse.js';
import { recordAudit } from '../../../services/audit.service.js';
import { AUDIT_ACTION } from '../../../constants/index.js';
import { dayjs } from '../../../utils/dates.js';

import {
  listDeletable,
  listDeleted,
  deletionSummary,
  deleteLeave,
  deletionRows,
} from '../services/leaveDeletion.service.js';

/* ─── GET /leave/deletion/requests ────────────────────────────────────────── */
export const listCandidates = asyncHandler(async (req, res) => {
  const result = await listDeletable(req.query);
  return sendPaginated(res, result, 'Leave applications fetched successfully');
});

/* ─── GET /leave/deletion/log ─────────────────────────────────────────────── */
export const listLog = asyncHandler(async (req, res) => {
  const result = await listDeleted(req.query);
  return sendPaginated(res, result, 'Deletion log fetched successfully');
});

/* ─── GET /leave/deletion/summary ─────────────────────────────────────────── */
export const summary = asyncHandler(async (req, res) => {
  const data = await deletionSummary(req.query);
  return sendSuccess(res, { data, message: 'Deletion report generated' });
});

/* ─── POST /leave/deletion/requests/:id ───────────────────────────────────── */
export const remove = asyncHandler(async (req, res) => {
  const request = await deleteLeave(req.user, req.params.id, { reason: req.body.reason, req });

  return sendSuccess(res, {
    data: request.toJSON(),
    message:
      request.deletion.restoredDays > 0
        ? `${request.leaveNumber} deleted — ${request.deletion.restoredDays} day(s) returned to the balance.`
        : `${request.leaveNumber} deleted. No days needed restoring (it was ${request.deletion.statusAtDeletion.toLowerCase()}).`,
  });
});

/* ─── GET /leave/deletion/export ──────────────────────────────────────────── */
const CSV_HEADERS = [
  'Leave Number', 'Employee', 'Employee Code', 'Department', 'Unit', 'Leave Type',
  'From', 'To', 'Days', 'Status At Deletion', 'Days Restored', 'Restored From',
  'Deleted By', 'Deleted At', 'Deletion Reason',
];

/** Minimal RFC-4180 quoting — every field is wrapped, inner quotes doubled. */
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const exportLog = asyncHandler(async (req, res) => {
  const rows = await deletionRows(req.query);

  const lines = [CSV_HEADERS.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.leaveNumber,
        row.employeeName,
        row.employeeCode,
        row.departmentName,
        row.unitName,
        `${row.leaveTypeCode} — ${row.leaveTypeName}`,
        dayjs(row.fromDate).format('YYYY-MM-DD'),
        dayjs(row.toDate).format('YYYY-MM-DD'),
        row.totalDays,
        row.deletion?.statusAtDeletion ?? '',
        row.deletion?.restoredDays ?? 0,
        row.deletion?.restoredFrom ?? '',
        row.deletion?.deletedByName ?? '',
        row.deletion?.deletedAt ? dayjs(row.deletion.deletedAt).format('YYYY-MM-DD HH:mm') : '',
        row.deletion?.reason ?? '',
      ]
        .map(csvCell)
        .join(',')
    );
  }

  await recordAudit({
    action: AUDIT_ACTION.EXPORT,
    actor: req.user,
    entity: 'LeaveRequest',
    entityLabel: 'Leave deletion log',
    description: `Exported ${rows.length} leave deletion record(s) to CSV`,
    req,
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="leave-deletions-${dayjs().format('YYYY-MM-DD')}.csv"`
  );
  // BOM so Excel opens the file as UTF-8 rather than mangling the em dashes.
  return res.send(`﻿${lines.join('\r\n')}`);
});

export default { listCandidates, listLog, summary, remove, exportLog };
