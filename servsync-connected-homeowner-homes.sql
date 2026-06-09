-- Connected homeowner multi-property visibility for contractor-side customer detail.
-- Keeps the legacy `home` field as the first/primary home and adds `homes` as an
-- array of all homes allowed by the current connection permissions.

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
      when coalesce(p.share_home_overview, false) and h.id is not null then jsonb_build_object(
        'id', h.id,
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
    case
      when coalesce(p.share_home_overview, false) then coalesce(shared_homes.homes, '[]'::jsonb)
      else '[]'::jsonb
    end as homes,
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
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', home_row.id,
        'nickname', home_row.nickname,
        'address_line1', case when coalesce(p.share_address, false) then home_row.address_line1 else '' end,
        'address_line2', case when coalesce(p.share_address, false) then home_row.address_line2 else '' end,
        'city', home_row.city,
        'state', home_row.state,
        'zip_code', home_row.zip_code,
        'home_type', home_row.home_type,
        'year_built', home_row.year_built,
        'square_feet', home_row.square_feet,
        'notes', home_row.notes
      )
      order by home_row.created_at asc
    ) as homes
      from public.homes home_row
     where home_row.homeowner_user_id = c.homeowner_user_id
  ) shared_homes on true
  where public.current_user_can_access_contractor(cp.id)
    and c.status = 'active'
  order by c.created_at desc;
$$;

grant execute on function public.servsync_contractor_connected_homeowners() to authenticated;
