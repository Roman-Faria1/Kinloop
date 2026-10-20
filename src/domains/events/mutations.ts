import type { SupabaseClient } from "@supabase/supabase-js";
import { canCreateEvents, canEditEvent } from "@/domains/auth/roles";
import type { ViewerSession } from "@/domains/auth/session";
import {
  ReminderSchedulingError,
  syncEventReminderDeliveries,
} from "@/domains/reminders/scheduling";
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
  creator_membership_id: string | null;
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

function toEventMutationError(error: unknown) {
  if (error instanceof EventMutationError) {
    return error;
  }

  if (error instanceof ReminderSchedulingError) {
    return new EventMutationError(error.message, 500);
  }

  return new EventMutationError("Unable to update reminder scheduling right now.", 500);
}

function toEventRpcError(error: { code?: string }, action: "update" | "cancel") {
  switch (error.code) {
    case "PT400":
      return new EventMutationError("Enter valid event details before saving.", 400);
    case "PT403":
      return new EventMutationError(
        `You do not have permission to ${action === "update" ? "edit" : "cancel"} that event.`,
        403,
      );
    case "PT404":
      return new EventMutationError("That event could not be found.", 404);
    case "PT409":
      return new EventMutationError("Cancelled events cannot be edited.", 409);
    default:
      return new EventMutationError(`Unable to ${action} that event right now.`, 500);
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
    .select("id, pod_id, creator_membership_id, event_kind, is_cancelled")
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
  const { error: upsertError } = await adminClient.from("event_reminders").upsert(
    {
      event_id: eventId,
      offset_minutes: String(reminderOffsetMinutes),
    },
    {
      onConflict: "event_id",
    },
  );

  if (upsertError) {
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
    await syncEventReminderDeliveries(adminClient, {
      podId: input.podId,
      eventId: eventRow.id,
      startsAt: startsAt.toISOString(),
      reminderOffsetMinutes: input.reminderOffsetMinutes,
    });
  } catch (error) {
    await adminClient.from("events").delete().eq("id", eventRow.id);
    throw toEventMutationError(error);
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

  if (currentEvent.is_cancelled) {
    throw new EventMutationError("Cancelled events cannot be edited.", 409);
  }

  const startsAt = parseIsoDateTime(input.startsAt, "start time");
  const { error: updateError } = await adminClient.rpc("mutate_pod_event_with_reminders", {
    p_pod_id: input.podId,
    p_event_id: input.eventId,
    p_actor_user_id: viewer.userId,
    p_action: "update",
    p_title: input.title.trim(),
    p_notes: input.notes.trim(),
    p_location: normalizeLocation(input.location, input.eventKind),
    p_starts_at: startsAt.toISOString(),
    p_event_kind: input.eventKind,
    p_reminder_offset_minutes: input.reminderOffsetMinutes,
  });

  if (updateError) {
    throw toEventRpcError(updateError, "update");
  }

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

  const { error } = await adminClient.rpc("mutate_pod_event_with_reminders", {
    p_pod_id: input.podId,
    p_event_id: input.eventId,
    p_actor_user_id: viewer.userId,
    p_action: "cancel",
  });

  if (error) {
    throw toEventRpcError(error, "cancel");
  }

  return input.eventId;
}
