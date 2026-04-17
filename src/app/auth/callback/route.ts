import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSafeRedirectPath } from "@/domains/auth/session";
import { getViewerHomePath } from "@/domains/pods/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function buildImplicitFlowBridgeHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signing you in...</title>
  </head>
  <body>
    <script>
      (async function () {
        const fallback = (message) => {
          const errorUrl = new URL("/sign-in", window.location.origin);
          errorUrl.searchParams.set("error", message);
          window.location.replace(errorUrl.toString());
        };

        const hash = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const next = new URLSearchParams(window.location.search).get("next") || "/";

        if (!accessToken || !refreshToken) {
          fallback("The sign-in link was incomplete.");
          return;
        }

        try {
          const response = await fetch("/api/auth/complete-implicit", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              accessToken,
              refreshToken,
              next,
            }),
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok || typeof payload.destination !== "string") {
            throw new Error(
              typeof payload.error === "string"
                ? payload.error
                : "Unable to complete sign-in.",
            );
          }

          window.location.replace(payload.destination);
        } catch (error) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : "Unable to complete sign-in.";
          fallback(message);
        }
      })();
    </script>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const nextPath = getSafeRedirectPath(requestUrl.searchParams.get("next"), "/");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL("/sign-in?error=The sign-in link was incomplete.", requestUrl.origin),
    );
  }

  let error: { message: string } | null = null;

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  } else if (tokenHash && type) {
    const result = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    error = result.error;
  } else {
    return new NextResponse(buildImplicitFlowBridgeHtml(), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (error) {
    const errorUrl = new URL("/sign-in", requestUrl.origin);
    errorUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(errorUrl);
  }

  const destination = nextPath !== "/" ? nextPath : await getViewerHomePath();
  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}
