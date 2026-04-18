import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const podRoleEnum = pgEnum("pod_role", ["owner", "adult", "member"]);
export const eventKindEnum = pgEnum("event_kind", [
  "standard",
  "quick_plan",
  "birthday",
]);
export const notificationChannelEnum = pgEnum("notification_channel", [
  "push",
  "email",
]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "sent",
  "failed",
  "acknowledged",
]);

export const pods = pgTable("pods", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const podMemberships = pgTable("pod_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  podId: uuid("pod_id").references(() => pods.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").notNull(),
  role: podRoleEnum("role").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  relationshipLabel: text("relationship_label").notNull().default("Member"),
  birthday: text("birthday"),
  mailingAddress: text("mailing_address"),
  avatarColor: text("avatar_color").notNull().default("bg-sky-500"),
});

export const invites = pgTable("invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  podId: uuid("pod_id").references(() => pods.id, { onDelete: "cascade" }).notNull(),
  email: text("email").notNull(),
  role: podRoleEnum("role").notNull().default("member"),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  podId: uuid("pod_id").references(() => pods.id, { onDelete: "cascade" }).notNull(),
  creatorMembershipId: uuid("creator_membership_id").references(() => podMemberships.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  location: text("location"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull(),
  eventKind: eventKindEnum("event_kind").notNull().default("standard"),
  isCancelled: boolean("is_cancelled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eventAssignments = pgTable("event_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }).notNull(),
  membershipId: uuid("membership_id")
    .references(() => podMemberships.id, { onDelete: "cascade" })
    .notNull(),
});

export const eventReminders = pgTable(
  "event_reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }).notNull(),
    offsetMinutes: text("offset_minutes").notNull(),
  },
  (table) => ({
    uniqueEventReminder: uniqueIndex("event_reminders_event_id_idx").on(table.eventId),
  }),
);

export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    membershipId: uuid("membership_id")
      .references(() => podMemberships.id, { onDelete: "cascade" })
      .notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    endpoint: text("endpoint"),
  },
  (table) => ({
    uniqueMembershipChannel: uniqueIndex(
      "notification_channels_membership_channel_idx",
    ).on(table.membershipId, table.channel),
  }),
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    membershipId: uuid("membership_id")
      .references(() => podMemberships.id, { onDelete: "cascade" })
      .notNull(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }).notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    dedupeKey: text("dedupe_key").notNull(),
  },
  (table) => ({
    uniqueDedupeKey: uniqueIndex("notification_deliveries_dedupe_key_idx").on(
      table.dedupeKey,
    ),
  }),
);

export const authRateLimits = pgTable("auth_rate_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  emailHash: text("email_hash").notNull(),
  ipHash: text("ip_hash").notNull(),
  outcome: text("outcome").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
