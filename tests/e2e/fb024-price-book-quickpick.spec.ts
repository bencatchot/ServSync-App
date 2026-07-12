import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const typesSource = () => sourceFile('src/types.ts');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-024 Price Book estimate quick-pick', () => {
  test('Price Book does not claim live default quantity or tax/category propagation support', () => {
    const source = appSource();
    const types = typesSource();
    const lineDraftSource = sourceBetween(source, 'type EstimateLineDraft = {', 'type EstimateDraftBuilderTrade');
    const priceBookTypeSource = sourceBetween(types, 'export interface ContractorPriceBookItem', 'export interface Profile');
    const priceBookDraftSource = sourceBetween(source, 'type ContractorPriceBookItemDraft = {', 'type ManualJobWorkItemDraft');
    const csvFieldsSource = sourceBetween(source, 'const CONTRACTOR_PRICE_BOOK_CSV_FIELDS', 'const CONTRACTOR_PRICE_BOOK_CSV_FIELD_ALIASES');

    for (const estimateLineField of ['default_quantity', 'taxable', 'category', 'sku', 'internal_notes']) {
      expect(lineDraftSource).not.toContain(estimateLineField);
    }

    expect(priceBookTypeSource).toContain('category: string;');
    expect(priceBookTypeSource).toContain('taxable: boolean;');
    expect(priceBookTypeSource).not.toContain('default_quantity');
    expect(priceBookDraftSource).toContain('category: string;');
    expect(priceBookDraftSource).toContain('taxable: boolean;');
    expect(priceBookDraftSource).not.toContain('default_quantity');
    expect(csvFieldsSource).toContain("{ key: 'category'");
    expect(csvFieldsSource).toContain("{ key: 'taxable'");
    expect(csvFieldsSource).not.toContain('default_quantity');
  });

  test('maps Price Book items into editable estimate lines with safe fields only', () => {
    const source = appSource();
    const mapperSource = sourceBetween(
      source,
      'function estimateLineDraftFromPriceBookItem',
      'function createBlankInvoiceDraft',
    );

    expect(mapperSource).toContain('line_type: normalizeEstimateLineType(item.line_type)');
    expect(mapperSource).toContain('description: item.title');
    expect(mapperSource).toContain('line_title: item.title');
    expect(mapperSource).toContain("customer_description: item.customer_description || ''");
    expect(mapperSource).toContain("quantity: '1'");
    expect(mapperSource).toContain("unit: item.unit || 'each'");
    expect(mapperSource).toContain('item.default_unit_price_cents');
    expect(mapperSource).toContain('item.labor_hours');
    expect(mapperSource).toContain('Review quantity, price, and scope before sending.');

    for (const privateMetadata of [
      'item.default_quantity',
      'item.internal_notes',
      'item.sku',
      'item.trade',
      'item.category',
      'item.taxable',
      'item.source',
    ]) {
      expect(mapperSource).not.toContain(privateMetadata);
    }
  });

  test('quick-pick copy explains quantity, review, and private metadata boundaries', () => {
    const source = appSource();
    const quickPickSource = sourceBetween(source, 'const renderPriceBookQuickPick = () => (', 'const renderEstimateHelperPanel = () => {');

    expect(quickPickSource).toContain('Price Book');
    expect(quickPickSource).toContain('editable estimate lines');
    expect(quickPickSource).toContain('Quantity starts at 1');
    expect(quickPickSource).toContain('review quantity, price, and scope before sending');
    expect(quickPickSource).toContain('Internal notes stay private');
    expect(quickPickSource).toContain('Category/tax stays in Price Book');
    expect(quickPickSource).toContain('Private notes and tax/category metadata are not copied.');
    expect(quickPickSource).toContain('className="inline-flex min-h-10 w-full');
    expect(quickPickSource).toContain('sm:w-auto');
  });

  test('Price Book quick-pick remains excluded from invoice composer paths', () => {
    const source = appSource();
    const lineSourcePanel = sourceBetween(
      source,
      'const renderEstimateLineItemSources =',
      'const startEstimateAssistantSpeech =',
    );
    const estimateComposerSource = sourceBetween(
      source,
      '{estimateComposerOpen && selectedJobsCustomerName && (',
      '{invoiceComposerOpen && selectedJobsCustomerName && (',
    );
    const invoiceComposerSource = sourceBetween(
      source,
      '{invoiceComposerOpen && selectedJobsCustomerName && (',
      "{contractorJobsView === 'templates' && (",
    );

    expect(lineSourcePanel).toContain("estimateLineSourcePanel === 'priceBook' && renderPriceBookQuickPick()");
    expect(estimateComposerSource).toContain('renderEstimateLineItemSources');
    expect(invoiceComposerSource).not.toContain('renderEstimateLineItemSources');
    expect(invoiceComposerSource).not.toContain('renderPriceBookQuickPick');
    expect(invoiceComposerSource).not.toContain('estimateLineSourcePanel');
    expect(source).not.toContain('{isInvoiceWorkspaceTab && renderPriceBookQuickPick()}');
    expect(source).not.toContain("estimateDocumentLabel({ title: estimateDraft.title, scope: estimateDraft.scope, notes: estimateDraft.notes }) === 'Invoice' && renderPriceBookQuickPick()");
  });

  test('homeowner-facing dashboard does not load Price Book quick-pick or private metadata', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');

    expect(homeownerSource).not.toContain('renderPriceBookQuickPick');
    expect(homeownerSource).not.toContain('contractor_price_book_items');
    expect(homeownerSource).not.toContain('contractorPriceBookItems');
    expect(homeownerSource).not.toContain('internal_notes');
    expect(homeownerSource).not.toContain('sku');
  });
});
