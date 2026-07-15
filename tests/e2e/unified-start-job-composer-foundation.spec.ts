import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Unified Start New Job foundation slice', () => {
  test('adds a neutral frontend work composer draft without database or workflow behavior', () => {
    const typesSource = sourceFile('src/features/work-composer/types.ts');
    const helpersSource = sourceFile('src/features/work-composer/workComposerDrafts.ts');
    const rowSource = sourceFile('src/features/work-composer/WorkComposerLineItemRow.tsx');
    const totalsSource = sourceFile('src/features/work-composer/WorkComposerTotals.tsx');
    const combinedSource = [typesSource, helpersSource, rowSource, totalsSource].join('\n');

    expect(typesSource).toContain('export type WorkComposerDraft');
    expect(typesSource).toContain('export type WorkComposerLineDraft');
    expect(typesSource).toContain('line_items: WorkComposerLineDraft[];');
    expect(typesSource).not.toContain('estimate_id');
    expect(typesSource).not.toContain('invoice_id');
    expect(typesSource).not.toContain('inspection_id');
    expect(typesSource).not.toContain('job_status');
    expect(typesSource).not.toContain('estimate_status');
    expect(typesSource).not.toContain('invoice_status');

    for (const forbidden of ['supabase', '.rpc(', '.from(', 'localStorage', 'sessionStorage', 'appHashRoute', 'navigate']) {
      expect(combinedSource).not.toContain(forbidden);
    }
  });

  test('estimate and invoice composers consume extracted line-row and totals presentation', () => {
    const appSource = sourceFile('src/App.tsx');
    const wrapperSource = sourceBetween(appSource, 'const renderStructuredLineDraftEditor =', 'const renderLaborModeButton =');
    const estimateComposerSource = sourceBetween(
      appSource,
      '{estimateComposerOpen && selectedJobsCustomerName && (',
      '{invoiceComposerOpen && selectedJobsCustomerName && (',
    );
    const invoiceComposerSource = sourceBetween(
      appSource,
      '{invoiceComposerOpen && selectedJobsCustomerName && (',
      "{contractorJobsView === 'templates' && (",
    );

    expect(appSource).toContain("from './features/work-composer/WorkComposerLineItemRow'");
    expect(appSource).toContain("from './features/work-composer/WorkComposerTotals'");
    expect(wrapperSource).toContain('<WorkComposerLineItemRow');
    expect(wrapperSource).toContain('writingAssistProps={writingAssistProps}');
    expect(estimateComposerSource).toContain('{renderEstimateDraftTotals()}');
    expect(invoiceComposerSource).toContain('{renderInvoiceDraftTotals()}');
    expect(appSource).toContain('<WorkComposerTotalsPanel');
  });

  test('accepted-estimate-to-job duplicate prevention remains the protected RPC path', () => {
    const appSource = sourceFile('src/App.tsx');
    const rpcSource = sourceFile('servsync-partial-invoicing-estimate-work-items.sql');
    const dataTestSource = sourceFile('tests/e2e/partial-invoicing-data-foundation.spec.ts');
    const appCreateSource = sourceBetween(appSource, 'const createJobFromAcceptedEstimate = async', 'const updateSaveEstimateTemplateModal =');

    expect(appCreateSource).toContain("if (estimate.status !== 'accepted')");
    expect(appCreateSource).toContain('const existingJob = jobForEstimate(estimate);');
    expect(appCreateSource).toContain("supabase.rpc('servsync_create_job_from_estimate'");
    expect(appCreateSource).not.toContain('.insert(');
    expect(rpcSource).toContain('v_estimate.inspection_id is not null');
    expect(rpcSource).toContain('v_work_item_count := public.servsync_seed_job_work_items_from_estimate');
    expect(dataTestSource).toContain('accepted estimate job creation seeds durable work items without duplicates');
    expect(dataTestSource).toContain('Retrying accepted estimate job creation should succeed');
  });

  test('partial invoicing guardrails remain source-backed and item-based', () => {
    const appSource = sourceFile('src/App.tsx');
    const partialSqlSource = sourceFile('servsync-partial-invoicing-data-foundation.sql');
    const wholeJobGuardSource = sourceFile('servsync-whole-job-invoice-work-item-guard.sql');
    const dataTestSource = sourceFile('tests/e2e/partial-invoicing-data-foundation.spec.ts');
    const partialInvoiceSource = sourceBetween(appSource, 'const createPartialInvoiceFromSelectedItems = async', 'const manualWorkItemCanEdit =');

    expect(partialInvoiceSource).toContain('partialInvoiceSelectedIds');
    expect(partialInvoiceSource).toContain("supabase.rpc('servsync_create_partial_invoice_from_job'");
    expect(partialSqlSource).toContain('One or more selected work items are already drafted, invoiced, or not billable.');
    expect(wholeJobGuardSource).toContain('Use item-based invoicing for jobs with work items.');
    expect(dataTestSource).toContain('Drafted work item should not be double-invoiced');
    expect(dataTestSource).toContain('Invoiced work item should not be double-invoiced');
  });

  test('does not launch the future unified Start New Job outcome flow yet', () => {
    const appSource = sourceFile('src/App.tsx');
    const directJobSource = sourceBetween(appSource, '<Card title="Create Job"', '{inspectionView ===');

    expect(directJobSource).toContain('Create Job');
    expect(directJobSource).toContain('startNewInspection');
    expect(directJobSource).not.toContain('Create Estimate');
    expect(directJobSource).not.toContain('Create Invoice');
    expect(directJobSource).toContain('Open Draft Job composer');
    expect(directJobSource).not.toContain('Save Draft');
    expect(sourceFile('src/features/work-composer/types.ts')).not.toContain('DraftJob');
  });
});
