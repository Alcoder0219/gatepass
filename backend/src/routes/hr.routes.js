import { Router } from 'express';

import authenticate from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { PERMISSION } from '../constants/index.js';
import controller from '../controllers/hr.controller.js';
import {
  idParamSchema,
  listGatePassQuerySchema,
  hrReviewSchema,
  hrReviewListQuerySchema,
  rejectSchema,
} from '../validators/gatepass.validator.js';

const router = Router();
router.use(authenticate);

router.get(
  '/queue',
  authorize(PERMISSION.HR_REVIEW_VIEW),
  validate({ query: listGatePassQuerySchema }),
  controller.getQueue
);

router.get(
  '/reviews',
  authorize(PERMISSION.HR_REVIEW_VIEW),
  validate({ query: hrReviewListQuerySchema }),
  controller.listReviews
);

router.get('/stats', authorize(PERMISSION.HR_REVIEW_VIEW), controller.getStats);

router.post(
  '/:id/review',
  authorize(PERMISSION.HR_REVIEW),
  validate({ params: idParamSchema, body: hrReviewSchema }),
  controller.reviewGatePass
);

router.post(
  '/:id/reject',
  authorize(PERMISSION.GATEPASS_REJECT),
  validate({ params: idParamSchema, body: rejectSchema }),
  controller.rejectGatePass
);

export default router;
