-- ServSync FB-030 Slice 1G-A shared home reminders shell RPC foundation.
-- Adds a limited read-only RPC for accepted household members to see safe open
-- reminder shell fields for homes shared with them.
-- This patch does not broaden direct home_reminders RLS, storage policies, or
-- shared access to service requests, estimates, invoices, jobs, documents,
-- messages, notifications, storage, contractor connections, or Home History.

begin;

create or replace function public.servsync_list_my_shared_home_reminder_shells()
returns table (
  reminder_id uuid,
  home_id uuid,
  home_display_label text,
  title text,
  due_on date,
  status text,
  is_overdue boolean,
  role text,
  membership_status text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id as reminder_id,
    h.id as home_id,
    coalesce(
      nullif(btrim(h.nickname), ''),
      nullif(btrim(concat_ws(', ', nullif(h.city, ''), nullif(h.state, ''))), ''),
      'Shared home'
    ) as home_display_label,
    r.title,
    r.due_on,
    r.status,
    (r.due_on < current_date) as is_overdue,
    hm.role,
    hm.status as membership_status
  from public.home_memberships hm
  join public.homes h
    on h.id = hm.home_id
  join public.home_reminders r
    on r.home_id = hm.home_id
  where hm.user_id = auth.uid()
    and hm.status = 'active'
    and hm.role in ('admin', 'member', 'viewer')
    and h.homeowner_user_id is distinct from auth.uid()
    and r.status = 'open'
  order by
    r.due_on asc nulls last,
    lower(r.title),
    r.id;
$$;

comment on function public.servsync_list_my_shared_home_reminder_shells() is
  'FB-030 Slice 1G-A limited shared-home reminder shell RPC. Returns active open reminder titles/due dates/status only for accepted shared home roles; no notes, linked record IDs, storage, messages, or work records.';

revoke execute on function public.servsync_list_my_shared_home_reminder_shells() from public;
revoke execute on function public.servsync_list_my_shared_home_reminder_shells() from anon;
grant execute on function public.servsync_list_my_shared_home_reminder_shells() to authenticated;

notify pgrst, 'reload schema';

commit;
