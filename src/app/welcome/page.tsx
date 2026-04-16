import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewerSession } from "@/domains/auth/session";
import { isDemoMode } from "@/lib/env";

export default async function WelcomePage() {
  if (isDemoMode) {
    redirect("/pod/pod-sunrise");
  }

  const viewer = await getViewerSession();
  if (!viewer) {
    redirect("/sign-in?next=/welcome");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-16 sm:px-6">
      <Card className="w-full">
        <CardHeader>
          <Badge variant="accent">Signed in</Badge>
          <CardTitle>You are authenticated, but not in a family pod yet.</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
          <p>
            The next branch will add pod creation and invite acceptance. For now,
            your authentication flow is working and your account is ready.
          </p>
          <Link className="text-emerald-700 underline" href="/">
            Return to the home page
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
