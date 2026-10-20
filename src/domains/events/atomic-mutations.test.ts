import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { createDeliveryDedupeKey } from "@/domains/reminders/service";

const podId = "10000000-0000-0000-0000-000000000001";
const otherPodId = "10000000-0000-0000-0000-000000000002";
const ownerId = "20000000-0000-0000-0000-000000000001";
const memberId = "20000000-0000-0000-0000-000000000002";
const outsiderId = "20000000-0000-0000-0000-000000000003";
const membershipId = "30000000-0000-0000-0000-000000000001";
const eventId = "40000000-0000-0000-0000-000000000001";
const originalStartsAt = "2099-04-24T20:00:00.000Z";
const updatedStartsAt = "2099-04-25T22:00:00.000Z";
const originalKey = createDeliveryDedupeKey({
  eventId, membershipId, channel: "email", scheduledFor: "2099-04-24T19:00:00.000Z",
});
const updatedKey = createDeliveryDedupeKey({
  eventId, membershipId, channel: "email", scheduledFor: "2099-04-25T21:30:00.000Z",
});

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  // Reproduce Supabase roles/auth helper; these tests never connect to a real project.
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  for (const name of [
    "0000_famplan_initial.sql", "0001_profile_visibility.sql", "0002_auth_rate_limits.sql",
    "0003_pod_membership_uniqueness.sql", "0004_event_reminder_uniqueness.sql",
    "0005_delivery_status_cancelled.sql", "0006_atomic_event_mutations.sql",
  ]) {
    const sql = await readFile(resolve("supabase/migrations", name), "utf8");
    // gen_random_uuid is built into PostgreSQL; the pgcrypto extension is unused here.
    await db.exec(sql.replace('create extension if not exists "pgcrypto";', ""));
  }
  await db.exec(`
    grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;
    create function public.fail_test_reminder_write() returns trigger language plpgsql as $$
    begin
      if (current_setting('kinloop.test_failure', true) = 'rule' and TG_TABLE_NAME = 'event_reminders')
        or (current_setting('kinloop.test_failure', true) = 'schedule'
          and TG_TABLE_NAME = 'notification_deliveries' and TG_OP = 'INSERT')
        or (current_setting('kinloop.test_failure', true) = 'suppress'
          and TG_TABLE_NAME = 'notification_deliveries' and TG_OP = 'UPDATE') then
        raise exception 'Injected reminder write failure';
      end if;
      return new;
    end;
    $$;
    create trigger fail_test_rule before insert or update on public.event_reminders
      for each row execute function public.fail_test_reminder_write();
    create trigger fail_test_delivery before insert or update on public.notification_deliveries
      for each row execute function public.fail_test_reminder_write();
  `);
}, 30000);

afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec("reset role; select set_config('kinloop.test_failure', '', false); truncate public.pods cascade;");
  await db.query("insert into public.pods (id, name, timezone) values ($1, 'Family', 'UTC'), ($2, 'Other', 'UTC')", [podId, otherPodId]);
  await db.query(`insert into public.pod_memberships (id, pod_id, user_id, role) values
    ($1, $2, $3, 'owner'), (gen_random_uuid(), $2, $4, 'member'), (gen_random_uuid(), $5, $3, 'owner')`,
  [membershipId, podId, ownerId, memberId, otherPodId]);
  await db.query(`insert into public.events
    (id, pod_id, creator_membership_id, title, starts_at, ends_at, timezone)
    values ($1, $2, $3, 'Original', $4::timestamptz, $4::timestamptz + interval '90 minutes', 'UTC')`,
  [eventId, podId, membershipId, originalStartsAt]);
  await db.query("insert into public.event_reminders (event_id, offset_minutes) values ($1, '60')", [eventId]);
  await db.query("insert into public.notification_channels (membership_id, channel) values ($1, 'email')", [membershipId]);
  await db.query(`insert into public.notification_deliveries
    (membership_id, event_id, channel, scheduled_for, dedupe_key)
    values ($1, $2, 'email', '2099-04-24T19:00:00Z', $3)`, [membershipId, eventId, originalKey]);
});

async function mutate(action: "update" | "cancel", options: {
  userId?: string; pod?: string; startsAt?: string; offset?: number;
} = {}) {
  await db.exec("set role service_role");
  try {
    return await db.query<{ id: string }>(`select public.mutate_pod_event_with_reminders(
      p_pod_id => $1, p_event_id => $2, p_actor_user_id => $3, p_action => $4,
      p_title => 'Updated', p_notes => 'New details', p_location => 'School',
      p_starts_at => $5, p_event_kind => 'standard', p_reminder_offset_minutes => $6
    ) as id`, [options.pod ?? podId, eventId, options.userId ?? ownerId, action,
      options.startsAt ?? updatedStartsAt, options.offset ?? 30]);
  } finally {
    await db.exec("reset role");
  }
}

async function snapshot() {
  return (await db.query(`select
    (select row_to_json(event) from public.events as event where id = $1) as event,
    (select json_agg(rule order by id) from public.event_reminders as rule where event_id = $1) as rules,
    (select json_agg(delivery order by dedupe_key) from public.notification_deliveries as delivery where event_id = $1) as deliveries`,
  [eventId])).rows;
}

describe("atomic event mutations in PostgreSQL", () => {
  it("updates the event, rule, and deliveries together and preserves event duration", async () => {
    expect((await mutate("update")).rows).toEqual([{ id: eventId }]);
    const { rows } = await db.query<{ title: string; minutes: number; offset_minutes: string }>(`
      select event.title, extract(epoch from event.ends_at - event.starts_at)::integer / 60 as minutes, rule.offset_minutes
      from public.events as event join public.event_reminders as rule on rule.event_id = event.id`);
    expect(rows).toEqual([{ title: "Updated", minutes: 90, offset_minutes: "30" }]);
    const deliveries = await db.query("select dedupe_key, status from public.notification_deliveries order by dedupe_key");
    expect(deliveries.rows).toEqual([
      { dedupe_key: originalKey, status: "cancelled" },
      { dedupe_key: updatedKey, status: "pending" },
    ]);
  });

  it.each(["rule", "suppress", "schedule"])("rolls back the entire update when %s persistence fails", async (failure) => {
    const before = await snapshot();
    await db.query("select set_config('kinloop.test_failure', $1, false)", [failure]);
    await expect(mutate("update")).rejects.toThrow("Injected reminder write failure");
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back event cancellation when pending delivery suppression fails", async () => {
    const before = await snapshot();
    await db.exec("select set_config('kinloop.test_failure', 'suppress', false)");
    await expect(mutate("cancel")).rejects.toThrow("Injected reminder write failure");
    expect(await snapshot()).toEqual(before);
  });

  it("cancels pending work and allows repeated cancellation", async () => {
    await mutate("cancel");
    const after = await snapshot();
    await mutate("cancel");
    expect(await snapshot()).toEqual(after);
    expect((await db.query("select is_cancelled from public.events")).rows).toEqual([{ is_cancelled: true }]);
    expect((await db.query("select status from public.notification_deliveries")).rows).toEqual([{ status: "cancelled" }]);
  });

  it("rejects cancelled-event edits with a deterministic conflict without delivery cleanup", async () => {
    await mutate("cancel");
    // Simulate stale pending work: editing must still reject without attempting cleanup.
    await db.exec("update public.notification_deliveries set status = 'pending'");
    const before = await snapshot();
    await db.exec("select set_config('kinloop.test_failure', 'suppress', false)");
    await expect(mutate("update")).rejects.toMatchObject({ code: "PT409" });
    expect(await snapshot()).toEqual(before);
  });

  it("restores a previous schedule without duplicate rows when moved back", async () => {
    await mutate("update");
    await mutate("update", { startsAt: originalStartsAt, offset: 60 });
    await mutate("update", { startsAt: originalStartsAt, offset: 60 });
    expect((await db.query("select dedupe_key, status from public.notification_deliveries order by dedupe_key")).rows).toEqual([
      { dedupe_key: originalKey, status: "pending" },
      { dedupe_key: updatedKey, status: "cancelled" },
    ]);
  });

  it.each(["sent", "acknowledged", "failed"])("does not reset a %s delivery", async (status) => {
    await db.query("update public.notification_deliveries set status = $1::public.delivery_status, sent_at = now()", [status]);
    const before = (await db.query("select * from public.notification_deliveries")).rows;
    await mutate("update", { startsAt: originalStartsAt, offset: 60 });
    expect((await db.query("select * from public.notification_deliveries")).rows).toEqual(before);
    await mutate("cancel");
    expect((await db.query("select * from public.notification_deliveries")).rows).toEqual(before);
  });

  it("suppresses old deliveries without inserting new work for a past due time", async () => {
    await mutate("update", { startsAt: "2000-01-01T12:00:00.000Z" });
    expect((await db.query("select status from public.notification_deliveries")).rows).toEqual([{ status: "cancelled" }]);
  });

  it("does not schedule disabled or other-pod channels", async () => {
    await db.exec("update public.notification_channels set enabled = false");
    await db.query(`insert into public.notification_channels (membership_id, channel)
      select id, 'email' from public.pod_memberships where pod_id = $1`, [otherPodId]);
    await mutate("update");
    expect((await db.query("select status from public.notification_deliveries")).rows).toEqual([{ status: "cancelled" }]);
  });

  it.each(["update", "cancel"] as const)("denies unauthorized %s inside the transaction", async (action) => {
    const before = await snapshot();
    await expect(mutate(action, { userId: outsiderId })).rejects.toMatchObject({ code: "PT403" });
    await expect(mutate(action, { userId: memberId })).rejects.toMatchObject({ code: "PT403" });
    expect(await snapshot()).toEqual(before);
  });

  it("allows a member to edit their own event", async () => {
    await db.query(`update public.events set creator_membership_id =
      (select id from public.pod_memberships where user_id = $1 and pod_id = $2)`, [memberId, podId]);
    await expect(mutate("update", { userId: memberId })).resolves.toMatchObject({ rows: [{ id: eventId }] });
  });

  it("rejects birthday edits and cross-pod event IDs inside the transaction", async () => {
    await expect(mutate("update", { pod: otherPodId })).rejects.toMatchObject({ code: "PT404" });
    await db.exec("update public.events set event_kind = 'birthday'");
    await expect(mutate("update")).rejects.toMatchObject({ code: "PT403" });
    await expect(mutate("cancel")).rejects.toMatchObject({ code: "PT403" });
  });

  it("validates reminder offsets before making any writes", async () => {
    const before = await snapshot();
    await expect(mutate("update", { offset: 5 })).rejects.toMatchObject({ code: "PT400" });
    expect(await snapshot()).toEqual(before);
  });

  it.each(["anon", "authenticated"])("does not allow the %s role to invoke the privileged RPC", async (role) => {
    const permission = await db.query<{ allowed: boolean }>(`select has_function_privilege(
      $1::name, 'public.mutate_pod_event_with_reminders(uuid,uuid,uuid,text,text,text,text,timestamptz,public.event_kind,integer)',
      'EXECUTE') as allowed`, [role]);
    expect(permission.rows).toEqual([{ allowed: false }]);
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query(`select public.mutate_pod_event_with_reminders($1, $2, $3, 'cancel')`,
        [podId, eventId, ownerId])).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("reset role");
    }
  });
});
