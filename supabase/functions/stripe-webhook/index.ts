// ServSync — stripe-webhook edge function
// Syncs Stripe subscription state into contractor_profiles.
//
// To activate:
//   1. Deploy:  supabase functions deploy stripe-webhook
//   2. Set env vars in Supabase dashboard (Project Settings → Edge Functions):
//        STRIPE_ENABLED=true
//        STRIPE_WEBHOOK_SECRET=whsec_xxxxx   ← from Stripe Dashboard → Webhooks
//   3. In Stripe Dashboard → Developers → Webhooks, register:
//        https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//        Events: customer.subscription.created/updated/deleted, checkout.session.completed

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_ENABLED = Deno.env.get('STRIPE_ENABLED') === 'true';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

// Map Stripe subscription statuses to our enum values
const STATUS_MAP: Record<string, string> = {
  active:    'active',
  trialing:  'trialing',
  past_due:  'past_due',
  canceled:  'canceled',
  unpaid:    'unpaid',
  paused:    'paused',
  incomplete: 'past_due',
  incomplete_expired: 'canceled',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!STRIPE_ENABLED) {
    console.log('[stripe-webhook] Disabled — set STRIPE_ENABLED=true to activate.');
    return new Response(JSON.stringify({ handled: false, reason: 'disabled' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify Stripe webhook signature
  const signature = req.headers.get('stripe-signature');
  if (!signature || !STRIPE_WEBHOOK_SECRET) {
    return new Response('Missing signature', { status: 400 });
  }

  const body = await req.text();

  // Stripe signature verification using the Web Crypto API (no Stripe SDK needed)
  const [, tsStr, , v1Sig] = signature.split(',').flatMap(p => p.split('='));
  const ts = tsStr;
  const signed = `${ts}.${body}`;
  const keyData = new TextEncoder().encode(STRIPE_WEBHOOK_SECRET);
  const msgData = new TextEncoder().encode(signed);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const computed = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (computed !== v1Sig) {
    console.error('[stripe-webhook] Signature mismatch');
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body);
  console.log('[stripe-webhook] Event:', event.type);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── checkout.session.completed — link Stripe customer to contractor ─────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const contractorId: string | undefined = session.metadata?.contractor_id;
    const customerId: string | undefined = session.customer;
    if (contractorId && customerId) {
      await supabase.rpc('servsync_set_stripe_customer', {
        p_contractor_id:      contractorId,
        p_stripe_customer_id: customerId,
      });
      console.log(`[stripe-webhook] Linked customer ${customerId} → contractor ${contractorId}`);
    }
    return new Response(JSON.stringify({ handled: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ── subscription events — sync status ──────────────────────────────────────
  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object;
    const customerId: string = sub.customer;
    const subscriptionId: string = sub.id;
    const stripeStatus: string = sub.status;
    const status = STATUS_MAP[stripeStatus] ?? 'canceled';

    // Pull the monthly price from the first subscription item
    const unitAmount: number = sub.items?.data?.[0]?.price?.unit_amount ?? 0;

    await supabase.rpc('servsync_sync_stripe_subscription', {
      p_stripe_customer_id:     customerId,
      p_stripe_subscription_id: subscriptionId,
      p_subscription_status:    status,
      p_monthly_price_cents:    event.type === 'customer.subscription.deleted' ? 0 : unitAmount,
    });

    console.log(`[stripe-webhook] Synced subscription ${subscriptionId} → status: ${status}`);
    return new Response(JSON.stringify({ handled: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Unhandled event type — return 200 so Stripe doesn't retry
  return new Response(JSON.stringify({ handled: false, reason: 'unhandled_event_type' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
