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
  test('saved estimate actions can open an editable invoice draft without the accepted-only RPC', () => {
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
    expect(selectedWorkspaceEstimateCards).toContain('Invoice created');
    expect(focusedEstimateCards).toContain('Invoice created');

    expect(directDraftSource).toContain('const existingInvoice = invoices.find(invoice => invoice.estimate_id === estimate.id && invoice.status !== \'void\')');
    expect(directDraftSource).toContain('openInvoiceRecord(existingInvoice)');
    expect(directDraftSource).toContain('beginInvoiceDraftForCustomer(subjectName || \'Customer\', {');
    expect(directDraftSource).toContain('sourceEstimate: estimate');
    expect(directDraftSource).toContain('Invoice draft started from this estimate. Review it before saving or sending.');
    expect(directDraftSource).not.toContain('servsync_create_invoice_from_estimate');
    expect(directDraftSource).not.toContain('createJobFromAcceptedEstimate');
    expect(directDraftSource).not.toContain('startNewInspection');
    expect(directDraftSource).not.toContain('saveInvoiceDraft');
    expect(directDraftSource).not.toContain('sendInvoiceToHomeowner');
  });

  test('invoice composer seed copies supported estimate context and line items', () => {
    const source = appSource();
    const titleHelperSource = sourceBetween(source, 'function invoiceTitleFromEstimate', 'function estimateDocumentLabel');
    const beginDraftSource = sourceBetween(source, 'const beginInvoiceDraftForCustomer =', 'const defaultEstimateDraftBuilderTrade =');

    expect(titleHelperSource).toContain('Invoice — ${estimateTitle}');
    expect(beginDraftSource).toContain('title: invoiceTitleFromEstimate(options.sourceEstimate)');
    expect(beginDraftSource).toContain('notes: options.sourceEstimate.notes ||');
    expect(beginDraftSource).toContain('terms: options.sourceEstimate.terms ||');
    expect(beginDraftSource).toContain('service_request_id: options.serviceRequestId ?? options.sourceEstimate?.service_request_id');
    expect(beginDraftSource).toContain('job_id: options.jobId ?? options.sourceEstimate?.inspection_id');
    expect(beginDraftSource).toContain('estimate_id: options.estimateId ?? options.sourceEstimate?.id');
    expect(beginDraftSource).toContain('home_id: options.homeId ?? options.sourceEstimate?.home_id');
    expect(beginDraftSource).toContain('local_home_id: options.localHomeId ?? options.sourceEstimate?.local_home_id');
    expect(beginDraftSource).toContain('scope: options.sourceEstimate?.scope');
    expect(beginDraftSource).toContain('labor_mode: normalizeEstimateLaborMode(options.sourceEstimate?.labor_mode)');
    expect(beginDraftSource).toContain('labor_rate: laborRateInputFromCents(options.sourceEstimate?.labor_rate_cents');
    expect(beginDraftSource).toContain('job_labor_hours: laborHoursInputFromValue(options.sourceEstimate?.job_labor_hours)');
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
