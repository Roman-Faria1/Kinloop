import type { EventRecord, PodMembership } from "@/lib/types";

export function canManageMembership(
  actor: Pick<PodMembership, "role">,
  target: Pick<PodMembership, "role">,
) {
  if (actor.role === "owner") return true;
  if (actor.role === "adult") return target.role === "member";
  return false;
}

export function canCreateEvents(actor: Pick<PodMembership, "role">) {
  return actor.role === "owner" || actor.role === "adult";
}

export function canInviteRole(
  actor: Pick<PodMembership, "role">,
  targetRole: PodMembership["role"],
) {
  if (actor.role === "owner") return true;
  if (actor.role === "adult") return targetRole === "member";
  return false;
}

export function canEditEvent(
  actor: Pick<PodMembership, "role" | "id">,
  event: {
    creatorMembershipId: EventRecord["creatorMembershipId"] | null;
    eventKind: EventRecord["eventKind"];
  },
) {
  if (event.eventKind === "birthday") return false;
  if (actor.role === "owner") return true;
  if (event.creatorMembershipId === actor.id) return true;
  return actor.role === "adult";
}
