-- ServSync homeowner contractor directory.
-- Paste this into Supabase SQL Editor before testing Homeowner Portal > Connections > Find.
-- Safe to re-run.

create or replace function public.search_public_contractors(
  p_category text default '',
  p_zip text default ''
)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
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
      order by o.name
    ),
    '[]'::jsonb
  )
  from public.organizations o
  where coalesce(o.account_status, 'active') = 'active'
    and coalesce(o.subscription_status, 'active') in ('trialing', 'active')
    and o.slug <> 'servsync-homeowners'
    and (
      coalesce(nullif(trim(p_category), ''), '') = ''
      or exists (
        select 1
          from unnest(coalesce(o.service_categories, '{}')) c
         where lower(c) = lower(trim(p_category))
      )
    )
    and (
      coalesce(nullif(regexp_replace(p_zip, '\D', '', 'g'), ''), '') = ''
      or regexp_replace(p_zip, '\D', '', 'g') = any(coalesce(o.service_zip_codes, '{}'))
    );
$$;

grant execute on function public.search_public_contractors(text, text) to authenticated;

create or replace function public.connect_my_home_to_contractor(
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
       and coalesce(o.account_status, 'active') = 'active'
       and coalesce(o.subscription_status, 'active') in ('trialing', 'active')
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
    'homeowner_search',
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
        when public.home_contractor_connections.status in ('revoked', 'declined') then 'active'
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
    'connection_created_from_search',
    jsonb_build_object('source', 'homeowner_search')
  );

  return v_connection;
end;
$$;

grant execute on function public.connect_my_home_to_contractor(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
