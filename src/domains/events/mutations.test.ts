import {
  cancelEventForPod,
  createEventForPod,
  updateEventForPod,
} from "@/domains/events/mutations";
import { afterEach, vi } from "vitest";

type ScenarioResult = { data?: unknown; error?: { code?: string; message?: string } | null };
type ScenarioHandler = (state: QueryState) => ScenarioResult | Promise<ScenarioResult>;
type UpsertHandler = (
  payload: unknown,
  options: unknown,
) => { error?: { code?: string; message?: string } | null } | Promise<{ error?: { code?: string; message?: string } | null }>;

interface QueryState {
  action: "select" | "insert" | "update" | "delete";
  table: string;
  payload?: unknown;
  filters: Array<{ field: string; value: unknown; operator?: "eq" | "in" }>;
}

function createAdminClient({
  selectHandlers = {},
  singleHandlers = {},
  maybeSingleHandlers = {},
  commandHandlers = {},
  upsertHandlers = {},
  rpcHandler,
}: {
  selectHandlers?: Record<string, ScenarioHandler>;
  singleHandlers?: Record<string, ScenarioHandler>;
  maybeSingleHandlers?: Record<string, ScenarioHandler>;
  commandHandlers?: Record<string, ScenarioHandler>;
  upsertHandlers?: Record<string, UpsertHandler>;
  rpcHandler?: (name: string, payload: unknown) => ScenarioResult;
}) {
  return {
    rpc(name: string, payload: unknown) {
      if (!rpcHandler) throw new Error(`Unexpected RPC: ${name}`);
      return Promise.resolve(rpcHandler(name, payload));
    },
    from(table: string) {
      const state: QueryState = {
        action: "select",
        table,
        filters: [],
      };

      const builder = {
        select() {
          state.action = "select";
          return builder;
        },
        insert(payload: unknown) {
          state.action = "insert";
          state.payload = payload;
          return builder;
        },
        update(payload: unknown) {
          state.action = "update";
          state.payload = payload;
          return builder;
        },
        delete() {
          state.action = "delete";
          return builder;
        },
        eq(field: string, value: unknown) {
          state.filters.push({ field, value, operator: "eq" });
          return builder;
        },
        in(field: string, value: unknown[]) {
          state.filters.push({ field, value, operator: "in" });
          return builder;
        },
        maybeSingle<T>() {
          const handler = maybeSingleHandlers[table];
          return Promise.resolve(handler ? handler(state) : { data: null, error: null }) as Promise<{
            data: T | null;
            error: { code?: string; message?: string } | null;
          }>;
        },
        single<T>() {
          const handler = singleHandlers[table];
          return Promise.resolve(handler ? handler(state) : { data: null, error: null }) as Promise<{
            data: T | null;
            error: { code?: string; message?: string } | null;
          }>;
        },
        upsert(payload: unknown, options: unknown) {
          const handler = upsertHandlers[table];
          return Promise.resolve(handler ? handler(payload, options) : { error: null });
        },
        then<TResult1 = ScenarioResult, TResult2 = never>(
          onfulfilled?: ((value: ScenarioResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          const handler =
            commandHandlers[`${table}:${state.action}`] ??
            selectHandlers[table] ??
            (() => ({ data: null, error: null }));

          return Promise.resolve(handler(state)).then(onfulfilled, onrejected);
        },
      };

      return builder;
    },
  };
}

const viewer = {
  userId: "user-1",
  email: "owner@example.com",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("event mutations", () => {
  it("creates an event and schedules reminder deliveries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T12:00:00.000Z"));

    const reminderUpserts: Array<{ payload: unknown; options: unknown }> = [];
    const deliveryUpserts: Array<{ payload: unknown; options: unknown }> = [];

    const adminClient = createAdminClient({
      selectHandlers: {
        pod_memberships: () => ({
          data: [{ id: "membership-owner" }],
          error: null,
        }),
        notification_channels: () => ({
          data: [{ membership_id: "membership-owner", channel: "push" }],
          error: null,
        }),
      },
      maybeSingleHandlers: {
        pod_memberships: () => ({
          data: {
            id: "membership-owner",
            pod_id: "pod-1",
            user_id: "user-1",
            role: "owner",
          },
          error: null,
        }),
        pods: () => ({
          data: { timezone: "America/New_York" },
          error: null,
        }),
      },
      singleHandlers: {
        events: () => ({
          data: { id: "event-1" },
          error: null,
        }),
      },
      upsertHandlers: {
        event_reminders: (payload, options) => {
          reminderUpserts.push({ payload, options });
          return { error: null };
        },
        notification_deliveries: (payload, options) => {
          deliveryUpserts.push({ payload, options });
          return { error: null };
        },
      },
    });

    const eventId = await createEventForPod(adminClient as never, viewer, {
      podId: "pod-1",
      title: "Carpool swap",
      notes: "Meet at the front office",
      location: "",
      startsAt: "2026-04-24T21:00:00.000Z",
      eventKind: "quick_plan",
      reminderOffsetMinutes: 15,
    });

    expect(eventId).toBe("event-1");
    expect(reminderUpserts).toEqual([
      {
        payload: {
          event_id: "event-1",
          offset_minutes: "15",
        },
        options: {
          onConflict: "event_id",
        },
      },
    ]);
    expect(deliveryUpserts).toEqual([
      {
        payload: [
          {
            membership_id: "membership-owner",
            event_id: "event-1",
            channel: "push",
            scheduled_for: "2026-04-24T20:45:00.000Z",
            status: "pending",
            sent_at: null,
            dedupe_key: "event-1:membership-owner:push:2026-04-24T20:45:00.000Z",
          },
        ],
        options: {
          onConflict: "dedupe_key",
          ignoreDuplicates: true,
        },
      },
    ]);
  });

  it("blocks event creation for members without create permissions", async () => {
    const adminClient = createAdminClient({
      maybeSingleHandlers: {
        pod_memberships: () => ({
          data: {
            id: "membership-member",
            pod_id: "pod-1",
            user_id: "user-1",
            role: "member",
          },
          error: null,
        }),
      },
    });

    await expect(
      createEventForPod(adminClient as never, viewer, {
        podId: "pod-1",
        title: "Pickup",
        notes: "",
        location: "",
        startsAt: "2026-04-24T21:00:00.000Z",
        eventKind: "standard",
        reminderOffsetMinutes: 30,
      }),
    ).rejects.toMatchObject({
      message: "You do not have permission to create events.",
      status: 403,
    });
  });

  it("rejects editing birthday events from the event mutation path", async () => {
    const adminClient = createAdminClient({
      maybeSingleHandlers: {
        pod_memberships: () => ({
          data: {
            id: "membership-owner",
            pod_id: "pod-1",
            user_id: "user-1",
            role: "owner",
          },
          error: null,
        }),
        events: () => ({
          data: {
            id: "event-birthday",
            pod_id: "pod-1",
            creator_membership_id: "membership-someone-else",
            starts_at: "2026-04-24T21:00:00.000Z",
            ends_at: "2026-04-24T22:00:00.000Z",
            event_kind: "birthday",
            is_cancelled: false,
          },
          error: null,
        }),
      },
    });

    await expect(
      updateEventForPod(adminClient as never, viewer, {
        eventId: "event-birthday",
        podId: "pod-1",
        title: "Updated",
        notes: "",
        location: "",
        startsAt: "2026-04-24T21:00:00.000Z",
        eventKind: "standard",
        reminderOffsetMinutes: 60,
      }),
    ).rejects.toMatchObject({
      message: "You do not have permission to edit that event.",
      status: 403,
    });
  });

  it("updates an event and reschedules reminder deliveries", async () => {
    const rpcCalls: Array<{ name: string; payload: unknown }> = [];

    const adminClient = createAdminClient({
      maybeSingleHandlers: {
        pod_memberships: () => ({
          data: {
            id: "membership-owner",
            pod_id: "pod-1",
            user_id: "user-1",
            role: "owner",
          },
          error: null,
        }),
        events: () => ({
          data: {
            id: "event-1",
            pod_id: "pod-1",
            creator_membership_id: "membership-owner",
            starts_at: "2026-04-24T20:00:00.000Z",
            ends_at: "2026-04-24T21:00:00.000Z",
            event_kind: "standard",
            is_cancelled: false,
          },
          error: null,
        }),
      },
      rpcHandler: (name, payload) => {
        rpcCalls.push({ name, payload });
        return { data: "event-1", error: null };
      },
    });

    await expect(
      updateEventForPod(adminClient as never, viewer, {
        eventId: "event-1",
        podId: "pod-1",
        title: "Updated carpool",
        notes: "New pickup time",
        location: "School",
        startsAt: "2026-04-24T22:00:00.000Z",
        eventKind: "standard",
        reminderOffsetMinutes: 30,
      }),
    ).resolves.toBe("event-1");

    expect(rpcCalls).toEqual([
      {
        name: "mutate_pod_event_with_reminders",
        payload: {
          p_pod_id: "pod-1",
          p_event_id: "event-1",
          p_actor_user_id: viewer.userId,
          p_action: "update",
          p_title: "Updated carpool",
          p_notes: "New pickup time",
          p_location: "School",
          p_starts_at: "2026-04-24T22:00:00.000Z",
          p_event_kind: "standard",
          p_reminder_offset_minutes: 30,
        },
      },
    ]);
  });

  it("rejects updates to cancelled events without rescheduling reminders", async () => {
    const deliveryUpserts: Array<{ payload: unknown; options: unknown }> = [];

    const adminClient = createAdminClient({
      selectHandlers: {
        notification_deliveries: () => {
          throw new Error("Rejected edits must not access reminder deliveries.");
        },
      },
      maybeSingleHandlers: {
        pod_memberships: () => ({
          data: {
            id: "membership-owner",
            pod_id: "pod-1",
            user_id: "user-1",
            role: "owner",
          },
          error: null,
        }),
        events: () => ({
          data: {
            id: "event-cancelled",
            pod_id: "pod-1",
            creator_membership_id: "membership-owner",
            starts_at: "2026-04-24T20:00:00.000Z",
            ends_at: "2026-04-24T21:00:00.000Z",
            event_kind: "standard",
            is_cancelled: true,
          },
          error: null,
        }),
      },
      upsertHandlers: {
        notification_deliveries: (payload, options) => {
          deliveryUpserts.push({ payload, options });
          return { error: null };
        },
      },
    });

    await expect(
      updateEventForPod(adminClient as never, viewer, {
        eventId: "event-cancelled",
        podId: "pod-1",
        title: "Should not update",
        notes: "",
        location: "",
        startsAt: "2026-04-24T22:00:00.000Z",
        eventKind: "standard",
        reminderOffsetMinutes: 30,
      }),
    ).rejects.toMatchObject({
      message: "Cancelled events cannot be edited.",
      status: 409,
    });

    expect(deliveryUpserts).toEqual([]);
  });

  it("rolls back the created event if reminder persistence fails", async () => {
    const deletedEventIds: string[] = [];

    const adminClient = createAdminClient({
      maybeSingleHandlers: {
        pod_memberships: () => ({
          data: {
            id: "membership-owner",
            pod_id: "pod-1",
            user_id: "user-1",
            role: "owner",
          },
          error: null,
        }),
        pods: () => ({
          data: { timezone: "America/New_York" },
          error: null,
        }),
      },
      singleHandlers: {
        events: () => ({
          data: { id: "event-rollback" },
          error: null,
        }),
      },
      upsertHandlers: {
        event_reminders: () => ({
          error: { message: "write failed" },
        }),
      },
      commandHandlers: {
        "events:delete": (state) => {
          const idFilter = state.filters.find((filter) => filter.field === "id");
          if (typeof idFilter?.value === "string") {
            deletedEventIds.push(idFilter.value);
          }

          return { data: null, error: null };
        },
      },
    });

    await expect(
      createEventForPod(adminClient as never, viewer, {
        podId: "pod-1",
        title: "Rollback",
        notes: "",
        location: "",
        startsAt: "2026-04-24T21:00:00.000Z",
        eventKind: "standard",
        reminderOffsetMinutes: 120,
      }),
    ).rejects.toMatchObject({
      message: "Unable to update reminder timing right now.",
      status: 500,
    });

    expect(deletedEventIds).toEqual(["event-rollback"]);
  });

  it("blocks cancelling events the viewer cannot edit", async () => {
    const adminClient = createAdminClient({
      maybeSingleHandlers: {
        pod_memberships: () => ({
          data: {
            id: "membership-member",
            pod_id: "pod-1",
            user_id: "user-1",
            role: "member",
          },
          error: null,
        }),
        events: () => ({
          data: {
            id: "event-2",
            pod_id: "pod-1",
            creator_membership_id: "membership-owner",
            starts_at: "2026-04-24T21:00:00.000Z",
            ends_at: "2026-04-24T22:00:00.000Z",
            event_kind: "standard",
            is_cancelled: false,
          },
          error: null,
        }),
      },
    });

    await expect(
      cancelEventForPod(adminClient as never, viewer, {
        podId: "pod-1",
        eventId: "event-2",
      }),
    ).rejects.toMatchObject({
      message: "You do not have permission to cancel that event.",
      status: 403,
    });
  });

  it("cancels an event and suppresses pending reminder deliveries", async () => {
    const rpcCalls: Array<{ name: string; payload: unknown }> = [];

    const adminClient = createAdminClient({
      maybeSingleHandlers: {
        pod_memberships: () => ({
          data: {
            id: "membership-owner",
            pod_id: "pod-1",
            user_id: "user-1",
            role: "owner",
          },
          error: null,
        }),
        events: () => ({
          data: {
            id: "event-1",
            pod_id: "pod-1",
            creator_membership_id: "membership-owner",
            starts_at: "2026-04-24T20:00:00.000Z",
            ends_at: "2026-04-24T21:00:00.000Z",
            event_kind: "standard",
            is_cancelled: false,
          },
          error: null,
        }),
      },
      rpcHandler: (name, payload) => {
        rpcCalls.push({ name, payload });
        return { data: "event-1", error: null };
      },
    });

    await expect(
      cancelEventForPod(adminClient as never, viewer, {
        podId: "pod-1",
        eventId: "event-1",
      }),
    ).resolves.toBe("event-1");

    expect(rpcCalls).toEqual([{
      name: "mutate_pod_event_with_reminders",
      payload: {
        p_pod_id: "pod-1",
        p_event_id: "event-1",
        p_actor_user_id: viewer.userId,
        p_action: "cancel",
      },
    }]);
  });

  it.each([
    ["update", "XX000", 500, "Unable to update that event right now."],
    ["cancel", "XX000", 500, "Unable to cancel that event right now."],
    ["update", "PT409", 409, "Cancelled events cannot be edited."],
    ["update", "PT403", 403, "You do not have permission to edit that event."],
    ["cancel", "PT404", 404, "That event could not be found."],
    ["update", "PT400", 400, "Enter valid event details before saving."],
  ] as const)("maps %s RPC error %s to status %s", async (action, code, status, message) => {
    const adminClient = createAdminClient({
      maybeSingleHandlers: {
        pod_memberships: () => ({ data: {
          id: "membership-owner", pod_id: "pod-1", user_id: viewer.userId, role: "owner",
        }, error: null }),
        events: () => ({ data: {
          id: "event-1", pod_id: "pod-1", creator_membership_id: "membership-owner",
          starts_at: "2026-04-24T20:00:00.000Z", ends_at: "2026-04-24T21:00:00.000Z",
          event_kind: "standard", is_cancelled: false,
        }, error: null }),
      },
      rpcHandler: () => ({ error: { code, message: "Internal database details" } }),
    });
    const input = {
      podId: "pod-1", eventId: "event-1", title: "Updated", notes: "",
      startsAt: "2026-04-24T22:00:00.000Z", eventKind: "standard" as const,
      reminderOffsetMinutes: 30 as const,
    };
    await expect(action === "update"
      ? updateEventForPod(adminClient as never, viewer, input)
      : cancelEventForPod(adminClient as never, viewer, input)
    ).rejects.toMatchObject({ status, message });
  });
});
