import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import { PERMISSION } from '../constants/index.js';
import audit from '../controllers/audit.controller.js';

const router = Router();

router.use(authenticate, authorize(PERMISSION.AUDIT_VIEW));

router.get('/', audit.listAuditLogs);
router.get('/actions', audit.getActions);
router.get('/stats', audit.getAuditStats);

export default router;
