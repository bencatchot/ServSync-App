import type { Invoice } from '../../types';
import { formatMoney, formatShortDate } from '../../utils/format';
import { invoiceStatusPresentation } from '../status/statusPresentation';

export type InvoicePaymentPresentationInput = Pick<Invoice, 'status' | 'total_cents' | 'amount_paid_cents' | 'due_at' | 'paid_at' | 'voided_at'>;

export interface InvoicePaymentPresentation {
  status: ReturnType<typeof invoiceStatusPresentation>;
  totalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  hasRecordedPaymentAmount: boolean;
  primary: string;
  secondary?: string;
}

export interface InvoicePaymentSummaryRow {
  label: string;
  value: string;
}

function safeCents(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function hasPositiveFiniteCents(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function invoiceTotalCents(invoice: InvoicePaymentPresentationInput) {
  return safeCents(invoice.total_cents);
}

export function invoiceAmountPaidCents(invoice: InvoicePaymentPresentationInput) {
  return Math.min(safeCents(invoice.amount_paid_cents), invoiceTotalCents(invoice));
}

export function invoiceBalanceDueCents(invoice: InvoicePaymentPresentationInput) {
  if (invoice.status === 'void') return 0;
  return Math.max(invoiceTotalCents(invoice) - invoiceAmountPaidCents(invoice), 0);
}

function dateLabel(value: string | null | undefined) {
  return value ? formatShortDate(value) : '';
}

export function invoicePaymentPresentation(invoice: InvoicePaymentPresentationInput): InvoicePaymentPresentation {
  const totalCents = invoiceTotalCents(invoice);
  const amountPaidCents = invoiceAmountPaidCents(invoice);
  const balanceDueCents = invoiceBalanceDueCents(invoice);
  const hasRecordedPaymentAmount = hasPositiveFiniteCents(invoice.amount_paid_cents);
  const dueDate = dateLabel(invoice.due_at);
  const paidDate = dateLabel(invoice.paid_at);
  const voidedDate = dateLabel(invoice.voided_at);
  const status = invoiceStatusPresentation(invoice.status);

  if (invoice.status === 'paid') {
    return {
      status,
      totalCents,
      amountPaidCents,
      balanceDueCents,
      hasRecordedPaymentAmount,
      primary: paidDate ? `Paid ${paidDate}` : 'Paid',
      secondary: `Amount paid ${formatMoney(amountPaidCents)} · Balance due ${formatMoney(0)}`,
    };
  }

  if (invoice.status === 'partially_paid') {
    return {
      status,
      totalCents,
      amountPaidCents,
      balanceDueCents,
      hasRecordedPaymentAmount,
      primary: hasRecordedPaymentAmount
        ? `${formatMoney(amountPaidCents)} paid · ${formatMoney(balanceDueCents)} remaining`
        : 'Payment amount not recorded',
    };
  }

  if (invoice.status === 'overdue') {
    return {
      status,
      totalCents,
      amountPaidCents,
      balanceDueCents,
      hasRecordedPaymentAmount,
      primary: dueDate
        ? `Due ${dueDate} · ${formatMoney(balanceDueCents)} remaining`
        : `${formatMoney(balanceDueCents)} remaining`,
    };
  }

  if (invoice.status === 'void') {
    return {
      status,
      totalCents,
      amountPaidCents,
      balanceDueCents,
      hasRecordedPaymentAmount,
      primary: voidedDate ? `Voided ${voidedDate}` : 'Void',
      secondary: 'No active balance due.',
    };
  }

  return {
    status,
    totalCents,
    amountPaidCents,
    balanceDueCents,
    hasRecordedPaymentAmount,
    primary: dueDate
      ? `Due ${dueDate} · ${formatMoney(balanceDueCents)} remaining`
      : `Balance due ${formatMoney(balanceDueCents)}`,
  };
}

export function invoicePaymentSummaryRows(invoice: InvoicePaymentPresentationInput): InvoicePaymentSummaryRow[] {
  const presentation = invoicePaymentPresentation(invoice);
  const rows: InvoicePaymentSummaryRow[] = [
    { label: 'Invoice total', value: formatMoney(presentation.totalCents) },
    { label: 'Amount paid', value: formatMoney(presentation.amountPaidCents) },
    {
      label: invoice.status === 'void' ? 'Active balance' : 'Balance due',
      value: invoice.status === 'void' ? 'No active balance due' : formatMoney(presentation.balanceDueCents),
    },
  ];

  if (invoice.status === 'paid' && invoice.paid_at) {
    rows.push({ label: 'Paid date', value: formatShortDate(invoice.paid_at) });
  } else if (invoice.status === 'overdue' && invoice.due_at) {
    rows.push({ label: 'Due date', value: formatShortDate(invoice.due_at) });
  } else if (invoice.status === 'void' && invoice.voided_at) {
    rows.push({ label: 'Void date', value: formatShortDate(invoice.voided_at) });
  } else if (['draft', 'sent', 'viewed'].includes(invoice.status) && invoice.due_at) {
    rows.push({ label: 'Due date', value: formatShortDate(invoice.due_at) });
  }

  if (invoice.status === 'partially_paid' && !presentation.hasRecordedPaymentAmount) {
    rows.push({ label: 'Payment status', value: 'Payment amount not recorded' });
  }

  return rows;
}
