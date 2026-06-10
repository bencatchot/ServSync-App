-- ServSync geocoding foundation and true Discover radius matching.
-- Paste this into the Supabase SQL Editor after contractor service areas exist.
--
-- Adds geocoding metadata/cache, a Haversine helper, true circle-overlap
-- Discover matching, and a saved-posts RPC that ignores active location filters.
-- No PostGIS, earthdistance, maps, or generated ZIP coverage lists are used.

begin;

alter table public.contractor_service_areas
  add column if not exists geocode_status text not null default 'pending',
  add column if not exists geocoded_at timestamptz null,
  add column if not exists normalized_location text not null default '',
  add column if not exists geocode_provider text not null default '';

do $$
begin
  alter table public.contractor_service_areas
    add constraint contractor_service_areas_geocode_status_check
    check (geocode_status in ('pending', 'geocoded', 'failed'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.geocoded_locations (
  id uuid primary key default gen_random_uuid(),
  query_text text not null,
  normalized_query text not null,
  normalized_location text not null default '',
  city text not null default '',
  state text not null default '',
  zip_code text not null default '',
  latitude numeric not null,
  longitude numeric not null,
  provider text not null default '',
  provider_place_id text not null default '',
  precision text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists geocoded_locations_normalized_query_idx
  on public.geocoded_locations(lower(normalized_query));

create index if not exists geocoded_locations_zip_idx
  on public.geocoded_locations(zip_code)
  where zip_code <> '';

create index if not exists geocoded_locations_city_state_idx
  on public.geocoded_locations(lower(city), lower(state))
  where city <> '' or state <> '';

drop trigger if exists geocoded_locations_touch_updated_at on public.geocoded_locations;
create trigger geocoded_locations_touch_updated_at
  before update on public.geocoded_locations
  for each row execute function public.touch_updated_at();

alter table public.geocoded_locations enable row level security;

revoke all on public.geocoded_locations from anon;
revoke all on public.geocoded_locations from authenticated;

drop policy if exists "Geocoded locations: no direct anon access" on public.geocoded_locations;
drop policy if exists "Geocoded locations: no direct authenticated access" on public.geocoded_locations;

create or replace function public.servsync_distance_miles(
  lat1 numeric,
  lng1 numeric,
  lat2 numeric,
  lng2 numeric
)
returns numeric
language sql
immutable
strict
as $$
  select (
    3958.7613 * 2 * asin(
      least(1, sqrt(
        power(sin(radians(((lat2 - lat1) / 2)::double precision)), 2)
        + cos(radians(lat1::double precision)) * cos(radians(lat2::double precision))
        * power(sin(radians(((lng2 - lng1) / 2)::double precision)), 2)
      ))
    )
  )::numeric;
$$;

drop function if exists public.servsync_discover_feed(text, text);
drop function if exists public.servsync_discover_feed(text, text, integer);
drop function if exists public.servsync_discover_feed(text, text, integer, numeric, numeric);

create function public.servsync_discover_feed(
  p_category text default null,
  p_location text default null,
  p_radius_miles integer default null,
  p_search_lat numeric default null,
  p_search_lng numeric default null
)
returns table (
  post_id uuid,
  contractor_id uuid,
  business_name text,
  contractor_city text,
  contractor_state text,
  categories text[],
  business_summary text,
  external_review_links jsonb,
  service_areas jsonb,
  avg_rating numeric,
  review_count bigint,
  post_category text,
  title text,
  description text,
  photos text[],
  reviews jsonb,
  created_at timestamptz,
  is_saved boolean,
  save_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with params as (
    select
      lower(trim(coalesce(p_location, ''))) as location_query,
      regexp_replace(trim(coalesce(p_location, '')), '[^0-9]', '', 'g') as zip_query,
      case
        when p_radius_miles in (10, 25, 50, 100, 200) then p_radius_miles
        else 25
      end::numeric as radius_query,
      p_search_lat as search_lat,
      p_search_lng as search_lng
  )
  select
    p.id as post_id,
    cp.id as contractor_id,
    cp.business_name,
    cp.city as contractor_city,
    cp.state as contractor_state,
    cp.service_categories as categories,
    cp.business_summary,
    coalesce(cp.external_review_links, '[]'::jsonb) as external_review_links,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label',        csa.label,
        'location_text', csa.location_text,
        'zip_code',     csa.zip_code,
        'city',         csa.city,
        'state',        csa.state,
        'radius_miles', csa.radius_miles
      ) order by csa.sort_order, csa.created_at)
      from public.contractor_service_areas csa
      where csa.contractor_id = cp.id
    ), '[]'::jsonb) as service_areas,
    (select round(avg(r.rating)::numeric, 1)
       from public.service_request_reviews r
      where r.contractor_id = cp.id) as avg_rating,
    (select count(*)
       from public.service_request_reviews r
      where r.contractor_id = cp.id) as review_count,
    p.category as post_category,
    p.title,
    p.description,
    p.photos,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'rating',                rv.rating,
        'body',                  rv.body,
        'kudos',                 rv.kudos,
        'reviewer_display_name', rv.reviewer_display_name,
        'reviewer_location',     rv.reviewer_location,
        'created_at',            rv.created_at
      ) order by rv.created_at desc)
      from (
        select * from public.service_request_reviews rv2
         where rv2.contractor_id = cp.id
         order by rv2.created_at desc
         limit 5
      ) rv
    ), '[]'::jsonb) as reviews,
    p.created_at,
    exists (
      select 1
        from public.discover_post_saves s
       where s.post_id = p.id
         and s.homeowner_user_id = auth.uid()
    ) as is_saved,
    coalesce((
      select count(*)
        from public.discover_post_saves s
       where s.post_id = p.id
    ), 0)::bigint as save_count
  from public.contractor_posts p
  join public.contractor_profiles cp on cp.id = p.contractor_id
  cross join params q
  where cp.public_profile_enabled = true
    and cp.account_status = 'active'
    and (p_category is null or p_category = '' or p.category = p_category)
    and (
      q.location_query = ''
      or (
        q.search_lat is not null
        and q.search_lng is not null
        and exists (
          select 1
            from public.contractor_service_areas csa
           where csa.contractor_id = cp.id
             and csa.latitude is not null
             and csa.longitude is not null
             and csa.geocode_status = 'geocoded'
             and public.servsync_distance_miles(q.search_lat, q.search_lng, csa.latitude, csa.longitude)
               <= q.radius_query + csa.radius_miles
        )
      )
      or (
        (
          q.search_lat is null
          or q.search_lng is null
          or not exists (
            select 1
              from public.contractor_service_areas csa
             where csa.contractor_id = cp.id
               and csa.latitude is not null
               and csa.longitude is not null
               and csa.geocode_status = 'geocoded'
          )
        )
        and (
          lower(cp.city) like '%' || q.location_query || '%'
          or lower(cp.state) like '%' || q.location_query || '%'
          or (q.zip_query <> '' and cp.zip_code like q.zip_query || '%')
          or exists (
            select 1
              from unnest(coalesce(cp.service_zip_codes, '{}'::text[])) as legacy_zip(zip_code)
             where lower(legacy_zip.zip_code) like '%' || q.location_query || '%'
                or (q.zip_query <> '' and legacy_zip.zip_code like q.zip_query || '%')
          )
          or exists (
            select 1
              from public.contractor_service_areas csa
             where csa.contractor_id = cp.id
               and (
                 lower(csa.location_text) like '%' || q.location_query || '%'
                 or lower(csa.city) like '%' || q.location_query || '%'
                 or lower(csa.state) like '%' || q.location_query || '%'
                 or (q.zip_query <> '' and csa.zip_code like q.zip_query || '%')
               )
          )
          or lower(p.city) like '%' || q.location_query || '%'
          or lower(p.state) like '%' || q.location_query || '%'
        )
      )
    )
  order by p.created_at desc;
$$;

grant execute on function public.servsync_discover_feed(text, text, integer, numeric, numeric) to authenticated;

drop function if exists public.servsync_discover_saved_posts();

create function public.servsync_discover_saved_posts()
returns table (
  post_id uuid,
  contractor_id uuid,
  business_name text,
  contractor_city text,
  contractor_state text,
  categories text[],
  business_summary text,
  external_review_links jsonb,
  service_areas jsonb,
  avg_rating numeric,
  review_count bigint,
  post_category text,
  title text,
  description text,
  photos text[],
  reviews jsonb,
  created_at timestamptz,
  is_saved boolean,
  save_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id as post_id,
    cp.id as contractor_id,
    cp.business_name,
    cp.city as contractor_city,
    cp.state as contractor_state,
    cp.service_categories as categories,
    cp.business_summary,
    coalesce(cp.external_review_links, '[]'::jsonb) as external_review_links,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label',        csa.label,
        'location_text', csa.location_text,
        'zip_code',     csa.zip_code,
        'city',         csa.city,
        'state',        csa.state,
        'radius_miles', csa.radius_miles
      ) order by csa.sort_order, csa.created_at)
      from public.contractor_service_areas csa
      where csa.contractor_id = cp.id
    ), '[]'::jsonb) as service_areas,
    (select round(avg(r.rating)::numeric, 1)
       from public.service_request_reviews r
      where r.contractor_id = cp.id) as avg_rating,
    (select count(*)
       from public.service_request_reviews r
      where r.contractor_id = cp.id) as review_count,
    p.category as post_category,
    p.title,
    p.description,
    p.photos,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'rating',                rv.rating,
        'body',                  rv.body,
        'kudos',                 rv.kudos,
        'reviewer_display_name', rv.reviewer_display_name,
        'reviewer_location',     rv.reviewer_location,
        'created_at',            rv.created_at
      ) order by rv.created_at desc)
      from (
        select * from public.service_request_reviews rv2
         where rv2.contractor_id = cp.id
         order by rv2.created_at desc
         limit 5
      ) rv
    ), '[]'::jsonb) as reviews,
    p.created_at,
    true as is_saved,
    coalesce((
      select count(*)
        from public.discover_post_saves s2
       where s2.post_id = p.id
    ), 0)::bigint as save_count
  from public.discover_post_saves s
  join public.contractor_posts p on p.id = s.post_id
  join public.contractor_profiles cp on cp.id = p.contractor_id
  where s.homeowner_user_id = auth.uid()
    and cp.public_profile_enabled = true
    and cp.account_status = 'active'
  order by s.saved_at desc;
$$;

grant execute on function public.servsync_discover_saved_posts() to authenticated;

notify pgrst, 'reload schema';

commit;
