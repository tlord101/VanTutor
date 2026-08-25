import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import webhookRoutes from './routes/webhook.routes';
import authRoutes from './routes/auth.routes';
import emailRoutes from './routes/email.routes';
import eventsRoutes from './routes/events.routes';
import { errorHandler } from './middleware/error.middleware';

export function createApp() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false // Allows iframe sandboxed email rendering on frontend
  }));

  app.use(cors({
    origin: true,
    credentials: true
  }));

  app.use(cookieParser());

  // Webhook endpoint (MUST be registered before general express.json middleware)
  app.use('/api/webhooks/resend', webhookRoutes);

  // Standard JSON and urlencoded body parsers for non-webhook routes
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/emails', emailRoutes);
  app.use('/api/events', eventsRoutes);

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(errorHandler);

  return app;
}
