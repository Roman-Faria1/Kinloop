create policy "pod members can view profiles"
on profiles for select
using (
  exists (
    select 1
    from pod_memberships membership
    where membership.user_id = profiles.user_id
      and public.is_pod_member(membership.pod_id)
  )
);
