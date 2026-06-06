-- ServSync service request routing read/status RPCs.
-- Paste this into Supabase SQL Editor after supabase-service-request-routing.sql.
-- Safe to re-run.

create or replace function public.get_contractor_routed_requests()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'route_id', srr.id,
        'request_id', srr.request_id,
        'property_id', srr.property_id,
        'connection_id', srr.connection_id,
        'status', srr.status,
        'routed_at', srr.created_at,
        'updated_at', srr.updated_at,
        'request', jsonb_build_object(
          'customer_name', r.customer_name,
          'category', r.category,
          'room', r.room,
          'description', r.description,
          'priority', r.priority,
          'photo_url', coalesce(r.photo_url, ''),
          'request_status', r.status,
          'contractor_notes', r.contractor_notes,
          'created_at', r.created_at
        ),
        'property', jsonb_build_object(
          'name', p.name,
          'owner', case
            when coalesce((hcc.permissions->>'basic_profile')::boolean, false) then p.owner
            else ''
          end
        )
      )
      order by srr.created_at desc
    ),
    '[]'::jsonb
  )
  from public.service_request_routes srr
  join public.requests r on r.id = srr.request_id
  join public.properties p on p.id = srr.property_id
  join public.home_contractor_connections hcc on hcc.id = srr.connection_id
  where srr.organization_id = public.current_user_organization_id()
    and public.current_user_can_manage_organization(srr.organization_id)
    and hcc.status = 'active';
$$;

grant execute on function public.get_contractor_routed_requests() to authenticated;

create or replace function public.update_contractor_request_route_status(
  p_route_id uuid,
  p_status text
)
returns public.service_request_routes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route public.service_request_routes;
begin
  if p_status not in ('sent', 'viewed', 'responded', 'declined', 'closed') then
    raise exception 'Invalid request route status.';
  end if;

  update public.service_request_routes
     set status = p_status,
         updated_at = now()
   where id = p_route_id
     and organization_id = public.current_user_organization_id()
     and public.current_user_can_manage_organization(organization_id)
   returning * into v_route;

  if v_route.id is null then
    raise exception 'Request route not found.';
  end if;

  insert into public.property_access_audit_events (
    actor_user_id,
    property_id,
    organization_id,
    event_type,
    metadata
  ) values (
    auth.uid(),
    v_route.property_id,
    v_route.organization_id,
    'service_request_route_status_updated',
    jsonb_build_object('request_id', v_route.request_id, 'route_id', v_route.id, 'status', p_status)
  );

  return v_route;
end;
$$;

grant execute on function public.update_contractor_request_route_status(uuid, text) to authenticated;

create or replace function public.get_my_request_routes(p_property_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'route_id', srr.id,
        'request_id', srr.request_id,
        'status', srr.status,
        'created_at', srr.created_at,
        'updated_at', srr.updated_at,
        'contractor', jsonb_build_object(
          'name', o.name,
          'support_email', o.support_email,
          'support_phone', o.support_phone
        )
      )
      order by srr.created_at desc
    ),
    '[]'::jsonb
  )
  from public.service_request_routes srr
  join public.organizations o on o.id = srr.organization_id
  where srr.property_id = p_property_id
    and public.current_user_owns_property(p_property_id);
$$;

grant execute on function public.get_my_request_routes(uuid) to authenticated;

notify pgrst, 'reload schema';
