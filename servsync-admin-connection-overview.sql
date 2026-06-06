-- ServSync admin connection oversight.
-- Run this in the ServSync Supabase SQL Editor.
--
-- This gives ServSync admins a safe relationship-health view without exposing:
-- - homeowner names
-- - homeowner email/phone
-- - addresses
-- - home details

create or replace function public.servsync_admin_connection_overview()
returns table (
  connection_id uuid,
  contractor_id uuid,
  contractor_name text,
  status text,
  source text,
  event_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    cp.id,
    cp.business_name,
    c.status,
    c.source,
    count(a.id) as event_count,
    c.created_at,
    c.updated_at
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.connection_audit_events a on a.connection_id = c.id
  where public.current_user_is_platform_admin()
  group by c.id, cp.id, cp.business_name, c.status, c.source, c.created_at, c.updated_at
  order by c.updated_at desc;
$$;

grant execute on function public.servsync_admin_connection_overview() to authenticated;

notify pgrst, 'reload schema';
