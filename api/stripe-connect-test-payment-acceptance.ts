import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { REQUEST_FREE_INVOICE_SESSION_COOKIE } from './request-free-local-invoice-delivery.js';
import {
  SERVSYNC_STRIPE_APPLICATION_FEE_CENTS,
  bearerToken,
  createStripeClient,
  sameOriginRequest,
  stripeConnectServerConfig,
} from '../server/stripeConnect.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_PATTERN = /^[0-9a-f]{64}$/;

type PreparedPayment = {
  attempt_id: string;
  invoice_id: string;
  contractor_id: string;
  stripe_account_id: string;
  amount_cents: number;
  currency: 'usd';
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function testPaymentMethod(behavior: string) {
  if (behavior === 'ach_success') return 'pm_usBankAccount_success';
  if (behavior === 'ach_failure') return 'pm_usBankAccount_accountClosed';
  return null;
}

function sessionIdentifier(request: Request) {
  const header = request.headers.get('cookie') ?? '';
  const values = header.split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${REQUEST_FREE_INVOICE_SESSION_COOKIE}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(REQUEST_FREE_INVOICE_SESSION_COOKIE.length + 1);
  return SESSION_PATTERN.test(value) ? value : null;
}

export default {
  async fetch(request: Request) {
    const config = stripeConnectServerConfig();
    if (process.env.VERCEL_ENV !== 'preview' || !config || request.method !== 'POST' || !sameOriginRequest(request)) {
      return json({ reason: 'not_found' }, 404);
    }

    const accessToken = bearerToken(request);
    if (!accessToken) return json({ reason: 'forbidden' }, 403);

    let input: unknown;
    try { input = await request.json(); } catch { return json({ reason: 'invalid_request' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ reason: 'invalid_request' }, 400);
    const record = input as Record<string, unknown>;
    if (Object.keys(record).sort().join(',') !== 'behavior,idempotency_key') {
      return json({ reason: 'invalid_request' }, 400);
    }
    if (typeof record.idempotency_key !== 'string' || !UUID_PATTERN.test(record.idempotency_key)) {
      return json({ reason: 'invalid_request' }, 400);
    }
    const paymentMethod = typeof record.behavior === 'string' ? testPaymentMethod(record.behavior) : null;
    if (!paymentMethod) return json({ reason: 'invalid_request' }, 400);

    const user = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: authorization, error: authorizationError } = await user.rpc('servsync_authorize_stripe_connect_onboarding');
    const authorizedContractorId = authorization && typeof authorization === 'object'
      ? (authorization as Record<string, unknown>).contractor_id
      : null;
    if (authorizationError || typeof authorizedContractorId !== 'string') return json({ reason: 'forbidden' }, 403);

    const session = sessionIdentifier(request);
    if (!session) return json({ reason: 'not_eligible' }, 409);
    const service = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { data, error } = await service.rpc('servsync_prepare_request_free_stripe_invoice_checkout', {
      p_session_digest: createHash('sha256').update(session).digest('hex'),
      p_idempotency_key: record.idempotency_key,
    });
    if (error || !data || typeof data !== 'object') return json({ reason: 'not_eligible' }, 409);
    const prepared = data as PreparedPayment;
    if (prepared.contractor_id !== authorizedContractorId) return json({ reason: 'forbidden' }, 403);

    const metadata = {
      servsync_online_payment_attempt_id: prepared.attempt_id,
      servsync_invoice_id: prepared.invoice_id,
      servsync_contractor_id: prepared.contractor_id,
      servsync_payment_source: 'provider_acceptance',
      servsync_application_fee_cents: String(SERVSYNC_STRIPE_APPLICATION_FEE_CENTS),
    };
    const params: Stripe.PaymentIntentCreateParams = {
      amount: prepared.amount_cents,
      currency: prepared.currency,
      payment_method: paymentMethod,
      payment_method_types: ['us_bank_account'],
      confirm: true,
      metadata,
      mandate_data: {
        customer_acceptance: {
          type: 'online',
          online: { ip_address: '127.0.0.1', user_agent: 'ServSync provider acceptance' },
        },
      },
    };
    const payment = await createStripeClient(config.secretKey).paymentIntents.create(params, {
      stripeAccount: prepared.stripe_account_id,
      idempotencyKey: `servsync-provider-acceptance-${prepared.attempt_id}`,
    });

    return json({
      status: payment.status,
      attempt_id: prepared.attempt_id,
      payment_intent_id: payment.id,
      application_fee_cents: SERVSYNC_STRIPE_APPLICATION_FEE_CENTS,
    });
  },
};
