import { createApp } from './app';
import { config } from './config/env';
import { logger } from './utils/logger';

const app = createApp();

app.listen(config.PORT, () => {
  logger.info(`🚀 VBox Email Server running on port ${config.PORT} in ${config.NODE_ENV} mode`);
  logger.info(`📡 Webhook endpoint ready at: ${config.WEBHOOK_URL || `http://localhost:${config.PORT}/api/webhooks/resend`}`);
});
