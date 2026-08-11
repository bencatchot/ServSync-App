import { expect, test } from '@playwright/test';

import {
  downloadInvoicePdf,
  previewInvoicePdf,
  type InvoicePdfContext,
} from '../../src/utils/pdfDocuments';
import type { Invoice, InvoiceLineItem } from '../../src/types';

const generatedAt = '2026-08-11T12:00:00.000Z';

function sampleInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const line: InvoiceLineItem = {
    id: 'invoice-line-parity-1',
    invoice_id: 'invoice-parity-1',
    line_type: 'labor',
    description: 'Repair air handler drain',
    line_title: 'Air handler drain repair',
    customer_description: 'Clear and reconnect the condensate drain.',
    model_spec: 'AHU-24',
    supply_status: 'contractor_supplied',
    quantity: 1,
    unit: 'service',
    unit_price_cents: 24000,
    labor_hours: 1.5,
    sort_order: 0,
    created_at: generatedAt,
    updated_at: generatedAt,
  };

  return {
    id: 'invoice-parity-1',
    contractor_id: 'contractor-parity-1',
    homeowner_user_id: 'homeowner-parity-1',
    local_contact_id: null,
    service_request_id: 'request-parity-1',
    job_id: 'job-parity-1',
    estimate_id: 'estimate-parity-1',
    home_id: 'home-parity-1',
    local_home_id: null,
    home_label: 'Oak Street home',
    home_address: '412 Oak Street',
    invoice_number: 'INV-PARITY-1001',
    invoice_type: 'total',
    title: 'Cooling service invoice',
    scope: 'Completed condensate drain service.',
    notes: 'Thank you for choosing the contractor.',
    terms: 'Payment due within 14 days.',
    status: 'sent',
    subtotal_cents: 24000,
    material_total_cents: 0,
    labor_total_cents: 24000,
    fee_total_cents: 0,
    other_total_cents: 0,
    tax_cents: 0,
    tax_rate_percent: 0,
    discount_cents: 0,
    discount_type: 'amount',
    discount_value: 0,
    discount_reason: '',
    total_cents: 24000,
    amount_paid_cents: 0,
    issued_at: '2026-08-01T12:00:00.000Z',
    due_at: '2026-08-15T12:00:00.000Z',
    paid_at: null,
    voided_at: null,
    created_at: generatedAt,
    updated_at: generatedAt,
    line_items: [line],
    backlog_items: [],
    ...overrides,
  };
}

const pdfContext: InvoicePdfContext = {
  contractorName: 'ServSync Test HVAC',
  contractorLogoUrl: null,
  contractorEmail: 'billing@example.test',
  contractorPhone: '(555) 010-2400',
  contractorAddress: 'Tulsa, OK 74103',
  customerName: 'Jordan Customer',
  customerAddress: '412 Oak Street',
  serviceLabel: 'Oak Street home',
};

function decodePdfLiteral(value: string) {
  let decoded = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '\\') {
      decoded += character;
      continue;
    }

    const escaped = value[index + 1];
    if (escaped === undefined) break;
    if (escaped === 'n') decoded += '\n';
    else if (escaped === 'r') decoded += '\r';
    else if (escaped === 't') decoded += '\t';
    else if (escaped === 'b') decoded += '\b';
    else if (escaped === 'f') decoded += '\f';
    else if (escaped === '\n' || escaped === '\r') {
      if (escaped === '\r' && value[index + 2] === '\n') index += 1;
    } else if (/[0-7]/.test(escaped)) {
      const octal = value.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] ?? escaped;
      decoded += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length - 1;
    } else decoded += escaped;
    index += 1;
  }
  return decoded;
}

async function normalizedPdfText(blob: Blob) {
  const source = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  const text: string[] = [];
  const literalText = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = literalText.exec(source)) !== null) text.push(decodePdfLiteral(match[1]));
  expect(text.length, 'Expected extractable text-layer content in generated jsPDF artifact').toBeGreaterThan(20);
  return text.join(' ').replace(/\s+/g, ' ').trim();
}

async function capturePreviewAndDownload(invoice: Invoice) {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalSetTimeout = globalThis.setTimeout;
  const originalFetch = globalThis.fetch;
  const originalDocument = (globalThis as typeof globalThis & { document?: Document }).document;
  const originalWindow = (globalThis as typeof globalThis & { window?: Window }).window;
  const blobs: Blob[] = [];
  const previewUrls: string[] = [];
  const downloads: Array<{ href: string; fileName: string }> = [];
  const networkRequests: string[] = [];

  URL.createObjectURL = ((blob: Blob) => {
    blobs.push(blob);
    return `blob:servsync-parity-${blobs.length}`;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  globalThis.setTimeout = (() => 1 as unknown as ReturnType<typeof setTimeout>) as typeof setTimeout;
  globalThis.fetch = (async input => {
    networkRequests.push(String(input));
    throw new Error('Invoice PDF actions must not make network or provider requests.');
  }) as typeof fetch;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      open: (url: string) => {
        previewUrls.push(url);
        return { closed: false };
      },
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: { appendChild: () => undefined },
      createElement: () => ({
        href: '',
        download: '',
        rel: '',
        click() {
          downloads.push({ href: this.href, fileName: this.download });
        },
        remove: () => undefined,
      }),
    },
  });

  const invoiceBeforeActions = structuredClone(invoice);
  try {
    await previewInvoicePdf(invoice, pdfContext);
    await downloadInvoicePdf(invoice, pdfContext);
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }

  expect(invoice).toEqual(invoiceBeforeActions);
  expect(networkRequests).toEqual([]);
  expect(blobs).toHaveLength(2);
  expect(previewUrls).toEqual(['blob:servsync-parity-1']);
  expect(downloads).toEqual([{
    href: 'blob:servsync-parity-2',
    fileName: 'ServSync-Test-HVAC-invoice-INV-PARITY-1001.pdf',
  }]);
  await Promise.all(blobs.map(async blob => {
    expect(blob.type).toBe('application/pdf');
    expect(Buffer.from(await blob.slice(0, 5).arrayBuffer()).toString('utf8')).toBe('%PDF-');
  }));

  return {
    preview: await normalizedPdfText(blobs[0]),
    download: await normalizedPdfText(blobs[1]),
  };
}

async function expectSemanticParity(invoice: Invoice, expectedText: string[]) {
  const artifacts = await capturePreviewAndDownload(invoice);
  expect(artifacts.preview).toBe(artifacts.download);
  for (const value of expectedText) {
    expect(artifacts.preview).toContain(value);
    expect(artifacts.download).toContain(value);
  }
  return artifacts;
}

test.describe('Invoice Preview and Download semantic parity', () => {
  test('outstanding Invoice artifacts agree on identity, dates, line items, and balance', async () => {
    await expectSemanticParity(sampleInvoice(), [
      'ServSync Test HVAC',
      'Cooling service invoice',
      'INV-PARITY-1001',
      'sent',
      'Aug 1, 2026',
      'Aug 15, 2026',
      'Jordan Customer',
      'Oak Street home',
      'Air handler drain repair',
      'Clear and reconnect the condensate drain.',
      'Model/spec: AHU-24',
      'Contractor supplied',
      'Invoice Total $240.00',
      'Amount Paid $0.00',
      'Balance Due $240.00',
      'Thank you for choosing the contractor.',
      'Payment due within 14 days.',
    ]);
  });

  test('Paid Invoice artifacts agree on PAID state, paid date, and zero balance', async () => {
    await expectSemanticParity(sampleInvoice({
      status: 'paid',
      amount_paid_cents: 24000,
      paid_at: '2026-08-11T12:00:00.000Z',
      updated_at: '2026-08-11T12:00:00.000Z',
    }), [
      'PAID',
      'Status paid',
      'Invoice Total $240.00',
      'Amount Paid $240.00',
      'Balance Due $0.00',
      'Paid Aug 11, 2026',
      'Paid in full on Aug 11, 2026. No balance remains.',
    ]);
  });

  test('partially Paid Invoice artifacts agree on current paid and remaining amounts', async () => {
    await expectSemanticParity(sampleInvoice({
      status: 'partially_paid',
      amount_paid_cents: 6500,
      updated_at: '2026-08-08T12:00:00.000Z',
    }), [
      'Status partially paid',
      'Invoice Total $240.00',
      'Amount Paid $65.00',
      'Balance Due $175.00',
    ]);
  });

  test('newly generated artifacts reflect a refreshed Paid Invoice instead of prior outstanding state', async () => {
    const outstanding = await capturePreviewAndDownload(sampleInvoice());
    const paid = await capturePreviewAndDownload(sampleInvoice({
      status: 'paid',
      amount_paid_cents: 24000,
      paid_at: '2026-08-11T12:00:00.000Z',
      updated_at: '2026-08-11T12:00:00.000Z',
    }));

    expect(outstanding.preview).toContain('Balance Due $240.00');
    expect(outstanding.preview).not.toContain('PAID');
    expect(paid.preview).toContain('Balance Due $0.00');
    expect(paid.preview).toContain('PAID');
    expect(paid.preview).toBe(paid.download);
  });
});
