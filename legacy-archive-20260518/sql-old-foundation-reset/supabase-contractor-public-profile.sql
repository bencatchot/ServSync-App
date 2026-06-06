-- ServSync contractor public profile fields.
-- Paste this into Supabase SQL Editor before testing the contractor Public Profile tab.
-- Safe to re-run.

alter table public.organizations
  add column if not exists service_categories text[] not null default '{}',
  add column if not exists service_zip_codes text[] not null default '{}',
  add column if not exists service_radius_miles integer not null default 25,
  add column if not exists license_number text not null default '',
  add column if not exists business_license_number text not null default '',
  add column if not exists insured boolean not null default false,
  add column if not exists bonded boolean not null default false,
  add column if not exists years_in_business text not null default '',
  add column if not exists google_reviews_url text not null default '',
  add column if not exists testimonials_url text not null default '',
  add column if not exists public_bio text not null default '';

create index if not exists organizations_service_categories_idx
  on public.organizations using gin(service_categories);

create index if not exists organizations_service_zip_codes_idx
  on public.organizations using gin(service_zip_codes);

create index if not exists organizations_service_radius_idx
  on public.organizations(service_radius_miles);

notify pgrst, 'reload schema';
