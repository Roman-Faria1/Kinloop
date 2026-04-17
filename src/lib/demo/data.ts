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

const pod: Pod = {
  id: "pod-sunrise",
  name: "Sunrise Family",
  timezone: "America/New_York",
  description:
    "A calm coordination space for birthdays, school pickups, weekend plans, and fast-moving family logistics.",
};

const profiles: Profile[] = [
  {
    id: "profile-rachel",
    userId: "user-rachel",
    displayName: "Rachel",
    email: "rachel@example.com",
    relationshipLabel: "Parent",
    birthday: "1987-08-17",
    mailingAddress: "12 Cedar Lane\nRaleigh, NC 27603",
    avatarColor: "bg-amber-500",
  },
  {
    id: "profile-marcus",
    userId: "user-marcus",
    displayName: "Marcus",
    email: "marcus@example.com",
    relationshipLabel: "Parent",
    birthday: "1986-02-11",
    mailingAddress: "12 Cedar Lane\nRaleigh, NC 27603",
    avatarColor: "bg-emerald-500",
  },
  {
    id: "profile-jules",
    userId: "user-jules",
    displayName: "Jules",
    email: "jules@example.com",
    relationshipLabel: "Child",
    birthday: "2014-06-04",
    mailingAddress: null,
    avatarColor: "bg-sky-500",
  },
];

const memberships: PodMembership[] = [
  {
    id: "membership-rachel",
    podId: pod.id,
    userId: "user-rachel",
    role: "owner",
    joinedAt: "2025-01-04T13:00:00.000Z",
    profile: profiles[0],
  },
  {
    id: "membership-marcus",
    podId: pod.id,
    userId: "user-marcus",
    role: "adult",
    joinedAt: "2025-01-04T13:10:00.000Z",
    profile: profiles[1],
  },
  {
    id: "membership-jules",
    podId: pod.id,
    userId: "user-jules",
    role: "member",
    joinedAt: "2025-01-09T18:45:00.000Z",
    profile: profiles[2],
  },
];

const reminders = (...offsetMinutes: EventReminder["offsetMinutes"][]): EventReminder[] =>
  offsetMinutes.map((offsetMinutes, index) => ({
    id: `reminder-${offsetMinutes}-${index}`,
    offsetMinutes,
  }));

const assignments = (...membershipIds: string[]): EventAssignment[] =>
  membershipIds.map((membershipId, index) => ({
    id: `assignment-${membershipId}-${index}`,
    eventId: "",
    membershipId,
  }));

const eventsSeed: Omit<EventRecord, "assignments">[] = [
  {
    id: "event-school-night",
    podId: pod.id,
    creatorMembershipId: memberships[0].id,
    title: "School night concert",
    notes: "Jules needs black shoes and the permission slip in the folder.",
    location: "Lincoln Elementary Auditorium",
    startsAt: "2026-04-18T23:00:00.000Z",
    endsAt: "2026-04-19T00:30:00.000Z",
    timezone: pod.timezone,
    eventKind: "standard",
    isCancelled: false,
    reminderRules: reminders(60, 1440),
  },
  {
    id: "event-quick-plan",
    podId: pod.id,
    creatorMembershipId: memberships[1].id,
    title: "Ice cream after soccer?",
    notes: "Quick plan for tonight if pickup runs on time.",
    location: "Maple Creamery",
    startsAt: "2026-04-16T22:00:00.000Z",
    endsAt: "2026-04-16T23:00:00.000Z",
    timezone: pod.timezone,
    eventKind: "quick_plan",
    isCancelled: false,
    reminderRules: reminders(15),
  },
  {
    id: "event-card-mail",
    podId: pod.id,
    creatorMembershipId: memberships[0].id,
    title: "Mail Aunt Maya's birthday card",
    notes: "Address is already on file so nobody has to search old texts.",
    location: null,
    startsAt: "2026-04-20T14:00:00.000Z",
    endsAt: "2026-04-20T14:20:00.000Z",
    timezone: pod.timezone,
    eventKind: "standard",
    isCancelled: false,
    reminderRules: reminders(120),
  },
];

const events: EventRecord[] = eventsSeed.map((event, index) => ({
  ...event,
  assignments: assignments(memberships[index % memberships.length].id).map(
    (assignment) => ({
      ...assignment,
      eventId: event.id,
    }),
  ),
}));

const invites: Invite[] = [
  {
    id: "invite-grandma",
    podId: pod.id,
    email: "grandma@example.com",
    role: "member",
    token: "fam-sunrise-grandma",
    expiresAt: "2026-04-19T15:00:00.000Z",
    revokedAt: null,
  },
];

const channels: NotificationChannel[] = [
  {
    id: "channel-rachel-push",
    membershipId: memberships[0].id,
    channel: "push",
    enabled: true,
  },
  {
    id: "channel-rachel-email",
    membershipId: memberships[0].id,
    channel: "email",
    enabled: true,
  },
  {
    id: "channel-marcus-push",
    membershipId: memberships[1].id,
    channel: "push",
    enabled: true,
  },
];

const deliveries: NotificationDelivery[] = [
  {
    id: "delivery-1",
    membershipId: memberships[0].id,
    eventId: events[1].id,
    channel: "push",
    scheduledFor: "2026-04-16T21:45:00.000Z",
    sentAt: "2026-04-16T21:45:03.000Z",
    status: "sent",
    dedupeKey: "event-quick-plan:membership-rachel:push:2026-04-16T21:45:00.000Z",
  },
  {
    id: "delivery-2",
    membershipId: memberships[0].id,
    eventId: events[0].id,
    channel: "email",
    scheduledFor: "2026-04-17T23:00:00.000Z",
    sentAt: null,
    status: "pending",
    dedupeKey: "event-school-night:membership-rachel:email:2026-04-17T23:00:00.000Z",
  },
];

export function createDemoDashboardData(): DashboardData {
  return {
    viewer: {
      userId: memberships[0].userId,
      email: memberships[0].profile.email,
    },
    pod,
    currentMembership: memberships[0],
    memberships,
    invites,
    events,
    channels,
    deliveries,
    productReadiness: {
      demoMode: true,
      realtimeReady: false,
      notificationsReady: false,
    },
  };
}
