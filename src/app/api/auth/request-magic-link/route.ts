import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  MAGIC_LINK_GENERIC_RESPONSE,
  MAGIC_LINK_WINDOW_MINUTES,
  getClientIp,
  hashIdentifier,
  isMagicLinkRateLimited,
  normalizeEmail,
} from "@/domains/auth/magic-links";
import { getSafeRedirectPath } from "@/domains/auth/session";
import { env, isSupabaseAdminConfigured, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  email: z.string().email(),
  next: z.string().optional(),
  website: z.string().optional(),
});

async function recordAttempt(params: {
  emailHash: string;
  ipHash: string;
  outcome: "blocked" | "rate_limited" | "sent" | "failed";
}) {
  const adminClient = createSupabaseAdminClient();
  if (!adminClient) return;

  await adminClient.from("auth_rate_limits").insert({
    email_hash: params.emailHash,
    ip_hash: params.ipHash,
    outcome: params.outcome,
  });
}

function logAuthQueryFailure(message: string, details: Record<string, unknown>) {
  console.error(message, details);
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured || !isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = requestSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  if (parsedBody.data.website) {
    return NextResponse.json(
      { message: MAGIC_LINK_GENERIC_RESPONSE },
      { status: 202 },
    );
  }

  const normalizedEmail = normalizeEmail(parsedBody.data.email);
  const nextPath = getSafeRedirectPath(parsedBody.data.next, "/");
  const clientIp = getClientIp(request.headers);
  const emailHash = hashIdentifier(normalizedEmail);
  const ipHash = hashIdentifier(clientIp);
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }

  const windowStart = new Date(
    Date.now() - MAGIC_LINK_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  const [
    {
      count: rawEmailAttemptCount,
      error: emailAttemptCountError,
    },
    {
      count: rawIpAttemptCount,
      error: ipAttemptCountError,
    },
    {
      data: matchingProfiles,
      error: matchingProfilesError,
    },
    {
      data: activeInvites,
      error: activeInvitesError,
    },
  ] = await Promise.all([
    adminClient
      .from("auth_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("email_hash", emailHash)
      .gte("created_at", windowStart),
    adminClient
      .from("auth_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", windowStart),
    adminClient
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .limit(1),
    adminClient
      .from("invites")
      .select("id")
      .eq("email", normalizedEmail)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1),
  ]);

  if (
    emailAttemptCountError ||
    ipAttemptCountError ||
    matchingProfilesError ||
    activeInvitesError
  ) {
    logAuthQueryFailure("Failed to load auth rate-limit or allowlist state", {
      emailAttemptCountError,
      ipAttemptCountError,
      matchingProfilesError,
      activeInvitesError,
    });

    await recordAttempt({
      emailHash,
      ipHash,
      outcome: "failed",
    });

    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }

  const emailAttemptCount = rawEmailAttemptCount ?? 0;
  const ipAttemptCount = rawIpAttemptCount ?? 0;

  if (
    isMagicLinkRateLimited({
      emailAttempts: emailAttemptCount,
      ipAttempts: ipAttemptCount,
    })
  ) {
    await recordAttempt({
      emailHash,
      ipHash,
      outcome: "rate_limited",
    });

    return NextResponse.json(
      { message: MAGIC_LINK_GENERIC_RESPONSE },
      { status: 202 },
    );
  }

  const isAllowed = Boolean(matchingProfiles?.length || activeInvites?.length);
  if (!isAllowed) {
    await recordAttempt({
      emailHash,
      ipHash,
      outcome: "blocked",
    });

    return NextResponse.json(
      { message: MAGIC_LINK_GENERIC_RESPONSE },
      { status: 202 },
    );
  }

  const authClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const redirectUrl = new URL("/auth/callback", env.NEXT_PUBLIC_APP_URL);
  redirectUrl.searchParams.set("next", nextPath);

  const { error } = await authClient.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: redirectUrl.toString(),
    },
  });

  await recordAttempt({
    emailHash,
    ipHash,
    outcome: error ? "failed" : "sent",
  });

  if (error) {
    return NextResponse.json(
      { error: "Unable to send a magic link right now." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { message: MAGIC_LINK_GENERIC_RESPONSE },
    { status: 202 },
  );
}
