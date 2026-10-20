-- One RPC transaction keeps an event and its reminder deliveries consistent.
begin;

create or replace function public.mutate_pod_event_with_reminders(
  p_pod_id uuid,
  p_event_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_title text default null,
  p_notes text default '',
  p_location text default null,
  p_starts_at timestamptz default null,
  p_event_kind public.event_kind default 'standard',
  p_reminder_offset_minutes integer default 15
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor public.pod_memberships%rowtype;
  target public.events%rowtype;
  event_duration interval;
  v_scheduled_for timestamptz;
  scheduled_key text;
begin
  if p_action is null or p_action not in ('update', 'cancel') then
    raise sqlstate 'PT400' using message = 'Invalid event action.';
  end if;

  select * into actor
  from public.pod_memberships
  where pod_id = p_pod_id and user_id = p_actor_user_id
  for share;

  if not found then
    raise sqlstate 'PT403' using message = 'You do not have access to manage events in this pod.';
  end if;

  -- Serialize concurrent edits/cancellations and recheck permissions/state here.
  select * into target
  from public.events
  where id = p_event_id and pod_id = p_pod_id
  for update;

  if not found then
    raise sqlstate 'PT404' using message = 'That event could not be found.';
  end if;

  if target.event_kind = 'birthday'
    or not (actor.role in ('owner', 'adult')
      or target.creator_membership_id is not distinct from actor.id) then
    raise sqlstate 'PT403' using message = 'You do not have permission to manage that event.';
  end if;

  if p_action = 'cancel' then
    update public.events set is_cancelled = true where id = target.id;
    update public.notification_deliveries
    set status = 'cancelled'
    where event_id = target.id and status = 'pending';
    return target.id;
  end if;

  -- Rejected edits never attempt delivery cleanup; cancellation owns that work.
  if target.is_cancelled then
    raise sqlstate 'PT409' using message = 'Cancelled events cannot be edited.';
  end if;

  if p_title is null or length(btrim(p_title)) not between 1 and 120
    or p_starts_at is null or not isfinite(p_starts_at)
    or p_event_kind is null or p_event_kind not in ('standard', 'quick_plan')
    or p_reminder_offset_minutes is null
    or p_reminder_offset_minutes not in (15, 30, 60, 120, 1440)
    or length(coalesce(p_notes, '')) > 2000
    or length(coalesce(p_location, '')) > 200 then
    raise sqlstate 'PT400' using message = 'Enter valid event details before saving.';
  end if;

  event_duration := target.ends_at - target.starts_at;
  if event_duration <= interval '0 seconds' then
    event_duration := interval '1 hour';
  end if;

  update public.events
  set title = btrim(p_title),
      notes = btrim(coalesce(p_notes, '')),
      location = coalesce(nullif(btrim(p_location), ''),
        case when p_event_kind = 'quick_plan' then 'Shared family alert' else 'TBD' end),
      starts_at = p_starts_at,
      ends_at = p_starts_at + event_duration,
      event_kind = p_event_kind
  where id = target.id;

  insert into public.event_reminders (event_id, offset_minutes)
  values (target.id, p_reminder_offset_minutes::text)
  on conflict (event_id) do update set offset_minutes = excluded.offset_minutes;

  v_scheduled_for := p_starts_at - make_interval(mins => p_reminder_offset_minutes);
  -- Match the UTC ISO timestamp used by createDeliveryDedupeKey in TypeScript.
  scheduled_key := to_char(v_scheduled_for at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  update public.notification_deliveries as delivery
  set status = 'cancelled'
  where delivery.event_id = target.id and delivery.status = 'pending'
    and (v_scheduled_for <= statement_timestamp() or not exists (
      select 1 from public.notification_channels as channel
      join public.pod_memberships as membership on membership.id = channel.membership_id
      where membership.pod_id = target.pod_id and channel.enabled
        and channel.membership_id = delivery.membership_id
        and channel.channel = delivery.channel
        and delivery.dedupe_key = target.id::text || ':' || membership.id::text
          || ':' || channel.channel::text || ':' || scheduled_key
    ));

  if v_scheduled_for > statement_timestamp() then
    insert into public.notification_deliveries as delivery
      (membership_id, event_id, channel, scheduled_for, status, dedupe_key)
    select membership.id, target.id, channel.channel, v_scheduled_for, 'pending',
      target.id::text || ':' || membership.id::text || ':' || channel.channel::text || ':' || scheduled_key
    from public.notification_channels as channel
    join public.pod_memberships as membership on membership.id = channel.membership_id
    where membership.pod_id = target.pod_id and channel.enabled
    on conflict (dedupe_key) do update set status = 'pending', sent_at = null
      where delivery.status = 'cancelled';
  end if;

  return target.id;
end;
$$;

-- Only authenticated server code may supply an actor; browser roles cannot call this RPC.
revoke all on function public.mutate_pod_event_with_reminders(
  uuid, uuid, uuid, text, text, text, text, timestamptz, public.event_kind, integer
) from public, anon, authenticated;
grant execute on function public.mutate_pod_event_with_reminders(
  uuid, uuid, uuid, text, text, text, text, timestamptz, public.event_kind, integer
) to service_role;

commit;
