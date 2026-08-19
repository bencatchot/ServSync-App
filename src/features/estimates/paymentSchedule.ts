import type {
  Estimate,
  EstimatePaymentScheduleAmountType,
  EstimatePaymentScheduleInvoiceType,
  Invoice,
  InvoiceStatus,
} from '../../types';
import { invoiceStatusLabel } from '../invoices/status';
import { estimateBillingSummary } from './depositWorkflow';

export type EstimatePaymentScheduleMode = 'default' | 'deposit_final' | 'custom';

export type EstimatePaymentScheduleDraftRow = {
  id: string;
  invoice_type: EstimatePaymentScheduleInvoiceType;
  label: string;
  amount_type: EstimatePaymentScheduleAmountType;
  amount_value: string;
  due_trigger: string;
  sort_order: number;
};

export type EstimatePaymentScheduleDraft = {
  mode: EstimatePaymentScheduleMode;
  explicit: boolean;
  rows: EstimatePaymentScheduleDraftRow[];
};

export type EstimatePaymentScheduleDraftRowWithTotal = EstimatePaymentScheduleDraftRow & {
  calculated_amount_cents: number;
};

export type EstimatePaymentScheduleSaveRow = {
  invoice_type: EstimatePaymentScheduleInvoiceType;
  label: string;
  amount_type: EstimatePaymentScheduleAmountType;
  amount_value: number;
  calculated_amount_cents: number;
  due_trigger: string;
  sort_order: number;
  linked_invoice_id: null;
};

export type EstimatePaymentScheduleSaveResult = {
  rows: EstimatePaymentScheduleSaveRow[];
  error: string;
};

export const ESTIMATE_PAYMENT_SCHEDULE_INVOICE_TYPE_LABELS: Record<EstimatePaymentScheduleInvoiceType, string> = {
  total: 'Total',
  deposit: 'Deposit',
  progress: 'Progress',
  final: 'Final',
};

export const ESTIMATE_PAYMENT_SCHEDULE_AMOUNT_TYPE_LABELS: Record<EstimatePaymentScheduleAmountType, string> = {
  fixed: 'Dollar amount',
  percentage: 'Percentage',
};

export const ESTIMATE_PAYMENT_SCHEDULE_TYPE_DEFAULTS: Record<
  EstimatePaymentScheduleInvoiceType,
  { label: string; dueTrigger: string }
> = {
  total: {
    label: 'Full payment',
    dueTrigger: 'Due on completion',
  },
  deposit: {
    label: 'Deposit',
    dueTrigger: 'Due on approval',
  },
  progress: {
    label: 'Progress payment',
    dueTrigger: 'Due at milestone',
  },
  final: {
    label: 'Final payment',
    dueTrigger: 'Due on completion',
  },
};

export function createEstimatePaymentScheduleDraftRow(
  overrides: Partial<EstimatePaymentScheduleDraftRow> = {},
): EstimatePaymentScheduleDraftRow {
  return {
    id: crypto.randomUUID(),
    invoice_type: 'progress',
    label: '',
    amount_type: 'fixed',
    amount_value: '',
    due_trigger: '',
    sort_order: 0,
    ...overrides,
  };
}

export function createDefaultEstimatePaymentScheduleDraft(
  overrides: Partial<EstimatePaymentScheduleDraft> = {},
): EstimatePaymentScheduleDraft {
  return {
    mode: 'default',
    explicit: false,
    rows: [],
    ...overrides,
  };
}

export function createDepositFinalEstimatePaymentScheduleDraft(): EstimatePaymentScheduleDraft {
  return {
    mode: 'deposit_final',
    explicit: true,
    rows: [
      createEstimatePaymentScheduleDraftRow({
        invoice_type: 'deposit',
        label: 'Deposit',
        amount_type: 'percentage',
        amount_value: '50',
        due_trigger: 'Due on approval',
        sort_order: 0,
      }),
      createEstimatePaymentScheduleDraftRow({
        invoice_type: 'final',
        label: 'Final payment',
        amount_type: 'fixed',
        amount_value: '',
        due_trigger: 'Due on completion',
        sort_order: 1,
      }),
    ],
  };
}

function paymentScheduleAmountInputFromValue(
  value: number | null | undefined,
  amountType: EstimatePaymentScheduleAmountType,
) {
  if (value === null || value === undefined) return '';
  return amountType === 'fixed' ? Number(value).toFixed(2) : String(Number(value));
}

export function estimatePaymentScheduleDraftFromEstimate(estimate: Estimate): EstimatePaymentScheduleDraft {
  const rows = [...(estimate.payment_schedule_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  if (rows.length === 0) return createDefaultEstimatePaymentScheduleDraft();
  const draftRows = rows.map(row => createEstimatePaymentScheduleDraftRow({
    id: row.id,
    invoice_type: row.invoice_type,
    label: row.label,
    amount_type: row.amount_type,
    amount_value: paymentScheduleAmountInputFromValue(row.amount_value, row.amount_type),
    due_trigger: row.due_trigger,
    sort_order: row.sort_order,
  }));
  const looksLikeDepositFinal = draftRows.length === 2
    && draftRows[0]?.invoice_type === 'deposit'
    && draftRows[1]?.invoice_type === 'final';
  return {
    mode: looksLikeDepositFinal ? 'deposit_final' : 'custom',
    explicit: true,
    rows: draftRows,
  };
}

export function estimatePaymentScheduleInvoiceTypeCustomerLabel(value: string | null | undefined) {
  switch (value) {
    case 'total':
      return 'Total invoice';
    case 'deposit':
      return 'Deposit invoice';
    case 'progress':
      return 'Progress invoice';
    case 'final':
      return 'Final invoice';
    default:
      return 'Scheduled invoice';
  }
}

export function sortedEstimatePaymentScheduleRows(estimate: Estimate) {
  return [...(estimate.payment_schedule_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
}

export function estimatePaymentScheduleDisplayTotalCents(estimate: Estimate) {
  return sortedEstimatePaymentScheduleRows(estimate).reduce((sum, row) => sum + row.calculated_amount_cents, 0);
}

export function estimatePaymentScheduleDisplayWarning(estimate: Estimate) {
  const rows = sortedEstimatePaymentScheduleRows(estimate);
  if (rows.length === 0) return '';
  const scheduleTotalCents = rows.reduce((sum, row) => sum + row.calculated_amount_cents, 0);
  if (scheduleTotalCents > estimate.total_cents) {
    return 'This payment schedule total is above the estimate total. Ask your contractor to correct it before approving.';
  }
  if (scheduleTotalCents !== estimate.total_cents) {
    return 'This payment schedule total does not match the estimate total. Ask your contractor to confirm before approving.';
  }
  return '';
}

export function estimatePaymentScheduleLinkedInvoiceSummary(estimate: Estimate, invoices: Invoice[]) {
  const rows = sortedEstimatePaymentScheduleRows(estimate);
  const linkedRows = rows.filter(row => Boolean(row.linked_invoice_id));
  const loadedLinkedInvoices = linkedRows
    .map(row => invoices.find(invoice => invoice.id === row.linked_invoice_id) ?? null)
    .filter((invoice): invoice is Invoice => Boolean(invoice));
  const statusCounts = loadedLinkedInvoices.reduce((counts, invoice) => {
    counts[invoice.status] = (counts[invoice.status] ?? 0) + 1;
    return counts;
  }, {} as Partial<Record<InvoiceStatus, number>>);
  const statusOrder: InvoiceStatus[] = ['draft', 'sent', 'viewed', 'overdue', 'partially_paid', 'paid', 'void'];
  const statusSummary = statusOrder
    .filter(status => (statusCounts[status] ?? 0) > 0)
    .map(status => `${statusCounts[status]} ${invoiceStatusLabel(status)}`)
    .join(' · ');
  const billing = estimateBillingSummary(estimate, invoices);

  return {
    totalCount: rows.length,
    linkedCount: linkedRows.length,
    scheduledTotalCents: rows.reduce((sum, row) => sum + row.calculated_amount_cents, 0),
    ...billing,
    statusSummary,
  };
}

function parseEstimatePaymentScheduleAmount(value: string) {
  const numeric = Number(value.replace(/[$,%]/g, '').trim());
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function dollarsToCents(value: string) {
  const numeric = Number(value.replace(/[$,]/g, '').trim());
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100);
}

export function estimatePaymentScheduleCalculatedCents(
  row: EstimatePaymentScheduleDraftRow,
  estimateTotalCents: number,
) {
  const amount = parseEstimatePaymentScheduleAmount(row.amount_value);
  if (amount === null) return 0;
  if (row.amount_type === 'percentage') {
    return Math.round(Math.max(0, estimateTotalCents) * amount / 100);
  }
  return dollarsToCents(row.amount_value);
}

function estimatePaymentScheduleAmountValueForPayload(row: EstimatePaymentScheduleDraftRow) {
  const amount = parseEstimatePaymentScheduleAmount(row.amount_value);
  if (amount === null) return null;
  if (row.amount_type === 'percentage') return Number(amount.toFixed(2));
  return Number((dollarsToCents(row.amount_value) / 100).toFixed(2));
}

export function estimatePaymentScheduleRowsForDraft(
  draft: EstimatePaymentScheduleDraft,
  estimateTotalCents: number,
): EstimatePaymentScheduleDraftRow[] {
  if (draft.mode === 'default') return [];
  if (draft.mode === 'deposit_final') {
    const depositFinalDraft = createDepositFinalEstimatePaymentScheduleDraft();
    const depositRow = draft.rows[0] ?? depositFinalDraft.rows[0];
    const finalRow = draft.rows[1] ?? depositFinalDraft.rows[1];
    const depositCents = estimatePaymentScheduleCalculatedCents(depositRow, estimateTotalCents);
    const finalCents = Math.max(0, estimateTotalCents - depositCents);
    return [
      { ...depositRow, invoice_type: 'deposit', sort_order: 0 },
      {
        ...finalRow,
        invoice_type: 'final',
        amount_type: 'fixed',
        amount_value: (finalCents / 100).toFixed(2),
        sort_order: 1,
      },
    ];
  }
  return draft.rows.map((row, index) => ({ ...row, sort_order: index }));
}

export function estimatePaymentScheduleRowsWithTotals(
  draft: EstimatePaymentScheduleDraft,
  estimateTotalCents: number,
): EstimatePaymentScheduleDraftRowWithTotal[] {
  return estimatePaymentScheduleRowsForDraft(draft, estimateTotalCents).map((row, index) => ({
    ...row,
    sort_order: index,
    calculated_amount_cents: estimatePaymentScheduleCalculatedCents(row, estimateTotalCents),
  }));
}

export function estimatePaymentScheduleDraftWarning(
  draft: EstimatePaymentScheduleDraft,
  estimateTotalCents: number,
) {
  const rows = estimatePaymentScheduleRowsWithTotals(draft, estimateTotalCents);
  if (rows.length === 0 || estimateTotalCents <= 0) return '';
  const scheduleTotalCents = rows.reduce((sum, row) => sum + row.calculated_amount_cents, 0);
  if (scheduleTotalCents > estimateTotalCents) {
    return 'Payment schedule is above the estimate total. Review before saving or sending.';
  }
  if (scheduleTotalCents !== estimateTotalCents) {
    return 'Payment schedule total does not match the estimate total. Review before sending.';
  }
  return '';
}

export function validateEstimatePaymentScheduleForSave(
  draft: EstimatePaymentScheduleDraft,
  estimateTotalCents: number,
): EstimatePaymentScheduleSaveResult {
  if (!draft.explicit) return { rows: [], error: '' };
  const rows = estimatePaymentScheduleRowsWithTotals(draft, estimateTotalCents);
  if (rows.filter(row => row.invoice_type === 'deposit').length > 1) {
    return {
      rows: [],
      error: 'Use one Deposit payment in the schedule. Add later milestones as Progress or Final payments.',
    };
  }
  const normalizedRows = rows.map((row, index) => {
    const amountValue = estimatePaymentScheduleAmountValueForPayload(row);
    if (amountValue === null) {
      return { error: `Enter a valid ${row.invoice_type} schedule amount before saving.`, payload: null };
    }
    return {
      error: '',
      payload: {
        invoice_type: row.invoice_type,
        label: row.label.trim() || ESTIMATE_PAYMENT_SCHEDULE_INVOICE_TYPE_LABELS[row.invoice_type],
        amount_type: row.amount_type,
        amount_value: amountValue,
        calculated_amount_cents: row.calculated_amount_cents,
        due_trigger: row.due_trigger.trim(),
        sort_order: index,
        linked_invoice_id: null,
      } satisfies EstimatePaymentScheduleSaveRow,
    };
  });
  const invalidRow = normalizedRows.find(row => row.error);
  if (invalidRow?.error) return { rows: [], error: invalidRow.error };
  return {
    rows: normalizedRows
      .map(row => row.payload)
      .filter((row): row is EstimatePaymentScheduleSaveRow => Boolean(row)),
    error: '',
  };
}
