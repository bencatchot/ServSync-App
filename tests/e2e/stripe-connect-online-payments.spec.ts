import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type Stripe from 'stripe';
import {
  assertCanonicalConnectedAccount,
  canonicalConnectedAccountCreateParams,
  canonicalStripeAccountSnapshot,
  stripeConnectServerConfig,
} from '../../server/stripeConnect';
import {
  canonicalCheckoutSessionParams,
  createStripeInvoiceCheckoutHandler,
  type PreparedStripeInvoiceCheckout,
} from '../../api/stripe-invoice-checkout';
import {
  createStripeConnectWebhookHandler,
  reconciliationFromStripeEvent,
  type StripePaymentReconciliation,
} from '../../api/stripe-connect-webhook';
import { createStripeConnectAccountHandler } from '../../api/stripe-connect-account';
import { isStripeHostedAccountLink } from '../../src/features/payments/stripeConnect';

const CONTRACTOR_ID = '11111111-1111-4111-8111-111111111111';
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const IDEMPOTENCY_KEY = '44444444-4444-4444-8444-444444444444';
const ACCOUNT_ID = 'acct_fixture12345678';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function account(overrides: Partial<Stripe.V2.Core.Account> = {}) {
  return {
    id: ACCOUNT_ID,
    object: 'v2.core.account',
    applied_configurations: ['merchant'],
    created: '2026-08-08T00:00:00.000Z',
    livemode: false,
    dashboard: 'full',
    defaults: {
      currency: 'usd',
      responsibilities: {
        fees_collector: 'stripe',
        losses_collector: 'stripe',
        requirements_collector: 'stripe',
      },
    },
    configuration: {
      merchant: {
        applied: true,
        capabilities: {
          card_payments: { status: 'active', status_details: [] },
          ach_debit_payments: { status: 'active', status_details: [] },
        },
      },
    },
    requirements: { entries: [] },
    metadata: { servsync_contractor_id: CONTRACTOR_ID, servsync_environment: 'sandbox' },
    ...overrides,
  } as Stripe.V2.Core.Account;
}

function prepared(): PreparedStripeInvoiceCheckout {
  return {
    attempt_id: ATTEMPT_ID,
    invoice_id: INVOICE_ID,
    contractor_id: CONTRACTOR_ID,
    stripe_account_id: ACCOUNT_ID,
    amount_cents: 200000,
    currency: 'usd',
    description: 'INV-42 - Deposit',
    customer_email: 'customer@example.test',
    source: 'request_free',
  };
}

function apiRequest(path: string, body: unknown, headers: HeadersInit = {}) {
  return new Request(`https://sandbox.servsync.example${path}`, {
    method: 'POST',
    headers: { Origin: 'https://sandbox.servsync.example', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test.describe('current Stripe Connect responsibility model', () => {
  test('creates an Accounts v2 merchant with Stripe fee/loss responsibility', () => {
    const params = canonicalConnectedAccountCreateParams({
      contractorId: CONTRACTOR_ID,
      businessName: 'Fixture Services',
      email: 'owner@example.test',
    });
    expect(params.dashboard).toBe('full');
    expect(params.defaults?.responsibilities).toEqual({
      fees_collector: 'stripe',
      losses_collector: 'stripe',
    });
    expect(params.configuration?.merchant?.capabilities).toEqual({
      card_payments: { requested: true },
      ach_debit_payments: { requested: true },
    });
    expect(params.configuration).not.toHaveProperty('recipient');
    expect(params.include).toEqual(['configuration.merchant', 'defaults', 'identity', 'requirements']);
    expect(params.metadata?.servsync_application_fee_cents).toBe('0');
  });

  test('rejects application-fee, application-loss, or non-full-dashboard accounts', () => {
    expect(() => assertCanonicalConnectedAccount(account())).not.toThrow();
    for (const incompatible of [
      account({ defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'stripe', requirements_collector: 'stripe' } } }),
      account({ defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'application', requirements_collector: 'stripe' } } }),
      account({ defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe', requirements_collector: 'application' } } }),
      account({ dashboard: 'express' }),
      account({ livemode: true }),
    ]) expect(() => assertCanonicalConnectedAccount(incompatible)).toThrow();
    expect(canonicalStripeAccountSnapshot(account())).toMatchObject({
      mode: 'test', account_status: 'active', fees_collector: 'stripe', losses_collector: 'stripe', dashboard_type: 'full',
    });
  });

  test('classifies ordinary pre-onboarding requirements as setup incomplete', () => {
    const pending = account({
      configuration: {
        merchant: {
          applied: true,
          capabilities: {
            card_payments: { status: 'restricted', status_details: [] },
            ach_debit_payments: { status: 'restricted', status_details: [] },
          },
        },
      },
      requirements: {
        entries: [{
          awaiting_action_from: 'user', errors: [], impact: {},
          minimum_deadline: { status: 'currently_due' }, requested_reasons: [{ code: 'routine_onboarding' }],
        }],
      },
    });
    expect(canonicalStripeAccountSnapshot(pending)).toMatchObject({
      account_status: 'setup_incomplete', charges_enabled: false, requirements_due_count: 1,
    });
  });

  test('server configuration is immutably Sandbox/test-only', () => {
    const valid = {
      SERVSYNC_STRIPE_CONNECT_TEST_ENABLED: 'true',
      SERVSYNC_STRIPE_CONNECT_MODE: 'test',
      SERVSYNC_STRIPE_CONNECT_PROJECT_REF: 'zpzdkoaubyjtsomccxya',
      STRIPE_SECRET_KEY: `sk_test_${'x'.repeat(30)}`,
      STRIPE_CONNECT_WEBHOOK_SECRET: `whsec_${'y'.repeat(30)}`,
      SUPABASE_URL: 'https://zpzdkoaubyjtsomccxya.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
    };
    expect(stripeConnectServerConfig(valid, { webhook: true })?.projectRef).toBe('zpzdkoaubyjtsomccxya');
    expect(stripeConnectServerConfig({ ...valid, STRIPE_SECRET_KEY: `sk_live_${'x'.repeat(30)}` })).toBeNull();
    expect(stripeConnectServerConfig({ ...valid, SUPABASE_URL: 'https://uqgtheclhxqlnjpfmheq.supabase.co' })).toBeNull();
    expect(stripeConnectServerConfig({ ...valid, SERVSYNC_STRIPE_CONNECT_PROJECT_REF: 'bdytwgejqnlblhrnqxkp' })).toBeNull();
    expect(stripeConnectServerConfig({ ...valid, SERVSYNC_STRIPE_CONNECT_TEST_ENABLED: 'false' })).toBeNull();
  });
});

test.describe('direct Checkout boundary', () => {
  test('derives one full-balance card/ACH charge with no application fee, transfer, or destination', () => {
    const params = canonicalCheckoutSessionParams(prepared(), 'https://sandbox.servsync.example');
    expect(params.payment_method_types).toEqual(['card', 'us_bank_account']);
    expect(params.line_items?.[0]).toMatchObject({ quantity: 1, price_data: { currency: 'usd', unit_amount: 200000 } });
    expect(params.payment_intent_data).not.toHaveProperty('application_fee_amount');
    expect(params.payment_intent_data).not.toHaveProperty('transfer_data');
    expect(params.payment_intent_data).not.toHaveProperty('on_behalf_of');
    expect(JSON.stringify(params)).not.toMatch(/destination|transfer_group|application_fee_amount/);
  });

  test('uses the database-prepared amount and returns only the hosted Checkout URL', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const handler = createStripeInvoiceCheckoutHandler({
      configured: () => true,
      rateLimit: async () => 'ok',
      prepareAuthenticated: async () => { throw new Error('wrong channel'); },
      prepareRequestFree: async (sessionDigest, input) => {
        calls.push({ sessionDigest, input });
        return prepared();
      },
      createCheckout: async (value, origin) => {
        calls.push({ value, origin });
        return { id: 'cs_test_fixture12345678', url: 'https://checkout.stripe.com/c/pay/test-fixture', payment_intent: null };
      },
      recordCheckout: async (attemptId, checkout) => { calls.push({ attemptId, checkout }); },
      failCheckout: async () => { throw new Error('should not fail'); },
    });
    const response = await handler(apiRequest('/api/stripe-invoice-checkout', {
      channel: 'request_free', invoice_id: null, idempotency_key: IDEMPOTENCY_KEY,
    }, { Cookie: `__Host-servsync-invoice-session=${'a'.repeat(64)}` }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'checkout_ready', url: 'https://checkout.stripe.com/c/pay/test-fixture' });
    expect(calls[0]).toMatchObject({ input: { invoice_id: null, idempotency_key: IDEMPOTENCY_KEY } });
    expect(calls[0]).not.toHaveProperty('input.amount_cents');
    expect(calls[1]).toMatchObject({ value: { amount_cents: 200000, stripe_account_id: ACCOUNT_ID } });
  });

  test('fails closed for cross-origin, missing recipient session, and unconfigured provider state', async () => {
    const dependencies = {
      configured: () => true,
      rateLimit: async () => 'ok' as const,
      prepareAuthenticated: async () => prepared(),
      prepareRequestFree: async () => prepared(),
      createCheckout: async () => ({ id: 'cs_test_fixture12345678', url: 'https://checkout.stripe.com/c/pay/test-fixture', payment_intent: null }),
      recordCheckout: async () => undefined,
      failCheckout: async () => undefined,
    };
    const handler = createStripeInvoiceCheckoutHandler(dependencies);
    const crossOrigin = apiRequest('/api/stripe-invoice-checkout', { channel: 'request_free', invoice_id: null, idempotency_key: IDEMPOTENCY_KEY }, { Origin: 'https://evil.example' });
    expect((await handler(crossOrigin)).status).toBe(403);
    expect((await handler(apiRequest('/api/stripe-invoice-checkout', { channel: 'request_free', invoice_id: null, idempotency_key: IDEMPOTENCY_KEY }))).status).toBe(403);
    expect((await createStripeInvoiceCheckoutHandler({ ...dependencies, configured: () => false })(apiRequest('/api/stripe-invoice-checkout', { channel: 'request_free', invoice_id: null, idempotency_key: IDEMPOTENCY_KEY }))).status).toBe(503);
  });
});

test.describe('Connect webhook authority', () => {
  function event(type: Stripe.Event['type'], object: object, overrides: Partial<Stripe.Event> = {}) {
    return {
      id: `evt_${type.replaceAll('.', '_')}12345678`,
      object: 'event',
      api_version: '2026-07-29.clover',
      created: 1_786_000_000,
      data: { object },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type,
      account: ACCOUNT_ID,
      ...overrides,
    } as Stripe.Event;
  }

  test('keeps ACH processing unsettled, then posts only the authoritative success', async () => {
    const processing = await reconciliationFromStripeEvent(event('payment_intent.processing', {
      id: 'pi_fixture12345678', object: 'payment_intent', amount: 200000, amount_received: 0,
      latest_charge: null, payment_method_types: ['us_bank_account'], metadata: { servsync_online_payment_attempt_id: ATTEMPT_ID },
    }), async () => { throw new Error('not used'); });
    expect(processing).toMatchObject({ provider_status: 'processing', target_accounted_amount_cents: null, payment_method_type: 'us_bank_account' });

    const succeeded = await reconciliationFromStripeEvent(event('payment_intent.succeeded', {
      id: 'pi_fixture12345678', object: 'payment_intent', amount: 200000, amount_received: 200000,
      latest_charge: 'ch_fixture12345678', payment_method_types: ['us_bank_account'], metadata: { servsync_online_payment_attempt_id: ATTEMPT_ID },
    }), async () => { throw new Error('not used'); });
    expect(succeeded).toMatchObject({ provider_status: 'succeeded', target_accounted_amount_cents: 200000 });
  });

  test('maps card failure, partial refund, and disputes to reversible accounted amounts', async () => {
    const failed = await reconciliationFromStripeEvent(event('payment_intent.payment_failed', {
      id: 'pi_fixture12345678', object: 'payment_intent', amount: 200000, amount_received: 0,
      latest_charge: null, payment_method_types: ['card'], metadata: { servsync_online_payment_attempt_id: ATTEMPT_ID },
    }), async () => { throw new Error('not used'); });
    expect(failed).toMatchObject({ provider_status: 'failed', target_accounted_amount_cents: 0, failure_code: 'payment_failed' });

    const charge = {
      id: 'ch_fixture12345678', object: 'charge', amount: 200000, amount_refunded: 50000,
      payment_intent: 'pi_fixture12345678', payment_method_details: { type: 'card' }, metadata: {},
    } as Stripe.Charge;
    const refunded = await reconciliationFromStripeEvent(event('charge.refunded', charge), async () => charge);
    expect(refunded).toMatchObject({ provider_status: 'partially_refunded', target_accounted_amount_cents: 150000 });

    const disputed = await reconciliationFromStripeEvent(event('charge.dispute.created', {
      id: 'dp_fixture12345678', object: 'dispute', amount: 25000, charge: charge.id, payment_intent: charge.payment_intent,
      status: 'needs_response',
    }), async () => charge);
    expect(disputed).toMatchObject({ provider_status: 'disputed', target_accounted_amount_cents: 125000 });
  });

  test('rejects invalid signatures before reconciliation and retries database failures', async () => {
    const reconciliations: StripePaymentReconciliation[] = [];
    const validEvent = event('payment_intent.processing', {
      id: 'pi_fixture12345678', object: 'payment_intent', amount: 200000, amount_received: 0,
      latest_charge: null, payment_method_types: ['card'], metadata: { servsync_online_payment_attempt_id: ATTEMPT_ID },
    });
    const handler = createStripeConnectWebhookHandler({
      configured: () => true,
      constructEvent: (_payload, signature) => { if (signature !== 'valid') throw new Error('bad'); return validEvent; },
      reconcile: async input => { reconciliations.push(input); },
      contractorForAccount: async () => CONTRACTOR_ID,
      retrieveAccount: async () => account(),
      syncAccount: async () => undefined,
      retrieveCharge: async () => { throw new Error('not used'); },
    });
    expect((await handler(new Request('https://example.test/api/stripe-connect-webhook', { method: 'POST', headers: { 'stripe-signature': 'bad' }, body: '{}' }))).status).toBe(400);
    expect(reconciliations).toHaveLength(0);
    expect((await handler(new Request('https://example.test/api/stripe-connect-webhook', { method: 'POST', headers: { 'stripe-signature': 'valid' }, body: '{}' }))).status).toBe(200);
    expect(reconciliations).toHaveLength(1);

    const retry = createStripeConnectWebhookHandler({
      configured: () => true,
      constructEvent: () => validEvent,
      reconcile: async () => { throw new Error('database'); },
      contractorForAccount: async () => CONTRACTOR_ID,
      retrieveAccount: async () => account(),
      syncAccount: async () => undefined,
      retrieveCharge: async () => { throw new Error('not used'); },
    });
    expect((await retry(new Request('https://example.test/api/stripe-connect-webhook', { method: 'POST', headers: { 'stripe-signature': 'valid' }, body: '{}' }))).status).toBe(500);
  });

  test('binds account updates through the persisted ServSync mapping, not editable Stripe metadata', async () => {
    const synced: string[] = [];
    const updatedAccount = {
      id: ACCOUNT_ID,
      object: 'account',
      metadata: {
        servsync_contractor_id: '99999999-9999-4999-8999-999999999999',
        servsync_environment: 'sandbox',
      },
    } as Stripe.Account;
    const accountEvent = event('account.updated', updatedAccount);
    const handler = createStripeConnectWebhookHandler({
      configured: () => true,
      constructEvent: () => accountEvent,
      reconcile: async () => { throw new Error('not a payment event'); },
      contractorForAccount: async stripeAccountId => stripeAccountId === ACCOUNT_ID ? CONTRACTOR_ID : null,
      retrieveAccount: async () => account({ metadata: { servsync_contractor_id: CONTRACTOR_ID, servsync_environment: 'sandbox' } }),
      syncAccount: async contractorId => { synced.push(contractorId); },
      retrieveCharge: async () => { throw new Error('not used'); },
    });
    expect((await handler(new Request('https://example.test/api/stripe-connect-webhook', {
      method: 'POST', headers: { 'stripe-signature': 'valid' }, body: '{}',
    }))).status).toBe(200);
    expect(synced).toEqual([CONTRACTOR_ID]);
  });
});

test('onboarding handler is Owner-authorized and never returns provider internals', async () => {
  const persisted: string[] = [];
  const handler = createStripeConnectAccountHandler({
    configured: () => true,
    rateLimit: async () => 'ok',
    authorize: async () => ({ contractor_id: CONTRACTOR_ID, business_name: 'Fixture', email: 'owner@example.test', stripe_account_id: null }),
    createAccount: async () => account(),
    retrieveAccount: async () => account(),
    persistAccount: async id => { persisted.push(id); },
    createAccountLink: async () => 'https://accounts.stripe.com/onboarding/test-fixture',
  });
  const result = await handler(apiRequest('/api/stripe-connect-account', { action: 'onboard' }, { Authorization: 'Bearer owner-jwt' }));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ status: 'onboarding_required', url: 'https://accounts.stripe.com/onboarding/test-fixture' });
  expect(persisted).toEqual([CONTRACTOR_ID]);
});

test('client accepts only exact HTTPS Stripe-hosted onboarding origins', () => {
  expect(isStripeHostedAccountLink('https://connect.stripe.com/setup/s/acct_fixture/link')).toBe(true);
  expect(isStripeHostedAccountLink('https://accounts.stripe.com/onboarding/test-fixture')).toBe(true);
  expect(isStripeHostedAccountLink('http://connect.stripe.com/setup/s/acct_fixture/link')).toBe(false);
  expect(isStripeHostedAccountLink('https://connect.stripe.com.evil.example/setup')).toBe(false);
  expect(isStripeHostedAccountLink('https://connect.stripe.com@evil.example/setup')).toBe(false);
});

test('status refresh retrieves an existing account and never creates one for a disconnected contractor', async () => {
  let created = 0;
  let retrieved = 0;
  const baseDependencies = {
    configured: () => true,
    rateLimit: async () => 'ok' as const,
    createAccount: async () => { created += 1; return account(); },
    retrieveAccount: async () => { retrieved += 1; return account(); },
    persistAccount: async () => undefined,
    createAccountLink: async () => { throw new Error('refresh must not open onboarding'); },
  };
  const connected = createStripeConnectAccountHandler({
    ...baseDependencies,
    authorize: async () => ({ contractor_id: CONTRACTOR_ID, business_name: 'Fixture', email: '', stripe_account_id: ACCOUNT_ID }),
  });
  expect((await connected(apiRequest('/api/stripe-connect-account', { action: 'refresh' }, { Authorization: 'Bearer owner-jwt' }))).status).toBe(200);
  expect(retrieved).toBe(1);
  expect(created).toBe(0);

  const disconnected = createStripeConnectAccountHandler({
    ...baseDependencies,
    authorize: async () => ({ contractor_id: CONTRACTOR_ID, business_name: 'Fixture', email: '', stripe_account_id: null }),
  });
  expect((await disconnected(apiRequest('/api/stripe-connect-account', { action: 'refresh' }, { Authorization: 'Bearer owner-jwt' }))).status).toBe(200);
  expect(created).toBe(0);
});

test('source keeps secrets server-only and private SQL surfaces narrow', () => {
  const browser = [
    source('src/features/payments/stripeConnect.ts'),
    source('src/features/payments/StripeConnectAccountPanel.tsx'),
    source('src/features/payments/InvoiceOnlinePaymentButton.tsx'),
  ].join('\n');
  expect(browser).not.toMatch(/STRIPE_SECRET_KEY|STRIPE_CONNECT_WEBHOOK_SECRET|SUPABASE_SERVICE_ROLE_KEY|sk_test_/);
  const checkout = source('api/stripe-invoice-checkout.ts');
  expect(checkout).toContain('stripeAccount: prepared.stripe_account_id');
  expect(checkout).not.toMatch(/application_fee_amount|transfer_data|destination/);

  const sql = source('servsync-stripe-connect-online-payments-foundation.sql');
  expect(sql).toContain("check (application_fee_cents = 0)");
  expect(sql).toContain("check (fees_collector = 'stripe')");
  expect(sql).toContain("check (losses_collector = 'stripe')");
  expect(sql).toContain('alter table public.invoice_online_payment_attempts force row level security;');
  expect(sql).toContain('invoice_offline_payment_records_online_conflict');
  expect(sql).toContain('invoices_online_payment_void_guard');
  expect(sql).not.toMatch(/grant (?:select|insert|update|delete|truncate|references|trigger) on table public\.(?:contractor_stripe_payment_accounts|invoice_online_payment_attempts|stripe_connect_payment_events)/i);
});
