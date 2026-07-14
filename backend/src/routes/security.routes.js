import { Router } from 'express';

import authenticate from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { uploadSecurityPhoto } from '../middlewares/upload.middleware.js';
import { PERMISSION } from '../constants/index.js';
import controller from '../controllers/security.controller.js';
import { idParamSchema } from '../validators/gatepass.validator.js';
import {
  verifySchema,
  gateActionSchema,
  securityQueueQuerySchema,
  securityHistoryQuerySchema,
} from '../validators/security.validator.js';

const router = Router();
router.use(authenticate);

/* ─── Console lists ───────────────────────────────────────────────────────── */
router.get(
  '/queue',
  authorize(PERMISSION.SECURITY_ACCESS),
  validate({ query: securityQueueQuerySchema }),
  controller.getQueue
);

router.get(
  '/out',
  authorize(PERMISSION.SECURITY_ACCESS),
  validate({ query: securityQueueQuerySchema }),
  controller.getOut
);

router.get(
  '/history',
  authorize(PERMISSION.SECURITY_ACCESS),
  validate({ query: securityHistoryQuerySchema }),
  controller.getHistory
);

router.get('/stats', authorize(PERMISSION.SECURITY_ACCESS), controller.getStats);

/* ─── The scanner ─────────────────────────────────────────────────────────── */
router.post(
  '/verify',
  authorize(PERMISSION.SECURITY_SCAN),
  validate({ body: verifySchema }),
  controller.verify
);

/* ─── Gate movements ──────────────────────────────────────────────────────── */
router.post(
  '/:id/exit',
  authorize(PERMISSION.SECURITY_MARK_EXIT),
  uploadSecurityPhoto,
  validate({ params: idParamSchema, body: gateActionSchema }),
  controller.markExit
);

router.post(
  '/:id/return',
  authorize(PERMISSION.SECURITY_MARK_RETURN),
  uploadSecurityPhoto,
  validate({ params: idParamSchema, body: gateActionSchema }),
  controller.markReturn
);

router.get(
  '/:id',
  authorize(PERMISSION.SECURITY_ACCESS),
  validate({ params: idParamSchema }),
  controller.getGatePass
);

export default router;
