import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSafeRedirectPath } from "@/domains/auth/session";
import { getViewerHomePath } from "@/domains/pods/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const nextPath = getSafeRedirectPath(requestUrl.searchParams.get("next"), "/");

  const supabase = await createSupabaseServerClient();
  if (!supabase || !tokenHash || !type) {
    return NextResponse.redirect(
      new URL("/sign-in?error=The sign-in link was incomplete.", requestUrl.origin),
    );
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    const errorUrl = new URL("/sign-in", requestUrl.origin);
    errorUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(errorUrl);
  }

  const destination = nextPath !== "/" ? nextPath : await getViewerHomePath();
  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}
