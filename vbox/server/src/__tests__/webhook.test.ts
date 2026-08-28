import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/vbox_test';
process.env.RESEND_API_KEY = 're_test_key';
process.env.RESEND_WEBHOOK_SECRET = ''; // empty string in test to bypass signature check in test environment
process.env.JWT_SECRET = 'super-secret-jwt-key-for-testing';

import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../utils/prisma';

// Mock Prisma
vi.mock('../utils/prisma', () => ({
  prisma: {
    email: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    user: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn()
    }
  }
}));

// Mock Resend Service
vi.mock('../services/resend.service', () => ({
  resendService: {
    listReceivedEmails: vi.fn().mockResolvedValue({ data: [] }),
    getReceivedEmail: vi.fn().mockResolvedValue({ data: {} }),
    listWebhooks: vi.fn().mockResolvedValue({ data: [] }),
    createWebhook: vi.fn().mockResolvedValue({ id: 'wh_123' })
  }
}));

const app = createApp();

describe('Resend Webhook API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject requests missing Svix headers', async () => {
    const response = await request(app)
      .post('/api/webhooks/resend')
      .send({ type: 'email.received' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing Svix headers');
  });

  it('should process email.received webhook event idempotently', async () => {
    (prisma.email.findUnique as any).mockResolvedValue(null);
    (prisma.email.create as any).mockResolvedValue({
      id: 'db_email_1',
      resendEmailId: 're_email_123',
      subject: 'Test Subject',
      fromEmail: 'test@example.com',
      attachments: []
    });

    const payload = JSON.stringify({
      type: 'email.received',
      data: {
        email_id: 're_email_123',
        from: 'test@example.com',
        to: ['user@avelut.xyz'],
        subject: 'Test Subject',
        text: 'Hello world'
      }
    });

    const response = await request(app)
      .post('/api/webhooks/resend')
      .set('svix-id', 'msg_123')
      .set('svix-timestamp', '123456789')
      .set('svix-signature', 'v1,mocksignature')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.received).toBe(true);
    expect(prisma.email.create).toHaveBeenCalledTimes(1);
  });

  it('should prevent duplicate email insertion when same webhook is sent twice', async () => {
    (prisma.email.findUnique as any).mockResolvedValue({
      id: 'db_email_1',
      resendEmailId: 're_email_123'
    });

    const payload = JSON.stringify({
      type: 'email.received',
      data: {
        email_id: 're_email_123',
        from: 'test@example.com',
        subject: 'Test Subject'
      }
    });

    const response = await request(app)
      .post('/api/webhooks/resend')
      .set('svix-id', 'msg_123')
      .set('svix-timestamp', '123456789')
      .set('svix-signature', 'v1,mocksignature')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(true);
    expect(prisma.email.create).not.toHaveBeenCalled();
  });
});
