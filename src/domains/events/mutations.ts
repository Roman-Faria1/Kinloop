import type { SupabaseClient } from "@supabase/supabase-js";
import { canCreateEvents, canEditEvent } from "@/domains/auth/roles";
import type { ViewerSession } from "@/domains/auth/session";
import type { EventKind, PodRole, ReminderOffsetMinutes } from "@/lib/types";

type AdminClient = SupabaseClient;

interface ActorMembership {
  id: string;
  pod_id: string;
  user_id: string;
  role: PodRole;
}

interface ManagedEventRow {
  id: string;
  pod_id: string;
  creator_membership_id: string;
  starts_at: string;
  ends_at: string;
  event_kind: EventKind;
  is_cancelled: boolean;
}

export interface CreateEventInput {
  podId: string;
  title: string;
  notes: string;
  location?: string | null;
  startsAt: string;
  eventKind: Exclude<EventKind, "birthday">;
  reminderOffsetMinutes: ReminderOffsetMinutes;
}

export interface UpdateEventInput extends CreateEventInput {
  eventId: string;
}

export interface CancelEventInput {
  podId: string;
  eventId: string;
}

export class EventMutationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function normalizeLocation(location: string | null | undefined, eventKind: CreateEventInput["eventKind"]) {
  const trimmed = location?.trim();

  if (trimmed) return trimmed;
  return eventKind === "quick_plan" ? "Shared family alert" : "TBD";
}

function parseIsoDateTime(value: string, fieldLabel: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new EventMutationError(`Enter a valid ${fieldLabel}.`, 400);
  }

  return parsed;
}

function computeEndsAt(startsAt: Date, durationMs = 60 * 60 * 1000) {
  return new Date(startsAt.getTime() + durationMs).toISOString();
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
    throw new EventMutationError("Unable to verify your event permissions right now.", 500);
  }

  if (!data) {
    throw new EventMutationError("You do not have access to manage events in this pod.", 403);
  }

  return data;
}

async function getPodTimezone(adminClient: AdminClient, podId: string) {
  const { data, error } = await adminClient
    .from("pods")
    .select("timezone")
    .eq("id", podId)
    .maybeSingle<{ timezone: string }>();

  if (error) {
    throw new EventMutationError("Unable to load this pod right now.", 500);
  }

  if (!data) {
    throw new EventMutationError("That pod could not be found.", 404);
  }

  return data.timezone;
}

async function getManagedEvent(
  adminClient: AdminClient,
  podId: string,
  eventId: string,
) {
  const { data, error } = await adminClient
    .from("events")
    .select("id, pod_id, creator_membership_id, starts_at, ends_at, event_kind, is_cancelled")
    .eq("id", eventId)
    .eq("pod_id", podId)
    .maybeSingle<ManagedEventRow>();

  if (error) {
    throw new EventMutationError("Unable to load that event right now.", 500);
  }

  if (!data) {
    throw new EventMutationError("That event could not be found.", 404);
  }

  return data;
}

async function replaceReminderRule(
  adminClient: AdminClient,
  eventId: string,
  reminderOffsetMinutes: ReminderOffsetMinutes,
) {
  const { error: deleteError } = await adminClient
    .from("event_reminders")
    .delete()
    .eq("event_id", eventId);

  if (deleteError) {
    throw new EventMutationError("Unable to update reminder timing right now.", 500);
  }

  const { error: insertError } = await adminClient.from("event_reminders").insert({
    event_id: eventId,
    offset_minutes: String(reminderOffsetMinutes),
  });

  if (insertError) {
    throw new EventMutationError("Unable to update reminder timing right now.", 500);
  }
}

export async function createEventForPod(
  adminClient: AdminClient,
  viewer: ViewerSession,
  input: CreateEventInput,
) {
  const actorMembership = await getActorMembership(adminClient, viewer, input.podId);

  if (!canCreateEvents(actorMembership)) {
    throw new EventMutationError("You do not have permission to create events.", 403);
  }

  const startsAt = parseIsoDateTime(input.startsAt, "start time");
  const timezone = await getPodTimezone(adminClient, input.podId);

  const { data: eventRow, error: eventInsertError } = await adminClient
    .from("events")
    .insert({
      pod_id: input.podId,
      creator_membership_id: actorMembership.id,
      title: input.title.trim(),
      notes: input.notes.trim(),
      location: normalizeLocation(input.location, input.eventKind),
      starts_at: startsAt.toISOString(),
      ends_at: computeEndsAt(startsAt),
      timezone,
      event_kind: input.eventKind,
    })
    .select("id")
    .single<{ id: string }>();

  if (eventInsertError || !eventRow) {
    throw new EventMutationError("Unable to save that event right now.", 500);
  }

  try {
    await replaceReminderRule(adminClient, eventRow.id, input.reminderOffsetMinutes);
  } catch (error) {
    await adminClient.from("events").delete().eq("id", eventRow.id);
    throw error;
  }

  return eventRow.id;
}

export async function updateEventForPod(
  adminClient: AdminClient,
  viewer: ViewerSession,
  input: UpdateEventInput,
) {
  const actorMembership = await getActorMembership(adminClient, viewer, input.podId);
  const currentEvent = await getManagedEvent(adminClient, input.podId, input.eventId);

  if (!canEditEvent(actorMembership, {
    creatorMembershipId: currentEvent.creator_membership_id,
    eventKind: currentEvent.event_kind,
  })) {
    throw new EventMutationError("You do not have permission to edit that event.", 403);
  }

  if (currentEvent.event_kind === "birthday") {
    throw new EventMutationError("Birthday reminders are managed from profiles.", 400);
  }

  const startsAt = parseIsoDateTime(input.startsAt, "start time");
  const currentDurationMs =
    new Date(currentEvent.ends_at).getTime() - new Date(currentEvent.starts_at).getTime();
  const fallbackDurationMs = currentDurationMs > 0 ? currentDurationMs : 60 * 60 * 1000;

  const { error: updateError } = await adminClient
    .from("events")
    .update({
      title: input.title.trim(),
      notes: input.notes.trim(),
      location: normalizeLocation(input.location, input.eventKind),
      starts_at: startsAt.toISOString(),
      ends_at: computeEndsAt(startsAt, fallbackDurationMs),
      event_kind: input.eventKind,
    })
    .eq("id", input.eventId)
    .eq("pod_id", input.podId);

  if (updateError) {
    throw new EventMutationError("Unable to update that event right now.", 500);
  }

  await replaceReminderRule(adminClient, input.eventId, input.reminderOffsetMinutes);

  return input.eventId;
}

export async function cancelEventForPod(
  adminClient: AdminClient,
  viewer: ViewerSession,
  input: CancelEventInput,
) {
  const actorMembership = await getActorMembership(adminClient, viewer, input.podId);
  const currentEvent = await getManagedEvent(adminClient, input.podId, input.eventId);

  if (!canEditEvent(actorMembership, {
    creatorMembershipId: currentEvent.creator_membership_id,
    eventKind: currentEvent.event_kind,
  })) {
    throw new EventMutationError("You do not have permission to cancel that event.", 403);
  }

  if (currentEvent.is_cancelled) {
    return input.eventId;
  }

  const { error } = await adminClient
    .from("events")
    .update({ is_cancelled: true })
    .eq("id", input.eventId)
    .eq("pod_id", input.podId);

  if (error) {
    throw new EventMutationError("Unable to cancel that event right now.", 500);
  }

  return input.eventId;
}
