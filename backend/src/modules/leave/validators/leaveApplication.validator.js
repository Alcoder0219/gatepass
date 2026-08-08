import { z } from 'zod';
import { DAY_PARTS, DAY_PART, LEAVE_STATUSES } from '../constants/index.js';

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');
const isoDate = z.coerce.date({ errorMap: () => ({ message: 'Pick a valid date' }) });

export const idParamSchema = z.object({ id: objectId });

/** Fields shared by preview, apply and bulk apply. */
const applicationCore = {
  leaveType: objectId,
  fromDate: isoDate,
  toDate: isoDate,
  fromDayPart: z.enum(DAY_PARTS).optional().default(DAY_PART.FULL),
  toDayPart: z.enum(DAY_PARTS).optional().default(DAY_PART.FULL),
};

/** The end date can equal the start date, but never precede it. */
const orderRule = (data, ctx) => {
  if (data.toDate < data.fromDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toDate'],
      message: 'The end date cannot be before the start date',
    });
  }
};

export const previewSchema = z
  .object({ ...applicationCore, employee: objectId.optional() })
  .superRefine(orderRule);

export const applySchema = z
  .object({
    ...applicationCore,
    reason: z
      .string()
      .trim()
      .min(5, 'Give a reason of at least 5 characters')
      .max(1000, 'Reason cannot exceed 1000 characters'),
    contactDuringLeave: z.string().trim().max(120).optional().default(''),
    handoverNotes: z.string().trim().max(1000).optional().default(''),
  })
  .superRefine(orderRule);

export const bulkApplySchema = z
  .object({
    ...applicationCore,
    employees: z.array(objectId).min(1, 'Select at least one employee').max(200),
    reason: z
      .string()
      .trim()
      .min(5, 'Give a reason of at least 5 characters')
      .max(1000, 'Reason cannot exceed 1000 characters'),
    contactDuringLeave: z.string().trim().max(120).optional().default(''),
    handoverNotes: z.string().trim().max(1000).optional().default(''),
  })
  .superRefine(orderRule);

export const listMyRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(LEAVE_STATUSES).optional(),
  leaveType: objectId.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  search: z.string().trim().optional(),
  sort: z.string().trim().optional().default('-createdAt'),
});

export const prefillQuerySchema = z.object({ employee: objectId.optional() });

export default {
  idParamSchema,
  previewSchema,
  applySchema,
  bulkApplySchema,
  listMyRequestsQuerySchema,
  prefillQuerySchema,
};
