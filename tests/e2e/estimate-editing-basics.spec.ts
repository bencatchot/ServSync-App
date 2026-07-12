import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Estimate Editing Basics polish', () => {
  test('duplicate estimate line helper copies only safe editable estimating fields', () => {
    const source = appSource();
    const duplicateSource = sourceBetween(
      source,
      'function duplicateEstimateLineDraft',
      'function createBlankEstimateDraft',
    );

    for (const copiedField of [
      'line_type: normalizeEstimateLineType(line.line_type)',
      'description: line.description',
      'line_title: line.line_title',
      'customer_description: line.customer_description',
      'model_spec: line.model_spec',
      'supply_status: normalizeEstimateLineSupplyStatus(line.supply_status)',
      'quantity: line.quantity',
      'unit: line.unit',
      'unit_price: line.unit_price',
      'labor_hours: line.labor_hours',
    ]) {
      expect(duplicateSource).toContain(copiedField);
    }

    expect(duplicateSource).toContain('createEstimateLineDraft({');
    expect(duplicateSource).toContain('builderGenerated: false');
    expect(duplicateSource).not.toContain('id: line.id');
    expect(duplicateSource).not.toContain('job_work_item_id');
    expect(duplicateSource).not.toContain('editor_source_note');
    expect(duplicateSource).not.toContain('estimate_id');
    expect(duplicateSource).not.toContain('invoice_id');
    expect(duplicateSource).not.toContain('created_at');
    expect(duplicateSource).not.toContain('updated_at');
  });

  test('duplicate action inserts below the source line and focuses the duplicate on desktop', () => {
    const source = appSource();
    const handlerSource = sourceBetween(
      source,
      'const duplicateEstimateLineInDraft =',
      'const removeEstimateLineFromDraft =',
    );
    const editorSource = sourceBetween(
      source,
      'const renderStructuredLineDraftEditor =',
      'const renderLaborModeButton =',
    );

    expect(handlerSource).toContain('const duplicateLine = duplicateEstimateLineDraft(line);');
    expect(handlerSource).toContain('const sourceIndex = draft.line_items.findIndex(item => item.id === line.id);');
    expect(handlerSource).toContain('...draft.line_items.slice(0, sourceIndex + 1)');
    expect(handlerSource).toContain('duplicateLine');
    expect(handlerSource).toContain('...draft.line_items.slice(sourceIndex + 1)');
    expect(handlerSource).toContain('setEstimateLineFocusId(duplicateLine.id)');

    expect(editorSource).toContain("itemLabel === 'estimate' && onDuplicate");
    expect(editorSource).toContain('aria-label={`Duplicate estimate line item ${index + 1}`}');
    expect(editorSource).toContain('<Copy size={15} />');
    expect(editorSource).toContain('actionButtons');
  });

  test('estimate-only boundary leaves invoice line editor calls without duplicate controls', () => {
    const source = appSource();
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

    expect(estimateComposerSource).toContain('onDuplicate: () => duplicateEstimateLineInDraft(line)');
    expect(invoiceComposerSource).toContain("itemLabel: 'invoice'");
    expect(invoiceComposerSource).not.toContain('onDuplicate');
    expect(invoiceComposerSource).not.toContain('renderEstimateDraftStateNotice');
    expect(invoiceComposerSource).not.toContain('estimateComposer.scroll');
  });

  test('focus behavior reuses estimateLineFocusId and avoids forced mobile keyboard focus', () => {
    const source = appSource();
    const focusSource = sourceBetween(source, 'const shouldAutoFocusEstimateLine =', 'useEffect(() => {');
    const focusEffectSource = sourceBetween(source, 'useEffect(() => {\n    if (!estimateLineFocusId) return;', 'useEffect(() => {\n    if (!estimateComposerScrollStorageKey || error) return;');
    const addSource = sourceBetween(source, 'const addSavedChargeToEstimateDraft =', 'const renderStructuredLineDraftEditor =');
    const removeSource = sourceBetween(source, 'const removeEstimateLineFromDraft =', 'const renderStructuredLineDraftEditor =');

    expect(focusSource).toContain("window.matchMedia('(min-width: 768px) and (pointer: fine)').matches");
    expect(focusEffectSource).toContain("target?.scrollIntoView({ block: 'center', behavior: 'smooth' });");
    expect(focusEffectSource).toContain('if (shouldAutoFocusEstimateLine()) target?.focus();');
    expect(addSource).toContain('setEstimateLineFocusId(nextLine.id)');
    expect(addSource).toContain('setEstimateLineFocusId(duplicateLine.id)');
    expect(removeSource).toContain('setEstimateLineFocusId(nextFocusLine.id)');
    expect(removeSource).toContain('estimateAddBlankLineButtonRef.current?.focus()');
  });

  test('draft state message is clear, mobile-friendly, and estimate-only', () => {
    const source = appSource();
    const draftNoticeSource = sourceBetween(
      source,
      'const renderEstimateDraftStateNotice = () => (',
      'const renderEstimateDraftTotals = () => {',
    );

    expect(draftNoticeSource).toContain('data-testid="estimate-draft-state-notice"');
    expect(draftNoticeSource).toContain('Draft');
    expect(draftNoticeSource).toContain('Not sent to the homeowner yet. Save the draft, then send when ready.');
    expect(draftNoticeSource).not.toContain('last saved');
    expect(draftNoticeSource).not.toContain('unsaved');
    expect(draftNoticeSource).not.toContain('status:');
  });

  test('same-session scroll restoration is draft-scoped, session-only, and skips validation errors', () => {
    const source = appSource();
    const scrollSource = sourceBetween(
      source,
      'const estimateComposerScrollStorageKey =',
      'useEffect(() => {\n    if (!estimateLineFocusId) return;',
    );
    const restoreSource = sourceBetween(
      source,
      'useEffect(() => {\n    if (!estimateComposerScrollStorageKey || error) return;',
      'useEffect(() => {\n    if (!estimateComposerScrollStorageKey) return;',
    );
    const saveSource = sourceBetween(source, 'const saveEstimateDraft = async', 'const saveInvoiceDraft = async');

    expect(scrollSource).toContain('servsync.estimateComposer.scroll');
    expect(scrollSource).toContain('editingEstimateId ? `estimate:${editingEstimateId}` : `draft:${estimateDraftSessionId}`');
    expect(scrollSource).toContain('window.sessionStorage.removeItem');
    expect(restoreSource).toContain('window.sessionStorage.getItem(estimateComposerScrollStorageKey)');
    expect(restoreSource).toContain('requestAnimationFrame');
    expect(restoreSource).toContain('Math.min(Math.max(0, storedPosition), maxScroll)');
    expect(restoreSource).toContain("window.scrollTo({ top:");
    expect(source).toContain("window.addEventListener('scroll', saveScrollPosition, { passive: true });");
    expect(source).not.toContain('localStorage.setItem(estimateComposerScrollStorageKey');
    expect(saveSource).toContain('clearEstimateComposerScrollPosition();');
  });
});
