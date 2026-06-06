-- ServSync permanent referral QR codes.
-- Paste into the Supabase SQL Editor.
-- Run after servsync-email-prep.sql.
--
-- What this adds:
--   • contractor_profiles.permanent_invite_code  — one stable code per contractor,
--     auto-generated on profile creation and backfilled for existing contractors.
--   • contractor_invites.invite_type             — 'manual' | 'permanent_qr'
--   • Updated handle_new_user trigger            — permanent codes create a NEW
--     referral row per signup; one-time codes keep existing flow.
--   • servsync_regenerate_permanent_qr() RPC     — lets a contractor rotate their code.

begin;

-- ── Schema additions ─────────────────────────────────────────────────────────

alter table public.contractor_profiles
  add column if not exists permanent_invite_code text unique;

alter table public.contractor_invites
  add column if not exists invite_type text not null default 'manual';

-- ── Code generator (12-char uppercase hex, same format as app-side codes) ────

create or replace function public.servsync_generate_invite_code()
returns text
language sql
as $$
  select upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

-- ── Auto-generate code on new contractor profile ──────────────────────────────

create or replace function public.servsync_set_permanent_invite_code()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
  v_attempts int := 0;
begin
  if new.permanent_invite_code is not null then
    return new;
  end if;
  loop
    v_code := servsync_generate_invite_code();
    begin
      new.permanent_invite_code := v_code;
      return new;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 10 then raise exception 'Could not generate unique invite code'; end if;
    end;
  end loop;
end;
$$;

drop trigger if exists trg_contractor_permanent_invite_code on public.contractor_profiles;
create trigger trg_contractor_permanent_invite_code
  before insert on public.contractor_profiles
  for each row execute function public.servsync_set_permanent_invite_code();

-- ── Backfill existing contractors ────────────────────────────────────────────

do $$
declare
  r record;
  v_code text;
begin
  for r in select id from public.contractor_profiles where permanent_invite_code is null loop
    loop
      v_code := servsync_generate_invite_code();
      begin
        update public.contractor_profiles set permanent_invite_code = v_code where id = r.id;
        exit;
      exception when unique_violation then
        -- retry
      end;
    end loop;
  end loop;
end;
$$;

-- ── RPC: contractor rotates their permanent QR ────────────────────────────────
-- Old code immediately stops working — warn users to reprint materials.

create or replace function public.servsync_regenerate_permanent_qr()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_new_code text;
  v_attempts int := 0;
begin
  loop
    v_new_code := servsync_generate_invite_code();
    begin
      update public.contractor_profiles
         set permanent_invite_code = v_new_code,
             updated_at = now()
       where owner_user_id = auth.uid();
      return v_new_code;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 10 then raise exception 'Could not generate unique code'; end if;
    end;
  end loop;
end;
$$;

grant execute on function public.servsync_regenerate_permanent_qr() to authenticated;

-- ── Updated handle_new_user trigger ──────────────────────────────────────────
-- Replaces the version in servsync-clean-foundation.sql.
-- Permanent codes: create a fresh contractor_invites row (one per new homeowner).
-- One-time codes:  existing flow — mark the invite as used.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role                 text;
  v_referral_invite_code text;
  v_contractor_id        uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'homeowner');
  if v_role not in ('homeowner', 'contractor', 'platform_admin') then
    v_role := 'homeowner';
  end if;
  v_referral_invite_code := nullif(trim(coalesce(new.raw_user_meta_data->>'referral_invite_code', '')), '');

  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update
  set email     = excluded.email,
      role      = coalesce(public.profiles.role, excluded.role),
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name);

  if v_role = 'homeowner' and v_referral_invite_code is not null then

    -- ── Path 1: permanent QR code ───────────────────────────────────────────
    select id into v_contractor_id
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
        upper(encode(gen_random_bytes(6), 'hex')),  -- unique one-time record for this signup
        'permanent_qr',
        'used',
        v_contractor_id,   -- contractor is the implicit creator of the permanent code
        new.id,
        now(),
        'pending_review',
        'QR code signup — new homeowner account created.'
      );

    else
      -- ── Path 2: one-time manual invite ────────────────────────────────────
      update public.contractor_invites
         set status               = 'used',
             used_by_homeowner_id = new.id,
             used_at              = now(),
             reward_status        = 'pending_review',
             reward_notes         = case
               when coalesce(reward_notes, '') = ''
               then 'Referral signup recorded automatically from contractor link.'
               else reward_notes
             end
       where invite_code          = v_referral_invite_code
         and status               = 'active'
         and used_by_homeowner_id is null
         and (expires_at is null or expires_at > now());
    end if;

  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;
