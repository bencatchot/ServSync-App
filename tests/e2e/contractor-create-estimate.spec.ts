import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import {
  createLocalE2ECustomer,
  escapeRegExp,
  launchCustomerProfileDraft,
  openE2ECustomerActionPanel,
  timestampForRecord,
  waitForContractorWorkspaceReady,
} from './helpers/customers';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const pdfDocumentsSource = () => sourceFile('src/utils/pdfDocuments.ts');
const workComposerLineItemRowSource = () => sourceFile('src/features/work-composer/WorkComposerLineItemRow.tsx');
const paymentScheduleSource = () => sourceFile('src/features/estimates/paymentSchedule.ts');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('contractor estimate creation UI structure', () => {
  test('normal estimate starts use blank, template, and draft estimator choices', () => {
    const source = appSource();
    const startChoiceSource = sourceBetween(source, 'const renderEstimateStartChoice =', 'const renderSavedEstimateTemplateStartPicker =');
    const templateStartSource = sourceBetween(source, 'const applySavedEstimateTemplateStart =', 'const closeActiveInvoiceEditor =');

    expect(startChoiceSource).toContain('Build blank estimate');
    expect(startChoiceSource).toContain('Choose estimate template');
    expect(startChoiceSource).toContain('Build draft estimator');
    expect(startChoiceSource.indexOf('Build blank estimate')).toBeLessThan(startChoiceSource.indexOf('Choose estimate template'));
    expect(startChoiceSource.indexOf('Choose estimate template')).toBeLessThan(startChoiceSource.indexOf('Build draft estimator'));
    expect(startChoiceSource).toContain("setEstimateStartMode('draft')");
    expect(startChoiceSource).toContain("setEstimateStartMode('template')");
    expect(startChoiceSource).toContain("setEstimateStartMode('guided')");
    expect(startChoiceSource).toContain('setEstimateGuidedBuilderActive(true)');
    expect(startChoiceSource).not.toContain('Build from saved template');
    expect(startChoiceSource).not.toContain('Build with guided draft builder');
    expect(startChoiceSource).not.toContain('Start blank</span>');

    expect(templateStartSource).toContain('estimateDraftFromTemplate(template');
    expect(templateStartSource).toContain("setEstimateStartMode('draft')");
    expect(templateStartSource).toContain('setEstimateGuidedBuilderActive(false)');
  });

  test('line item sources replace the broad optional tools drawer and More details stays available', () => {
    const source = appSource();
    const lineItemRowSource = workComposerLineItemRowSource();
    const lineSourceSource = sourceBetween(source, 'const renderEstimateLineItemSources =', 'const startEstimateAssistantSpeech =');
    const lineEditorSource = sourceBetween(source, 'const renderStructuredLineDraftEditor =', 'const renderLaborModeButton =');
    const groupedRendererSource = sourceBetween(source, 'const renderEstimateDraftLineGroups = () => {', 'const renderEstimateLineItemSources =');
    const jobsEstimateComposerSource = sourceBetween(source, '{estimateComposerOpen && selectedJobsCustomerName && (', '{authorizedInvoiceComposerOpen && selectedJobsCustomerName && (');

    expect(source).not.toContain('renderEstimateReferenceTools');
    expect(source).not.toContain('Optional tools');
    expect(lineSourceSource).toContain('Add blank line');
    expect(lineSourceSource).toContain('Add saved item');
    expect(lineSourceSource).toContain('estimate-line-empty-state');
    expect(lineSourceSource).toContain('addBlankEstimateLineToDraft');
    expect(lineSourceSource).toContain('renderEstimateSavedItemPicker()');
    expect(lineSourceSource).not.toContain('renderEstimateHelperPanel()');
    expect(lineSourceSource).not.toContain('renderSavedEstimateTemplateStartPicker');
    expect(source).toContain('line_items: []');

    expect(lineEditorSource).toContain('compactAdvanced = false');
    expect(lineEditorSource).toContain('<WorkComposerLineItemRow');
    expect(lineItemRowSource).toContain('More details');
    expect(lineItemRowSource).toContain('lineTypeField');
    expect(lineItemRowSource).toContain('laborHoursField');
    expect(lineItemRowSource).toContain('modelSpecField');
    expect(lineItemRowSource).toContain('supplyStatusField');
    expect(lineItemRowSource).toContain('Source note');
    expect(jobsEstimateComposerSource).toContain('renderEstimateDraftLineGroups()');
    expect(groupedRendererSource).toContain('compactAdvanced: true');
    expect(groupedRendererSource).toContain('renderEstimateLineItemSources()');
    expect(groupedRendererSource).toContain('renderEstimateLineItemSources({ empty: true })');
    expect(jobsEstimateComposerSource).toContain('Back to estimate options');
    expect(jobsEstimateComposerSource).toContain('Discard draft');
    expect(jobsEstimateComposerSource).not.toContain('estimateDraft.line_items.map');
  });

  test('contractor draft estimates include a structured payment schedule editor with draft-invoice clarity', () => {
    const source = appSource();
    const pdfSource = pdfDocumentsSource();
    const scheduleDomainSource = paymentScheduleSource();
    const scheduleSource = sourceBetween(source, 'const renderEstimatePaymentScheduleEditor =', 'const renderInvoiceDraftTotals =');
    const saveSource = sourceBetween(source, 'const saveEstimateDraft = async', 'const saveInvoiceDraft = async');
    const jobsEstimateComposerSource = sourceBetween(source, '{estimateComposerOpen && selectedJobsCustomerName && (', '{authorizedInvoiceComposerOpen && selectedJobsCustomerName && (');

    expect(scheduleSource).toContain('Payment schedule');
    expect(scheduleSource).toContain('After homeowner approval, accepted schedule items can be used to create draft invoices; creating a draft does not send it automatically.');
    expect(scheduleSource).not.toContain('Customer-facing display and invoice generation will be added in a later step.');
    expect(scheduleSource).toContain('Full invoice on completion');
    expect(scheduleSource).toContain('Deposit + final');
    expect(scheduleSource).toContain('Custom schedule');
    expect(scheduleSource).toContain('No payment schedule rows are saved unless you choose Deposit + final or Custom schedule.');
    expect(scheduleDomainSource).toContain('Payment schedule total does not match the estimate total. Review before sending.');
    expect(scheduleDomainSource).toContain('Payment schedule is above the estimate total. Review before saving or sending.');
    expect(scheduleSource).toContain('Add payment');
    expect(source).toContain('Payment schedule label');
    expect(source).toContain('Payment schedule due trigger');
    expect(scheduleSource).toContain('estimate-payment-schedule-section');
    expect(scheduleSource).not.toContain('linked_invoice_id');

    expect(source).toContain("from './features/estimates/paymentSchedule'");
    expect(source).not.toContain("type EstimatePaymentScheduleMode = 'default' | 'deposit_final' | 'custom';");
    expect(scheduleDomainSource).toContain("export type EstimatePaymentScheduleMode = 'default' | 'deposit_final' | 'custom';");
    expect(scheduleDomainSource).toContain('export function estimatePaymentScheduleCalculatedCents');
    expect(scheduleDomainSource).toContain("row.amount_type === 'percentage'");
    expect(scheduleDomainSource).toContain("invoice_type: 'deposit'");
    expect(scheduleDomainSource).toContain("invoice_type: 'final'");
    expect(scheduleDomainSource).toContain('Math.max(0, estimateTotalCents - depositCents)');
    expect(scheduleDomainSource).toContain('ESTIMATE_PAYMENT_SCHEDULE_TYPE_DEFAULTS');
    expect(scheduleDomainSource).toContain("total: {\n    label: 'Full payment',\n    dueTrigger: 'Due on completion'");
    expect(scheduleDomainSource).toContain("deposit: {\n    label: 'Deposit',\n    dueTrigger: 'Due on approval'");
    expect(scheduleDomainSource).toContain("progress: {\n    label: 'Progress payment',\n    dueTrigger: 'Due at milestone'");
    expect(scheduleDomainSource).toContain("final: {\n    label: 'Final payment',\n    dueTrigger: 'Due on completion'");
    expect(source).toContain('const updateEstimatePaymentScheduleRowType =');
    expect(source).toContain('label: defaults.label');
    expect(source).toContain('due_trigger: defaults.dueTrigger');
    expect(source).toContain('onChange={event => updateEstimatePaymentScheduleRowType(row.id, event.target.value as EstimatePaymentScheduleInvoiceType)}');
    expect(source).toContain('onChange={event => updateEstimatePaymentScheduleRow(row.id, { label: event.target.value })}');
    expect(source).toContain('onChange={event => updateEstimatePaymentScheduleRow(row.id, { due_trigger: event.target.value })}');
    expect(source).toContain('estimatePaymentScheduleDraftFromEstimate(estimate)');

    expect(scheduleDomainSource).toContain("if (!draft.explicit) return { rows: [], error: '' };");
    expect(saveSource).toContain(".from('estimate_payment_schedule_items')");
    expect(saveSource).toContain('.delete()');
    expect(saveSource).toContain('.insert(scheduleForSave.rows.map(row => ({');
    expect(scheduleDomainSource).toContain('linked_invoice_id: null');
    expect(saveSource).not.toContain('servsync_create_invoice_from_estimate');
    expect(saveSource).not.toContain('beginInvoiceDraftFromEstimate');

    expect(jobsEstimateComposerSource).toContain('renderEstimatePaymentScheduleEditor()');
    expect(jobsEstimateComposerSource).toContain('<Field label="Terms">');
    expect(source).not.toContain('beginInvoiceDraftFromPaymentSchedule');
    expect(source).not.toContain('servsync_create_invoice_from_schedule');

    expect(pdfSource).toContain("sectionTitle('Payment Schedule')");
    expect(pdfSource).toContain('const paymentScheduleRows = [...(estimate.payment_schedule_items || [])]');
    expect(pdfSource).toContain('.sort((a, b) => a.sort_order - b.sort_order)');
    expect(pdfSource).toContain('paymentScheduleInvoiceTypeLabel(row.invoice_type)');
    expect(pdfSource).toContain('formatMoney(row.calculated_amount_cents)');
    expect(pdfSource).toContain("row.due_trigger?.trim() || 'Due date to be confirmed'");
    expect(pdfSource).toContain("sectionTitle('Terms')");
  });

  test('edited estimate draft save returns to the saved estimate record', () => {
    const source = appSource();
    const focusHelperSource = sourceBetween(source, 'const focusSavedEstimateRecord = (estimate: Estimate) => {', 'const saveEstimateDraft = async');
    const saveSource = sourceBetween(source, 'const saveEstimateDraft = async', 'const saveInvoiceDraft = async');

    expect(focusHelperSource).toContain('setWorkCustomerFilterSubjectId(connection?.connection_id ?? (local ? `local:${local.id}` : workCustomerFilterSubjectId));');
    expect(focusHelperSource).toContain("setContractorTab('work');");
    expect(focusHelperSource).toContain('setFocusedEstimateRecordId(estimate.id);');
    expect(focusHelperSource).toContain('setContractorWorkView(estimateWorkViewForStatus(estimate.status));');
    expect(saveSource).toContain('focusSavedEstimateRecord(savedEstimate);');
    expect(saveSource).not.toContain('if (!currentEditingEstimateId) focusSavedEstimateActions(savedEstimate);');
  });

  test('Work owns Estimate records while Financials owns Invoice records', () => {
    const source = appSource();
    const navigationHook = sourceFile('src/features/navigation/useContractorWorkspaceNavigation.ts');
    const recordListSource = sourceBetween(
      source,
      "{((contractorTab === 'work' && (contractorWorkView === 'open_estimates' || contractorWorkView === 'closed_estimates')) || (contractorTab === 'financials' && (contractorFinancialsView === 'open_invoices' || contractorFinancialsView === 'closed_invoices'))) && (",
      "{contractorTab === 'work' && (contractorWorkView === 'open_jobs' || contractorWorkView === 'closed_jobs') && (",
    );
    const composerSource = sourceBetween(
      source,
      "{((contractorTab === 'work' && contractorWorkView === 'new_estimates') || (contractorTab === 'financials' && contractorFinancialsView === 'new_invoices')) && (",
      "{((contractorTab === 'work' && (contractorWorkView === 'open_estimates' || contractorWorkView === 'closed_estimates')) || (contractorTab === 'financials' && (contractorFinancialsView === 'open_invoices' || contractorFinancialsView === 'closed_invoices'))) && (",
    );

    expect(navigationHook).toContain('const [workView, setWorkView] = useState<ContractorWorkView>');
    expect(navigationHook).toContain('const [financialsView, setFinancialsView] = useState<ContractorFinancialsView>');
    expect(source).toContain("type ContractorEstimateRecordStatusFilter = 'all' | 'draft' | 'sent' | 'approved' | 'invoiced' | 'closed';");
    expect(source).toContain("type ContractorEstimateRecordSort = 'updated_newest' | 'created_newest' | 'amount_high' | 'amount_low' | 'customer_az';");
    expect(source).toContain('const [contractorEstimateRecordSearch, setContractorEstimateRecordSearch] = useState');
    expect(source).toContain('const [contractorEstimateRecordStatusFilter, setContractorEstimateRecordStatusFilter]');
    expect(source).toContain('const [contractorEstimateRecordSort, setContractorEstimateRecordSort]');
    expect(recordListSource).toContain("const showingEstimates = contractorTab === 'work' || Boolean(focusedEstimateRecord);");
    expect(recordListSource).toContain('const allEstimateRecordsForView = jobsCustomerFilterSubjectId ? selectedJobsCustomerEstimates : estimates;');
    expect(recordListSource).toContain('const allInvoiceRecordsForView = jobsCustomerFilterSubjectId ? selectedJobsCustomerInvoices : invoices;');
    expect(recordListSource).toContain('const visibleEstimateRecords = focusedEstimateRecord ? [focusedEstimateRecord] : showingEstimates ? filteredEstimateRecords : [];');
    expect(recordListSource).toContain('const visibleInvoiceRecords = focusedInvoiceRecord ? [focusedInvoiceRecord] : showingEstimates ? [] : filteredInvoiceRecords;');
    expect(recordListSource).toContain('visibleInvoiceRecords.map(invoice => {');
    expect(recordListSource).toContain('visibleEstimateRecords.map(estimate => {');
    expect(recordListSource).toContain('data-testid="contractor-estimate-search"');
    expect(recordListSource).toContain('data-testid="contractor-invoice-search"');
    expect(recordListSource).toContain('Preview PDF');
    expect(recordListSource).toContain('Download PDF');
    expect(composerSource).toContain("contractorTab === 'work' ? 'New estimate' : 'New invoice'");
    expect(composerSource).toContain("contractorTab === 'work' ? 'Estimate workspace' : 'Invoice workspace'");
    expect(composerSource).toContain('Create estimate');
    expect(composerSource).toContain('Create invoice');
  });
});

test.describe('contractor mutating estimate creation', () => {
  test('creates an E2E estimate draft for a local E2E customer', async ({ page }, testInfo) => {
    requireApprovedSandboxForMutation();

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const estimateTitle = `E2E Test Estimate ${timestamp}`;

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Customers/i);
    await expectActiveTabHeading(page, /^Customers$/i);
    await waitForContractorWorkspaceReady(page);

    const { customerName } = await createLocalE2ECustomer(page, timestamp);
    await openE2ECustomerActionPanel(page, customerName);

    await launchCustomerProfileDraft(page, {
      customerName,
      output: 'estimate',
      title: estimateTitle,
      scope: 'E2E safe estimate draft created by Playwright. No follow-up document, report, upload, or homeowner send action should be performed.',
    });

    await expect(main.getByRole('heading', { name: /^Open Estimates$/i })).toBeVisible();
    await expect(main.getByText(estimateTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(main.getByText(new RegExp(`${escapeRegExp(customerName)}.*Updated`, 'i'))).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });

  test('creates a new local customer from the estimate flow without starting a job', async ({ page }, testInfo) => {
    requireApprovedSandboxForMutation();

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const customerName = `E2E Estimate Customer ${timestamp}`;
    const serviceAddress = `321 Estimate Flow Street ${timestamp}`;

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Jobs/i);
    await expectActiveTabHeading(page, /^Jobs$/i);
    await waitForContractorWorkspaceReady(page);

    await main.getByRole('button', { name: /New Estimate\/Invoice/i }).click();
    await expect(main.getByText(/^Estimate \/ Invoice Workspace$/i)).toBeVisible();

    await main.getByRole('button', { name: /^Create new customer$/i }).click();
    await expect(main.getByText(/Add a customer so you can build an estimate now/i)).toBeVisible();
    await expect(main.getByText(/This creates a contractor-only customer record\. It does not invite the customer or create a ServSync account\./i)).toBeVisible();

    await main.getByRole('button', { name: /^Save customer and continue$/i }).click();
    await expect(main.getByText(/Enter a customer name before saving a new customer/i)).toBeVisible();

    await main.getByLabel(/^Customer name$/i).fill(customerName);
    await main.getByRole('button', { name: /^Save customer and continue$/i }).click();
    await expect(main.getByText(/Enter a service address before saving this customer for an estimate/i)).toBeVisible();

    await main.getByLabel(/^Service address$/i).fill(serviceAddress);
    await main.getByLabel(/^Phone$/i).fill('555-010-3030');
    await main.getByLabel(/^Email$/i).fill(`estimate-customer-${timestamp}@example.com`);
    await main.getByLabel(/^Notes$/i).fill('Created from the estimate flow by E2E.');

    const createContactResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_local_contact'),
      { timeout: 10_000 },
    );
    await main.getByRole('button', { name: /^Save customer and continue$/i }).click();
    const createContactResponse = await createContactResponsePromise;
    expect(createContactResponse.ok()).toBeTruthy();

    await expect(main.getByText(/Customer saved\. Continue building the estimate\./i)).toBeVisible({ timeout: 10_000 });
    await expect(main.getByText(/^Estimate draft$/i)).toBeVisible();
    await expect(main.getByText(/Creating estimate for:/i)).toBeVisible();
    await expect(main.getByText(customerName, { exact: true })).toBeVisible();
    await expect(main.getByTestId('estimate-start-choice')).toBeVisible();
    await expect(main.getByRole('button', { name: /^Build blank estimate\b/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Choose estimate template\b/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Build draft estimator\b/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Save and use customer$/i })).toHaveCount(0);
    await expect(main.getByText(/Service job or checklist report workflow/i)).toHaveCount(0);

    await consoleErrors.assertClean(testInfo);
  });
});
