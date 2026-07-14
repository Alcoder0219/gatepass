import { Router } from 'express';

import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import * as roleController from '../controllers/role.controller.js';
import {
  idParamSchema,
  listRolesQuerySchema,
  createRoleSchema,
  updateRoleSchema,
} from '../validators/role.validator.js';
import { PERMISSION } from '../constants/index.js';

const router = Router();

router.use(authenticate);

// Static path first — otherwise `/permissions` would be captured by `/:id`.
router.get(
  '/permissions',
  authorize(PERMISSION.ROLES_VIEW),
  roleController.getPermissionCatalogue
);

router.get(
  '/',
  authorize(PERMISSION.ROLES_VIEW),
  validate({ query: listRolesQuerySchema }),
  roleController.listRoles
);

router.post(
  '/',
  authorize(PERMISSION.ROLES_MANAGE),
  validate({ body: createRoleSchema }),
  roleController.createRole
);

router.get(
  '/:id',
  authorize(PERMISSION.ROLES_VIEW),
  validate({ params: idParamSchema }),
  roleController.getRole
);

router.patch(
  '/:id',
  authorize(PERMISSION.ROLES_MANAGE),
  validate({ params: idParamSchema, body: updateRoleSchema }),
  roleController.updateRole
);

router.delete(
  '/:id',
  authorize(PERMISSION.ROLES_MANAGE),
  validate({ params: idParamSchema }),
  roleController.deleteRole
);

export default router;
