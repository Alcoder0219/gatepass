import { Router } from 'express';

import authenticate from '../../../middlewares/auth.middleware.js';
import leaveDashboardRoutes from './leaveDashboard.routes.js';
import leaveTypeRoutes from './leaveType.routes.js';
import leaveAllocationRoutes from './leaveAllocation.routes.js';
import leaveApplicationRoutes from './leaveApplication.routes.js';
import leaveApprovalRoutes from './leaveApproval.routes.js';
import leaveDeletionRoutes from './leaveDeletion.routes.js';
import leaveReportRoutes from './leaveReport.routes.js';

/**
 * The Leave module's own router. Mounted once at `/api/v1/leave` — that mount is
 * the only line the leave module contributes to the shared route table.
 */
const router = Router();

router.use(authenticate);

router.use('/dashboard', leaveDashboardRoutes);
router.use('/types', leaveTypeRoutes);
router.use('/allocations', leaveAllocationRoutes);
router.use('/requests', leaveApplicationRoutes);
router.use('/approvals', leaveApprovalRoutes);
router.use('/deletion', leaveDeletionRoutes);
router.use('/reports', leaveReportRoutes);

export default router;
