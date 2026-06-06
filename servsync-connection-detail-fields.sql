-- ServSync connection detail fields.
-- Run this in the ServSync Supabase SQL Editor.
--
-- This updates the existing connection reader functions so the app can show:
-- - how a connection started
-- - when it was created
-- - when it was last updated
--
-- It does not change permissions and does not expose private homeowner data.

create or replace function public.servsync_get_homeowner_connections()
returns table (
  connection_id uuid,
  contractor_id uuid,
  business_name text,
  contact_name text,
  email text,
  phone text,
  city text,
  state text,
  status text,
  source text,
  permissions jsonb,
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
    cp.contact_name,
    cp.email,
    cp.phone,
    cp.city,
    cp.state,
    c.status,
    c.source,
    jsonb_build_object(
      'share_contact', coalesce(p.share_contact, false),
      'share_home_overview', coalesce(p.share_home_overview, false),
      'share_address', coalesce(p.share_address, false),
      'share_preferred_vendors', coalesce(p.share_preferred_vendors, false),
      'share_photos', coalesce(p.share_photos, false)
    ) as permissions,
    c.created_at,
    c.updated_at
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.connection_permissions p on p.connection_id = c.id
  where c.homeowner_user_id = auth.uid()
  order by c.created_at desc;
$$;

create or replace function public.servsync_contractor_connected_homeowners()
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
      'share_home_overview', coalesce(p.share_home_overview, false),
      'share_address', coalesce(p.share_address, false),
      'share_preferred_vendors', coalesce(p.share_preferred_vendors, false),
      'share_photos', coalesce(p.share_photos, false)
    ) as permissions,
    case
      when coalesce(p.share_home_overview, false) then jsonb_build_object(
        'nickname', h.nickname,
        'address_line1', case when coalesce(p.share_address, false) then h.address_line1 else '' end,
        'address_line2', case when coalesce(p.share_address, false) then h.address_line2 else '' end,
        'city', h.city,
        'state', h.state,
        'zip_code', h.zip_code,
        'home_type', h.home_type,
        'year_built', h.year_built,
        'square_feet', h.square_feet,
        'notes', h.notes
      )
      else null
    end as home,
    c.created_at,
    c.updated_at,
    c.source
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = c.homeowner_user_id
  left join public.connection_permissions p on p.connection_id = c.id
  left join lateral (
    select *
      from public.homes h
     where h.homeowner_user_id = c.homeowner_user_id
     order by h.created_at asc
     limit 1
  ) h on true
  where cp.owner_user_id = auth.uid()
    and c.status = 'active'
  order by c.created_at desc;
$$;

grant execute on function public.servsync_get_homeowner_connections() to authenticated;
grant execute on function public.servsync_contractor_connected_homeowners() to authenticated;

notify pgrst, 'reload schema';
