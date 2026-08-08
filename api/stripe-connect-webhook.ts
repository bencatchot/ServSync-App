import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  canonicalStripeAccountSnapshot,
  createStripeClient,
  stripeConnectServerConfig,
} from '../server/stripeConnect.js';

export const MAX_STRIPE_CONNECT_WEBHOOK_BYTES = 262_144;

export type StripePaymentReconciliation = {
  event_id: string;
  event_created_at: string;
  event_type: string;
  stripe_account_id: string;
  attempt_id: string | null;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  charge_id: string | null;
  payment_method_type: 'card' | 'us_bank_account' | null;
  provider_status: string;
  provider_amount_cents: number | null;
  target_accounted_amount_cents: number | null;
  failure_code: string | null;
};

type Dependencies = {
  configured: () => boolean;
  constructEvent: (payload: string, signature: string) => Stripe.Event;
  reconcile: (input: StripePaymentReconciliation) => Promise<void>;
  contractorForAccount: (stripeAccountId: string) => Promise<string | null>;
  retrieveAccount: (accountId: string) => Promise<Stripe.V2.Core.Account>;
  syncAccount: (contractorId: string, account: Stripe.V2.Core.Account) => Promise<void>;
  retrieveCharge: (chargeId: string, stripeAccountId: string) => Promise<Stripe.Charge>;
};

function response(body: string, status: number) {
  return new Response(body, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function boundedBody(request: Request) {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declared) || declared > MAX_STRIPE_CONNECT_WEBHOOK_BYTES) throw new Error('oversized');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_STRIPE_CONNECT_WEBHOOK_BYTES) throw new Error('oversized');
  return raw;
}

function stringId(value: string | { id: string } | null | undefined) {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

function paymentMethodType(value: unknown): 'card' | 'us_bank_account' | null {
  if (value === 'card' || value === 'us_bank_account') return value;
  return null;
}

function methodFromIntent(intent: Stripe.PaymentIntent) {
  return paymentMethodType(intent.payment_method_types.find(type => type === 'card' || type === 'us_bank_account'));
}

function attemptId(metadata: Stripe.Metadata | null | undefined) {
  const value = metadata?.servsync_online_payment_attempt_id;
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

function base(event: Stripe.Event, stripeAccountId: string) {
  return {
    event_id: event.id,
    event_created_at: new Date(event.created * 1000).toISOString(),
    event_type: event.type,
    stripe_account_id: stripeAccountId,
  };
}

export async function reconciliationFromStripeEvent(
  event: Stripe.Event,
  retrieveCharge: Dependencies['retrieveCharge'],
): Promise<StripePaymentReconciliation | null> {
  const eventAccount = typeof event.account === 'string' ? event.account : '';
  if (!eventAccount) return null;

  if (
    event.type === 'checkout.session.completed'
    || event.type === 'checkout.session.async_payment_succeeded'
    || event.type === 'checkout.session.async_payment_failed'
    || event.type === 'checkout.session.expired'
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const succeeded = event.type === 'checkout.session.async_payment_succeeded'
      || (event.type === 'checkout.session.completed' && session.payment_status === 'paid');
    const failed = event.type === 'checkout.session.async_payment_failed';
    const expired = event.type === 'checkout.session.expired';
    return {
      ...base(event, eventAccount),
      attempt_id: attemptId(session.metadata),
      checkout_session_id: session.id,
      payment_intent_id: stringId(session.payment_intent),
      charge_id: null,
      payment_method_type: paymentMethodType(session.payment_method_types?.find(type => type === 'card' || type === 'us_bank_account')),
      provider_status: succeeded ? 'succeeded' : failed ? 'failed' : expired ? 'canceled' : 'processing',
      provider_amount_cents: session.amount_total,
      target_accounted_amount_cents: succeeded ? session.amount_total : failed || expired ? 0 : null,
      failure_code: failed ? 'async_payment_failed' : null,
    };
  }

  if (
    event.type === 'payment_intent.processing'
    || event.type === 'payment_intent.succeeded'
    || event.type === 'payment_intent.payment_failed'
    || event.type === 'payment_intent.canceled'
  ) {
    const intent = event.data.object as Stripe.PaymentIntent;
    const succeeded = event.type === 'payment_intent.succeeded';
    const failed = event.type === 'payment_intent.payment_failed';
    const canceled = event.type === 'payment_intent.canceled';
    return {
      ...base(event, eventAccount),
      attempt_id: attemptId(intent.metadata),
      checkout_session_id: null,
      payment_intent_id: intent.id,
      charge_id: stringId(intent.latest_charge),
      payment_method_type: methodFromIntent(intent),
      provider_status: succeeded ? 'succeeded' : failed ? 'failed' : canceled ? 'canceled' : 'processing',
      provider_amount_cents: intent.amount,
      target_accounted_amount_cents: succeeded ? intent.amount_received : failed || canceled ? 0 : null,
      failure_code: failed ? 'payment_failed' : canceled ? 'payment_canceled' : null,
    };
  }

  if (event.type === 'charge.succeeded' || event.type === 'charge.failed' || event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const failed = event.type === 'charge.failed';
    const refunded = event.type === 'charge.refunded';
    const target = failed ? 0 : Math.max(charge.amount - charge.amount_refunded, 0);
    return {
      ...base(event, eventAccount),
      attempt_id: attemptId(charge.metadata),
      checkout_session_id: null,
      payment_intent_id: stringId(charge.payment_intent),
      charge_id: charge.id,
      payment_method_type: paymentMethodType(charge.payment_method_details?.type),
      provider_status: failed ? 'failed' : refunded ? (target === 0 ? 'refunded' : 'partially_refunded') : 'succeeded',
      provider_amount_cents: charge.amount,
      target_accounted_amount_cents: target,
      failure_code: failed ? 'charge_failed' : null,
    };
  }

  if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = stringId(dispute.charge);
    const won = event.type === 'charge.dispute.closed' && dispute.status === 'won';
    const charge = chargeId ? await retrieveCharge(chargeId, eventAccount) : null;
    const undisputedNet = charge ? Math.max(charge.amount - charge.amount_refunded, 0) : 0;
    const target = won ? undisputedNet : Math.max(undisputedNet - dispute.amount, 0);
    return {
      ...base(event, eventAccount),
      attempt_id: charge ? attemptId(charge.metadata) : null,
      checkout_session_id: null,
      payment_intent_id: charge ? stringId(charge.payment_intent) : stringId(dispute.payment_intent),
      charge_id: chargeId,
      payment_method_type: charge ? paymentMethodType(charge.payment_method_details?.type) : null,
      provider_status: won ? (target === 0 ? 'refunded' : target < (charge?.amount ?? 0) ? 'partially_refunded' : 'succeeded') : 'disputed',
      provider_amount_cents: dispute.amount,
      target_accounted_amount_cents: target,
      failure_code: won ? null : 'payment_disputed',
    };
  }

  return null;
}

function defaultDependencies(): Dependencies {
  const config = stripeConnectServerConfig(process.env, { webhook: true });
  const stripe = config ? createStripeClient(config.secretKey) : null;
  const service = config ? createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  }) : null;
  return {
    configured: () => Boolean(config && stripe && service),
    constructEvent: (payload, signature) => {
      if (!stripe || !config) throw new Error('unconfigured');
      return stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
    },
    reconcile: async input => {
      if (!service) throw new Error('unconfigured');
      const { error } = await service.rpc('servsync_reconcile_stripe_invoice_payment_event', {
        p_event_id: input.event_id,
        p_event_created_at: input.event_created_at,
        p_event_type: input.event_type,
        p_stripe_account_id: input.stripe_account_id,
        p_attempt_id: input.attempt_id,
        p_checkout_session_id: input.checkout_session_id,
        p_payment_intent_id: input.payment_intent_id,
        p_charge_id: input.charge_id,
        p_payment_method_type: input.payment_method_type,
        p_provider_status: input.provider_status,
        p_provider_amount_cents: input.provider_amount_cents,
        p_target_accounted_amount_cents: input.target_accounted_amount_cents,
        p_failure_code: input.failure_code,
      });
      if (error) throw new Error('reconciliation_failed');
    },
    contractorForAccount: async stripeAccountId => {
      if (!service) throw new Error('unconfigured');
      const { data, error } = await service.rpc('servsync_get_stripe_connect_account_contractor', {
        p_stripe_account_id: stripeAccountId,
      });
      if (error) throw new Error('account_lookup_failed');
      return typeof data === 'string' ? data : null;
    },
    retrieveAccount: async accountId => {
      if (!stripe) throw new Error('unconfigured');
      return stripe.v2.core.accounts.retrieve(accountId, {
        include: ['configuration.merchant', 'defaults', 'identity', 'requirements'],
      });
    },
    syncAccount: async (contractorId, account) => {
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
      if (error) throw new Error('account_sync_failed');
    },
    retrieveCharge: async (chargeId, stripeAccountId) => {
      if (!stripe) throw new Error('unconfigured');
      return stripe.charges.retrieve(chargeId, {}, { stripeAccount: stripeAccountId });
    },
  };
}

export function createStripeConnectWebhookHandler(dependencies: Dependencies = defaultDependencies()) {
  return async function handler(request: Request) {
    if (request.method !== 'POST') return response('Method not allowed', 405);
    if (!dependencies.configured()) return response('Unavailable', 503);
    const signature = request.headers.get('stripe-signature');
    if (!signature) return response('Invalid signature', 400);
    let raw: string;
    let event: Stripe.Event;
    try {
      raw = await boundedBody(request);
      event = dependencies.constructEvent(raw, signature);
    } catch {
      return response('Invalid signature', 400);
    }

    try {
      if (event.type === 'account.updated') {
        const account = event.data.object as Stripe.Account;
        if (account.metadata?.servsync_environment !== 'sandbox') return response('Ignored', 200);
        const contractorId = await dependencies.contractorForAccount(account.id);
        if (!contractorId) return response('Ignored', 200);
        await dependencies.syncAccount(contractorId, await dependencies.retrieveAccount(account.id));
        return response('Handled', 200);
      }
      const reconciliation = await reconciliationFromStripeEvent(event, dependencies.retrieveCharge);
      if (!reconciliation) return response('Ignored', 200);
      await dependencies.reconcile(reconciliation);
      return response('Handled', 200);
    } catch {
      return response('Retry', 500);
    }
  };
}

const handler = createStripeConnectWebhookHandler();
export default { fetch: handler };
