import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load env from monorepo root, then server/.env as a local override
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(7),

  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

  CLINIC_NAME: z.string().default('Riverside Family Clinic'),
  CLINIC_TZ: z.string().default('Asia/Karachi'),
  CLINIC_PHONE: z.string().default(''),
  CLINIC_ADDRESS: z.string().default(''),
  MIN_LEAD_MINUTES: z.coerce.number().default(30),
  REMINDER_HOURS_BEFORE: z.string().default('24,2'),

  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  MAIL_TRANSPORT: z.enum(['smtp', 'provider', 'console']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('Clinic <appointments@example.com>'),
  RESEND_API_KEY: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const reminderHoursBefore = env.REMINDER_HOURS_BEFORE.split(',')
  .map((h) => parseInt(h.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => b - a);
