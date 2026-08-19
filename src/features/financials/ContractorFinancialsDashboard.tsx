import { ArrowLeft, ArrowRight, CheckCircle2, FilePlus2, Receipt, WalletCards } from 'lucide-react';
import type { Invoice } from '../../types';

function FinancialTile({
  testId,
  label,
  count,
  helper,
  onClick,
}: {
  testId: string;
  label: string;
  count: number;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="min-h-[7.25rem] min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="rounded-lg bg-slate-100 p-2 text-slate-700"><Receipt size={18} /></span>
        <span className="text-xl font-bold text-slate-950">{count}</span>
      </span>
      <span className="mt-2 block text-sm font-bold text-slate-950">{label}</span>
      <span className="mt-1 block text-xs leading-4 text-slate-600">{helper}</span>
    </button>
  );
}

export function ContractorFinancialsDashboard({
  invoices,
  attentionCount,
  canCreateInvoice,
  onCreateInvoice,
  onViewAttention,
  onViewOpen,
  onViewClosed,
}: {
  invoices: Invoice[];
  attentionCount: number;
  canCreateInvoice: boolean;
  onCreateInvoice: () => void;
  onViewAttention: () => void;
  onViewOpen: () => void;
  onViewClosed: () => void;
}) {
  const openCount = invoices.filter(invoice => !['paid', 'void'].includes(invoice.status)).length;
  const closedCount = invoices.length - openCount;
  const draftCount = invoices.filter(invoice => invoice.status === 'draft').length;
  return (
    <section data-testid="contractor-financials-dashboard" className="space-y-5">
      <section aria-labelledby="financials-at-a-glance-heading">
        <div className="mb-3">
          <h2 id="financials-at-a-glance-heading" className="text-lg font-bold text-slate-950">At a Glance</h2>
          <p className="mt-1 text-sm text-slate-600">Review Invoice drafts, open balances, payments, and records that need a billing next step.</p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <FinancialTile testId="contractor-financials-summary-attention" label="Needs Attention" count={attentionCount} helper="Invoices requiring review" onClick={onViewAttention} />
          <FinancialTile testId="contractor-financials-summary-drafts" label="Invoice Drafts" count={draftCount} helper="Draft billing records" onClick={onViewOpen} />
          <FinancialTile testId="contractor-financials-summary-open" label="Open Invoices" count={openCount} helper="Sent, viewed, overdue, or partially paid" onClick={onViewOpen} />
          <FinancialTile testId="contractor-financials-summary-closed" label="Paid / Closed" count={closedCount} helper="Paid and void Invoice history" onClick={onViewClosed} />
        </div>
      </section>
      {canCreateInvoice ? (
        <button type="button" onClick={onCreateInvoice} data-testid="contractor-financials-create-invoice" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
          <FilePlus2 size={17} /> Create Invoice Draft
        </button>
      ) : null}
    </section>
  );
}

function invoiceAttentionReason(invoice: Invoice) {
  if (invoice.status === 'partially_paid') return 'Partially paid';
  if (invoice.status === 'overdue') return 'Overdue';
  return 'Draft requires review';
}

export function ContractorFinancialsNeedsAttention({
  invoices,
  onBack,
  onOpenInvoice,
}: {
  invoices: Invoice[];
  onBack: () => void;
  onOpenInvoice: (invoice: Invoice) => void;
}) {
  return (
    <section data-testid="contractor-financials-needs-attention" className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Invoice Attention</h2>
          <p className="mt-1 text-sm text-slate-600">Billing records with a clear financial next step.</p>
        </div>
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50">
          <ArrowLeft size={16} /> Financials overview
        </button>
      </div>
      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <CheckCircle2 size={22} className="mx-auto text-emerald-700" />
          <h3 className="mt-3 text-base font-bold text-slate-950">Nothing needs attention</h3>
          <p className="mt-1 text-sm text-slate-600">Invoice drafts, overdue records, and partial payments will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {invoices.map(invoice => (
            <button key={invoice.id} type="button" onClick={() => onOpenInvoice(invoice)} className="flex min-h-[4.5rem] w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-400 hover:bg-blue-50">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-800"><WalletCards size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-950">{invoice.title || `Invoice ${invoice.invoice_number}`}</span>
                <span className="mt-1 block text-xs font-semibold text-amber-800">{invoiceAttentionReason(invoice)}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">Invoice {invoice.invoice_number}</span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-slate-400" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
