import { z } from 'zod';
import { GATEPASS_STATUSES, GATEPASS_TYPES } from '../constants/index.js';

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, 'A valid id is required');

/** `?status=PENDING&status=APPROVED` and `?status=PENDING,APPROVED` both work. */
const csvEnum = (values, label) =>
  z.preprocess(
    (raw) => {
      if (raw == null || raw === '') return undefined;
      const list = Array.isArray(raw) ? raw : String(raw).split(',');
      return list.map((v) => String(v).trim().toUpperCase()).filter(Boolean);
    },
    z.array(z.enum(values, { errorMap: () => ({ message: `Unknown ${label}` }) })).optional()
  );

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'A valid date is required');

/** The shared filter surface — identical to the gate pass list screen. */
export const reportFilterSchema = z
  .object({
    status: csvEnum(GATEPASS_STATUSES, 'status'),
    type: csvEnum(GATEPASS_TYPES, 'type'),
    unit: objectId.optional(),
    department: objectId.optional(),
    employee: objectId.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    search: z.string().trim().max(120).optional(),
  })
  .refine((data) => !(data.from && data.to) || new Date(data.from) <= new Date(data.to), {
    message: 'The "from" date must not be after the "to" date',
    path: ['from'],
  });

export const reportSummarySchema = reportFilterSchema;

/** Paginated table rows for the report grid. */
export const reportRowsSchema = z
  .object({
    status: csvEnum(GATEPASS_STATUSES, 'status'),
    type: csvEnum(GATEPASS_TYPES, 'type'),
    unit: objectId.optional(),
    department: objectId.optional(),
    employee: objectId.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(200).optional().default(20),
    sortBy: z
      .enum(['createdAt', 'expectedOutTime', 'status', 'type', 'employeeName', 'gatePassNumber'])
      .optional()
      .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .refine((data) => !(data.from && data.to) || new Date(data.from) <= new Date(data.to), {
    message: 'The "from" date must not be after the "to" date',
    path: ['from'],
  });

/** Export = the same filters + a file format. */
export const reportExportSchema = z
  .object({
    format: z.enum(['xlsx', 'csv', 'pdf'], { errorMap: () => ({ message: 'Format must be xlsx, csv or pdf' }) }).default('xlsx'),
    status: csvEnum(GATEPASS_STATUSES, 'status'),
    type: csvEnum(GATEPASS_TYPES, 'type'),
    unit: objectId.optional(),
    department: objectId.optional(),
    employee: objectId.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    search: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(20_000).optional().default(5000),
  })
  .refine((data) => !(data.from && data.to) || new Date(data.from) <= new Date(data.to), {
    message: 'The "from" date must not be after the "to" date',
    path: ['from'],
  });

export default {
  reportFilterSchema,
  reportSummarySchema,
  reportRowsSchema,
  reportExportSchema,
};

