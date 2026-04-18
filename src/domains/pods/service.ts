import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canInviteRole } from "@/domains/auth/roles";
import type { ViewerSession } from "@/domains/auth/session";
import { normalizeEmail } from "@/domains/auth/magic-links";
import { isInviteExpired } from "@/domains/pods/invites";
import type { Invite, PodRole } from "@/lib/types";

type AdminClient = SupabaseClient;

interface ActorMembership {
  id: string;
  pod_id: string;
  user_id: string;
  role: PodRole;
}

export interface PendingInviteSummary {
  id: string;
  podId: string;
  podName: string;
  role: PodRole;
  token: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface CreatePodInput {
  name: string;
  timezone: string;
  description?: string;
}

export interface CreateInviteInput {
  podId: string;
  email: string;
  role: PodRole;
}

export interface AcceptInviteInput {
  podId: string;
  token: string;
}

export class PodServiceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function assertEmail(viewer: ViewerSession) {
  const email = viewer.email ? normalizeEmail(viewer.email) : null;

  if (!email) {
    throw new PodServiceError("Your account is missing an email address.", 400);
  }

  return email;
}

function deriveDisplayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "Family member";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

async function ensureProfile(adminClient: AdminClient, viewer: ViewerSession) {
  const email = assertEmail(viewer);

  const { error: profileInsertError } = await adminClient.from("profiles").upsert(
    {
      user_id: viewer.userId,
      display_name: deriveDisplayNameFromEmail(email),
      email,
      relationship_label: "Member",
    },
    {
      onConflict: "user_id",
      ignoreDuplicates: true,
    },
  );

  if (profileInsertError) {
    throw new PodServiceError("Unable to prepare your profile right now.", 500);
  }
}

async function getActorMembership(
  adminClient: AdminClient,
  viewer: ViewerSession,
  podId: string,
) {
  const { data, error } = await adminClient
    .from("pod_memberships")
    .select("id, pod_id, user_id, role")
    .eq("pod_id", podId)
    .eq("user_id", viewer.userId)
    .maybeSingle<ActorMembership>();

  if (error) {
    throw new PodServiceError("Unable to verify your pod access right now.", 500);
  }

  if (!data) {
    throw new PodServiceError("You do not have access to manage this pod.", 403);
  }

  return data;
}

export async function listPendingInvitesForViewer(
  adminClient: AdminClient,
  viewer: ViewerSession,
): Promise<PendingInviteSummary[]> {
  const email = assertEmail(viewer);
  const now = new Date().toISOString();

  const { data: inviteRows, error: inviteError } = await adminClient
    .from("invites")
    .select("id, pod_id, role, token, expires_at, revoked_at")
    .eq("email", email)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .order("expires_at", { ascending: true });

  if (inviteError) {
    throw new PodServiceError("Unable to load your pending invites right now.", 500);
  }

  const podIds = (inviteRows ?? [])
    .map((invite) => invite.pod_id)
    .filter((podId): podId is string => typeof podId === "string");

  if (podIds.length === 0) {
    return [];
  }

  const { data: podRows, error: podError } = await adminClient
    .from("pods")
    .select("id, name")
    .in("id", podIds);

  if (podError) {
    throw new PodServiceError("Unable to load invite details right now.", 500);
  }

  const podNamesById = new Map(
    (podRows ?? []).map((pod) => [String(pod.id), String(pod.name)]),
  );

  return (inviteRows ?? []).map((invite) => ({
    id: String(invite.id),
    podId: String(invite.pod_id),
    podName: podNamesById.get(String(invite.pod_id)) ?? "Family pod",
    role: invite.role as PodRole,
    token: String(invite.token),
    expiresAt: new Date(String(invite.expires_at)).toISOString(),
    revokedAt:
      typeof invite.revoked_at === "string"
        ? new Date(invite.revoked_at).toISOString()
        : null,
  }));
}

export async function createPodForViewer(
  adminClient: AdminClient,
  viewer: ViewerSession,
  input: CreatePodInput,
) {
  await ensureProfile(adminClient, viewer);

  const { data: podRow, error: podInsertError } = await adminClient
    .from("pods")
    .insert({
      name: input.name.trim(),
      timezone: input.timezone.trim(),
      description: input.description?.trim() ?? "",
    })
    .select("id")
    .single<{ id: string }>();

  if (podInsertError || !podRow) {
    throw new PodServiceError("Unable to create your family pod right now.", 500);
  }

  const { error: membershipInsertError } = await adminClient.from("pod_memberships").insert({
    pod_id: podRow.id,
    user_id: viewer.userId,
    role: "owner",
  });

  if (membershipInsertError) {
    throw new PodServiceError(
      "Your pod was created, but we could not add you as the owner.",
      500,
    );
  }

  return podRow.id;
}

export async function createInviteForPod(
  adminClient: AdminClient,
  viewer: ViewerSession,
  input: CreateInviteInput,
) {
  const actorMembership = await getActorMembership(adminClient, viewer, input.podId);
  const normalizedEmail = normalizeEmail(input.email);

  if (!canInviteRole(actorMembership, input.role)) {
    throw new PodServiceError("You do not have permission to invite that role.", 403);
  }

  const { data: matchingProfiles, error: matchingProfilesError } = await adminClient
    .from("profiles")
    .select("user_id")
    .eq("email", normalizedEmail)
    .limit(1);

  if (matchingProfilesError) {
    throw new PodServiceError("Unable to validate that invite right now.", 500);
  }

  const matchedUserId =
    typeof matchingProfiles?.[0]?.user_id === "string"
      ? matchingProfiles[0].user_id
      : null;

  if (matchedUserId) {
    const { data: existingMembership, error: membershipError } = await adminClient
      .from("pod_memberships")
      .select("id")
      .eq("pod_id", input.podId)
      .eq("user_id", matchedUserId)
      .maybeSingle();

    if (membershipError) {
      throw new PodServiceError("Unable to validate that invite right now.", 500);
    }

    if (existingMembership) {
      throw new PodServiceError("That person is already a member of this pod.", 409);
    }
  }

  const { data: existingInvites, error: existingInviteError } = await adminClient
    .from("invites")
    .select("id, pod_id, email, role, token, expires_at, revoked_at")
    .eq("pod_id", input.podId)
    .eq("email", normalizedEmail)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1);

  if (existingInviteError) {
    throw new PodServiceError("Unable to validate that invite right now.", 500);
  }

  const existingInvite =
    (existingInvites?.[0] as
      | (Invite & { pod_id: string; expires_at: string; revoked_at: string | null })
      | undefined) ?? null;

  if (existingInvite) {
    return {
      id: String(existingInvite.id),
      podId: String(existingInvite.pod_id),
      email: normalizedEmail,
      role: existingInvite.role as PodRole,
      token: String(existingInvite.token),
      expiresAt: new Date(String(existingInvite.expires_at)).toISOString(),
      revokedAt: existingInvite.revoked_at,
    };
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const token = randomUUID();

  const { data: inviteRow, error: inviteInsertError } = await adminClient
    .from("invites")
    .insert({
      pod_id: input.podId,
      email: normalizedEmail,
      role: input.role,
      token,
      expires_at: expiresAt,
    })
    .select("id")
    .single<{ id: string }>();

  if (inviteInsertError || !inviteRow) {
    throw new PodServiceError("Unable to create that invite right now.", 500);
  }

  return {
    id: inviteRow.id,
    podId: input.podId,
    email: normalizedEmail,
    role: input.role,
    token,
    expiresAt,
    revokedAt: null,
  };
}

export async function revokeInviteForPod(
  adminClient: AdminClient,
  viewer: ViewerSession,
  params: { podId: string; inviteId: string },
) {
  const actorMembership = await getActorMembership(adminClient, viewer, params.podId);

  if (actorMembership.role === "member") {
    throw new PodServiceError("You do not have permission to revoke invites.", 403);
  }

  const { data, error } = await adminClient
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.inviteId)
    .eq("pod_id", params.podId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new PodServiceError("Unable to revoke that invite right now.", 500);
  }

  if (!data) {
    throw new PodServiceError("Invite not found or already revoked.", 404);
  }
}

export async function acceptInviteForViewer(
  adminClient: AdminClient,
  viewer: ViewerSession,
  input: AcceptInviteInput,
) {
  const email = assertEmail(viewer);

  const { data: inviteRow, error: inviteError } = await adminClient
    .from("invites")
    .select("id, pod_id, email, role, token, expires_at, revoked_at")
    .eq("pod_id", input.podId)
    .eq("token", input.token)
    .maybeSingle<Invite & { pod_id: string; expires_at: string; revoked_at: string | null }>();

  if (inviteError) {
    throw new PodServiceError("Unable to load that invite right now.", 500);
  }

  if (!inviteRow) {
    throw new PodServiceError("That invite could not be found.", 404);
  }

  const invite = {
    expiresAt: new Date(String(inviteRow.expires_at)).toISOString(),
    revokedAt: inviteRow.revoked_at,
  };

  if (isInviteExpired(invite)) {
    throw new PodServiceError("That invite has expired or has already been used.", 410);
  }

  if (normalizeEmail(String(inviteRow.email)) !== email) {
    throw new PodServiceError(
      "This invite belongs to a different email address than the one you used to sign in.",
      403,
    );
  }

  const { data: existingMembership, error: existingMembershipError } = await adminClient
    .from("pod_memberships")
    .select("id")
    .eq("pod_id", input.podId)
    .eq("user_id", viewer.userId)
    .maybeSingle();

  if (existingMembershipError) {
    throw new PodServiceError("Unable to validate that invite right now.", 500);
  }

  if (!existingMembership) {
    const { error: membershipInsertError } = await adminClient
      .from("pod_memberships")
      .insert({
        pod_id: input.podId,
        user_id: viewer.userId,
        role: inviteRow.role,
      });

    if (membershipInsertError && !isUniqueViolation(membershipInsertError)) {
      throw new PodServiceError("Unable to accept that invite right now.", 500);
    }
  }

  await ensureProfile(adminClient, viewer);

  const { error: revokeInviteError } = await adminClient
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteRow.id)
    .is("revoked_at", null);

  if (revokeInviteError) {
    throw new PodServiceError("Joined the pod, but could not close the invite.", 500);
  }

  return input.podId;
}

export async function getJoinInviteForViewer(
  adminClient: AdminClient,
  viewer: ViewerSession,
  input: AcceptInviteInput,
) {
  const email = assertEmail(viewer);

  const { data: inviteRow, error: inviteError } = await adminClient
    .from("invites")
    .select("id, pod_id, email, role, token, expires_at, revoked_at")
    .eq("pod_id", input.podId)
    .eq("token", input.token)
    .maybeSingle<Invite & { pod_id: string; expires_at: string; revoked_at: string | null }>();

  if (inviteError) {
    throw new PodServiceError("Unable to load that invite right now.", 500);
  }

  if (!inviteRow) {
    return { status: "invalid" as const };
  }

  const invite = {
    expiresAt: new Date(String(inviteRow.expires_at)).toISOString(),
    revokedAt: inviteRow.revoked_at,
  };

  if (isInviteExpired(invite)) {
    return { status: "expired" as const };
  }

  if (normalizeEmail(String(inviteRow.email)) !== email) {
    return { status: "wrong_email" as const };
  }

  const { data: podRow, error: podError } = await adminClient
    .from("pods")
    .select("id, name")
    .eq("id", input.podId)
    .maybeSingle<{ id: string; name: string }>();

  if (podError) {
    throw new PodServiceError("Unable to load that invite right now.", 500);
  }

  const { data: existingMembership, error: existingMembershipError } = await adminClient
    .from("pod_memberships")
    .select("id")
    .eq("pod_id", input.podId)
    .eq("user_id", viewer.userId)
    .maybeSingle();

  if (existingMembershipError) {
    throw new PodServiceError("Unable to load that invite right now.", 500);
  }

  if (existingMembership) {
    return {
      status: "already_joined" as const,
      podName: podRow?.name ?? "Family pod",
    };
  }

  return {
    status: "ready" as const,
    invite: {
      id: String(inviteRow.id),
      podId: String(inviteRow.pod_id),
      podName: podRow?.name ?? "Family pod",
      role: inviteRow.role as PodRole,
      token: String(inviteRow.token),
      expiresAt: new Date(String(inviteRow.expires_at)).toISOString(),
      revokedAt: inviteRow.revoked_at,
    },
  };
}
