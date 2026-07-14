import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('A valid email address is required');

/** New passwords must satisfy the User model's 8-char floor before hashing. */
const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z
    .preprocess((value) => (typeof value === 'string' ? value === 'true' : value), z.boolean())
    .optional()
    .default(false),
});

/** The refresh token normally rides in the httpOnly cookie; the body is a fallback. */
export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export const logoutSchema = refreshSchema;

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(16, 'The reset token is invalid'),
  password: newPassword,
});

export const sendOtpSchema = z.object({ email });

export const verifyOtpSchema = z.object({
  email,
  otp: z.string().trim().regex(/^\d{6}$/, 'The OTP must be 6 digits'),
});

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(120).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^$|^[0-9+\-\s()]{7,20}$/, 'Please provide a valid phone number')
      .optional(),
    designation: z.string().trim().max(120).optional(),
    preferences: z
      .object({
        theme: z.enum(['light', 'dark', 'system']).optional(),
        emailNotifications: z
          .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
          .optional(),
        pushNotifications: z
          .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
          .optional(),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes were supplied' });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Your current password is required'),
    newPassword,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'The new password must be different from the current one',
    path: ['newPassword'],
  });

export default {
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
  updateMeSchema,
  changePasswordSchema,
};
