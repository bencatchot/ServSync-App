-- ServSync Discover service-area filtering V1.
-- Paste this into the Supabase SQL Editor after contractor service areas exist.
--
-- This improves text/ZIP matching with listed contractor service areas.
-- It does not add geocoding, maps, generated ZIP-radius coverage, or true
-- distance calculations.

begin;

drop function if exists public.servsync_discover_feed(text, text);
drop function if exists public.servsync_discover_feed(text, text, integer);

create function public.servsync_discover_feed(
  p_category text default null,
  p_location text default null,
  p_radius_miles integer default null
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
        else null
      end as radius_query
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
      or lower(cp.city) like '%' || q.location_query || '%'
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
           and (q.radius_query is null or csa.radius_miles >= q.radius_query)
      )
      or lower(p.city) like '%' || q.location_query || '%'
      or lower(p.state) like '%' || q.location_query || '%'
    )
  order by p.created_at desc;
$$;

grant execute on function public.servsync_discover_feed(text, text, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
