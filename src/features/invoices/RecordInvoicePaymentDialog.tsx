import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { Invoice, InvoiceOfflinePaymentRecord } from '../../types';
import { formatDateTime, formatMoney, formatShortDate } from '../../utils/format';
import { invoiceBalanceDueCents } from './paymentPresentation';
import {
  OFFLINE_PAYMENT_METHOD_OPTIONS,
  createOfflinePaymentDraft,
  offlinePaymentMethodLabel,
  validateOfflinePaymentDraft,
  type OfflinePaymentSubmission,
} from './offlinePayments';

interface RecordInvoicePaymentDialogProps {
  invoice: Invoice;
  payments: InvoiceOfflinePaymentRecord[];
  loadingHistory: boolean;
  submitting: boolean;
  historyError?: string;
  onClose: () => void;
  onSubmit: (submission: OfflinePaymentSubmission) => Promise<void>;
}

export function RecordInvoicePaymentDialog({
  invoice,
  payments,
  loadingHistory,
  submitting,
  historyError = '',
  onClose,
  onSubmit,
}: RecordInvoicePaymentDialogProps) {
  const [draft, setDraft] = useState(() => createOfflinePaymentDraft(invoice));
  const [error, setError] = useState('');
  const balanceDueCents = invoiceBalanceDueCents(invoice);
  const canRecord = balanceDueCents > 0 && ['sent', 'viewed', 'overdue', 'partially_paid'].includes(invoice.status);

  useEffect(() => {
    setDraft(createOfflinePaymentDraft(invoice));
    setError('');
  }, [invoice.id, invoice.amount_paid_cents, invoice.status, invoice.total_cents]);

  const submit = async () => {
    const validation = validateOfflinePaymentDraft(invoice, draft);
    if (!validation.submission) {
      setError(validation.error);
      return;
    }
    setError('');
    try {
      await onSubmit(validation.submission);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Payment could not be recorded.');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="record-invoice-payment-title">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-lg bg-white shadow-2xl sm:max-w-2xl sm:rounded-lg">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id="record-invoice-payment-title" className="text-lg font-bold text-slate-950">{canRecord ? 'Record payment' : 'Payment history'}</h2>
            <p className="mt-1 break-words text-sm text-slate-600">{invoice.invoice_number || invoice.title || 'Invoice'} · Balance {formatMoney(balanceDueCents)}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close payment dialog">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          {canRecord && (
            <section aria-label="Offline payment details">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                Record money received outside ServSync. This does not process a payment or contact a payment provider.
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Amount received
                  <div className="mt-1 flex rounded-md border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                    <span className="px-3 py-2 text-slate-500">$</span>
                    <input className="min-w-0 flex-1 rounded-r-md px-2 py-2 outline-none" inputMode="decimal" value={draft.amount} onChange={event => setDraft(current => ({ ...current, amount: event.target.value }))} aria-label="Payment amount" />
                  </div>
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Date received
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="date" value={draft.paymentDate} onChange={event => setDraft(current => ({ ...current, paymentDate: event.target.value }))} />
                </label>
                <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                  Payment method
                  <select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" value={draft.paymentMethod} onChange={event => setDraft(current => ({ ...current, paymentMethod: event.target.value as typeof draft.paymentMethod }))}>
                    {OFFLINE_PAYMENT_METHOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                  Reference or check number <span className="font-normal text-slate-500">(optional)</span>
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" maxLength={120} value={draft.reference} onChange={event => setDraft(current => ({ ...current, reference: event.target.value }))} />
                </label>
                <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                  Note <span className="font-normal text-slate-500">(optional)</span>
                  <textarea className="mt-1 min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2" maxLength={500} value={draft.note} onChange={event => setDraft(current => ({ ...current, note: event.target.value }))} />
                </label>
              </div>
              {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={onClose} disabled={submitting} className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={() => void submit()} disabled={submitting} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                  <CheckCircle2 size={16} />
                  {submitting ? 'Recording...' : 'Record payment'}
                </button>
              </div>
            </section>
          )}

          <section aria-labelledby="invoice-payment-history-title" className={canRecord ? 'border-t border-slate-200 pt-5' : ''}>
            <h3 id="invoice-payment-history-title" className="text-sm font-bold text-slate-950">Payment history</h3>
            {loadingHistory && <p className="mt-2 text-sm text-slate-500">Loading payment history...</p>}
            {!loadingHistory && historyError && <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{historyError}</p>}
            {!loadingHistory && !historyError && payments.length === 0 && <p className="mt-2 text-sm text-slate-500">No offline payments recorded.</p>}
            {!loadingHistory && !historyError && payments.length > 0 && (
              <div className="mt-3 space-y-2">
                {payments.map(payment => (
                  <article key={payment.id} className="rounded-md border border-slate-200 px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-950">{formatMoney(payment.amount_cents)} · {offlinePaymentMethodLabel(payment.payment_method)}</p>
                        <p className="mt-1 text-xs text-slate-500">Received {formatShortDate(payment.payment_date)} · Recorded by {payment.recorded_by_name}</p>
                      </div>
                      <span className="text-xs text-slate-500">{formatDateTime(payment.created_at)}</span>
                    </div>
                    {payment.reference && <p className="mt-2 break-words text-slate-700">Reference: {payment.reference}</p>}
                    {payment.note && <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{payment.note}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
