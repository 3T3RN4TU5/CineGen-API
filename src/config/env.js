import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_BASE_URL: z.url('API_BASE_URL must be a valid URL'),
  CLIENT_URL: z.string().min(1, 'CLIENT_URL is required (comma-separated allow list)'),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  FAL_KEY: z.string().min(1, 'FAL_KEY is required'),
  FAL_WEBHOOK_VERIFY: bool.default('true'),

  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),

  SIGNUP_FREE_CREDITS: z.coerce.number().int().min(0).default(20),
  DAILY_GENERATION_LIMIT: z.coerce.number().int().min(1).default(10),
  JOB_TIMEOUT_MINUTES: z.coerce.number().int().min(1).default(15),

  // Set to "false" on serverless hosts (Vercel) where setInterval cannot run.
  ENABLE_POLLER: bool.default('true'),
  // Shared secret for the cron-triggered poll endpoint (Vercel Cron sends it as a Bearer token).
  CRON_SECRET: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
  // Logger depends on env, so use console here.
  console.error(`\n❌ Invalid environment configuration:\n${details}\n\nSee .env.example.\n`);
  if (process.env.NODE_ENV !== 'test') process.exit(1);
  throw new Error('Invalid environment configuration');
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  clientOrigins: parsed.data.CLIENT_URL.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
