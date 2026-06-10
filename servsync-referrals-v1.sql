-- ServSync universal referral tracking foundation.
-- Run in the Supabase SQL Editor before deploying the matching frontend.
--
-- This patch:
-- - Prevents public auth metadata from creating platform_admin profiles.
-- - Adds universal referral codes for homeowners and contractors.
-- - Adds a referral ledger for future manual reward approval.
-- - Preserves existing contractor_invites / QR behavior.

begin;

create extension if not exists pgcrypto;

-- Keep this patch safe if the permanent contractor QR patch has not been run yet.
alter table public.contractor_profiles
  add column if not exists permanent_invite_code text unique;

alter table public.contractor_invites
  add column if not exists invite_type text not null default 'manual';

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  owner_role text not null check (owner_role in ('homeowner', 'contractor')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id)
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid references public.referral_codes(id) on delete set null,
  referral_code text not null,
  referrer_user_id uuid references public.profiles(id) on delete set null,
  referrer_role text check (referrer_role in ('homeowner', 'contractor')),
  referred_email text,
  referred_user_id uuid references public.profiles(id) on delete set null,
  referred_role text check (referred_role in ('homeowner', 'contractor')),
  source text not null default 'signup',
  status text not null default 'pending'
    check (status in ('pending', 'signed_up', 'qualified', 'reward_approved', 'reward_paid', 'rejected')),
  reward_status text not null default 'pending'
    check (reward_status in ('pending', 'approved', 'denied', 'paid', 'not_eligible')),
  reward_type text,
  reward_amount_cents integer,
  qualified_at timestamptz,
  reward_approved_at timestamptz,
  reward_paid_at timestamptz,
  rejected_at timestamptz,
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referral_codes_owner_idx
  on public.referral_codes(owner_user_id, status);

create index if not exists referrals_referrer_idx
  on public.referrals(referrer_user_id, created_at desc);

create index if not exists referrals_referred_user_idx
  on public.referrals(referred_user_id);

create index if not exists referrals_status_idx
  on public.referrals(status, reward_status, created_at desc);

drop trigger if exists referral_codes_touch_updated_at on public.referral_codes;
create trigger referral_codes_touch_updated_at
  before update on public.referral_codes
  for each row execute function public.touch_updated_at();

drop trigger if exists referrals_touch_updated_at on public.referrals;
create trigger referrals_touch_updated_at
  before update on public.referrals
  for each row execute function public.touch_updated_at();

create or replace function public.servsync_generate_referral_code()
returns text
language sql
as $$
  select upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

create or replace function public.servsync_ensure_referral_code(
  p_user_id uuid,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempts int := 0;
  v_profile_role text;
begin
  if auth.uid() is not null
     and auth.uid() <> p_user_id
     and not public.current_user_is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  select role into v_profile_role
    from public.profiles
   where id = p_user_id
   limit 1;

  if v_profile_role in ('homeowner', 'contractor') then
    p_role := v_profile_role;
  end if;

  if p_role not in ('homeowner', 'contractor') then
    return null;
  end if;

  select code into v_code
    from public.referral_codes
   where owner_user_id = p_user_id
   limit 1;

  if v_code is not null then
    return v_code;
  end if;

  loop
    v_code := public.servsync_generate_referral_code();
    begin
      insert into public.referral_codes (code, owner_user_id, owner_role)
      values (v_code, p_user_id, p_role);
      return v_code;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 10 then
        raise exception 'Could not generate unique referral code';
      end if;
    end;
  end loop;
end;
$$;

create or replace function public.servsync_profile_referral_code_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('homeowner', 'contractor') then
    perform public.servsync_ensure_referral_code(new.id, new.role);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_referral_code on public.profiles;
create trigger trg_profiles_referral_code
  after insert on public.profiles
  for each row execute function public.servsync_profile_referral_code_trigger();

-- Backfill existing homeowner and contractor profiles.
do $$
declare
  r record;
begin
  for r in
    select id, role
      from public.profiles
     where role in ('homeowner', 'contractor')
  loop
    perform public.servsync_ensure_referral_code(r.id, r.role);
  end loop;
end $$;

-- Public signup trigger.
-- Important: platform_admin cannot be created from public auth metadata.
-- Admin accounts must be created manually/server-side by inserting/updating profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_referral_invite_code text;
  v_referral_code_text text;
  v_referral_code public.referral_codes;
  v_contractor_id uuid;
  v_contractor_owner_user_id uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'homeowner');
  if v_role not in ('homeowner', 'contractor') then
    v_role := 'homeowner';
  end if;

  v_referral_invite_code := nullif(trim(coalesce(new.raw_user_meta_data->>'referral_invite_code', '')), '');
  v_referral_code_text := nullif(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')), '');

  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update
  set email = excluded.email,
      role = coalesce(public.profiles.role, excluded.role),
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name);

  perform public.servsync_ensure_referral_code(new.id, v_role);

  if v_referral_code_text is not null then
    select * into v_referral_code
      from public.referral_codes
     where upper(code) = upper(v_referral_code_text)
       and status = 'active'
     limit 1;

    if v_referral_code.id is not null and v_referral_code.owner_user_id <> new.id then
      insert into public.referrals (
        referral_code_id,
        referral_code,
        referrer_user_id,
        referrer_role,
        referred_email,
        referred_user_id,
        referred_role,
        source,
        status,
        reward_status
      ) values (
        v_referral_code.id,
        v_referral_code.code,
        v_referral_code.owner_user_id,
        v_referral_code.owner_role,
        coalesce(new.email, ''),
        new.id,
        v_role,
        'signup',
        'signed_up',
        'pending'
      )
      on conflict do nothing;
    end if;
  end if;

  -- Preserve existing contractor invite / QR referral behavior.
  if v_role = 'homeowner' and v_referral_invite_code is not null then
    select id, owner_user_id into v_contractor_id, v_contractor_owner_user_id
      from public.contractor_profiles
     where permanent_invite_code = v_referral_invite_code
     limit 1;

    if v_contractor_id is not null then
      insert into public.contractor_invites (
        contractor_id,
        invite_code,
        invite_type,
        status,
        created_by,
        used_by_homeowner_id,
        used_at,
        reward_status,
        reward_notes
      ) values (
        v_contractor_id,
        upper(encode(gen_random_bytes(6), 'hex')),
        'permanent_qr',
        'used',
        v_contractor_owner_user_id,
        new.id,
        now(),
        'pending_review',
        'QR code signup — new homeowner account created.'
      );
    else
      update public.contractor_invites
         set status = 'used',
             used_by_homeowner_id = new.id,
             used_at = now(),
             reward_status = 'pending_review',
             reward_notes = case
               when coalesce(reward_notes, '') = '' then 'Referral signup recorded automatically from contractor link.'
               else reward_notes
             end
       where invite_code = v_referral_invite_code
         and status = 'active'
         and used_by_homeowner_id is null
         and (expires_at is null or expires_at > now());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;

drop policy if exists "referral_codes_select_owner_or_admin" on public.referral_codes;
create policy "referral_codes_select_owner_or_admin"
  on public.referral_codes for select to authenticated
  using (owner_user_id = auth.uid() or public.current_user_is_platform_admin());

drop policy if exists "referral_codes_update_owner_or_admin" on public.referral_codes;
create policy "referral_codes_update_owner_or_admin"
  on public.referral_codes for update to authenticated
  using (owner_user_id = auth.uid() or public.current_user_is_platform_admin())
  with check (owner_user_id = auth.uid() or public.current_user_is_platform_admin());

drop policy if exists "referrals_select_referrer_or_admin" on public.referrals;
create policy "referrals_select_referrer_or_admin"
  on public.referrals for select to authenticated
  using (referrer_user_id = auth.uid() or public.current_user_is_platform_admin());

drop policy if exists "referrals_update_admin" on public.referrals;
create policy "referrals_update_admin"
  on public.referrals for update to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

grant select, update on public.referral_codes to authenticated;
grant select, update on public.referrals to authenticated;
grant execute on function public.servsync_ensure_referral_code(uuid, text) to authenticated;

create or replace function public.servsync_admin_referrals()
returns table (
  referral_id uuid,
  referral_code text,
  referrer_user_id uuid,
  referrer_role text,
  referrer_email text,
  referrer_name text,
  referred_user_id uuid,
  referred_role text,
  referred_email text,
  referred_name text,
  source text,
  status text,
  reward_status text,
  reward_type text,
  reward_amount_cents integer,
  admin_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  qualified_at timestamptz,
  reward_approved_at timestamptz,
  reward_paid_at timestamptz,
  rejected_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id,
    r.referral_code,
    r.referrer_user_id,
    r.referrer_role,
    referrer.email,
    referrer.full_name,
    r.referred_user_id,
    r.referred_role,
    coalesce(referred.email, r.referred_email),
    referred.full_name,
    r.source,
    r.status,
    r.reward_status,
    r.reward_type,
    r.reward_amount_cents,
    r.admin_notes,
    r.created_at,
    r.updated_at,
    r.qualified_at,
    r.reward_approved_at,
    r.reward_paid_at,
    r.rejected_at
  from public.referrals r
  left join public.profiles referrer on referrer.id = r.referrer_user_id
  left join public.profiles referred on referred.id = r.referred_user_id
  where public.current_user_is_platform_admin()
  order by r.created_at desc;
$$;

create or replace function public.servsync_admin_update_referral_status(
  p_referral_id uuid,
  p_status text,
  p_reward_status text,
  p_reward_type text default null,
  p_reward_amount_cents integer default null,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_status not in ('pending', 'signed_up', 'qualified', 'reward_approved', 'reward_paid', 'rejected') then
    raise exception 'Invalid referral status';
  end if;

  if p_reward_status not in ('pending', 'approved', 'denied', 'paid', 'not_eligible') then
    raise exception 'Invalid reward status';
  end if;

  update public.referrals
     set status = p_status,
         reward_status = p_reward_status,
         reward_type = p_reward_type,
         reward_amount_cents = p_reward_amount_cents,
         admin_notes = coalesce(p_admin_notes, ''),
         qualified_at = case when p_status = 'qualified' and qualified_at is null then now() else qualified_at end,
         reward_approved_at = case
           when (p_status = 'reward_approved' or p_reward_status = 'approved') and reward_approved_at is null then now()
           else reward_approved_at
         end,
         reward_paid_at = case
           when (p_status = 'reward_paid' or p_reward_status = 'paid') and reward_paid_at is null then now()
           else reward_paid_at
         end,
         rejected_at = case when p_status = 'rejected' and rejected_at is null then now() else rejected_at end
   where id = p_referral_id;
end;
$$;

grant execute on function public.servsync_admin_referrals() to authenticated;
grant execute on function public.servsync_admin_update_referral_status(uuid, text, text, text, integer, text) to authenticated;

notify pgrst, 'reload schema';

commit;
