-- ServSync homeowner preferred contractor connections.
-- Paste this into Supabase SQL Editor before testing Homeowner Portal > Connections > Make Preferred.
-- Safe to re-run.

alter table public.home_contractor_connections
  add column if not exists is_preferred boolean not null default false;

create or replace function public.set_my_home_connection_preferred(
  p_connection_id uuid,
  p_is_preferred boolean
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
    raise exception 'You must be signed in to update a preferred contractor.';
  end if;

  update public.home_contractor_connections
     set is_preferred = coalesce(p_is_preferred, false),
         updated_at = now()
   where id = p_connection_id
     and homeowner_user_id = auth.uid()
   returning * into v_connection;

  if v_connection.id is null then
    raise exception 'Connection not found.';
  end if;

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
    'connection_preferred_updated',
    jsonb_build_object('is_preferred', v_connection.is_preferred)
  );

  return v_connection;
end;
$$;

grant execute on function public.set_my_home_connection_preferred(uuid, boolean) to authenticated;

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
        'is_preferred', hcc.is_preferred,
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
      order by hcc.is_preferred desc, hcc.created_at desc
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

create or replace function public.get_contractor_connected_homes()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'connection_id', hcc.id,
        'property_id', hcc.property_id,
        'homeowner_user_id', hcc.homeowner_user_id,
        'status', hcc.status,
        'source', hcc.source,
        'is_preferred', hcc.is_preferred,
        'permissions', hcc.permissions,
        'created_at', hcc.created_at,
        'updated_at', hcc.updated_at,
        'property', jsonb_build_object(
          'name', p.name,
          'address', case
            when coalesce((hcc.permissions->>'property_details')::boolean, false) then p.address
            else ''
          end,
          'owner', case
            when coalesce((hcc.permissions->>'basic_profile')::boolean, false) then p.owner
            else ''
          end,
          'phone', case
            when coalesce((hcc.permissions->>'basic_profile')::boolean, false) then p.phone
            else ''
          end,
          'email', case
            when coalesce((hcc.permissions->>'basic_profile')::boolean, false) then p.email
            else ''
          end,
          'plan', p.plan,
          'home_sqft', case
            when coalesce((hcc.permissions->>'property_details')::boolean, false) then p.home_sqft
            else ''
          end,
          'home_year_built', case
            when coalesce((hcc.permissions->>'property_details')::boolean, false) then p.home_year_built
            else ''
          end,
          'home_hvac_type', case
            when coalesce((hcc.permissions->>'property_details')::boolean, false) then p.home_hvac_type
            else ''
          end,
          'home_roof_type', case
            when coalesce((hcc.permissions->>'property_details')::boolean, false) then p.home_roof_type
            else ''
          end
        )
      )
      order by hcc.is_preferred desc, hcc.created_at desc
    ),
    '[]'::jsonb
  )
  from public.home_contractor_connections hcc
  join public.properties p on p.id = hcc.property_id
  where hcc.organization_id = public.current_user_organization_id()
    and hcc.status = 'active'
    and public.current_user_can_manage_organization(hcc.organization_id);
$$;

grant execute on function public.get_contractor_connected_homes() to authenticated;

notify pgrst, 'reload schema';
