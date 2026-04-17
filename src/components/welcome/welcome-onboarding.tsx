"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PendingInviteSummary } from "@/domains/pods/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WelcomeOnboardingProps {
  pendingInvites: PendingInviteSummary[];
  viewerEmail: string | null;
}

export function WelcomeOnboarding({
  pendingInvites,
  viewerEmail,
}: WelcomeOnboardingProps) {
  const router = useRouter();
  const [podName, setPodName] = useState("");
  const [timezone, setTimezone] = useState(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  );
  const [description, setDescription] = useState("");
  const [isCreatingPod, setIsCreatingPod] = useState(false);
  const [createPodError, setCreatePodError] = useState<string | null>(null);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);
  const [acceptInviteError, setAcceptInviteError] = useState<string | null>(null);

  const handleCreatePod = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatePodError(null);
    setIsCreatingPod(true);

    try {
      const response = await fetch("/api/pods", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: podName,
          timezone,
          description,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { destination?: string; error?: string }
        | null;

      if (!response.ok || !result?.destination) {
        setCreatePodError(result?.error ?? "Unable to create your family pod.");
        return;
      }

      router.push(result.destination);
      router.refresh();
    } catch {
      setCreatePodError("Unable to create your family pod.");
    } finally {
      setIsCreatingPod(false);
    }
  };

  const handleAcceptInvite = async (invite: PendingInviteSummary) => {
    setAcceptInviteError(null);
    setAcceptingInviteId(invite.id);

    try {
      const response = await fetch("/api/invites/accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          podId: invite.podId,
          token: invite.token,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { destination?: string; error?: string }
        | null;

      if (!response.ok || !result?.destination) {
        setAcceptInviteError(result?.error ?? "Unable to accept that invite.");
        return;
      }

      router.push(result.destination);
      router.refresh();
    } catch {
      setAcceptInviteError("Unable to accept that invite.");
    } finally {
      setAcceptingInviteId(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-16 sm:px-6">
      <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <Badge variant="success">Start your pod</Badge>
            <CardTitle>Create the shared home for your family plans.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              Signed in as <span className="font-medium">{viewerEmail ?? "family member"}</span>.
              Create the first family pod and you will be added as the owner automatically.
            </p>

            <form className="space-y-4" onSubmit={handleCreatePod}>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Pod name</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500"
                  value={podName}
                  onChange={(event) => setPodName(event.target.value)}
                  placeholder="The Faria family"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Timezone</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  placeholder="America/New_York"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  Short description
                </span>
                <textarea
                  className="min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Immediate family, school logistics, birthdays, and quick plans."
                />
              </label>

              <Button className="w-full" disabled={isCreatingPod}>
                {isCreatingPod ? "Creating your pod..." : "Create family pod"}
              </Button>

              {createPodError ? (
                <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {createPodError}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant="accent">Pending invites</Badge>
            <CardTitle>Already invited to a family pod?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              If someone already invited this email address, you can join their pod
              here instead of creating a new one.
            </p>

            {pendingInvites.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No active invites were found for this email address yet.
              </div>
            ) : (
              pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-medium text-slate-900">{invite.podName}</p>
                      <p className="text-sm text-slate-600">
                        Join as {invite.role}. Invite expires{" "}
                        {new Date(invite.expiresAt).toLocaleString()}.
                      </p>
                    </div>
                    <Badge>{invite.role}</Badge>
                  </div>
                  <Button
                    className="mt-4 w-full"
                    variant="secondary"
                    disabled={acceptingInviteId === invite.id}
                    onClick={() => void handleAcceptInvite(invite)}
                  >
                    {acceptingInviteId === invite.id
                      ? "Joining family pod..."
                      : "Accept invite"}
                  </Button>
                </div>
              ))
            )}

            {acceptInviteError ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {acceptInviteError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
