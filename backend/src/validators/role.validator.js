import { z } from 'zod';
import { DATA_SCOPES, DATA_SCOPE, PERMISSIONS } from '../constants/index.js';

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

const permission = z.string().refine((p) => PERMISSIONS.includes(p), 'Unknown permission');

const boolish = z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean());

export const idParamSchema = z.object({ id: objectId });

export const listRolesQuerySchema = z.object({
  search: z.string().trim().optional(),
  isActive: boolish.optional(),
});

export const createRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]+$/, 'Role key may only contain A-Z, 0-9 and underscores')
    .min(2)
    .max(40),
  name: z.string().trim().min(2, 'Role name is required').max(80),
  description: z.string().trim().max(280).optional(),
  permissions: z.array(permission).default([]),
  dataScope: z.enum(DATA_SCOPES).default(DATA_SCOPE.OWN),
  unitRestrictions: z.array(objectId).default([]),
  departmentRestrictions: z.array(objectId).default([]),
  level: z.coerce.number().int().min(0).max(100).default(0),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value such as #6366f1')
    .optional(),
  isActive: boolish.optional(),
});

export const updateRoleSchema = z
  .object({
    key: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_]+$/, 'Role key may only contain A-Z, 0-9 and underscores')
      .min(2)
      .max(40)
      .optional(),
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(280).optional(),
    permissions: z.array(permission).optional(),
    dataScope: z.enum(DATA_SCOPES).optional(),
    unitRestrictions: z.array(objectId).optional(),
    departmentRestrictions: z.array(objectId).optional(),
    level: z.coerce.number().int().min(0).max(100).optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value such as #6366f1')
      .optional(),
    isActive: boolish.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes were supplied' });

export default { idParamSchema, listRolesQuerySchema, createRoleSchema, updateRoleSchema };
