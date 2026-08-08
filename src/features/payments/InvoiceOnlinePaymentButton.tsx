import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createInvoiceStripeCheckout,
  loadInvoiceOnlinePaymentState,
  stripeConnectSandboxUiEnabled,
  type InvoiceOnlinePaymentState,
} from './stripeConnect';

export function InvoiceOnlinePaymentButton({
  channel,
  invoiceId,
  client = null,
}: {
  channel: 'authenticated' | 'request_free';
  invoiceId: string | null;
  client?: SupabaseClient | null;
}) {
  const [state, setState] = useState<InvoiceOnlinePaymentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const storageKey = useMemo(() => `servsync-stripe-checkout:${channel}:${invoiceId ?? 'request-free'}`, [channel, invoiceId]);

  useEffect(() => {
    if (!stripeConnectSandboxUiEnabled) return undefined;
    let active = true;
    void loadInvoiceOnlinePaymentState(channel, invoiceId, client).then(result => {
      if (active) setState(result);
    }).catch(() => { if (active) setState({ available: false }); });
    return () => { active = false; };
  }, [channel, client, invoiceId]);

  if (!stripeConnectSandboxUiEnabled || !state || (!state.available && !['open', 'processing'].includes(state.payment_state ?? ''))) return null;

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      let idempotencyKey = window.sessionStorage.getItem(storageKey);
      if (!idempotencyKey || !['creating', 'open', 'processing'].includes(state.payment_state ?? '')) {
        idempotencyKey = crypto.randomUUID();
        window.sessionStorage.setItem(storageKey, idempotencyKey);
      }
      window.location.assign(await createInvoiceStripeCheckout(channel, invoiceId, idempotencyKey, client));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Online payment is unavailable right now.');
      setBusy(false);
    }
  };

  const processing = state.payment_state === 'processing';
  return (
    <div data-testid="invoice-online-payment" className="min-w-0">
      <button type="button" onClick={() => void pay()} disabled={busy || processing} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
        {busy || processing ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
        {processing ? 'Payment processing' : busy ? 'Opening secure checkout...' : state.payment_state === 'open' ? 'Continue payment' : 'Pay online'}
      </button>
      <p className="mt-1 text-xs text-slate-500">Secure Stripe test checkout · Card or ACH · Payment status is confirmed by Stripe.</p>
      {error && <p className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
