import { Router } from 'express';
import { sseManager } from '../utils/sse';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial ping event
  res.write('event: connected\ndata: {"connected":true}\n\n');

  sseManager.addClient(res);
});

export default router;
