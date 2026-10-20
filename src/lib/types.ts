export type PodRole = "owner" | "adult" | "member";
export type EventKind = "standard" | "quick_plan" | "birthday";
export type DeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "acknowledged"
  | "cancelled";
export type NotificationChannelKind = "push" | "email";
export const REMINDER_OFFSET_MINUTES = [15, 30, 60, 120, 1440] as const;
export type ReminderOffsetMinutes = (typeof REMINDER_OFFSET_MINUTES)[number];

export interface Pod {
  id: string;
  name: string;
  timezone: string;
  description: string;
}

export interface Profile {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  relationshipLabel: string;
  birthday: string | null;
  mailingAddress: string | null;
  avatarColor: string;
}

export interface PodMembership {
  id: string;
  podId: string;
  userId: string;
  role: PodRole;
  joinedAt: string;
  profile: Profile;
}

export interface Invite {
  id: string;
  podId: string;
  email: string;
  role: PodRole;
  token: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface EventReminder {
  id: string;
  offsetMinutes: ReminderOffsetMinutes;
}

export interface EventAssignment {
  id: string;
  eventId: string;
  membershipId: string;
}

export interface EventRecord {
  id: string;
  podId: string;
  creatorMembershipId: string;
  title: string;
  notes: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  eventKind: EventKind;
  isCancelled: boolean;
  reminderRules: EventReminder[];
  assignments: EventAssignment[];
}

export interface NotificationChannel {
  id: string;
  membershipId: string;
  channel: NotificationChannelKind;
  enabled: boolean;
}

export interface NotificationDelivery {
  id: string;
  membershipId: string;
  eventId: string;
  channel: NotificationChannelKind;
  scheduledFor: string;
  sentAt: string | null;
  status: DeliveryStatus;
  dedupeKey: string;
}

export interface DashboardData {
  viewer: {
    userId: string;
    email: string | null;
  };
  pod: Pod;
  currentMembership: PodMembership;
  memberships: PodMembership[];
  invites: Invite[];
  events: EventRecord[];
  channels: NotificationChannel[];
  deliveries: NotificationDelivery[];
  productReadiness: {
    demoMode: boolean;
    realtimeReady: boolean;
    notificationsReady: boolean;
  };
}
