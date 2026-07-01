import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = () => readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-024 Price Book estimate quick-pick', () => {
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

    expect(source).toContain('{!isInvoiceWorkspaceTab && renderPriceBookQuickPick()}');
    expect(source).toContain("{estimateDocumentLabel({ title: estimateDraft.title, scope: estimateDraft.scope, notes: estimateDraft.notes }) !== 'Invoice' && renderPriceBookQuickPick()}");
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
