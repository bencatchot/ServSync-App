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

test.describe('Estimate collapsible visual sections', () => {
  test('declares the approved estimate-only visual groups and normalized grouping rules', () => {
    const source = appSource();
    const typeSource = sourceBetween(source, "type EstimateLineGroupKey = 'labor'", 'type EstimateDraftBuilderTrade');
    const metadataSource = sourceBetween(source, 'const ESTIMATE_LINE_VISUAL_GROUPS', 'function estimateLineTypeLabel');
    const groupingSource = sourceBetween(source, 'function estimateLineVisualGroup', 'function draftSchemaLaborHours');

    expect(typeSource).toContain("'labor' | 'materials_other' | 'fees'");
    expect(metadataSource).toContain("{ key: 'labor', label: 'Labor' }");
    expect(metadataSource).toContain("{ key: 'materials_other', label: 'Materials / Other' }");
    expect(metadataSource).toContain("{ key: 'fees', label: 'Fees' }");
    expect(groupingSource).toContain("if (type === 'labor') return 'labor';");
    expect(groupingSource).toContain("if (type === 'fee') return 'fees';");
    expect(groupingSource).toContain("return 'materials_other';");
    expect(groupingSource).toContain('normalizeEstimateLineType(line.line_type)');
    expect(source).toContain("if (lineType === 'equipment') return 'material';");
    expect(source).toContain("return 'other';");
  });

  test('groups lines in fixed visual order while preserving draft-array order within each group', () => {
    const source = appSource();
    const groupingSource = sourceBetween(source, 'function groupEstimateDraftLines', 'function estimateLineGroupSubtotalCents');

    expect(groupingSource).toContain('lines.forEach((line, index) => {');
    expect(groupingSource).toContain('groupedLines[estimateLineVisualGroup(line)].push({ line, index });');
    expect(groupingSource).toContain('ESTIMATE_LINE_VISUAL_GROUPS');
    expect(groupingSource).toContain('.filter(group => group.lines.length > 0)');
    expect(groupingSource).not.toContain('sort(');
    expect(groupingSource).not.toContain('line_items:');
  });

  test('renders compact accessible headers with counts, subtotals, and unpriced warnings', () => {
    const source = appSource();
    const rendererSource = sourceBetween(source, 'const renderEstimateDraftLineGroups = () => {', 'const renderEstimateLineItemSources =');

    expect(rendererSource).toContain('data-testid="estimate-line-visual-groups"');
    expect(rendererSource).toContain('data-testid={`estimate-line-group-${group.key}`}');
    expect(rendererSource).toContain('aria-expanded={!collapsed}');
    expect(rendererSource).toContain('aria-controls={regionId}');
    expect(rendererSource).toContain("aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.label} section`}");
    expect(rendererSource).toContain('min-h-11');
    expect(rendererSource).toContain('Line subtotal {subtotalLabel}');
    expect(rendererSource).toContain('estimateLineGroupSubtotalCents(groupLines)');
    expect(rendererSource).toContain('estimateLineGroupUnpricedCount(groupLines)');
    expect(rendererSource).toContain("item{unpricedCount === 1 ? '' : 's'} require{unpricedCount === 1 ? 's' : ''} pricing");
    expect(rendererSource).toContain("if (groups.length === 0) return renderEstimateLineItemSources({ empty: true });");
  });

  test('collapse state is local, resets by estimate/draft identity, and avoids storage persistence', () => {
    const source = appSource();
    const stateSource = sourceBetween(source, 'const [estimateLineGroupCollapseState', 'const [expandedEstimateLineDetails');
    const identitySource = sourceBetween(source, 'const estimateComposerCollapseIdentity =', 'const clearEstimateComposerScrollPosition =');
    const resetSource = sourceBetween(source, 'useEffect(() => {\n    setEstimateLineGroupCollapseState({ identity: estimateComposerCollapseIdentity, groups: {} });', 'useEffect(() => {\n    setNotice');
    const toggleSource = sourceBetween(source, 'const expandEstimateLineGroup =', 'const addSavedChargeToEstimateDraft =');

    expect(stateSource).toContain('identity: string;');
    expect(stateSource).toContain('groups: Partial<Record<EstimateLineGroupKey, true>>;');
    expect(stateSource).toContain("}>({ identity: '', groups: {} })");
    expect(identitySource).toContain("editingEstimateId ? `estimate:${editingEstimateId}` : `draft:${estimateDraftSessionId}`");
    expect(identitySource).toContain('estimateLineGroupCollapseState.identity === estimateComposerCollapseIdentity');
    expect(resetSource).toContain('[estimateComposerCollapseIdentity]');
    expect(toggleSource).toContain('setEstimateLineGroupCollapseState');
    expect(toggleSource).toContain('prev.identity === estimateComposerCollapseIdentity ? prev.groups : {}');
    expect(toggleSource).toContain('delete next[groupKey]');
    expect(toggleSource).toContain('return { identity: estimateComposerCollapseIdentity, groups: { ...groups, [groupKey]: true } };');
    expect(source).not.toContain('localStorage.setItem(collapsedEstimateLineGroups');
    expect(source).not.toContain('sessionStorage.setItem(collapsedEstimateLineGroups');
  });

  test('add, duplicate, saved-charge, Price Book, and type changes expand destination groups before focus', () => {
    const source = appSource();
    const actionSource = sourceBetween(source, 'const expandEstimateLineGroup =', 'const renderStructuredLineDraftEditor =');

    expect(actionSource).toContain('expandEstimateLineGroup(estimateLineVisualGroup(nextLine));');
    expect(actionSource).toContain('const duplicateLine = duplicateEstimateLineDraft(line);');
    expect(actionSource).toContain('expandEstimateLineGroup(estimateLineVisualGroup(duplicateLine));');
    expect(actionSource).toContain('setEstimateLineFocusId(nextLine.id)');
    expect(actionSource).toContain('setEstimateLineFocusId(duplicateLine.id)');
    expect(actionSource).toContain('if (updates.line_type !== undefined)');
    expect(actionSource).toContain('expandEstimateLineGroup(estimateLineVisualGroup({ ...line, ...updates }));');
  });

  test('save warnings expand affected groups without replacing existing validation semantics', () => {
    const source = appSource();
    const saveSource = sourceBetween(source, 'const saveEstimateDraft = async', 'const saveInvoiceDraft = async');

    expect(saveSource).toContain('expandEstimateLineGroupsForLines(usableLines.filter(draftLineIsUnpriced));');
    expect(saveSource).toContain('window.confirm(`${priceRequiredWarningText(draftUnpricedCount)}');
    expect(saveSource).toContain('draftHasLaborHoursWithoutRate(draftForTotals)');
    expect(saveSource).toContain('expandEstimateLineGroupsForLines(');
    expect(saveSource).not.toContain('throw new Error');
    expect(saveSource).not.toContain('setError(priceRequiredWarningText');
  });

  test('both estimate composer paths use the shared grouped renderer and invoice composer stays flat', () => {
    const source = appSource();
    const selectedWorkspaceComposer = sourceBetween(
      source,
      '{!SERVSYNC_DEMO_PRESENTATION_MODE && estimateComposerOpen && (',
      '{activeDocumentRecords.length === 0 ?',
    );
    const jobsEstimateComposer = sourceBetween(
      source,
      '{estimateComposerOpen && selectedJobsCustomerName && (',
      '{invoiceComposerOpen && selectedJobsCustomerName && (',
    );
    const invoiceComposer = sourceBetween(
      source,
      '{invoiceComposerOpen && selectedJobsCustomerName && (',
      "{contractorJobsView === 'templates' && (",
    );

    expect(selectedWorkspaceComposer).toContain('{renderEstimateDraftLineGroups()}');
    expect(jobsEstimateComposer).toContain('{renderEstimateDraftLineGroups()}');
    expect(selectedWorkspaceComposer).not.toContain('estimateDraft.line_items.map');
    expect(jobsEstimateComposer).not.toContain('estimateDraft.line_items.map');
    expect(invoiceComposer).toContain('(invoiceDraft.line_items ?? []).map');
    expect(invoiceComposer).toContain("itemLabel: 'invoice'");
    expect(invoiceComposer).not.toContain('renderEstimateDraftLineGroups');
    expect(invoiceComposer).not.toContain('estimate-line-visual-groups');
    expect(invoiceComposer).not.toContain('collapsedEstimateLineGroups');
  });

  test('does not add persisted estimate sections, SQL, or backend dependencies', () => {
    const source = appSource();
    const typeSurface = sourceBetween(source, 'type EstimateLineGroupKey =', 'type EstimateDraftBuilderTrade');
    const groupingSurface = sourceBetween(source, 'function estimateLineVisualGroup', 'function draftSchemaLaborHours');
    const rendererSurface = sourceBetween(source, 'const renderEstimateDraftLineGroups = () => {', 'const renderEstimateLineItemSources =');
    const changedSurface = [typeSurface, groupingSurface, rendererSurface].join('\n');

    expect(changedSurface).not.toContain('estimate_sections');
    expect(changedSurface).not.toContain('section_id');
    expect(changedSurface).not.toContain('sort_order');
    expect(changedSurface).not.toContain('.insert(');
    expect(changedSurface).not.toContain('.update(');
    expect(changedSurface).not.toContain('.rpc(');
  });
});
