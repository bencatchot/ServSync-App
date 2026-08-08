-- ServSync Stripe Connect Online Payments Foundation v1.
--
-- Sandbox/test-mode foundation only. Stripe direct charges belong to the
-- contractor connected account. ServSync application fees are fixed at zero.
-- This migration does not configure Stripe secrets, activate live mode, move
-- money, change Job authorization, or replace the offline payment ledger.

begin;

do $$
declare
  v_missing text[];
begin
  select array_agg(required.object_name order by required.object_name)
    into v_missing
    from (
      values
        ('public.profiles', to_regclass('public.profiles') is not null),
        ('public.contractor_profiles', to_regclass('public.contractor_profiles') is not null),
        ('public.contractor_team_members', to_regclass('public.contractor_team_members') is not null),
        ('public.invoices', to_regclass('public.invoices') is not null),
        ('public.invoice_offline_payment_records', to_regclass('public.invoice_offline_payment_records') is not null),
        ('public.local_invoice_delivery_links', to_regclass('public.local_invoice_delivery_links') is not null),
        ('public.local_invoice_delivery_sessions', to_regclass('public.local_invoice_delivery_sessions') is not null),
        ('public.current_user_can_access_contractor(uuid)', to_regprocedure('public.current_user_can_access_contractor(uuid)') is not null),
        ('public.current_user_can_manage_contractor_billing(uuid)', to_regprocedure('public.current_user_can_manage_contractor_billing(uuid)') is not null)
    ) required(object_name, present)
   where not required.present;

  if v_missing is not null then
    raise exception 'Stripe Connect foundation prerequisites are missing: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;

create table public.contractor_stripe_payment_accounts (
  contractor_id uuid primary key references public.contractor_profiles(id) on delete restrict,
  stripe_account_id text not null unique,
  mode text not null default 'test' check (mode = 'test'),
  account_status text not null check (account_status in (
    'setup_incomplete', 'verification_required', 'payments_pending', 'active', 'restricted'
  )),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  card_payments_status text not null check (card_payments_status in ('active', 'inactive', 'pending', 'unrequested')),
  ach_payments_status text not null check (ach_payments_status in ('active', 'inactive', 'pending', 'unrequested')),
  requirements_due_count integer not null default 0 check (requirements_due_count >= 0),
  fees_collector text not null check (fees_collector = 'stripe'),
  losses_collector text not null check (losses_collector = 'stripe'),
  dashboard_type text not null check (dashboard_type = 'full'),
  onboarding_started_at timestamptz not null default now(),
  status_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_stripe_payment_accounts_id_check
    check (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  constraint contractor_stripe_payment_accounts_active_check
    check (
      account_status <> 'active'
      or (charges_enabled and card_payments_status = 'active' and ach_payments_status = 'active')
    )
);

create table public.invoice_online_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  delivery_link_id uuid references public.local_invoice_delivery_links(id) on delete restrict,
  idempotency_key uuid not null,
  source text not null check (source in ('authenticated_customer', 'request_free')),
  mode text not null default 'test' check (mode = 'test'),
  stripe_account_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  application_fee_cents integer not null default 0 check (application_fee_cents = 0),
  state text not null default 'creating' check (state in (
    'creating', 'open', 'processing', 'succeeded', 'failed', 'canceled',
    'partially_refunded', 'refunded', 'disputed'
  )),
  payment_method_type text check (payment_method_type is null or payment_method_type in ('card', 'us_bank_account')),
  checkout_session_id text unique,
  payment_intent_id text unique,
  charge_id text unique,
  accounted_amount_cents integer not null default 0,
  invoice_status_before_payment text not null,
  failure_code text,
  last_provider_event_created_at timestamptz,
  last_provider_event_type text,
  checkout_created_at timestamptz,
  processing_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_online_payment_attempts_account_check
    check (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  constraint invoice_online_payment_attempts_checkout_check
    check (checkout_session_id is null or checkout_session_id ~ '^cs_test_[A-Za-z0-9_]{8,}$'),
  constraint invoice_online_payment_attempts_intent_check
    check (payment_intent_id is null or payment_intent_id ~ '^pi_[A-Za-z0-9_]{8,}$'),
  constraint invoice_online_payment_attempts_charge_check
    check (charge_id is null or charge_id ~ '^ch_[A-Za-z0-9_]{8,}$'),
  constraint invoice_online_payment_attempts_accounted_check
    check (accounted_amount_cents between 0 and amount_cents),
  constraint invoice_online_payment_attempts_failure_check
    check (failure_code is null or (length(failure_code) between 1 and 64 and failure_code ~ '^[a-z0-9_]+$')),
  constraint invoice_online_payment_attempts_last_event_type_check
    check (last_provider_event_type is null or (length(last_provider_event_type) between 3 and 120 and last_provider_event_type ~ '^[a-z0-9_.]+$')),
  constraint invoice_online_payment_attempts_contractor_idempotency_key
    unique (contractor_id, idempotency_key),
  constraint invoice_online_payment_attempts_source_link_check
    check (
      (source = 'request_free' and delivery_link_id is not null)
      or (source = 'authenticated_customer' and delivery_link_id is null)
    )
);

create unique index invoice_online_payment_attempts_one_actionable_invoice_idx
  on public.invoice_online_payment_attempts(invoice_id)
  where state in ('creating', 'open', 'processing');

create index invoice_online_payment_attempts_invoice_created_idx
  on public.invoice_online_payment_attempts(invoice_id, created_at desc);

create index invoice_online_payment_attempts_contractor_created_idx
  on public.invoice_online_payment_attempts(contractor_id, created_at desc);

create table public.stripe_connect_payment_events (
  event_id text primary key,
  stripe_account_id text not null,
  event_type text not null,
  event_created_at timestamptz not null,
  payment_attempt_id uuid references public.invoice_online_payment_attempts(id) on delete restrict,
  processing_outcome text not null default 'received' check (processing_outcome in ('received', 'applied', 'ignored', 'unbound')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint stripe_connect_payment_events_id_check
    check (event_id ~ '^evt_[A-Za-z0-9_]{8,}$'),
  constraint stripe_connect_payment_events_account_check
    check (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  constraint stripe_connect_payment_events_type_check
    check (length(event_type) between 3 and 120 and event_type ~ '^[a-z0-9_.]+$')
);

create index stripe_connect_payment_events_attempt_created_idx
  on public.stripe_connect_payment_events(payment_attempt_id, event_created_at desc)
  where payment_attempt_id is not null;

alter table public.contractor_stripe_payment_accounts owner to postgres;
alter table public.invoice_online_payment_attempts owner to postgres;
alter table public.stripe_connect_payment_events owner to postgres;

alter table public.contractor_stripe_payment_accounts enable row level security;
alter table public.contractor_stripe_payment_accounts force row level security;
alter table public.invoice_online_payment_attempts enable row level security;
alter table public.invoice_online_payment_attempts force row level security;
alter table public.stripe_connect_payment_events enable row level security;
alter table public.stripe_connect_payment_events force row level security;

revoke all on table public.contractor_stripe_payment_accounts from public, anon, authenticated, service_role;
revoke all on table public.invoice_online_payment_attempts from public, anon, authenticated, service_role;
revoke all on table public.stripe_connect_payment_events from public, anon, authenticated, service_role;

comment on table public.contractor_stripe_payment_accounts is
  'Private Stripe TEST connected-account status. Canonical responsibility is Stripe fee/loss collection with full hosted dashboard.';
comment on table public.invoice_online_payment_attempts is
  'Private asynchronous provider attempts for the existing ServSync Invoice obligation. Settled amounts update invoices; application fee is always zero.';
comment on table public.stripe_connect_payment_events is
  'Private idempotency and ordering ledger for signed Stripe Connect webhook events. No provider payload or payment credentials are stored.';

create function public.servsync_authorize_stripe_connect_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor public.contractor_profiles;
  v_account public.contractor_stripe_payment_accounts;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select contractor.*
    into v_contractor
    from public.contractor_profiles contractor
   where contractor.owner_user_id = auth.uid()
     and contractor.account_status = 'active'
   limit 1;

  if v_contractor.id is null then
    raise exception 'Only the active contractor owner can configure Online Payments.';
  end if;

  select account.* into v_account
    from public.contractor_stripe_payment_accounts account
   where account.contractor_id = v_contractor.id;

  return jsonb_build_object(
    'contractor_id', v_contractor.id,
    'business_name', coalesce(nullif(trim(v_contractor.business_name), ''), 'ServSync contractor'),
    'email', coalesce(nullif(trim(v_contractor.email), ''), ''),
    'stripe_account_id', v_account.stripe_account_id
  );
end;
$$;

create function public.servsync_sync_stripe_connect_account(
  p_contractor_id uuid,
  p_stripe_account_id text,
  p_account_status text,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_details_submitted boolean,
  p_card_payments_status text,
  p_ach_payments_status text,
  p_requirements_due_count integer,
  p_fees_collector text,
  p_losses_collector text,
  p_dashboard_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.contractor_stripe_payment_accounts;
begin
  if p_contractor_id is null
     or not exists (select 1 from public.contractor_profiles where id = p_contractor_id)
     or p_stripe_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or p_account_status not in ('setup_incomplete', 'verification_required', 'payments_pending', 'active', 'restricted')
     or p_card_payments_status not in ('active', 'inactive', 'pending', 'unrequested')
     or p_ach_payments_status not in ('active', 'inactive', 'pending', 'unrequested')
     or p_requirements_due_count is null or p_requirements_due_count < 0
     or p_fees_collector <> 'stripe'
     or p_losses_collector <> 'stripe'
     or p_dashboard_type <> 'full'
     or (p_account_status = 'active' and (not p_charges_enabled or p_card_payments_status <> 'active' or p_ach_payments_status <> 'active')) then
    raise exception 'Stripe connected-account status is incompatible with the ServSync test contract.';
  end if;

  select * into v_existing
    from public.contractor_stripe_payment_accounts
   where contractor_id = p_contractor_id
   for update;

  if v_existing.contractor_id is not null
     and v_existing.stripe_account_id <> p_stripe_account_id then
    raise exception 'Changing a contractor connected account requires a separate reviewed operation.';
  end if;

  insert into public.contractor_stripe_payment_accounts (
    contractor_id, stripe_account_id, account_status, charges_enabled, payouts_enabled,
    details_submitted, card_payments_status, ach_payments_status,
    requirements_due_count, fees_collector, losses_collector, dashboard_type
  ) values (
    p_contractor_id, p_stripe_account_id, p_account_status, p_charges_enabled, p_payouts_enabled,
    p_details_submitted, p_card_payments_status, p_ach_payments_status,
    p_requirements_due_count, p_fees_collector, p_losses_collector, p_dashboard_type
  )
  on conflict (contractor_id) do update
    set account_status = excluded.account_status,
        charges_enabled = excluded.charges_enabled,
        payouts_enabled = excluded.payouts_enabled,
        details_submitted = excluded.details_submitted,
        card_payments_status = excluded.card_payments_status,
        ach_payments_status = excluded.ach_payments_status,
        requirements_due_count = excluded.requirements_due_count,
        fees_collector = excluded.fees_collector,
        losses_collector = excluded.losses_collector,
        dashboard_type = excluded.dashboard_type,
        status_synced_at = now(),
        updated_at = now();
end;
$$;

create function public.servsync_get_stripe_connect_account_status()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor public.contractor_profiles;
  v_account public.contractor_stripe_payment_accounts;
  v_is_owner boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select contractor.* into v_contractor
    from public.contractor_profiles contractor
   where public.current_user_can_access_contractor(contractor.id)
   order by (contractor.owner_user_id = auth.uid()) desc
   limit 1;

  if v_contractor.id is null then
    raise exception 'Online Payments status is unavailable.';
  end if;
  v_is_owner := v_contractor.owner_user_id = auth.uid();

  select * into v_account
    from public.contractor_stripe_payment_accounts
   where contractor_id = v_contractor.id;

  if v_account.contractor_id is null then
    return jsonb_build_object('state', 'not_connected', 'can_manage', v_is_owner, 'mode', 'test');
  end if;

  return jsonb_build_object(
    'state', v_account.account_status,
    'can_manage', v_is_owner,
    'mode', v_account.mode,
    'charges_enabled', v_account.charges_enabled,
    'payouts_enabled', v_account.payouts_enabled,
    'card_payments_status', v_account.card_payments_status,
    'ach_payments_status', v_account.ach_payments_status,
    'requirements_due_count', v_account.requirements_due_count,
    'status_synced_at', v_account.status_synced_at,
    'application_fee_cents', 0
  );
end;
$$;

create function public.servsync_get_stripe_connect_account_contractor(p_stripe_account_id text)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor_id uuid;
begin
  if p_stripe_account_id is null or p_stripe_account_id !~ '^acct_[A-Za-z0-9]{8,}$' then
    return null;
  end if;
  select account.contractor_id into v_contractor_id
    from public.contractor_stripe_payment_accounts account
   where account.stripe_account_id = p_stripe_account_id
     and account.mode = 'test';
  return v_contractor_id;
end;
$$;

create function public.servsync_private_prepare_stripe_invoice_checkout(
  p_invoice_id uuid,
  p_idempotency_key uuid,
  p_source text,
  p_delivery_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_account public.contractor_stripe_payment_accounts;
  v_attempt public.invoice_online_payment_attempts;
  v_email text;
  v_amount integer;
begin
  perform pg_advisory_xact_lock(hashtext('servsync-stripe-checkout-' || p_invoice_id::text));

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if v_invoice.id is null
     or v_invoice.status not in ('sent', 'viewed', 'overdue', 'partially_paid')
     or v_invoice.amount_paid_cents >= v_invoice.total_cents then
    raise exception 'Invoice is not eligible for online payment.';
  end if;

  select * into v_account
    from public.contractor_stripe_payment_accounts
   where contractor_id = v_invoice.contractor_id
     and mode = 'test'
     and account_status = 'active'
     and charges_enabled
     and card_payments_status = 'active'
     and ach_payments_status = 'active';

  if v_account.contractor_id is null then
    raise exception 'Online payment is unavailable.';
  end if;

  select * into v_attempt
    from public.invoice_online_payment_attempts attempt
   where attempt.contractor_id = v_invoice.contractor_id
     and attempt.idempotency_key = p_idempotency_key;

  if v_attempt.id is not null then
    if v_attempt.invoice_id <> v_invoice.id
       or v_attempt.source <> p_source
       or v_attempt.delivery_link_id is distinct from p_delivery_link_id then
      raise exception 'Payment operation identifier was already used for different details.';
    end if;
  else
    if exists (
      select 1 from public.invoice_online_payment_attempts attempt
       where attempt.invoice_id = v_invoice.id
         and attempt.state in ('creating', 'open', 'processing')
    ) then
      raise exception 'An online payment is already in progress for this Invoice.';
    end if;

    v_amount := v_invoice.total_cents - v_invoice.amount_paid_cents;
    insert into public.invoice_online_payment_attempts (
      invoice_id, contractor_id, delivery_link_id, idempotency_key, source,
      stripe_account_id, amount_cents, invoice_status_before_payment
    ) values (
      v_invoice.id, v_invoice.contractor_id, p_delivery_link_id, p_idempotency_key, p_source,
      v_account.stripe_account_id, v_amount, v_invoice.status
    ) returning * into v_attempt;
  end if;

  if p_source = 'authenticated_customer' then
    select nullif(trim(profile.email), '') into v_email
      from public.profiles profile where profile.id = v_invoice.homeowner_user_id;
  else
    select nullif(trim(contact.email), '') into v_email
      from public.contractor_local_contacts contact where contact.id = v_invoice.local_contact_id;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'invoice_id', v_invoice.id,
    'contractor_id', v_invoice.contractor_id,
    'stripe_account_id', v_account.stripe_account_id,
    'amount_cents', v_attempt.amount_cents,
    'currency', 'usd',
    'description', concat_ws(' - ', nullif(trim(v_invoice.invoice_number), ''), nullif(trim(v_invoice.title), '')),
    'customer_email', v_email,
    'source', p_source
  );
end;
$$;

create function public.servsync_prepare_authenticated_stripe_invoice_checkout(
  p_invoice_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null or v_invoice.homeowner_user_id is distinct from auth.uid() then
    raise exception 'Invoice is not eligible for online payment.';
  end if;
  return public.servsync_private_prepare_stripe_invoice_checkout(
    p_invoice_id, p_idempotency_key, 'authenticated_customer', null
  );
end;
$$;

create function public.servsync_prepare_request_free_stripe_invoice_checkout(
  p_session_digest text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.local_invoice_delivery_sessions;
  v_link public.local_invoice_delivery_links;
  v_invoice public.invoices;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
begin
  if p_session_digest is null or p_session_digest !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invoice is not eligible for online payment.';
  end if;

  select * into v_session
    from public.local_invoice_delivery_sessions session
   where session.session_hash = decode(lower(p_session_digest), 'hex')
     and session.expires_at > clock_timestamp()
   for update;
  select * into v_link from public.local_invoice_delivery_links where id = v_session.delivery_link_id for update;
  select * into v_invoice from public.invoices where id = v_link.invoice_id for update;
  select * into v_contact from public.contractor_local_contacts where id = v_link.local_contact_id for update;
  select * into v_home from public.contractor_local_homes where id = v_link.local_home_id for update;

  if v_session.session_hash is null
     or v_link.id is null or v_invoice.id is null or v_contact.id is null or v_home.id is null
     or v_link.status <> 'active' or v_link.expires_at <= now()
     or v_link.invoice_id <> v_invoice.id
     or v_link.contractor_id <> v_invoice.contractor_id
     or v_invoice.homeowner_user_id is not null
     or v_invoice.local_contact_id is distinct from v_contact.id
     or v_invoice.local_home_id is distinct from v_home.id
     or v_contact.contractor_id <> v_invoice.contractor_id
     or v_home.contractor_id <> v_invoice.contractor_id
     or v_home.local_contact_id <> v_contact.id
     or v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_contact.archived_at is not null
     or v_home.home_id is not null or v_home.claimed_at is not null or v_home.archived_at is not null
     or v_session.contact_claimed_at_at_creation is distinct from v_contact.claimed_at
     or v_session.home_claimed_at_at_creation is distinct from v_home.claimed_at
     or not exists (
       select 1 from public.contractor_profiles contractor
        where contractor.id = v_invoice.contractor_id and contractor.account_status = 'active'
     ) then
    raise exception 'Invoice is not eligible for online payment.';
  end if;

  return public.servsync_private_prepare_stripe_invoice_checkout(
    v_invoice.id, p_idempotency_key, 'request_free', v_link.id
  );
end;
$$;

create function public.servsync_record_stripe_checkout_session(
  p_attempt_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_checkout_session_id !~ '^cs_test_[A-Za-z0-9_]{8,}$'
     or (p_payment_intent_id is not null and p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{8,}$') then
    raise exception 'Stripe Checkout identifiers are invalid.';
  end if;

  update public.invoice_online_payment_attempts
     set checkout_session_id = coalesce(checkout_session_id, p_checkout_session_id),
         payment_intent_id = coalesce(payment_intent_id, p_payment_intent_id),
         state = case when state = 'creating' then 'open' else state end,
         checkout_created_at = coalesce(checkout_created_at, now()),
         updated_at = now()
   where id = p_attempt_id
     and state in ('creating', 'open', 'processing')
     and (checkout_session_id is null or checkout_session_id = p_checkout_session_id)
     and (payment_intent_id is null or p_payment_intent_id is null or payment_intent_id = p_payment_intent_id);

  if not found then raise exception 'Stripe Checkout attempt is unavailable.'; end if;
end;
$$;

create function public.servsync_fail_stripe_invoice_checkout(
  p_attempt_id uuid,
  p_failure_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_failure_code is null or p_failure_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'Payment failure code is invalid.';
  end if;
  update public.invoice_online_payment_attempts
     set state = 'failed', failure_code = p_failure_code, failed_at = now(), updated_at = now()
   where id = p_attempt_id and state = 'creating' and checkout_session_id is null;
end;
$$;

create function public.servsync_reconcile_stripe_invoice_payment_event(
  p_event_id text,
  p_event_created_at timestamptz,
  p_event_type text,
  p_stripe_account_id text,
  p_attempt_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_charge_id text,
  p_payment_method_type text,
  p_provider_status text,
  p_provider_amount_cents integer,
  p_target_accounted_amount_cents integer,
  p_failure_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.invoice_online_payment_attempts;
  v_invoice public.invoices;
  v_inserted boolean := false;
  v_delta integer;
  v_next_paid integer;
  v_next_status text;
  v_next_attempt_state text;
  v_current_event_rank integer;
  v_incoming_event_rank integer;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]{8,}$'
     or p_event_created_at is null
     or p_event_type !~ '^[a-z0-9_.]{3,120}$'
     or p_stripe_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or p_provider_status not in ('processing', 'succeeded', 'failed', 'canceled', 'partially_refunded', 'refunded', 'disputed')
     or (p_payment_method_type is not null and p_payment_method_type not in ('card', 'us_bank_account'))
     or (p_target_accounted_amount_cents is not null and p_target_accounted_amount_cents < 0)
     or (p_failure_code is not null and p_failure_code !~ '^[a-z0-9_]{1,64}$') then
    raise exception 'Stripe payment event is invalid.';
  end if;

  insert into public.stripe_connect_payment_events (
    event_id, stripe_account_id, event_type, event_created_at
  ) values (p_event_id, p_stripe_account_id, p_event_type, p_event_created_at)
  on conflict (event_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  select * into v_attempt
    from public.invoice_online_payment_attempts attempt
   where attempt.stripe_account_id = p_stripe_account_id
     and (
       (p_attempt_id is not null and attempt.id = p_attempt_id)
       or (p_checkout_session_id is not null and attempt.checkout_session_id = p_checkout_session_id)
       or (p_payment_intent_id is not null and attempt.payment_intent_id = p_payment_intent_id)
       or (p_charge_id is not null and attempt.charge_id = p_charge_id)
     )
   order by (attempt.id = p_attempt_id) desc, attempt.created_at desc
   limit 1
   for update;

  if v_attempt.id is null then
    update public.stripe_connect_payment_events
       set processing_outcome = 'unbound', processed_at = now()
     where event_id = p_event_id;
    return jsonb_build_object('outcome', 'unbound');
  end if;

  if v_attempt.last_provider_event_created_at is not null
     and p_event_created_at < v_attempt.last_provider_event_created_at then
    update public.stripe_connect_payment_events
       set payment_attempt_id = v_attempt.id, processing_outcome = 'ignored', processed_at = now()
     where event_id = p_event_id;
    return jsonb_build_object('outcome', 'out_of_order');
  end if;

  v_incoming_event_rank := case
    when p_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then 30
    when p_event_type in ('payment_intent.succeeded', 'charge.succeeded') then 30
    when p_event_type = 'charge.refunded' then 40
    when p_event_type = 'charge.dispute.created' then 50
    when p_event_type = 'charge.dispute.closed' then 60
    when p_event_type in ('checkout.session.expired', 'checkout.session.async_payment_failed') then 20
    when p_event_type in ('payment_intent.payment_failed', 'payment_intent.canceled', 'charge.failed') then 20
    when p_event_type = 'payment_intent.processing' then 10
    else 0
  end;
  v_current_event_rank := case
    when v_attempt.last_provider_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then 30
    when v_attempt.last_provider_event_type in ('payment_intent.succeeded', 'charge.succeeded') then 30
    when v_attempt.last_provider_event_type = 'charge.refunded' then 40
    when v_attempt.last_provider_event_type = 'charge.dispute.created' then 50
    when v_attempt.last_provider_event_type = 'charge.dispute.closed' then 60
    when v_attempt.last_provider_event_type in ('checkout.session.expired', 'checkout.session.async_payment_failed') then 20
    when v_attempt.last_provider_event_type in ('payment_intent.payment_failed', 'payment_intent.canceled', 'charge.failed') then 20
    when v_attempt.last_provider_event_type = 'payment_intent.processing' then 10
    else 0
  end;

  if v_attempt.last_provider_event_created_at is not null
     and p_event_created_at = v_attempt.last_provider_event_created_at
     and v_incoming_event_rank < v_current_event_rank then
    update public.stripe_connect_payment_events
       set payment_attempt_id = v_attempt.id, processing_outcome = 'ignored', processed_at = now()
     where event_id = p_event_id;
    return jsonb_build_object('outcome', 'out_of_order');
  end if;

  if p_provider_amount_cents is not null and p_provider_amount_cents > v_attempt.amount_cents then
    raise exception 'Stripe provider amount exceeds the authorized Invoice amount.';
  end if;
  if p_target_accounted_amount_cents is not null and p_target_accounted_amount_cents > v_attempt.amount_cents then
    raise exception 'Stripe accounted amount exceeds the authorized Invoice amount.';
  end if;

  if (v_attempt.checkout_session_id is not null and p_checkout_session_id is not null and v_attempt.checkout_session_id <> p_checkout_session_id)
     or (v_attempt.payment_intent_id is not null and p_payment_intent_id is not null and v_attempt.payment_intent_id <> p_payment_intent_id)
     or (v_attempt.charge_id is not null and p_charge_id is not null and v_attempt.charge_id <> p_charge_id) then
    raise exception 'Stripe provider identifiers do not match the authorized attempt.';
  end if;

  select * into v_invoice from public.invoices where id = v_attempt.invoice_id for update;
  if v_invoice.id is null or v_invoice.contractor_id <> v_attempt.contractor_id then
    raise exception 'Stripe payment Invoice binding is invalid.';
  end if;

  if p_target_accounted_amount_cents is not null then
    v_delta := p_target_accounted_amount_cents - v_attempt.accounted_amount_cents;
    v_next_paid := v_invoice.amount_paid_cents + v_delta;
    if v_next_paid < 0 or v_next_paid > v_invoice.total_cents then
      raise exception 'Stripe reconciliation would make the Invoice balance invalid.';
    end if;

    v_next_status := case
      when v_next_paid = v_invoice.total_cents then 'paid'
      when v_next_paid > 0 then 'partially_paid'
      when v_attempt.invoice_status_before_payment in ('sent', 'viewed', 'overdue') then v_attempt.invoice_status_before_payment
      else 'sent'
    end;

    update public.invoices
       set amount_paid_cents = v_next_paid,
           status = v_next_status,
           paid_at = case when v_next_status = 'paid' then coalesce(paid_at, now()) else null end,
           updated_at = now()
     where id = v_invoice.id;
  else
    v_delta := 0;
  end if;

  v_next_attempt_state := case p_provider_status
    when 'processing' then 'processing'
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'canceled' then 'canceled'
    when 'partially_refunded' then 'partially_refunded'
    when 'refunded' then 'refunded'
    when 'disputed' then 'disputed'
  end;

  update public.invoice_online_payment_attempts
     set checkout_session_id = coalesce(checkout_session_id, p_checkout_session_id),
         payment_intent_id = coalesce(payment_intent_id, p_payment_intent_id),
         charge_id = coalesce(charge_id, p_charge_id),
         payment_method_type = coalesce(p_payment_method_type, payment_method_type),
         state = v_next_attempt_state,
         accounted_amount_cents = coalesce(p_target_accounted_amount_cents, accounted_amount_cents),
         failure_code = p_failure_code,
         last_provider_event_created_at = p_event_created_at,
         last_provider_event_type = p_event_type,
         processing_at = case when v_next_attempt_state = 'processing' then coalesce(processing_at, now()) else processing_at end,
         succeeded_at = case when v_next_attempt_state = 'succeeded' then coalesce(succeeded_at, now()) else succeeded_at end,
         failed_at = case when v_next_attempt_state in ('failed', 'canceled') then coalesce(failed_at, now()) else failed_at end,
         reversed_at = case when v_next_attempt_state in ('partially_refunded', 'refunded', 'disputed') then coalesce(reversed_at, now()) else reversed_at end,
         updated_at = now()
   where id = v_attempt.id;

  update public.stripe_connect_payment_events
     set payment_attempt_id = v_attempt.id, processing_outcome = 'applied', processed_at = now()
   where event_id = p_event_id;

  return jsonb_build_object('outcome', 'applied', 'accounting_delta_cents', v_delta);
end;
$$;

create function public.servsync_list_invoice_online_payments(p_invoice_id uuid)
returns table (
  id uuid,
  amount_cents integer,
  accounted_amount_cents integer,
  state text,
  payment_method_type text,
  checkout_created_at timestamptz,
  processing_at timestamptz,
  succeeded_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_invoice public.invoices;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select invoice.* into v_invoice from public.invoices invoice where invoice.id = p_invoice_id;
  if v_invoice.id is null or not public.current_user_can_manage_contractor_billing(v_invoice.contractor_id) then
    raise exception 'Invoice not found.';
  end if;

  return query
  select attempt.id, attempt.amount_cents, attempt.accounted_amount_cents, attempt.state,
         attempt.payment_method_type, attempt.checkout_created_at, attempt.processing_at,
         attempt.succeeded_at, attempt.reversed_at, attempt.created_at
    from public.invoice_online_payment_attempts attempt
   where attempt.invoice_id = v_invoice.id
   order by attempt.created_at desc;
end;
$$;

create function public.servsync_get_invoice_online_payment_state(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_invoice public.invoices;
  v_account public.contractor_stripe_payment_accounts;
  v_attempt public.invoice_online_payment_attempts;
  v_authorized boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select * into v_invoice from public.invoices where id = p_invoice_id;
  v_authorized := v_invoice.homeowner_user_id = auth.uid()
    or public.current_user_can_access_contractor(v_invoice.contractor_id);
  if v_invoice.id is null or not v_authorized then raise exception 'Invoice not found.'; end if;

  select * into v_account from public.contractor_stripe_payment_accounts where contractor_id = v_invoice.contractor_id;
  select * into v_attempt from public.invoice_online_payment_attempts
   where invoice_id = v_invoice.id order by created_at desc limit 1;

  return jsonb_build_object(
    'available', v_account.account_status = 'active'
      and v_invoice.status in ('sent', 'viewed', 'overdue', 'partially_paid')
      and v_invoice.amount_paid_cents < v_invoice.total_cents,
    'mode', 'test',
    'invoice_id', v_invoice.id,
    'amount_due_cents', greatest(v_invoice.total_cents - v_invoice.amount_paid_cents, 0),
    'payment_state', coalesce(v_attempt.state, 'outstanding'),
    'payment_method_type', v_attempt.payment_method_type,
    'application_fee_cents', 0
  );
end;
$$;

create function public.servsync_get_request_free_invoice_online_payment_state(
  p_session_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_invoice public.invoices;
  v_account public.contractor_stripe_payment_accounts;
  v_attempt public.invoice_online_payment_attempts;
begin
  if p_session_digest is null or p_session_digest !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('available', false);
  end if;

  select invoice.* into v_invoice
    from public.local_invoice_delivery_sessions session
    join public.local_invoice_delivery_links link on link.id = session.delivery_link_id
    join public.invoices invoice on invoice.id = link.invoice_id
    join public.contractor_local_contacts contact on contact.id = link.local_contact_id
    join public.contractor_local_homes home on home.id = link.local_home_id
   where session.session_hash = decode(lower(p_session_digest), 'hex')
     and session.expires_at > clock_timestamp()
     and link.status = 'active' and link.expires_at > now()
     and invoice.homeowner_user_id is null
     and invoice.local_contact_id = contact.id and invoice.local_home_id = home.id
     and contact.homeowner_user_id is null and contact.claimed_at is null and contact.archived_at is null
     and home.home_id is null and home.claimed_at is null and home.archived_at is null
     and session.contact_claimed_at_at_creation is not distinct from contact.claimed_at
     and session.home_claimed_at_at_creation is not distinct from home.claimed_at;

  if v_invoice.id is null then return jsonb_build_object('available', false); end if;
  select * into v_account from public.contractor_stripe_payment_accounts where contractor_id = v_invoice.contractor_id;
  select * into v_attempt from public.invoice_online_payment_attempts where invoice_id = v_invoice.id order by created_at desc limit 1;

  return jsonb_build_object(
    'available', v_account.account_status = 'active'
      and v_invoice.status in ('sent', 'viewed', 'overdue', 'partially_paid')
      and v_invoice.amount_paid_cents < v_invoice.total_cents,
    'mode', 'test',
    'amount_due_cents', greatest(v_invoice.total_cents - v_invoice.amount_paid_cents, 0),
    'payment_state', coalesce(v_attempt.state, 'outstanding'),
    'payment_method_type', v_attempt.payment_method_type,
    'application_fee_cents', 0
  );
end;
$$;

create function public.servsync_private_guard_invoice_online_payment_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.invoice_online_payment_attempts attempt
     where attempt.invoice_id = new.invoice_id
       and attempt.state in ('creating', 'open', 'processing')
  ) then
    raise exception 'An online payment is in progress. Wait for it to finish or expire before recording an offline payment.';
  end if;
  return new;
end;
$$;

create trigger invoice_offline_payment_records_online_conflict
  before insert on public.invoice_offline_payment_records
  for each row execute function public.servsync_private_guard_invoice_online_payment_conflict();

create function public.servsync_private_guard_invoice_void_online_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'void' and old.status <> 'void' and exists (
    select 1 from public.invoice_online_payment_attempts attempt
     where attempt.invoice_id = old.id and attempt.state in ('creating', 'open', 'processing')
  ) then
    raise exception 'An online payment is in progress. The Invoice cannot be voided yet.';
  end if;
  return new;
end;
$$;

create trigger invoices_online_payment_void_guard
  before update of status on public.invoices
  for each row execute function public.servsync_private_guard_invoice_void_online_payment();

alter function public.servsync_authorize_stripe_connect_onboarding() owner to postgres;
alter function public.servsync_sync_stripe_connect_account(uuid,text,text,boolean,boolean,boolean,text,text,integer,text,text,text) owner to postgres;
alter function public.servsync_get_stripe_connect_account_status() owner to postgres;
alter function public.servsync_get_stripe_connect_account_contractor(text) owner to postgres;
alter function public.servsync_private_prepare_stripe_invoice_checkout(uuid,uuid,text,uuid) owner to postgres;
alter function public.servsync_prepare_authenticated_stripe_invoice_checkout(uuid,uuid) owner to postgres;
alter function public.servsync_prepare_request_free_stripe_invoice_checkout(text,uuid) owner to postgres;
alter function public.servsync_record_stripe_checkout_session(uuid,text,text) owner to postgres;
alter function public.servsync_fail_stripe_invoice_checkout(uuid,text) owner to postgres;
alter function public.servsync_reconcile_stripe_invoice_payment_event(text,timestamptz,text,text,uuid,text,text,text,text,text,integer,integer,text) owner to postgres;
alter function public.servsync_get_invoice_online_payment_state(uuid) owner to postgres;
alter function public.servsync_get_request_free_invoice_online_payment_state(text) owner to postgres;
alter function public.servsync_list_invoice_online_payments(uuid) owner to postgres;
alter function public.servsync_private_guard_invoice_online_payment_conflict() owner to postgres;
alter function public.servsync_private_guard_invoice_void_online_payment() owner to postgres;

revoke all on function public.servsync_authorize_stripe_connect_onboarding() from public, anon, service_role;
grant execute on function public.servsync_authorize_stripe_connect_onboarding() to authenticated;
revoke all on function public.servsync_get_stripe_connect_account_status() from public, anon, service_role;
grant execute on function public.servsync_get_stripe_connect_account_status() to authenticated;
revoke all on function public.servsync_prepare_authenticated_stripe_invoice_checkout(uuid,uuid) from public, anon, service_role;
grant execute on function public.servsync_prepare_authenticated_stripe_invoice_checkout(uuid,uuid) to authenticated;
revoke all on function public.servsync_get_invoice_online_payment_state(uuid) from public, anon, service_role;
grant execute on function public.servsync_get_invoice_online_payment_state(uuid) to authenticated;
revoke all on function public.servsync_list_invoice_online_payments(uuid) from public, anon, service_role;
grant execute on function public.servsync_list_invoice_online_payments(uuid) to authenticated;

revoke all on function public.servsync_sync_stripe_connect_account(uuid,text,text,boolean,boolean,boolean,text,text,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.servsync_sync_stripe_connect_account(uuid,text,text,boolean,boolean,boolean,text,text,integer,text,text,text) to service_role;
revoke all on function public.servsync_get_stripe_connect_account_contractor(text) from public, anon, authenticated;
grant execute on function public.servsync_get_stripe_connect_account_contractor(text) to service_role;
revoke all on function public.servsync_prepare_request_free_stripe_invoice_checkout(text,uuid) from public, anon, authenticated;
grant execute on function public.servsync_prepare_request_free_stripe_invoice_checkout(text,uuid) to service_role;
revoke all on function public.servsync_record_stripe_checkout_session(uuid,text,text) from public, anon, authenticated;
grant execute on function public.servsync_record_stripe_checkout_session(uuid,text,text) to service_role;
revoke all on function public.servsync_fail_stripe_invoice_checkout(uuid,text) from public, anon, authenticated;
grant execute on function public.servsync_fail_stripe_invoice_checkout(uuid,text) to service_role;
revoke all on function public.servsync_reconcile_stripe_invoice_payment_event(text,timestamptz,text,text,uuid,text,text,text,text,text,integer,integer,text) from public, anon, authenticated;
grant execute on function public.servsync_reconcile_stripe_invoice_payment_event(text,timestamptz,text,text,uuid,text,text,text,text,text,integer,integer,text) to service_role;
revoke all on function public.servsync_get_request_free_invoice_online_payment_state(text) from public, anon, authenticated;
grant execute on function public.servsync_get_request_free_invoice_online_payment_state(text) to service_role;

revoke all on function public.servsync_private_prepare_stripe_invoice_checkout(uuid,uuid,text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_invoice_online_payment_conflict() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_invoice_void_online_payment() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
