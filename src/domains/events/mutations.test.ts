import {
  cancelEventForPod,
  createEventForPod,
  updateEventForPod,
} from "@/domains/events/mutations";

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
  filters: Array<{ field: string; value: unknown }>;
}

function createAdminClient({
  selectHandlers = {},
  singleHandlers = {},
  maybeSingleHandlers = {},
  commandHandlers = {},
  upsertHandlers = {},
}: {
  selectHandlers?: Record<string, ScenarioHandler>;
  singleHandlers?: Record<string, ScenarioHandler>;
  maybeSingleHandlers?: Record<string, ScenarioHandler>;
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
          state.filters.push({ field, value });
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

describe("event mutations", () => {
  it("creates an event and upserts a single reminder rule", async () => {
    const reminderUpserts: Array<{ payload: unknown; options: unknown }> = [];

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
          data: { id: "event-1" },
          error: null,
        }),
      },
      upsertHandlers: {
        event_reminders: (payload, options) => {
          reminderUpserts.push({ payload, options });
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
});
