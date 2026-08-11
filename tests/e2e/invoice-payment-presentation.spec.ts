import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Invoice } from '../../src/types';
import {
  invoiceAmountPaidCents,
  invoiceBalanceDueCents,
  invoicePaymentPresentation,
  invoicePaymentSummaryRows,
} from '../../src/features/invoices/paymentPresentation';
import { formatMoney, formatShortDate } from '../../src/utils/format';

type PaymentInvoice = Pick<Invoice, 'status' | 'total_cents' | 'amount_paid_cents' | 'due_at' | 'paid_at' | 'voided_at'>;

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function paymentInvoice(overrides: Partial<PaymentInvoice> = {}): PaymentInvoice {
  return {
    status: 'sent',
    total_cents: 100000,
    amount_paid_cents: 0,
    due_at: '2026-07-20T12:00:00.000Z',
    paid_at: null,
    voided_at: null,
    ...overrides,
  };
}

test.describe('Invoice payment presentation', () => {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`Draft Mark Paid dialog is usable without layout overflow on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page.evaluate(async () => {
        const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
        const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
        const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
          createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
        }).createRoot;
        const module = await dynamicImport('/src/features/invoices/RecordInvoicePaymentDialog.tsx');
        const Dialog = module.RecordInvoicePaymentDialog as (...args: unknown[]) => unknown;
        const invoice = {
          id: 'invoice-draft-1', contractor_id: 'contractor-1', homeowner_user_id: null,
          local_contact_id: 'customer-1', service_request_id: null, job_id: null, estimate_id: null,
          home_id: null, local_home_id: 'property-1', invoice_number: 'INV-1042', invoice_type: 'standard',
          title: 'Repair Invoice', scope: '', notes: '', terms: '', status: 'draft', subtotal_cents: 125000,
          tax_cents: 0, discount_cents: 0, total_cents: 125000, amount_paid_cents: 0,
          issued_at: null, due_at: null, paid_at: null, voided_at: null,
          created_at: '2026-08-11T12:00:00.000Z', updated_at: '2026-08-11T12:00:00.000Z', line_items: [],
        };
        document.body.innerHTML = '<div id="invoice-payment-dialog-root"></div>';
        createRoot(document.getElementById('invoice-payment-dialog-root') as HTMLElement).render(
          React.createElement(Dialog, {
            invoice, payments: [], onlinePayments: [], loadingHistory: false, submitting: false,
            onClose: () => undefined, onSubmit: async () => undefined,
          }),
        );
      });

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Mark Paid' })).toBeVisible();
      await expect(page.getByLabel('Payment amount')).toHaveValue('1250.00');
      await expect(page.getByLabel('Payment amount')).toHaveAttribute('readonly', '');
      await expect(page.getByText('It will no longer be editable as a Draft.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mark Paid' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    });
  }

  test('presents paid invoices with paid date, amount paid, and zero balance', () => {
    const invoice = paymentInvoice({
      status: 'paid',
      amount_paid_cents: 100000,
      paid_at: '2026-07-12T15:30:00.000Z',
    });
    const presentation = invoicePaymentPresentation(invoice);

    expect(presentation.status.label).toBe('Paid');
    expect(presentation.primary).toBe(`Paid ${formatShortDate(invoice.paid_at)}`);
    expect(presentation.secondary).toBe(`Amount paid ${formatMoney(100000)} · Balance due ${formatMoney(0)}`);
    expect(invoiceBalanceDueCents(invoice)).toBe(0);
    expect(invoicePaymentSummaryRows(invoice)).toContainEqual({ label: 'Paid date', value: formatShortDate(invoice.paid_at) });
  });

  test('keeps paid invoices readable when paid_at is missing', () => {
    const presentation = invoicePaymentPresentation(paymentInvoice({
      status: 'paid',
      amount_paid_cents: 100000,
      paid_at: null,
    }));

    expect(presentation.primary).toBe('Paid');
    expect(presentation.primary).not.toContain('undefined');
    expect(presentation.primary).not.toContain('Invalid');
  });

  test('presents partially paid invoices and preserves cautious inconsistent-data copy', () => {
    const partial = invoicePaymentPresentation(paymentInvoice({
      status: 'partially_paid',
      amount_paid_cents: 40000,
    }));
    expect(partial.status.label).toBe('Partially Paid');
    expect(partial.primary).toBe(`${formatMoney(40000)} paid · ${formatMoney(60000)} remaining`);

    const missingAmount = invoicePaymentPresentation(paymentInvoice({
      status: 'partially_paid',
      amount_paid_cents: 0,
    }));
    expect(missingAmount.primary).toBe('Payment amount not recorded');
    expect(invoicePaymentSummaryRows(paymentInvoice({ status: 'partially_paid', amount_paid_cents: 0 }))).toContainEqual({
      label: 'Payment status',
      value: 'Payment amount not recorded',
    });
  });

  test('clamps runtime cents values for display without changing status semantics', () => {
    expect(invoiceAmountPaidCents(paymentInvoice({ amount_paid_cents: -500 }))).toBe(0);
    expect(invoiceAmountPaidCents(paymentInvoice({ amount_paid_cents: 150000 }))).toBe(100000);
    expect(invoiceBalanceDueCents(paymentInvoice({ status: 'partially_paid', amount_paid_cents: 150000 }))).toBe(0);
    expect(invoicePaymentPresentation(paymentInvoice({ status: 'partially_paid', amount_paid_cents: 150000 })).status.label).toBe('Partially Paid');
  });

  test('uses persisted overdue status only and handles missing due dates safely', () => {
    const overdue = paymentInvoice({
      status: 'overdue',
      amount_paid_cents: 40000,
      due_at: '2026-07-01T12:00:00.000Z',
    });
    expect(invoicePaymentPresentation(overdue).primary).toBe(`Due ${formatShortDate(overdue.due_at)} · ${formatMoney(60000)} remaining`);

    const noDue = invoicePaymentPresentation(paymentInvoice({
      status: 'overdue',
      due_at: null,
    }));
    expect(noDue.primary).toBe(`${formatMoney(100000)} remaining`);

    expect(invoicePaymentPresentation(paymentInvoice({
      status: 'paid',
      due_at: '2020-01-01T12:00:00.000Z',
      amount_paid_cents: 100000,
    })).status.label).toBe('Paid');
    expect(invoicePaymentPresentation(paymentInvoice({
      status: 'void',
      due_at: '2020-01-01T12:00:00.000Z',
    })).status.label).toBe('Void');
  });

  test('presents void invoices with no active balance while retaining historical total rows', () => {
    const invoice = paymentInvoice({
      status: 'void',
      voided_at: '2026-07-12T15:30:00.000Z',
    });
    const presentation = invoicePaymentPresentation(invoice);
    const rows = invoicePaymentSummaryRows(invoice);

    expect(presentation.primary).toBe(`Voided ${formatShortDate(invoice.voided_at)}`);
    expect(presentation.secondary).toBe('No active balance due.');
    expect(presentation.balanceDueCents).toBe(0);
    expect(rows).toContainEqual({ label: 'Invoice total', value: formatMoney(100000) });
    expect(rows).toContainEqual({ label: 'Active balance', value: 'No active balance due' });
  });

  test('keeps draft, sent, and viewed invoices free of false payment activity', () => {
    for (const status of ['draft', 'sent', 'viewed'] as const) {
      const presentation = invoicePaymentPresentation(paymentInvoice({ status }));
      expect(presentation.primary).toContain('remaining');
      expect(presentation.primary).not.toContain('paid');
      expect(presentation.primary).not.toContain('Voided');
    }
  });

  test('keeps homeowner display read-only while adding contractor offline-payment history', () => {
    const appSource = sourceFile('src/App.tsx');
    const componentSource = sourceFile('src/features/invoices/InvoicePaymentSummary.tsx');
    const helperSource = sourceFile('src/features/invoices/paymentPresentation.ts');

    expect(appSource).toContain("import { InvoicePaymentSummary } from './features/invoices/InvoicePaymentSummary';");
    expect(appSource).toContain('data-testid="homeowner-invoice-card"');
    expect(appSource).toContain('data-testid="contractor-invoice-card"');
    expect(appSource).toContain('<InvoicePaymentSummary invoice={invoice} className="mt-2" />');
    expect(appSource).toContain('<InvoicePaymentSummary invoice={invoice} variant="detail" showStatus');
    expect(appSource).toContain('<InvoicePaymentSummary invoice={linkedInvoiceForJob}');
    expect(appSource).toContain('Pay online when available, or contact your contractor for payment instructions.');
    expect(appSource).toContain("invoice.status === 'draft' ? 'Mark Paid' : 'Record payment'");
    expect(appSource).toContain('Payment history');
    expect(componentSource).toContain('data-testid="invoice-payment-summary-compact"');
    expect(componentSource).toContain('data-testid="invoice-payment-summary-detail"');
    expect(componentSource).toContain('max-w-full flex-wrap');
    expect(componentSource).toContain('break-words');
    expect(componentSource).toContain('sm:grid-cols-2');
    expect(componentSource).not.toContain('button');
    expect(componentSource).not.toContain('tabIndex');
    expect(componentSource).not.toContain('progress');
    expect(componentSource).not.toContain('onClick');
    expect(helperSource).not.toContain('Pay now');
    expect(helperSource).not.toContain('Stripe');
  });

  test('preserves invoice action, PDF, date, SQL, and backend boundaries', () => {
    const appSource = sourceFile('src/App.tsx');
    const paymentDialogSource = sourceFile('src/features/invoices/RecordInvoicePaymentDialog.tsx');
    const pdfSource = sourceFile('src/utils/pdfDocuments.ts');
    const dateSource = sourceFile('src/utils/datePresentation.ts');
    const helperSource = sourceFile('src/features/invoices/paymentPresentation.ts');

    expect(paymentDialogSource).toContain("['draft', 'sent', 'viewed', 'overdue', 'partially_paid'].includes(invoice.status)");
    expect(paymentDialogSource).toContain("finalizingDraft ? 'Mark Paid' : 'Record payment'");
    expect(paymentDialogSource).toContain('Record money received outside ServSync.');
    expect(appSource).toContain('recordOfflineInvoicePayment');
    expect(appSource).toContain('voidInvoice(invoice)');
    expect(appSource).not.toContain("status === 'Paid'");
    expect(appSource).not.toContain("status === 'Partially Paid'");
    expect(appSource).not.toContain("status === 'Overdue'");
    expect(appSource).not.toContain("status === 'Void'");
    expect(pdfSource).toContain('function invoiceBalanceDueCents');
    expect(pdfSource).toContain("pdf.text('PAID'");
    expect(pdfSource).toContain("moneyRow('Invoice Total'");
    expect(pdfSource).toContain("moneyRow('Amount Paid'");
    expect(pdfSource).toContain("moneyRow('Balance Due'");
    expect(pdfSource).toContain('formatPdfDate(invoice.paid_at)');
    expect(pdfSource).not.toContain('InvoicePaymentSummary');
    expect(dateSource).not.toContain('invoicePayment');
    expect(helperSource).not.toContain('supabase');
    expect(helperSource).not.toContain('.from(');
    expect(helperSource).not.toContain('.rpc(');
    expect(helperSource).not.toContain('localStorage');
    expect(helperSource).not.toContain('sessionStorage');
  });
});
