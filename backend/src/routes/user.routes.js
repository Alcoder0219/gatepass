import { Router } from 'express';

import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { uploadAvatar } from '../middlewares/upload.middleware.js';
import * as userController from '../controllers/user.controller.js';
import {
  idParamSchema,
  listUsersQuerySchema,
  lookupUsersQuerySchema,
  managersQuerySchema,
  createUserSchema,
  updateUserSchema,
  updateStatusSchema,
  adminResetPasswordSchema,
} from '../validators/user.validator.js';
import { PERMISSION } from '../constants/index.js';

const router = Router();

router.use(authenticate);

// Dropdown feeds — every signed-in user needs them to raise a gate pass.
router.get('/managers', validate({ query: managersQuerySchema }), userController.listManagers);
router.get('/lookup', validate({ query: lookupUsersQuerySchema }), userController.lookupUsers);

router.get(
  '/',
  authorize(PERMISSION.USERS_VIEW),
  validate({ query: listUsersQuerySchema }),
  userController.listUsers
);

router.post(
  '/',
  authorize(PERMISSION.USERS_CREATE),
  uploadAvatar,
  validate({ body: createUserSchema }),
  userController.createUser
);

router.get(
  '/:id',
  authorize(PERMISSION.USERS_VIEW),
  validate({ params: idParamSchema }),
  userController.getUser
);

router.get(
  '/:id/reportees',
  authorize(PERMISSION.USERS_VIEW),
  validate({ params: idParamSchema }),
  userController.listReportees
);

router.patch(
  '/:id',
  authorize(PERMISSION.USERS_UPDATE),
  uploadAvatar,
  validate({ params: idParamSchema, body: updateUserSchema }),
  userController.updateUser
);

router.patch(
  '/:id/status',
  authorize(PERMISSION.USERS_UPDATE),
  validate({ params: idParamSchema, body: updateStatusSchema }),
  userController.updateUserStatus
);

router.patch(
  '/:id/reset-password',
  authorize(PERMISSION.USERS_UPDATE),
  validate({ params: idParamSchema, body: adminResetPasswordSchema }),
  userController.resetUserPassword
);

router.delete(
  '/:id',
  authorize(PERMISSION.USERS_DELETE),
  validate({ params: idParamSchema }),
  userController.deleteUser
);

export default router;
