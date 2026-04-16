create extension if not exists "pgcrypto";

create type pod_role as enum ('owner', 'adult', 'member');
create type event_kind as enum ('standard', 'quick_plan', 'birthday');
create type notification_channel as enum ('push', 'email');
create type delivery_status as enum ('pending', 'sent', 'failed', 'acknowledged');

create table if not exists pods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists pod_memberships (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  user_id uuid not null,
  role pod_role not null,
  joined_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  display_name text not null,
  email text not null,
  relationship_label text not null default 'Member',
  birthday text,
  mailing_address text,
  avatar_color text not null default 'bg-sky-500'
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  email text not null,
  role pod_role not null default 'member',
  token text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  creator_membership_id uuid references pod_memberships(id) on delete set null,
  title text not null,
  notes text not null default '',
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  event_kind event_kind not null default 'standard',
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists event_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  membership_id uuid not null references pod_memberships(id) on delete cascade
);

create table if not exists event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  offset_minutes text not null
);

create table if not exists notification_channels (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references pod_memberships(id) on delete cascade,
  channel notification_channel not null,
  enabled boolean not null default true,
  endpoint text,
  unique (membership_id, channel)
);

create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references pod_memberships(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  channel notification_channel not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status delivery_status not null default 'pending',
  dedupe_key text not null unique
);

alter table pods enable row level security;
alter table pod_memberships enable row level security;
alter table profiles enable row level security;
alter table invites enable row level security;
alter table events enable row level security;
alter table event_assignments enable row level security;
alter table event_reminders enable row level security;
alter table notification_channels enable row level security;
alter table notification_deliveries enable row level security;

create or replace function public.is_pod_member(target_pod uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from pod_memberships membership
    where membership.pod_id = target_pod
      and membership.user_id = auth.uid()
  );
$$;

create policy "pod members can view pods"
on pods for select
using (public.is_pod_member(id));

create policy "pod members can view memberships"
on pod_memberships for select
using (public.is_pod_member(pod_id));

create policy "pod members can view invites"
on invites for select
using (public.is_pod_member(pod_id));

create policy "pod members can view events"
on events for select
using (public.is_pod_member(pod_id));

create policy "pod members can view assignments"
on event_assignments for select
using (
  exists (
    select 1
    from events
    where events.id = event_assignments.event_id
      and public.is_pod_member(events.pod_id)
  )
);

create policy "pod members can view reminders"
on event_reminders for select
using (
  exists (
    select 1
    from events
    where events.id = event_reminders.event_id
      and public.is_pod_member(events.pod_id)
  )
);

create policy "pod members can view notification channels"
on notification_channels for select
using (
  exists (
    select 1
    from pod_memberships membership
    where membership.id = notification_channels.membership_id
      and public.is_pod_member(membership.pod_id)
  )
);

create policy "pod members can view deliveries"
on notification_deliveries for select
using (
  exists (
    select 1
    from events
    where events.id = notification_deliveries.event_id
      and public.is_pod_member(events.pod_id)
  )
);
