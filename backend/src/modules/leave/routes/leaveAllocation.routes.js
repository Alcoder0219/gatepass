import { Router } from 'express';

import { authorize } from '../../../middlewares/rbac.middleware.js';
import validate from '../../../middlewares/validate.middleware.js';
import { PERMISSION } from '../../../constants/index.js';
import controller from '../controllers/leaveAllocation.controller.js';
import {
  idParamSchema,
  listAllocationsQuerySchema,
  createAllocationSchema,
  updateAllocationSchema,
} from '../validators/leaveAllocation.validator.js';

const router = Router();

/* Static paths first — they must not be swallowed by /:id. */
router.get('/years', authorize(PERMISSION.LEAVE_ALLOCATION_VIEW), controller.listYears);

router
  .route('/')
  .get(
    authorize(PERMISSION.LEAVE_ALLOCATION_VIEW),
    validate({ query: listAllocationsQuerySchema }),
    controller.list
  )
  .post(
    authorize(PERMISSION.LEAVE_ALLOCATION_CREATE),
    validate({ body: createAllocationSchema }),
    controller.create
  );

router.patch(
  '/:id',
  authorize(PERMISSION.LEAVE_ALLOCATION_UPDATE),
  validate({ params: idParamSchema, body: updateAllocationSchema }),
  controller.update
);

router.delete(
  '/:id',
  authorize(PERMISSION.LEAVE_ALLOCATION_DELETE),
  validate({ params: idParamSchema }),
  controller.remove
);

export default router;
