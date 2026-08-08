import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@vercel/firewall';
import type Stripe from 'stripe';
import { REQUEST_FREE_INVOICE_SESSION_COOKIE } from './request-free-local-invoice-delivery';
import {
  SERVSYNC_STRIPE_APPLICATION_FEE_CENTS,
  SERVSYNC_STRIPE_PAYMENT_METHODS,
  bearerToken,
  createStripeClient,
  publicOrigin,
  sameOriginRequest,
  stripeConnectServerConfig,
} from '../server/stripeConnect';

export const STRIPE_INVOICE_CHECKOUT_RATE_LIMIT_ID = 'stripe-invoice-checkout';
export const MAX_STRIPE_INVOICE_CHECKOUT_REQUEST_BYTES = 1_024;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_PATTERN = /^[0-9a-f]{64}$/;

type CheckoutInput = {
  invoice_id: string | null;
  idempotency_key: string;
  channel: 'authenticated' | 'request_free';
};

export type PreparedStripeInvoiceCheckout = {
  attempt_id: string;
  invoice_id: string;
  contractor_id: string;
  stripe_account_id: string;
  amount_cents: number;
  currency: 'usd';
  description: string;
  customer_email: string | null;
  source: 'authenticated_customer' | 'request_free';
};

type CreatedCheckout = { id: string; url: string | null; payment_intent: string | null };

type Dependencies = {
  configured: () => boolean;
  prepareAuthenticated: (accessToken: string, input: CheckoutInput) => Promise<PreparedStripeInvoiceCheckout>;
  prepareRequestFree: (sessionDigest: string, input: CheckoutInput) => Promise<PreparedStripeInvoiceCheckout>;
  createCheckout: (prepared: PreparedStripeInvoiceCheckout, origin: string) => Promise<CreatedCheckout>;
  recordCheckout: (attemptId: string, checkout: CreatedCheckout) => Promise<void>;
  failCheckout: (attemptId: string, failureCode: string) => Promise<void>;
  rateLimit: (request: Request) => Promise<'ok' | 'limited' | 'unconfigured'>;
};

class InvalidRequestError extends Error {}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sessionIdentifier(request: Request) {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const values = cookie.split(';').map(value => value.trim()).filter(value => value.startsWith(`${REQUEST_FREE_INVOICE_SESSION_COOKIE}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(REQUEST_FREE_INVOICE_SESSION_COOKIE.length + 1);
  return SESSION_PATTERN.test(value) ? value : null;
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function parseInput(request: Request): Promise<CheckoutInput> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declared) || declared > MAX_STRIPE_INVOICE_CHECKOUT_REQUEST_BYTES) throw new InvalidRequestError();
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_STRIPE_INVOICE_CHECKOUT_REQUEST_BYTES) throw new InvalidRequestError();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new InvalidRequestError(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new InvalidRequestError();
  const input = parsed as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== 'channel,idempotency_key,invoice_id') throw new InvalidRequestError();
  if (input.channel === 'authenticated' && (typeof input.invoice_id !== 'string' || !UUID_PATTERN.test(input.invoice_id))) throw new InvalidRequestError();
  if (input.channel === 'request_free' && input.invoice_id !== null) throw new InvalidRequestError();
  if (typeof input.idempotency_key !== 'string' || !UUID_PATTERN.test(input.idempotency_key)) throw new InvalidRequestError();
  if (input.channel !== 'authenticated' && input.channel !== 'request_free') throw new InvalidRequestError();
  return input as CheckoutInput;
}

function safeDescription(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'ServSync Invoice';
}

export function canonicalCheckoutSessionParams(prepared: PreparedStripeInvoiceCheckout, origin: string): Stripe.Checkout.SessionCreateParams {
  const route = prepared.source === 'request_free' ? '#/invoice-delivery' : '';
  const metadata = {
    servsync_online_payment_attempt_id: prepared.attempt_id,
    servsync_invoice_id: prepared.invoice_id,
    servsync_contractor_id: prepared.contractor_id,
    servsync_payment_source: prepared.source,
    servsync_application_fee_cents: String(SERVSYNC_STRIPE_APPLICATION_FEE_CENTS),
  };
  return {
    mode: 'payment',
    payment_method_types: [...SERVSYNC_STRIPE_PAYMENT_METHODS],
    client_reference_id: prepared.invoice_id,
    customer_email: prepared.customer_email ?? undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: prepared.currency,
        unit_amount: prepared.amount_cents,
        product_data: { name: safeDescription(prepared.description) },
      },
    }],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${origin}/?stripe_payment=return${route}`,
    cancel_url: `${origin}/?stripe_payment=canceled${route}`,
  };
}

function defaultDependencies(): Dependencies {
  const config = stripeConnectServerConfig();
  const stripe = config ? createStripeClient(config.secretKey) : null;
  const service = config ? createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  }) : null;
  return {
    configured: () => Boolean(config && stripe && service),
    prepareAuthenticated: async (accessToken, input) => {
      if (!config) throw new Error('unconfigured');
      const user = createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data, error } = await user.rpc('servsync_prepare_authenticated_stripe_invoice_checkout', {
        p_invoice_id: input.invoice_id!,
        p_idempotency_key: input.idempotency_key,
      });
      if (error || !data || typeof data !== 'object') throw new Error('not_eligible');
      return data as PreparedStripeInvoiceCheckout;
    },
    prepareRequestFree: async (sessionDigest, input) => {
      if (!service) throw new Error('unconfigured');
      const { data, error } = await service.rpc('servsync_prepare_request_free_stripe_invoice_checkout', {
        p_session_digest: sessionDigest,
        p_idempotency_key: input.idempotency_key,
      });
      if (error || !data || typeof data !== 'object') throw new Error('not_eligible');
      return data as PreparedStripeInvoiceCheckout;
    },
    createCheckout: async (prepared, origin) => {
      if (!stripe) throw new Error('unconfigured');
      const session = await stripe.checkout.sessions.create(
        canonicalCheckoutSessionParams(prepared, origin),
        {
          stripeAccount: prepared.stripe_account_id,
          idempotencyKey: `servsync-checkout-test-${prepared.attempt_id}`,
        },
      );
      return {
        id: session.id,
        url: session.url,
        payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
      };
    },
    recordCheckout: async (attemptId, checkout) => {
      if (!service) throw new Error('unconfigured');
      const { error } = await service.rpc('servsync_record_stripe_checkout_session', {
        p_attempt_id: attemptId,
        p_checkout_session_id: checkout.id,
        p_payment_intent_id: checkout.payment_intent,
      });
      if (error) throw new Error('persistence_failed');
    },
    failCheckout: async (attemptId, failureCode) => {
      if (!service) return;
      await service.rpc('servsync_fail_stripe_invoice_checkout', {
        p_attempt_id: attemptId,
        p_failure_code: failureCode,
      });
    },
    rateLimit: async request => {
      if (process.env.VERCEL !== '1') return 'unconfigured';
      const result = await checkRateLimit(STRIPE_INVOICE_CHECKOUT_RATE_LIMIT_ID, { request });
      if (result.error === 'not-found') return 'unconfigured';
      return result.rateLimited ? 'limited' : 'ok';
    },
  };
}

export function createStripeInvoiceCheckoutHandler(dependencies: Dependencies = defaultDependencies()) {
  return async function handler(request: Request) {
    if (request.method !== 'POST') return json({ status: 'failed', reason: 'method_not_allowed' }, 405);
    if (!sameOriginRequest(request)) return json({ status: 'failed', reason: 'forbidden' }, 403);
    if (!dependencies.configured()) return json({ status: 'failed', reason: 'payments_unavailable' }, 503);
    let limit: Awaited<ReturnType<Dependencies['rateLimit']>>;
    try { limit = await dependencies.rateLimit(request); } catch { return json({ status: 'failed', reason: 'payments_unavailable' }, 503); }
    if (limit === 'unconfigured') return json({ status: 'failed', reason: 'payments_unavailable' }, 503);
    if (limit === 'limited') return json({ status: 'failed', reason: 'rate_limited' }, 429);

    let input: CheckoutInput;
    try { input = await parseInput(request); } catch { return json({ status: 'failed', reason: 'invalid_request' }, 400); }
    const token = bearerToken(request);
    const session = sessionIdentifier(request);
    if ((input.channel === 'authenticated' && !token) || (input.channel === 'request_free' && !session)) {
      return json({ status: 'failed', reason: 'payment_unavailable' }, 403);
    }

    let prepared: PreparedStripeInvoiceCheckout | null = null;
    let providerSessionCreated = false;
    try {
      prepared = input.channel === 'authenticated'
        ? await dependencies.prepareAuthenticated(token!, input)
        : await dependencies.prepareRequestFree(digest(session!), input);
      const checkout = await dependencies.createCheckout(prepared, publicOrigin(request));
      providerSessionCreated = true;
      if (!checkout.url || !checkout.url.startsWith('https://checkout.stripe.com/')) throw new Error('checkout_unavailable');
      await dependencies.recordCheckout(prepared.attempt_id, checkout);
      return json({ status: 'checkout_ready', url: checkout.url });
    } catch {
      if (prepared && !providerSessionCreated) {
        try { await dependencies.failCheckout(prepared.attempt_id, 'checkout_creation_failed'); } catch { /* Best-effort unlock. */ }
      }
      return json({ status: 'failed', reason: 'payment_unavailable' }, 403);
    }
  };
}

const handler = createStripeInvoiceCheckoutHandler();
export default { fetch: handler };
