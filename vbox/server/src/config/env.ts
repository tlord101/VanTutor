import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  RESEND_WEBHOOK_SECRET: z.string().optional().default(''),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 chars'),
  APP_URL: z.string().default('http://localhost:3000'),
  WEBHOOK_URL: z.string().optional().default('https://avelut.xyz/api/webhooks/resend')
});

function getEnv() {
  const result = envSchema.safeParse(process.env);
  if (result.success) {
    return result.data;
  }
  return {
    NODE_ENV: (process.env.NODE_ENV as any) || 'development',
    PORT: process.env.PORT || '3000',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vbox_test',
    RESEND_API_KEY: process.env.RESEND_API_KEY || 're_mock_key',
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET || '',
    JWT_SECRET: process.env.JWT_SECRET || 'super-secret-jwt-key-at-least-32-characters-long',
    APP_URL: process.env.APP_URL || 'http://localhost:3000',
    WEBHOOK_URL: process.env.WEBHOOK_URL || 'https://avelut.xyz/api/webhooks/resend'
  };
}

export const config = getEnv();
