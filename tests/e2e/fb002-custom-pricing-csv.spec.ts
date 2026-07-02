import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-002 Custom Pricing CSV preview regression', () => {
  test('CSV import surface is private, preview-first, and mobile-tolerant', () => {
    const source = appSource();
    const customPricingSource = sourceBetween(
      source,
      "{contractorJobsView === 'custom_pricing' && (",
      "{contractorJobsView === 'templates' && (",
    );

    expect(customPricingSource).toContain('<Card title="Custom Pricing"');
    expect(customPricingSource).toContain('Private pricing library');
    expect(customPricingSource).toContain('These records stay private to your contractor account');
    expect(customPricingSource).toContain('do not automatically load into estimates, invoices, homeowner-facing screens, or suggestions');
    expect(customPricingSource).toContain('Upload CSV');
    expect(customPricingSource).toContain('Sample CSV');
    expect(customPricingSource).toContain('Choose CSV');
    expect(customPricingSource).toContain('accept=".csv,text/csv"');
    expect(customPricingSource).toContain('Review column mapping');
    expect(customPricingSource).toContain('Preview before import');
    expect(customPricingSource).toContain('Only valid rows will be imported');
    expect(customPricingSource).toContain('Invalid rows stay out of your pricing library');
    expect(customPricingSource).toContain('Review warnings before importing');
    expect(customPricingSource).toContain('Duplicate matches are warning-only');
    expect(customPricingSource).toContain('CSV import adds valid rows and does not overwrite existing pricing');
    expect(customPricingSource).toContain('overflow-x-auto');
    expect(customPricingSource).toContain('min-w-[720px]');
    expect(customPricingSource).toContain('Showing the first 20 parsed rows for preview.');
  });

  test('CSV parser and preview validation cover required fields, prices, row limits, and line-type fallback', () => {
    const source = appSource();
    const csvSource = sourceBetween(
      source,
      'const CONTRACTOR_PRICE_BOOK_CSV_MAX_BYTES',
      'function savedEstimateChargeLineDescription',
    );

    expect(csvSource).toContain('const CONTRACTOR_PRICE_BOOK_CSV_MAX_BYTES = 1024 * 1024');
    expect(csvSource).toContain('const CONTRACTOR_PRICE_BOOK_CSV_MAX_ROWS = 500');
    expect(csvSource).toContain("{ key: 'title', label: 'Title', required: true");
    expect(csvSource).toContain("{ key: 'line_type'");
    expect(csvSource).toContain("{ key: 'default_unit_price'");
    expect(csvSource).toContain("{ key: 'default_unit_price_cents'");
    expect(csvSource).toContain('CSV has an unterminated quoted value.');
    expect(csvSource).toContain('if (!title.trim()) errors.push(\'Title is required.\');');
    expect(csvSource).toContain('Default price must be blank, 0, or a positive dollar amount.');
    expect(csvSource).toContain('Default price cents must be a whole number.');
    expect(csvSource).toContain('Default price cannot be negative.');
    expect(csvSource).toContain('if (!trimmed) return { cents: null as number | null };');
    expect(csvSource).toContain('return { cents: Math.round(amount * 100) };');
    expect(csvSource).toContain("if (!normalized) return { lineType: 'other' as EstimateLineType, warning: 'Line type was missing and will import as Other.' };");
    expect(csvSource).toContain('Line type "${trimmed}" was not recognized and will import as Other.');
  });

  test('duplicate detection remains warning-only and import remains add-only', () => {
    const source = appSource();
    const previewSource = sourceBetween(
      source,
      'function buildContractorPriceBookCsvPreviewRows',
      'const CONTRACTOR_PRICE_BOOK_SAMPLE_CSV',
    );
    const importSource = sourceBetween(
      source,
      'const importContractorPriceBookCsvRows = async () => {',
      'const addSavedChargeToEstimateDraft =',
    );

    expect(previewSource).toContain('const existingKeys = new Set');
    expect(previewSource).toContain('const seenImportKeys = new Set<string>();');
    expect(previewSource).toContain('Possible duplicate of an existing Custom Pricing item.');
    expect(previewSource).toContain('Possible duplicate within this CSV import.');
    expect(previewSource).toContain('warnings.push');
    expect(previewSource).toContain('source: CONTRACTOR_PRICE_BOOK_CSV_SOURCE');
    expect(previewSource).not.toContain('errors.push(\'Possible duplicate');

    expect(importSource).toContain('validContractorPriceBookCsvRows.length === 0');
    expect(importSource).toContain('Invalid rows will be skipped.');
    expect(importSource).toContain('const payloads = validContractorPriceBookCsvRows.map');
    expect(importSource).toContain("supabase.from('contractor_price_book_items').insert(payloads)");
    expect(importSource).not.toContain('.upsert(');
    expect(importSource).not.toContain('.update(');
    expect(importSource).not.toContain('.delete(');
    expect(importSource).not.toContain('onConflict');
  });

  test('valid rows are separated from blocked rows before import', () => {
    const source = appSource();
    const contractorViewSource = sourceBetween(
      source,
      'const contractorPriceBookCsvPreviewRows = buildContractorPriceBookCsvPreviewRows',
      'const addSavedChargeToEstimateDraft =',
    );

    expect(contractorViewSource).toContain('const validContractorPriceBookCsvRows = contractorPriceBookCsvPreviewRows.filter(row => row.errors.length === 0);');
    expect(contractorViewSource).toContain('const warningContractorPriceBookCsvRows = contractorPriceBookCsvPreviewRows.filter(row => row.errors.length === 0 && row.warnings.length > 0);');
    expect(contractorViewSource).toContain('const blockedContractorPriceBookCsvRows = contractorPriceBookCsvPreviewRows.filter(row => row.errors.length > 0);');
    expect(contractorViewSource).toContain('CSV imports are limited to ${CONTRACTOR_PRICE_BOOK_CSV_MAX_ROWS} item rows in this beta tool.');
    expect(contractorViewSource).toContain('This CSV appears to be empty.');
    expect(contractorViewSource).toContain('This CSV has headers but no item rows.');
    expect(contractorViewSource).toContain("setContractorPriceBookCsvMapping(autoMapContractorPriceBookCsvHeaders(headers));");
  });

  test('Price Book quick-pick remains estimate-only and invoice quick-pick remains future', () => {
    const source = appSource();
    const mapperSource = sourceBetween(
      source,
      'function estimateLineDraftFromPriceBookItem',
      'function createBlankInvoiceDraft',
    );

    expect(source).toContain('{!isInvoiceWorkspaceTab && renderPriceBookQuickPick()}');
    expect(source).toContain("{estimateDocumentLabel({ title: estimateDraft.title, scope: estimateDraft.scope, notes: estimateDraft.notes }) !== 'Invoice' && renderPriceBookQuickPick()}");
    expect(source).not.toContain('{isInvoiceWorkspaceTab && renderPriceBookQuickPick()}');
    expect(source).not.toContain("estimateDocumentLabel({ title: estimateDraft.title, scope: estimateDraft.scope, notes: estimateDraft.notes }) === 'Invoice' && renderPriceBookQuickPick()");

    expect(mapperSource).toContain("quantity: '1'");
    expect(mapperSource).toContain('Review quantity, price, and scope before sending.');
    for (const privateOrFutureField of [
      'item.internal_notes',
      'item.sku',
      'item.trade',
      'item.category',
      'item.taxable',
      'item.source',
      'item.default_quantity',
    ]) {
      expect(mapperSource).not.toContain(privateOrFutureField);
    }
  });

  test('Custom Pricing stays contractor-private and out of homeowner surfaces', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const customPricingSource = sourceBetween(
      source,
      "{contractorJobsView === 'custom_pricing' && (",
      "{contractorJobsView === 'templates' && (",
    );

    expect(customPricingSource).toContain('private to your contractor account');
    expect(customPricingSource).toContain('do not automatically load into estimates, invoices, homeowner-facing screens, or suggestions');
    expect(homeownerSource).not.toContain('contractor_price_book_items');
    expect(homeownerSource).not.toContain('contractorPriceBookItems');
    expect(homeownerSource).not.toContain('renderPriceBookQuickPick');
    expect(homeownerSource).not.toContain('internal_notes');
    expect(homeownerSource).not.toContain('sku');
  });
});
