import { z } from 'zod';
import { GATEPASS_STATUSES, GATEPASS_TYPES } from '../constants/index.js';

/* ─── Primitives ──────────────────────────────────────────────────────────── */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

export const idParamSchema = z.object({ id: objectId });

/** `status=PENDING` or `status=PENDING,HR_REVIEW` → always an array. */
const statusCsv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  )
  .pipe(z.array(z.enum(GATEPASS_STATUSES)).min(1));

/* ─── Listing ─────────────────────────────────────────────────────────────── */
export const listGatePassQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: statusCsv.optional(),
  type: z.enum(GATEPASS_TYPES).optional(),
  unit: objectId.optional(),
  department: objectId.optional(),
  employee: objectId.optional(),
  reportingManager: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().trim().max(60).default('-createdAt'),
});

/* ─── Create / update ─────────────────────────────────────────────────────── */
/**
 * The employee, department and unit are NEVER read from the body — they come
 * from the session. Zod strips every key that is not declared here, so a client
 * that tries to raise a pass for someone else silently loses those fields.
 */
export const createGatePassSchema = z
  .object({
    type: z.enum(GATEPASS_TYPES),
    reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500),
    purpose: z.string().trim().max(1000).optional().default(''),
    expectedOutTime: z.coerce.date(),
    expectedInTime: z.coerce.date(),
    remarks: z.string().trim().max(1000).optional().default(''),
  })
  .refine((data) => data.expectedInTime > data.expectedOutTime, {
    message: 'Expected in-time must be after the expected out-time',
    path: ['expectedInTime'],
  });

export const updateGatePassSchema = z
  .object({
    type: z.enum(GATEPASS_TYPES).optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    purpose: z.string().trim().max(1000).optional(),
    expectedOutTime: z.coerce.date().optional(),
    expectedInTime: z.coerce.date().optional(),
    remarks: z.string().trim().max(1000).optional(),
  })
  .refine(
    (data) =>
      !data.expectedOutTime || !data.expectedInTime || data.expectedInTime > data.expectedOutTime,
    {
      message: 'Expected in-time must be after the expected out-time',
      path: ['expectedInTime'],
    }
  );

/* ─── Decisions ───────────────────────────────────────────────────────────── */
const optionalComment = z.string().trim().max(1000).optional().default('');
const requiredComment = z.string().trim().min(3, 'A comment is required').max(1000);

export const approveSchema = z.object({ comment: optionalComment });
export const rejectSchema = z.object({ comment: requiredComment });
export const requestChangesSchema = z.object({ comment: requiredComment });
export const cancelSchema = z.object({ comment: optionalComment });

/* ─── HR ──────────────────────────────────────────────────────────────────── */
export const hrReviewSchema = z
  .object({
    status: z.enum(['OK', 'NOT_OK']),
    comment: z.string().trim().max(1000).optional().default(''),
  })
  .refine((data) => data.status !== 'NOT_OK' || data.comment.length > 0, {
    message: 'A comment is required when marking a review as Not OK',
    path: ['comment'],
  });

export const hrReviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  gatePass: objectId.optional(),
  reviewer: objectId.optional(),
  status: z.enum(['OK', 'NOT_OK']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().trim().max(60).default('-reviewedAt'),
});

/* ─── Global search ───────────────────────────────────────────────────────── */
export const globalSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
});

export default {
  objectId,
  idParamSchema,
  listGatePassQuerySchema,
  createGatePassSchema,
  updateGatePassSchema,
  approveSchema,
  rejectSchema,
  requestChangesSchema,
  cancelSchema,
  hrReviewSchema,
  hrReviewListQuerySchema,
  globalSearchQuerySchema,
};
