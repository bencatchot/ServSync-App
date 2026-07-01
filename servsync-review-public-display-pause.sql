-- FB-026 Slice 3A: pause public ServSync review display until moderation/public-display policy is approved.
-- Run after:
--   - servsync-public-reviews.sql
--   - servsync-discover-analytics.sql
--   - servsync-geocoding-radius-matching.sql
--   - servsync-external-review-links.sql
--   - servsync-review-grant-hardening.sql
--
-- This patch intentionally does not change review capture, private party visibility,
-- external review links, review table grants, or review write/helper RPC grants.

begin;

create or replace function public.servsync_get_public_contractor_profile(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'contractor_id',          cp.id,
    'business_name',          cp.business_name,
    'slug',                   cp.slug,
    'contact_name',           cp.contact_name,
    'city',                   cp.city,
    'state',                  cp.state,
    'zip_code',               cp.zip_code,
    'website_url',            cp.website_url,
    'logo_url',               coalesce(cp.logo_url, ''),
    'categories',             cp.service_categories,
    'business_summary',       cp.business_summary,
    'external_review_links',  coalesce(cp.external_review_links, '[]'::jsonb),
    'license_number',         cp.license_number,
    'insurance_status',       cp.insurance_status,
    'bonded_status',          cp.bonded_status,
    'avg_rating',             null::numeric,
    'review_count',           0::bigint,
    'reviews',                '[]'::jsonb
  )
  from public.contractor_profiles cp
  where cp.slug = p_slug
    and cp.public_profile_enabled = true
    and cp.account_status = 'active'
  limit 1;
$$;

grant execute on function public.servsync_get_public_contractor_profile(text) to anon, authenticated;

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
        'label',         csa.label,
        'location_text', csa.location_text,
        'zip_code',      csa.zip_code,
        'city',          csa.city,
        'state',         csa.state,
        'radius_miles',  csa.radius_miles
      ) order by csa.sort_order, csa.created_at)
      from public.contractor_service_areas csa
      where csa.contractor_id = cp.id
    ), '[]'::jsonb) as service_areas,
    null::numeric as avg_rating,
    0::bigint as review_count,
    p.category as post_category,
    p.title,
    p.description,
    p.photos,
    '[]'::jsonb as reviews,
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

grant execute on function public.servsync_discover_feed(text, text, integer, numeric, numeric) to anon, authenticated;

create or replace function public.servsync_discover_saved_posts()
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
        'label',         csa.label,
        'location_text', csa.location_text,
        'zip_code',      csa.zip_code,
        'city',          csa.city,
        'state',         csa.state,
        'radius_miles',  csa.radius_miles
      ) order by csa.sort_order, csa.created_at)
      from public.contractor_service_areas csa
      where csa.contractor_id = cp.id
    ), '[]'::jsonb) as service_areas,
    null::numeric as avg_rating,
    0::bigint as review_count,
    p.category as post_category,
    p.title,
    p.description,
    p.photos,
    '[]'::jsonb as reviews,
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

create or replace function public.servsync_my_discover_posts()
returns table (
  post_id uuid,
  contractor_id uuid,
  business_name text,
  contractor_city text,
  contractor_state text,
  categories text[],
  business_summary text,
  avg_rating numeric,
  review_count bigint,
  post_category text,
  title text,
  description text,
  photos text[],
  reviews jsonb,
  created_at timestamptz,
  view_count bigint,
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
    null::numeric as avg_rating,
    0::bigint as review_count,
    p.category as post_category,
    p.title,
    p.description,
    p.photos,
    '[]'::jsonb as reviews,
    p.created_at,
    coalesce((
      select count(*)
        from public.discover_post_views v
       where v.post_id = p.id
    ), 0)::bigint as view_count,
    coalesce((
      select count(*)
        from public.discover_post_saves s
       where s.post_id = p.id
    ), 0)::bigint as save_count
  from public.contractor_posts p
  join public.contractor_profiles cp on cp.id = p.contractor_id
  where cp.owner_user_id = auth.uid()
  order by p.created_at desc;
$$;

grant execute on function public.servsync_my_discover_posts() to authenticated;

create or replace function public.servsync_public_contractor_directory(
  p_category text default null,
  p_location text default null
)
returns table (
  contractor_id    uuid,
  business_name    text,
  slug             text,
  city             text,
  state            text,
  categories       text[],
  business_summary text,
  avg_rating       numeric,
  review_count     bigint,
  reviews          jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cp.id as contractor_id,
    cp.business_name,
    cp.slug,
    cp.city,
    cp.state,
    cp.service_categories as categories,
    cp.business_summary,
    null::numeric as avg_rating,
    0::bigint as review_count,
    '[]'::jsonb as reviews
  from public.contractor_profiles cp
  where cp.public_profile_enabled = true
    and cp.account_status = 'active'
    and (p_category is null or p_category = '' or p_category = any(cp.service_categories))
    and (
      p_location is null or p_location = ''
      or lower(cp.city) like '%' || lower(p_location) || '%'
      or lower(cp.state) like '%' || lower(p_location) || '%'
      or cp.zip_code like p_location || '%'
    )
  order by cp.business_name asc;
$$;

grant execute on function public.servsync_public_contractor_directory(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
