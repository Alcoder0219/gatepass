import { Router } from 'express';

import { authorize, authorizeAny } from '../../../middlewares/rbac.middleware.js';
import validate from '../../../middlewares/validate.middleware.js';
import { PERMISSION } from '../../../constants/index.js';
import controller from '../controllers/leaveApplication.controller.js';
import {
  idParamSchema,
  prefillQuerySchema,
  previewSchema,
  applySchema,
  bulkApplySchema,
  listMyRequestsQuerySchema,
} from '../validators/leaveApplication.validator.js';

const router = Router();

/* Static paths first — they must not be swallowed by /:id. */
router.get(
  '/prefill',
  authorizeAny(PERMISSION.LEAVE_APPLY, PERMISSION.LEAVE_APPLY_BULK),
  validate({ query: prefillQuerySchema }),
  controller.prefill
);

router.post(
  '/preview',
  authorizeAny(PERMISSION.LEAVE_APPLY, PERMISSION.LEAVE_APPLY_BULK),
  validate({ body: previewSchema }),
  controller.preview
);

router.get(
  '/mine',
  authorize(PERMISSION.LEAVE_VIEW_OWN),
  validate({ query: listMyRequestsQuerySchema }),
  controller.listMine
);

router.post(
  '/bulk',
  authorize(PERMISSION.LEAVE_APPLY_BULK),
  validate({ body: bulkApplySchema }),
  controller.bulkApply
);

router.post('/', authorize(PERMISSION.LEAVE_APPLY), validate({ body: applySchema }), controller.apply);

router.get('/:id', validate({ params: idParamSchema }), controller.getOne);

export default router;
