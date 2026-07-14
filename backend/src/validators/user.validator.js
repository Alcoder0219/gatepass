import { z } from 'zod';
import { PERMISSIONS } from '../constants/index.js';

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

const boolish = z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean());

/**
 * Multipart form-data flattens arrays: a single value arrives as a string and a
 * JSON payload arrives as a string too. Normalise both to a string array.
 */
const permissionList = z.preprocess((value) => {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return [trimmed];
      }
    }
    return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return value;
}, z.array(z.string().refine((p) => PERMISSIONS.includes(p), 'Unknown permission')).optional());

const STATUS = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

export const idParamSchema = z.object({ id: objectId });

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  role: objectId.optional(),
  department: objectId.optional(),
  unit: objectId.optional(),
  status: z.enum(STATUS).optional(),
  sort: z.string().trim().optional().default('-createdAt'),
});

export const lookupUsersQuerySchema = z.object({
  search: z.string().trim().optional(),
  department: objectId.optional(),
  unit: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const managersQuerySchema = z.object({
  search: z.string().trim().optional(),
  unit: objectId.optional(),
  department: objectId.optional(),
});

export const createUserSchema = z.object({
  employeeId: z.string().trim().min(2, 'Employee ID is required').max(40),
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('A valid email address is required'),
  phone: z
    .string()
    .trim()
    .regex(/^$|^[0-9+\-\s()]{7,20}$/, 'Please provide a valid phone number')
    .optional(),
  // Optional — a temporary password is generated and emailed when it is omitted.
  password: z.string().min(8, 'Password must be at least 8 characters').max(128).optional(),
  department: objectId,
  unit: objectId,
  role: objectId,
  reportingManager: objectId.nullish(),
  designation: z.string().trim().max(120).optional(),
  status: z.enum(STATUS).optional().default('ACTIVE'),
  extraPermissions: permissionList,
  deniedPermissions: permissionList,
});

export const updateUserSchema = z
  .object({
    employeeId: z.string().trim().min(2).max(40).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().toLowerCase().email('A valid email address is required').optional(),
    phone: z
      .string()
      .trim()
      .regex(/^$|^[0-9+\-\s()]{7,20}$/, 'Please provide a valid phone number')
      .optional(),
    department: objectId.optional(),
    unit: objectId.optional(),
    role: objectId.optional(),
    reportingManager: objectId.nullish(),
    designation: z.string().trim().max(120).optional(),
    status: z.enum(STATUS).optional(),
    extraPermissions: permissionList,
    deniedPermissions: permissionList,
    preferences: z
      .object({
        theme: z.enum(['light', 'dark', 'system']).optional(),
        emailNotifications: boolish.optional(),
        pushNotifications: boolish.optional(),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes were supplied' });

export const updateStatusSchema = z.object({
  status: z.enum(STATUS, { errorMap: () => ({ message: `Status must be one of: ${STATUS.join(', ')}` }) }),
});

export const adminResetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  notify: boolish.optional().default(false),
});

export default {
  idParamSchema,
  listUsersQuerySchema,
  lookupUsersQuerySchema,
  managersQuerySchema,
  createUserSchema,
  updateUserSchema,
  updateStatusSchema,
  adminResetPasswordSchema,
};
