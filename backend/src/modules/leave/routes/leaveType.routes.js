import { Router } from 'express';

import { authorize } from '../../../middlewares/rbac.middleware.js';
import validate from '../../../middlewares/validate.middleware.js';
import { PERMISSION } from '../../../constants/index.js';
import controller from '../controllers/leaveType.controller.js';
import {
  idParamSchema,
  listLeaveTypesQuerySchema,
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  toggleStatusSchema,
} from '../validators/leaveType.validator.js';

const router = Router();

/* Static paths first — they must not be swallowed by /:id. */
router.get('/lookup', controller.lookupLeaveTypes);

router
  .route('/')
  .get(
    authorize(PERMISSION.LEAVE_TYPE_VIEW),
    validate({ query: listLeaveTypesQuerySchema }),
    controller.listLeaveTypes
  )
  .post(
    authorize(PERMISSION.LEAVE_TYPE_CREATE),
    validate({ body: createLeaveTypeSchema }),
    controller.createLeaveType
  );

router.get(
  '/:id',
  authorize(PERMISSION.LEAVE_TYPE_VIEW),
  validate({ params: idParamSchema }),
  controller.getLeaveType
);

router.patch(
  '/:id',
  authorize(PERMISSION.LEAVE_TYPE_UPDATE),
  validate({ params: idParamSchema, body: updateLeaveTypeSchema }),
  controller.updateLeaveType
);

router.patch(
  '/:id/status',
  authorize(PERMISSION.LEAVE_TYPE_UPDATE),
  validate({ params: idParamSchema, body: toggleStatusSchema }),
  controller.toggleLeaveTypeStatus
);

router.delete(
  '/:id',
  authorize(PERMISSION.LEAVE_TYPE_DELETE),
  validate({ params: idParamSchema }),
  controller.deleteLeaveType
);

export default router;
