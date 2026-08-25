import { Router } from 'express';
import {
  getEmails,
  getEmailById,
  markRead,
  markUnread,
  starEmail,
  unstarEmail,
  archiveEmail,
  trashEmail,
  restoreEmail,
  deleteEmailPermanently,
  downloadAttachment,
  syncEmails
} from '../controllers/email.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', getEmails);
router.get('/search', getEmails);
router.post('/sync', syncEmails);
router.get('/:id', getEmailById);
router.patch('/:id/read', markRead);
router.patch('/:id/unread', markUnread);
router.patch('/:id/star', starEmail);
router.patch('/:id/unstar', unstarEmail);
router.patch('/:id/archive', archiveEmail);
router.patch('/:id/trash', trashEmail);
router.patch('/:id/restore', restoreEmail);
router.delete('/:id', deleteEmailPermanently);
router.get('/:id/attachments/:attachmentId', downloadAttachment);

export default router;
