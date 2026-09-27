import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PGSSL: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be set and reasonably long'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be set and reasonably long'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  OTP_LENGTH: z.coerce.number().min(4).max(8).default(6),
  OTP_EXPIRY_MINUTES: z.coerce.number().min(1).default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().min(1).default(5),
  OTP_REQUEST_COOLDOWN_SECONDS: z.coerce.number().min(0).default(30),
  SMS_PROVIDER: z.enum(['console', 'msg91', 'fast2sms', 'firebase']).default('console'),

  // Optional at boot so the app still starts without Razorpay configured;
  // payments.service checks these and returns a clear error if a payment
  // endpoint is hit before they're set.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // --- Matchmaking / Redis (Phase 3) ---
  REDIS_URL: z.string().default('redis://localhost:6379'),
  QUEUE_TIMEOUT_SECONDS: z.coerce.number().min(5).default(20),
  TOKEN_TICK_INTERVAL_SECONDS: z.coerce.number().min(5).default(60),
  TEXT_CHAT_TOKENS_PER_MIN: z.coerce.number().min(0).default(5),
  VOICE_CALL_TOKENS_PER_MIN: z.coerce.number().min(0).default(10),
  VIDEO_CALL_TOKENS_PER_MIN: z.coerce.number().min(0).default(15),

  // --- Media / Calls (Phase 4) ---
  // Optional at boot, same pattern as Razorpay: the app runs fine without
  // these, and GET /api/calls/:sessionId/token returns a clear error until
  // they're set.
  AGORA_APP_ID: z.string().optional(),
  AGORA_APP_CERTIFICATE: z.string().optional(),
  AGORA_TOKEN_EXPIRE_SECONDS: z.coerce.number().min(60).default(3600),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loudly — a misconfigured critical-path service (auth) must not boot silently.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
