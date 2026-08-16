import { Router } from 'express';
import { z } from 'zod';

import authenticate from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/rbac.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { PERMISSION } from '../constants/index.js';
import controller from '../controllers/emailTest.controller.js';

/**
 * Development-only diagnostics for the Gmail transport.
 *
 * Two independent guards, because either alone is a weaker promise than it
 * looks:
 *   1. `routes/index.js` only mounts this router when NODE_ENV !== 'production'
 *      (unless EMAIL_TEST_ROUTE_ENABLED=true is set deliberately).
 *   2. Every route still requires authentication plus `settings.update`, so
 *      even in a shared dev environment only an admin can send mail.
 */
const router = Router();

router.use(authenticate);
router.use(authorize(PERMISSION.SETTINGS_UPDATE));

const emailList = z.union([z.string().trim().email(), z.array(z.string().trim().email()).max(20)]);

const sendSchema = z
  .object({
    to: emailList,
    cc: emailList.optional(),
    bcc: emailList.optional(),
    replyTo: z.string().trim().email().optional(),
    subject: z.string().trim().max(300).optional(),
    html: z.string().max(50_000).optional(),
    text: z.string().max(20_000).optional(),
    template: z.string().trim().max(60).optional(),
    withAttachment: z.boolean().optional().default(false),
  })
  .strict();

router.get('/status', controller.status);
router.post('/verify', controller.verify);
router.post('/send', validate({ body: sendSchema }), controller.send);

export default router;
