import { config } from '../config/env';
import { resendService } from '../services/resend.service';
import { logger } from '../utils/logger';

async function setupWebhook() {
  const webhookUrl = config.WEBHOOK_URL || `${config.APP_URL}/api/webhooks/resend`;
  logger.info({ webhookUrl }, 'Configuring Resend Inbound Webhook...');

  try {
    const existingWebhooks = await resendService.listWebhooks();
    const webhooksList = (existingWebhooks as any)?.data?.data || (existingWebhooks as any)?.data || [];

    const alreadyExists = webhooksList.some((wh: any) => wh.url === webhookUrl);

    if (alreadyExists) {
      logger.info('Webhook already configured in Resend.');
      return;
    }

    const created = await resendService.createWebhook(webhookUrl);
    logger.info({ created }, 'Webhook created successfully in Resend.');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to automate webhook creation. Make sure your RESEND_API_KEY is valid.');
  }
}

setupWebhook().catch(console.error);
