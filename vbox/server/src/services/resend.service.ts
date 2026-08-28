import { Resend } from 'resend';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export class ResendService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(config.RESEND_API_KEY);
  }

  /**
   * List received emails via Resend Inbound / Receiving Emails API.
   */
  public async listReceivedEmails() {
    try {
      const response = await (this.resend as any).emails?.list?.() || (this.resend as any).receiving?.emails?.list?.() || { data: [] };
      return response;
    } catch (error) {
      logger.error({ error }, 'Failed to list received emails from Resend');
      throw error;
    }
  }

  /**
   * Get specific received email content / details by ID from Resend
   */
  public async getReceivedEmail(emailId: string) {
    try {
      const response = await this.resend.emails.get(emailId);
      return response;
    } catch (error) {
      logger.error({ error, emailId }, 'Failed to get received email from Resend');
      throw error;
    }
  }

  /**
   * Get webhook status or webhooks list
   */
  public async listWebhooks() {
    try {
      const response = await (this.resend as any).webhooks?.list();
      return response;
    } catch (error) {
      logger.error({ error }, 'Failed to list webhooks from Resend');
      return null;
    }
  }

  /**
   * Create webhook in Resend
   */
  public async createWebhook(url: string) {
    try {
      const response = await (this.resend as any).webhooks?.create({
        url,
        events: ['email.received']
      });
      return response;
    } catch (error) {
      logger.error({ error, url }, 'Failed to create webhook in Resend');
      throw error;
    }
  }
}

export const resendService = new ResendService();
