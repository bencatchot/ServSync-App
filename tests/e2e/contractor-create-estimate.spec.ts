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
    const templateStartSource = sourceBetween(source, 'const applySavedEstimateTemplateStart =', 'const applySavedEstimateTemplateInvoiceDraft =');

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

  test('optional accelerators stay collapsed and estimate line advanced fields use More details', () => {
    const source = appSource();
    const optionalToolsSource = sourceBetween(source, 'const renderEstimateReferenceTools =', 'const startEstimateAssistantSpeech =');
    const lineEditorSource = sourceBetween(source, 'const renderStructuredLineDraftEditor =', 'const renderLaborModeButton =');
    const jobsEstimateComposerSource = sourceBetween(source, 'Estimate / Invoice Workspace', '{invoiceComposerOpen && selectedJobsCustomerName && (');

    expect(optionalToolsSource).toContain('Optional tools');
    expect(optionalToolsSource).toContain('Show optional tools');
    expect(optionalToolsSource).toContain('renderSavedChargeQuickPick()');
    expect(optionalToolsSource).toContain('renderPriceBookQuickPick()');
    expect(optionalToolsSource).toContain('renderEstimateHelperPanel()');

    expect(lineEditorSource).toContain('compactAdvanced = false');
    expect(lineEditorSource).toContain('More details');
    expect(lineEditorSource).toContain('lineTypeField');
    expect(lineEditorSource).toContain('laborHoursField');
    expect(lineEditorSource).toContain('modelSpecField');
    expect(lineEditorSource).toContain('supplyStatusField');
    expect(lineEditorSource).toContain('Source note');
    expect(jobsEstimateComposerSource).toContain('compactAdvanced: true');
    expect(jobsEstimateComposerSource).not.toContain('{renderSavedChargeQuickPick()}');
    expect(jobsEstimateComposerSource).not.toContain('renderPriceBookQuickPick()}');
    expect(jobsEstimateComposerSource).not.toContain('renderEstimateHelperPanel()}');
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
    await expect(main.getByRole('button', { name: /^Build blank estimate$/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Choose estimate template$/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Build draft estimator$/i })).toBeVisible();
    await main.getByRole('button', { name: /^Build blank estimate$/i }).click();

    const estimateTitleField = main.getByRole('textbox', { name: /^Estimate title$/i });
    const scopeField = main.getByRole('textbox', { name: /^Scope of work$/i });
    const lineDescriptionField = main.getByRole('textbox', { name: /^Estimate line item 1 description$/i });
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

    await expect(main.getByRole('heading', { name: /^Open estimates and invoices$/i })).toBeVisible();
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
    await expect(main.getByRole('button', { name: /^Build blank estimate$/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Choose estimate template$/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Build draft estimator$/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Save and use customer$/i })).toHaveCount(0);
    await expect(main.getByText(/Service job or checklist report workflow/i)).toHaveCount(0);

    await consoleErrors.assertClean(testInfo);
  });
});
