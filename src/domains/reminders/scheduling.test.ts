import { afterEach, vi } from "vitest";
import {
  cancelPendingEventReminderDeliveries,
  syncEventReminderDeliveries,
} from "@/domains/reminders/scheduling";

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
  commandHandlers = {},
  upsertHandlers = {},
}: {
  selectHandlers?: Record<string, ScenarioHandler>;
  commandHandlers?: Record<string, ScenarioHandler>;
  upsertHandlers?: Record<string, UpsertHandler>;
}) {
  return {
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
        update(payload: unknown) {
          state.action = "update";
          state.payload = payload;
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

afterEach(() => {
  vi.useRealTimers();
});

describe("reminder scheduling", () => {
  it("creates future deliveries and cancels obsolete pending deliveries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T12:00:00.000Z"));

    const updates: QueryState[] = [];
    const deliveryUpserts: Array<{ payload: unknown; options: unknown }> = [];

    const adminClient = createAdminClient({
      selectHandlers: {
        pod_memberships: () => ({
          data: [{ id: "membership-1" }, { id: "membership-2" }],
          error: null,
        }),
        notification_channels: () => ({
          data: [
            { membership_id: "membership-1", channel: "push" },
            { membership_id: "membership-2", channel: "email" },
          ],
          error: null,
        }),
        notification_deliveries: () => ({
          data: [{ id: "delivery-old", dedupe_key: "old-key" }],
          error: null,
        }),
      },
      commandHandlers: {
        "notification_deliveries:update": (state) => {
          updates.push(state);
          return { data: null, error: null };
        },
      },
      upsertHandlers: {
        notification_deliveries: (payload, options) => {
          deliveryUpserts.push({ payload, options });
          return { error: null };
        },
      },
    });

    const result = await syncEventReminderDeliveries(adminClient as never, {
      podId: "pod-1",
      eventId: "event-1",
      startsAt: "2026-04-24T21:00:00.000Z",
      reminderOffsetMinutes: 60,
    });

    expect(result).toEqual({ scheduledCount: 2 });
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ status: "cancelled" });
    expect(updates[0].filters).toContainEqual({
      field: "id",
      value: ["delivery-old"],
      operator: "in",
    });
    expect(deliveryUpserts).toEqual([
      {
        payload: [
          {
            membership_id: "membership-1",
            event_id: "event-1",
            channel: "push",
            scheduled_for: "2026-04-24T20:00:00.000Z",
            status: "pending",
            sent_at: null,
            dedupe_key: "event-1:membership-1:push:2026-04-24T20:00:00.000Z",
          },
          {
            membership_id: "membership-2",
            event_id: "event-1",
            channel: "email",
            scheduled_for: "2026-04-24T20:00:00.000Z",
            status: "pending",
            sent_at: null,
            dedupe_key: "event-1:membership-2:email:2026-04-24T20:00:00.000Z",
          },
        ],
        options: {
          onConflict: "dedupe_key",
          ignoreDuplicates: true,
        },
      },
    ]);
  });

  it("does not create deliveries for reminders already in the past", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T12:00:00.000Z"));

    const updates: QueryState[] = [];
    const adminClient = createAdminClient({
      selectHandlers: {
        notification_deliveries: () => ({
          data: [{ id: "delivery-pending", dedupe_key: "old-key" }],
          error: null,
        }),
      },
      commandHandlers: {
        "notification_deliveries:update": (state) => {
          updates.push(state);
          return { data: null, error: null };
        },
      },
      upsertHandlers: {
        notification_deliveries: () => {
          throw new Error("Past reminders should not be inserted.");
        },
      },
    });

    const result = await syncEventReminderDeliveries(adminClient as never, {
      podId: "pod-1",
      eventId: "event-1",
      startsAt: "2026-04-23T12:10:00.000Z",
      reminderOffsetMinutes: 15,
    });

    expect(result).toEqual({ scheduledCount: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ status: "cancelled" });
  });

  it("restores cancelled deliveries when an event moves back to the same reminder slot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T12:00:00.000Z"));

    const updates: QueryState[] = [];
    const deliveryUpserts: Array<{ payload: unknown; options: unknown }> = [];
    const desiredDedupeKey = "event-1:membership-1:push:2026-04-24T20:00:00.000Z";

    const adminClient = createAdminClient({
      selectHandlers: {
        pod_memberships: () => ({
          data: [{ id: "membership-1" }],
          error: null,
        }),
        notification_channels: () => ({
          data: [{ membership_id: "membership-1", channel: "push" }],
          error: null,
        }),
        notification_deliveries: (state) => {
          const dedupeFilter = state.filters.find(
            (filter) => filter.field === "dedupe_key",
          );

          if (dedupeFilter) {
            return {
              data: [
                {
                  id: "delivery-cancelled",
                  dedupe_key: desiredDedupeKey,
                  status: "cancelled",
                },
              ],
              error: null,
            };
          }

          return { data: [], error: null };
        },
      },
      commandHandlers: {
        "notification_deliveries:update": (state) => {
          updates.push(state);
          return { data: null, error: null };
        },
      },
      upsertHandlers: {
        notification_deliveries: (payload, options) => {
          deliveryUpserts.push({ payload, options });
          return { error: null };
        },
      },
    });

    const result = await syncEventReminderDeliveries(adminClient as never, {
      podId: "pod-1",
      eventId: "event-1",
      startsAt: "2026-04-24T21:00:00.000Z",
      reminderOffsetMinutes: 60,
    });

    expect(result).toEqual({ scheduledCount: 1 });
    expect(deliveryUpserts).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ status: "pending", sent_at: null });
    expect(updates[0].filters).toContainEqual({
      field: "dedupe_key",
      value: [desiredDedupeKey],
      operator: "in",
    });
    expect(updates[0].filters).toContainEqual({
      field: "status",
      value: "cancelled",
      operator: "eq",
    });
  });

  it("cancels all pending deliveries for an event", async () => {
    const updates: QueryState[] = [];
    const adminClient = createAdminClient({
      selectHandlers: {
        notification_deliveries: () => ({
          data: [
            { id: "delivery-1", dedupe_key: "key-1" },
            { id: "delivery-2", dedupe_key: "key-2" },
          ],
          error: null,
        }),
      },
      commandHandlers: {
        "notification_deliveries:update": (state) => {
          updates.push(state);
          return { data: null, error: null };
        },
      },
    });

    await cancelPendingEventReminderDeliveries(adminClient as never, "event-1");

    expect(updates).toHaveLength(1);
    expect(updates[0].filters).toContainEqual({
      field: "id",
      value: ["delivery-1", "delivery-2"],
      operator: "in",
    });
  });
});
