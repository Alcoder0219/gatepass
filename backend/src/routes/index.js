import { Router } from 'express';

import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import roleRoutes from './role.routes.js';
import unitRoutes from './unit.routes.js';
import departmentRoutes from './department.routes.js';
import holidayRoutes from './holiday.routes.js';
import gatePassRoutes from './gatepass.routes.js';
import hrRoutes from './hr.routes.js';
import securityRoutes from './security.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import reportRoutes from './report.routes.js';
import notificationRoutes from './notification.routes.js';
import auditRoutes from './audit.routes.js';
import settingsRoutes from './settings.routes.js';
import searchRoutes from './search.routes.js';

const router = Router();

router.get('/', (_req, res) =>
  res.json({
    success: true,
    message: 'GatePass Pro API v1',
    data: {
      docs: '/docs/API.md',
      modules: [
        'auth', 'users', 'roles', 'units', 'departments', 'holidays',
        'gate-passes', 'hr', 'security', 'dashboard', 'reports',
        'notifications', 'audit-logs', 'settings', 'search',
      ],
    },
  })
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/units', unitRoutes);
router.use('/departments', departmentRoutes);
router.use('/holidays', holidayRoutes);
router.use('/gate-passes', gatePassRoutes);
router.use('/hr', hrRoutes);
router.use('/security', securityRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/settings', settingsRoutes);
router.use('/search', searchRoutes);

export default router;
