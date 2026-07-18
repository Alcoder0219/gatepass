import { Router } from 'express';

import authenticate from '../middlewares/auth.middleware.js';
import { authorize, authorizeAny } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { uploadAttachments } from '../middlewares/upload.middleware.js';
import { PERMISSION } from '../constants/index.js';
import controller from '../controllers/gatepass.controller.js';
import {
  idParamSchema,
  listGatePassQuerySchema,
  createGatePassSchema,
  updateGatePassSchema,
  approveSchema,
  rejectSchema,
  requestChangesSchema,
  cancelSchema,
} from '../validators/gatepass.validator.js';

const router = Router();
router.use(authenticate);

const canView = authorizeAny(
  PERMISSION.GATEPASS_VIEW_OWN,
  PERMISSION.GATEPASS_VIEW_DEPARTMENT,
  PERMISSION.GATEPASS_VIEW_ALL
);

/* ─── Static paths first — they must not be swallowed by /:id ─────────────── */
router.get('/prefill', controller.getPrefill);

router.get(
  '/mine',
  canView,
  validate({ query: listGatePassQuerySchema }),
  controller.listMyGatePasses
);

router.get(
  '/pending-approval',
  authorize(PERMISSION.GATEPASS_APPROVE),
  validate({ query: listGatePassQuerySchema }),
  controller.listPendingApproval
);

router.get(
  '/stats',
  canView,
  validate({ query: listGatePassQuerySchema }),
  controller.getGatePassStats
);

/* ─── Collection ──────────────────────────────────────────────────────────── */
router
  .route('/')
  .get(canView, validate({ query: listGatePassQuerySchema }), controller.listGatePasses)
  .post(
    authorize(PERMISSION.GATEPASS_CREATE),
    uploadAttachments,
    validate({ body: createGatePassSchema }),
    controller.createGatePass
  );

/* ─── Item ────────────────────────────────────────────────────────────────── */
router.get('/:id', validate({ params: idParamSchema }), controller.getGatePass);

router.patch(
  '/:id',
  authorize(PERMISSION.GATEPASS_UPDATE),
  validate({ params: idParamSchema, body: updateGatePassSchema }),
  controller.updateGatePass
);

router.delete(
  '/:id',
  authorize(PERMISSION.GATEPASS_DELETE),
  validate({ params: idParamSchema }),
  controller.deleteGatePass
);

router.get(
  '/:id/print',
  authorize(PERMISSION.GATEPASS_PRINT),
  validate({ params: idParamSchema }),
  controller.getGatePassPrint
);

router.post(
  '/:id/attachments',
  authorize(PERMISSION.GATEPASS_UPDATE),
  uploadAttachments,
  validate({ params: idParamSchema }),
  controller.addAttachments
);

/* ─── Decisions ───────────────────────────────────────────────────────────── */
router.post(
  '/:id/approve',
  authorize(PERMISSION.GATEPASS_APPROVE),
  validate({ params: idParamSchema, body: approveSchema }),
  controller.approveGatePass
);

router.post(
  '/:id/reject',
  authorize(PERMISSION.GATEPASS_REJECT),
  validate({ params: idParamSchema, body: rejectSchema }),
  controller.rejectGatePass
);

router.post(
  '/:id/request-changes',
  authorize(PERMISSION.GATEPASS_REQUEST_CHANGES),
  validate({ params: idParamSchema, body: requestChangesSchema }),
  controller.requestChanges
);

router.post(
  '/:id/cancel',
  authorize(PERMISSION.GATEPASS_CANCEL),
  validate({ params: idParamSchema, body: cancelSchema }),
  controller.cancelGatePass
);

export default router;
