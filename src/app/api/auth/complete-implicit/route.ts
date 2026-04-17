import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSafeRedirectPath } from "@/domains/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const IMPLICIT_CALLBACK_STATE_COOKIE = "kinloop-implicit-callback-state";

const completeImplicitSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  callbackState: z.string().min(1),
  next: z.string().optional(),
});

function buildJsonResponse(
  payload: Record<string, string>,
  options: {
    secure: boolean;
  },
  init?: ResponseInit,
) {
  const response = NextResponse.json(payload, init);
  response.cookies.set({
    name: IMPLICIT_CALLBACK_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure,
    path: "/api/auth/complete-implicit",
    maxAge: 0,
  });

  return response;
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const requestOrigin = request.headers.get("origin");
  const secure = requestUrl.protocol === "https:";

  if (!requestOrigin || requestOrigin !== requestUrl.origin) {
    return buildJsonResponse(
      { error: "Unable to complete sign-in." },
      { secure },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = completeImplicitSchema.safeParse(body);

  if (!parsedBody.success) {
    return buildJsonResponse(
      { error: "The sign-in link was incomplete." },
      { secure },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const callbackStateCookie = cookieStore.get(IMPLICIT_CALLBACK_STATE_COOKIE)?.value;

  if (!callbackStateCookie || callbackStateCookie !== parsedBody.data.callbackState) {
    return buildJsonResponse(
      { error: "Unable to complete sign-in." },
      { secure },
      { status: 403 },
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return buildJsonResponse(
      { error: "Sign-in is temporarily unavailable." },
      { secure },
      { status: 503 },
    );
  }

  const { error } = await supabase.auth.setSession({
    access_token: parsedBody.data.accessToken,
    refresh_token: parsedBody.data.refreshToken,
  });

  if (error) {
    return buildJsonResponse(
      { error: "Unable to complete sign-in." },
      { secure },
      { status: 400 },
    );
  }

  const nextPath = getSafeRedirectPath(parsedBody.data.next, "/");
  if (nextPath !== "/") {
    return buildJsonResponse({ destination: nextPath }, { secure });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return buildJsonResponse({ destination: "/sign-in" }, { secure });
  }

  const { data: memberships } = await supabase
    .from("pod_memberships")
    .select("pod_id, joined_at")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1);

  const destination = memberships?.[0]?.pod_id
    ? `/pod/${memberships[0].pod_id}`
    : "/welcome";

  return buildJsonResponse({ destination }, { secure });
}
