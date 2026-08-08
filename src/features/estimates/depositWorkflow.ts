import type { Estimate, EstimatePaymentScheduleItem, Invoice } from '../../types';
import type { StatusTone } from '../status/statusPresentation';
import { invoicePaymentPresentation } from '../invoices/paymentPresentation';

export interface EstimateBillingSummary {
  amountInvoicedCents: number;
  amountPaidCents: number;
  remainingScheduledCents: number;
  remainingEstimateCents: number;
}

export interface ScheduleBillingPresentation {
  label: string;
  tone: StatusTone;
  detail: string;
}

function safeCents(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function invoiceForScheduleRow(row: EstimatePaymentScheduleItem, invoices: Invoice[]) {
  return row.linked_invoice_id
    ? invoices.find(invoice => invoice.id === row.linked_invoice_id) ?? null
    : null;
}

export function estimateBillingSummary(
  estimate: Pick<Estimate, 'id' | 'total_cents' | 'payment_schedule_items'>,
  invoices: Invoice[],
): EstimateBillingSummary {
  const activeInvoices = invoices.filter(invoice => invoice.estimate_id === estimate.id && invoice.status !== 'void');
  const rows = estimate.payment_schedule_items ?? [];
  const invoiceById = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const amountInvoicedCents = activeInvoices.reduce((sum, invoice) => sum + safeCents(invoice.total_cents), 0);
  const amountPaidCents = activeInvoices.reduce((sum, invoice) => (
    sum + Math.min(safeCents(invoice.amount_paid_cents), safeCents(invoice.total_cents))
  ), 0);

  return {
    amountInvoicedCents,
    amountPaidCents,
    remainingScheduledCents: rows
      .filter(row => !row.linked_invoice_id || invoiceById.get(row.linked_invoice_id)?.status === 'void')
      .reduce((sum, row) => sum + safeCents(row.calculated_amount_cents), 0),
    remainingEstimateCents: Math.max(safeCents(estimate.total_cents) - amountPaidCents, 0),
  };
}

export function scheduleBillingPresentation(
  row: EstimatePaymentScheduleItem,
  invoice: Invoice | null | undefined,
): ScheduleBillingPresentation {
  if (!invoice) {
    return {
      label: row.invoice_type === 'deposit' ? 'Not requested' : 'Not invoiced',
      tone: 'muted',
      detail: row.invoice_type === 'deposit' ? 'Create a draft Deposit Invoice when you are ready.' : 'No Invoice has been created.',
    };
  }

  if (invoice.status === 'void') {
    return {
      label: 'Voided',
      tone: 'muted',
      detail: invoice.amount_paid_cents > 0
        ? 'Recorded payment requires review before replacement.'
        : 'The voided Invoice remains in history; a replacement draft may be requested.',
    };
  }

  if (invoice.status === 'draft') {
    return { label: 'Requested - draft', tone: 'neutral', detail: 'Review and send the Invoice when it is ready.' };
  }

  const payment = invoicePaymentPresentation(invoice);
  return { label: payment.status.label, tone: payment.status.tone, detail: payment.primary };
}

export function canRequestScheduleInvoice(
  row: EstimatePaymentScheduleItem,
  invoice: Invoice | null | undefined,
  depositRowCount: number,
) {
  if (row.invoice_type === 'deposit' && depositRowCount !== 1) return false;
  return !invoice || (invoice.status === 'void' && invoice.amount_paid_cents === 0);
}
