import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';

import GatePass from '../models/GatePass.js';
import { buildGatePassScope } from './scope.service.js';
import { getSettings } from './settings.service.js';
import { dayjs, dateFilter } from '../utils/dates.js';
import { GATEPASS_STATUS, GATEPASS_TYPE } from '../constants/index.js';

const toId = (value) => new mongoose.Types.ObjectId(String(value));

/**
 * The one filter builder shared by the report summary, the report table and the
 * export — the caller's scope is ALWAYS intersected in, so a HOD can never widen
 * their report by hand-crafting a query string.
 */
export const buildReportFilter = async (user, query = {}) => {
  const scope = await buildGatePassScope(user);
  const filter = { ...scope, isDeleted: false };

  if (query.status?.length) filter.status = { $in: query.status };
  if (query.type?.length) filter.type = { $in: query.type };
  if (query.unit) filter.unit = toId(query.unit);
  if (query.department) filter.department = toId(query.department);
  if (query.employee) filter.employee = toId(query.employee);

  const created = dateFilter(query.from, query.to);
  if (created) filter.createdAt = created;

  if (query.search) {
    const rx = new RegExp(escapeRegExp(query.search), 'i');
    const search = [
      { gatePassNumber: rx },
      { employeeName: rx },
      { employeeCode: rx },
      { reason: rx },
      { departmentName: rx },
      { unitName: rx },
    ];
    // Never clobber the scope's own $or — AND the two together.
    filter.$and = [...(filter.$and ?? []), { $or: search }];
  }

  return filter;
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ─── Summary ─────────────────────────────────────────────────────────────── */

const APPROVED_LIKE = [GATEPASS_STATUS.APPROVED, GATEPASS_STATUS.OUT, GATEPASS_STATUS.COMPLETED];

/**
 * One `$facet` pass over the matched set — every block of the report screen is
 * derived here rather than with a query per widget.
 */
export const getReportSummary = async (filter) => {
  const [result] = await GatePass.aggregate([
    { $match: filter },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              approved: { $sum: { $cond: [{ $in: ['$status', APPROVED_LIKE] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $eq: ['$status', GATEPASS_STATUS.REJECTED] }, 1, 0] } },
              pending: {
                $sum: {
                  $cond: [
                    { $in: ['$status', [GATEPASS_STATUS.PENDING, GATEPASS_STATUS.HR_REVIEW, GATEPASS_STATUS.CHANGES_REQUESTED]] },
                    1,
                    0,
                  ],
                },
              },
              completed: { $sum: { $cond: [{ $eq: ['$status', GATEPASS_STATUS.COMPLETED] }, 1, 0] } },
              cancelled: { $sum: { $cond: [{ $eq: ['$status', GATEPASS_STATUS.CANCELLED] }, 1, 0] } },
              official: { $sum: { $cond: [{ $eq: ['$type', GATEPASS_TYPE.OFFICIAL] }, 1, 0] } },
              personal: { $sum: { $cond: [{ $eq: ['$type', GATEPASS_TYPE.PERSONAL] }, 1, 0] } },
              late: { $sum: { $cond: [{ $eq: ['$isLate', true] }, 1, 0] } },
              returned: {
                $sum: { $cond: [{ $ifNull: ['$security.actualInTime', false] }, 1, 0] },
              },
            },
          },
        ],
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        byDepartment: [
          { $group: { _id: '$departmentName', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ],
        byUnit: [{ $group: { _id: '$unitName', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        byMonth: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              count: { $sum: 1 },
              official: { $sum: { $cond: [{ $eq: ['$type', GATEPASS_TYPE.OFFICIAL] }, 1, 0] } },
              personal: { $sum: { $cond: [{ $eq: ['$type', GATEPASS_TYPE.PERSONAL] }, 1, 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ],
        topEmployees: [
          {
            $group: {
              _id: '$employee',
              name: { $first: '$employeeName' },
              code: { $first: '$employeeCode' },
              department: { $first: '$departmentName' },
              count: { $sum: 1 },
              late: { $sum: { $cond: [{ $eq: ['$isLate', true] }, 1, 0] } },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        durations: [
          {
            $project: {
              approvalMinutes: {
                $cond: [
                  { $ifNull: ['$approval.approvedAt', false] },
                  { $divide: [{ $subtract: ['$approval.approvedAt', '$createdAt'] }, 60_000] },
                  null,
                ],
              },
              outsideMinutes: {
                $cond: [
                  {
                    $and: [
                      { $ifNull: ['$security.actualOutTime', false] },
                      { $ifNull: ['$security.actualInTime', false] },
                    ],
                  },
                  {
                    $divide: [
                      { $subtract: ['$security.actualInTime', '$security.actualOutTime'] },
                      60_000,
                    ],
                  },
                  null,
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              avgApprovalMinutes: { $avg: '$approvalMinutes' },
              avgOutsideMinutes: { $avg: '$outsideMinutes' },
            },
          },
        ],
      },
    },
  ]);

  const totals = result?.totals?.[0] ?? {};
  const durations = result?.durations?.[0] ?? {};
  const returned = totals.returned ?? 0;

  return {
    totals: {
      total: totals.total ?? 0,
      pending: totals.pending ?? 0,
      approved: totals.approved ?? 0,
      rejected: totals.rejected ?? 0,
      completed: totals.completed ?? 0,
      cancelled: totals.cancelled ?? 0,
      official: totals.official ?? 0,
      personal: totals.personal ?? 0,
      late: totals.late ?? 0,
    },
    byStatus: (result?.byStatus ?? []).map((r) => ({ status: r._id, count: r.count })),
    byType: (result?.byType ?? []).map((r) => ({ type: r._id, count: r.count })),
    byDepartment: (result?.byDepartment ?? []).map((r) => ({ name: r._id ?? 'Unassigned', count: r.count })),
    byUnit: (result?.byUnit ?? []).map((r) => ({ name: r._id ?? 'Unassigned', count: r.count })),
    byMonth: (result?.byMonth ?? []).map((r) => ({
      month: r._id,
      label: dayjs(`${r._id}-01`).format('MMM YYYY'),
      count: r.count,
      official: r.official,
      personal: r.personal,
    })),
    topEmployees: (result?.topEmployees ?? []).map((r) => ({
      id: r._id,
      name: r.name,
      employeeCode: r.code,
      department: r.department,
      count: r.count,
      lateReturns: r.late,
    })),
    avgApprovalMinutes: round(durations.avgApprovalMinutes ?? 0),
    avgOutsideMinutes: round(durations.avgOutsideMinutes ?? 0),
    lateReturnRate: returned ? round(((totals.late ?? 0) / returned) * 100) : 0,
  };
};

const round = (value, dp = 1) => {
  const factor = 10 ** dp;
  return Math.round((Number(value) || 0) * factor) / factor;
};

/* ─── Table rows ──────────────────────────────────────────────────────────── */

const ROW_PROJECTION =
  'gatePassNumber employeeName employeeCode departmentName unitName designation type status ' +
  'reason purpose expectedOutTime expectedInTime reportingManagerName approval hrReview security ' +
  'isLate lateByMinutes createdAt';

export const getReportRows = async (filter, { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = {}) =>
  GatePass.paginate(filter, {
    page,
    limit,
    sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 },
    select: ROW_PROJECTION,
    lean: true,
  });

/** Flat, denormalised rows for the file writers. */
export const getExportRows = async (filter, limit = 5000) =>
  GatePass.find(filter).sort({ createdAt: -1 }).limit(limit).select(ROW_PROJECTION).lean();

/* ─── File building ───────────────────────────────────────────────────────── */

const fmt = (date, pattern = 'DD MMM YYYY, HH:mm') => (date ? dayjs(date).format(pattern) : '—');

/** Single source of truth for the export layout — all three formats read it. */
export const EXPORT_COLUMNS = [
  { key: 'gatePassNumber', header: 'Gate Pass No.', width: 22, value: (r) => r.gatePassNumber ?? '' },
  { key: 'employeeName', header: 'Employee', width: 22, value: (r) => r.employeeName ?? '' },
  { key: 'employeeCode', header: 'Emp. Code', width: 14, value: (r) => r.employeeCode ?? '' },
  { key: 'departmentName', header: 'Department', width: 18, value: (r) => r.departmentName ?? '' },
  { key: 'unitName', header: 'Unit', width: 16, value: (r) => r.unitName ?? '' },
  { key: 'type', header: 'Type', width: 12, value: (r) => r.type ?? '' },
  { key: 'status', header: 'Status', width: 18, value: (r) => r.status ?? '' },
  { key: 'reason', header: 'Reason', width: 34, value: (r) => r.reason ?? '' },
  { key: 'expectedOutTime', header: 'Expected Out', width: 22, value: (r) => fmt(r.expectedOutTime) },
  { key: 'expectedInTime', header: 'Expected In', width: 22, value: (r) => fmt(r.expectedInTime) },
  { key: 'actualOutTime', header: 'Actual Out', width: 22, value: (r) => fmt(r.security?.actualOutTime) },
  { key: 'actualInTime', header: 'Actual In', width: 22, value: (r) => fmt(r.security?.actualInTime) },
  { key: 'reportingManagerName', header: 'Manager', width: 20, value: (r) => r.reportingManagerName ?? '' },
  { key: 'approvedAt', header: 'Approved At', width: 22, value: (r) => fmt(r.approval?.approvedAt) },
  { key: 'hrStatus', header: 'HR Review', width: 14, value: (r) => r.hrReview?.status ?? '—' },
  { key: 'isLate', header: 'Late Return', width: 12, value: (r) => (r.isLate ? `Yes (${r.lateByMinutes ?? 0}m)` : 'No') },
  { key: 'createdAt', header: 'Raised On', width: 22, value: (r) => fmt(r.createdAt) },
];

/** Columns that survive the (much narrower) PDF table. */
const PDF_COLUMNS = [
  'gatePassNumber',
  'employeeName',
  'departmentName',
  'unitName',
  'type',
  'status',
  'expectedOutTime',
  'expectedInTime',
  'isLate',
];

export const exportFilename = (format) =>
  `gate-pass-report-${dayjs().format('YYYY-MM-DD-HHmm')}.${format}`;

export const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
};

/* ── Excel ── */

/** Styled, frozen-header workbook streamed straight into the response. */
export const buildExcel = async (rows, { companyName = 'Amsons Group', generatedBy = '' } = {}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Gate Passes', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = EXPORT_COLUMNS.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width,
  }));

  const header = sheet.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF312E81' } } };
  });

  rows.forEach((row, index) => {
    const added = sheet.addRow(
      Object.fromEntries(EXPORT_COLUMNS.map((col) => [col.key, col.value(row)]))
    );
    if (index % 2 === 1) {
      added.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      });
    }
    added.alignment = { vertical: 'middle', wrapText: false };
  });

  // Widen anything the content overflows, but keep a sane ceiling.
  sheet.columns.forEach((column, index) => {
    const longest = rows.reduce((max, row) => {
      const text = String(EXPORT_COLUMNS[index].value(row) ?? '');
      return Math.max(max, text.length);
    }, String(column.header).length);
    column.width = Math.min(Math.max(column.width, longest + 2), 48);
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };

  const footer = sheet.addRow([]);
  footer.getCell(1).value = `Generated ${fmt(new Date())}${generatedBy ? ` by ${generatedBy}` : ''} — ${rows.length} record(s)`;
  footer.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

  return workbook;
};

/* ── CSV ── */

/**
 * RFC 4180 escaping: wrap in quotes when the value contains a quote, comma,
 * newline or leading/trailing space, and double any embedded quote.
 */
export const csvEscape = (value) => {
  if (value == null) return '';
  const text = String(value);
  const needsQuotes = /[",\r\n]/.test(text) || text !== text.trim();
  const escaped = text.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

export const buildCsv = (rows) => {
  const lines = [EXPORT_COLUMNS.map((col) => csvEscape(col.header)).join(',')];
  for (const row of rows) {
    lines.push(EXPORT_COLUMNS.map((col) => csvEscape(col.value(row))).join(','));
  }
  // Excel needs the BOM to read UTF-8 accents correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
};

/* ── PDF ── */

/**
 * Landscape A4 table with a company header and a generated-at footer. The
 * document is piped into `stream` (the response) before anything is written, so
 * the file streams out instead of being buffered whole in memory.
 */
export const buildPdf = (rows, { companyName = 'Amsons Group', generatedBy = '', filters = {}, stream = null } = {}) => {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true });
  if (stream) doc.pipe(stream);

  const columns = PDF_COLUMNS.map((key) => EXPORT_COLUMNS.find((col) => col.key === key)).filter(Boolean);
  const totalWeight = columns.reduce((sum, col) => sum + col.width, 0);
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const widths = columns.map((col) => (col.width / totalWeight) * tableWidth);

  const left = doc.page.margins.left;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 24;

  const drawHeader = () => {
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16).text(companyName, left, 26);
    doc.font('Helvetica').fontSize(9).fillColor('#475569')
      .text('Gate Pass Report', left, 46);

    const summary = [
      filters.from ? `From ${dayjs(filters.from).format('DD MMM YYYY')}` : null,
      filters.to ? `To ${dayjs(filters.to).format('DD MMM YYYY')}` : null,
      filters.status?.length ? `Status: ${filters.status.join(', ')}` : null,
      filters.type?.length ? `Type: ${filters.type.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('  •  ');

    doc.fontSize(8).fillColor('#64748b')
      .text(summary || 'All records within your access scope', left, 58, { width: tableWidth });

    doc.moveTo(left, 72).lineTo(left + tableWidth, 72).strokeColor('#e2e8f0').lineWidth(1).stroke();
    return 82;
  };

  const drawRow = (values, y, { bold = false, fill = null } = {}) => {
    const height = 18;
    if (fill) {
      doc.rect(left, y - 4, tableWidth, height).fill(fill);
    }
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(bold ? '#ffffff' : '#0f172a');

    let x = left;
    values.forEach((value, index) => {
      doc.text(String(value ?? ''), x + 4, y, {
        width: widths[index] - 8,
        height: height - 4,
        ellipsis: true,
        lineBreak: false,
      });
      x += widths[index];
    });
    return y + height;
  };

  let y = drawHeader();
  y = drawRow(columns.map((col) => col.header), y, { bold: true, fill: '#4f46e5' });

  rows.forEach((row, index) => {
    if (y > bottomLimit) {
      doc.addPage();
      y = drawHeader();
      y = drawRow(columns.map((col) => col.header), y, { bold: true, fill: '#4f46e5' });
    }
    y = drawRow(
      columns.map((col) => col.value(row)),
      y,
      { fill: index % 2 === 1 ? '#f1f5f9' : null }
    );
  });

  if (!rows.length) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#94a3b8')
      .text('No gate passes matched these filters.', left, y + 10);
  }

  // Footer on every page, written after the fact via bufferPages.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7).fillColor('#94a3b8').text(
      `Generated ${fmt(new Date())}${generatedBy ? ` by ${generatedBy}` : ''} · ${rows.length} record(s) · Page ${i + 1} of ${range.count}`,
      left,
      doc.page.height - doc.page.margins.bottom - 12,
      { width: tableWidth, align: 'center' }
    );
  }

  // The caller owns `.end()` — the document is already piped into the response.
  return doc;
};

/** Resolves the company name once so every writer stamps the same header. */
export const getExportBranding = async () => {
  const settings = await getSettings();
  return { companyName: settings?.company?.name || 'Amsons Group' };
};

export default {
  buildReportFilter,
  getReportSummary,
  getReportRows,
  getExportRows,
  buildExcel,
  buildCsv,
  buildPdf,
  csvEscape,
  exportFilename,
  getExportBranding,
  CONTENT_TYPES,
  EXPORT_COLUMNS,
};
