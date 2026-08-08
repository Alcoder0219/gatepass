import { Router } from 'express';

import { authorize } from '../../../middlewares/rbac.middleware.js';
import validate from '../../../middlewares/validate.middleware.js';
import { PERMISSION } from '../../../constants/index.js';
import controller from '../controllers/leaveDeletion.controller.js';
import {
  idParamSchema,
  listQuerySchema,
  reportQuerySchema,
  deleteSchema,
} from '../validators/leaveDeletion.validator.js';

const router = Router();

/**
 * Every route on this module carries the SAME single permission. The register
 * exposes every employee's leave history, so reading it is exactly as
 * privileged as deleting from it — HR and Admin only.
 */
router.use(authorize(PERMISSION.LEAVE_DELETE));

/* Static paths first — they must not be swallowed by /:id. */
router.get('/summary', validate({ query: reportQuerySchema }), controller.summary);
router.get('/export', validate({ query: reportQuerySchema }), controller.exportLog);
router.get('/log', validate({ query: listQuerySchema }), controller.listLog);
router.get('/requests', validate({ query: listQuerySchema }), controller.listCandidates);

router.post(
  '/requests/:id',
  validate({ params: idParamSchema, body: deleteSchema }),
  controller.remove
);

export default router;
