import { Router } from 'express';

import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import * as unitController from '../controllers/unit.controller.js';
import {
  idParamSchema,
  lookupQuerySchema,
  listUnitsQuerySchema,
  createUnitSchema,
  updateUnitSchema,
} from '../validators/master.validator.js';
import { PERMISSION } from '../constants/index.js';

const router = Router();

router.use(authenticate);

// The gate pass form needs the unit dropdown, so any signed-in user may read it.
router.get('/lookup', validate({ query: lookupQuerySchema }), unitController.lookupUnits);

router.get('/', validate({ query: listUnitsQuerySchema }), unitController.listUnits);

router.post(
  '/',
  authorize(PERMISSION.UNITS_MANAGE),
  validate({ body: createUnitSchema }),
  unitController.createUnit
);

router.get('/:id', validate({ params: idParamSchema }), unitController.getUnit);

router.patch(
  '/:id',
  authorize(PERMISSION.UNITS_MANAGE),
  validate({ params: idParamSchema, body: updateUnitSchema }),
  unitController.updateUnit
);

router.delete(
  '/:id',
  authorize(PERMISSION.UNITS_MANAGE),
  validate({ params: idParamSchema }),
  unitController.deleteUnit
);

export default router;
