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

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

async function waitForInvoiceDraftSave(main: Locator, saveInvoiceButton: Locator) {
  const saveError = main.getByText(
    /Unable to save invoice draft|Add at least one line item|Add an invoice title|contractor profile is still loading|ServSync is still connecting/i,
  ).first();

  await Promise.race([
    saveInvoiceButton.waitFor({ state: 'hidden', timeout: 30_000 }),
    saveError.waitFor({ state: 'visible', timeout: 30_000 }).then(async () => {
      throw new Error(`Invoice draft save failed: ${(await saveError.textContent())?.trim() || 'unknown error'}`);
    }),
  ]);
}

test.describe('contractor estimate-to-invoice draft source', () => {
  test('saved estimate actions open an invoice type chooser without the accepted-only RPC', () => {
    const source = appSource();
    const directDraftSource = sourceBetween(source, 'const beginInvoiceDraftFromEstimate =', 'const createInvoiceFromJob =');
    const selectedWorkspaceEstimateCards = sourceBetween(
      source,
      'selectedDocumentSection.estimates.map(estimate => {',
      "{estimate.status === 'sent' && (",
    );
    const focusedEstimateCards = sourceBetween(
      source,
      'visibleEstimateRecords.map(estimate => {',
      "{estimate.status === 'sent' && (",
    );

    expect(source).toContain('Create invoice from estimate');
    expect(selectedWorkspaceEstimateCards).toContain("['draft', 'sent', 'accepted'].includes(estimate.status)");
    expect(focusedEstimateCards).toContain("!isInvoice && ['draft', 'sent', 'accepted'].includes(estimate.status)");
    expect(selectedWorkspaceEstimateCards).toContain('beginInvoiceDraftFromEstimate(estimate, headerName)');
    expect(focusedEstimateCards).toContain('beginInvoiceDraftFromEstimate(estimate, customerName)');
    expect(selectedWorkspaceEstimateCards).toContain('linkedInvoicesForEstimate(invoices, estimate.id)');
    expect(focusedEstimateCards).toContain('linkedInvoicesForEstimate(invoices, estimate.id)');
    expect(selectedWorkspaceEstimateCards).toContain('renderEstimateLinkedInvoiceSummary(estimate)');
    expect(focusedEstimateCards).toContain('renderEstimateLinkedInvoiceSummary(estimate)');
    expect(selectedWorkspaceEstimateCards).not.toContain('Invoice created');
    expect(focusedEstimateCards).not.toContain('Invoice created');

    expect(directDraftSource).toContain('setInvoiceTypeChooser({ estimateId: estimate.id, subjectName: subjectName || \'Customer\' })');
    expect(directDraftSource).toContain('const startInvoiceDraftFromEstimate =');
    expect(directDraftSource).toContain('const linkedInvoices = linkedInvoicesForEstimate(invoices, estimate.id)');
    expect(directDraftSource).toContain('beginInvoiceDraftForCustomer(subjectName || \'Customer\', {');
    expect(directDraftSource).toContain('sourceEstimate: estimate');
    expect(directDraftSource).toContain('invoiceType,');
    expect(directDraftSource).toContain('invoiceSequence: nextInvoiceSequenceForLinkedInvoices(linkedInvoices)');
    expect(directDraftSource).toContain('`${invoiceTypeLabel(invoiceType)} draft started from this estimate. Review it before saving or sending.`');
    expect(directDraftSource).not.toContain('const existingInvoice = invoices.find(invoice => invoice.estimate_id === estimate.id');
    expect(directDraftSource).not.toContain('openInvoiceRecord(existingInvoice)');
    expect(directDraftSource).not.toContain('servsync_create_invoice_from_estimate');
    expect(directDraftSource).not.toContain('createJobFromAcceptedEstimate');
    expect(directDraftSource).not.toContain('startNewInspection');
    expect(directDraftSource).not.toContain('saveInvoiceDraft');
    expect(directDraftSource).not.toContain('sendInvoiceToHomeowner');
  });

  test('multiple linked invoices render summaries while void invoices are excluded', () => {
    const source = appSource();
    const helperSource = sourceBetween(source, 'function linkedInvoicesForEstimate', 'function linkedInvoiceTotalCents');
    const summarySource = sourceBetween(source, 'const renderEstimateLinkedInvoiceSummary =', 'const openEstimateRecord =');

    expect(helperSource).toContain("invoice.estimate_id === estimateId && invoice.status !== 'void'");
    expect(summarySource).toContain('Invoices linked');
    expect(summarySource).toContain('Totals include draft invoices. Void invoices are excluded.');
    expect(summarySource).toContain('Estimate total');
    expect(summarySource).toContain('Linked invoice total');
    expect(summarySource).toContain('Remaining');
    expect(summarySource).toContain('invoiceTypeLabel(invoice.invoice_type)');
    expect(summarySource).toContain('invoiceStatusLabel(invoice.status)');
    expect(summarySource).toContain('Open invoice');
  });

  test('invoice type chooser and save payload preserve selected type and sequence', () => {
    const source = appSource();
    const chooserSource = sourceBetween(source, '{invoiceTypeChooser && (() => {', '{saveEstimateTemplateModal && (');
    const choicesSource = sourceBetween(source, 'const INVOICE_TYPE_CHOICES', 'const LINKED_INVOICE_REMAINING_STATUSES');
    const beginDraftSource = sourceBetween(source, 'const beginInvoiceDraftForCustomer =', 'const defaultEstimateDraftBuilderTrade =');
    const saveInvoiceSource = sourceBetween(source, 'const invoicePayload = {', 'const { data: invoiceData, error: invoiceError }');

    for (const label of ['Total invoice', 'Deposit invoice', 'Progress invoice', 'Final invoice']) {
      expect(choicesSource).toContain(label);
    }
    expect(chooserSource).toContain('Create invoice from estimate');
    expect(chooserSource).toContain('Choose the invoice type to start an editable draft.');
    expect(chooserSource).toContain('Totals include draft invoices. Void invoices are excluded.');
    expect(chooserSource).toContain('{choice.label}');
    expect(chooserSource).toContain('{choice.helper}');
    expect(chooserSource).toContain('startInvoiceDraftFromEstimate(estimate, invoiceTypeChooser.subjectName, choice.type)');
    expect(beginDraftSource).toContain("invoice_type: options.invoiceType ?? 'total'");
    expect(beginDraftSource).toContain('invoice_sequence: options.invoiceSequence ?? null');
    expect(beginDraftSource).toContain("title: options.invoiceTitle ?? invoiceTitleFromEstimate(options.sourceEstimate, options.invoiceType ?? 'total')");
    expect(saveInvoiceSource).toContain('invoice_type: invoiceDraft.invoice_type');
    expect(saveInvoiceSource).toContain('invoice_sequence: invoiceDraft.invoice_sequence');
  });

  test('deposit invoices ask for amount and seed one deposit line instead of all estimate lines', () => {
    const source = appSource();
    const depositHelpersSource = sourceBetween(source, 'function depositInvoicePreviewCents', 'function linkedInvoicesForEstimate');
    const directDraftSource = sourceBetween(source, 'const beginInvoiceDraftFromEstimate =', 'const createInvoiceFromJob =');
    const beginDraftSource = sourceBetween(source, 'const beginInvoiceDraftForCustomer =', 'const defaultEstimateDraftBuilderTrade =');
    const depositModalSource = sourceBetween(source, '{invoiceDepositChooser && (() => {', '{saveEstimateTemplateModal && (');

    expect(directDraftSource).toContain("if (invoiceType === 'deposit')");
    expect(directDraftSource).toContain('setInvoiceDepositChooser({');
    expect(depositModalSource).toContain('Deposit invoice amount');
    expect(depositModalSource).toContain('Choose a dollar amount or percentage before creating the deposit invoice draft.');
    expect(depositModalSource).toContain('Deposit dollar amount');
    expect(depositModalSource).toContain('Deposit percentage');
    expect(depositModalSource).toContain('Deposit total');
    expect(depositModalSource).toContain('Create deposit invoice draft');

    expect(depositHelpersSource).toContain("chooser.mode === 'amount'");
    expect(depositHelpersSource).toContain('dollarsToCents(chooser.amount)');
    expect(depositHelpersSource).toContain('Math.round(estimateTotalCents * percent / 100)');
    expect(depositHelpersSource).toContain('function depositInvoiceLineForEstimate');
    expect(depositHelpersSource).toContain('Deposit for estimate');
    expect(depositHelpersSource).toContain("unit: 'deposit'");

    expect(directDraftSource).toContain('const startDepositInvoiceDraftFromEstimate =');
    expect(directDraftSource).toContain("invoiceType: 'deposit'");
    expect(directDraftSource).toContain("invoiceTitle: invoiceTitleFromEstimate(estimate, 'deposit')");
    expect(directDraftSource).toContain('invoiceLineItems: [depositInvoiceLineForEstimate(estimate, depositCents)]');
    expect(beginDraftSource).toContain('line_items: options.invoiceLineItems ?? (options.sourceEstimate?.line_items?.length');
  });

  test('invoice composer shows remaining summary and warning without blocking save', () => {
    const source = appSource();
    const invoiceStateSource = sourceBetween(source, 'const activeInvoiceEstimate =', 'const groupedWorkItemsForJob =');
    const invoiceTotalsSource = sourceBetween(source, 'const renderInvoiceDraftTotals = () => {', 'const renderSavedChargeQuickPick =');

    expect(invoiceStateSource).toContain('linkedInvoicesForEstimate(invoices, activeInvoiceEstimate.id).filter(invoice => invoice.id !== editingInvoiceId)');
    expect(invoiceStateSource).toContain('const activeInvoiceProjectedTotalCents = activeInvoiceLinkedTotalCents + activeInvoiceDraftTotalCents');
    expect(invoiceTotalsSource).toContain('Estimate invoice summary');
    expect(invoiceTotalsSource).toContain('Totals include draft invoices. Void invoices are excluded.');
    expect(invoiceTotalsSource).toContain('Projected linked total');
    expect(invoiceTotalsSource).toContain('This would bring linked invoices above the estimate total. Review before saving or sending.');
    expect(invoiceTotalsSource).not.toContain('disabled={activeInvoiceOverEstimate}');
    expect(invoiceTotalsSource).not.toContain('return null');
  });

  test('invoice composer seed copies supported estimate context and line items', () => {
    const source = appSource();
    const titleHelperSource = sourceBetween(source, 'function invoiceTitleFromEstimate', 'function estimateDocumentLabel');
    const beginDraftSource = sourceBetween(source, 'const beginInvoiceDraftForCustomer =', 'const defaultEstimateDraftBuilderTrade =');
    const directDraftSource = sourceBetween(source, 'const beginInvoiceDraftFromEstimate =', 'const createInvoiceFromJob =');

    expect(titleHelperSource).toContain('const prefix = invoiceType === \'total\' ? \'Invoice\' : invoiceTypeLabel(invoiceType)');
    expect(beginDraftSource).toContain("title: options.invoiceTitle ?? invoiceTitleFromEstimate(options.sourceEstimate, options.invoiceType ?? 'total')");
    expect(beginDraftSource).toContain('notes: options.invoiceNotes ?? (options.sourceEstimate.notes ||');
    expect(beginDraftSource).toContain('terms: options.sourceEstimate.terms ||');
    expect(beginDraftSource).toContain('service_request_id: options.serviceRequestId ?? options.sourceEstimate?.service_request_id');
    expect(beginDraftSource).toContain('job_id: options.jobId ?? options.sourceEstimate?.inspection_id');
    expect(beginDraftSource).toContain('estimate_id: options.estimateId ?? options.sourceEstimate?.id');
    expect(beginDraftSource).toContain('home_id: options.homeId ?? options.sourceEstimate?.home_id');
    expect(beginDraftSource).toContain('local_home_id: options.localHomeId ?? options.sourceEstimate?.local_home_id');
    expect(beginDraftSource).toContain('scope: options.invoiceScope ?? (options.sourceEstimate?.scope');
    expect(beginDraftSource).toContain('labor_mode: normalizeEstimateLaborMode(options.sourceEstimate?.labor_mode)');
    expect(beginDraftSource).toContain('labor_rate: laborRateInputFromCents(options.sourceEstimate?.labor_rate_cents');
    expect(beginDraftSource).toContain('job_labor_hours: laborHoursInputFromValue(options.sourceEstimate?.job_labor_hours)');
    expect(beginDraftSource).toContain('line_items: options.invoiceLineItems ?? (options.sourceEstimate?.line_items?.length');
    expect(beginDraftSource).toContain('[...options.sourceEstimate.line_items]');
    expect(beginDraftSource).toContain('.sort((a, b) => a.sort_order - b.sort_order)');
    expect(beginDraftSource).toContain('line_title: line.line_title || line.description ||');
    expect(beginDraftSource).toContain('customer_description: line.customer_description ||');
    expect(beginDraftSource).toContain('model_spec: line.model_spec ||');
    expect(beginDraftSource).toContain('supply_status: normalizeEstimateLineSupplyStatus(line.supply_status)');
    expect(beginDraftSource).toContain('quantity: String(line.quantity)');
    expect(beginDraftSource).toContain('unit: line.unit');
    expect(beginDraftSource).toContain('unit_price: lineUnitPriceInputFromCents(line.unit_price_cents)');
    expect(beginDraftSource).toContain('labor_hours: laborHoursInputFromValue(line.labor_hours)');
    expect(directDraftSource).toContain('beginInvoiceDraftForCustomer(subjectName || \'Customer\', {');
    expect(directDraftSource).toContain('sourceEstimate: estimate');
    expect(directDraftSource).toContain('invoiceType,');
  });

  test('invoice list uses contractor-facing section copy', () => {
    const source = appSource();

    expect(source).not.toContain('First-class invoices');
    expect(source).not.toContain('FIRST-CLASS INVOICES');
    expect(source).toContain('>INVOICES</p>');
    expect(source).toContain('invoice{visibleInvoiceRecords.length === 1 ?');
  });

  test('invoice-from-estimate composer does not show a sending state before an explicit send', () => {
    const source = appSource();
    const invoiceStateSource = sourceBetween(source, 'const activeInvoiceDraftRecord =', 'const connectedHomesForPropertyLabels =');
    const invoiceComposerActionsSource = sourceBetween(
      source,
      'disabled={savingInvoice || invoiceDraftSendInProgress',
      '{invoiceDraft.job_id && (',
    );

    expect(invoiceStateSource).toContain('const invoiceDraftSendInProgress = Boolean(updatingInvoiceId && (!editingInvoiceId || updatingInvoiceId === editingInvoiceId))');
    expect(invoiceComposerActionsSource).toContain('|| !invoiceDraftCanSendToHomeowner || sendInvoiceCapability.disabled}');
    expect(invoiceComposerActionsSource).toContain('{invoiceDraftSendInProgress');
    expect(invoiceComposerActionsSource).toContain("? 'Sending...'");
    expect(invoiceComposerActionsSource).toContain("? 'Save Invoice and Send to Homeowner'");
    expect(invoiceComposerActionsSource).not.toContain('savingInvoice || updatingInvoiceId === editingInvoiceId');
    expect(invoiceComposerActionsSource).not.toContain("savingInvoice ? 'Sending...'");
  });
});

test.describe('contractor mutating invoice creation', () => {
  test('creates an E2E invoice draft for a local E2E customer', async ({ page }, testInfo) => {
    requireApprovedSandboxForMutation();

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const invoiceTitle = `E2E Test Invoice ${timestamp}`;

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);
    await waitForContractorWorkspaceReady(page);

    const { customerName } = await createLocalE2ECustomer(page, timestamp);
    await openE2ECustomerActionPanel(page, customerName);

    await main.getByRole('button', { name: /^Create invoice\b/i }).click();
    await expectActiveTabHeading(page, /^Jobs$/i);
    await expect(main.getByRole('heading', { name: /^Invoice draft$/i })).toBeVisible();
    await expect(
      main.locator('p').filter({
        hasText: new RegExp(`^(?:Creating invoice for:\\s*)?${escapeRegExp(customerName)}(?:\\s*·.*)?$`, 'i'),
      }).first(),
    ).toBeVisible();

    const invoiceTitleField = main.getByRole('textbox', { name: /^Invoice title$/i });
    const scopeField = main.getByRole('textbox', { name: /^(Invoice scope|Scope)$/i });
    const lineDescriptionField = main.getByRole('textbox', { name: /^(Invoice line item 1 description|Description)$/i });
    const lineQuantityField = main.getByRole('spinbutton', { name: /^(Invoice line item 1 quantity|Qty)$/i });
    const lineUnitPriceField = main.getByRole('textbox', { name: /^(Invoice line item 1 unit price|Unit price)$/i });

    await invoiceTitleField.fill(invoiceTitle);
    await scopeField.fill('E2E safe invoice draft created by Playwright. No send, payment, report, upload, or status change should be performed.');
    await lineDescriptionField.fill(invoiceTitle);
    await lineQuantityField.fill('1');
    await lineUnitPriceField.fill('123');

    await expect(invoiceTitleField).toHaveValue(invoiceTitle);
    await expect(lineDescriptionField).toHaveValue(invoiceTitle);

    const saveInvoiceButton = main.getByRole('button', { name: /^Save Invoice$/i });
    await expect(saveInvoiceButton).toBeEnabled();
    await saveInvoiceButton.click();
    await waitForInvoiceDraftSave(main, saveInvoiceButton);

    await expect(main.getByRole('heading', { name: /^Open estimates and invoices$/i })).toBeVisible();
    await expect(main.getByText(invoiceTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(main.getByText(new RegExp(`${escapeRegExp(customerName)}.*Updated`, 'i'))).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });
});
