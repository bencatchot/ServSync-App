-- ServSync contractor structured service areas.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Adds service-area cards while preserving contractor_profiles.service_zip_codes
-- for legacy/manual ZIP compatibility.

begin;

create extension if not exists pgcrypto;

create table if not exists public.contractor_service_areas (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  label text not null default '',
  location_text text not null default '',
  zip_code text not null default '',
  city text not null default '',
  state text not null default '',
  radius_miles integer not null default 25
    check (radius_miles in (10, 25, 50, 100, 200)),
  latitude numeric null,
  longitude numeric null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contractor_service_areas_contractor_idx
  on public.contractor_service_areas(contractor_id, sort_order, created_at);

create index if not exists contractor_service_areas_zip_idx
  on public.contractor_service_areas(zip_code)
  where zip_code <> '';

create index if not exists contractor_service_areas_city_state_idx
  on public.contractor_service_areas(lower(city), lower(state))
  where city <> '' or state <> '';

drop trigger if exists contractor_service_areas_touch_updated_at on public.contractor_service_areas;
create trigger contractor_service_areas_touch_updated_at
  before update on public.contractor_service_areas
  for each row execute function public.touch_updated_at();

alter table public.contractor_service_areas enable row level security;

drop policy if exists "Contractor service areas: contractor account reads" on public.contractor_service_areas;
create policy "Contractor service areas: contractor account reads"
  on public.contractor_service_areas for select to authenticated
  using (
    public.current_user_can_access_contractor(contractor_id)
    or exists (
      select 1
        from public.contractor_profiles cp
       where cp.id = contractor_id
         and cp.public_profile_enabled = true
         and cp.account_status = 'active'
    )
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Contractor service areas: managers create" on public.contractor_service_areas;
create policy "Contractor service areas: managers create"
  on public.contractor_service_areas for insert to authenticated
  with check (
    public.current_user_can_manage_contractor_team(contractor_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Contractor service areas: managers update" on public.contractor_service_areas;
create policy "Contractor service areas: managers update"
  on public.contractor_service_areas for update to authenticated
  using (
    public.current_user_can_manage_contractor_team(contractor_id)
    or public.current_user_is_platform_admin()
  )
  with check (
    public.current_user_can_manage_contractor_team(contractor_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Contractor service areas: managers delete" on public.contractor_service_areas;
create policy "Contractor service areas: managers delete"
  on public.contractor_service_areas for delete to authenticated
  using (
    public.current_user_can_manage_contractor_team(contractor_id)
    or public.current_user_is_platform_admin()
  );

grant select, insert, update, delete on public.contractor_service_areas to authenticated;

notify pgrst, 'reload schema';

commit;
