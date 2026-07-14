import { Router } from 'express';

import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import * as departmentController from '../controllers/department.controller.js';
import {
  idParamSchema,
  lookupQuerySchema,
  listDepartmentsQuerySchema,
  createDepartmentSchema,
  updateDepartmentSchema,
} from '../validators/master.validator.js';
import { PERMISSION } from '../constants/index.js';

const router = Router();

router.use(authenticate);

// The gate pass form needs the department dropdown, so any signed-in user may read it.
router.get('/lookup', validate({ query: lookupQuerySchema }), departmentController.lookupDepartments);

router.get('/', validate({ query: listDepartmentsQuerySchema }), departmentController.listDepartments);

router.post(
  '/',
  authorize(PERMISSION.DEPARTMENTS_MANAGE),
  validate({ body: createDepartmentSchema }),
  departmentController.createDepartment
);

router.get('/:id', validate({ params: idParamSchema }), departmentController.getDepartment);

router.patch(
  '/:id',
  authorize(PERMISSION.DEPARTMENTS_MANAGE),
  validate({ params: idParamSchema, body: updateDepartmentSchema }),
  departmentController.updateDepartment
);

router.delete(
  '/:id',
  authorize(PERMISSION.DEPARTMENTS_MANAGE),
  validate({ params: idParamSchema }),
  departmentController.deleteDepartment
);

export default router;
