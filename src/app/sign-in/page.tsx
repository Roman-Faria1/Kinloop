import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSafeRedirectPath, getViewerSession } from "@/domains/auth/session";
import { getViewerHomePath } from "@/domains/pods/repository";
import { isDemoMode } from "@/lib/env";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextPath = getSafeRedirectPath(resolvedSearchParams.next, "/");
  const existingSession = await getViewerSession();

  if (existingSession) {
    redirect(await getViewerHomePath(existingSession));
  }

  if (isDemoMode) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-16 sm:px-6">
        <Card className="w-full">
          <CardHeader>
            <Badge variant="accent">Demo mode</Badge>
            <CardTitle>Supabase auth is not configured here yet.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>
              Add the Supabase environment variables in `.env.local` to enable real
              sign-in. Until then, you can keep using the seeded demo pod.
            </p>
            <Link className="text-emerald-700 underline" href="/pod/pod-sunrise">
              Open the demo pod
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-16 sm:px-6">
      <Card className="w-full">
        <CardHeader>
          <Badge variant="success">FamPlan access</Badge>
          <CardTitle>Sign in with a magic link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            Access is invite-only. Enter the email tied to your family pod and we
            will send a secure sign-in link if that address is approved.
          </p>
          {resolvedSearchParams.error ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {resolvedSearchParams.error}
            </p>
          ) : null}
          <SignInForm nextPath={nextPath} />
        </CardContent>
      </Card>
    </main>
  );
}
