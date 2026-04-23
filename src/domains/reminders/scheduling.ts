import type { SupabaseClient } from "@supabase/supabase-js";
import { computeReminderTimestamp, createDeliveryDedupeKey } from "@/domains/reminders/service";
import type { NotificationChannelKind, ReminderOffsetMinutes } from "@/lib/types";

type AdminClient = SupabaseClient;

interface ChannelRow {
  membership_id: string;
  channel: NotificationChannelKind;
}

interface PendingDeliveryRow {
  id: string;
  dedupe_key: string;
}

export class ReminderSchedulingError extends Error {
  constructor(message: string) {
    super(message);
  }
}

async function listEnabledChannelsForPod(adminClient: AdminClient, podId: string) {
  const { data: membershipRows, error: membershipError } = await adminClient
    .from("pod_memberships")
    .select("id")
    .eq("pod_id", podId);

  if (membershipError) {
    throw new ReminderSchedulingError("Unable to load reminder recipients.");
  }

  const membershipIds = (membershipRows ?? [])
    .map((membership) => membership.id)
    .filter((membershipId): membershipId is string => typeof membershipId === "string");

  if (membershipIds.length === 0) {
    return [];
  }

  const { data: channelRows, error: channelError } = await adminClient
    .from("notification_channels")
    .select("membership_id, channel")
    .in("membership_id", membershipIds)
    .eq("enabled", true);

  if (channelError) {
    throw new ReminderSchedulingError("Unable to load reminder channels.");
  }

  return ((channelRows ?? []) as ChannelRow[]).filter(
    (channel) =>
      typeof channel.membership_id === "string" &&
      (channel.channel === "push" || channel.channel === "email"),
  );
}

async function listPendingDeliveriesForEvent(adminClient: AdminClient, eventId: string) {
  const { data, error } = await adminClient
    .from("notification_deliveries")
    .select("id, dedupe_key")
    .eq("event_id", eventId)
    .eq("status", "pending");

  if (error) {
    throw new ReminderSchedulingError("Unable to load pending reminder deliveries.");
  }

  return ((data ?? []) as PendingDeliveryRow[]).filter(
    (delivery) =>
      typeof delivery.id === "string" && typeof delivery.dedupe_key === "string",
  );
}

async function cancelPendingDeliveriesById(
  adminClient: AdminClient,
  deliveryIds: string[],
) {
  if (deliveryIds.length === 0) {
    return;
  }

  const { error } = await adminClient
    .from("notification_deliveries")
    .update({ status: "cancelled" })
    .in("id", deliveryIds)
    .eq("status", "pending");

  if (error) {
    throw new ReminderSchedulingError("Unable to cancel pending reminder deliveries.");
  }
}

export async function cancelPendingEventReminderDeliveries(
  adminClient: AdminClient,
  eventId: string,
) {
  const pendingDeliveries = await listPendingDeliveriesForEvent(adminClient, eventId);
  await cancelPendingDeliveriesById(
    adminClient,
    pendingDeliveries.map((delivery) => delivery.id),
  );
}

export async function syncEventReminderDeliveries(
  adminClient: AdminClient,
  input: {
    podId: string;
    eventId: string;
    startsAt: string;
    reminderOffsetMinutes: ReminderOffsetMinutes;
  },
) {
  const scheduledFor = computeReminderTimestamp(
    input.startsAt,
    input.reminderOffsetMinutes,
  ).toISOString();

  const channels = new Date(scheduledFor).getTime() > Date.now()
    ? await listEnabledChannelsForPod(adminClient, input.podId)
    : [];

  const desiredDeliveries = channels.map((channel) => ({
    membership_id: channel.membership_id,
    event_id: input.eventId,
    channel: channel.channel,
    scheduled_for: scheduledFor,
    status: "pending" as const,
    sent_at: null,
    dedupe_key: createDeliveryDedupeKey({
      eventId: input.eventId,
      membershipId: channel.membership_id,
      channel: channel.channel,
      scheduledFor,
    }),
  }));

  const desiredDedupeKeys = new Set(
    desiredDeliveries.map((delivery) => delivery.dedupe_key),
  );
  const pendingDeliveries = await listPendingDeliveriesForEvent(adminClient, input.eventId);
  const obsoletePendingDeliveryIds = pendingDeliveries
    .filter((delivery) => !desiredDedupeKeys.has(delivery.dedupe_key))
    .map((delivery) => delivery.id);

  await cancelPendingDeliveriesById(adminClient, obsoletePendingDeliveryIds);

  if (desiredDeliveries.length === 0) {
    return { scheduledCount: 0 };
  }

  const { error: upsertError } = await adminClient
    .from("notification_deliveries")
    .upsert(desiredDeliveries, {
      onConflict: "dedupe_key",
      ignoreDuplicates: true,
    });

  if (upsertError) {
    throw new ReminderSchedulingError("Unable to schedule reminder deliveries.");
  }

  return { scheduledCount: desiredDeliveries.length };
}
