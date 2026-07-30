import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createEstimatePdf,
  createInvoicePdf,
  downloadPdfBlob,
  PDF_OBJECT_URL_REVOKE_DELAY_MS,
  previewPdfBlob,
} from '../../src/utils/pdfDocuments';
import type { Estimate, EstimateLineItem, Invoice, InvoiceLineItem } from '../../src/types';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

async function expectValidPdf(blob: Blob) {
  expect(blob.type).toBe('application/pdf');
  expect(blob.size).toBeGreaterThan(1_000);
  const header = Buffer.from(await blob.slice(0, 5).arrayBuffer()).toString('utf8');
  expect(header).toBe('%PDF-');
}

const now = '2026-07-29T12:00:00.000Z';

function sampleEstimate(): Estimate {
  const line: EstimateLineItem = {
    id: 'estimate-line-1',
    estimate_id: 'estimate-1',
    line_type: 'material',
    description: 'Replace weatherstripping',
    line_title: 'Weatherstripping replacement',
    customer_description: 'Install new door weatherstripping.',
    model_spec: '',
    supply_status: 'contractor_supplied',
    quantity: 1,
    unit: 'each',
    unit_price_cents: 22500,
    labor_hours: null,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  };

  return {
    id: 'estimate-1',
    contractor_id: 'contractor-1',
    homeowner_user_id: 'homeowner-1',
    local_contact_id: null,
    service_request_id: null,
    inspection_id: null,
    home_id: 'home-1',
    local_home_id: null,
    home_label: 'Main home',
    home_address: '100 Main St',
    title: 'Door seal estimate',
    scope: 'Replace worn weatherstripping at the exterior door.',
    notes: 'No send or portal delivery is part of this PDF test.',
    terms: 'Due on approval.',
    status: 'draft',
    subtotal_cents: 22500,
    total_cents: 22500,
    material_total_cents: 22500,
    labor_total_cents: 0,
    fee_total_cents: 0,
    other_total_cents: 0,
    tax_rate_percent: null,
    tax_cents: 0,
    created_at: now,
    updated_at: now,
    line_items: [line],
    payment_schedule_items: [],
  };
}

function sampleInvoice(): Invoice {
  const line: InvoiceLineItem = {
    id: 'invoice-line-1',
    invoice_id: 'invoice-1',
    line_type: 'labor',
    description: 'Repair cabinet hinge',
    line_title: 'Cabinet hinge repair',
    customer_description: 'Realign loose cabinet door.',
    model_spec: '',
    supply_status: 'contractor_supplied',
    quantity: 1,
    unit: 'each',
    unit_price_cents: 16500,
    labor_hours: 1,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  };

  return {
    id: 'invoice-1',
    contractor_id: 'contractor-1',
    homeowner_user_id: null,
    local_contact_id: 'local-contact-1',
    service_request_id: null,
    job_id: null,
    estimate_id: null,
    home_id: null,
    local_home_id: 'local-home-1',
    home_label: 'Local customer home',
    home_address: '200 Local Ave',
    invoice_number: 'INV-1001',
    invoice_type: 'total',
    title: 'Cabinet repair invoice',
    scope: 'Repair completed for the local customer.',
    notes: 'Local PDF access should not depend on portal delivery.',
    terms: 'Payment handled directly with contractor.',
    status: 'draft',
    subtotal_cents: 16500,
    material_total_cents: 0,
    labor_total_cents: 16500,
    fee_total_cents: 0,
    other_total_cents: 0,
    tax_cents: 0,
    tax_rate_percent: 0,
    discount_cents: 0,
    discount_type: 'amount',
    discount_value: 0,
    discount_reason: '',
    total_cents: 16500,
    amount_paid_cents: 0,
    issued_at: now,
    due_at: null,
    paid_at: null,
    voided_at: null,
    created_at: now,
    updated_at: now,
    line_items: [line],
    backlog_items: [],
  };
}

test.describe('contractor estimate and invoice PDF actions', () => {
  test('estimate and invoice generators return actual PDF output', async () => {
    const estimatePdf = await createEstimatePdf(sampleEstimate(), {
      contractorName: 'ServSync Test Contractor',
      customerName: 'Connected Homeowner',
      customerAddress: '100 Main St',
      contractorLogoUrl: null,
    });

    const invoicePdf = await createInvoicePdf(sampleInvoice(), {
      contractorName: 'ServSync Test Contractor',
      contractorLogoUrl: null,
      contractorEmail: 'billing@example.test',
      contractorPhone: '(555) 010-2000',
      contractorAddress: 'Tulsa, OK',
      customerName: 'Local Customer',
      customerAddress: '200 Local Ave',
      serviceLabel: 'Local customer home',
    });

    await expectValidPdf(estimatePdf.blob);
    await expectValidPdf(invoicePdf.blob);
    expect(estimatePdf.fileName).toMatch(/servsync-test-contractor-door-seal-estimate\.pdf/i);
    expect(invoicePdf.fileName).toMatch(/servsync-test-contractor-invoice-inv-1001\.pdf/i);
  });

  test('download and preview helpers delay object URL revocation until after browser handoff', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalSetTimeout = globalThis.setTimeout;
    const originalDocument = (globalThis as typeof globalThis & { document?: Document }).document;
    const originalWindow = (globalThis as typeof globalThis & { window?: Window }).window;
    const createdUrls: string[] = [];
    const revokedUrls: string[] = [];
    const timers: Array<{ callback: () => void; delay: number }> = [];
    const clickedDownloads: Array<{ href: string; download: string; rel: string }> = [];
    const openedUrls: string[] = [];

    URL.createObjectURL = ((blob: Blob) => {
      const url = `blob:servsync-test-${createdUrls.length + 1}`;
      expect(blob.size).toBeGreaterThan(0);
      createdUrls.push(url);
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => {
      revokedUrls.push(url);
    }) as typeof URL.revokeObjectURL;
    globalThis.setTimeout = ((callback: () => void, delay?: number) => {
      timers.push({ callback, delay: delay ?? 0 });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        body: {
          appendChild: () => undefined,
        },
        createElement: () => ({
          href: '',
          download: '',
          rel: '',
          click() {
            clickedDownloads.push({ href: this.href, download: this.download, rel: this.rel });
          },
          remove: () => undefined,
        }),
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        open: (url: string) => {
          openedUrls.push(url);
          return { closed: false };
        },
      },
    });

    try {
      const blob = new Blob(['%PDF- test'], { type: 'application/pdf' });
      downloadPdfBlob(blob, 'contractor-invoice.pdf');
      previewPdfBlob(blob);

      expect(clickedDownloads).toEqual([{ href: 'blob:servsync-test-1', download: 'contractor-invoice.pdf', rel: 'noopener' }]);
      expect(openedUrls).toEqual(['blob:servsync-test-2']);
      expect(revokedUrls).toEqual([]);
      expect(timers.map(timer => timer.delay)).toEqual([
        PDF_OBJECT_URL_REVOKE_DELAY_MS,
        PDF_OBJECT_URL_REVOKE_DELAY_MS,
      ]);

      timers.forEach(timer => timer.callback());
      expect(revokedUrls).toEqual(['blob:servsync-test-1', 'blob:servsync-test-2']);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      globalThis.setTimeout = originalSetTimeout;
      Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  });

  test('invoice save returns to a focused invoice record with local PDF actions', () => {
    const source = appSource();
    const saveSource = sourceBetween(source, 'const saveInvoiceDraft = async', 'const sendInvoiceToHomeowner = async');
    const focusSource = sourceBetween(source, 'const focusSavedInvoiceRecord = (invoice: Invoice) => {', 'const saveEstimateDraft = async');
    const financialListSource = sourceBetween(
      source,
      "(contractorJobsView === 'open_financial' || contractorJobsView === 'closed_financial') && (",
      "(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (",
    );

    expect(focusSource).toContain("setContractorFinancialRecordKind('invoices');");
    expect(focusSource).toContain('setFocusedInvoiceRecordId(invoice.id);');
    expect(focusSource).toContain("setContractorJobsView(['paid', 'void'].includes(invoice.status) ? 'closed_financial' : 'open_financial');");
    expect(saveSource).toContain('focusSavedInvoiceRecord(savedInvoice);');
    expect(saveSource).not.toContain('openInspection(linkedJob');
    expect(financialListSource).toContain("const focusedInvoiceRecord = focusedInvoiceRecordId");
    expect(financialListSource).toContain('const visibleInvoiceRecords = focusedInvoiceRecord ? [focusedInvoiceRecord]');
    expect(financialListSource).toContain('Saved invoice draft');
    expect(financialListSource).toContain('Preview PDF');
    expect(financialListSource).toContain('previewInvoicePdf(invoice');
    expect(financialListSource).toContain('downloadInvoicePdf(invoice');
    expect(financialListSource).toContain("!invoice.homeowner_user_id");
    expect(financialListSource).toContain('Connect this customer to a ServSync homeowner before sending the invoice through the portal.');
    expect(financialListSource).toContain('disabled={updatingInvoiceId === invoice.id || !invoice.homeowner_user_id}');
  });

  test('estimate records keep preview and download PDF actions for connected and local customers', () => {
    const source = appSource();
    const financialListSource = sourceBetween(
      source,
      "(contractorJobsView === 'open_financial' || contractorJobsView === 'closed_financial') && (",
      "(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (",
    );
    const homeownerWorkspaceEstimateSource = sourceBetween(
      source,
      'selectedDocumentSection.estimates.map(estimate => {',
      "{estimate.status === 'sent' && (",
    );

    expect(financialListSource).toContain('previewEstimatePdf(estimate');
    expect(financialListSource).toContain('downloadEstimatePdf(estimate');
    expect(financialListSource).toContain("connection?.display_name || local?.display_name || 'Customer'");
    expect(financialListSource).toContain("connection?.home?.address_line1 || local?.homes?.[0]?.address_line1 || ''");
    expect(homeownerWorkspaceEstimateSource).toContain('previewEstimatePdf(estimate');
    expect(homeownerWorkspaceEstimateSource).toContain('downloadEstimatePdf(estimate');
    expect(homeownerWorkspaceEstimateSource).toContain('customerName: headerName');
    expect(homeownerWorkspaceEstimateSource).toContain('customerAddress: headerAddress || headerCity');
  });
});
