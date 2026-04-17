import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  AUTH_RATE_LIMIT_SALT: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

const fallback: z.infer<typeof envSchema> = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined,
  AUTH_RATE_LIMIT_SALT: undefined,
  DATABASE_URL: undefined,
  INNGEST_EVENT_KEY: undefined,
  INNGEST_SIGNING_KEY: undefined,
  RESEND_API_KEY: undefined,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined,
  VAPID_PRIVATE_KEY: undefined,
};

export const env = parsed.success ? parsed.data : fallback;

export const isSupabaseConfigured = Boolean(
  parsed.success &&
    parsed.data.NEXT_PUBLIC_SUPABASE_URL &&
    parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const isNotificationStackConfigured = Boolean(
  parsed.success &&
    parsed.data.INNGEST_EVENT_KEY &&
    parsed.data.RESEND_API_KEY &&
    parsed.data.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
);

export const isDemoMode = !isSupabaseConfigured;

export const isSupabaseAdminConfigured = Boolean(
  parsed.success &&
    parsed.data.NEXT_PUBLIC_SUPABASE_URL &&
    parsed.data.SUPABASE_SERVICE_ROLE_KEY,
);

export const isAuthRateLimitConfigured = Boolean(
  parsed.success && parsed.data.AUTH_RATE_LIMIT_SALT,
);
