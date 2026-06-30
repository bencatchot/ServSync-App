-- ServSync FB-030 Slice 1F-A shared home address visibility RPC foundation.
-- Adds a new additive RPC for role-based shared home address visibility.
-- This patch does not alter the existing shared-home shell RPC, broaden homes RLS,
-- change storage policies, or enable shared service/work/financial/document/message,
-- notification, contractor-connection, storage, or Home History access.

begin;

create or replace function public.servsync_list_my_shared_home_address_shells()
returns table (
  home_id uuid,
  display_label text,
  nickname text,
  city text,
  state text,
  role text,
  membership_status text,
  address_line1 text,
  address_line2 text,
  zip_code text
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
    hm.status as membership_status,
    case when hm.role in ('admin', 'member') then h.address_line1 else null end as address_line1,
    case when hm.role in ('admin', 'member') then h.address_line2 else null end as address_line2,
    case when hm.role in ('admin', 'member') then h.zip_code else null end as zip_code
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

comment on function public.servsync_list_my_shared_home_address_shells() is
  'FB-030 Slice 1F-A limited shared-home address shell RPC. Returns full address fields only for active admin/member household roles; viewers receive city/state only. Does not expose shared work records.';

revoke execute on function public.servsync_list_my_shared_home_address_shells() from public;
revoke execute on function public.servsync_list_my_shared_home_address_shells() from anon;
grant execute on function public.servsync_list_my_shared_home_address_shells() to authenticated;

notify pgrst, 'reload schema';

commit;
