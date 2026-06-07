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

const WEBHOOK_TOLERANCE_SECONDS = 300;

function parseStripeSignature(header: string) {
  const parts = header.split(',').map(part => part.trim());
  const timestamp = parts.find(part => part.startsWith('t='))?.slice(2) ?? '';
  const signatures = parts
    .filter(part => part.startsWith('v1='))
    .map(part => part.slice(3))
    .filter(Boolean);
  return { timestamp, signatures };
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyStripeSignature(body: string, signatureHeader: string, secret: string) {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  const timestampSeconds = Number(timestamp);
  if (!timestamp || !Number.isFinite(timestampSeconds) || signatures.length === 0) {
    return false;
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${body}`;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');

  return signatures.some(signature => timingSafeEqualHex(computed, signature));
}

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

  // Stripe signature verification using the Web Crypto API (no Stripe SDK needed).
  // Accepts any v1 signature in the header and rejects stale replay attempts.
  if (!(await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET))) {
    console.error('[stripe-webhook] Signature mismatch');
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error: eventInsertError } = await supabase
    .from('stripe_webhook_events')
    .insert({ id: event.id, event_type: event.type });

  if (eventInsertError?.code === '23505') {
    return new Response(JSON.stringify({ handled: true, duplicate: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (eventInsertError) {
    console.error('[stripe-webhook] Unable to record webhook event:', eventInsertError);
    return new Response('Unable to record webhook event', { status: 500 });
  }

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
    return new Response(JSON.stringify({ handled: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Unhandled event type — return 200 so Stripe doesn't retry
  return new Response(JSON.stringify({ handled: false, reason: 'unhandled_event_type' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
