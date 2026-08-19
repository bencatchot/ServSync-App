import { expect, test } from '@playwright/test';
import type { Estimate, EstimatePaymentScheduleItem, Invoice } from '../../src/types';
import {
  ESTIMATE_PAYMENT_SCHEDULE_TYPE_DEFAULTS,
  createDefaultEstimatePaymentScheduleDraft,
  createDepositFinalEstimatePaymentScheduleDraft,
  createEstimatePaymentScheduleDraftRow,
  estimatePaymentScheduleCalculatedCents,
  estimatePaymentScheduleDisplayWarning,
  estimatePaymentScheduleDraftFromEstimate,
  estimatePaymentScheduleDraftWarning,
  estimatePaymentScheduleInvoiceTypeCustomerLabel,
  estimatePaymentScheduleLinkedInvoiceSummary,
  estimatePaymentScheduleRowsForDraft,
  estimatePaymentScheduleRowsWithTotals,
  sortedEstimatePaymentScheduleRows,
  validateEstimatePaymentScheduleForSave,
} from '../../src/features/estimates/paymentSchedule';
import { sourceFile } from '../helpers/source-contract.mjs';

function scheduleItem(overrides: Partial<EstimatePaymentScheduleItem> = {}): EstimatePaymentScheduleItem {
  return {
    id: 'schedule-1',
    estimate_id: 'estimate-1',
    invoice_type: 'progress',
    label: 'Progress payment',
    amount_type: 'fixed',
    amount_value: 250,
    calculated_amount_cents: 25_000,
    due_trigger: 'Due at milestone',
    sort_order: 0,
    linked_invoice_id: null,
    created_at: '2026-08-19T12:00:00.000Z',
    updated_at: '2026-08-19T12:00:00.000Z',
    ...overrides,
  };
}

function estimate(overrides: Partial<Estimate> = {}): Estimate {
  return {
    id: 'estimate-1',
    contractor_id: 'contractor-1',
    homeowner_user_id: 'homeowner-1',
    local_contact_id: null,
    service_request_id: null,
    inspection_id: null,
    title: 'System replacement',
    scope: 'Replace the system.',
    notes: '',
    terms: '',
    status: 'accepted',
    subtotal_cents: 100_000,
    total_cents: 100_000,
    created_at: '2026-08-19T12:00:00.000Z',
    updated_at: '2026-08-19T12:00:00.000Z',
    line_items: [],
    payment_schedule_items: [],
    ...overrides,
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'invoice-1',
    contractor_id: 'contractor-1',
    homeowner_user_id: 'homeowner-1',
    local_contact_id: null,
    service_request_id: null,
    job_id: null,
    estimate_id: 'estimate-1',
    invoice_number: 'INV-1',
    invoice_type: 'progress',
    title: 'Progress invoice',
    scope: '',
    notes: '',
    terms: '',
    status: 'draft',
    subtotal_cents: 25_000,
    tax_cents: 0,
    discount_cents: 0,
    total_cents: 25_000,
    amount_paid_cents: 0,
    issued_at: null,
    due_at: null,
    paid_at: null,
    voided_at: null,
    created_at: '2026-08-19T12:00:00.000Z',
    updated_at: '2026-08-19T12:00:00.000Z',
    line_items: [],
    ...overrides,
  };
}

test.describe('Estimate payment-schedule domain', () => {
  test('owns schedule models, calculations, and save validation outside the App shell', () => {
    const appSource = sourceFile('src/App.tsx');
    const domainSource = sourceFile('src/features/estimates/paymentSchedule.ts');

    expect(appSource).toContain("from './features/estimates/paymentSchedule'");
    expect(appSource).not.toContain("type EstimatePaymentScheduleMode = 'default' | 'deposit_final' | 'custom'");
    expect(appSource).not.toContain('function estimatePaymentScheduleCalculatedCents(');
    expect(appSource).not.toContain('const validateEstimatePaymentScheduleForSave =');
    expect(domainSource).toContain('export function estimatePaymentScheduleRowsWithTotals(');
    expect(domainSource).toContain('export function validateEstimatePaymentScheduleForSave(');
  });

  test('preserves default and deposit-plus-final authoring presets', () => {
    expect(createDefaultEstimatePaymentScheduleDraft()).toEqual({ mode: 'default', explicit: false, rows: [] });
    expect(ESTIMATE_PAYMENT_SCHEDULE_TYPE_DEFAULTS).toEqual({
      total: { label: 'Full payment', dueTrigger: 'Due on completion' },
      deposit: { label: 'Deposit', dueTrigger: 'Due on approval' },
      progress: { label: 'Progress payment', dueTrigger: 'Due at milestone' },
      final: { label: 'Final payment', dueTrigger: 'Due on completion' },
    });

    const draft = createDepositFinalEstimatePaymentScheduleDraft();
    expect(draft).toMatchObject({
      mode: 'deposit_final',
      explicit: true,
      rows: [
        { invoice_type: 'deposit', amount_type: 'percentage', amount_value: '50', sort_order: 0 },
        { invoice_type: 'final', amount_type: 'fixed', amount_value: '', sort_order: 1 },
      ],
    });
  });

  test('hydrates sorted persisted rows and recognizes only the exact deposit-final shape', () => {
    const draft = estimatePaymentScheduleDraftFromEstimate(estimate({
      payment_schedule_items: [
        scheduleItem({ id: 'final', invoice_type: 'final', amount_value: 750, sort_order: 1 }),
        scheduleItem({ id: 'deposit', invoice_type: 'deposit', amount_type: 'percentage', amount_value: 25, sort_order: 0 }),
      ],
    }));
    expect(draft.mode).toBe('deposit_final');
    expect(draft.rows.map(row => [row.id, row.amount_value])).toEqual([['deposit', '25'], ['final', '750.00']]);

    expect(estimatePaymentScheduleDraftFromEstimate(estimate({
      payment_schedule_items: [scheduleItem({ invoice_type: 'deposit' })],
    })).mode).toBe('custom');
  });

  test('calculates fixed and percentage amounts without allowing negative totals', () => {
    expect(estimatePaymentScheduleCalculatedCents(createEstimatePaymentScheduleDraftRow({ amount_value: '$1,234.56' }), 10_000)).toBe(123_456);
    expect(estimatePaymentScheduleCalculatedCents(createEstimatePaymentScheduleDraftRow({ amount_type: 'percentage', amount_value: '12.5%' }), 80_000)).toBe(10_000);
    expect(estimatePaymentScheduleCalculatedCents(createEstimatePaymentScheduleDraftRow({ amount_type: 'percentage', amount_value: '50' }), -100)).toBe(0);
    expect(estimatePaymentScheduleCalculatedCents(createEstimatePaymentScheduleDraftRow({ amount_value: '-1' }), 10_000)).toBe(0);
  });

  test('derives complementary final payment and stable row totals for deposit-final schedules', () => {
    const draft = createDepositFinalEstimatePaymentScheduleDraft();
    expect(estimatePaymentScheduleRowsForDraft(draft, 100_001)).toMatchObject([
      { invoice_type: 'deposit', amount_value: '50', sort_order: 0 },
      { invoice_type: 'final', amount_value: '500.00', sort_order: 1 },
    ]);
    expect(estimatePaymentScheduleRowsWithTotals(draft, 100_001).map(row => row.calculated_amount_cents)).toEqual([50_001, 50_000]);
  });

  test('keeps draft and homeowner schedule mismatch warnings exact', () => {
    const underDraft = {
      mode: 'custom' as const,
      explicit: true,
      rows: [createEstimatePaymentScheduleDraftRow({ amount_value: '500' })],
    };
    expect(estimatePaymentScheduleDraftWarning(underDraft, 100_000)).toBe('Payment schedule total does not match the estimate total. Review before sending.');
    expect(estimatePaymentScheduleDraftWarning({ ...underDraft, rows: [createEstimatePaymentScheduleDraftRow({ amount_value: '1,500' })] }, 100_000)).toBe('Payment schedule is above the estimate total. Review before saving or sending.');
    expect(estimatePaymentScheduleDisplayWarning(estimate({ payment_schedule_items: [scheduleItem({ calculated_amount_cents: 50_000 })] }))).toBe('This payment schedule total does not match the estimate total. Ask your contractor to confirm before approving.');
    expect(estimatePaymentScheduleDisplayWarning(estimate({ payment_schedule_items: [scheduleItem({ calculated_amount_cents: 150_000 })] }))).toBe('This payment schedule total is above the estimate total. Ask your contractor to correct it before approving.');
  });

  test('normalizes a valid schedule into the exact persistence payload', () => {
    const result = validateEstimatePaymentScheduleForSave({
      mode: 'custom',
      explicit: true,
      rows: [createEstimatePaymentScheduleDraftRow({
        invoice_type: 'progress',
        label: ' ',
        amount_type: 'percentage',
        amount_value: '33.333',
        due_trigger: '  Due after rough-in  ',
        sort_order: 7,
      })],
    }, 90_000);

    expect(result).toEqual({
      rows: [{
        invoice_type: 'progress',
        label: 'Progress',
        amount_type: 'percentage',
        amount_value: 33.33,
        calculated_amount_cents: 30_000,
        due_trigger: 'Due after rough-in',
        sort_order: 0,
        linked_invoice_id: null,
      }],
      error: '',
    });
  });

  test('fails closed for invalid amounts and more than one deposit', () => {
    expect(validateEstimatePaymentScheduleForSave(createDefaultEstimatePaymentScheduleDraft(), 100_000)).toEqual({ rows: [], error: '' });
    expect(validateEstimatePaymentScheduleForSave({
      mode: 'custom',
      explicit: true,
      rows: [createEstimatePaymentScheduleDraftRow({ invoice_type: 'progress', amount_value: '-1' })],
    }, 100_000)).toEqual({ rows: [], error: 'Enter a valid progress schedule amount before saving.' });
    expect(validateEstimatePaymentScheduleForSave({
      mode: 'custom',
      explicit: true,
      rows: [
        createEstimatePaymentScheduleDraftRow({ invoice_type: 'deposit', amount_value: '10' }),
        createEstimatePaymentScheduleDraftRow({ invoice_type: 'deposit', amount_value: '10' }),
      ],
    }, 100_000)).toEqual({
      rows: [],
      error: 'Use one Deposit payment in the schedule. Add later milestones as Progress or Final payments.',
    });
  });

  test('sorts customer rows, labels every invoice type, and summarizes linked billing', () => {
    const scheduledEstimate = estimate({
      payment_schedule_items: [
        scheduleItem({ id: 'paid-row', linked_invoice_id: 'paid-invoice', calculated_amount_cents: 75_000, sort_order: 1 }),
        scheduleItem({ id: 'draft-row', linked_invoice_id: 'draft-invoice', calculated_amount_cents: 25_000, sort_order: 0 }),
      ],
    });
    const invoices = [
      invoice({ id: 'paid-invoice', status: 'paid', total_cents: 75_000, amount_paid_cents: 75_000 }),
      invoice({ id: 'draft-invoice', status: 'draft', total_cents: 25_000 }),
    ];

    expect(sortedEstimatePaymentScheduleRows(scheduledEstimate).map(row => row.id)).toEqual(['draft-row', 'paid-row']);
    expect(['total', 'deposit', 'progress', 'final', 'other'].map(estimatePaymentScheduleInvoiceTypeCustomerLabel)).toEqual([
      'Total invoice', 'Deposit invoice', 'Progress invoice', 'Final invoice', 'Scheduled invoice',
    ]);
    expect(estimatePaymentScheduleLinkedInvoiceSummary(scheduledEstimate, invoices)).toEqual({
      totalCount: 2,
      linkedCount: 2,
      scheduledTotalCents: 100_000,
      amountInvoicedCents: 100_000,
      amountPaidCents: 75_000,
      remainingScheduledCents: 0,
      remainingEstimateCents: 25_000,
      statusSummary: '1 Draft · 1 Paid',
    });
  });
});
