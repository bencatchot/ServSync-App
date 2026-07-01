-- ServSync contractor beta billing-readiness admin visibility.
--
-- This slice adds read-only platform-admin reporting for contractor billing
-- readiness. It does not activate Stripe checkout, charge users, require
-- credit cards, add editable billing controls, or enforce subscription gates.

begin;

create or replace function public.servsync_admin_contractor_billing_readiness()
returns table (
  contractor_id uuid,
  business_name text,
  contact_name text,
  email text,
  phone text,
  trade_category text,
  service_area text,
  account_status text,
  legacy_subscription_status text,
  legacy_monthly_price_cents integer,
  billing_status text,
  access_mode text,
  current_plan text,
  beta_cohort text,
  beta_started_at timestamptz,
  founder_discount_eligible boolean,
  subscription_required_after timestamptz,
  grace_period_ends_at timestamptz,
  monthly_price_cents integer,
  has_stripe_customer_id boolean,
  has_stripe_subscription_id boolean,
  can_create_estimates boolean,
  can_create_jobs boolean,
  can_create_invoices boolean,
  can_use_ai_features boolean,
  can_invite_team_members boolean,
  max_team_seats integer,
  max_storage_mb integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    cp.id as contractor_id,
    coalesce(cp.business_name, '')::text as business_name,
    coalesce(cp.contact_name, '')::text as contact_name,
    coalesce(cp.email, '')::text as email,
    coalesce(cp.phone, '')::text as phone,
    coalesce(nullif(array_to_string(cp.service_categories, ', '), ''), 'Unspecified')::text as trade_category,
    coalesce(
      nullif(concat_ws(', ', nullif(cp.city, ''), nullif(cp.state, '')), ''),
      nullif(array_to_string(cp.service_zip_codes, ', '), ''),
      'Unspecified'
    )::text as service_area,
    coalesce(cp.account_status::text, 'active') as account_status,
    coalesce(cp.subscription_status::text, 'trialing') as legacy_subscription_status,
    coalesce(cp.monthly_price_cents, 0)::integer as legacy_monthly_price_cents,
    coalesce(cba.billing_status, ent.billing_status, 'beta_free')::text as billing_status,
    coalesce(cba.access_mode, ent.access_mode, 'full_beta')::text as access_mode,
    coalesce(cba.current_plan, ent.current_plan, 'beta_free')::text as current_plan,
    cba.beta_cohort,
    cba.beta_started_at,
    coalesce(cba.founder_discount_eligible, false) as founder_discount_eligible,
    cba.subscription_required_after,
    cba.grace_period_ends_at,
    coalesce(cba.monthly_price_cents, 0)::integer as monthly_price_cents,
    length(coalesce(cba.stripe_customer_id, '')) > 0 as has_stripe_customer_id,
    length(coalesce(cba.stripe_subscription_id, '')) > 0 as has_stripe_subscription_id,
    coalesce(ent.can_create_estimates, false) as can_create_estimates,
    coalesce(ent.can_create_jobs, false) as can_create_jobs,
    coalesce(ent.can_create_invoices, false) as can_create_invoices,
    coalesce(ent.can_use_ai_features, false) as can_use_ai_features,
    coalesce(ent.can_invite_team_members, false) as can_invite_team_members,
    coalesce(ent.max_team_seats, 0)::integer as max_team_seats,
    coalesce(ent.max_storage_mb, 0)::integer as max_storage_mb
  from public.contractor_profiles cp
  left join public.contractor_billing_accounts cba
    on cba.contractor_id = cp.id
  left join lateral public.servsync_current_contractor_entitlements(cp.id) ent
    on true
  order by cp.created_at desc, cp.business_name;
end;
$$;

comment on function public.servsync_admin_contractor_billing_readiness() is
  'Read-only platform-admin contractor billing-readiness report. Returns Stripe presence booleans, not provider identifiers.';

revoke all on function public.servsync_admin_contractor_billing_readiness() from public, anon, authenticated;
grant execute on function public.servsync_admin_contractor_billing_readiness() to authenticated;

notify pgrst, 'reload schema';

commit;
