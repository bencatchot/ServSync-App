-- ServSync contractor homeowner invite connection.
-- Paste this into Supabase SQL Editor before testing contractor homeowner invite links.
-- Safe to re-run.

create or replace function public.create_my_home_connection_from_invite(
  p_property_id uuid,
  p_organization_id uuid
)
returns public.home_contractor_connections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.home_contractor_connections;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to connect a contractor.';
  end if;

  if not public.current_user_owns_property(p_property_id) then
    raise exception 'You can only connect contractors to a home you own.';
  end if;

  if not exists (
    select 1
      from public.organizations o
     where o.id = p_organization_id
       and o.account_status = 'active'
       and o.slug <> 'servsync-homeowners'
  ) then
    raise exception 'Contractor account is not available.';
  end if;

  insert into public.home_contractor_connections (
    property_id,
    homeowner_user_id,
    organization_id,
    status,
    source,
    permissions,
    created_by_user_id,
    approved_at
  ) values (
    p_property_id,
    auth.uid(),
    p_organization_id,
    'active',
    'contractor_invite',
    jsonb_build_object(
      'basic_profile', true,
      'property_details', false,
      'vendors', false,
      'maintenance', false,
      'service_requests', false,
      'reports', false,
      'photos', false,
      'appointments', false,
      'invoices', false
    ),
    auth.uid(),
    now()
  )
  on conflict (property_id, organization_id) do update
  set homeowner_user_id = excluded.homeowner_user_id,
      status = case
        when public.home_contractor_connections.status = 'revoked' then 'active'
        when public.home_contractor_connections.status = 'declined' then 'active'
        else public.home_contractor_connections.status
      end,
      updated_at = now(),
      approved_at = coalesce(public.home_contractor_connections.approved_at, now()),
      revoked_at = null
  returning * into v_connection;

  insert into public.property_access_audit_events (
    actor_user_id,
    property_id,
    organization_id,
    event_type,
    metadata
  ) values (
    auth.uid(),
    p_property_id,
    p_organization_id,
    'connection_created_from_invite',
    jsonb_build_object('source', 'contractor_invite')
  );

  return v_connection;
end;
$$;

grant execute on function public.create_my_home_connection_from_invite(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
