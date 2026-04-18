import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinInviteCard } from "@/components/pods/join-invite-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewerSession } from "@/domains/auth/session";
import {
  getJoinInviteForViewer,
  PodServiceError,
} from "@/domains/pods/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isDemoMode, isSupabaseAdminConfigured } from "@/lib/env";

export default async function JoinPodPage({
  params,
  searchParams,
}: {
  params: Promise<{ podId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  if (isDemoMode) {
    redirect("/pod/pod-sunrise");
  }

  const viewer = await getViewerSession();
  const { podId } = await params;
  const resolvedSearchParams = await searchParams;
  const token = resolvedSearchParams.token;

  if (!viewer) {
    const next = encodeURIComponent(`/join/${podId}?token=${token ?? ""}`);
    redirect(`/sign-in?next=${next}`);
  }

  if (!token || !isSupabaseAdminConfigured) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-16 sm:px-6">
        <Card className="w-full">
          <CardHeader>
            <Badge variant="accent">Invite link</Badge>
            <CardTitle>This invite link is incomplete.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            <p>Try opening the full invite link again or ask for a fresh invite.</p>
            <Link className="text-emerald-700 underline" href="/welcome">
              Return to onboarding
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-16 sm:px-6">
        <Card className="w-full">
          <CardHeader>
            <Badge variant="accent">Invite link</Badge>
            <CardTitle>This invite page is temporarily unavailable.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            <p>
              We can&apos;t load this invite right now because the required
              configuration is unavailable. Please try again later or return to
              onboarding.
            </p>
            <Link className="text-emerald-700 underline" href="/welcome">
              Return to onboarding
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  let inviteState:
    | Awaited<ReturnType<typeof getJoinInviteForViewer>>
    | null = null;
  let loadErrorMessage: string | null = null;

  try {
    inviteState = await getJoinInviteForViewer(adminClient, viewer, {
      podId,
      token,
    });
  } catch (error) {
    loadErrorMessage =
      error instanceof PodServiceError
        ? error.message
        : "Unable to load that invite right now.";
  }

  if (inviteState?.status === "already_joined") {
    redirect(`/pod/${podId}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-16 sm:px-6">
      {loadErrorMessage ? (
        <Card className="w-full">
          <CardHeader>
            <Badge variant="accent">Invite link</Badge>
            <CardTitle>We could not load that invite.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            <p>{loadErrorMessage}</p>
            <Link className="text-emerald-700 underline" href="/welcome">
              Return to onboarding
            </Link>
          </CardContent>
        </Card>
      ) : inviteState?.status === "ready" ? (
        <JoinInviteCard invite={inviteState.invite} />
      ) : (
        <Card className="w-full">
          <CardHeader>
            <Badge variant="accent">Invite link</Badge>
            <CardTitle>
              {inviteState?.status === "wrong_email"
                ? "This invite belongs to a different email address."
                : "This invite is no longer available."}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            <p>
              {inviteState?.status === "wrong_email"
                ? "Sign in with the email address that was invited, or ask the pod owner to send a new invite."
                : "Ask the pod owner to send you a fresh invite if you still need access."}
            </p>
            <Link className="text-emerald-700 underline" href="/welcome">
              Return to onboarding
            </Link>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
