-- ServSync contextual connection shared-property contractor RLS fix.
-- Run after servsync-connection-shared-properties.sql.

begin;

-- The contractor SELECT policy on connection_shared_properties cannot join
-- public.homes directly under the caller's RLS context because homes are
-- homeowner-owned. This helper performs the row-eligibility check as a
-- SECURITY DEFINER function without granting contractors direct homes access.
create or replace function public.current_user_can_read_connection_shared_property(
  p_connection_id uuid,
  p_home_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.homeowner_contractor_connections c
         join public.homes h on h.id = p_home_id
        where c.id = p_connection_id
          and c.status = 'active'
          and h.homeowner_user_id = c.homeowner_user_id
          and public.current_user_can_access_contractor(c.contractor_id)
     );
$$;

revoke execute on function public.current_user_can_read_connection_shared_property(uuid, uuid) from public;
revoke execute on function public.current_user_can_read_connection_shared_property(uuid, uuid) from anon;
grant execute on function public.current_user_can_read_connection_shared_property(uuid, uuid) to authenticated;

drop policy if exists "Shared properties: contractor reads active" on public.connection_shared_properties;
create policy "Shared properties: contractor reads active"
  on public.connection_shared_properties for select to authenticated
  using (
    public.current_user_can_read_connection_shared_property(
      connection_shared_properties.connection_id,
      connection_shared_properties.home_id
    )
  );

notify pgrst, 'reload schema';

commit;
