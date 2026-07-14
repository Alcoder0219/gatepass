import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/ApiResponse.js';
import { recordAudit } from '../services/audit.service.js';
import { AUDIT_ACTION } from '../constants/index.js';
import reportService from '../services/report.service.js';

const {
  buildReportFilter,
  getReportSummary,
  getReportRows,
  getExportRows,
  buildExcel,
  buildCsv,
  buildPdf,
  exportFilename,
  getExportBranding,
  CONTENT_TYPES,
} = reportService;

/** GET /reports/summary */
export const getSummary = asyncHandler(async (req, res) => {
  const filter = await buildReportFilter(req.user, req.query);
  const summary = await getReportSummary(filter);

  return sendSuccess(res, {
    message: 'Report summary generated',
    data: summary,
    meta: { filters: req.query },
  });
});

/** GET /reports/gate-passes — the paginated report table. */
export const getGatePassReport = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, ...filters } = req.query;
  const filter = await buildReportFilter(req.user, filters);
  const result = await getReportRows(filter, { page, limit, sortBy, sortOrder });

  return sendPaginated(res, result, 'Report rows fetched');
});

/**
 * GET /reports/export?format=xlsx|csv|pdf
 * The controller stays thin: build the filter, fetch, hand off to the writer.
 */
export const exportReport = asyncHandler(async (req, res) => {
  const { format, limit, ...filters } = req.query;

  const filter = await buildReportFilter(req.user, filters);
  const rows = await getExportRows(filter, limit);
  const { companyName } = await getExportBranding();

  const filename = exportFilename(format);
  const meta = { companyName, generatedBy: req.user.name, filters };

  await recordAudit({
    action: AUDIT_ACTION.EXPORT,
    actor: req.user,
    entity: 'GatePass',
    entityLabel: filename,
    description: `Exported ${rows.length} gate pass record(s) as ${format.toUpperCase()}`,
    changes: { format, filters, count: rows.length },
    req,
  });

  res.setHeader('Content-Type', CONTENT_TYPES[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');

  if (format === 'csv') {
    return res.send(buildCsv(rows));
  }

  if (format === 'pdf') {
    buildPdf(rows, { ...meta, stream: res }).end();
    return undefined;
  }

  const workbook = await buildExcel(rows, meta);
  await workbook.xlsx.write(res);
  return res.end();
});

export default { getSummary, getGatePassReport, exportReport };
