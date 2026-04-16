import { addMinutes } from "date-fns";
import type {
  EventRecord,
  NotificationChannelKind,
  ReminderOffsetMinutes,
} from "@/lib/types";

export function reminderOffsetToMs(offsetMinutes: ReminderOffsetMinutes) {
  return offsetMinutes * 60 * 1000;
}

export function computeReminderTimestamp(
  startsAt: string,
  offsetMinutes: ReminderOffsetMinutes,
) {
  return addMinutes(new Date(startsAt), -offsetMinutes);
}

export function buildReminderSchedule(
  event: Pick<EventRecord, "startsAt" | "reminderRules">,
) {
  return event.reminderRules.map((rule) => ({
    offsetMinutes: rule.offsetMinutes,
    scheduledFor: computeReminderTimestamp(event.startsAt, rule.offsetMinutes),
  }));
}

export function createDeliveryDedupeKey(input: {
  eventId: string;
  membershipId: string;
  channel: NotificationChannelKind;
  scheduledFor: string;
}) {
  return `${input.eventId}:${input.membershipId}:${input.channel}:${input.scheduledFor}`;
}

export function isDuplicateDelivery(
  dedupeKey: string,
  existing: Array<{ dedupeKey: string }>,
) {
  return existing.some((delivery) => delivery.dedupeKey === dedupeKey);
}
