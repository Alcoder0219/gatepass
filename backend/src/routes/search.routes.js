import { Router } from 'express';

import authenticate from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import controller from '../controllers/search.controller.js';
import { globalSearchQuerySchema } from '../validators/gatepass.validator.js';

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: globalSearchQuerySchema }), controller.globalSearch);

export default router;
