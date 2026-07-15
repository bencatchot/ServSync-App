import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const workComposerDraftSource = () => sourceFile('src/features/work-composer/workComposerDrafts.ts');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Estimate item reuse polish', () => {
  test('unifies saved charges and Price Book behind one estimate-only Add saved item picker', () => {
    const source = appSource();
    const sourceControls = sourceBetween(source, 'const renderEstimateLineItemSources =', 'const startEstimateAssistantSpeech =');
    const pickerSource = sourceBetween(source, 'const renderEstimateSavedItemPicker = () => {', 'const addEstimateHelperSuggestionToDraft =');

    expect(sourceControls).toContain('Add saved item');
    expect(sourceControls).toContain("estimateLineSourcePanel === 'saved' && renderEstimateSavedItemPicker()");
    expect(sourceControls).not.toContain('Add from Price Book');
    expect(sourceControls).not.toContain("estimateLineSourcePanel === 'priceBook'");

    expect(pickerSource).toContain('data-testid="estimate-saved-item-picker"');
    expect(pickerSource).toContain('Price Book');
    expect(pickerSource).toContain('Saved charges');
    expect(pickerSource).toContain('Price Book</span>');
    expect(pickerSource).toContain('Saved charge</span>');
    expect(pickerSource).toContain('Copied price — review before sending.');
    expect(pickerSource).toContain('No saved items yet. Add items to your Price Book or saved charges to reuse them here.');
    expect(pickerSource).toContain('No saved items match your search.');
  });

  test('search filters active contractor-scoped saved sources without mutating ordering', () => {
    const source = appSource();
    const derivedSource = sourceBetween(
      source,
      'const activeSavedEstimateCharges = savedEstimateCharges',
      'const archivedContractorPriceBookItems = contractorPriceBookItems',
    );

    expect(derivedSource).toContain('.filter(charge => charge.active)');
    expect(derivedSource).toContain('.sort((a, b) => a.sort_order - b.sort_order || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())');
    expect(derivedSource).toContain('.filter(item => item.active && !item.archived_at)');
    expect(derivedSource).toContain('.sort((a, b) => a.title.localeCompare(b.title)');
    expect(derivedSource).toContain('const estimateSavedItemSearchText = normalizeText(estimateSavedItemSearch.trim());');
    expect(derivedSource).toContain('const estimateSavedChargeQuickPickItems = activeSavedEstimateCharges');
    expect(derivedSource).toContain('const estimatePriceBookQuickPickItems = activeContractorPriceBookItems');
    expect(derivedSource).toContain('charge.name');
    expect(derivedSource).toContain('charge.description');
    expect(derivedSource).toContain('estimateLineTypeLabel(charge.line_type)');
    expect(derivedSource).toContain('item.title');
    expect(derivedSource).toContain('item.customer_description');
    expect(derivedSource).toContain('item.trade');
    expect(derivedSource).toContain('item.category');
  });

  test('picker rows expose source labels, accessible add actions, and safe non-private content', () => {
    const source = appSource();
    const pickerSource = sourceBetween(source, 'const renderEstimateSavedItemPicker = () => {', 'const addEstimateHelperSuggestionToDraft =');

    expect(pickerSource).toContain('aria-label="Search saved items"');
    expect(pickerSource).toContain('aria-label={`Add Price Book item ${item.title}`}');
    expect(pickerSource).toContain('aria-label={`Add saved charge ${charge.name}`}');
    expect(pickerSource).toContain('contractorPriceBookPriceLabel(item)');
    expect(pickerSource).toContain('formatMoney(charge.amount_cents)');
    expect(pickerSource).toContain('item.customer_description');
    expect(pickerSource).toContain('charge.description');
    expect(pickerSource).not.toContain('item.internal_notes');
    expect(pickerSource).not.toContain('item.sku');
    expect(pickerSource).not.toContain('item.source');
    expect(pickerSource).not.toContain('item.taxable');
    expect(pickerSource).not.toContain('contractor_id');
    expect(pickerSource).not.toContain('created_at');
    expect(pickerSource).not.toContain('updated_at');
  });

  test('insertion reuses approved mappers, appends to the draft array, expands groups, and focuses inserted lines', () => {
    const source = appSource();
    const mapperSource = sourceBetween(source, 'function estimateLineDraftFromSavedCharge', 'function createBlankInvoiceDraft');
    const insertionSource = sourceBetween(source, 'const addSavedChargeToEstimateDraft =', 'const addBlankEstimateLineToDraft =');

    expect(mapperSource).toContain('line_type: normalizeEstimateLineType(charge.line_type)');
    expect(mapperSource).toContain('description: savedEstimateChargeLineDescription(charge)');
    expect(mapperSource).toContain('line_title: charge.name');
    expect(mapperSource).toContain("customer_description: ''");
    expect(mapperSource).toContain('quantity: String(Number(charge.default_quantity || 1))');
    expect(mapperSource).toContain("unit: charge.unit || (charge.charge_type === 'hourly' ? 'hour' : 'each')");
    expect(mapperSource).toContain('unit_price: charge.amount_cents === 0 ?');
    expect(mapperSource).toContain('line_type: normalizeEstimateLineType(item.line_type)');
    expect(mapperSource).toContain('description: item.title');
    expect(mapperSource).toContain('line_title: item.title');
    expect(mapperSource).toContain("customer_description: item.customer_description || ''");
    expect(mapperSource).toContain("quantity: '1'");
    expect(mapperSource).toContain("unit: item.unit || 'each'");
    expect(mapperSource).toContain('item.default_unit_price_cents');
    expect(mapperSource).toContain('item.labor_hours');
    expect(mapperSource).not.toContain('job_work_item_id');
    expect(mapperSource).not.toContain('contractor_id');
    expect(mapperSource).not.toContain('estimate_id');
    expect(mapperSource).not.toContain('invoice_id');

    expect(insertionSource).toContain('const nextLine = estimateLineDraftFromSavedCharge(charge);');
    expect(insertionSource).toContain('const nextLine = estimateLineDraftFromPriceBookItem(item);');
    expect(insertionSource).toContain('expandEstimateLineGroup(estimateLineVisualGroup(nextLine));');
    expect(insertionSource).toContain('line_items: usableLines.length === 0 ? [nextLine] : [...draft.line_items, nextLine]');
    expect(insertionSource).toContain('setEstimateLineFocusId(nextLine.id)');
    expect(insertionSource).toContain('Copied price — review before sending.');
  });

  test('preserves invoice isolation and defers historical, template-item, and current-draft reuse', () => {
    const source = appSource();
    const pickerSource = sourceBetween(source, 'const renderEstimateSavedItemPicker = () => {', 'const addEstimateHelperSuggestionToDraft =');
    const invoiceComposerSource = sourceBetween(
      source,
      '{invoiceComposerOpen && selectedJobsCustomerName && (',
      "{contractorJobsView === 'templates' && (",
    );

    expect(invoiceComposerSource).not.toContain('renderEstimateSavedItemPicker');
    expect(invoiceComposerSource).not.toContain('estimateSavedItemSearch');
    expect(invoiceComposerSource).not.toContain('estimateLineSourcePanel');
    expect(pickerSource).not.toContain('estimateTemplates.map');
    expect(pickerSource).not.toContain('estimate.line_items');
    expect(pickerSource).not.toContain('ESTIMATE_WITH_LINES_SELECT');
    expect(pickerSource).not.toContain(".from('estimates')");
    expect(pickerSource).not.toContain('.rpc(');
  });

  test('remains compatible with collapsible sections and existing duplicate behavior', () => {
    const source = appSource();
    const groupingSource = sourceBetween(workComposerDraftSource(), 'export function workComposerLineVisualGroup', 'export function groupWorkComposerDraftLines');
    const insertionSource = sourceBetween(source, 'const addSavedChargeToEstimateDraft =', 'const renderStructuredLineDraftEditor =');
    const groupedRendererSource = sourceBetween(source, 'const renderEstimateDraftLineGroups = () => {', 'const renderEstimateLineItemSources =');

    expect(groupingSource).toContain("if (type === 'labor') return 'labor';");
    expect(groupingSource).toContain("if (type === 'fee') return 'fees';");
    expect(groupingSource).toContain("return 'materials_other';");
    expect(insertionSource).toContain('expandEstimateLineGroup(estimateLineVisualGroup(nextLine));');
    expect(insertionSource).toContain('const duplicateLine = duplicateEstimateLineDraft(line);');
    expect(groupedRendererSource).toContain('estimateLineGroupSubtotalCents(groupLines)');
    expect(groupedRendererSource).toContain('estimateLineGroupUnpricedCount(groupLines)');
    expect(groupedRendererSource).toContain('onDuplicate: () => duplicateEstimateLineInDraft(line)');
  });
});
