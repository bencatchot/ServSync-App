-- ServSync external review links v1.
-- Adds contractor-provided third-party review links, kept separate from ServSync reviews.
-- Run after servsync-discover-analytics.sql.

begin;

alter table public.contractor_profiles
  add column if not exists external_review_links jsonb not null default '[]'::jsonb;

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
    'avg_rating',             round(avg(r.rating)::numeric, 1),
    'review_count',           count(r.id),
    'reviews', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rating',                rv.rating,
          'body',                  rv.body,
          'kudos',                 rv.kudos,
          'reviewer_display_name', rv.reviewer_display_name,
          'reviewer_location',     rv.reviewer_location,
          'created_at',            rv.created_at
        ) order by rv.created_at desc
      )
      from public.service_request_reviews rv
      where rv.contractor_id = cp.id
    ), '[]'::jsonb)
  )
  from public.contractor_profiles cp
  left join public.service_request_reviews r on r.contractor_id = cp.id
  where cp.slug = p_slug
    and cp.public_profile_enabled = true
    and cp.account_status = 'active'
  group by cp.id, cp.business_name, cp.slug, cp.contact_name, cp.city, cp.state,
           cp.zip_code, cp.website_url, cp.logo_url, cp.service_categories, cp.business_summary,
           cp.external_review_links, cp.license_number, cp.insurance_status, cp.bonded_status
  limit 1;
$$;

grant execute on function public.servsync_get_public_contractor_profile(text) to authenticated;

drop function if exists public.servsync_discover_feed(text, text);

create function public.servsync_discover_feed(
  p_category text default null,
  p_location text default null
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
  where cp.public_profile_enabled = true
    and cp.account_status = 'active'
    and (p_category is null or p_category = '' or p.category = p_category)
    and (
      p_location is null or p_location = ''
      or lower(cp.city)  like '%' || lower(p_location) || '%'
      or lower(cp.state) like '%' || lower(p_location) || '%'
    )
  order by p.created_at desc;
$$;

grant execute on function public.servsync_discover_feed(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
