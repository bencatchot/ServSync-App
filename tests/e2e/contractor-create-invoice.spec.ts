import { expect, test, type Locator } from '@playwright/test';
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
