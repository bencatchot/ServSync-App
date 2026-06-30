-- ServSync FB-030 Slice 1E read-only shared home shell.
-- Adds a limited RPC for accepted household members to see safe shared-home shell fields.
-- This patch does not broaden existing homeowner RLS, storage policies, or shared access
-- to service requests, estimates, invoices, jobs, reminders, documents, messages,
-- notifications, storage, contractor connections, or Home History.

begin;

create or replace function public.servsync_list_my_shared_home_shells()
returns table (
  home_id uuid,
  display_label text,
  nickname text,
  city text,
  state text,
  role text,
  membership_status text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    h.id as home_id,
    coalesce(
      nullif(btrim(h.nickname), ''),
      nullif(btrim(concat_ws(', ', nullif(h.city, ''), nullif(h.state, ''))), ''),
      'Shared home'
    ) as display_label,
    h.nickname,
    h.city,
    h.state,
    hm.role,
    hm.status as membership_status
  from public.home_memberships hm
  join public.homes h on h.id = hm.home_id
  where hm.user_id = auth.uid()
    and hm.status = 'active'
    and hm.role in ('admin', 'member', 'viewer')
    and h.homeowner_user_id is distinct from auth.uid()
  order by
    coalesce(nullif(btrim(h.nickname), ''), nullif(btrim(h.city), ''), 'Shared home'),
    h.created_at,
    h.id;
$$;

comment on function public.servsync_list_my_shared_home_shells() is
  'FB-030 Slice 1E limited shared-home shell RPC. Returns safe home label/city/state/role fields only; no full address or shared work records.';

revoke execute on function public.servsync_list_my_shared_home_shells() from public;
revoke execute on function public.servsync_list_my_shared_home_shells() from anon;
grant execute on function public.servsync_list_my_shared_home_shells() to authenticated;

notify pgrst, 'reload schema';

commit;
