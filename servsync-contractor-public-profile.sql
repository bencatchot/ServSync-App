-- ServSync contractor public profile page RPC.
-- Paste into the Supabase SQL Editor.
-- Run after servsync-discover.sql.

begin;

create or replace function public.servsync_get_public_contractor_profile(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'contractor_id',    cp.id,
    'business_name',    cp.business_name,
    'slug',             cp.slug,
    'contact_name',     cp.contact_name,
    'city',             cp.city,
    'state',            cp.state,
    'zip_code',         cp.zip_code,
    'website_url',      cp.website_url,
    'categories',       cp.service_categories,
    'business_summary', cp.business_summary,
    'license_number',   cp.license_number,
    'insurance_status', cp.insurance_status,
    'bonded_status',    cp.bonded_status,
    'avg_rating',       round(avg(r.rating)::numeric, 1),
    'review_count',     count(r.id),
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
           cp.zip_code, cp.website_url, cp.service_categories, cp.business_summary,
           cp.license_number, cp.insurance_status, cp.bonded_status
  limit 1;
$$;

grant execute on function public.servsync_get_public_contractor_profile(text) to authenticated;

notify pgrst, 'reload schema';

commit;
