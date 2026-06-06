-- ServSync homeowner-started contractor connection requests.
-- Paste this into Supabase SQL Editor after the clean foundation reset.

drop policy if exists "Connections: contractors update own requests" on public.homeowner_contractor_connections;

create policy "Connections: contractors update own requests"
  on public.homeowner_contractor_connections
  for update
  to authenticated
  using (public.current_user_owns_contractor(contractor_id))
  with check (public.current_user_owns_contractor(contractor_id));

grant select, insert, update, delete on public.homeowner_contractor_connections to authenticated;
grant select, insert on public.connection_audit_events to authenticated;

notify pgrst, 'reload schema';

select
  'homeowner connection request policy ready' as status,
  count(*) as pending_requests
from public.homeowner_contractor_connections
where status = 'pending';
