import { Router } from 'express';

import { authorizeAny } from '../../../middlewares/rbac.middleware.js';
import validate from '../../../middlewares/validate.middleware.js';
import { PERMISSION } from '../../../constants/index.js';
import controller from '../controllers/leaveApproval.controller.js';
import {
  idParamSchema,
  queueQuerySchema,
  approveSchema,
  rejectSchema,
  sendBackSchema,
} from '../validators/leaveApproval.validator.js';

const router = Router();

/**
 * Either decision permission opens the screen; the controller then checks the
 * specific stage, so a manager cannot read the HR queue and vice versa.
 */
const canDecide = authorizeAny(PERMISSION.LEAVE_APPROVE, PERMISSION.LEAVE_HR_REVIEW);

/* Static paths first — they must not be swallowed by /:id. */
router.get('/counts', canDecide, controller.counts);

router.get('/', canDecide, validate({ query: queueQuerySchema }), controller.queue);

router.get('/:id', validate({ params: idParamSchema }), controller.detail);

router.post(
  '/:id/approve',
  canDecide,
  validate({ params: idParamSchema, body: approveSchema }),
  controller.approve
);

router.post(
  '/:id/reject',
  canDecide,
  validate({ params: idParamSchema, body: rejectSchema }),
  controller.reject
);

router.post(
  '/:id/send-back',
  canDecide,
  validate({ params: idParamSchema, body: sendBackSchema }),
  controller.sendBack
);

export default router;
