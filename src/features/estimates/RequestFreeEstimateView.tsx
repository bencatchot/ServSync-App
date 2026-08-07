import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, FileText, MapPin, ShieldCheck } from 'lucide-react';
import type {
  RequestFreeEstimateDeliveryLookup,
  RequestFreeEstimateDocument,
  RequestFreeEstimateLineItem,
} from '../../types';
import { acceptRequestFreeEstimate } from './requestFreeEstimateDelivery';

type ViewState =
  | { status: 'loading' }
  | { status: 'ready'; estimate: RequestFreeEstimateDocument }
  | { status: 'invalid' | 'expired' | 'revoked' | 'replaced' | 'unavailable' | 'rate_limited' | 'error' };

function money(cents: number | null) {
  if (cents === null) return 'Price to be confirmed';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function address(estimate: RequestFreeEstimateDocument) {
  return [
    estimate.property.address_line1,
    estimate.property.address_line2,
    [estimate.property.city, estimate.property.state, estimate.property.zip_code].filter(Boolean).join(', '),
  ].filter(Boolean).join('\n');
}

function lineTypeLabel(line: RequestFreeEstimateLineItem) {
  if (line.line_type === 'labor') return 'Labor';
  if (line.line_type === 'material') return 'Material';
  if (line.line_type === 'fee') return 'Fee';
  return 'Other';
}

function supplyStatusLabel(line: RequestFreeEstimateLineItem) {
  if (line.supply_status === 'contractor_supplied') return 'Contractor supplied';
  if (line.supply_status === 'customer_supplied') return 'Customer supplied';
  if (line.supply_status === 'to_be_confirmed') return 'Supply status to be confirmed';
  return '';
}

function stateFromLookup(result: RequestFreeEstimateDeliveryLookup): ViewState {
  if (result.state === 'valid' && result.estimate) return { status: 'ready', estimate: result.estimate };
  if (result.state === 'expired') return { status: 'expired' };
  if (result.state === 'revoked') return { status: 'revoked' };
  if (result.state === 'replaced') return { status: 'replaced' };
  if (result.state === 'unavailable') return { status: 'unavailable' };
  if (result.state === 'rate_limited') return { status: 'rate_limited' };
  if (result.state === 'error') return { status: 'error' };
  return { status: 'invalid' };
}

const unavailableCopy: Record<Exclude<ViewState['status'], 'loading' | 'ready'>, { title: string; body: string }> = {
  invalid: { title: 'Estimate link unavailable', body: 'This link is invalid or is no longer available. Ask the contractor for a new link.' },
  expired: { title: 'Estimate link expired', body: 'This link has expired. Ask the contractor for a new link.' },
  revoked: { title: 'Estimate link no longer active', body: 'The contractor disabled this link. Ask the contractor if you still need access.' },
  replaced: { title: 'Estimate link replaced', body: 'A newer Estimate snapshot replaced this one. Ask the contractor for the current link.' },
  unavailable: { title: 'Estimate unavailable', body: 'This Estimate cannot be viewed from this link. Contact the contractor for help.' },
  rate_limited: { title: 'Please wait before trying again', body: 'This secure link has been checked too many times recently. Wait a minute, then try again.' },
  error: { title: 'Estimate temporarily unavailable', body: 'ServSync could not load this Estimate right now. Refresh the page or try again later.' },
};

export function RequestFreeEstimateView({ lookup }: { lookup: RequestFreeEstimateDeliveryLookup | null }) {
  const [acceptedLookup, setAcceptedLookup] = useState<RequestFreeEstimateDeliveryLookup | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  useEffect(() => {
    const previousTitle = document.title;
    const robots = document.createElement('meta');
    const referrer = document.createElement('meta');
    const cacheControl = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow, noarchive';
    referrer.name = 'referrer';
    referrer.content = 'no-referrer';
    cacheControl.httpEquiv = 'Cache-Control';
    cacheControl.content = 'no-store, no-cache, must-revalidate, private';
    document.head.append(robots, referrer, cacheControl);
    document.title = 'Estimate | ServSync';
    return () => {
      robots.remove();
      referrer.remove();
      cacheControl.remove();
      document.title = previousTitle;
    };
  }, []);

  const currentLookup = acceptedLookup ?? lookup;
  const view: ViewState = currentLookup === null ? { status: 'loading' } : stateFromLookup(currentLookup);

  if (view.status === 'loading') {
    return (
      <main className="min-h-screen bg-[#F4F7FB] px-4 py-10 text-[#02132D]" data-testid="request-free-estimate-loading">
        <div className="mx-auto max-w-3xl rounded-lg border border-[#E1E3E7] bg-white p-8 text-center shadow-sm">
          <FileText className="mx-auto text-[#0078FF]" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold">Loading Estimate</h1>
          <p className="mt-2 text-sm text-[#526784]">Checking this secure Estimate link...</p>
        </div>
      </main>
    );
  }

  if (view.status !== 'ready') {
    const copy = unavailableCopy[view.status];
    return (
      <main className="min-h-screen bg-[#F4F7FB] px-4 py-10 text-[#02132D]" data-testid={`request-free-estimate-${view.status}`}>
        <div className="mx-auto max-w-xl rounded-lg border border-[#E1E3E7] bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto text-amber-600" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-sm leading-6 text-[#526784]">{copy.body}</p>
          <p className="mt-6 text-xs text-[#6B7D95]">ServSync does not use this link to create an account, approve work, sign a document, or process payment.</p>
        </div>
      </main>
    );
  }

  const estimate = view.estimate;
  const acceptance = currentLookup?.state === 'valid' ? currentLookup.acceptance : undefined;
  const hasUnpricedLines = estimate.line_items.some(line => line.unit_price_cents === null);
  const acceptEstimate = async () => {
    if (accepting || acceptance?.state !== 'eligible') return;
    const confirmed = window.confirm('Accept this Estimate? This confirms that you approve this exact Estimate and authorize the contractor to proceed with the work described. This is not an electronic signature.');
    if (!confirmed) return;
    setAccepting(true);
    setAcceptError('');
    try {
      const result = await acceptRequestFreeEstimate();
      if (result.state !== 'valid' || !result.estimate || !result.acceptance) {
        throw new Error('This Estimate could not be accepted from the current link.');
      }
      setAcceptedLookup(result);
    } catch (error) {
      setAcceptError(error instanceof Error ? error.message : 'Estimate acceptance is temporarily unavailable.');
    } finally {
      setAccepting(false);
    }
  };
  return (
    <main className="min-h-screen bg-[#F4F7FB] px-3 py-6 text-[#02132D] sm:px-5 sm:py-10" data-testid="request-free-estimate-valid">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-[#D8DEE8] bg-white shadow-sm">
        <header className="border-b border-[#E1E3E7] bg-[#F8FAFD] p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0078FF]">
                <Building2 size={17} aria-hidden="true" />
                <span>{estimate.contractor.business_name || 'Your contractor'}</span>
              </div>
              <h1 className="mt-3 break-words text-2xl font-bold sm:text-3xl">{estimate.title || 'Estimate'}</h1>
              <p className="mt-2 text-sm text-[#526784]">Read-only Estimate snapshot · Published {dateTime(estimate.source_updated_at)}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase text-[#6B7D95]">Estimate total</p>
              <p className="mt-1 text-2xl font-bold">{money(estimate.total_cents)}</p>
              <p className={`mt-1 text-sm font-semibold ${acceptance?.state === 'accepted' ? 'text-emerald-700' : 'text-[#526784]'}`}>
                {acceptance?.state === 'accepted' ? 'Accepted' : 'Sent'}
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-7 p-5 sm:p-7">
          <section className="grid gap-4 sm:grid-cols-2" aria-label="Estimate customer and property">
            <div>
              <p className="text-xs font-semibold uppercase text-[#6B7D95]">Prepared for</p>
              <p className="mt-1 font-semibold">{estimate.customer.display_name || 'Customer'}</p>
              <p className="mt-2 flex items-start gap-2 whitespace-pre-line text-sm leading-6 text-[#526784]">
                <MapPin size={16} className="mt-1 shrink-0" aria-hidden="true" />
                <span>{address(estimate)}</span>
              </p>
            </div>
            {estimate.scope && <div><p className="text-xs font-semibold uppercase text-[#6B7D95]">Scope of work</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#334D70]">{estimate.scope}</p></div>}
          </section>

          <section aria-labelledby="estimate-lines-heading">
            <h2 id="estimate-lines-heading" className="text-sm font-bold">Estimate items</h2>
            <div className="mt-3 divide-y divide-[#E1E3E7] border-y border-[#E1E3E7]">
              {estimate.line_items.map((line, index) => {
                const details = [line.description, line.model_spec ? `Model/spec: ${line.model_spec}` : '', supplyStatusLabel(line)].filter(Boolean);
                return (
                  <div key={`${index}-${line.title}`} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5">
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{line.title || 'Estimate item'}</p>
                      {details.map(detail => <p key={detail} className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#526784]">{detail}</p>)}
                      <p className="mt-2 text-xs text-[#6B7D95]">{lineTypeLabel(line)} · {line.quantity} {line.unit || 'each'} · {money(line.unit_price_cents)} each</p>
                    </div>
                    <p className="font-semibold sm:text-right">{line.unit_price_cents === null ? 'Price to be confirmed' : money(Math.round(line.quantity * line.unit_price_cents))}</p>
                  </div>
                );
              })}
            </div>
            {hasUnpricedLines && <p className="mt-3 text-xs font-semibold text-amber-800">The Estimate total does not include items marked Price to be confirmed.</p>}
          </section>

          <section className="ml-auto max-w-sm" aria-label="Estimate totals">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt>Material</dt><dd>{money(estimate.material_total_cents)}</dd></div>
              <div className="flex justify-between gap-4"><dt>Labor</dt><dd>{money(estimate.labor_total_cents)}</dd></div>
              <div className="flex justify-between gap-4"><dt>Fees</dt><dd>{money(estimate.fee_total_cents)}</dd></div>
              <div className="flex justify-between gap-4"><dt>Other</dt><dd>{money(estimate.other_total_cents)}</dd></div>
              <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{money(estimate.subtotal_cents)}</dd></div>
              <div className="flex justify-between gap-4"><dt>Tax</dt><dd>{money(estimate.tax_cents)}</dd></div>
              <div className="flex justify-between gap-4 border-t border-[#D8DEE8] pt-3 text-base font-bold"><dt>Total</dt><dd>{money(estimate.total_cents)}</dd></div>
            </dl>
          </section>

          {estimate.payment_schedule_items.length > 0 && (
            <section><h2 className="text-sm font-bold">Payment schedule</h2><div className="mt-3 space-y-2">{estimate.payment_schedule_items.map((row, index) => <p key={`${index}-${row.label}`} className="rounded-md bg-[#F8FAFD] p-3 text-sm text-[#334D70]">{row.label} · {money(row.calculated_amount_cents)} · {row.due_trigger}</p>)}</div></section>
          )}

          {(estimate.notes || estimate.terms) && (
            <section className="grid gap-5 border-t border-[#E1E3E7] pt-6 sm:grid-cols-2">
              {estimate.notes && <div><h2 className="text-sm font-bold">Notes / exclusions</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#526784]">{estimate.notes}</p></div>}
              {estimate.terms && <div><h2 className="text-sm font-bold">Terms</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#526784]">{estimate.terms}</p></div>}
            </section>
          )}

          {acceptance?.state === 'eligible' && (
            <section className="border-y border-[#D8DEE8] bg-[#F8FAFD] px-1 py-6" aria-labelledby="estimate-acceptance-heading" data-testid="request-free-estimate-acceptance-eligible">
              <h2 id="estimate-acceptance-heading" className="text-base font-bold">Ready to proceed?</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526784]">By accepting, you confirm that you approve this Estimate and authorize the contractor to proceed with the work described. Acceptance applies only to the exact Estimate shown here and is not an electronic signature.</p>
              {acceptError && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{acceptError}</p>}
              <button
                type="button"
                onClick={() => void acceptEstimate()}
                disabled={accepting}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0078FF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
              >
                <CheckCircle2 size={17} aria-hidden="true" /> {accepting ? 'Accepting...' : 'Accept Estimate'}
              </button>
            </section>
          )}

          {acceptance?.state === 'accepted' && (
            <section className="border-y border-emerald-200 bg-emerald-50 px-1 py-6" aria-labelledby="estimate-accepted-heading" data-testid="request-free-estimate-accepted">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
                <div>
                  <h2 id="estimate-accepted-heading" className="text-base font-bold text-emerald-950">Estimate accepted</h2>
                  <p className="mt-1 text-sm leading-6 text-emerald-900">Accepted through this secure guest delivery on {dateTime(acceptance.accepted_at)}. You can continue to review the exact Estimate above.</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">This records approval to proceed. It is not an electronic signature or verified account identity.</p>
                </div>
              </div>
            </section>
          )}

          {acceptance?.state === 'stale' && (
            <section className="border-y border-amber-200 bg-amber-50 px-1 py-5" data-testid="request-free-estimate-acceptance-stale">
              <p className="text-sm font-bold text-amber-950">An updated Estimate is required</p>
              <p className="mt-1 text-sm leading-6 text-amber-900">This delivered version no longer matches the contractor's current Estimate and cannot be accepted. Ask the contractor to send the updated Estimate.</p>
            </section>
          )}

          {acceptance?.state === 'ineligible' && (
            <section className="border-y border-amber-200 bg-amber-50 px-1 py-5" data-testid="request-free-estimate-acceptance-ineligible">
              <p className="text-sm font-bold text-amber-950">Acceptance is unavailable</p>
              <p className="mt-1 text-sm leading-6 text-amber-900">This Estimate is no longer eligible for acceptance from this link. Contact the contractor if you need an updated Estimate.</p>
            </section>
          )}

          <footer className="flex items-start gap-2 border-t border-[#E1E3E7] pt-5 text-xs leading-5 text-[#6B7D95]">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#0078FF]" aria-hidden="true" />
            <p>This secure link shows only the published Estimate snapshot. Viewing alone does not record acceptance. An explicit acceptance is recorded as secure guest approval, not a signature or verified account identity, and never grants access to Customer or property history.</p>
          </footer>
        </div>
      </article>
    </main>
  );
}
