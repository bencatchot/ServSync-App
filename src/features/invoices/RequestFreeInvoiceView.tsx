import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Building2, FileText, MapPin, ShieldCheck } from 'lucide-react';
import { publicSupabase } from '../../publicSupabaseClient';
import type {
  RequestFreeInvoiceDeliveryLookup,
  RequestFreeInvoiceDocument,
} from '../../types';
import { lookupRequestFreeInvoice } from './requestFreeInvoiceDelivery';
import { invoiceStatusLabel } from './status';

type ViewState =
  | { status: 'loading' }
  | { status: 'ready'; invoice: RequestFreeInvoiceDocument }
  | { status: 'invalid' | 'expired' | 'revoked' | 'replaced' | 'unavailable' | 'error' };

function money(cents: number | null) {
  if (cents === null) return 'Price required';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function date(value: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function address(invoice: RequestFreeInvoiceDocument) {
  return [
    invoice.property.address_line1,
    invoice.property.address_line2,
    [invoice.property.city, invoice.property.state, invoice.property.zip_code].filter(Boolean).join(', '),
  ].filter(Boolean).join('\n');
}

function stateFromLookup(result: RequestFreeInvoiceDeliveryLookup): ViewState {
  if (result.state === 'valid' && result.invoice) return { status: 'ready', invoice: result.invoice };
  if (result.state === 'expired') return { status: 'expired' };
  if (result.state === 'revoked') return { status: 'revoked' };
  if (result.state === 'replaced') return { status: 'replaced' };
  if (result.state === 'unavailable') return { status: 'unavailable' };
  if (result.state === 'error') return { status: 'error' };
  return { status: 'invalid' };
}

const unavailableCopy: Record<Exclude<ViewState['status'], 'loading' | 'ready'>, { title: string; body: string }> = {
  invalid: {
    title: 'Invoice link unavailable',
    body: 'This link is invalid or is no longer available. Ask the contractor for a new link.',
  },
  expired: {
    title: 'Invoice link expired',
    body: 'This link has expired. Ask the contractor for a new link.',
  },
  revoked: {
    title: 'Invoice link no longer active',
    body: 'The contractor disabled this link. Ask the contractor if you still need access.',
  },
  replaced: {
    title: 'Invoice link replaced',
    body: 'A newer link replaced this one. Ask the contractor for the current link.',
  },
  unavailable: {
    title: 'Invoice unavailable',
    body: 'This invoice cannot be viewed from this link. Contact the contractor for help.',
  },
  error: {
    title: 'Invoice temporarily unavailable',
    body: 'ServSync could not load this invoice right now. Refresh the page or try again later.',
  },
};

export function RequestFreeInvoiceView({ token }: { token: string }) {
  const [view, setView] = useState<ViewState>({ status: 'loading' });
  const tokenRef = useRef(token);

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
    document.title = 'Invoice | ServSync';
    return () => {
      tokenRef.current = '';
      robots.remove();
      referrer.remove();
      cacheControl.remove();
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    tokenRef.current = token;
    const lookupToken = tokenRef.current;
    setView({ status: 'loading' });
    if (!publicSupabase) {
      setView({ status: 'error' });
      tokenRef.current = '';
      return;
    }
    void lookupRequestFreeInvoice(publicSupabase, lookupToken)
      .then(result => {
        if (!cancelled) setView(stateFromLookup(result));
      })
      .catch(() => {
        if (!cancelled) setView({ status: 'error' });
      })
      .finally(() => {
        tokenRef.current = '';
      });
    return () => {
      cancelled = true;
      tokenRef.current = '';
    };
  }, [token]);

  if (view.status === 'loading') {
    return (
      <main className="min-h-screen bg-[#F4F7FB] px-4 py-10 text-[#02132D]" data-testid="request-free-invoice-loading">
        <div className="mx-auto max-w-3xl rounded-lg border border-[#E1E3E7] bg-white p-8 text-center shadow-sm">
          <FileText className="mx-auto text-[#0078FF]" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold">Loading invoice</h1>
          <p className="mt-2 text-sm text-[#526784]">Checking this secure invoice link...</p>
        </div>
      </main>
    );
  }

  if (view.status !== 'ready') {
    const copy = unavailableCopy[view.status];
    return (
      <main className="min-h-screen bg-[#F4F7FB] px-4 py-10 text-[#02132D]" data-testid={`request-free-invoice-${view.status}`}>
        <div className="mx-auto max-w-xl rounded-lg border border-[#E1E3E7] bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto text-amber-600" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-sm leading-6 text-[#526784]">{copy.body}</p>
          <p className="mt-6 text-xs text-[#6B7D95]">ServSync does not use this link to create an account, approve work, or process payment.</p>
        </div>
      </main>
    );
  }

  const invoice = view.invoice;
  return (
    <main className="min-h-screen bg-[#F4F7FB] px-3 py-6 text-[#02132D] sm:px-5 sm:py-10" data-testid="request-free-invoice-valid">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-[#D8DEE8] bg-white shadow-sm">
        <header className="border-b border-[#E1E3E7] bg-[#F8FAFD] p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0078FF]">
                <Building2 size={17} aria-hidden="true" />
                <span>{invoice.contractor.business_name || 'Your contractor'}</span>
              </div>
              <h1 className="mt-3 break-words text-2xl font-bold sm:text-3xl">{invoice.title || 'Invoice'}</h1>
              <p className="mt-2 text-sm text-[#526784]">Invoice {invoice.invoice_number || 'number pending'}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase text-[#6B7D95]">Amount due</p>
              <p className="mt-1 text-2xl font-bold">{money(Math.max(invoice.total_cents - invoice.amount_paid_cents, 0))}</p>
              <p className="mt-1 text-sm font-semibold text-[#526784]">{invoiceStatusLabel(invoice.status)}</p>
            </div>
          </div>
        </header>

        <div className="space-y-7 p-5 sm:p-7">
          <section className="grid gap-4 sm:grid-cols-2" aria-label="Invoice parties and dates">
            <div>
              <p className="text-xs font-semibold uppercase text-[#6B7D95]">Prepared for</p>
              <p className="mt-1 font-semibold">{invoice.customer.display_name || 'Customer'}</p>
              <p className="mt-2 flex items-start gap-2 whitespace-pre-line text-sm leading-6 text-[#526784]">
                <MapPin size={16} className="mt-1 shrink-0" aria-hidden="true" />
                <span>{address(invoice)}</span>
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[#6B7D95]">Issued</dt>
                <dd className="mt-1 font-semibold">{date(invoice.issued_at)}</dd>
              </div>
              <div>
                <dt className="text-[#6B7D95]">Due</dt>
                <dd className="mt-1 font-semibold">{date(invoice.due_at)}</dd>
              </div>
            </dl>
          </section>

          {invoice.scope && (
            <section>
              <h2 className="text-sm font-bold">Scope</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#334D70]">{invoice.scope}</p>
            </section>
          )}

          <section aria-labelledby="invoice-lines-heading">
            <h2 id="invoice-lines-heading" className="text-sm font-bold">Invoice items</h2>
            <div className="mt-3 divide-y divide-[#E1E3E7] border-y border-[#E1E3E7]">
              {invoice.line_items.map((line, index) => (
                <div key={`${index}-${line.title}`} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{line.title || 'Invoice item'}</p>
                    {line.description && line.description !== line.title && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#526784]">{line.description}</p>}
                    <p className="mt-2 text-xs text-[#6B7D95]">{line.quantity} {line.unit || 'each'} · {money(line.unit_price_cents)} each</p>
                  </div>
                  <p className="font-semibold sm:text-right">{line.unit_price_cents === null ? 'Price required' : money(Math.round(line.quantity * line.unit_price_cents))}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="ml-auto max-w-sm" aria-label="Invoice totals">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{money(invoice.subtotal_cents)}</dd></div>
              {invoice.discount_cents > 0 && <div className="flex justify-between gap-4"><dt>Discount</dt><dd>-{money(invoice.discount_cents)}</dd></div>}
              <div className="flex justify-between gap-4"><dt>Tax</dt><dd>{money(invoice.tax_cents)}</dd></div>
              <div className="flex justify-between gap-4 border-t border-[#D8DEE8] pt-3 text-base font-bold"><dt>Total</dt><dd>{money(invoice.total_cents)}</dd></div>
              {invoice.amount_paid_cents > 0 && <div className="flex justify-between gap-4 text-emerald-700"><dt>Paid</dt><dd>-{money(invoice.amount_paid_cents)}</dd></div>}
            </dl>
          </section>

          {(invoice.notes || invoice.terms) && (
            <section className="grid gap-5 border-t border-[#E1E3E7] pt-6 sm:grid-cols-2">
              {invoice.notes && <div><h2 className="text-sm font-bold">Notes</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#526784]">{invoice.notes}</p></div>}
              {invoice.terms && <div><h2 className="text-sm font-bold">Terms</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#526784]">{invoice.terms}</p></div>}
            </section>
          )}

          <footer className="flex items-start gap-2 border-t border-[#E1E3E7] pt-5 text-xs leading-5 text-[#6B7D95]">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#0078FF]" aria-hidden="true" />
            <p>This read-only link shows only this invoice. Viewing it does not confirm delivery, acceptance, approval, signature, or payment.</p>
          </footer>
        </div>
      </article>
    </main>
  );
}
