import { Router } from 'express';

import { authorize } from '../../../middlewares/rbac.middleware.js';
import validate from '../../../middlewares/validate.middleware.js';
import { PERMISSION } from '../../../constants/index.js';
import controller from '../controllers/leaveReport.controller.js';
import {
  reportParamSchema,
  reportQuerySchema,
  exportQuerySchema,
} from '../validators/leaveReport.validator.js';

const router = Router();

router.get('/', authorize(PERMISSION.LEAVE_REPORTS_VIEW), controller.catalogue);

/* The export path is declared before /:key so it is not swallowed by it. */
router.get(
  '/:key/export',
  authorize(PERMISSION.LEAVE_REPORTS_EXPORT),
  validate({ params: reportParamSchema, query: exportQuerySchema }),
  controller.exportReport
);

router.get(
  '/:key',
  authorize(PERMISSION.LEAVE_REPORTS_VIEW),
  validate({ params: reportParamSchema, query: reportQuerySchema }),
  controller.run
);

export default router;
