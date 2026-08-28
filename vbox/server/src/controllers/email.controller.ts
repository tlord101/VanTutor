import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { resendService } from '../services/resend.service';
import { logger } from '../utils/logger';

export async function getEmails(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const skip = (page - 1) * limit;

    const search = (req.query.search as string || req.query.q as string || '').trim();
    const folder = (req.query.folder as string || 'inbox').toLowerCase();
    const unread = req.query.unread === 'true';
    const starred = req.query.starred === 'true';
    const from = req.query.from as string;
    const subject = req.query.subject as string;

    const where: any = {};

    // Folder filtering logic
    if (folder === 'starred') {
      where.isStarred = true;
      where.isTrash = false;
    } else if (folder === 'archive') {
      where.isArchived = true;
      where.isTrash = false;
    } else if (folder === 'trash') {
      where.isTrash = true;
    } else {
      // Default: Inbox
      where.isArchived = false;
      where.isTrash = false;
    }

    if (unread) where.isRead = false;
    if (starred) where.isStarred = true;
    if (from) where.fromEmail = { contains: from, mode: 'insensitive' };
    if (subject) where.subject = { contains: subject, mode: 'insensitive' };

    if (search) {
      where.OR = [
        { fromEmail: { contains: search, mode: 'insensitive' } },
        { fromName: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { textBody: { contains: search, mode: 'insensitive' } },
        { htmlBody: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip,
        take: limit,
        include: {
          attachments: {
            select: {
              id: true,
              filename: true,
              contentType: true,
              size: true
            }
          }
        }
      }),
      prisma.email.count({ where })
    ]);

    // Count unread in inbox
    const unreadCount = await prisma.email.count({
      where: { isRead: false, isArchived: false, isTrash: false }
    });

    return res.json({
      emails,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error({ error }, 'Error in getEmails controller');
    return res.status(500).json({ error: 'Failed to retrieve emails' });
  }
}

export async function getEmailById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const email = await prisma.email.findUnique({
      where: { id },
      include: { attachments: true }
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Auto mark as read when fetched
    if (!email.isRead) {
      await prisma.email.update({
        where: { id },
        data: { isRead: true }
      });
      email.isRead = true;
    }

    return res.json(email);
  } catch (error) {
    logger.error({ error, id: req.params.id }, 'Error fetching email by ID');
    return res.status(500).json({ error: 'Failed to retrieve email' });
  }
}

export async function markRead(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const email = await prisma.email.update({
      where: { id },
      data: { isRead: true }
    });
    return res.json(email);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark email as read' });
  }
}

export async function markUnread(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const email = await prisma.email.update({
      where: { id },
      data: { isRead: false }
    });
    return res.json(email);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark email as unread' });
  }
}

export async function starEmail(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const email = await prisma.email.update({
      where: { id },
      data: { isStarred: true }
    });
    return res.json(email);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to star email' });
  }
}

export async function unstarEmail(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const email = await prisma.email.update({
      where: { id },
      data: { isStarred: false }
    });
    return res.json(email);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to unstar email' });
  }
}

export async function archiveEmail(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const email = await prisma.email.update({
      where: { id },
      data: { isArchived: true, isTrash: false }
    });
    return res.json(email);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to archive email' });
  }
}

export async function trashEmail(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const email = await prisma.email.update({
      where: { id },
      data: { isTrash: true }
    });
    return res.json(email);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to move email to trash' });
  }
}

export async function restoreEmail(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const email = await prisma.email.update({
      where: { id },
      data: { isTrash: false, isArchived: false }
    });
    return res.json(email);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to restore email' });
  }
}

export async function deleteEmailPermanently(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.email.delete({ where: { id } });
    return res.json({ success: true, message: 'Email permanently deleted' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete email permanently' });
  }
}

export async function downloadAttachment(req: Request, res: Response) {
  try {
    const { id, attachmentId } = req.params;
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, emailId: id }
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (attachment.downloadUrl) {
      return res.redirect(attachment.downloadUrl);
    }

    // Fallback: If Resend API attachment fetching is needed
    return res.status(404).json({ error: 'Download URL unavailable' });
  } catch (error) {
    logger.error({ error }, 'Error downloading attachment');
    return res.status(500).json({ error: 'Failed to download attachment' });
  }
}

export async function syncEmails(_req: Request, res: Response) {
  try {
    logger.info('[SYNC] Starting manual sync from Resend API...');
    const result = await resendService.listReceivedEmails();

    let imported = 0;
    let duplicates = 0;

    const items = (result as any)?.data?.data || (result as any)?.data || [];

    for (const item of items) {
      const resendEmailId = item.id || item.email_id;
      if (!resendEmailId) continue;

      const existing = await prisma.email.findUnique({ where: { resendEmailId } });
      if (existing) {
        duplicates++;
        continue;
      }

      // Fetch full email content
      const full = await resendService.getReceivedEmail(resendEmailId);
      const data = (full as any)?.data || item;

      let fromEmail = 'unknown@example.com';
      let fromName = '';
      if (typeof data.from === 'string') {
        fromEmail = data.from;
      } else if (data.from && typeof data.from === 'object') {
        fromEmail = data.from.email || data.from.address || '';
        fromName = data.from.name || '';
      }

      const to = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []);
      const cc = Array.isArray(data.cc) ? data.cc : (data.cc ? [data.cc] : []);
      const bcc = Array.isArray(data.bcc) ? data.bcc : (data.bcc ? [data.bcc] : []);

      const subject = data.subject || '(No Subject)';
      const textBody = data.text || data.text_body || '';
      const htmlBody = data.html || data.html_body || (textBody ? `<pre>${textBody}</pre>` : '');
      const preview = textBody ? textBody.slice(0, 150) : (subject ? subject.slice(0, 150) : '');

      await prisma.email.create({
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
          receivedAt: data.created_at ? new Date(data.created_at) : new Date(),
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
        }
      });
      imported++;
    }

    logger.info({ imported, duplicates }, '[SYNC] Sync completed');
    return res.json({ success: true, imported, duplicates });
  } catch (error: any) {
    logger.error({ error: error.message }, '[SYNC] Failed to sync emails from Resend');
    return res.status(500).json({ error: 'Failed to sync with Resend API: ' + error.message });
  }
}
