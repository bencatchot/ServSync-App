-- ServSync Stripe billing prep.
-- Paste into the Supabase SQL Editor.
-- Run after servsync-email-prep.sql.
-- No Stripe account required — the edge function is gated by STRIPE_WEBHOOK_SECRET.

begin;

-- Store Stripe IDs alongside contractor records
alter table public.contractor_profiles
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text;

-- Index for fast webhook lookups by Stripe customer/subscription ID
create index if not exists idx_contractor_stripe_customer
  on public.contractor_profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists idx_contractor_stripe_subscription
  on public.contractor_profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- RPC: called by the stripe-webhook edge function (service role) to sync subscription state.
-- Not exposed to end users — the edge function uses the service role key directly.
create or replace function public.servsync_sync_stripe_subscription(
  p_stripe_customer_id     text,
  p_stripe_subscription_id text,
  p_subscription_status    text,   -- Stripe status: active | trialing | past_due | canceled | unpaid | paused
  p_monthly_price_cents    int     -- 0 when subscription is canceled
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_subscription_status not in ('trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid') then
    raise exception 'Invalid subscription status: %', p_subscription_status;
  end if;

  update public.contractor_profiles
     set stripe_subscription_id = p_stripe_subscription_id,
         subscription_status     = p_subscription_status,
         monthly_price_cents      = p_monthly_price_cents,
         updated_at               = now()
   where stripe_customer_id = p_stripe_customer_id;
end;
$$;

-- RPC: called by the stripe-webhook edge function to record a new contractor's Stripe customer ID
-- the first time a checkout.session.completed event fires.
create or replace function public.servsync_set_stripe_customer(
  p_contractor_id      uuid,
  p_stripe_customer_id text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.contractor_profiles
     set stripe_customer_id = p_stripe_customer_id,
         updated_at          = now()
   where id = p_contractor_id;
end;
$$;

-- These RPCs are for Stripe webhooks only. Do not allow browser clients to
-- call them through PostgREST with the anon/authenticated keys.
revoke all on function public.servsync_sync_stripe_subscription(text, text, text, int) from public, anon, authenticated;
revoke all on function public.servsync_set_stripe_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.servsync_sync_stripe_subscription(text, text, text, int) to service_role;
grant execute on function public.servsync_set_stripe_customer(uuid, text) to service_role;

-- ── How to activate Stripe when ready ───────────────────────────────────────
--
-- 1. Create a Stripe account at stripe.com (free to sign up).
--
-- 2. Create a Product + recurring Price in the Stripe Dashboard.
--
-- 3. Deploy the edge function:
--      supabase functions deploy stripe-webhook
--
-- 4. In Supabase Dashboard → Project Settings → Edge Functions, add:
--      STRIPE_ENABLED          = true
--      STRIPE_WEBHOOK_SECRET   = whsec_xxxxx   (from Stripe Dashboard → Webhooks)
--
-- 5. In the Stripe Dashboard → Developers → Webhooks, add an endpoint:
--      URL:    https://<project-ref>.supabase.co/functions/v1/stripe-webhook
--      Events: customer.subscription.created
--              customer.subscription.updated
--              customer.subscription.deleted
--              checkout.session.completed
--
-- 6. Pass contractor_id as metadata.contractor_id in your Stripe Checkout session
--    so the webhook can link the Stripe customer to the right contractor record.
--
-- That's it — subscription_status in contractor_profiles will stay in sync automatically.

notify pgrst, 'reload schema';

commit;
