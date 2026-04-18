"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PendingInviteSummary } from "@/domains/pods/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface JoinInviteCardProps {
  invite: PendingInviteSummary;
}

export function JoinInviteCard({ invite }: JoinInviteCardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async () => {
    setError(null);
    setIsJoining(true);

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
        setError(result?.error ?? "Unable to accept that invite.");
        return;
      }

      router.push(result.destination);
      router.refresh();
    } catch {
      setError("Unable to accept that invite.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <Badge variant="success">Invite ready</Badge>
        <CardTitle>Join {invite.podName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
        <p>
          This invite will add you to the pod as <span className="font-medium">{invite.role}</span>.
          It expires on {new Date(invite.expiresAt).toLocaleString()}.
        </p>
        <Button className="w-full" disabled={isJoining} onClick={() => void handleJoin()}>
          {isJoining ? "Joining family pod..." : "Accept invite"}
        </Button>
        {error ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
