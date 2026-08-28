import { Request, Response } from 'express';
import { Webhook } from 'svix';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import { sseManager } from '../utils/sse';
import { resendService } from '../services/resend.service';

export async function handleResendWebhook(req: Request, res: Response) {
  const svix_id = req.headers['svix-id'] as string;
  const svix_timestamp = req.headers['svix-timestamp'] as string;
  const svix_signature = req.headers['svix-signature'] as string;

  if (!svix_id || !svix_timestamp || !svix_signature) {
    logger.warn('Webhook received missing Svix headers');
    return res.status(400).json({ error: 'Missing Svix headers' });
  }

  // Get raw body buffer attached by express.raw middleware
  const rawBody = (req as any).rawBody || req.body;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    logger.error('Raw body not captured correctly for webhook verification');
    return res.status(400).json({ error: 'Raw body error' });
  }

  const payloadString = rawBody.toString('utf8');
  const secret = config.RESEND_WEBHOOK_SECRET;

  if (secret) {
    try {
      const wh = new Webhook(secret);
      wh.verify(payloadString, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature
      });
      logger.info({ svix_id }, '[WEBHOOK] Svix signature verified successfully');
    } catch (err: any) {
      logger.error({ err: err.message }, '[WEBHOOK] Invalid Svix signature');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
  } else {
    logger.warn('[WEBHOOK] RESEND_WEBHOOK_SECRET is empty - bypassing signature verification for dev/testing');
  }

  let event: any;
  try {
    event = JSON.parse(payloadString);
  } catch (err) {
    logger.error('Failed to parse webhook JSON payload');
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  logger.info({ type: event.type }, '[WEBHOOK] Event received');

  if (event.type === 'email.received') {
    const data = event.data;
    const resendEmailId = data.email_id || data.id;

    if (!resendEmailId) {
      logger.error('No email_id found in email.received webhook event');
      return res.status(400).json({ error: 'Missing email_id' });
    }

    // Webhook Idempotency Check
    const existingEmail = await prisma.email.findUnique({
      where: { resendEmailId }
    });

    if (existingEmail) {
      logger.info({ resendEmailId }, '[WEBHOOK] Email already exists in DB. Skipping duplicate insertion.');
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Extract sender details
    let fromEmail = 'unknown@example.com';
    let fromName = '';
    if (typeof data.from === 'string') {
      fromEmail = data.from;
    } else if (data.from && typeof data.from === 'object') {
      fromEmail = data.from.email || data.from.address || '';
      fromName = data.from.name || '';
    }

    // Extract recipients
    const to = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []);
    const cc = Array.isArray(data.cc) ? data.cc : (data.cc ? [data.cc] : []);
    const bcc = Array.isArray(data.bcc) ? data.bcc : (data.bcc ? [data.bcc] : []);

    const subject = data.subject || '(No Subject)';
    const textBody = data.text || data.text_body || '';
    const htmlBody = data.html || data.html_body || (textBody ? `<pre>${textBody}</pre>` : '');
    const preview = textBody ? textBody.slice(0, 150) : (subject ? subject.slice(0, 150) : '');

    let receivedAt = new Date();
    if (data.created_at) {
      receivedAt = new Date(data.created_at);
    }

    logger.info({ resendEmailId, fromEmail, subject }, '[EMAIL] Saving email to database...');

    const createdEmail = await prisma.email.create({
      data: {
        resendEmailId,
        messageId: data.message_id || null,
        threadId: data.thread_id || null,
        fromName,
        fromEmail,
        to,
        cc,
        bcc,
        subject,
        textBody,
        htmlBody,
        preview,
        receivedAt,
        attachments: {
          create: (data.attachments || []).map((att: any) => ({
            resendAttachmentId: att.id || null,
            filename: att.filename || 'unnamed_attachment',
            contentType: att.content_type || att.type || 'application/octet-stream',
            size: att.size || 0,
            contentDisposition: att.content_disposition || 'attachment',
            contentId: att.content_id || null,
            downloadUrl: att.download_url || att.url || null
          }))
        }
      },
      include: {
        attachments: true
      }
    });

    logger.info({ emailId: createdEmail.id }, '[EMAIL] Saved successfully');

    // Broadcast new email event via SSE
    sseManager.broadcast('email.received', createdEmail);
    logger.info({ emailId: createdEmail.id }, '[REALTIME] Broadcasted new email via SSE');

    return res.status(200).json({ received: true, id: createdEmail.id });
  }

  return res.status(200).json({ received: true, ignored: true });
}
