import type { Invoice } from '../../types';
import { StatusBadge } from '../status/StatusBadge';
import { invoicePaymentPresentation, invoicePaymentSummaryRows } from './paymentPresentation';

export interface InvoicePaymentSummaryProps {
  invoice: Pick<Invoice, 'status' | 'total_cents' | 'amount_paid_cents' | 'due_at' | 'paid_at' | 'voided_at'>;
  variant?: 'compact' | 'detail';
  showStatus?: boolean;
  className?: string;
}

export function InvoicePaymentSummary({
  invoice,
  variant = 'compact',
  showStatus = false,
  className = '',
}: InvoicePaymentSummaryProps) {
  const presentation = invoicePaymentPresentation(invoice);
  const rows = invoicePaymentSummaryRows(invoice);

  if (variant === 'detail') {
    return (
      <div
        data-testid="invoice-payment-summary-detail"
        className={`rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 ${className}`.trim()}
      >
        <div className="flex flex-wrap items-center gap-2">
          {showStatus && <StatusBadge {...presentation.status} />}
          <p className="font-semibold text-slate-950">Payment summary</p>
        </div>
        <p className="mt-2 text-slate-600">{presentation.primary}</p>
        {presentation.secondary && <p className="mt-1 text-slate-600">{presentation.secondary}</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map(row => (
            <div key={row.label} className="min-w-0 rounded-lg bg-white px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.label}</p>
              <p className="mt-1 break-words font-semibold text-slate-950">{row.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="invoice-payment-summary-compact"
      className={`flex max-w-full flex-wrap items-center gap-2 text-xs leading-5 text-slate-600 ${className}`.trim()}
    >
      {showStatus && <StatusBadge {...presentation.status} />}
      <span className="min-w-0 break-words">{presentation.primary}</span>
      {presentation.secondary && <span className="min-w-0 break-words text-slate-500">{presentation.secondary}</span>}
    </div>
  );
}
