import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { PERMISSION } from '../constants/index.js';
import settings from '../controllers/settings.controller.js';
import { updateSettingsSchema } from '../validators/settings.validator.js';

const router = Router();

router.use(authenticate);

/** The shell needs branding + workflow toggles on every screen — no gate. */
router.get('/public', settings.getPublicSettings);

router.get('/', authorize(PERMISSION.SETTINGS_VIEW), settings.getSettings);

router.patch(
  '/',
  authorize(PERMISSION.SETTINGS_UPDATE),
  validate({ body: updateSettingsSchema }),
  settings.updateSettings
);

export default router;
