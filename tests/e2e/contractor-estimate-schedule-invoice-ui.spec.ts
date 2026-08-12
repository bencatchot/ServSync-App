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

test.describe('contractor estimate schedule invoice UI source checks', () => {
  test('accepted scheduled estimates render row-level draft invoice actions', () => {
    const source = appSource();
    const scheduleRendererSource = sourceBetween(
      source,
      'const renderContractorEstimatePaymentScheduleSection = (',
      'const createInvoiceFromJob = async',
    );
    const financialEstimateCards = sourceBetween(
      source,
      'visibleEstimateRecords.map(estimate => {',
      "(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (",
    );
    const workspaceEstimateCards = sourceBetween(
      source,
      'selectedDocumentSection.estimates.map(estimate => {',
      "{estimate.status === 'sent' && (",
    );

    for (const cardSource of [financialEstimateCards, workspaceEstimateCards]) {
      expect(cardSource).toContain('const scheduleRows = sortedEstimatePaymentScheduleRows(estimate);');
      expect(cardSource).toContain('const hasPaymentScheduleRows = scheduleRows.length > 0;');
      expect(cardSource).toContain('renderContractorEstimatePaymentScheduleSection(estimate, scheduleRows');
    }
    expect(scheduleRendererSource).toContain('data-testid="contractor-estimate-payment-schedule-section"');
    expect(scheduleRendererSource).toContain('Payment schedule');
    expect(scheduleRendererSource).toContain('Request billing deliberately from the accepted schedule. Draft Invoices are never sent automatically.');
    expect(scheduleRendererSource).toContain('data-testid="contractor-create-schedule-invoice"');
    expect(scheduleRendererSource).toContain('Request deposit');
    expect(scheduleRendererSource).toContain('Create draft invoice');
    expect(scheduleRendererSource).toContain('createInvoiceFromEstimateScheduleItem(estimate, row.id)');
    expect(scheduleRendererSource).toContain("estimate.status === 'accepted' && canRequest");
  });

  test('schedule invoice action uses the narrow RPC and no direct invoice writes', () => {
    const source = appSource();
    const createScheduleInvoiceSource = sourceBetween(
      source,
      'const createInvoiceFromEstimateScheduleItem = async',
      'const renderContractorEstimatePaymentScheduleSection =',
    );

    expect(createScheduleInvoiceSource).toContain("supabase.rpc('servsync_create_invoice_from_estimate_schedule_item'");
    expect(createScheduleInvoiceSource).toContain('p_schedule_item_id: scheduleItemId');
    expect(createScheduleInvoiceSource).toContain('loadInvoiceById(result.invoice_id)');
    expect(createScheduleInvoiceSource).toContain('openInvoiceRecord(invoice)');
    expect(createScheduleInvoiceSource).toContain('await loadContractor()');
    expect(createScheduleInvoiceSource).not.toContain(".from('invoices')");
    expect(createScheduleInvoiceSource).not.toContain(".from('invoice_line_items')");
    expect(createScheduleInvoiceSource).not.toContain(".from('estimate_payment_schedule_items')");
    expect(createScheduleInvoiceSource).not.toContain('linked_invoice_id');
    expect(createScheduleInvoiceSource).not.toContain('sendInvoiceToHomeowner');
    expect(createScheduleInvoiceSource).not.toContain('markInvoicePaid');
    expect(createScheduleInvoiceSource).not.toContain('Home History');
    expect(createScheduleInvoiceSource).not.toContain('stripe');
    expect(createScheduleInvoiceSource).not.toContain('quickbooks');
  });

  test('accepted scheduled estimates show financial progress and preserve voided Invoice history', () => {
    const source = appSource();
    const scheduleRendererSource = sourceBetween(
      source,
      'const renderContractorEstimatePaymentScheduleSection = (',
      'const createInvoiceFromJob = async',
    );
    const summaryHelperSource = sourceBetween(
      source,
      'function estimatePaymentScheduleLinkedInvoiceSummary',
      'function createBlankContractorPriceBookItemDraft',
    );

    expect(scheduleRendererSource).toContain('data-testid="contractor-estimate-payment-schedule-summary"');
    expect(scheduleRendererSource).toContain('Estimate billing');
    expect(scheduleRendererSource).toContain('Schedule total');
    expect(scheduleRendererSource).toContain('Remaining scheduled');
    expect(scheduleRendererSource).toContain('Remaining Estimate');
    expect(scheduleRendererSource).toContain('Job creation remains available whether the deposit is unrequested, outstanding, partially paid, or paid.');
    expect(scheduleRendererSource).toContain('The voided Invoice remains in history. A replacement draft uses this schedule amount and does not rewrite the old Invoice.');
    expect(summaryHelperSource).toContain('linkedCount: linkedRows.length');
    expect(summaryHelperSource).toContain('estimateBillingSummary(estimate, invoices)');
    expect(summaryHelperSource).toContain('statusSummary');
    expect(scheduleRendererSource).toContain('Create replacement draft');
    expect(scheduleRendererSource).toContain('Request deposit again');
    expect(scheduleRendererSource).not.toContain('unlink');
  });

  test('non-accepted estimates are read-only unless an existing linked invoice can be opened', () => {
    const source = appSource();
    const financialEstimateCards = sourceBetween(
      source,
      'visibleEstimateRecords.map(estimate => {',
      "(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (",
    );
    const scheduleRendererSource = sourceBetween(
      source,
      'const renderContractorEstimatePaymentScheduleSection = (',
      'const createInvoiceFromJob = async',
    );
    const genericDraftSource = sourceBetween(source, 'const beginInvoiceDraftFromEstimate =', 'const createInvoiceFromEstimateScheduleItem = async');

    expect(scheduleRendererSource).toContain('Invoices can be created after homeowner approval.');
    expect(financialEstimateCards).toContain('const canCreateInvoiceDraftFromEstimate = !isInvoice && estimateCanCreateInvoice(estimate.status);');
    expect(financialEstimateCards).toContain('const canUseGenericEstimateInvoiceAction = Boolean(linkedInvoice || canCreateInvoiceDraftFromEstimate) && !hasPaymentScheduleRows;');
    expect(financialEstimateCards).toContain('canUseGenericEstimateInvoiceAction &&');
    expect(financialEstimateCards).toContain('beginInvoiceDraftFromEstimate(estimate)');
    expect(financialEstimateCards).not.toContain('Create draft invoice');
    expect(genericDraftSource).toContain("const existingInvoice = invoices.find(invoice => invoice.estimate_id === estimate.id && invoice.status !== 'void')");
    expect(genericDraftSource).toContain("if (estimate.status !== 'accepted')");
    expect(genericDraftSource).toContain("supabase.rpc('servsync_create_invoice_from_estimate'");
    expect(genericDraftSource).not.toContain('beginInvoiceDraftForCustomer');
    expect(source).not.toContain('Choose invoice type');
    expect(source).not.toContain('Select invoice type');
  });

  test('linked schedule rows show safe statuses and open loaded invoices', () => {
    const source = appSource();
    const presentationSource = sourceFile('src/features/estimates/depositWorkflow.ts');
    const scheduleRendererSource = sourceBetween(
      source,
      'const renderContractorEstimatePaymentScheduleSection = (',
      'const createInvoiceFromJob = async',
    );

    expect(presentationSource).toContain("if (invoice.status === 'draft')");
    expect(presentationSource).toContain("if (invoice.status === 'void')");
    expect(scheduleRendererSource).toContain('const rowInvoice = invoiceForScheduleRow(row, invoices);');
    expect(scheduleRendererSource).toContain('const billingPresentation = scheduleBillingPresentation(row, rowInvoice);');
    expect(scheduleRendererSource).toContain('Open invoice');
    expect(scheduleRendererSource).toContain('openInvoiceRecord(rowInvoice)');
    expect(scheduleRendererSource).toContain('Due date to be confirmed');
  });
});
