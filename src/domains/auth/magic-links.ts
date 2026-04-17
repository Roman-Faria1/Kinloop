import { createHash } from "node:crypto";
import { env } from "@/lib/env";

export const MAGIC_LINK_GENERIC_RESPONSE =
  "If this email is approved for FamPlan, a magic link will arrive shortly.";

export const MAGIC_LINK_EMAIL_WINDOW_LIMIT = 4;
export const MAGIC_LINK_IP_WINDOW_LIMIT = 10;
export const MAGIC_LINK_WINDOW_MINUTES = 15;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashIdentifier(identifier: string) {
  const salt = env.AUTH_RATE_LIMIT_SALT ?? env.NEXT_PUBLIC_APP_URL;
  return createHash("sha256").update(`${salt}:${identifier}`).digest("hex");
}

export function isMagicLinkRateLimited({
  emailAttempts,
  ipAttempts,
}: {
  emailAttempts: number;
  ipAttempts: number;
}) {
  return (
    emailAttempts >= MAGIC_LINK_EMAIL_WINDOW_LIMIT ||
    ipAttempts >= MAGIC_LINK_IP_WINDOW_LIMIT
  );
}

export function getClientIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return headers.get("x-real-ip") ?? "unknown";
}
