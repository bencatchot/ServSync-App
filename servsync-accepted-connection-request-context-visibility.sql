-- Preserve accepted connection-request context in the contractor customer workspace.
--
-- This replaces only the established active connected-homeowner reader. It does
-- not change connection lifecycle, stored request context, sharing state, RLS,
-- or any downstream service-request / estimate / job / invoice behavior.

begin;

do $$
begin
  if to_regclass('public.connection_request_contexts') is null then
    raise exception 'Missing required table public.connection_request_contexts.';
  end if;

  if to_regprocedure('public.current_user_can_access_contractor(uuid)') is null then
    raise exception 'Missing required function public.current_user_can_access_contractor(uuid).';
  end if;
end;
$$;

drop function if exists public.servsync_contractor_connected_homeowners();

create function public.servsync_contractor_connected_homeowners()
returns table (
  connection_id uuid,
  homeowner_user_id uuid,
  display_name text,
  phone text,
  city text,
  state text,
  zip_code text,
  status text,
  permissions jsonb,
  home jsonb,
  homes jsonb,
  request_context jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  source text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    c.homeowner_user_id,
    case when coalesce(p.share_contact, false) then hp.display_name else 'Homeowner' end as display_name,
    case when coalesce(p.share_contact, false) then hp.phone else '' end as phone,
    case when coalesce(p.share_contact, false) then hp.city else '' end as city,
    case when coalesce(p.share_contact, false) then hp.state else '' end as state,
    case when coalesce(p.share_contact, false) then hp.zip_code else '' end as zip_code,
    c.status,
    jsonb_build_object(
      'share_contact', coalesce(p.share_contact, false),
      'share_home_overview', coalesce(shared_homes.any_home_overview, false),
      'share_address', coalesce(shared_homes.any_address, false),
      'share_preferred_vendors', coalesce(shared_homes.any_preferred_vendors, false),
      'share_photos', false
    ) as permissions,
    primary_home.home,
    coalesce(shared_homes.homes, '[]'::jsonb) as homes,
    case
      when ctx.connection_id is null then null
      else jsonb_build_object(
        'message', ctx.message,
        'created_at', ctx.created_at,
        'updated_at', ctx.updated_at
      )
    end as request_context,
    c.created_at,
    c.updated_at,
    c.source
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = c.homeowner_user_id
  left join public.connection_permissions p on p.connection_id = c.id
  left join public.connection_request_contexts ctx on ctx.connection_id = c.id
  left join lateral (
    select jsonb_build_object(
      'id', h.id,
      'nickname', case when csp.share_home_overview then h.nickname else '' end,
      'address_line1', case when csp.share_address then h.address_line1 else '' end,
      'address_line2', case when csp.share_address then h.address_line2 else '' end,
      'city', case when csp.share_address then h.city else '' end,
      'state', case when csp.share_address then h.state else '' end,
      'zip_code', case when csp.share_address then h.zip_code else '' end,
      'home_type', case when csp.share_home_overview then h.home_type else '' end,
      'year_built', case when csp.share_home_overview then h.year_built else null end,
      'square_feet', case when csp.share_home_overview then h.square_feet else null end,
      'notes', case when csp.share_home_overview then h.notes else '' end,
      'share_home_overview', csp.share_home_overview,
      'share_address', csp.share_address,
      'share_preferred_vendors', csp.share_preferred_vendors,
      'share_photos', false
    ) as home
      from public.connection_shared_properties csp
      join public.homes h on h.id = csp.home_id
     where csp.connection_id = c.id
       and h.homeowner_user_id = c.homeowner_user_id
     order by h.created_at asc
     limit 1
  ) primary_home on true
  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'nickname', case when csp.share_home_overview then h.nickname else '' end,
          'address_line1', case when csp.share_address then h.address_line1 else '' end,
          'address_line2', case when csp.share_address then h.address_line2 else '' end,
          'city', case when csp.share_address then h.city else '' end,
          'state', case when csp.share_address then h.state else '' end,
          'zip_code', case when csp.share_address then h.zip_code else '' end,
          'home_type', case when csp.share_home_overview then h.home_type else '' end,
          'year_built', case when csp.share_home_overview then h.year_built else null end,
          'square_feet', case when csp.share_home_overview then h.square_feet else null end,
          'notes', case when csp.share_home_overview then h.notes else '' end,
          'share_home_overview', csp.share_home_overview,
          'share_address', csp.share_address,
          'share_preferred_vendors', csp.share_preferred_vendors,
          'share_photos', false
        )
        order by h.created_at asc
      ) as homes,
      bool_or(csp.share_home_overview) as any_home_overview,
      bool_or(csp.share_address) as any_address,
      bool_or(csp.share_preferred_vendors) as any_preferred_vendors
      from public.connection_shared_properties csp
      join public.homes h on h.id = csp.home_id
     where csp.connection_id = c.id
       and h.homeowner_user_id = c.homeowner_user_id
  ) shared_homes on true
  where auth.uid() is not null
    and public.current_user_can_access_contractor(cp.id)
    and c.status = 'active'
  order by c.created_at desc;
$$;

comment on function public.servsync_contractor_connected_homeowners() is
  'Returns active connected homeowners, current permission-scoped property data, and preserved original connection-request context to the authorized contractor context.';

revoke all on function public.servsync_contractor_connected_homeowners() from public;
revoke all on function public.servsync_contractor_connected_homeowners() from anon;
revoke all on function public.servsync_contractor_connected_homeowners() from authenticated;
grant execute on function public.servsync_contractor_connected_homeowners() to authenticated;

notify pgrst, 'reload schema';

commit;
