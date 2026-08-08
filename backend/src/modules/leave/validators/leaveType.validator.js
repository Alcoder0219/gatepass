import { z } from 'zod';
import { LEAVE_NATURE, LEAVE_NATURES, LEAVE_CATEGORIES } from '../constants/index.js';

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');
const boolish = z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean());

export const idParamSchema = z.object({ id: objectId });

export const listLeaveTypesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  sort: z.string().trim().optional().default('code'),
  type: z.enum(LEAVE_NATURES).optional(),
  category: z.enum(LEAVE_CATEGORIES).optional(),
  isActive: boolish.optional(),
});

const base = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Leave code must be at least 2 characters')
    .max(10, 'Leave code cannot exceed 10 characters')
    .regex(/^[A-Z0-9_]+$/, 'Leave code may only contain A-Z, 0-9 and underscores'),
  name: z
    .string()
    .trim()
    .min(2, 'Leave name must be at least 2 characters')
    .max(60, 'Leave name cannot exceed 60 characters'),
  type: z.enum(LEAVE_NATURES, { errorMap: () => ({ message: 'Leave type must be PAID or UNPAID' }) }),
  category: z.enum(LEAVE_CATEGORIES, { errorMap: () => ({ message: 'Select a leave category' }) }),
  includeWeeklyOff: boolish.optional().default(false),
  includeHolidays: boolish.optional().default(false),
  description: z.string().trim().max(250).optional().default(''),
  annualQuota: z.coerce.number().min(0, 'Annual quota cannot be negative').max(400).optional().default(0),
  allowHalfDay: boolish.optional().default(true),
  requiresAttachmentAfterDays: z.coerce.number().int().min(0).max(60).optional().default(0),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #6366f1').optional(),
  isActive: boolish.optional().default(true),
};

/**
 * A PAID type must actually grant something, otherwise nobody can ever apply
 * for it. UNPAID is pinned to 0 by the model, so it is exempt.
 */
const quotaRule = (data, ctx) => {
  if (data.type === LEAVE_NATURE.PAID && (data.annualQuota ?? 0) <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['annualQuota'],
      message: 'A paid leave type must grant at least 0.5 days a year',
    });
  }
};

export const createLeaveTypeSchema = z.object(base).superRefine(quotaRule);

export const updateLeaveTypeSchema = z
  .object(base)
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes were supplied' })
  .superRefine((data, ctx) => {
    // Only enforce the pairing when both halves are being written together;
    // a partial update that touches one is checked against the stored doc in
    // the controller, where the other value is known.
    if (data.type !== undefined && data.annualQuota !== undefined) quotaRule(data, ctx);
  });

export const toggleStatusSchema = z.object({ isActive: boolish });

export default {
  idParamSchema,
  listLeaveTypesQuerySchema,
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  toggleStatusSchema,
};
