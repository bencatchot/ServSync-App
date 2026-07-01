-- ServSync contractor beta billing-readiness foundation.
--
-- This slice tracks contractor beta billing state and exposes a centralized
-- entitlement contract. It does not activate Stripe checkout, charge users,
-- require credit cards, add UI, or gate current beta contractors.

begin;

create extension if not exists pgcrypto;

create table if not exists public.contractor_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null unique references public.contractor_profiles(id) on delete cascade,
  billing_status text not null default 'beta_free',
  beta_started_at timestamptz,
  beta_cohort text,
  founder_discount_eligible boolean not null default false,
  founder_discount_notes text not null default '',
  current_plan text not null default 'beta_free',
  subscription_required_after timestamptz,
  grace_period_ends_at timestamptz,
  access_mode text not null default 'full_beta',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  stripe_subscription_status text,
  monthly_price_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_billing_accounts_billing_status_check
    check (billing_status in (
      'beta_free',
      'trialing',
      'active',
      'past_due',
      'grace_period',
      'limited',
      'canceled',
      'comped',
      'manual_review'
    )),
  constraint contractor_billing_accounts_access_mode_check
    check (access_mode in (
      'full_beta',
      'full_paid',
      'founder',
      'read_only',
      'limited',
      'suspended'
    )),
  constraint contractor_billing_accounts_current_plan_check
    check (length(trim(current_plan)) > 0),
  constraint contractor_billing_accounts_monthly_price_cents_check
    check (monthly_price_cents >= 0)
);

create index if not exists contractor_billing_accounts_contractor_idx
  on public.contractor_billing_accounts(contractor_id);

create index if not exists contractor_billing_accounts_stripe_customer_idx
  on public.contractor_billing_accounts(stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists contractor_billing_accounts_stripe_subscription_idx
  on public.contractor_billing_accounts(stripe_subscription_id)
  where stripe_subscription_id is not null;

drop trigger if exists contractor_billing_accounts_touch_updated_at on public.contractor_billing_accounts;
create trigger contractor_billing_accounts_touch_updated_at
  before update on public.contractor_billing_accounts
  for each row execute function public.touch_updated_at();

comment on table public.contractor_billing_accounts is
  'Private contractor billing-readiness and beta entitlement state. This does not activate payments or Stripe checkout.';

comment on column public.contractor_billing_accounts.billing_status is
  'Internal billing lifecycle status. Existing beta contractors default to beta_free.';

comment on column public.contractor_billing_accounts.access_mode is
  'Centralized entitlement mode. full_beta preserves current beta access; read_only preserves access to existing records while blocking new paid-feature activity.';

insert into public.contractor_billing_accounts (
  contractor_id,
  billing_status,
  beta_started_at,
  beta_cohort,
  founder_discount_eligible,
  current_plan,
  access_mode,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_subscription_status,
  monthly_price_cents
)
select
  cp.id,
  'beta_free',
  coalesce(cp.created_at, now()),
  'existing_beta',
  true,
  'beta_free',
  'full_beta',
  to_jsonb(cp)->>'stripe_customer_id',
  to_jsonb(cp)->>'stripe_subscription_id',
  to_jsonb(cp)->>'subscription_status',
  greatest(coalesce((to_jsonb(cp)->>'monthly_price_cents')::integer, 0), 0)
from public.contractor_profiles cp
on conflict (contractor_id) do nothing;

create or replace function public.servsync_create_default_contractor_billing_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contractor_billing_accounts (
    contractor_id,
    billing_status,
    beta_started_at,
    beta_cohort,
    founder_discount_eligible,
    current_plan,
    access_mode,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_subscription_status,
    monthly_price_cents
  )
  values (
    new.id,
    'beta_free',
    coalesce(new.created_at, now()),
    'new_beta',
    true,
    'beta_free',
    'full_beta',
    to_jsonb(new)->>'stripe_customer_id',
    to_jsonb(new)->>'stripe_subscription_id',
    to_jsonb(new)->>'subscription_status',
    greatest(coalesce((to_jsonb(new)->>'monthly_price_cents')::integer, 0), 0)
  )
  on conflict (contractor_id) do nothing;

  return new;
end;
$$;

drop trigger if exists contractor_profiles_create_billing_account on public.contractor_profiles;
create trigger contractor_profiles_create_billing_account
  after insert on public.contractor_profiles
  for each row execute function public.servsync_create_default_contractor_billing_account();

alter table public.contractor_billing_accounts enable row level security;

revoke all on table public.contractor_billing_accounts from public;
revoke all on table public.contractor_billing_accounts from anon;
revoke all on table public.contractor_billing_accounts from authenticated;

grant select, update on table public.contractor_billing_accounts to authenticated;

drop policy if exists "Contractor billing accounts: owner team and admin read" on public.contractor_billing_accounts;
create policy "Contractor billing accounts: owner team and admin read"
  on public.contractor_billing_accounts for select to authenticated
  using (
    public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Contractor billing accounts: platform admin updates" on public.contractor_billing_accounts;
create policy "Contractor billing accounts: platform admin updates"
  on public.contractor_billing_accounts for update to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create or replace function public.servsync_current_contractor_entitlements(
  p_contractor_id uuid default null
)
returns table (
  contractor_id uuid,
  billing_status text,
  current_plan text,
  access_mode text,
  subscription_required_after timestamptz,
  grace_period_ends_at timestamptz,
  can_use_workspace boolean,
  can_create_service_requests_for_local_customers boolean,
  can_create_estimates boolean,
  can_send_estimates boolean,
  can_create_jobs boolean,
  can_create_invoices boolean,
  can_send_invoices boolean,
  can_use_discover_profile boolean,
  can_accept_new_connections boolean,
  can_use_ai_features boolean,
  can_invite_team_members boolean,
  max_team_seats integer,
  max_storage_mb integer,
  read_only_reason text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor_id uuid;
  v_billing_status text := 'beta_free';
  v_current_plan text := 'beta_free';
  v_access_mode text := 'full_beta';
  v_subscription_required_after timestamptz;
  v_grace_period_ends_at timestamptz;
  v_creation_allowed boolean := true;
  v_workspace_allowed boolean := true;
  v_limited_reason text := '';
begin
  if p_contractor_id is null then
    select cp.id
      into v_contractor_id
      from public.servsync_current_contractor_profile() cp
     limit 1;
  else
    v_contractor_id := p_contractor_id;
  end if;

  if v_contractor_id is null then
    return query
    select
      null::uuid,
      'none'::text,
      'none'::text,
      'none'::text,
      null::timestamptz,
      null::timestamptz,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      0,
      0,
      'No contractor account found.'::text;
    return;
  end if;

  if not (
    public.current_user_can_access_contractor(v_contractor_id)
    or public.current_user_is_platform_admin()
  ) then
    raise exception 'You do not have permission to read this contractor billing account.';
  end if;

  select
    coalesce(cba.billing_status, 'beta_free'),
    coalesce(cba.current_plan, 'beta_free'),
    coalesce(cba.access_mode, 'full_beta'),
    cba.subscription_required_after,
    cba.grace_period_ends_at
    into
      v_billing_status,
      v_current_plan,
      v_access_mode,
      v_subscription_required_after,
      v_grace_period_ends_at
    from public.contractor_billing_accounts cba
   where cba.contractor_id = v_contractor_id
   limit 1;

  v_billing_status := coalesce(v_billing_status, 'beta_free');
  v_current_plan := coalesce(v_current_plan, 'beta_free');
  v_access_mode := coalesce(v_access_mode, 'full_beta');

  v_workspace_allowed := v_access_mode <> 'suspended';
  v_creation_allowed :=
    v_access_mode in ('full_beta', 'full_paid', 'founder')
    and v_billing_status in ('beta_free', 'trialing', 'active', 'grace_period', 'comped');

  v_limited_reason := case
    when v_access_mode = 'suspended' then 'Contractor account access is suspended.'
    when v_access_mode = 'read_only' then 'Contractor account is read-only until billing is resolved.'
    when v_access_mode = 'limited' then 'Contractor account has limited access until billing is resolved.'
    when v_billing_status in ('past_due', 'limited', 'canceled', 'manual_review') then 'Contractor billing status requires review before creating new paid-feature activity.'
    else ''
  end;

  return query
  select
    v_contractor_id,
    v_billing_status,
    v_current_plan,
    v_access_mode,
    v_subscription_required_after,
    v_grace_period_ends_at,
    v_workspace_allowed,
    v_creation_allowed,
    v_creation_allowed,
    v_creation_allowed,
    v_creation_allowed,
    v_creation_allowed,
    v_creation_allowed,
    v_creation_allowed,
    v_creation_allowed,
    v_creation_allowed,
    v_creation_allowed,
    case when v_creation_allowed then 999 else 1 end,
    case when v_creation_allowed then 1024 else 100 end,
    v_limited_reason;
end;
$$;

create or replace function public.current_user_has_contractor_entitlement(
  p_contractor_id uuid,
  p_capability text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select case lower(trim(coalesce(p_capability, '')))
      when 'can_use_workspace' then ent.can_use_workspace
      when 'can_create_service_requests_for_local_customers' then ent.can_create_service_requests_for_local_customers
      when 'can_create_estimates' then ent.can_create_estimates
      when 'can_send_estimates' then ent.can_send_estimates
      when 'can_create_jobs' then ent.can_create_jobs
      when 'can_create_invoices' then ent.can_create_invoices
      when 'can_send_invoices' then ent.can_send_invoices
      when 'can_use_discover_profile' then ent.can_use_discover_profile
      when 'can_accept_new_connections' then ent.can_accept_new_connections
      when 'can_use_ai_features' then ent.can_use_ai_features
      when 'can_invite_team_members' then ent.can_invite_team_members
      else false
    end
    from public.servsync_current_contractor_entitlements(p_contractor_id) ent
    limit 1
  ), false);
$$;

revoke all on function public.servsync_create_default_contractor_billing_account() from public, anon, authenticated;
revoke all on function public.servsync_current_contractor_entitlements(uuid) from public, anon, authenticated;
revoke all on function public.current_user_has_contractor_entitlement(uuid, text) from public, anon, authenticated;

grant execute on function public.servsync_current_contractor_entitlements(uuid) to authenticated;
grant execute on function public.current_user_has_contractor_entitlement(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
