import { z } from 'zod';
import { LEAVE_STATUSES } from '../constants/index.js';

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const idParamSchema = z.object({ id: objectId });

export const queueQuerySchema = z.object({
  stage: z.enum(['MANAGER', 'HR', 'HISTORY']).default('MANAGER'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().trim().optional().default('-createdAt'),
  status: z.enum(LEAVE_STATUSES).optional(),
  search: z.string().trim().optional(),
});

/** Approval remarks are optional; the decision is the record. */
export const approveSchema = z.object({
  remarks: z.string().trim().max(1000, 'Remarks cannot exceed 1000 characters').optional().default(''),
});

/** Rejection remarks are NOT optional — a refusal without a reason is unusable. */
export const rejectSchema = z.object({
  remarks: z
    .string()
    .trim()
    .min(5, 'Give a reason of at least 5 characters')
    .max(1000, 'Remarks cannot exceed 1000 characters'),
});

export const sendBackSchema = rejectSchema;

export default { idParamSchema, queueQuerySchema, approveSchema, rejectSchema, sendBackSchema };
