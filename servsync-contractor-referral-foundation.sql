-- ServSync Contractor-to-Contractor Referral Foundation
-- SQL/RLS/RPC only.
--
-- This additive patch creates a typed referral/invite-lead foundation for
-- contractor-submitted contractor referrals. It intentionally does not create
-- homeowner invites, contractor-homeowner invites, referral rewards, billing,
-- contractor team access, contractor profiles, connections, jobs, estimates,
-- invoices, notifications, emails, SMS, push, public landing pages, or other
-- workflow automation.

begin;

create extension if not exists pgcrypto;

create or replace function public.current_user_can_submit_contractor_referrals(
  p_contractor_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
        from public.contractor_profiles cp
       where cp.id = p_contractor_id
         and cp.owner_user_id = auth.uid()
    )
    or exists (
      select 1
        from public.contractor_team_members tm
       where tm.contractor_id = p_contractor_id
         and tm.user_id = auth.uid()
         and tm.status = 'active'
         and tm.role in ('admin', 'office')
    );
$$;

create table if not exists public.servsync_referral_invites (
  id uuid primary key default gen_random_uuid(),
  referral_type text not null default 'contractor_refers_contractor',
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referrer_contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  referred_business_name text not null,
  referred_contact_name text,
  referred_email text not null,
  referred_phone text,
  referred_trade_category text,
  referred_location text,
  referrer_note text,
  status text not null default 'created',
  admin_status text not null default 'new',
  admin_notes text,
  outreach_attempt_count integer not null default 0,
  last_outreach_at timestamptz,
  next_follow_up_at timestamptz,
  matched_contractor_id uuid references public.contractor_profiles(id) on delete set null,
  matched_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint servsync_referral_invites_type_check
    check (referral_type in (
      'homeowner_invites_contractor',
      'contractor_invites_homeowner',
      'contractor_refers_contractor'
    )),
  constraint servsync_referral_invites_foundation_type_check
    check (referral_type = 'contractor_refers_contractor'),
  constraint servsync_referral_invites_business_name_check
    check (length(trim(coalesce(referred_business_name, ''))) > 0),
  constraint servsync_referral_invites_email_check
    check (length(trim(coalesce(referred_email, ''))) > 0 and position('@' in referred_email) > 1),
  constraint servsync_referral_invites_status_check
    check (status in (
      'created',
      'sent',
      'signed_up',
      'accepted',
      'expired',
      'cancelled',
      'duplicate',
      'admin_review'
    )),
  constraint servsync_referral_invites_admin_status_check
    check (admin_status in (
      'new',
      'reviewing',
      'contacted',
      'followed_up',
      'joined',
      'duplicate',
      'bad_contact_info',
      'declined',
      'no_response',
      'archived'
    )),
  constraint servsync_referral_invites_outreach_attempt_count_check
    check (outreach_attempt_count >= 0)
);

create index if not exists servsync_referral_invites_referrer_contractor_idx
  on public.servsync_referral_invites(referrer_contractor_id, created_at desc);

create index if not exists servsync_referral_invites_referrer_user_idx
  on public.servsync_referral_invites(referrer_user_id, created_at desc);

create index if not exists servsync_referral_invites_status_idx
  on public.servsync_referral_invites(status, admin_status, created_at desc);

create index if not exists servsync_referral_invites_email_dupe_idx
  on public.servsync_referral_invites(lower(trim(referred_email)))
  where referred_email is not null;

create index if not exists servsync_referral_invites_business_location_dupe_idx
  on public.servsync_referral_invites(
    lower(trim(referred_business_name)),
    lower(trim(coalesce(referred_location, '')))
  );

create index if not exists servsync_referral_invites_matched_contractor_idx
  on public.servsync_referral_invites(matched_contractor_id)
  where matched_contractor_id is not null;

drop trigger if exists servsync_referral_invites_touch_updated_at
  on public.servsync_referral_invites;
create trigger servsync_referral_invites_touch_updated_at
  before update on public.servsync_referral_invites
  for each row execute function public.touch_updated_at();

alter table public.servsync_referral_invites enable row level security;

drop policy if exists "Referral invites: platform admins read"
  on public.servsync_referral_invites;
create policy "Referral invites: platform admins read"
  on public.servsync_referral_invites for select to authenticated
  using (public.current_user_is_platform_admin());

drop policy if exists "Referral invites: platform admins update"
  on public.servsync_referral_invites;
create policy "Referral invites: platform admins update"
  on public.servsync_referral_invites for update to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

revoke all on table public.servsync_referral_invites from public;
revoke all on table public.servsync_referral_invites from anon;
revoke all on table public.servsync_referral_invites from authenticated;

create or replace function public.servsync_submit_contractor_referral_invite(
  p_referrer_contractor_id uuid,
  p_referred_business_name text,
  p_referred_email text,
  p_referred_contact_name text default null,
  p_referred_phone text default null,
  p_referred_trade_category text default null,
  p_referred_location text default null,
  p_referrer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_name text := nullif(trim(coalesce(p_referred_business_name, '')), '');
  v_email text := lower(nullif(trim(coalesce(p_referred_email, '')), ''));
  v_referral public.servsync_referral_invites;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.current_user_can_submit_contractor_referrals(p_referrer_contractor_id) then
    raise exception 'Only contractor owner, admin, or office users can submit contractor referrals.';
  end if;

  if v_business_name is null then
    raise exception 'Referred contractor business name is required.';
  end if;

  if v_email is null or position('@' in v_email) <= 1 then
    raise exception 'Referred contractor email is required.';
  end if;

  insert into public.servsync_referral_invites (
    referral_type,
    referrer_user_id,
    referrer_contractor_id,
    referred_business_name,
    referred_contact_name,
    referred_email,
    referred_phone,
    referred_trade_category,
    referred_location,
    referrer_note,
    status,
    admin_status
  ) values (
    'contractor_refers_contractor',
    auth.uid(),
    p_referrer_contractor_id,
    v_business_name,
    nullif(trim(coalesce(p_referred_contact_name, '')), ''),
    v_email,
    nullif(trim(coalesce(p_referred_phone, '')), ''),
    nullif(trim(coalesce(p_referred_trade_category, '')), ''),
    nullif(trim(coalesce(p_referred_location, '')), ''),
    nullif(trim(coalesce(p_referrer_note, '')), ''),
    'created',
    'new'
  )
  returning * into v_referral;

  return jsonb_build_object(
    'id', v_referral.id,
    'referral_type', v_referral.referral_type,
    'referrer_contractor_id', v_referral.referrer_contractor_id,
    'referred_business_name', v_referral.referred_business_name,
    'referred_email', v_referral.referred_email,
    'status', v_referral.status,
    'admin_status', v_referral.admin_status,
    'created_at', v_referral.created_at
  );
end;
$$;

create or replace function public.servsync_admin_referral_invites()
returns table (
  referral_id uuid,
  referral_type text,
  referrer_user_id uuid,
  referrer_email text,
  referrer_name text,
  referrer_contractor_id uuid,
  referrer_contractor_name text,
  referred_business_name text,
  referred_contact_name text,
  referred_email text,
  referred_phone text,
  referred_trade_category text,
  referred_location text,
  referrer_note text,
  status text,
  admin_status text,
  admin_notes text,
  outreach_attempt_count integer,
  last_outreach_at timestamptz,
  next_follow_up_at timestamptz,
  matched_contractor_id uuid,
  matched_contractor_name text,
  matched_user_id uuid,
  matched_user_email text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    ri.id,
    ri.referral_type,
    ri.referrer_user_id,
    referrer.email,
    referrer.full_name,
    ri.referrer_contractor_id,
    referrer_contractor.business_name,
    ri.referred_business_name,
    ri.referred_contact_name,
    ri.referred_email,
    ri.referred_phone,
    ri.referred_trade_category,
    ri.referred_location,
    ri.referrer_note,
    ri.status,
    ri.admin_status,
    ri.admin_notes,
    ri.outreach_attempt_count,
    ri.last_outreach_at,
    ri.next_follow_up_at,
    ri.matched_contractor_id,
    matched_contractor.business_name,
    ri.matched_user_id,
    matched_user.email,
    ri.created_at,
    ri.updated_at
  from public.servsync_referral_invites ri
  left join public.profiles referrer on referrer.id = ri.referrer_user_id
  left join public.contractor_profiles referrer_contractor on referrer_contractor.id = ri.referrer_contractor_id
  left join public.contractor_profiles matched_contractor on matched_contractor.id = ri.matched_contractor_id
  left join public.profiles matched_user on matched_user.id = ri.matched_user_id
  where public.current_user_is_platform_admin()
  order by ri.created_at desc;
$$;

create or replace function public.servsync_admin_update_referral_invite(
  p_referral_id uuid,
  p_status text default null,
  p_admin_status text default null,
  p_admin_notes text default null,
  p_outreach_attempt_count integer default null,
  p_last_outreach_at timestamptz default null,
  p_next_follow_up_at timestamptz default null,
  p_matched_contractor_id uuid default null,
  p_matched_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.servsync_referral_invites;
  v_status text;
  v_admin_status text;
  v_referral public.servsync_referral_invites;
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  select *
    into v_existing
    from public.servsync_referral_invites
   where id = p_referral_id
   for update;

  if v_existing.id is null then
    raise exception 'Contractor referral invite not found.';
  end if;

  v_status := coalesce(nullif(trim(coalesce(p_status, '')), ''), v_existing.status);
  if v_status not in (
    'created',
    'sent',
    'signed_up',
    'accepted',
    'expired',
    'cancelled',
    'duplicate',
    'admin_review'
  ) then
    raise exception 'Invalid contractor referral status.';
  end if;

  v_admin_status := coalesce(nullif(trim(coalesce(p_admin_status, '')), ''), v_existing.admin_status);
  if v_admin_status not in (
    'new',
    'reviewing',
    'contacted',
    'followed_up',
    'joined',
    'duplicate',
    'bad_contact_info',
    'declined',
    'no_response',
    'archived'
  ) then
    raise exception 'Invalid contractor referral admin status.';
  end if;

  if p_outreach_attempt_count is not null and p_outreach_attempt_count < 0 then
    raise exception 'Outreach attempt count cannot be negative.';
  end if;

  if p_matched_contractor_id is not null
     and not exists (select 1 from public.contractor_profiles where id = p_matched_contractor_id) then
    raise exception 'Matched contractor not found.';
  end if;

  if p_matched_user_id is not null
     and not exists (select 1 from public.profiles where id = p_matched_user_id) then
    raise exception 'Matched user not found.';
  end if;

  update public.servsync_referral_invites
     set status = v_status,
         admin_status = v_admin_status,
         admin_notes = case when p_admin_notes is null then admin_notes else nullif(trim(coalesce(p_admin_notes, '')), '') end,
         outreach_attempt_count = coalesce(p_outreach_attempt_count, outreach_attempt_count),
         last_outreach_at = coalesce(p_last_outreach_at, last_outreach_at),
         next_follow_up_at = coalesce(p_next_follow_up_at, next_follow_up_at),
         matched_contractor_id = coalesce(p_matched_contractor_id, matched_contractor_id),
         matched_user_id = coalesce(p_matched_user_id, matched_user_id)
   where id = v_existing.id
  returning * into v_referral;

  return to_jsonb(v_referral);
end;
$$;

revoke all on function public.current_user_can_submit_contractor_referrals(uuid)
  from public, anon, authenticated;
grant execute on function public.current_user_can_submit_contractor_referrals(uuid)
  to authenticated;

revoke execute on function public.servsync_submit_contractor_referral_invite(
  uuid, text, text, text, text, text, text, text
) from public;
revoke execute on function public.servsync_submit_contractor_referral_invite(
  uuid, text, text, text, text, text, text, text
) from anon;
grant execute on function public.servsync_submit_contractor_referral_invite(
  uuid, text, text, text, text, text, text, text
) to authenticated;

revoke execute on function public.servsync_admin_referral_invites()
  from public;
revoke execute on function public.servsync_admin_referral_invites()
  from anon;
grant execute on function public.servsync_admin_referral_invites()
  to authenticated;

revoke execute on function public.servsync_admin_update_referral_invite(
  uuid, text, text, text, integer, timestamptz, timestamptz, uuid, uuid
) from public;
revoke execute on function public.servsync_admin_update_referral_invite(
  uuid, text, text, text, integer, timestamptz, timestamptz, uuid, uuid
) from anon;
grant execute on function public.servsync_admin_update_referral_invite(
  uuid, text, text, text, integer, timestamptz, timestamptz, uuid, uuid
) to authenticated;

comment on table public.servsync_referral_invites is
  'Contractor-to-contractor referral/invite lead foundation. Backend/admin tracking only; no UI, rewards, billing, email, profile creation, team access, connections, jobs, estimates, invoices, or notifications.';

comment on function public.servsync_submit_contractor_referral_invite(
  uuid, text, text, text, text, text, text, text
) is
  'Contractor manager RPC for submitting contractor_refers_contractor referral invite leads. Does not send email or create accounts/permissions.';

commit;
