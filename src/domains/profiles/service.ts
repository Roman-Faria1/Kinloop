import { set } from "date-fns";
import type { EventRecord, PodMembership, Profile } from "@/lib/types";

export function buildBirthdayEvent(
  profile: Profile,
  membership: PodMembership,
  year: number,
  timezone: string,
): EventRecord | null {
  if (!profile.birthday) return null;

  const [birthYear, month, day] = profile.birthday.split("-").map(Number);
  const date = set(new Date(Date.UTC(year, month - 1, day, 13, 0, 0)), {
    year,
    month: month - 1,
    date: day,
    hours: 13,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  });

  const end = new Date(date.getTime() + 60 * 60 * 1000);

  return {
    id: `birthday-${profile.id}-${year}`,
    podId: membership.podId,
    creatorMembershipId: membership.id,
    title: `${profile.displayName}'s birthday`,
    notes: birthYear ? "Birthday tracked from profile data." : "",
    location: null,
    startsAt: date.toISOString(),
    endsAt: end.toISOString(),
    timezone,
    eventKind: "birthday",
    isCancelled: false,
    reminderRules: [
      {
        id: `birthday-reminder-${profile.id}-${year}`,
        offsetMinutes: 1440,
      },
    ],
    assignments: [],
  };
}
