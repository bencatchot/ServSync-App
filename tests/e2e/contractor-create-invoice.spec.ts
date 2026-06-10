import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { requireApprovedSandboxForMutation } from './helpers/guards';

function timestampForRecord() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForContractorWorkspaceReady(page: Page) {
  await expect(page.getByRole('main').getByText(/Loading contractor workspace/i)).toBeHidden({ timeout: 30_000 });
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

async function createLocalE2ECustomer(page: Page, timestamp: string) {
  const main = page.getByRole('main');
  const customerName = `E2E Test Customer ${timestamp}`;
  const customerEmail = `e2e-customer-${timestamp}@example.com`;

  await main.getByRole('button', { name: /^Add$/i }).click();
  await expect(main.getByRole('heading', { name: /^Add new customer$/i })).toBeVisible();

  await main.getByPlaceholder(/e\.g\. Becky Thomas/i).fill(customerName);
  await main.getByPlaceholder(/\(555\) 555-5555/i).fill('555-010-1234');
  await main.getByPlaceholder(/customer@example\.com/i).fill(customerEmail);
  await main.getByPlaceholder(/^Main home$/i).fill(`E2E Test Property ${timestamp}`);
  await main.getByPlaceholder(/^Street address$/i).fill('123 E2E Test Street');
  await main.getByLabel(/^City$/i).fill('Testville');
  await main.getByPlaceholder(/Start typing a state/i).fill('AL');
  await main.getByLabel(/^ZIP$/i).fill('36532');
  await main.getByPlaceholder(/^Single family$/i).fill('Single family');

  await expect(main.getByPlaceholder(/e\.g\. Becky Thomas/i)).toHaveValue(customerName);
  await expect(main.getByPlaceholder(/^Main home$/i)).toHaveValue(`E2E Test Property ${timestamp}`);
  await expect(main.getByRole('button', { name: /^Save new customer$/i })).toBeEnabled();

  const createContactResponsePromise = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_create_local_contact'),
    { timeout: 10_000 },
  );

  await main.getByRole('button', { name: /^Save new customer$/i }).click();
  const createContactResponse = await createContactResponsePromise;
  expect(createContactResponse.ok()).toBeTruthy();

  const search = main.getByPlaceholder(/Search homeowner, city, address/i);
  const customerResult = main.getByRole('button', { name: new RegExp(escapeRegExp(customerName), 'i') });

  await expect(search).toBeVisible();
  await search.fill(customerName);
  await expect(customerResult).toBeVisible({ timeout: 30_000 });
  await customerResult.click();
  await expect(main.getByRole('heading', { level: 2, name: new RegExp(escapeRegExp(customerName), 'i') })).toBeVisible();
  await waitForContractorWorkspaceReady(page);

  return { customerName };
}

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

    await main.getByRole('button', { name: /^Invoice$/i }).click();
    await expectActiveTabHeading(page, /^Jobs$/i);
    await expect(main.getByText(/^Invoice draft$/i)).toBeVisible();
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

    const saveInvoiceButton = main.getByRole('button', { name: /^Save invoice draft$/i });
    await expect(saveInvoiceButton).toBeEnabled();
    await saveInvoiceButton.click();
    await waitForInvoiceDraftSave(main, saveInvoiceButton);

    await main.getByRole('button', { name: /Open Estimates \/ Invoices/i }).click();
    await expect(main.getByRole('heading', { name: /^Open estimates and invoices$/i })).toBeVisible();
    await expect(main.getByText(invoiceTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(main.getByText(new RegExp(`${escapeRegExp(customerName)}.*Updated`, 'i'))).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });
});
