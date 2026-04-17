import { isNotificationStackConfigured, isSupabaseConfigured } from "@/lib/env";
import { createDemoDashboardData } from "@/lib/demo/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DashboardData,
  EventAssignment,
  EventRecord,
  EventReminder,
  Invite,
  NotificationChannel,
  NotificationDelivery,
  Pod,
  PodMembership,
  Profile,
} from "@/lib/types";
import { getViewerSession } from "@/domains/auth/session";

type Row = Record<string, unknown>;
const reminderOffsetMinutesValues = [15, 30, 60, 120, 1440] as const;
const validReminderOffsetMinutes = new Set<number>(reminderOffsetMinutesValues);

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asIso(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return new Date(0).toISOString();
}

function mapProfile(row: Row): Profile {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    displayName: asString(row.display_name, "Family member"),
    email: asString(row.email),
    relationshipLabel: asString(row.relationship_label, "Member"),
    birthday: asNullableString(row.birthday),
    mailingAddress: asNullableString(row.mailing_address),
    avatarColor: asString(row.avatar_color, "bg-sky-500"),
  };
}

function mapMembership(row: Row, profile: Profile): PodMembership {
  return {
    id: asString(row.id),
    podId: asString(row.pod_id),
    userId: asString(row.user_id),
    role: asString(row.role, "member") as PodMembership["role"],
    joinedAt: asIso(row.joined_at),
    profile,
  };
}

function mapInvite(row: Row): Invite {
  return {
    id: asString(row.id),
    podId: asString(row.pod_id),
    email: asString(row.email),
    role: asString(row.role, "member") as Invite["role"],
    token: asString(row.token),
    expiresAt: asIso(row.expires_at),
    revokedAt: asNullableString(row.revoked_at),
  };
}

function mapReminder(row: Row): EventReminder | null {
  const parsedOffsetMinutes = Number.parseInt(asString(row.offset_minutes), 10);

  if (!validReminderOffsetMinutes.has(parsedOffsetMinutes)) {
    return null;
  }

  return {
    id: asString(row.id),
    offsetMinutes: parsedOffsetMinutes as EventReminder["offsetMinutes"],
  };
}

function mapAssignment(row: Row): EventAssignment {
  return {
    id: asString(row.id),
    eventId: asString(row.event_id),
    membershipId: asString(row.membership_id),
  };
}

function mapChannel(row: Row): NotificationChannel {
  return {
    id: asString(row.id),
    membershipId: asString(row.membership_id),
    channel: asString(row.channel, "push") as NotificationChannel["channel"],
    enabled: Boolean(row.enabled),
  };
}

function mapDelivery(row: Row): NotificationDelivery {
  return {
    id: asString(row.id),
    membershipId: asString(row.membership_id),
    eventId: asString(row.event_id),
    channel: asString(row.channel, "push") as NotificationDelivery["channel"],
    scheduledFor: asIso(row.scheduled_for),
    sentAt: asNullableString(row.sent_at),
    status: asString(row.status, "pending") as NotificationDelivery["status"],
    dedupeKey: asString(row.dedupe_key),
  };
}

function mapEvent(
  row: Row,
  reminderRules: EventReminder[],
  assignments: EventAssignment[],
): EventRecord {
  return {
    id: asString(row.id),
    podId: asString(row.pod_id),
    creatorMembershipId: asString(row.creator_membership_id),
    title: asString(row.title),
    notes: asString(row.notes),
    location: asNullableString(row.location),
    startsAt: asIso(row.starts_at),
    endsAt: asIso(row.ends_at),
    timezone: asString(row.timezone, "UTC"),
    eventKind: asString(row.event_kind, "standard") as EventRecord["eventKind"],
    isCancelled: Boolean(row.is_cancelled),
    reminderRules,
    assignments,
  };
}

export async function getViewerHomePath(
  viewerOverride?: Awaited<ReturnType<typeof getViewerSession>>,
) {
  if (!isSupabaseConfigured) {
    return "/pod/pod-sunrise";
  }

  const viewer = viewerOverride ?? (await getViewerSession());
  if (!viewer) return "/sign-in";

  const supabase = await createSupabaseServerClient();
  if (!supabase) return "/sign-in";

  const { data: memberships } = await supabase
    .from("pod_memberships")
    .select("pod_id, joined_at")
    .eq("user_id", viewer.userId)
    .order("joined_at", { ascending: true })
    .limit(1);

  const firstMembership = memberships?.[0];
  if (!firstMembership) {
    return "/welcome";
  }

  return `/pod/${firstMembership.pod_id}`;
}

export async function getDashboardData(
  podId = "pod-sunrise",
): Promise<DashboardData | null> {
  if (!isSupabaseConfigured) {
    return createDemoDashboardData();
  }

  const supabase = await createSupabaseServerClient();
  const viewer = await getViewerSession();

  if (!supabase || !viewer) return null;

  const {
    data: currentMembershipRow,
    error: currentMembershipError,
  } = await supabase
    .from("pod_memberships")
    .select("id, pod_id, user_id, role, joined_at")
    .eq("pod_id", podId)
    .eq("user_id", viewer.userId)
    .maybeSingle();

  if (currentMembershipError) {
    console.error("Failed to load current pod membership", {
      podId,
      userId: viewer.userId,
      error: currentMembershipError,
    });
    return null;
  }

  if (!currentMembershipRow) {
    return null;
  }

  const membershipPodId = asString(currentMembershipRow.pod_id, podId);

  const [
    podResult,
    membershipsResult,
    invitesResult,
    eventsResult,
  ] = await Promise.all([
    supabase
      .from("pods")
      .select("id, name, timezone, description")
      .eq("id", membershipPodId)
      .maybeSingle(),
    supabase
      .from("pod_memberships")
      .select("id, pod_id, user_id, role, joined_at")
      .eq("pod_id", membershipPodId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("invites")
      .select("id, pod_id, email, role, token, expires_at, revoked_at")
      .eq("pod_id", membershipPodId)
      .order("expires_at", { ascending: true }),
    supabase
      .from("events")
      .select(
        "id, pod_id, creator_membership_id, title, notes, location, starts_at, ends_at, timezone, event_kind, is_cancelled",
      )
      .eq("pod_id", membershipPodId)
      .order("starts_at", { ascending: true }),
  ]);

  const membershipRows = (membershipsResult.data ?? []) as Row[];
  const userIds = membershipRows.map((row) => asString(row.user_id)).filter(Boolean);
  const membershipIds = membershipRows.map((row) => asString(row.id)).filter(Boolean);
  const eventRows = (eventsResult.data ?? []) as Row[];
  const eventIds = eventRows.map((row) => asString(row.id)).filter(Boolean);

  const [profilesResult, remindersResult, assignmentsResult, channelsResult, deliveriesResult] =
    await Promise.all([
      userIds.length > 0
        ? supabase
            .from("profiles")
            .select(
              "id, user_id, display_name, email, relationship_label, birthday, mailing_address, avatar_color",
            )
            .in("user_id", userIds)
        : Promise.resolve({ data: [] }),
      eventIds.length > 0
        ? supabase
            .from("event_reminders")
            .select("id, event_id, offset_minutes")
            .in("event_id", eventIds)
        : Promise.resolve({ data: [] }),
      eventIds.length > 0
        ? supabase
            .from("event_assignments")
            .select("id, event_id, membership_id")
            .in("event_id", eventIds)
        : Promise.resolve({ data: [] }),
      membershipIds.length > 0
        ? supabase
            .from("notification_channels")
            .select("id, membership_id, channel, enabled")
            .in("membership_id", membershipIds)
        : Promise.resolve({ data: [] }),
      membershipIds.length > 0
        ? supabase
            .from("notification_deliveries")
            .select(
              "id, membership_id, event_id, channel, scheduled_for, sent_at, status, dedupe_key",
            )
            .in("membership_id", membershipIds)
            .order("scheduled_for", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
    ]);

  const profileRows = (profilesResult.data ?? []) as Row[];
  const remindersRows = (remindersResult.data ?? []) as Row[];
  const assignmentRows = (assignmentsResult.data ?? []) as Row[];
  const channelRows = (channelsResult.data ?? []) as Row[];
  const deliveryRows = (deliveriesResult.data ?? []) as Row[];
  const remindersByEventId = new Map<string, Row[]>();
  const assignmentsByEventId = new Map<string, Row[]>();

  for (const reminderRow of remindersRows) {
    const eventId = asString(reminderRow.event_id);
    const eventReminderRows = remindersByEventId.get(eventId);

    if (eventReminderRows) {
      eventReminderRows.push(reminderRow);
    } else {
      remindersByEventId.set(eventId, [reminderRow]);
    }
  }

  for (const assignmentRow of assignmentRows) {
    const eventId = asString(assignmentRow.event_id);
    const eventAssignmentRows = assignmentsByEventId.get(eventId);

    if (eventAssignmentRows) {
      eventAssignmentRows.push(assignmentRow);
    } else {
      assignmentsByEventId.set(eventId, [assignmentRow]);
    }
  }

  const profilesByUserId = new Map(
    profileRows.map((row) => {
      const profile = mapProfile(row);
      return [profile.userId, profile] as const;
    }),
  );

  const memberships = membershipRows.map((row) =>
    mapMembership(
      row,
      profilesByUserId.get(asString(row.user_id)) ?? {
        id: `missing-profile-${asString(row.user_id)}`,
        userId: asString(row.user_id),
        displayName: "Family member",
        email: "",
        relationshipLabel: "Member",
        birthday: null,
        mailingAddress: null,
        avatarColor: "bg-sky-500",
      },
    ),
  );

  const currentMembership =
    memberships.find((membership) => membership.userId === viewer.userId) ??
    memberships[0];

  if (!currentMembership) {
    return null;
  }

  const podRow = (podResult.data ?? {
    id: membershipPodId,
    name: "Your family pod",
    timezone: "UTC",
    description: "",
  }) as Row;

  const pod: Pod = {
    id: asString(podRow.id, membershipPodId),
    name: asString(podRow.name, "Your family pod"),
    timezone: asString(podRow.timezone, "UTC"),
    description: asString(podRow.description),
  };

  return {
    viewer,
    pod,
    currentMembership,
    memberships,
    invites: ((invitesResult.data ?? []) as Row[]).map(mapInvite),
    events: eventRows.map((row) => {
      const eventId = asString(row.id);

      return mapEvent(
        row,
        (remindersByEventId.get(eventId) ?? [])
          .map(mapReminder)
          .filter((reminder): reminder is EventReminder => reminder !== null),
        (assignmentsByEventId.get(eventId) ?? []).map(mapAssignment),
      );
    }),
    channels: channelRows.map(mapChannel),
    deliveries: deliveryRows.map(mapDelivery),
    productReadiness: {
      demoMode: false,
      realtimeReady: true,
      notificationsReady: isNotificationStackConfigured,
    },
  };
}
