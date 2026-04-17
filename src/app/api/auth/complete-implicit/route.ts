import { NextResponse } from "next/server";
import { z } from "zod";
import { getSafeRedirectPath } from "@/domains/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const completeImplicitSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  next: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedBody = completeImplicitSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "The sign-in link was incomplete." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }

  const { error } = await supabase.auth.setSession({
    access_token: parsedBody.data.accessToken,
    refresh_token: parsedBody.data.refreshToken,
  });

  if (error) {
    return NextResponse.json(
      { error: "Unable to complete sign-in." },
      { status: 400 },
    );
  }

  const nextPath = getSafeRedirectPath(parsedBody.data.next, "/");
  if (nextPath !== "/") {
    return NextResponse.json({ destination: nextPath });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ destination: "/sign-in" });
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

  return NextResponse.json({ destination });
}
