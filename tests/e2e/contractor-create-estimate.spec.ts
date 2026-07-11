import { expect, test, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import {
  createLocalE2ECustomer,
  escapeRegExp,
  openE2ECustomerActionPanel,
  timestampForRecord,
  waitForContractorWorkspaceReady,
} from './helpers/customers';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const pdfDocumentsSource = () => sourceFile('src/utils/pdfDocuments.ts');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

async function waitForEstimateDraftSave(main: Locator, saveEstimateButton: Locator) {
  const saveError = main.getByText(
    /Unable to save estimate|Add at least one line item|Add a .* title|contractor profile is still loading|ServSync is still connecting/i,
  ).first();

  await Promise.race([
    saveEstimateButton.waitFor({ state: 'hidden', timeout: 30_000 }),
    saveError.waitFor({ state: 'visible', timeout: 30_000 }).then(async () => {
      throw new Error(`Estimate draft save failed: ${(await saveError.textContent())?.trim() || 'unknown error'}`);
    }),
  ]);
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
    const lineSourceSource = sourceBetween(source, 'const renderEstimateLineItemSources =', 'const startEstimateAssistantSpeech =');
    const lineEditorSource = sourceBetween(source, 'const renderStructuredLineDraftEditor =', 'const renderLaborModeButton =');
    const jobsEstimateComposerSource = sourceBetween(source, '{estimateComposerOpen && selectedJobsCustomerName && (', '{invoiceComposerOpen && selectedJobsCustomerName && (');

    expect(source).not.toContain('renderEstimateReferenceTools');
    expect(source).not.toContain('Optional tools');
    expect(lineSourceSource).toContain('Add blank line');
    expect(lineSourceSource).toContain('Add saved item');
    expect(lineSourceSource).toContain('Add from Price Book');
    expect(lineSourceSource).toContain('estimate-line-empty-state');
    expect(lineSourceSource).toContain('addBlankEstimateLineToDraft');
    expect(lineSourceSource).toContain('renderSavedChargeQuickPick()');
    expect(lineSourceSource).toContain('renderPriceBookQuickPick()');
    expect(lineSourceSource).not.toContain('renderEstimateHelperPanel()');
    expect(lineSourceSource).not.toContain('renderSavedEstimateTemplateStartPicker');
    expect(source).toContain('line_items: []');

    expect(lineEditorSource).toContain('compactAdvanced = false');
    expect(lineEditorSource).toContain('More details');
    expect(lineEditorSource).toContain('lineTypeField');
    expect(lineEditorSource).toContain('laborHoursField');
    expect(lineEditorSource).toContain('modelSpecField');
    expect(lineEditorSource).toContain('supplyStatusField');
    expect(lineEditorSource).toContain('Source note');
    expect(jobsEstimateComposerSource).toContain('compactAdvanced: true');
    expect(jobsEstimateComposerSource).toContain('renderEstimateLineItemSources()');
    expect(jobsEstimateComposerSource).toContain('renderEstimateLineItemSources({ empty: true })');
    expect(jobsEstimateComposerSource).toContain('Back to estimate options');
    expect(jobsEstimateComposerSource).toContain('Discard draft');
    expect(jobsEstimateComposerSource.indexOf('estimateDraft.line_items.map')).toBeLessThan(jobsEstimateComposerSource.indexOf('renderEstimateLineItemSources()'));
  });

  test('contractor draft estimates include a structured payment schedule editor without invoice generation', () => {
    const source = appSource();
    const pdfSource = pdfDocumentsSource();
    const scheduleSource = sourceBetween(source, 'const renderEstimatePaymentScheduleEditor =', 'const renderInvoiceDraftTotals =');
    const saveSource = sourceBetween(source, 'const saveEstimateDraft = async', 'const saveInvoiceDraft = async');
    const jobsEstimateComposerSource = sourceBetween(source, '{estimateComposerOpen && selectedJobsCustomerName && (', '{invoiceComposerOpen && selectedJobsCustomerName && (');

    expect(scheduleSource).toContain('Payment schedule');
    expect(scheduleSource).toContain('Use this to plan billing for the estimate. Customer-facing display and invoice generation will be added in a later step.');
    expect(scheduleSource).toContain('Full invoice on completion');
    expect(scheduleSource).toContain('Deposit + final');
    expect(scheduleSource).toContain('Custom schedule');
    expect(scheduleSource).toContain('No payment schedule rows are saved unless you choose Deposit + final or Custom schedule.');
    expect(source).toContain('Payment schedule total does not match the estimate total. Review before sending.');
    expect(source).toContain('Payment schedule is above the estimate total. Review before saving or sending.');
    expect(scheduleSource).toContain('Add payment');
    expect(source).toContain('Payment schedule label');
    expect(source).toContain('Payment schedule due trigger');
    expect(scheduleSource).toContain('estimate-payment-schedule-section');
    expect(scheduleSource).not.toContain('linked_invoice_id');

    expect(source).toContain("type EstimatePaymentScheduleMode = 'default' | 'deposit_final' | 'custom';");
    expect(source).toContain('function estimatePaymentScheduleCalculatedCents');
    expect(source).toContain("row.amount_type === 'percentage'");
    expect(source).toContain("invoice_type: 'deposit'");
    expect(source).toContain("invoice_type: 'final'");
    expect(source).toContain('Math.max(0, estimateTotalCents - depositCents)');
    expect(source).toContain('ESTIMATE_PAYMENT_SCHEDULE_TYPE_DEFAULTS');
    expect(source).toContain("total: {\n    label: 'Full payment',\n    dueTrigger: 'Due on completion'");
    expect(source).toContain("deposit: {\n    label: 'Deposit',\n    dueTrigger: 'Due on approval'");
    expect(source).toContain("progress: {\n    label: 'Progress payment',\n    dueTrigger: 'Due at milestone'");
    expect(source).toContain("final: {\n    label: 'Final payment',\n    dueTrigger: 'Due on completion'");
    expect(source).toContain('const updateEstimatePaymentScheduleRowType =');
    expect(source).toContain('label: defaults.label');
    expect(source).toContain('due_trigger: defaults.dueTrigger');
    expect(source).toContain('onChange={event => updateEstimatePaymentScheduleRowType(row.id, event.target.value as EstimatePaymentScheduleInvoiceType)}');
    expect(source).toContain('onChange={event => updateEstimatePaymentScheduleRow(row.id, { label: event.target.value })}');
    expect(source).toContain('onChange={event => updateEstimatePaymentScheduleRow(row.id, { due_trigger: event.target.value })}');
    expect(source).toContain('estimatePaymentScheduleDraftFromEstimate(estimate)');

    expect(source).toContain("if (!estimatePaymentScheduleDraft.explicit) return { rows: [], error: '' };");
    expect(saveSource).toContain(".from('estimate_payment_schedule_items')");
    expect(saveSource).toContain('.delete()');
    expect(saveSource).toContain('.insert(scheduleForSave.rows.map(row => ({');
    expect(source).toContain('linked_invoice_id: null');
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
    const saveSource = sourceBetween(source, 'const saveEstimateDraft = async', 'const saveInvoiceDraft = async');

    expect(saveSource).toContain('const focusSavedEstimateActions = (estimate: Estimate) => {');
    expect(saveSource).toContain("setContractorFinancialRecordKind('estimates');");
    expect(saveSource).toContain('setJobsCustomerFilterSubjectId(connection?.connection_id ?? (local ? `local:${local.id}` : jobsCustomerFilterSubjectId));');
    expect(saveSource).toContain('setFocusedEstimateRecordId(estimate.id);');
    expect(saveSource).toContain("setContractorJobsView(['declined', 'expired', 'revised'].includes(estimate.status) ? 'closed_financial' : 'open_financial');");
    expect(saveSource).toContain('focusSavedEstimateActions(savedEstimate);');
    expect(saveSource).not.toContain('if (!currentEditingEstimateId) focusSavedEstimateActions(savedEstimate);');
  });

  test('Jobs financial records split estimates and invoices behind section tabs', () => {
    const source = appSource();
    const financialListSource = sourceBetween(
      source,
      "(contractorJobsView === 'open_financial' || contractorJobsView === 'closed_financial') && (",
      "(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (",
    );
    const newFinancialSource = sourceBetween(
      source,
      "{contractorJobsView === 'new_financial' && (",
      "{(contractorJobsView === 'open_financial' || contractorJobsView === 'closed_financial') && (",
    );

    expect(source).toContain("type ContractorFinancialRecordKind = 'estimates' | 'invoices';");
    expect(source).toContain("const [contractorFinancialRecordKind, setContractorFinancialRecordKind] = useState<ContractorFinancialRecordKind>('estimates');");
    expect(source).toContain("type ContractorEstimateRecordStatusFilter = 'all' | 'draft' | 'sent' | 'approved' | 'invoiced' | 'closed';");
    expect(source).toContain("type ContractorEstimateRecordSort = 'updated_newest' | 'created_newest' | 'amount_high' | 'amount_low' | 'customer_az';");
    expect(source).toContain('const [contractorEstimateRecordSearch, setContractorEstimateRecordSearch] = useState');
    expect(source).toContain('const [contractorEstimateRecordStatusFilter, setContractorEstimateRecordStatusFilter]');
    expect(source).toContain('const [contractorEstimateRecordSort, setContractorEstimateRecordSort]');
    expect(financialListSource).toContain("const showingEstimates = contractorFinancialRecordKind === 'estimates' || Boolean(focusedEstimateRecord);");
    expect(financialListSource).toContain('const estimateRecordsForView = jobsCustomerFilterSubjectId ? selectedJobsCustomerEstimates : estimates;');
    expect(financialListSource).toContain('const filteredEstimateRecords = estimateRecordsForView');
    expect(financialListSource).toContain('.filter(estimate => estimateMatchesSearch(estimate) && estimateMatchesStatus(estimate))');
    expect(financialListSource).toContain('const visibleEstimateRecords = focusedEstimateRecord ? [focusedEstimateRecord] : showingEstimates ? filteredEstimateRecords : [];');
    expect(financialListSource).toContain('const visibleInvoiceRecords = showingEstimates ? [] : filteredInvoiceRecords;');
    expect(financialListSource).toContain('visibleInvoiceRecords.map(invoice => {');
    expect(financialListSource).toContain('visibleEstimateRecords.map(estimate => {');
    expect(financialListSource).toContain('New estimate');
    expect(financialListSource).toContain('New invoice');
    expect(financialListSource).toContain('data-testid={showingEstimates ? \'contractor-estimate-list-controls\' : \'contractor-invoice-list-controls\'}');
    expect(financialListSource).toContain('data-testid="contractor-estimate-search"');
    expect(financialListSource).toContain('aria-label="Search estimates"');
    expect(financialListSource).toContain('data-testid="contractor-estimate-status-filter"');
    expect(financialListSource).toContain('<option value="all">All</option>');
    expect(financialListSource).toContain('<option value="draft">Draft</option>');
    expect(financialListSource).toContain('<option value="sent">Sent</option>');
    expect(financialListSource).toContain('<option value="approved">Approved</option>');
    expect(financialListSource).toContain('<option value="invoiced">Invoiced</option>');
    expect(financialListSource).toContain('<option value="closed">Closed</option>');
    expect(financialListSource).toContain('contractorEstimateRecordStatusFilter === \'invoiced\'');
    expect(financialListSource).toContain("invoices.some(invoice => invoice.estimate_id === estimate.id && invoice.status !== 'void')");
    expect(financialListSource).toContain("contractorEstimateRecordStatusFilter === 'closed'");
    expect(financialListSource).toContain("['declined', 'expired', 'revised'].includes(estimate.status)");
    expect(financialListSource).toContain('data-testid="contractor-estimate-sort"');
    expect(financialListSource).toContain('<option value="updated_newest">Updated newest</option>');
    expect(financialListSource).toContain('<option value="created_newest">Created newest</option>');
    expect(financialListSource).toContain('<option value="amount_high">Amount high</option>');
    expect(financialListSource).toContain('<option value="amount_low">Amount low</option>');
    expect(financialListSource).toContain('<option value="customer_az">Customer A-Z</option>');
    expect(financialListSource).toContain('estimateCustomerSearchText(estimate)');
    expect(financialListSource).toContain('recordPropertyLabelForContractor(estimate)');
    expect(financialListSource).toContain('estimate.title');
    expect(financialListSource).toContain('estimate.scope');
    expect(newFinancialSource).toContain("contractorFinancialRecordKind === 'estimates' ? 'New estimate' : 'New invoice'");
    expect(newFinancialSource).toContain("contractorFinancialRecordKind === 'estimates' ? 'Estimate workspace' : 'Invoice workspace'");
    expect(newFinancialSource).toContain("contractorFinancialRecordKind === 'estimates' && (");
    expect(newFinancialSource).toContain('Create estimate');
    expect(newFinancialSource).toContain('Create invoice');
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
    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);
    await waitForContractorWorkspaceReady(page);

    const { customerName } = await createLocalE2ECustomer(page, timestamp);
    await openE2ECustomerActionPanel(page, customerName);

    await main.getByRole('button', { name: /^Create estimate\b/i }).click();
    await expectActiveTabHeading(page, /^Jobs$/i);
    await expect(main.getByText(/^Estimate draft$/i)).toBeVisible();
    await expect(main.getByText(/Creating estimate for:/i)).toBeVisible();
    await expect(main.getByText(customerName, { exact: true })).toBeVisible();
    await expect(main.getByTestId('estimate-start-choice')).toBeVisible();
    await expect(main.getByRole('button', { name: /^Build blank estimate\b/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Choose estimate template\b/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Build draft estimator\b/i })).toBeVisible();
    await main.getByRole('button', { name: /^Build blank estimate\b/i }).click();
    await expect(main.getByRole('button', { name: /^Back to estimate options$/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Discard draft$/i }).first()).toBeVisible();
    await expect(main.getByRole('button', { name: /^Create new customer$/i })).toHaveCount(0);
    await expect(main.getByRole('button', { name: /^Create estimate$/i })).toHaveCount(0);
    await expect(main.getByRole('button', { name: /^Create invoice$/i })).toHaveCount(0);
    await expect(main.getByTestId('estimate-line-empty-state')).toBeVisible();
    await expect(main.getByRole('textbox', { name: /^Estimate line item 1 description$/i })).toHaveCount(0);
    await expect(main.getByRole('button', { name: /^Add blank line$/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Add saved item$/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Add from Price Book$/i })).toBeVisible();

    await main.getByRole('button', { name: /^Add blank line$/i }).click();
    const lineDescriptionField = main.getByRole('textbox', { name: /^Estimate line item 1 description$/i });
    await expect(lineDescriptionField).toBeVisible();
    await expect(lineDescriptionField).toBeFocused();
    const addBlankLineButton = main.getByRole('button', { name: /^Add blank line$/i });
    const lineBox = await lineDescriptionField.boundingBox();
    const addBox = await addBlankLineButton.boundingBox();
    expect(lineBox, 'line item description should have a visible bounding box').not.toBeNull();
    expect(addBox, 'add controls should have a visible bounding box').not.toBeNull();
    expect(addBox!.y).toBeGreaterThan(lineBox!.y);

    const estimateTitleField = main.getByRole('textbox', { name: /^Estimate title$/i });
    const scopeField = main.getByRole('textbox', { name: /^Scope of work$/i });
    const lineQuantityField = main.getByRole('spinbutton', { name: /^Estimate line item 1 quantity$/i });
    const lineUnitPriceField = main.getByRole('textbox', { name: /^Estimate line item 1 unit price$/i });

    await estimateTitleField.fill(estimateTitle);
    await scopeField.fill('E2E safe estimate draft created by Playwright. No follow-up document, report, upload, or homeowner send action should be performed.');
    await lineDescriptionField.fill(estimateTitle);
    await lineQuantityField.fill('1');
    await lineUnitPriceField.fill('123');

    await expect(estimateTitleField).toHaveValue(estimateTitle);
    await expect(lineDescriptionField).toHaveValue(estimateTitle);

    const saveEstimateButton = main.getByRole('button', { name: /^Save estimate draft$/i });
    await expect(saveEstimateButton).toBeEnabled();
    await saveEstimateButton.click();
    await waitForEstimateDraftSave(main, saveEstimateButton);

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
