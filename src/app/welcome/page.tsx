import Link from "next/link";
import { redirect } from "next/navigation";
import { WelcomeOnboarding } from "@/components/welcome/welcome-onboarding";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewerSession } from "@/domains/auth/session";
import { listPendingInvitesForViewer } from "@/domains/pods/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isDemoMode, isSupabaseAdminConfigured } from "@/lib/env";

export default async function WelcomePage() {
  if (isDemoMode) {
    redirect("/pod/pod-sunrise");
  }

  const viewer = await getViewerSession();
  if (!viewer) {
    redirect("/sign-in?next=/welcome");
  }

  if (!isSupabaseAdminConfigured) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-16 sm:px-6">
        <Card className="w-full">
          <CardHeader>
            <Badge variant="accent">Signed in</Badge>
            <CardTitle>Pod management is not fully configured here yet.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            <p>
              Your authentication flow is working, but the admin environment
              variables still need to be connected before we can create or manage pods.
            </p>
            <Link className="text-emerald-700 underline" href="/">
              Return to the home page
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
            <Badge variant="accent">Signed in</Badge>
            <CardTitle>Pod management is temporarily unavailable.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            <p>
              We can&apos;t load pod management right now because the required
              configuration is unavailable. Please try again later or return to
              the home page.
            </p>
            <Link className="text-emerald-700 underline" href="/">
              Return to the home page
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const pendingInvites = await listPendingInvitesForViewer(adminClient, viewer);

  return <WelcomeOnboarding pendingInvites={pendingInvites} viewerEmail={viewer.email} />;
}
