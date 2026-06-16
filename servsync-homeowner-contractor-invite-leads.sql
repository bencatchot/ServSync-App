-- ServSync homeowner contractor invite leads foundation.
-- Run in Supabase SQL Editor after servsync-clean-foundation.sql.
--
-- This patch adds the database/RLS foundation for the homeowner-side
-- "Invite a contractor to ServSync" feature. It is intentionally separate
-- from service requests, connection requests, contractor search, Discover,
-- and existing contractor-created invite/claim records.

begin;

create extension if not exists pgcrypto;

create table if not exists public.homeowner_contractor_invite_leads (
  id uuid primary key default gen_random_uuid(),
  homeowner_user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  location text not null,
  trade_category text,
  contact_name text,
  phone text,
  email text,
  website_url text,
  social_url text,
  homeowner_note text,
  homeowner_status text not null default 'submitted',
  admin_status text not null default 'new',
  admin_notes text,
  outreach_attempt_count integer not null default 0,
  last_outreach_at timestamptz,
  next_follow_up_at timestamptz,
  matched_contractor_id uuid references public.contractor_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homeowner_contractor_invite_leads
  add column if not exists homeowner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists business_name text,
  add column if not exists location text,
  add column if not exists trade_category text,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists website_url text,
  add column if not exists social_url text,
  add column if not exists homeowner_note text,
  add column if not exists homeowner_status text not null default 'submitted',
  add column if not exists admin_status text not null default 'new',
  add column if not exists admin_notes text,
  add column if not exists outreach_attempt_count integer not null default 0,
  add column if not exists last_outreach_at timestamptz,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists matched_contractor_id uuid references public.contractor_profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.homeowner_contractor_invite_leads
  alter column homeowner_user_id set not null,
  alter column business_name set not null,
  alter column location set not null,
  alter column homeowner_status set default 'submitted',
  alter column homeowner_status set not null,
  alter column admin_status set default 'new',
  alter column admin_status set not null,
  alter column outreach_attempt_count set default 0,
  alter column outreach_attempt_count set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.homeowner_contractor_invite_leads
  drop constraint if exists homeowner_contractor_invite_leads_business_name_check,
  drop constraint if exists homeowner_contractor_invite_leads_location_check,
  drop constraint if exists homeowner_contractor_invite_leads_homeowner_status_check,
  drop constraint if exists homeowner_contractor_invite_leads_admin_status_check,
  drop constraint if exists homeowner_contractor_invite_leads_outreach_attempt_count_check;

alter table public.homeowner_contractor_invite_leads
  add constraint homeowner_contractor_invite_leads_business_name_check
    check (length(trim(business_name)) > 0),
  add constraint homeowner_contractor_invite_leads_location_check
    check (length(trim(location)) > 0),
  add constraint homeowner_contractor_invite_leads_homeowner_status_check
    check (homeowner_status in (
      'submitted',
      'invite_sent',
      'contractor_joined',
      'contractor_declined',
      'no_response_30_days'
    )),
  add constraint homeowner_contractor_invite_leads_admin_status_check
    check (admin_status in (
      'new',
      'researching',
      'contacted',
      'followed_up',
      'joined',
      'declined',
      'no_response',
      'bad_contact_info',
      'duplicate'
    )),
  add constraint homeowner_contractor_invite_leads_outreach_attempt_count_check
    check (outreach_attempt_count >= 0);

create index if not exists homeowner_contractor_invite_leads_homeowner_idx
  on public.homeowner_contractor_invite_leads(homeowner_user_id, created_at desc);

create index if not exists homeowner_contractor_invite_leads_homeowner_status_idx
  on public.homeowner_contractor_invite_leads(homeowner_status, created_at desc);

create index if not exists homeowner_contractor_invite_leads_admin_status_idx
  on public.homeowner_contractor_invite_leads(admin_status, created_at desc);

create index if not exists homeowner_contractor_invite_leads_created_at_idx
  on public.homeowner_contractor_invite_leads(created_at desc);

create index if not exists homeowner_contractor_invite_leads_business_location_dupe_idx
  on public.homeowner_contractor_invite_leads(
    lower(trim(business_name)),
    lower(trim(location))
  );

create index if not exists homeowner_contractor_invite_leads_email_dupe_idx
  on public.homeowner_contractor_invite_leads(lower(trim(email)))
  where email is not null;

create index if not exists homeowner_contractor_invite_leads_phone_dupe_idx
  on public.homeowner_contractor_invite_leads(trim(phone))
  where phone is not null;

create index if not exists homeowner_contractor_invite_leads_website_dupe_idx
  on public.homeowner_contractor_invite_leads(lower(trim(website_url)))
  where website_url is not null;

create index if not exists homeowner_contractor_invite_leads_matched_contractor_idx
  on public.homeowner_contractor_invite_leads(matched_contractor_id)
  where matched_contractor_id is not null;

drop trigger if exists homeowner_contractor_invite_leads_touch_updated_at
  on public.homeowner_contractor_invite_leads;
create trigger homeowner_contractor_invite_leads_touch_updated_at
  before update on public.homeowner_contractor_invite_leads
  for each row execute function public.touch_updated_at();

alter table public.homeowner_contractor_invite_leads enable row level security;

drop policy if exists "Homeowner contractor invite leads: homeowners read own"
  on public.homeowner_contractor_invite_leads;
drop policy if exists "Homeowner contractor invite leads: homeowners create own"
  on public.homeowner_contractor_invite_leads;
drop policy if exists "Homeowner contractor invite leads: admins read all"
  on public.homeowner_contractor_invite_leads;
drop policy if exists "Homeowner contractor invite leads: admins update status fields"
  on public.homeowner_contractor_invite_leads;

create policy "Homeowner contractor invite leads: homeowners read own"
  on public.homeowner_contractor_invite_leads
  for select
  to authenticated
  using (homeowner_user_id = auth.uid());

create policy "Homeowner contractor invite leads: homeowners create own"
  on public.homeowner_contractor_invite_leads
  for insert
  to authenticated
  with check (
    homeowner_user_id = auth.uid()
    and public.current_user_role() = 'homeowner'
    and homeowner_status = 'submitted'
    and admin_status = 'new'
    and coalesce(outreach_attempt_count, 0) = 0
    and last_outreach_at is null
    and next_follow_up_at is null
    and matched_contractor_id is null
  );

create policy "Homeowner contractor invite leads: admins read all"
  on public.homeowner_contractor_invite_leads
  for select
  to authenticated
  using (public.current_user_is_platform_admin());

create policy "Homeowner contractor invite leads: admins update status fields"
  on public.homeowner_contractor_invite_leads
  for update
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

grant select on public.homeowner_contractor_invite_leads to authenticated;

grant insert (
  homeowner_user_id,
  business_name,
  location,
  trade_category,
  contact_name,
  phone,
  email,
  website_url,
  social_url,
  homeowner_note
) on public.homeowner_contractor_invite_leads to authenticated;

grant update (
  homeowner_status,
  admin_status,
  admin_notes,
  outreach_attempt_count,
  last_outreach_at,
  next_follow_up_at,
  matched_contractor_id
) on public.homeowner_contractor_invite_leads to authenticated;

create or replace function public.servsync_submit_homeowner_contractor_invite_lead(
  p_business_name text,
  p_location text,
  p_trade_category text default null,
  p_contact_name text default null,
  p_phone text default null,
  p_email text default null,
  p_website_url text default null,
  p_social_url text default null,
  p_homeowner_note text default null
)
returns public.homeowner_contractor_invite_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_name text := nullif(trim(coalesce(p_business_name, '')), '');
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_lead public.homeowner_contractor_invite_leads;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if public.current_user_role() <> 'homeowner' then
    raise exception 'Only homeowners can invite contractors to ServSync.';
  end if;

  if v_business_name is null then
    raise exception 'Contractor business name is required.';
  end if;

  if v_location is null then
    raise exception 'Contractor location is required.';
  end if;

  insert into public.homeowner_contractor_invite_leads (
    homeowner_user_id,
    business_name,
    location,
    trade_category,
    contact_name,
    phone,
    email,
    website_url,
    social_url,
    homeowner_note
  ) values (
    auth.uid(),
    v_business_name,
    v_location,
    nullif(trim(coalesce(p_trade_category, '')), ''),
    nullif(trim(coalesce(p_contact_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    lower(nullif(trim(coalesce(p_email, '')), '')),
    nullif(trim(coalesce(p_website_url, '')), ''),
    nullif(trim(coalesce(p_social_url, '')), ''),
    nullif(trim(coalesce(p_homeowner_note, '')), '')
  )
  returning * into v_lead;

  return v_lead;
end;
$$;

grant execute on function public.servsync_submit_homeowner_contractor_invite_lead(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

notify pgrst, 'reload schema';

commit;
