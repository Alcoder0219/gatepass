import { z } from 'zod';
import { objectId } from './gatepass.validator.js';

/** The scanner posts whatever it decoded — a JSON QR payload, a bare token or a typed number. */
export const verifySchema = z.object({
  code: z.string().trim().min(3, 'Scan or type a gate pass code').max(500),
});

/** Shared body for `mark exit` / `mark return` (multipart — the photo is a file). */
export const gateActionSchema = z.object({
  remark: z.string().trim().max(500).optional().default(''),
  method: z.enum(['QR', 'MANUAL', 'SEARCH']).optional().default('MANUAL'),
});

export const securityQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  unit: objectId.optional(),
  sort: z.string().trim().max(60).default('expectedOutTime'),
});

export const securityHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  type: z.enum(['EXIT', 'ENTRY']).optional(),
  employee: objectId.optional(),
  unit: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().trim().max(60).default('-recordedAt'),
});

export default {
  verifySchema,
  gateActionSchema,
  securityQueueQuerySchema,
  securityHistoryQuerySchema,
};
