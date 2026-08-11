import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Estimate, EstimatePaymentScheduleItem, Invoice } from '../../src/types';
import {
  canRequestScheduleInvoice,
  estimateBillingSummary,
  invoiceForScheduleRow,
  scheduleBillingPresentation,
} from '../../src/features/estimates/depositWorkflow';
import {
  createOfflinePaymentDraft,
  normalizeOfflinePaymentRecords,
  offlinePaymentDraftIsFullBalance,
  validateOfflinePaymentDraft,
} from '../../src/features/invoices/offlinePayments';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'invoice-1',
    contractor_id: 'contractor-1',
    homeowner_user_id: null,
    home_id: null,
    local_contact_id: 'customer-1',
    local_home_id: 'property-1',
    service_request_id: null,
    job_id: null,
    estimate_id: 'estimate-1',
    invoice_type: 'deposit',
    invoice_sequence: 1,
    invoice_number: '',
    title: 'Deposit Invoice',
    scope: '',
    notes: '',
    terms: '',
    status: 'sent',
    subtotal_cents: 200000,
    material_total_cents: 0,
    labor_total_cents: 0,
    fee_total_cents: 200000,
    other_total_cents: 0,
    tax_cents: 0,
    discount_cents: 0,
    total_cents: 200000,
    amount_paid_cents: 0,
    issued_at: '2026-08-07T12:00:00.000Z',
    due_at: null,
    paid_at: null,
    voided_at: null,
    created_at: '2026-08-07T12:00:00.000Z',
    updated_at: '2026-08-07T12:00:00.000Z',
    line_items: [],
    ...overrides,
  };
}

function schedule(overrides: Partial<EstimatePaymentScheduleItem> = {}): EstimatePaymentScheduleItem {
  return {
    id: 'schedule-1',
    estimate_id: 'estimate-1',
    invoice_type: 'deposit',
    label: 'Deposit',
    amount_type: 'percentage',
    amount_value: 20,
    calculated_amount_cents: 200000,
    due_trigger: 'Due on approval',
    sort_order: 0,
    linked_invoice_id: null,
    created_at: '2026-08-07T12:00:00.000Z',
    updated_at: '2026-08-07T12:00:00.000Z',
    ...overrides,
  };
}

test.describe('Accepted Estimate Deposit Workflow', () => {
  test('summarizes invoiced, paid, scheduled, and remaining Estimate amounts without double counting', () => {
    const deposit = schedule({ linked_invoice_id: 'invoice-1' });
    const progress = schedule({ id: 'schedule-2', invoice_type: 'progress', calculated_amount_cents: 300000 });
    const final = schedule({ id: 'schedule-3', invoice_type: 'final', calculated_amount_cents: 500000 });
    const estimate = {
      id: 'estimate-1',
      total_cents: 1000000,
      payment_schedule_items: [deposit, progress, final],
    } as Estimate;
    const result = estimateBillingSummary(estimate, [invoice({ amount_paid_cents: 50000, status: 'partially_paid' })]);

    expect(result).toEqual({
      amountInvoicedCents: 200000,
      amountPaidCents: 50000,
      remainingScheduledCents: 800000,
      remainingEstimateCents: 950000,
    });
    expect(invoiceForScheduleRow(deposit, [])).toBeNull();
    expect(estimateBillingSummary(estimate, []).remainingScheduledCents).toBe(800000);
  });

  test('supports one deliberate Deposit request and unpaid-void replacement only', () => {
    const row = schedule();
    expect(canRequestScheduleInvoice(row, null, 1)).toBe(true);
    expect(canRequestScheduleInvoice(row, invoice({ status: 'draft' }), 1)).toBe(false);
    expect(canRequestScheduleInvoice(row, invoice({ status: 'void', amount_paid_cents: 0 }), 1)).toBe(true);
    expect(canRequestScheduleInvoice(row, invoice({ status: 'void', amount_paid_cents: 1 }), 1)).toBe(false);
    expect(canRequestScheduleInvoice(row, null, 2)).toBe(false);
    expect(scheduleBillingPresentation(row, null).label).toBe('Not requested');
    expect(scheduleBillingPresentation(row, invoice({ status: 'partially_paid', amount_paid_cents: 50000 })).label).toBe('Partially Paid');
  });

  test('validates partial offline payments against the remaining balance', () => {
    const target = invoice({ amount_paid_cents: 50000, status: 'partially_paid' });
    const draft = createOfflinePaymentDraft(target);
    expect(draft.amount).toBe('1500.00');
    expect(validateOfflinePaymentDraft(target, { ...draft, amount: '500.00' }).submission?.amountCents).toBe(50000);
    expect(validateOfflinePaymentDraft(target, { ...draft, amount: '1500.01' }).error).toContain('cannot exceed');
    expect(validateOfflinePaymentDraft(target, { ...draft, amount: '0' }).error).toContain('greater than zero');
    expect(validateOfflinePaymentDraft(target, { ...draft, amount: '500.001' }).error).toContain('two decimal places');
  });

  test('defaults saved Draft Invoices to a full-balance Mark Paid submission', () => {
    const target = invoice({ status: 'draft', amount_paid_cents: 0, total_cents: 200000 });
    const draft = createOfflinePaymentDraft(target);

    expect(draft.amount).toBe('2000.00');
    expect(offlinePaymentDraftIsFullBalance(target, draft)).toBe(true);
    expect(offlinePaymentDraftIsFullBalance(target, { ...draft, amount: '500.00' })).toBe(false);
    expect(validateOfflinePaymentDraft(target, draft).submission?.amountCents).toBe(200000);
  });

  test('normalizes only sanitized payment-history records', () => {
    const safe = {
      id: 'payment-1', invoice_id: 'invoice-1', amount_cents: 50000, payment_date: '2026-08-07',
      payment_method: 'check', reference: 'CHK-100', note: null, recorded_by_name: 'Office', created_at: '2026-08-07T12:00:00Z',
    };
    expect(normalizeOfflinePaymentRecords([safe])).toEqual([safe]);
    expect(normalizeOfflinePaymentRecords([{ ...safe, payment_method: 'stripe' }])).toEqual([]);
  });

  test('migration is server-authoritative, append-only, retry-safe, and Stripe-free', () => {
    const sql = sourceFile('servsync-accepted-estimate-deposit-workflow.sql');
    const app = sourceFile('src/App.tsx');
    const dialog = sourceFile('src/features/invoices/RecordInvoicePaymentDialog.tsx');

    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('v_schedule.calculated_amount_cents');
    expect(sql).toContain('invoice_offline_payment_records_immutable');
    expect(sql).toContain('unique (contractor_id, idempotency_key)');
    expect(sql).toContain('force row level security');
    expect(sql).toContain('current_user_can_manage_contractor_billing');
    expect(sql).toContain("v_next_status := case when v_next_paid_cents = v_invoice.total_cents then 'paid' else 'partially_paid' end;");
    expect(sql).not.toMatch(/payment_intent|checkout_session|stripe_connect|pay now/i);
    expect(app).toContain('Job creation remains available whether the deposit is unrequested, outstanding, partially paid, or paid.');
    expect(app).toContain('Deposit Invoice draft created. Review it before sending; no message was sent automatically.');
    expect(dialog).toContain('This does not process a payment or contact a payment provider.');
  });

  test('Draft Mark Paid UI stays on the existing offline-payment and billing-permission path', () => {
    const migration = sourceFile('servsync-draft-invoice-mark-paid.sql');
    const app = sourceFile('src/App.tsx');
    const dialog = sourceFile('src/features/invoices/RecordInvoicePaymentDialog.tsx');

    expect(migration).toContain("v_invoice.status not in ('draft', 'sent', 'viewed', 'overdue', 'partially_paid')");
    expect(migration).toContain("v_finalizing_draft := v_invoice.status = 'draft';");
    expect(migration).toContain('A Draft Invoice must be marked paid in full.');
    expect(migration).toContain('current_user_can_manage_contractor_billing');
    expect(migration).toContain("'finalized_from_draft', v_finalizing_draft");
    expect(migration).not.toMatch(/service_role.*grant|stripe|payment_intent|checkout_session/i);
    expect(app).toContain("['draft', 'sent', 'viewed', 'overdue', 'partially_paid', 'paid'].includes(invoice.status)");
    expect(app).toContain("invoice.status === 'paid' ? 'Payment history' : invoice.status === 'draft' ? 'Mark Paid' : 'Record payment'");
    expect(dialog).toContain('Marking this Draft paid finalizes the Invoice.');
    expect(dialog).toContain('readOnly={finalizingDraft}');
  });
});
