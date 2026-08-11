import type { Invoice, InvoiceOfflinePaymentMethod, InvoiceOfflinePaymentRecord } from '../../types';
import { invoiceBalanceDueCents } from './paymentPresentation';

export const OFFLINE_PAYMENT_METHOD_OPTIONS: Array<{ value: InvoiceOfflinePaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'bank_transfer', label: 'Bank transfer / external ACH' },
  { value: 'card_terminal', label: 'External card terminal' },
  { value: 'other', label: 'Other offline method' },
];

export interface OfflinePaymentDraft {
  amount: string;
  paymentDate: string;
  paymentMethod: InvoiceOfflinePaymentMethod;
  reference: string;
  note: string;
  idempotencyKey: string;
}

export interface OfflinePaymentSubmission {
  amountCents: number;
  paymentDate: string;
  paymentMethod: InvoiceOfflinePaymentMethod;
  reference: string | null;
  note: string | null;
  idempotencyKey: string;
}

function localDateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function createOfflinePaymentDraft(invoice: Invoice): OfflinePaymentDraft {
  return {
    amount: (invoiceBalanceDueCents(invoice) / 100).toFixed(2),
    paymentDate: localDateInputValue(),
    paymentMethod: 'check',
    reference: '',
    note: '',
    idempotencyKey: crypto.randomUUID(),
  };
}

export function offlinePaymentDraftIsFullBalance(invoice: Invoice, draft: OfflinePaymentDraft) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(draft.amount.trim())) return false;
  const amount = Number(draft.amount);
  return Number.isFinite(amount)
    && Math.round(amount * 100) === invoiceBalanceDueCents(invoice)
    && invoiceBalanceDueCents(invoice) > 0;
}

export function offlinePaymentMethodLabel(method: InvoiceOfflinePaymentMethod) {
  return OFFLINE_PAYMENT_METHOD_OPTIONS.find(option => option.value === method)?.label ?? 'Offline payment';
}

export function validateOfflinePaymentDraft(invoice: Invoice, draft: OfflinePaymentDraft) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(draft.amount.trim())) {
    return { submission: null, error: 'Enter a valid payment amount with no more than two decimal places.' };
  }
  const amount = Number(draft.amount);
  const amountCents = Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  const balanceDueCents = invoiceBalanceDueCents(invoice);
  const reference = draft.reference.trim();
  const note = draft.note.trim();

  if (amountCents <= 0) return { submission: null, error: 'Enter a payment amount greater than zero.' };
  if (amountCents > balanceDueCents) return { submission: null, error: 'Payment amount cannot exceed the remaining Invoice balance.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.paymentDate)) return { submission: null, error: 'Choose the date the payment was received.' };
  if (draft.paymentDate > localDateInputValue()) return { submission: null, error: 'Payment date cannot be in the future.' };
  if (!OFFLINE_PAYMENT_METHOD_OPTIONS.some(option => option.value === draft.paymentMethod)) return { submission: null, error: 'Choose a payment method.' };
  if (reference.length > 120) return { submission: null, error: 'Reference must be 120 characters or fewer.' };
  if (note.length > 500) return { submission: null, error: 'Note must be 500 characters or fewer.' };

  return {
    submission: {
      amountCents,
      paymentDate: draft.paymentDate,
      paymentMethod: draft.paymentMethod,
      reference: reference || null,
      note: note || null,
      idempotencyKey: draft.idempotencyKey,
    } satisfies OfflinePaymentSubmission,
    error: '',
  };
}

export function normalizeOfflinePaymentRecords(value: unknown): InvoiceOfflinePaymentRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((record): record is InvoiceOfflinePaymentRecord => {
    if (!record || typeof record !== 'object') return false;
    const candidate = record as Partial<InvoiceOfflinePaymentRecord>;
    return typeof candidate.id === 'string'
      && typeof candidate.invoice_id === 'string'
      && Number.isSafeInteger(candidate.amount_cents)
      && typeof candidate.payment_date === 'string'
      && OFFLINE_PAYMENT_METHOD_OPTIONS.some(option => option.value === candidate.payment_method)
      && (candidate.reference === null || typeof candidate.reference === 'string')
      && (candidate.note === null || typeof candidate.note === 'string')
      && typeof candidate.recorded_by_name === 'string'
      && typeof candidate.created_at === 'string';
  });
}
