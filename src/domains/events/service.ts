import { isAfter } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { DashboardData, EventRecord } from "@/lib/types";
import { buildBirthdayEvent } from "@/domains/profiles/service";

export interface AgendaItem {
  id: string;
  title: string;
  subtitle: string;
  startsAt: string;
  eventKind: EventRecord["eventKind"];
  badge: string;
}

export function listUpcomingAgenda(data: DashboardData, now = new Date()) {
  const birthdayEvents = data.memberships
    .map((membership) =>
      buildBirthdayEvent(
        membership.profile,
        membership,
        now.getUTCFullYear(),
        data.pod.timezone,
      ),
    )
    .filter((event): event is EventRecord => Boolean(event));

  return [...data.events, ...birthdayEvents]
    .filter((event) => !event.isCancelled)
    .filter((event) => isAfter(new Date(event.endsAt), now))
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    )
    .map<AgendaItem>((event) => ({
      id: event.id,
      title: event.title,
      subtitle: event.location
        ? `${event.location} • ${formatInTimeZone(event.startsAt, event.timezone, "EEE, MMM d 'at' h:mm a")}`
        : formatInTimeZone(event.startsAt, event.timezone, "EEE, MMM d 'at' h:mm a"),
      startsAt: event.startsAt,
      eventKind: event.eventKind,
      badge:
        event.eventKind === "quick_plan"
          ? "Notify now"
          : event.eventKind === "birthday"
            ? "Birthday"
            : "Upcoming",
    }));
}
