import { z } from 'zod';
import { LEAVE_STATUSES } from '../constants/index.js';

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');
const isoDate = z.coerce.date().optional();

export const idParamSchema = z.object({ id: objectId });

/** Filters shared by the live list, the register, the report and the export. */
const filters = {
  search: z.string().trim().optional(),
  employee: objectId.optional(),
  leaveType: objectId.optional(),
  status: z.enum(LEAVE_STATUSES).optional(),
  unit: objectId.optional(),
  department: objectId.optional(),
  from: isoDate,
  to: isoDate,
  deletedBy: objectId.optional(),
  deletedFrom: isoDate,
  deletedTo: isoDate,
  sort: z.string().trim().optional(),
};

export const listQuerySchema = z.object({
  ...filters,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const reportQuerySchema = z.object(filters);

export const deleteSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Give a reason of at least 10 characters — this is a permanent audit record')
    .max(500, 'Reason cannot exceed 500 characters'),
});

export default { idParamSchema, listQuerySchema, reportQuerySchema, deleteSchema };
