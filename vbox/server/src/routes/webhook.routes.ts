import { Router } from 'express';
import express from 'express';
import { handleResendWebhook } from '../webhooks/resend.webhook';

const router = Router();

// Express raw body handling to preserve exact raw HTTP request body for Svix/Resend verification
router.post(
  '/',
  express.raw({
    type: '*/*',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }),
  handleResendWebhook
);

export default router;
