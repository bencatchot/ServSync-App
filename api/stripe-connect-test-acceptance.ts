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
      await stripe.v2.core.accounts.update(accountId, {
        contact_phone: '0000000000',
        configuration: {
          merchant: {
            mcc: '1520',
            statement_descriptor: { descriptor: 'SERVSYNC TEST' },
            support: { email: authorization.email, phone: '0000000000' },
          },
        },
        defaults: {
          profile: {
            doing_business_as: authorization.business_name,
            business_url: 'https://accessible.stripe.com',
            product_description: 'ServSync Stripe TEST provider acceptance contractor.',
          },
        },
        identity: {
          entity_type: 'individual',
          individual: {
            given_name: 'Test',
            surname: 'Contractor',
            email: authorization.email,
            phone: '0000000000',
            date_of_birth: { day: 1, month: 1, year: 1901 },
            address: {
              line1: 'address_full_match',
              city: 'Chicago',
              state: 'IL',
              postal_code: '60601',
              country: 'US',
            },
            id_numbers: [{ type: 'us_ssn_last_4', value: '0000' }],
          },
        },
        include: ['configuration.merchant', 'defaults', 'identity', 'requirements'],
      });
      try {
        const banks = await stripe.accounts.listExternalAccounts(accountId, { object: 'bank_account', limit: 1 });
        if (banks.data.length === 0) {
          await stripe.accounts.createExternalAccount(accountId, { external_account: 'btok_us_verified' });
        }
      } catch {
        // Accounts v2 with a full Dashboard can require payout details through Stripe-hosted onboarding.
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
