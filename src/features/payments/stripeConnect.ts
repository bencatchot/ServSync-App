import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceOnlinePaymentRecord } from '../../types';

const SANDBOX_PROJECT_REF = 'zpzdkoaubyjtsomccxya';

export type StripeConnectAccountState = {
  state: 'not_connected' | 'setup_incomplete' | 'verification_required' | 'payments_pending' | 'active' | 'restricted';
  can_manage: boolean;
  mode: 'test';
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  card_payments_status?: string;
  ach_payments_status?: string;
  requirements_due_count?: number;
  status_synced_at?: string;
  application_fee_cents?: 0;
};

export type InvoiceOnlinePaymentState = {
  available: boolean;
  mode?: 'test';
  invoice_id?: string;
  amount_due_cents?: number;
  payment_state?: 'outstanding' | 'creating' | 'open' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'partially_refunded' | 'refunded' | 'disputed';
  payment_method_type?: 'card' | 'us_bank_account' | null;
  application_fee_cents?: 0;
};

function sandboxProjectFromClientBuild() {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL ?? '').hostname === `${SANDBOX_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

export const stripeConnectSandboxUiEnabled = sandboxProjectFromClientBuild();

const ONLINE_PAYMENT_STATES = new Set<InvoiceOnlinePaymentRecord['state']>([
  'creating', 'open', 'processing', 'succeeded', 'failed', 'canceled',
  'partially_refunded', 'refunded', 'disputed',
]);

export function normalizeOnlinePaymentRecords(value: unknown): InvoiceOnlinePaymentRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((record): record is InvoiceOnlinePaymentRecord => {
    if (!record || typeof record !== 'object') return false;
    const candidate = record as Partial<InvoiceOnlinePaymentRecord>;
    return typeof candidate.id === 'string'
      && Number.isSafeInteger(candidate.amount_cents)
      && Number.isSafeInteger(candidate.accounted_amount_cents)
      && typeof candidate.state === 'string'
      && ONLINE_PAYMENT_STATES.has(candidate.state as InvoiceOnlinePaymentRecord['state'])
      && (candidate.payment_method_type === null || candidate.payment_method_type === 'card' || candidate.payment_method_type === 'us_bank_account')
      && (candidate.checkout_created_at === null || typeof candidate.checkout_created_at === 'string')
      && (candidate.processing_at === null || typeof candidate.processing_at === 'string')
      && (candidate.succeeded_at === null || typeof candidate.succeeded_at === 'string')
      && (candidate.reversed_at === null || typeof candidate.reversed_at === 'string')
      && typeof candidate.created_at === 'string';
  });
}

export async function authenticatedAccessToken(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Sign in again to continue.');
  return data.session.access_token;
}

export async function loadStripeConnectAccountState(client: SupabaseClient) {
  const { data, error } = await client.rpc('servsync_get_stripe_connect_account_status');
  if (error || !data || typeof data !== 'object') throw new Error('Online Payments status is unavailable.');
  return data as StripeConnectAccountState;
}

export async function startStripeConnectOnboarding(client: SupabaseClient) {
  const accessToken = await authenticatedAccessToken(client);
  const response = await fetch('/api/stripe-connect-account', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'onboard' }),
  });
  const result: unknown = await response.json();
  if (!response.ok || !result || typeof result !== 'object') throw new Error('Stripe onboarding is unavailable.');
  const url = (result as Record<string, unknown>).url;
  if (typeof url !== 'string' || !url.startsWith('https://accounts.stripe.com/')) throw new Error('Stripe onboarding is unavailable.');
  return url;
}

export async function refreshStripeConnectAccount(client: SupabaseClient) {
  const accessToken = await authenticatedAccessToken(client);
  const response = await fetch('/api/stripe-connect-account', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'refresh' }),
  });
  const result: unknown = await response.json();
  if (!response.ok || !result || typeof result !== 'object' || (result as Record<string, unknown>).status !== 'synced') {
    throw new Error('Online Payments status is unavailable.');
  }
}

export async function loadInvoiceOnlinePaymentState(
  channel: 'authenticated' | 'request_free',
  invoiceId: string | null,
  client?: SupabaseClient | null,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (channel === 'authenticated') {
    if (!client || !invoiceId) return { available: false } satisfies InvoiceOnlinePaymentState;
    headers.Authorization = `Bearer ${await authenticatedAccessToken(client)}`;
  }
  const response = await fetch('/api/stripe-invoice-payment-state', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: JSON.stringify({ channel, invoice_id: invoiceId }),
  });
  if (!response.ok) return { available: false } satisfies InvoiceOnlinePaymentState;
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object') return { available: false } satisfies InvoiceOnlinePaymentState;
  return result as InvoiceOnlinePaymentState;
}

export async function createInvoiceStripeCheckout(
  channel: 'authenticated' | 'request_free',
  invoiceId: string | null,
  idempotencyKey: string,
  client?: SupabaseClient | null,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (channel === 'authenticated') {
    if (!client || !invoiceId) throw new Error('Online payment is unavailable.');
    headers.Authorization = `Bearer ${await authenticatedAccessToken(client)}`;
  }
  const response = await fetch('/api/stripe-invoice-checkout', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: JSON.stringify({ channel, invoice_id: invoiceId, idempotency_key: idempotencyKey }),
  });
  const result: unknown = await response.json();
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  if (!response.ok || record.status !== 'checkout_ready' || typeof record.url !== 'string' || !record.url.startsWith('https://checkout.stripe.com/')) {
    throw new Error(record.reason === 'rate_limited' ? 'Please wait before trying again.' : 'Online payment is unavailable right now.');
  }
  return record.url;
}
