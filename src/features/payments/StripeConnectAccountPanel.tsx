import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadStripeConnectAccountState,
  refreshStripeConnectAccount,
  startStripeConnectOnboarding,
  stripeConnectSandboxUiEnabled,
  type StripeConnectAccountState,
} from './stripeConnect';

const stateLabels: Record<StripeConnectAccountState['state'], string> = {
  not_connected: 'Not connected',
  setup_incomplete: 'Setup incomplete',
  verification_required: 'Verification required',
  payments_pending: 'Payments pending enablement',
  active: 'Active',
  restricted: 'Restricted',
};

export function StripeConnectAccountPanel({ client }: { client: SupabaseClient }) {
  const [state, setState] = useState<StripeConnectAccountState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try { setState(await loadStripeConnectAccountState(client)); }
    catch { setState(null); setError('Online Payments status is unavailable.'); }
  };

  useEffect(() => { if (stripeConnectSandboxUiEnabled) void load(); }, [client]);
  if (!stripeConnectSandboxUiEnabled) return null;

  const onboard = async () => {
    setBusy(true);
    setError('');
    try { window.location.assign(await startStripeConnectOnboarding(client)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Stripe onboarding is unavailable.'); setBusy(false); }
  };

  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      if (state?.can_manage) await refreshStripeConnectAccount(client);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Online Payments status is unavailable.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="stripe-connect-account-panel" className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-blue-700" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-950">Online payments</p>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Stripe test mode</span>
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-600">Accept card and ACH test payments into your connected Stripe account. ServSync takes no application fee.</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{state ? stateLabels[state.state] : error ? 'Unavailable' : 'Loading...'}</p>
          {state?.state === 'active' && (
            <p className="mt-1 text-xs text-slate-500">Cards active · ACH active · payouts managed in Stripe</p>
          )}
          {state && state.requirements_due_count ? (
            <p className="mt-1 text-xs text-amber-700">Stripe requires {state.requirements_due_count} setup item{state.requirements_due_count === 1 ? '' : 's'}.</p>
          ) : null}
          {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void refresh()} disabled={busy} className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" aria-label="Refresh Online Payments status" title="Refresh status">
            <RefreshCw size={16} />
          </button>
          {state?.can_manage && state.state !== 'active' && (
            <button type="button" onClick={() => void onboard()} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">
              <ExternalLink size={16} />
              {busy ? 'Opening Stripe...' : state.state === 'not_connected' ? 'Connect with Stripe' : 'Continue setup'}
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-blue-700" aria-hidden="true" />
        <p>Stripe hosts identity and payout setup. ServSync does not collect bank, card, tax, or identity-document details.</p>
      </div>
    </section>
  );
}
