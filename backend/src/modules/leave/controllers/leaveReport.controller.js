import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess } from '../../../utils/ApiResponse.js';
import { recordAudit } from '../../../services/audit.service.js';
import { getSettings } from '../../../services/settings.service.js';
import { AUDIT_ACTION } from '../../../constants/index.js';

import {
  REPORTS,
  REPORT_KEYS,
  buildReport,
  buildExcel,
  buildCsv,
  buildPdf,
  CONTENT_TYPES,
  exportFilename,
} from '../services/leaveReport.service.js';

/* ─── GET /leave/reports ──────────────────────────────────────────────────── */
export const catalogue = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    data: REPORT_KEYS.map((key) => ({ key, label: REPORTS[key].label })),
    message: 'Report catalogue fetched successfully',
  })
);

/* ─── GET /leave/reports/:key ─────────────────────────────────────────────── */
export const run = asyncHandler(async (req, res) => {
  const report = await buildReport(req.user, req.params.key, req.query);
  return sendSuccess(res, { data: report, message: `${report.title} generated` });
});

/* ─── GET /leave/reports/:key/export ──────────────────────────────────────── */
export const exportReport = asyncHandler(async (req, res) => {
  const { format, ...query } = req.query;
  const report = await buildReport(req.user, req.params.key, query);
  report.label = REPORTS[req.params.key].label;

  const settings = await getSettings();
  const companyName = settings.company?.name || 'Amsons Group';
  const filename = exportFilename(req.params.key, format);

  await recordAudit({
    action: AUDIT_ACTION.EXPORT,
    actor: req.user,
    entity: 'LeaveRequest',
    entityLabel: `${report.title} (${format})`,
    description: `Exported "${report.title}" as ${format.toUpperCase()} — ${report.rows.length} row(s)`,
    req,
  });

  res.setHeader('Content-Type', CONTENT_TYPES[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  if (format === 'csv') return res.send(buildCsv(report));

  if (format === 'xlsx') {
    const buffer = await buildExcel(report, { companyName, generatedBy: req.user.name });
    return res.send(Buffer.from(buffer));
  }

  // PDF streams straight into the response — a large register never has to be
  // buffered in memory first.
  buildPdf(report, { companyName, generatedBy: req.user.name, stream: res });
  return undefined;
});

export default { catalogue, run, exportReport };
