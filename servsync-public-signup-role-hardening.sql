-- ServSync Public Signup Role Hardening and Referral Trigger Canonicalization.
--
-- This additive migration is the canonical final definition for public profile
-- creation. Historical referral migrations remain immutable, including the
-- older definition that this migration intentionally supersedes.

begin;

do $$
declare
  v_missing text;
begin
  select string_agg(required_object, ', ' order by required_object)
    into v_missing
    from unnest(array[
      'auth.users',
      'public.contractor_invites',
      'public.contractor_profiles',
      'public.profiles',
      'public.referral_codes',
      'public.referrals'
    ]) as required(required_object)
   where to_regclass(required_object) is null;

  if v_missing is not null then
    raise exception 'SIGNUP_ROLE_HARDENING_MISSING_RELATIONS: %', v_missing;
  end if;

  if to_regprocedure('public.servsync_ensure_referral_code(uuid,text)') is null then
    raise exception 'SIGNUP_ROLE_HARDENING_MISSING_FUNCTION: public.servsync_ensure_referral_code(uuid,text)';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'auth'
       and table_name = 'users'
       and column_name = 'raw_user_meta_data'
  ) then
    raise exception 'SIGNUP_ROLE_HARDENING_MISSING_COLUMN: auth.users.raw_user_meta_data';
  end if;
end;
$$;

-- Browser clients may finish a missing profile or update ordinary profile
-- fields, but they may not assign a privileged role or change an existing role.
-- Trusted trigger/service operations continue to run as postgres/service_role.
create or replace function public.servsync_guard_self_service_profile_role()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.role not in ('homeowner', 'contractor') then
      raise exception using
        errcode = '42501',
        message = 'Profile role assignment is not available.';
    end if;

    if tg_op = 'UPDATE' and new.role is distinct from old.role then
      raise exception using
        errcode = '42501',
        message = 'Profile role changes are not available.';
    end if;
  end if;

  return new;
end;
$$;

alter function public.servsync_guard_self_service_profile_role() owner to postgres;
revoke all on function public.servsync_guard_self_service_profile_role() from public, anon, authenticated, service_role;
grant execute on function public.servsync_guard_self_service_profile_role() to postgres;

drop trigger if exists servsync_profiles_self_service_role_guard on public.profiles;
create trigger servsync_profiles_self_service_role_guard
  before insert or update of role on public.profiles
  for each row execute function public.servsync_guard_self_service_profile_role();

-- Canonical public signup trigger. Public metadata is untrusted. Only the two
-- public account roles are accepted; every other value resolves to homeowner.
-- Contractor team roles live in contractor_team_members and are never sourced
-- from auth metadata.
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

  -- Preserve permanent QR and one-time contractor invite attribution.
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
        upper(left(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 12)),
        'permanent_qr',
        'used',
        v_contractor_owner_user_id,
        new.id,
        now(),
        'pending_review',
        'QR code signup - new homeowner account created.'
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

alter function public.handle_new_user() owner to postgres;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
grant execute on function public.handle_new_user() to postgres;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

notify pgrst, 'reload schema';

commit;
