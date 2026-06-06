-- ServSync homeowner contractor connections RPCs.
-- Paste this into Supabase SQL Editor before testing Homeowner Portal > Connections.
-- Safe to re-run.

create or replace function public.get_my_home_connections(p_property_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', hcc.id,
        'property_id', hcc.property_id,
        'organization_id', hcc.organization_id,
        'status', hcc.status,
        'source', hcc.source,
        'permissions', hcc.permissions,
        'created_at', hcc.created_at,
        'updated_at', hcc.updated_at,
        'approved_at', hcc.approved_at,
        'revoked_at', hcc.revoked_at,
        'contractor', jsonb_build_object(
          'name', o.name,
          'support_email', o.support_email,
          'support_phone', o.support_phone,
          'website_url', o.website_url,
          'service_categories', coalesce(to_jsonb(o.service_categories), '[]'::jsonb),
          'service_zip_codes', coalesce(to_jsonb(o.service_zip_codes), '[]'::jsonb),
          'service_radius_miles', o.service_radius_miles,
          'license_number', o.license_number,
          'business_license_number', o.business_license_number,
          'insured', o.insured,
          'bonded', o.bonded,
          'years_in_business', o.years_in_business,
          'google_reviews_url', o.google_reviews_url,
          'testimonials_url', o.testimonials_url,
          'public_bio', o.public_bio
        )
      )
      order by hcc.created_at desc
    ),
    '[]'::jsonb
  )
  from public.home_contractor_connections hcc
  join public.organizations o on o.id = hcc.organization_id
  where hcc.property_id = p_property_id
    and hcc.homeowner_user_id = auth.uid()
    and hcc.status <> 'declined';
$$;

grant execute on function public.get_my_home_connections(uuid) to authenticated;

create or replace function public.update_my_home_connection(
  p_connection_id uuid,
  p_status text,
  p_permissions jsonb
)
returns public.home_contractor_connections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.home_contractor_connections;
  v_permissions jsonb;
begin
  select *
    into v_connection
    from public.home_contractor_connections
   where id = p_connection_id
     and homeowner_user_id = auth.uid();

  if v_connection.id is null then
    raise exception 'Connection not found.';
  end if;

  if p_status not in ('pending', 'active', 'declined', 'revoked') then
    raise exception 'Invalid connection status.';
  end if;

  v_permissions := jsonb_build_object(
    'basic_profile', true,
    'property_details', coalesce((p_permissions->>'property_details')::boolean, false),
    'vendors', coalesce((p_permissions->>'vendors')::boolean, false),
    'maintenance', coalesce((p_permissions->>'maintenance')::boolean, false),
    'service_requests', coalesce((p_permissions->>'service_requests')::boolean, false),
    'reports', coalesce((p_permissions->>'reports')::boolean, false),
    'photos', coalesce((p_permissions->>'photos')::boolean, false),
    'appointments', coalesce((p_permissions->>'appointments')::boolean, false),
    'invoices', coalesce((p_permissions->>'invoices')::boolean, false)
  );

  update public.home_contractor_connections
     set status = p_status,
         permissions = v_permissions,
         updated_at = now(),
         approved_at = case
           when p_status = 'active' and approved_at is null then now()
           else approved_at
         end,
         revoked_at = case
           when p_status = 'revoked' then now()
           else revoked_at
         end
   where id = p_connection_id
   returning * into v_connection;

  insert into public.property_access_audit_events (
    actor_user_id,
    property_id,
    organization_id,
    event_type,
    metadata
  ) values (
    auth.uid(),
    v_connection.property_id,
    v_connection.organization_id,
    case
      when p_status = 'revoked' then 'connection_revoked'
      when p_status = 'active' then 'connection_permissions_updated'
      else 'connection_status_updated'
    end,
    jsonb_build_object('status', p_status, 'permissions', v_permissions)
  );

  return v_connection;
end;
$$;

grant execute on function public.update_my_home_connection(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
