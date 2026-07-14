import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { authenticate, optionalAuth } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { uploadAvatar } from '../middlewares/upload.middleware.js';
import * as authController from '../controllers/auth.controller.js';
import {
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
  updateMeSchema,
  changePasswordSchema,
} from '../validators/auth.validator.js';

const router = Router();

/**
 * Credential endpoints are the brute-force surface of the API, so they get a
 * much tighter budget than the global limiter. Keyed by IP + email so one
 * attacker cannot lock every account behind a shared NAT.
 */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.body?.email ?? ''}`,
  message: { success: false, message: 'Too many attempts — please try again later.' },
});

router.post('/login', credentialLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', validate({ body: refreshSchema }), authController.refresh);
router.post('/logout', optionalAuth, validate({ body: logoutSchema }), authController.logout);

router.post(
  '/forgot-password',
  credentialLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword
);
router.post('/reset-password', validate({ body: resetPasswordSchema }), authController.resetPassword);

router.post('/send-otp', credentialLimiter, validate({ body: sendOtpSchema }), authController.sendOtp);
router.post(
  '/verify-otp',
  credentialLimiter,
  validate({ body: verifyOtpSchema }),
  authController.verifyOtp
);

router.get('/me', authenticate, authController.getMe);
router.patch('/me', authenticate, validate({ body: updateMeSchema }), authController.updateMe);
router.patch(
  '/me/password',
  authenticate,
  validate({ body: changePasswordSchema }),
  authController.changePassword
);
router.post('/me/avatar', authenticate, uploadAvatar, authController.updateAvatar);

export default router;
