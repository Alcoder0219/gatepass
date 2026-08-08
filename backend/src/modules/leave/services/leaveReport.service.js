import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

import ApiError from '../../../utils/ApiError.js';
import User from '../../../models/User.js';
import { dateFilter, dayjs } from '../../../utils/dates.js';

import LeaveRequest from '../models/LeaveRequest.js';
import LeaveBalance from '../models/LeaveBalance.js';
import LeaveType from '../models/LeaveType.js';
import { buildLeaveScope } from './leaveScope.service.js';
import { buildUserScope } from '../../../services/scope.service.js';
import { currentLeaveYear } from './leaveDashboard.service.js';
import { LEAVE_STATUS, PENDING_STATUSES, APPROVED_STATUSES } from '../constants/index.js';

/**
 * Ten reports over one shape.
 *
 * Every report declares its own `columns` and returns `rows`, so a single
 * Excel / PDF / CSV writer serves all of them — adding an eleventh report never
 * touches the exporters. `charts` is a generic descriptor the frontend maps
 * onto the existing chart components.
 *
 * Nothing here imports or alters the gate pass report service.
 */

const round = (value, dp = 1) => {
  const f = 10 ** dp;
  return Math.round((Number(value) || 0) * f) / f;
};

const num = (value) => Number(value) || 0;

/** Row-level scope + the shared query filters. */
const baseMatch = async (user, query) => {
  const scope = await buildLeaveScope(user);
  const match = { ...scope, isDeleted: false };

  if (query.leaveType) match.leaveType = query.leaveType;
  if (query.unit) match.unit = query.unit;
  if (query.department) match.department = query.department;
  if (query.employee) match.employee = query.employee;
  if (query.status) match.status = query.status;
  if (query.leaveYear) match.leaveYear = query.leaveYear;

  const range = dateFilter(query.from, query.to);
  if (range) match.fromDate = range;

  return match;
};

/* ─── Column sets ─────────────────────────────────────────────────────────── */
const REGISTER_COLUMNS = [
  { key: 'leaveNumber', header: 'Leave No.', width: 20 },
  { key: 'employeeName', header: 'Employee', width: 22 },
  { key: 'employeeCode', header: 'Code', width: 12 },
  { key: 'departmentName', header: 'Department', width: 18 },
  { key: 'unitName', header: 'Company', width: 14 },
  { key: 'leaveTypeCode', header: 'Type', width: 8 },
  { key: 'fromDate', header: 'From', width: 13 },
  { key: 'toDate', header: 'To', width: 13 },
  { key: 'totalDays', header: 'Days', width: 8 },
  { key: 'status', header: 'Status', width: 14 },
  { key: 'reason', header: 'Reason', width: 34 },
];

const registerRows = (docs) =>
  docs.map((row) => ({
    leaveNumber: row.leaveNumber,
    employeeName: row.employeeName,
    employeeCode: row.employeeCode,
    departmentName: row.departmentName,
    unitName: row.unitName,
    leaveTypeCode: row.leaveTypeCode,
    fromDate: dayjs(row.fromDate).format('DD MMM YYYY'),
    toDate: dayjs(row.toDate).format('DD MMM YYYY'),
    totalDays: row.totalDays,
    status: row.status,
    reason: row.reason,
  }));

/** A register scoped to one status set — powers Pending / Approved / Rejected. */
const registerReport = (title, statuses) => async (user, query) => {
  const match = await baseMatch(user, query);
  if (statuses) match.status = { $in: statuses };

  const docs = await LeaveRequest.find(match).sort('-fromDate').limit(5000).lean();

  const byStatus = {};
  const byType = {};
  for (const row of docs) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    byType[row.leaveTypeCode] = (byType[row.leaveTypeCode] ?? 0) + row.totalDays;
  }

  return {
    title,
    columns: REGISTER_COLUMNS,
    rows: registerRows(docs),
    summary: {
      applications: docs.length,
      days: round(docs.reduce((sum, row) => sum + row.totalDays, 0)),
      employees: new Set(docs.map((row) => String(row.employee))).size,
    },
    charts: [
      { type: 'donut', title: 'By status', data: Object.entries(byStatus).map(([name, count]) => ({ name, count })) },
      { type: 'bar', title: 'Days by leave type', data: Object.entries(byType).map(([name, count]) => ({ name, count: round(count) })) },
    ],
  };
};

/* ─── Leave Balance ───────────────────────────────────────────────────────── */
const balanceReport = async (user, query) => {
  const leaveYear = query.leaveYear || currentLeaveYear();

  const userScope = await buildUserScope(user);
  const userFilter = { ...userScope, status: 'ACTIVE' };
  if (query.unit) userFilter.unit = query.unit;
  if (query.department) userFilter.department = query.department;
  if (query.employee) userFilter._id = query.employee;

  const employees = await User.find(userFilter)
    .select('name employeeId department unit')
    .populate('department', 'name')
    .populate('unit', 'name')
    .sort('name')
    .lean();

  const balanceFilter = { employee: { $in: employees.map((e) => e._id) }, leaveYear };
  if (query.leaveType) balanceFilter.leaveType = query.leaveType;

  const balances = await LeaveBalance.find(balanceFilter).populate('leaveType', 'code name').lean();
  const byEmployee = new Map(employees.map((e) => [String(e._id), e]));

  const rows = [];
  const byType = {};

  for (const row of balances) {
    if (!row.leaveType) continue;
    const person = byEmployee.get(String(row.employee));
    if (!person) continue;

    const entitled = num(row.opening) + num(row.accrued) + num(row.carriedForward) + num(row.adjusted);
    const available = Math.max(0, entitled - num(row.used) - num(row.pending));

    rows.push({
      employeeName: person.name,
      employeeCode: person.employeeId,
      departmentName: person.department?.name ?? '',
      unitName: person.unit?.name ?? '',
      leaveTypeCode: row.leaveType.code,
      entitled: round(entitled),
      used: round(num(row.used)),
      pending: round(num(row.pending)),
      available: round(available),
    });

    byType[row.leaveType.code] = round((byType[row.leaveType.code] ?? 0) + available);
  }

  rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.leaveTypeCode.localeCompare(b.leaveTypeCode));

  return {
    title: `Leave Balance — ${leaveYear}`,
    columns: [
      { key: 'employeeName', header: 'Employee', width: 22 },
      { key: 'employeeCode', header: 'Code', width: 12 },
      { key: 'departmentName', header: 'Department', width: 18 },
      { key: 'unitName', header: 'Company', width: 14 },
      { key: 'leaveTypeCode', header: 'Type', width: 8 },
      { key: 'entitled', header: 'Entitled', width: 10 },
      { key: 'used', header: 'Used', width: 10 },
      { key: 'pending', header: 'Pending', width: 10 },
      { key: 'available', header: 'Available', width: 11 },
    ],
    rows,
    summary: {
      employees: employees.length,
      entitled: round(rows.reduce((s, r) => s + r.entitled, 0)),
      used: round(rows.reduce((s, r) => s + r.used, 0)),
      available: round(rows.reduce((s, r) => s + r.available, 0)),
    },
    charts: [
      { type: 'bar', title: 'Available days by leave type', data: Object.entries(byType).map(([name, count]) => ({ name, count })) },
    ],
  };
};

/* ─── Grouped reports: Department / Company / Employee ────────────────────── */
const groupedReport = ({ title, groupBy, labelField, labelHeader }) => async (user, query) => {
  const match = await baseMatch(user, query);

  const grouped = await LeaveRequest.aggregate([
    { $match: match },
    {
      $group: {
        _id: `$${groupBy}`,
        label: { $first: `$${labelField}` },
        applications: { $sum: 1 },
        days: { $sum: '$totalDays' },
        employees: { $addToSet: '$employee' },
        approved: { $sum: { $cond: [{ $in: ['$status', APPROVED_STATUSES] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $in: ['$status', PENDING_STATUSES] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', LEAVE_STATUS.REJECTED] }, 1, 0] } },
      },
    },
    { $project: { label: 1, applications: 1, days: 1, approved: 1, pending: 1, rejected: 1, employees: { $size: '$employees' } } },
    { $sort: { days: -1 } },
  ]);

  const rows = grouped.map((row) => ({
    label: row.label || '—',
    employees: row.employees,
    applications: row.applications,
    days: round(row.days),
    approved: row.approved,
    pending: row.pending,
    rejected: row.rejected,
    avgDays: round(row.applications ? row.days / row.applications : 0),
  }));

  return {
    title,
    columns: [
      { key: 'label', header: labelHeader, width: 26 },
      { key: 'employees', header: 'Employees', width: 12 },
      { key: 'applications', header: 'Applications', width: 13 },
      { key: 'days', header: 'Total Days', width: 12 },
      { key: 'approved', header: 'Approved', width: 11 },
      { key: 'pending', header: 'Pending', width: 10 },
      { key: 'rejected', header: 'Rejected', width: 10 },
      { key: 'avgDays', header: 'Avg Days', width: 11 },
    ],
    rows,
    summary: {
      groups: rows.length,
      applications: rows.reduce((s, r) => s + r.applications, 0),
      days: round(rows.reduce((s, r) => s + r.days, 0)),
    },
    charts: [
      { type: 'bar', title: `Days by ${labelHeader.toLowerCase()}`, data: rows.slice(0, 10).map((r) => ({ name: r.label, count: r.days })) },
    ],
  };
};

/* ─── Leave Utilization ───────────────────────────────────────────────────── */
const utilizationReport = async (user, query) => {
  const leaveYear = query.leaveYear || currentLeaveYear();

  const userScope = await buildUserScope(user);
  const userFilter = { ...userScope, status: 'ACTIVE' };
  if (query.unit) userFilter.unit = query.unit;
  if (query.department) userFilter.department = query.department;

  const employeeIds = (await User.find(userFilter).select('_id').lean()).map((e) => e._id);
  const types = await LeaveType.find({ isActive: true }).sort('code').lean();

  const balances = await LeaveBalance.find({ employee: { $in: employeeIds }, leaveYear }).lean();

  const byType = new Map(types.map((t) => [String(t._id), { code: t.code, name: t.name, entitled: 0, used: 0, pending: 0 }]));
  for (const row of balances) {
    const entry = byType.get(String(row.leaveType));
    if (!entry) continue;
    entry.entitled += num(row.opening) + num(row.accrued) + num(row.carriedForward) + num(row.adjusted);
    entry.used += num(row.used);
    entry.pending += num(row.pending);
  }

  const rows = [...byType.values()].map((entry) => ({
    leaveTypeCode: entry.code,
    leaveTypeName: entry.name,
    entitled: round(entry.entitled),
    used: round(entry.used),
    pending: round(entry.pending),
    available: round(Math.max(0, entry.entitled - entry.used - entry.pending)),
    utilization: round(entry.entitled ? (entry.used / entry.entitled) * 100 : 0),
  }));

  const totalEntitled = rows.reduce((s, r) => s + r.entitled, 0);
  const totalUsed = rows.reduce((s, r) => s + r.used, 0);

  return {
    title: `Leave Utilization — ${leaveYear}`,
    columns: [
      { key: 'leaveTypeCode', header: 'Type', width: 8 },
      { key: 'leaveTypeName', header: 'Leave Type', width: 22 },
      { key: 'entitled', header: 'Entitled', width: 11 },
      { key: 'used', header: 'Used', width: 10 },
      { key: 'pending', header: 'Pending', width: 10 },
      { key: 'available', header: 'Available', width: 11 },
      { key: 'utilization', header: 'Utilization %', width: 14 },
    ],
    rows,
    summary: {
      employees: employeeIds.length,
      entitled: round(totalEntitled),
      used: round(totalUsed),
      utilization: round(totalEntitled ? (totalUsed / totalEntitled) * 100 : 0),
    },
    charts: [
      { type: 'bar', title: 'Utilization % by leave type', data: rows.map((r) => ({ name: r.leaveTypeCode, count: r.utilization })) },
      { type: 'donut', title: 'Used vs available', data: [
        { name: 'Used', count: round(totalUsed) },
        { name: 'Available', count: round(Math.max(0, totalEntitled - totalUsed)) },
      ] },
    ],
  };
};

/* ─── Yearly Summary ──────────────────────────────────────────────────────── */
const yearlyReport = async (user, query) => {
  const leaveYear = query.leaveYear || currentLeaveYear();
  const [startYear] = leaveYear.split('-').map(Number);
  // Assumption A5 — the leave year runs April to March.
  const start = dayjs(`${startYear}-04-01`).startOf('day');
  const end = start.add(1, 'year').subtract(1, 'day').endOf('day');

  const match = await baseMatch(user, { ...query, from: undefined, to: undefined });
  match.fromDate = { $gte: start.toDate(), $lte: end.toDate() };

  const monthly = await LeaveRequest.aggregate([
    { $match: match },
    {
      $group: {
        _id: { year: { $year: '$fromDate' }, month: { $month: '$fromDate' } },
        applications: { $sum: 1 },
        days: { $sum: '$totalDays' },
        approved: { $sum: { $cond: [{ $in: ['$status', APPROVED_STATUSES] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', LEAVE_STATUS.REJECTED] }, 1, 0] } },
        employees: { $addToSet: '$employee' },
      },
    },
    { $project: { applications: 1, days: 1, approved: 1, rejected: 1, employees: { $size: '$employees' } } },
  ]);

  const byKey = new Map(monthly.map((row) => [`${row._id.year}-${row._id.month}`, row]));

  // Every month is emitted, even the empty ones — a trend with holes reads as
  // missing data rather than as a quiet month.
  const rows = [];
  for (let i = 0; i < 12; i += 1) {
    const month = start.add(i, 'month');
    const hit = byKey.get(`${month.year()}-${month.month() + 1}`);
    rows.push({
      month: month.format('MMM YYYY'),
      applications: hit?.applications ?? 0,
      days: round(hit?.days ?? 0),
      approved: hit?.approved ?? 0,
      rejected: hit?.rejected ?? 0,
      employees: hit?.employees ?? 0,
    });
  }

  return {
    title: `Yearly Summary — ${leaveYear}`,
    columns: [
      { key: 'month', header: 'Month', width: 14 },
      { key: 'applications', header: 'Applications', width: 13 },
      { key: 'days', header: 'Total Days', width: 12 },
      { key: 'approved', header: 'Approved', width: 11 },
      { key: 'rejected', header: 'Rejected', width: 11 },
      { key: 'employees', header: 'Employees', width: 12 },
    ],
    rows,
    summary: {
      applications: rows.reduce((s, r) => s + r.applications, 0),
      days: round(rows.reduce((s, r) => s + r.days, 0)),
      approved: rows.reduce((s, r) => s + r.approved, 0),
      rejected: rows.reduce((s, r) => s + r.rejected, 0),
    },
    charts: [
      { type: 'line', title: 'Applications and days by month', data: rows.map((r) => ({ name: r.month, count: r.applications, days: r.days })) },
    ],
  };
};

/* ─── The catalogue ───────────────────────────────────────────────────────── */
export const REPORTS = {
  BALANCE: { label: 'Leave Balance', build: balanceReport },
  REGISTER: { label: 'Leave Register', build: registerReport('Leave Register', null) },
  PENDING: { label: 'Pending', build: registerReport('Pending Applications', PENDING_STATUSES) },
  APPROVED: { label: 'Approved', build: registerReport('Approved Applications', APPROVED_STATUSES) },
  REJECTED: { label: 'Rejected', build: registerReport('Rejected Applications', [LEAVE_STATUS.REJECTED]) },
  DEPARTMENT: {
    label: 'Department Wise',
    build: groupedReport({ title: 'Department Wise', groupBy: 'department', labelField: 'departmentName', labelHeader: 'Department' }),
  },
  COMPANY: {
    label: 'Company Wise',
    build: groupedReport({ title: 'Company Wise', groupBy: 'unit', labelField: 'unitName', labelHeader: 'Company' }),
  },
  EMPLOYEE: {
    label: 'Employee Wise',
    build: groupedReport({ title: 'Employee Wise', groupBy: 'employee', labelField: 'employeeName', labelHeader: 'Employee' }),
  },
  UTILIZATION: { label: 'Leave Utilization', build: utilizationReport },
  YEARLY: { label: 'Yearly Summary', build: yearlyReport },
};

export const REPORT_KEYS = Object.keys(REPORTS);

export const buildReport = async (user, key, query) => {
  const report = REPORTS[key];
  if (!report) throw ApiError.badRequest(`Unknown report: ${key}`);
  const result = await report.build(user, query);
  return { key, ...result, generatedAt: new Date() };
};

/* ─── Exporters — generic over `columns` + `rows` ─────────────────────────── */

export const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
};

export const exportFilename = (key, format) =>
  `leave-${key.toLowerCase()}-report-${dayjs().format('YYYY-MM-DD-HHmm')}.${format}`;

export const buildExcel = async (report, { companyName = 'Amsons Group', generatedBy = '' } = {}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(report.label ?? 'Report', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const span = report.columns.length;

  sheet.mergeCells(1, 1, 1, span);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${companyName} — ${report.title}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };

  sheet.mergeCells(2, 1, 2, span);
  const metaCell = sheet.getCell(2, 1);
  metaCell.value = `Generated ${dayjs().format('DD MMM YYYY, HH:mm')}${generatedBy ? ` by ${generatedBy}` : ''} · ${report.rows.length} row(s)`;
  metaCell.font = { size: 9, color: { argb: 'FF64748B' } };

  sheet.getRow(3).values = report.columns.map((col) => col.header);
  report.columns.forEach((col, index) => {
    sheet.getColumn(index + 1).width = col.width ?? 16;
  });

  const header = sheet.getRow(3);
  header.height = 20;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  for (const row of report.rows) {
    sheet.addRow(report.columns.map((col) => row[col.key] ?? ''));
  }

  // Zebra striping starts below the header block.
  sheet.eachRow((row, index) => {
    if (index <= 3) return;
    if (index % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }
  });

  return workbook.xlsx.writeBuffer();
};

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const buildCsv = (report) => {
  const lines = [report.columns.map((col) => csvEscape(col.header)).join(',')];
  for (const row of report.rows) {
    lines.push(report.columns.map((col) => csvEscape(row[col.key])).join(','));
  }
  // BOM so Excel reads it as UTF-8.
  return `﻿${lines.join('\r\n')}`;
};

export const buildPdf = (report, { companyName = 'Amsons Group', generatedBy = '', stream = null } = {}) => {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true });
  if (stream) doc.pipe(stream);

  const left = doc.page.margins.left;
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWeight = report.columns.reduce((sum, col) => sum + (col.width ?? 16), 0);
  const widths = report.columns.map((col) => ((col.width ?? 16) / totalWeight) * tableWidth);
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 24;

  const drawTitle = () => {
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16).text(companyName, left, 26);
    doc.font('Helvetica').fontSize(10).fillColor('#334155').text(report.title, left, 46);
    doc
      .fontSize(8)
      .fillColor('#64748b')
      .text(
        `Generated ${dayjs().format('DD MMM YYYY, HH:mm')}${generatedBy ? ` by ${generatedBy}` : ''}  •  ${report.rows.length} row(s)`,
        left,
        60,
        { width: tableWidth }
      );
    doc.moveTo(left, 74).lineTo(left + tableWidth, 74).strokeColor('#e2e8f0').lineWidth(1).stroke();
    return 84;
  };

  const drawRow = (values, y, { bold = false, fill = null } = {}) => {
    const height = 18;
    if (fill) doc.rect(left, y, tableWidth, height).fill(fill);

    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(bold ? '#ffffff' : '#0f172a');
    let x = left;
    values.forEach((value, index) => {
      doc.text(String(value ?? ''), x + 4, y + 5, {
        width: widths[index] - 8,
        height: height - 6,
        ellipsis: true,
        lineBreak: false,
      });
      x += widths[index];
    });
    return y + height;
  };

  let y = drawTitle();
  y = drawRow(report.columns.map((col) => col.header), y, { bold: true, fill: '#4f46e5' });

  report.rows.forEach((row, index) => {
    if (y > bottomLimit) {
      doc.addPage();
      y = drawTitle();
      y = drawRow(report.columns.map((col) => col.header), y, { bold: true, fill: '#4f46e5' });
    }
    y = drawRow(
      report.columns.map((col) => row[col.key]),
      y,
      { fill: index % 2 ? '#f8fafc' : null }
    );
  });

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#94a3b8')
      .text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - doc.page.margins.bottom - 12, {
        width: tableWidth,
        align: 'right',
      });
  }

  doc.end();
  return doc;
};

export default { REPORTS, REPORT_KEYS, buildReport, buildExcel, buildCsv, buildPdf, CONTENT_TYPES, exportFilename };
