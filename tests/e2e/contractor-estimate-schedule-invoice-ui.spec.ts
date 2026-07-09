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
      expect(cardSource).toContain('data-testid="contractor-estimate-payment-schedule-section"');
      expect(cardSource).toContain('Payment schedule');
      expect(cardSource).toContain('Create draft invoices from the homeowner-approved schedule rows.');
      expect(cardSource).toContain('data-testid="contractor-create-schedule-invoice"');
      expect(cardSource).toContain('Create draft invoice');
      expect(cardSource).toContain('createInvoiceFromEstimateScheduleItem(estimate, row.id)');
      expect(cardSource).toContain("estimate.status === 'accepted' && !row.linked_invoice_id");
    }
  });

  test('schedule invoice action uses the narrow RPC and no direct invoice writes', () => {
    const source = appSource();
    const createScheduleInvoiceSource = sourceBetween(
      source,
      'const createInvoiceFromEstimateScheduleItem = async',
      'const createInvoiceFromJob = async',
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

  test('non-accepted scheduled estimates are read-only and legacy estimates keep the generic invoice path', () => {
    const source = appSource();
    const financialEstimateCards = sourceBetween(
      source,
      'visibleEstimateRecords.map(estimate => {',
      "(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (",
    );
    const genericDraftSource = sourceBetween(source, 'const beginInvoiceDraftFromEstimate =', 'const createInvoiceFromEstimateScheduleItem = async');

    expect(financialEstimateCards).toContain('Invoices can be created after homeowner approval.');
    expect(financialEstimateCards).toContain('const canUseGenericEstimateInvoiceAction = canCreateInvoiceDraftFromEstimate && !hasPaymentScheduleRows;');
    expect(financialEstimateCards).toContain('{canUseGenericEstimateInvoiceAction && (');
    expect(financialEstimateCards).toContain('beginInvoiceDraftFromEstimate(estimate, customerName)');
    expect(genericDraftSource).toContain("const existingInvoice = invoices.find(invoice => invoice.estimate_id === estimate.id && invoice.status !== 'void')");
    expect(genericDraftSource).toContain('beginInvoiceDraftForCustomer(subjectName || \'Customer\', {');
    expect(genericDraftSource).toContain('sourceEstimate: estimate');
    expect(source).not.toContain('Choose invoice type');
    expect(source).not.toContain('Select invoice type');
  });

  test('linked schedule rows show safe statuses and open loaded invoices', () => {
    const source = appSource();
    const statusHelperSource = sourceBetween(source, 'function scheduleLinkedInvoiceStatusLabel', 'function createBlankSavedEstimateChargeDraft');
    const financialEstimateCards = sourceBetween(
      source,
      'visibleEstimateRecords.map(estimate => {',
      "(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (",
    );

    expect(statusHelperSource).toContain("if (invoice?.status === 'draft') return 'Draft invoice created';");
    expect(statusHelperSource).toContain("if (invoice?.status === 'void') return 'Voided';");
    expect(statusHelperSource).toContain("if (linkedInvoiceId) return 'Invoice linked';");
    expect(financialEstimateCards).toContain('const rowInvoice = row.linked_invoice_id');
    expect(financialEstimateCards).toContain('const linkedStatus = scheduleLinkedInvoiceStatusLabel(rowInvoice, row.linked_invoice_id);');
    expect(financialEstimateCards).toContain('Open invoice');
    expect(financialEstimateCards).toContain('openInvoiceRecord(rowInvoice)');
    expect(financialEstimateCards).toContain('Due date to be confirmed');
  });
});
