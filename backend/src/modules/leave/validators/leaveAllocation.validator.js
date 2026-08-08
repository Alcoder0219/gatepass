import { z } from 'zod';

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');
const boolish = z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean());

/** Leave year label, e.g. '2026-2027'. */
const leaveYear = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, 'Leave year must look like 2026-2027')
  .refine((value) => {
    const [from, to] = value.split('-').map(Number);
    return to === from + 1;
  }, 'The second year must follow the first');

/** Days are recorded in half-day steps. */
const days = z
  .coerce.number()
  .min(0, 'Days cannot be negative')
  .max(400, 'That is more than a year')
  .refine((value) => Number.isInteger(value * 2), 'Use whole or half days');

export const idParamSchema = z.object({ id: objectId });

export const listAllocationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  year: leaveYear.optional(),
  /** "Company" on the UI — this system models sites as Units. */
  unit: objectId.optional(),
  department: objectId.optional(),
  employee: objectId.optional(),
  search: z.string().trim().optional(),
  sort: z.string().trim().optional().default('name'),
  /** Only employees who already hold an allocation for the year. */
  allocatedOnly: boolish.optional(),
});

/** One leave type inside a New Allocation submission. */
const allocationLine = z.object({
  leaveType: objectId,
  opening: days.optional().default(0),
  accrued: days,
  carriedForward: days.optional().default(0),
  adjusted: z.coerce.number().min(-400).max(400).optional().default(0),
});

export const createAllocationSchema = z
  .object({
    leaveYear,
    employees: z.array(objectId).min(1, 'Select at least one employee').max(500),
    allocations: z.array(allocationLine).min(1, 'Add at least one leave type'),
    remarks: z.string().trim().max(250).optional().default(''),
    /** Overwrite an existing row rather than refusing it. */
    overwrite: boolish.optional().default(false),
  })
  .superRefine((data, ctx) => {
    const seen = new Set();
    data.allocations.forEach((line, index) => {
      if (seen.has(line.leaveType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['allocations', index, 'leaveType'],
          message: 'This leave type is listed twice',
        });
      }
      seen.add(line.leaveType);
    });
  });

export const updateAllocationSchema = z
  .object({
    opening: days.optional(),
    accrued: days.optional(),
    carriedForward: days.optional(),
    adjusted: z.coerce.number().min(-400).max(400).optional(),
    remarks: z.string().trim().max(250).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes were supplied' });

export default {
  idParamSchema,
  listAllocationsQuerySchema,
  createAllocationSchema,
  updateAllocationSchema,
};
