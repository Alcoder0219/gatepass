import { Router } from 'express';

import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import * as holidayController from '../controllers/holiday.controller.js';
import {
  idParamSchema,
  lookupQuerySchema,
  listHolidaysQuerySchema,
  createHolidaySchema,
  updateHolidaySchema,
} from '../validators/master.validator.js';
import { PERMISSION } from '../constants/index.js';

const router = Router();

router.use(authenticate);

// The gate pass form checks the calendar before submitting, so reads are open.
router.get('/lookup', validate({ query: lookupQuerySchema }), holidayController.lookupHolidays);

router.get('/', validate({ query: listHolidaysQuerySchema }), holidayController.listHolidays);

router.post(
  '/',
  authorize(PERMISSION.HOLIDAYS_MANAGE),
  validate({ body: createHolidaySchema }),
  holidayController.createHoliday
);

router.get('/:id', validate({ params: idParamSchema }), holidayController.getHoliday);

router.patch(
  '/:id',
  authorize(PERMISSION.HOLIDAYS_MANAGE),
  validate({ params: idParamSchema, body: updateHolidaySchema }),
  holidayController.updateHoliday
);

router.delete(
  '/:id',
  authorize(PERMISSION.HOLIDAYS_MANAGE),
  validate({ params: idParamSchema }),
  holidayController.deleteHoliday
);

export default router;
