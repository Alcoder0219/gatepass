import { z } from 'zod';
import { timeToMinutes } from '../utils/dates.js';

/** "HH:mm" — 24h clock. */
const timeString = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:mm (24-hour) format');

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, 'A valid id is required');

const bool = z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean());

const quota = z.coerce
  .number()
  .int('Limits must be whole numbers')
  .min(0, 'Limits cannot be negative')
  .max(10_000, 'That limit is unrealistically high');

/** A quota block — every period optional so a patch can touch a single field. */
const limitBlockSchema = z
  .object({
    daily: quota.optional(),
    weekly: quota.optional(),
    monthly: quota.optional(),
    yearly: quota.optional(),
  })
  .strict();

const limitsSchema = z
  .object({
    official: limitBlockSchema.optional(),
    personal: limitBlockSchema.optional(),
  })
  .strict();

const overrideRow = (key, idSchema) =>
  z
    .object({
      [key]: idSchema,
      limits: limitsSchema.optional().default({}),
    })
    .strict();

const companySchema = z
  .object({
    name: z.string().trim().min(2, 'Company name is too short').max(120).optional(),
    logo: z.string().trim().max(2048).optional(),
    email: z.union([z.string().trim().email('A valid company email is required'), z.literal('')]).optional(),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(500).optional(),
  })
  .strict();

const workingHoursSchema = z
  .object({
    gateOpenTime: timeString.optional(),
    gateCloseTime: timeString.optional(),
    weekendDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
    restrictWeekend: bool.optional(),
    restrictHolidays: bool.optional(),
    enforceGateHours: bool.optional(),
  })
  .strict();

const workflowSchema = z
  .object({
    approvalRequired: bool.optional(),
    hrReviewRequired: bool.optional(),
    securityApprovalRequired: bool.optional(),
    attachmentMandatory: bool.optional(),
    reasonMandatory: bool.optional(),
    purposeMandatory: bool.optional(),
    hrReviewForPersonalOnly: bool.optional(),
    autoClosePass: bool.optional(),
    expiryHours: z.coerce
      .number()
      .int('Expiry hours must be a whole number')
      .min(1, 'Expiry hours must be at least 1')
      .max(720, 'Expiry hours cannot exceed 720 (30 days)')
      .optional(),
    autoReminder: bool.optional(),
    reminderBeforeMinutes: z.coerce
      .number()
      .int()
      .min(5, 'The reminder must be at least 5 minutes before')
      .max(1440, 'The reminder cannot be more than a day before')
      .optional(),
  })
  .strict();

const notificationsSchema = z
  .object({
    email: bool.optional(),
    push: bool.optional(),
    sms: bool.optional(),
    whatsapp: bool.optional(),
    inApp: bool.optional(),
  })
  .strict();

const securitySchema = z
  .object({
    requireExitPhoto: bool.optional(),
    requireEntryPhoto: bool.optional(),
    allowManualVerification: bool.optional(),
    qrEnabled: bool.optional(),
  })
  .strict();

const brandingSchema = z
  .object({
    primaryColor: z
      .string()
      .trim()
      .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'Colours must be hex, e.g. #6366f1')
      .optional(),
    accentColor: z
      .string()
      .trim()
      .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'Colours must be hex, e.g. #06b6d4')
      .optional(),
    defaultTheme: z.enum(['light', 'dark', 'system']).optional(),
  })
  .strict();

/**
 * Every section is optional and partial — the controller deep-merges whatever
 * arrives into the singleton, so the SPA can PATCH one toggle at a time.
 */
export const updateSettingsSchema = z
  .object({
    company: companySchema.optional(),
    limits: limitsSchema.optional(),
    unitLimits: z.array(overrideRow('unit', objectId)).max(200).optional(),
    departmentLimits: z.array(overrideRow('department', objectId)).max(500).optional(),
    roleLimits: z.array(overrideRow('role', objectId)).max(100).optional(),
    maxActiveGatePasses: z.coerce
      .number()
      .int('The active-pass cap must be a whole number')
      .min(1, 'At least one active gate pass must be allowed')
      .max(50)
      .optional(),
    allowMultiplePending: bool.optional(),
    workingHours: workingHoursSchema.optional(),
    workflow: workflowSchema.optional(),
    notifications: notificationsSchema.optional(),
    security: securitySchema.optional(),
    branding: brandingSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes were supplied' })
  .superRefine((data, ctx) => {
    // The gate must close after it opens — only checkable when BOTH arrive.
    const open = data.workingHours?.gateOpenTime;
    const close = data.workingHours?.gateCloseTime;
    if (open && close && timeToMinutes(close) <= timeToMinutes(open)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workingHours', 'gateCloseTime'],
        message: 'The gate close time must be after the gate open time',
      });
    }

    // A daily quota above the weekly (or weekly above monthly) is nonsense.
    const checkLadder = (block, path) => {
      if (!block) return;
      const ladder = [
        ['daily', 'weekly'],
        ['weekly', 'monthly'],
        ['monthly', 'yearly'],
      ];
      for (const [smaller, larger] of ladder) {
        const a = block[smaller];
        const b = block[larger];
        if (a != null && b != null && a > b) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, smaller],
            message: `The ${smaller} limit cannot exceed the ${larger} limit`,
          });
        }
      }
    };

    checkLadder(data.limits?.official, ['limits', 'official']);
    checkLadder(data.limits?.personal, ['limits', 'personal']);
  });

export default { updateSettingsSchema };
