import { createClient } from '@supabase/supabase-js';
import {
  bearerToken,
  canonicalStripeAccountSnapshot,
  createStripeClient,
  sameOriginRequest,
  stripeConnectServerConfig,
} from '../server/stripeConnect.js';

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
    if (!config || !token || process.env.VERCEL_ENV !== 'preview') return json({ status: 'failed' }, 403);

    const user = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await user.rpc('servsync_authorize_stripe_connect_onboarding');
    if (error || !data || typeof data !== 'object') return json({ status: 'failed' }, 403);
    const authorization = data as { business_name: string; email: string; stripe_account_id: string | null };
    if (!authorization.stripe_account_id || !authorization.email.endsWith('@example.com')) return json({ status: 'failed' }, 403);

    const stripe = createStripeClient(config.secretKey);
    try {
      const accountId = authorization.stripe_account_id;
      await stripe.accounts.update(accountId, {
        business_type: 'individual',
        business_profile: {
          mcc: '1520',
          name: authorization.business_name,
          product_description: 'ServSync Stripe TEST provider acceptance contractor.',
          url: 'https://accessible.stripe.com',
        },
        individual: {
          first_name: 'Test',
          last_name: 'Contractor',
          email: authorization.email,
          phone: '0000000000',
          dob: { day: 1, month: 1, year: 1901 },
          address: {
            line1: 'address_full_match',
            city: 'Chicago',
            state: 'IL',
            postal_code: '60601',
            country: 'US',
          },
          ssn_last_4: '0000',
        },
        tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
      });
      const banks = await stripe.accounts.listExternalAccounts(accountId, { object: 'bank_account', limit: 1 });
      if (banks.data.length === 0) {
        await stripe.accounts.createExternalAccount(accountId, { external_account: 'btok_us_verified' });
      }
      const account = await stripe.v2.core.accounts.retrieve(accountId, {
        include: ['configuration.merchant', 'defaults', 'identity', 'requirements'],
      });
      return json({ status: 'updated', account: canonicalStripeAccountSnapshot(account) });
    } catch (providerError) {
      const error = providerError as { type?: unknown; code?: unknown; param?: unknown; statusCode?: unknown };
      console.error(JSON.stringify({
        event: 'stripe_connect_test_acceptance_failed',
        type: typeof error.type === 'string' ? error.type : null,
        code: typeof error.code === 'string' ? error.code : null,
        param: typeof error.param === 'string' ? error.param : null,
        status_code: typeof error.statusCode === 'number' ? error.statusCode : null,
      }));
      return json({ status: 'failed' }, 400);
    }
  },
};
