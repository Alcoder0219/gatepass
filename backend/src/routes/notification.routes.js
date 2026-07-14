import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import notification from '../controllers/notification.controller.js';

const router = Router();

// A user always reads their OWN notifications — authentication is the only gate.
router.use(authenticate);

router.get('/', notification.listNotifications);
router.get('/unread-count', notification.getUnreadCount);

// Declared before `/:id/read` so the literal path is never shadowed.
router.patch('/read-all', notification.readAll);
router.patch('/:id/read', notification.readOne);

router.delete('/', notification.clearRead);
router.delete('/:id', notification.removeOne);

export default router;
