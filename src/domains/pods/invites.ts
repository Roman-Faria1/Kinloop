import type { Invite, Pod } from "@/lib/types";

export function isInviteExpired(
  invite: Pick<Invite, "expiresAt" | "revokedAt">,
  now = new Date(),
) {
  if (invite.revokedAt) return true;
  return new Date(invite.expiresAt).getTime() <= now.getTime();
}

export function buildInviteLink(
  pod: Pick<Pod, "id">,
  token: string,
  appUrl: string,
) {
  return `${appUrl.replace(/\/$/, "")}/join/${pod.id}?token=${token}`;
}
