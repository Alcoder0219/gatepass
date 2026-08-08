import { Router } from 'express';
import controller from '../controllers/leaveDashboard.controller.js';

const router = Router();

/**
 * No `authorize(...)` guard: the `leave.*` permission vocabulary does not exist
 * in the shared constants yet, and inventing keys here would change the RBAC
 * contract as a side effect of shipping a dashboard.
 *
 * Row-level safety does not depend on it — every query is intersected with
 * `buildLeaveScope(user)`, so an employee sees only their own figures and a
 * guard sees nothing. Add the permission guard when the vocabulary lands.
 */
router.get('/stats', controller.getStats);

export default router;
