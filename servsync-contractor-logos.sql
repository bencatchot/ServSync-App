-- ServSync contractor logos.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Adds a contractor logo field, creates a public contractor asset bucket,
-- and exposes logo_url to homeowner connections and public contractor profiles.

begin;

alter table public.contractor_profiles
  add column if not exists logo_url text not null default '';

insert into storage.buckets (id, name, public)
values ('contractor-assets', 'contractor-assets', true)
on conflict (id) do update
set public = true;

drop policy if exists "contractor_assets_upload_own_folder" on storage.objects;
create policy "contractor_assets_upload_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contractor-assets'
    and exists (
      select 1
        from public.contractor_profiles cp
       where cp.owner_user_id = auth.uid()
    )
  );

drop policy if exists "contractor_assets_update_own_folder" on storage.objects;
create policy "contractor_assets_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'contractor-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'contractor-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "contractor_assets_delete_own_folder" on storage.objects;
create policy "contractor_assets_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'contractor-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop function if exists public.servsync_get_homeowner_connections();
create function public.servsync_get_homeowner_connections()
returns table (
  connection_id uuid,
  contractor_id uuid,
  business_name text,
  contact_name text,
  email text,
  phone text,
  logo_url text,
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
    coalesce(cp.logo_url, '') as logo_url,
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

grant execute on function public.servsync_get_homeowner_connections() to authenticated;

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
    'logo_url',         coalesce(cp.logo_url, ''),
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
           cp.zip_code, cp.website_url, cp.logo_url, cp.service_categories, cp.business_summary,
           cp.license_number, cp.insurance_status, cp.bonded_status
  limit 1;
$$;

grant execute on function public.servsync_get_public_contractor_profile(text) to authenticated;

notify pgrst, 'reload schema';

commit;
