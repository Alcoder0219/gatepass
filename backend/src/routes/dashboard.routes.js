import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import { PERMISSION } from '../constants/index.js';
import dashboard from '../controllers/dashboard.controller.js';

const router = Router();

router.use(authenticate, authorize(PERMISSION.DASHBOARD_VIEW));

router.get('/stats', dashboard.getStats);
router.get('/charts', dashboard.getCharts);
router.get('/activity', dashboard.getActivity);
router.get('/insights', dashboard.getInsights);
router.get('/calendar', dashboard.getCalendar);

export default router;
