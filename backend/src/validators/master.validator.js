import { z } from 'zod';

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

const boolish = z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean());

/** A single id, a comma list and a real array all normalise to an id array. */
const idList = z.preprocess((value) => {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  return value;
}, z.array(objectId).optional());

const time = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm format');

export const idParamSchema = z.object({ id: objectId });

const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  sort: z.string().trim().optional().default('name'),
  isActive: boolish.optional(),
};

export const lookupQuerySchema = z.object({
  search: z.string().trim().optional(),
  unit: objectId.optional(),
});

/* ─── Units ───────────────────────────────────────────────────────────────── */
export const listUnitsQuerySchema = z.object(paginationQuery);

export const createUnitSchema = z.object({
  code: z.string().trim().toUpperCase().min(2, 'Unit code is required').max(20),
  name: z.string().trim().min(2, 'Unit name is required').max(120),
  address: z.string().trim().max(280).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  timezone: z.string().trim().max(60).optional(),
  gateOpenTime: time.nullish(),
  gateCloseTime: time.nullish(),
  headOfUnit: objectId.nullish(),
  isActive: boolish.optional(),
});

export const updateUnitSchema = createUnitSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes were supplied' });

/* ─── Departments ─────────────────────────────────────────────────────────── */
export const listDepartmentsQuerySchema = z.object({
  ...paginationQuery,
  unit: objectId.optional(),
});

export const createDepartmentSchema = z.object({
  code: z.string().trim().toUpperCase().min(2, 'Department code is required').max(20),
  name: z.string().trim().min(2, 'Department name is required').max(120),
  description: z.string().trim().max(280).optional(),
  unit: objectId,
  hod: objectId.nullish(),
  isActive: boolish.optional(),
});

export const updateDepartmentSchema = createDepartmentSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes were supplied' });

/* ─── Holidays ────────────────────────────────────────────────────────────── */
export const listHolidaysQuerySchema = z.object({
  ...paginationQuery,
  sort: z.string().trim().optional().default('date'),
  year: z.coerce.number().int().min(1970).max(2999).optional(),
  unit: objectId.optional(),
  type: z.enum(['PUBLIC', 'RESTRICTED', 'COMPANY']).optional(),
});

export const createHolidaySchema = z.object({
  name: z.string().trim().min(2, 'Holiday name is required').max(120),
  date: z.coerce.date({ invalid_type_error: 'A valid holiday date is required' }),
  type: z.enum(['PUBLIC', 'RESTRICTED', 'COMPANY']).default('PUBLIC'),
  units: idList,
  restrictGatePass: boolish.optional(),
  description: z.string().trim().max(280).optional(),
  isActive: boolish.optional(),
});

export const updateHolidaySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    date: z.coerce.date().optional(),
    type: z.enum(['PUBLIC', 'RESTRICTED', 'COMPANY']).optional(),
    units: idList,
    restrictGatePass: boolish.optional(),
    description: z.string().trim().max(280).optional(),
    isActive: boolish.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes were supplied' });

export default {
  idParamSchema,
  lookupQuerySchema,
  listUnitsQuerySchema,
  createUnitSchema,
  updateUnitSchema,
  listDepartmentsQuerySchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  listHolidaysQuerySchema,
  createHolidaySchema,
  updateHolidaySchema,
};
