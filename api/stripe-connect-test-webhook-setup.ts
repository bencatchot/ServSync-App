import { createClient } from '@supabase/supabase-js';
import {
  bearerToken,
  createStripeClient,
  sameOriginRequest,
  stripeConnectServerConfig,
} from '../server/stripeConnect.js';

const PREVIEW_WEBHOOK_ORIGIN = 'https://serv-sync-app-refresh-git-codex-str-1383fb-bencatchots-projects.vercel.app';
const WEBHOOK_DESCRIPTION = 'ServSync PR396 Sandbox Preview';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Temporary provider-acceptance route. Removed before the PR is declared merge-ready.
export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ status: 'failed' }, 405);
    if (!sameOriginRequest(request)) return json({ status: 'failed' }, 403);
    const config = stripeConnectServerConfig();
    const token = bearerToken(request);
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
    if (!config || !token || !bypassSecret || process.env.VERCEL_ENV !== 'preview') {
      return json({ status: 'failed' }, 403);
    }

    const user = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await user.rpc('servsync_authorize_stripe_connect_onboarding');
    if (error || !data || typeof data !== 'object') return json({ status: 'failed' }, 403);
    const authorization = data as { business_name: string; stripe_account_id: string | null };
    if (!authorization.stripe_account_id || authorization.business_name !== 'ServSync Stripe TEST Fixture') {
      return json({ status: 'failed' }, 403);
    }

    const stripe = createStripeClient(config.secretKey);
    try {
      const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
      for (const endpoint of endpoints.data) {
        if (endpoint.description === WEBHOOK_DESCRIPTION) await stripe.webhookEndpoints.del(endpoint.id);
      }
      const url = `${PREVIEW_WEBHOOK_ORIGIN}/api/stripe-connect-webhook?x-vercel-protection-bypass=${encodeURIComponent(bypassSecret)}`;
      const endpoint = await stripe.webhookEndpoints.create({
        url,
        connect: true,
        description: WEBHOOK_DESCRIPTION,
        enabled_events: [
          'account.updated',
          'charge.dispute.closed',
          'charge.dispute.created',
          'charge.failed',
          'charge.refunded',
          'charge.succeeded',
          'checkout.session.async_payment_failed',
          'checkout.session.async_payment_succeeded',
          'checkout.session.completed',
          'checkout.session.expired',
          'payment_intent.canceled',
          'payment_intent.payment_failed',
          'payment_intent.processing',
          'payment_intent.succeeded',
        ],
      });
      return json({ status: 'created', endpoint_id: endpoint.id, signing_secret: endpoint.secret });
    } catch {
      return json({ status: 'failed' }, 400);
    }
  },
};
