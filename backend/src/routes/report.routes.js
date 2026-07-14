import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { PERMISSION } from '../constants/index.js';
import report from '../controllers/report.controller.js';
import {
  reportSummarySchema,
  reportRowsSchema,
  reportExportSchema,
} from '../validators/report.validator.js';

const router = Router();

router.use(authenticate);

router.get(
  '/summary',
  authorize(PERMISSION.REPORTS_VIEW),
  validate({ query: reportSummarySchema }),
  report.getSummary
);

router.get(
  '/gate-passes',
  authorize(PERMISSION.REPORTS_VIEW),
  validate({ query: reportRowsSchema }),
  report.getGatePassReport
);

router.get(
  '/export',
  authorize(PERMISSION.REPORTS_EXPORT),
  validate({ query: reportExportSchema }),
  report.exportReport
);

export default router;
