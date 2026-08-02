import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const workspaceSource = () => sourceFile('src/features/price-book/ContractorPriceBookWorkspace.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-002 Price Book CSV preview regression', () => {
  test('CSV import surface is private, preview-first, and mobile-tolerant', () => {
    const source = appSource();
    const panel = sourceFile('src/features/price-book/PriceBookCsvReconciliationPanel.tsx');
    const customPricingSource = sourceBetween(
      source,
      "{contractorJobsView === 'custom_pricing' && (",
      "{contractorJobsView === 'service_agreements' && (",
    );

    expect(customPricingSource).not.toContain('<Card title="Price Book"');
    expect(customPricingSource).toContain('<ContractorPriceBookWorkspace');
    expect(customPricingSource).toContain('<PriceBookCsvReconciliationPanel');
    expect(panel).toContain('Repeat-import reconciliation');
    expect(panel).toContain('Sample CSV');
    expect(panel).toContain('Choose CSV');
    expect(panel).toContain('accept=".csv,text/csv"');
    expect(panel).toContain('Upload and map CSV');
    expect(panel).toContain('Preview reconciliation');
    expect(panel).toContain('Review Add, Update, and Skip');
    expect(panel).toContain('Conflicting manual edits remain unchanged.');
    expect(panel).toContain('PREVIEW_PAGE_SIZE = 25');
  });

  test('CSV parser and preview validation cover identity, prices, row limits, and strict line types', () => {
    const csvSource = sourceFile('src/features/price-book/priceBookCsvReconciliation.ts');

    expect(csvSource).toContain('PRICE_BOOK_CSV_MAX_BYTES = 1024 * 1024');
    expect(csvSource).toContain('PRICE_BOOK_CSV_MAX_ROWS = 500');
    expect(csvSource).toContain("{ key: 'external_item_id'");
    expect(csvSource).toContain("{ key: 'title', label: 'Title', required: true");
    expect(csvSource).toContain("{ key: 'line_type'");
    expect(csvSource).toContain("{ key: 'subcategory'");
    expect(csvSource).toContain("subcategory: ['subcategory', 'sub_category'");
    expect(csvSource).toContain("{ key: 'default_unit_price'");
    expect(csvSource).toContain("{ key: 'default_unit_price_cents'");
    expect(csvSource).toContain('CSV has an unterminated quoted value.');
    expect(csvSource).toContain("if (!title) errors.push('Title is required.')");
    expect(csvSource).toContain('Default price must be blank, zero, or a positive amount.');
    expect(csvSource).toContain('Default price cents must be a non-negative whole number.');
    expect(csvSource).toContain("values.default_unit_price_cents = parsedPrice.value");
    expect(csvSource).toContain('Line type must be labor, material, fee, or other.');
  });

  test('server reconciliation replaces direct add-only table insertion', () => {
    const source = appSource();
    expect(source).toContain("supabase!.rpc('servsync_preview_price_book_import'");
    expect(source).toContain("supabase!.rpc('servsync_execute_price_book_import'");
    expect(source).toContain('p_idempotency_key: input.idempotencyKey');
    expect(source).not.toContain("supabase.from('contractor_price_book_items').insert(payloads)");
  });

  test('blocked rows stop preview while blank non-price fields preserve existing values', () => {
    const csv = sourceFile('src/features/price-book/priceBookCsvReconciliation.ts');
    const panel = sourceFile('src/features/price-book/PriceBookCsvReconciliationPanel.tsx');
    expect(csv).toContain("if (!value) return;");
    expect(csv).toContain("mappedFields.push('default_unit_price_cents')");
    expect(csv).toContain('External item ID is repeated in this file.');
    expect(panel).toContain('blockedLocalRows.length > 0');
    expect(panel).toContain('Resolve {blockedLocalRows.length} blocked row');
    expect(panel).toContain('disabled={!sourceId || !mapping.title || blockedLocalRows.length > 0');
  });

  test('Price Book quick-pick remains estimate-only and invoice quick-pick remains future', () => {
    const source = appSource();
    const mapperSource = sourceFile('src/features/price-book/priceBookEstimateLineSnapshot.ts');

    expect(source).toContain("estimateLineSourcePanel === 'saved' && renderEstimateSavedItemPicker()");
    expect(source).not.toContain('{isInvoiceWorkspaceTab && renderEstimateSavedItemPicker()}');
    expect(source).not.toContain("estimateDocumentLabel({ title: estimateDraft.title, scope: estimateDraft.scope, notes: estimateDraft.notes }) === 'Invoice' && renderEstimateSavedItemPicker()");

    expect(mapperSource).toContain("quantity: '1'");
    expect(mapperSource).toContain('Review quantity, price, and scope before sending.');
    for (const privateOrFutureField of [
      'item.internal_notes',
      'item.sku',
      'item.trade',
      'item.category',
      'item.subcategory',
      'item.taxable',
      'item.source',
      'item.default_quantity',
    ]) {
      expect(mapperSource).not.toContain(privateOrFutureField);
    }
  });

  test('Price Book stays contractor-private and out of homeowner surfaces', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const workspace = workspaceSource();

    expect(workspace).toContain('Private contractor library');
    expect(workspace).toContain('this library never changes an existing document');
    expect(homeownerSource).not.toContain('contractor_price_book_items');
    expect(homeownerSource).not.toContain('contractorPriceBookItems');
    expect(homeownerSource).not.toContain('renderEstimateSavedItemPicker');
    expect(homeownerSource).not.toContain('internal_notes');
    expect(homeownerSource).not.toContain('sku');
  });
});
