import { z } from 'zod';
import { LEAVE_STATUSES } from '../constants/index.js';
import { REPORT_KEYS } from '../services/leaveReport.service.js';

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const reportParamSchema = z.object({
  key: z.enum(REPORT_KEYS, { errorMap: () => ({ message: `Report must be one of: ${REPORT_KEYS.join(', ')}` }) }),
});

export const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  leaveType: objectId.optional(),
  unit: objectId.optional(),
  department: objectId.optional(),
  employee: objectId.optional(),
  status: z.enum(LEAVE_STATUSES).optional(),
  leaveYear: z.string().trim().regex(/^\d{4}-\d{4}$/, 'Leave year must look like 2026-2027').optional(),
});

export const exportQuerySchema = reportQuerySchema.extend({
  format: z.enum(['xlsx', 'csv', 'pdf']).default('xlsx'),
});

export default { reportParamSchema, reportQuerySchema, exportQuerySchema };
