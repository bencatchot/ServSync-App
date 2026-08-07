import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, FileText, MapPin, MessageSquareText, ShieldCheck, XCircle } from 'lucide-react';
import type {
  RequestFreeEstimateDeliveryLookup,
  RequestFreeEstimateDocument,
  RequestFreeEstimateLineItem,
} from '../../types';
import { acceptRequestFreeEstimate, respondToRequestFreeEstimate } from './requestFreeEstimateDelivery';

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
  const [responseLookup, setResponseLookup] = useState<RequestFreeEstimateDeliveryLookup | null>(null);
  const [submitting, setSubmitting] = useState<'accept' | 'request_changes' | 'decline' | null>(null);
  const [responseForm, setResponseForm] = useState<'request_changes' | 'decline' | null>(null);
  const [responseMessage, setResponseMessage] = useState('');
  const [responseError, setResponseError] = useState('');
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

  const currentLookup = responseLookup ?? lookup;
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
  const response = currentLookup?.state === 'valid'
    ? currentLookup.response ?? currentLookup.acceptance
    : undefined;
  const hasUnpricedLines = estimate.line_items.some(line => line.unit_price_cents === null);
  const acceptEstimate = async () => {
    if (submitting || response?.state !== 'eligible') return;
    const confirmed = window.confirm('Accept this Estimate? This confirms that you approve this exact Estimate and authorize the contractor to proceed with the work described. This is not an electronic signature.');
    if (!confirmed) return;
    setSubmitting('accept');
    setResponseError('');
    try {
      const result = await acceptRequestFreeEstimate();
      if (result.state !== 'valid' || !result.estimate || (!result.response && !result.acceptance)) {
        throw new Error('This Estimate could not be accepted from the current link.');
      }
      setResponseLookup(result.response ? result : { ...result, response: result.acceptance });
    } catch (error) {
      setResponseError(error instanceof Error ? error.message : 'Estimate acceptance is temporarily unavailable.');
    } finally {
      setSubmitting(null);
    }
  };

  const submitResponse = async (action: 'request_changes' | 'decline') => {
    if (submitting || response?.state !== 'eligible') return;
    const message = responseMessage.replace(/\r\n?/g, '\n').trim();
    if (action === 'request_changes' && message.length < 3) {
      setResponseError('Describe the changes you want the contractor to make.');
      return;
    }
    if (message.length > 1_000) {
      setResponseError('Keep your response to 1,000 characters or fewer.');
      return;
    }
    setSubmitting(action);
    setResponseError('');
    try {
      const result = await respondToRequestFreeEstimate(action, message || null);
      if (result.state !== 'valid' || !result.estimate || !result.response) {
        throw new Error('Your response could not be recorded from the current link.');
      }
      setResponseLookup(result);
      setResponseForm(null);
      setResponseMessage('');
    } catch (error) {
      setResponseError(error instanceof Error ? error.message : 'Your Estimate response is temporarily unavailable.');
    } finally {
      setSubmitting(null);
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
              <p className={`mt-1 text-sm font-semibold ${response?.state === 'accepted' ? 'text-emerald-700' : response?.state === 'declined' ? 'text-red-700' : 'text-[#526784]'}`}>
                {response?.state === 'accepted' ? 'Accepted' : response?.state === 'declined' ? 'Declined' : response?.state === 'changes_requested' ? 'Changes requested' : 'Sent'}
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

          {response?.state === 'eligible' && (
            <section className="border-y border-[#D8DEE8] bg-[#F8FAFD] px-1 py-6" aria-labelledby="estimate-acceptance-heading" data-testid="request-free-estimate-acceptance-eligible">
              <h2 id="estimate-acceptance-heading" className="text-base font-bold">Respond to this Estimate</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526784]">Your response applies only to the exact Estimate shown here. Accepting authorizes the contractor to proceed with the described work, but it is not an electronic signature or verified account identity.</p>
              {responseError && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{responseError}</p>}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => void acceptEstimate()}
                  disabled={Boolean(submitting)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0078FF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
                >
                  <CheckCircle2 size={17} aria-hidden="true" /> {submitting === 'accept' ? 'Accepting...' : 'Accept Estimate'}
                </button>
                <button
                  type="button"
                  onClick={() => { setResponseForm('request_changes'); setResponseMessage(''); setResponseError(''); }}
                  disabled={Boolean(submitting)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#A9B8CC] bg-white px-5 py-2.5 text-sm font-semibold text-[#223D67] disabled:opacity-60 sm:w-auto"
                >
                  <MessageSquareText size={17} aria-hidden="true" /> Request changes
                </button>
                <button
                  type="button"
                  onClick={() => { setResponseForm('decline'); setResponseMessage(''); setResponseError(''); }}
                  disabled={Boolean(submitting)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-60 sm:w-auto"
                >
                  <XCircle size={17} aria-hidden="true" /> Decline Estimate
                </button>
              </div>

              {responseForm && (
                <div className="mt-5 max-w-2xl rounded-md border border-[#D8DEE8] bg-white p-4" data-testid={`request-free-estimate-${responseForm}-form`}>
                  <label htmlFor="secure-guest-estimate-response" className="block text-sm font-bold text-[#223D67]">
                    {responseForm === 'request_changes' ? 'What would you like changed?' : 'Reason for declining (optional)'}
                  </label>
                  <textarea
                    id="secure-guest-estimate-response"
                    value={responseMessage}
                    onChange={event => setResponseMessage(event.target.value.slice(0, 1_000))}
                    rows={4}
                    maxLength={1_000}
                    autoFocus
                    className="mt-2 w-full resize-y rounded-md border border-[#A9B8CC] px-3 py-2 text-sm text-[#02132D] outline-none focus:border-[#0078FF] focus:ring-2 focus:ring-[#0078FF]/20"
                    placeholder={responseForm === 'request_changes' ? 'Describe the revision you need.' : 'Share a reason if you would like.'}
                  />
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#6B7D95]">
                    <span>{responseForm === 'request_changes' ? 'Required' : 'Optional'}</span>
                    <span>{responseMessage.length}/1,000</span>
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void submitResponse(responseForm)}
                      disabled={Boolean(submitting) || (responseForm === 'request_changes' && responseMessage.trim().length < 3)}
                      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${responseForm === 'decline' ? 'bg-red-700' : 'bg-[#0078FF]'}`}
                    >
                      {submitting === responseForm ? 'Submitting...' : responseForm === 'request_changes' ? 'Submit change request' : 'Confirm decline'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setResponseForm(null); setResponseMessage(''); setResponseError(''); }}
                      disabled={Boolean(submitting)}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#A9B8CC] bg-white px-4 py-2 text-sm font-semibold text-[#223D67] disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {response?.state === 'accepted' && (
            <section className="border-y border-emerald-200 bg-emerald-50 px-1 py-6" aria-labelledby="estimate-accepted-heading" data-testid="request-free-estimate-accepted">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
                <div>
                  <h2 id="estimate-accepted-heading" className="text-base font-bold text-emerald-950">Estimate accepted</h2>
                  <p className="mt-1 text-sm leading-6 text-emerald-900">Accepted through this secure guest delivery on {dateTime(response.accepted_at)}. You can continue to review the exact Estimate above.</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">This records approval to proceed. It is not an electronic signature or verified account identity.</p>
                </div>
              </div>
            </section>
          )}

          {response?.state === 'changes_requested' && (
            <section className="border-y border-amber-200 bg-amber-50 px-1 py-6" data-testid="request-free-estimate-changes-requested">
              <div className="flex items-start gap-3">
                <MessageSquareText className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
                <div>
                  <h2 className="text-base font-bold text-amber-950">Changes requested</h2>
                  <p className="mt-1 text-sm leading-6 text-amber-900">Your request was recorded on {dateTime(response.responded_at)} for this exact Estimate. The contractor can revise it and send you a new version.</p>
                  {response.message && <p className="mt-3 whitespace-pre-wrap rounded-md border border-amber-200 bg-white/70 p-3 text-sm leading-6 text-amber-950">{response.message}</p>}
                </div>
              </div>
            </section>
          )}

          {response?.state === 'declined' && (
            <section className="border-y border-red-200 bg-red-50 px-1 py-6" data-testid="request-free-estimate-declined">
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />
                <div>
                  <h2 className="text-base font-bold text-red-950">Estimate declined</h2>
                  <p className="mt-1 text-sm leading-6 text-red-900">Your response was recorded on {dateTime(response.responded_at)} for this Estimate version only. It does not prevent future work or a revised Estimate.</p>
                  {response.message && <p className="mt-3 whitespace-pre-wrap rounded-md border border-red-200 bg-white/70 p-3 text-sm leading-6 text-red-950">{response.message}</p>}
                </div>
              </div>
            </section>
          )}

          {response?.state === 'stale' && (
            <section className="border-y border-amber-200 bg-amber-50 px-1 py-5" data-testid="request-free-estimate-acceptance-stale">
              <p className="text-sm font-bold text-amber-950">An updated Estimate is required</p>
              <p className="mt-1 text-sm leading-6 text-amber-900">This delivered version no longer matches the contractor's current Estimate and cannot receive a response. Ask the contractor to send the updated Estimate.</p>
            </section>
          )}

          {response?.state === 'ineligible' && (
            <section className="border-y border-amber-200 bg-amber-50 px-1 py-5" data-testid="request-free-estimate-acceptance-ineligible">
              <p className="text-sm font-bold text-amber-950">Response actions are unavailable</p>
              <p className="mt-1 text-sm leading-6 text-amber-900">This Estimate is no longer eligible for a response from this link. Contact the contractor if you need an updated Estimate.</p>
            </section>
          )}

          <footer className="flex items-start gap-2 border-t border-[#E1E3E7] pt-5 text-xs leading-5 text-[#6B7D95]">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#0078FF]" aria-hidden="true" />
            <p>This secure link shows only the published Estimate snapshot. Viewing alone does not record acceptance or any other response. Accept, Request changes, and Decline apply only to this version, do not verify identity or create a signature, and never grant access to Customer or property history.</p>
          </footer>
        </div>
      </article>
    </main>
  );
}
