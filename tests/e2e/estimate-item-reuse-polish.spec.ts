import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const priceBookMapperSource = () => sourceFile('src/features/price-book/priceBookEstimateLineSnapshot.ts');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Estimate item reuse polish', () => {
  test('uses Price Book as the only reusable individual line-item library', () => {
    const source = appSource();
    const picker = sourceBetween(source, 'const renderEstimateSavedItemPicker = () => {', 'const addEstimateHelperSuggestionToDraft =');

    expect(picker).toContain('data-testid="estimate-saved-item-picker"');
    expect(picker).toContain('Price Book');
    expect(picker).toContain('Copied price — review before sending.');
    expect(picker).toContain('No saved items yet. Add items to your Price Book to reuse them here.');
    expect(picker).not.toContain('Saved charge');
    expect(source).not.toContain(".from('contractor_saved_estimate_charges')");
    expect(source).not.toContain('ContractorSavedEstimateCharge');
  });

  test('searches active canonical items without exposing private fields', () => {
    const source = appSource();
    const derived = sourceBetween(source, 'const activeContractorPriceBookItems =', 'const serviceAgreementMoneyLabel =');
    const picker = sourceBetween(source, 'const renderEstimateSavedItemPicker = () => {', 'const addEstimateHelperSuggestionToDraft =');

    expect(derived).toContain('.filter(item => item.active && !item.archived_at)');
    expect(derived).toContain('const estimatePriceBookQuickPickItems = activeContractorPriceBookItems');
    expect(derived).toContain('item.title');
    expect(derived).toContain('item.customer_description');
    expect(picker).toContain('aria-label={`Add Price Book item ${item.title}`}');
    expect(picker).not.toContain('item.internal_notes');
    expect(picker).not.toContain('item.source');
    expect(picker).not.toContain('contractor_id');
  });

  test('insertion uses the customer-safe snapshot mapper', () => {
    const source = appSource();
    const mapper = priceBookMapperSource();
    const insertion = sourceBetween(source, 'const addPriceBookItemToEstimateDraft =', 'const addBlankEstimateLineToDraft =');

    expect(mapper).toContain('line_type: normalizeWorkComposerLineType(item.line_type)');
    expect(mapper).toContain('description: item.title');
    expect(mapper).toContain("customer_description: item.customer_description || ''");
    expect(mapper).toContain('item.default_unit_price_cents');
    expect(mapper).not.toContain('internal_notes');
    expect(mapper).not.toContain('internal_cost');
    expect(mapper).not.toContain('contractor_id');
    expect(insertion).toContain('const nextLine = priceBookItemToEstimateLineDraft(item);');
    expect(insertion).toContain('line_items: usableLines.length === 0 ? [nextLine] : [...draft.line_items, nextLine]');
  });

  test('Build Estimate Draft matches canonical Price Book items only', () => {
    const source = appSource();
    const matcher = sourceBetween(source, 'function estimateBuilderKeywordScore', 'function customerFacingRoughScope');

    expect(matcher).toContain('findPriceBookMatchForEstimateBuilder');
    expect(matcher).toContain('priceBookItemToEstimateLineDraft(matchedItem)');
    expect(matcher).toContain('Matched Price Book item:');
    expect(matcher).not.toContain('SavedCharge');
    expect(matcher).not.toContain('saved charge');
  });

  test('keeps estimate-only controls isolated while Invoice Drafts reuse the canonical picker', () => {
    const source = appSource();
    const invoiceComposer = sourceBetween(
      source,
      '{invoiceComposerOpen && selectedJobsCustomerName && (',
      "{contractorJobsView === 'templates' && (",
    );

    expect(invoiceComposer).not.toContain('renderEstimateSavedItemPicker');
    expect(invoiceComposer).not.toContain('estimateSavedItemSearch');
    expect(invoiceComposer).toContain('<DraftPriceBookPicker');
    expect(invoiceComposer).toContain('draftLabel="Invoice Draft"');
  });
});
