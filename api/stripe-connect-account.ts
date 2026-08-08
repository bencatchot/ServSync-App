import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@vercel/firewall';
import type Stripe from 'stripe';
import {
  bearerToken,
  canonicalConnectedAccountCreateParams,
  canonicalStripeAccountSnapshot,
  createStripeClient,
  publicOrigin,
  sameOriginRequest,
  stripeConnectServerConfig,
} from '../server/stripeConnect.js';

export const STRIPE_CONNECT_ACCOUNT_RATE_LIMIT_ID = 'stripe-connect-account';
export const MAX_STRIPE_CONNECT_ACCOUNT_REQUEST_BYTES = 512;

type Authorization = {
  contractor_id: string;
  business_name: string;
  email: string;
  stripe_account_id: string | null;
};

type Dependencies = {
  configured: () => boolean;
  authorize: (accessToken: string) => Promise<Authorization>;
  createAccount: (authorization: Authorization) => Promise<Stripe.V2.Core.Account>;
  retrieveAccount: (accountId: string) => Promise<Stripe.V2.Core.Account>;
  persistAccount: (contractorId: string, account: Stripe.V2.Core.Account) => Promise<void>;
  createAccountLink: (accountId: string, refreshUrl: string, returnUrl: string) => Promise<string>;
  rateLimit: (request: Request) => Promise<'ok' | 'limited' | 'unconfigured'>;
};

type OnboardingStage = 'authorize' | 'create_account' | 'retrieve_account' | 'persist_account' | 'create_account_link';

function safeProviderError(error: unknown) {
  if (!error || typeof error !== 'object') return { kind: 'unknown' };
  const candidate = error as {
    type?: unknown;
    code?: unknown;
    param?: unknown;
    statusCode?: unknown;
    requestId?: unknown;
    message?: unknown;
  };
  const message = typeof candidate.message === 'string'
    ? candidate.message
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
      .replace(/\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+\b/g, '[redacted-key]')
      .replace(/\bwhsec_[A-Za-z0-9]+\b/g, '[redacted-webhook-secret]')
      .slice(0, 500)
    : null;
  return {
    kind: 'provider',
    type: typeof candidate.type === 'string' ? candidate.type : null,
    code: typeof candidate.code === 'string' ? candidate.code : null,
    param: typeof candidate.param === 'string' ? candidate.param : null,
    status_code: typeof candidate.statusCode === 'number' ? candidate.statusCode : null,
    request_id: typeof candidate.requestId === 'string' ? candidate.requestId : null,
    message,
  };
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function readBody(request: Request): Promise<'onboard' | 'refresh'> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(length) || length > MAX_STRIPE_CONNECT_ACCOUNT_REQUEST_BYTES) throw new Error('invalid');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_STRIPE_CONNECT_ACCOUNT_REQUEST_BYTES) throw new Error('invalid');
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).join(',') !== 'action' || (record.action !== 'onboard' && record.action !== 'refresh')) throw new Error('invalid');
  return record.action;
}

function defaultDependencies(): Dependencies {
  const config = stripeConnectServerConfig();
  const stripe = config ? createStripeClient(config.secretKey) : null;
  const service = config ? createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  }) : null;

  return {
    configured: () => Boolean(config && stripe && service),
    authorize: async accessToken => {
      if (!config) throw new Error('unconfigured');
      const user = createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data, error } = await user.rpc('servsync_authorize_stripe_connect_onboarding');
      if (error || !data || typeof data !== 'object') throw new Error('unauthorized');
      return data as Authorization;
    },
    createAccount: async authorization => {
      if (!stripe) throw new Error('unconfigured');
      return stripe.v2.core.accounts.create(
        canonicalConnectedAccountCreateParams({
          contractorId: authorization.contractor_id,
          businessName: authorization.business_name,
          email: authorization.email,
        }),
        { idempotencyKey: `servsync-connect-test-${authorization.contractor_id}` },
      );
    },
    retrieveAccount: async accountId => {
      if (!stripe) throw new Error('unconfigured');
      return stripe.v2.core.accounts.retrieve(accountId, {
        include: ['configuration.merchant', 'defaults', 'identity', 'requirements'],
      });
    },
    persistAccount: async (contractorId, account) => {
      if (!service) throw new Error('unconfigured');
      const snapshot = canonicalStripeAccountSnapshot(account);
      const { error } = await service.rpc('servsync_sync_stripe_connect_account', {
        p_contractor_id: contractorId,
        p_stripe_account_id: snapshot.stripe_account_id,
        p_account_status: snapshot.account_status,
        p_charges_enabled: snapshot.charges_enabled,
        p_payouts_enabled: snapshot.payouts_enabled,
        p_details_submitted: snapshot.details_submitted,
        p_card_payments_status: snapshot.card_payments_status,
        p_ach_payments_status: snapshot.ach_payments_status,
        p_requirements_due_count: snapshot.requirements_due_count,
        p_fees_collector: snapshot.fees_collector,
        p_losses_collector: snapshot.losses_collector,
        p_dashboard_type: snapshot.dashboard_type,
      });
      if (error) throw new Error('persistence_failed');
    },
    createAccountLink: async (accountId, refreshUrl, returnUrl) => {
      if (!stripe) throw new Error('unconfigured');
      const link = await stripe.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['merchant'],
            refresh_url: refreshUrl,
            return_url: returnUrl,
            collection_options: { fields: 'eventually_due', future_requirements: 'include' },
          },
        },
      });
      return link.url;
    },
    rateLimit: async request => {
      if (process.env.VERCEL !== '1') return 'unconfigured';
      const result = await checkRateLimit(STRIPE_CONNECT_ACCOUNT_RATE_LIMIT_ID, { request });
      if (result.error === 'not-found') return 'unconfigured';
      return result.rateLimited ? 'limited' : 'ok';
    },
  };
}

export function createStripeConnectAccountHandler(dependencies: Dependencies = defaultDependencies()) {
  return async function handler(request: Request) {
    if (request.method !== 'POST') return json({ status: 'failed', reason: 'method_not_allowed' }, 405);
    if (!sameOriginRequest(request)) return json({ status: 'failed', reason: 'forbidden' }, 403);
    if (!dependencies.configured()) return json({ status: 'failed', reason: 'payments_unavailable' }, 503);
    const token = bearerToken(request);
    if (!token) return json({ status: 'failed', reason: 'authentication_required' }, 401);
    let limit: Awaited<ReturnType<Dependencies['rateLimit']>>;
    try { limit = await dependencies.rateLimit(request); } catch { return json({ status: 'failed', reason: 'payments_unavailable' }, 503); }
    if (limit === 'unconfigured') return json({ status: 'failed', reason: 'payments_unavailable' }, 503);
    if (limit === 'limited') return json({ status: 'failed', reason: 'rate_limited' }, 429);
    let action: 'onboard' | 'refresh';
    try { action = await readBody(request); } catch { return json({ status: 'failed', reason: 'invalid_request' }, 400); }

    let stage: OnboardingStage = 'authorize';
    try {
      const authorization = await dependencies.authorize(token);
      if (action === 'refresh' && !authorization.stripe_account_id) return json({ status: 'synced' });
      stage = authorization.stripe_account_id ? 'retrieve_account' : 'create_account';
      const account = authorization.stripe_account_id
        ? await dependencies.retrieveAccount(authorization.stripe_account_id)
        : await dependencies.createAccount(authorization);
      stage = 'persist_account';
      await dependencies.persistAccount(authorization.contractor_id, account);
      if (action === 'refresh') return json({ status: 'synced' });
      stage = 'create_account_link';
      const origin = publicOrigin(request);
      const url = await dependencies.createAccountLink(
        account.id,
        `${origin}/?stripe_connect=refresh`,
        `${origin}/?stripe_connect=return`,
      );
      return json({ status: 'onboarding_required', url });
    } catch (error) {
      console.error(JSON.stringify({ event: 'stripe_connect_onboarding_failed', stage, error: safeProviderError(error) }));
      return json({ status: 'failed', reason: 'onboarding_unavailable' }, 403);
    }
  };
}

const handler = createStripeConnectAccountHandler();
export default { fetch: handler };
