import { expect, test } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { requireApprovedSandboxForMutation } from './helpers/guards';

function timestampForRecord() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('contractor mutating customer creation', () => {
  test('creates a clearly named local E2E customer', async ({ page }, testInfo) => {
    requireApprovedSandboxForMutation();

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const customerName = `E2E Test Customer ${timestamp}`;
    const customerEmail = `e2e-customer-${timestamp}@example.com`;

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);

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
    await expect(main.getByPlaceholder(/\(555\) 555-5555/i)).toHaveValue('(555) 010-1234');
    await expect(main.getByPlaceholder(/customer@example\.com/i)).toHaveValue(customerEmail);
    await expect(main.getByPlaceholder(/^Main home$/i)).toHaveValue(`E2E Test Property ${timestamp}`);
    await expect(main.getByPlaceholder(/^Street address$/i)).toHaveValue('123 E2E Test Street');
    await expect(main.getByLabel(/^City$/i)).toHaveValue('Testville');
    await expect(main.getByPlaceholder(/Start typing a state/i)).toHaveValue('AL');
    await expect(main.getByLabel(/^ZIP$/i)).toHaveValue('36532');
    await expect(main.getByPlaceholder(/^Single family$/i)).toHaveValue('Single family');

    const createContactResponsePromise = page
      .waitForResponse(response => response.url().includes('/rpc/servsync_create_local_contact'), { timeout: 10_000 })
      .catch(() => null);

    const search = main.getByPlaceholder(/Search homeowner, city, address/i);
    const customerResult = main.getByRole('button', { name: new RegExp(escapeRegExp(customerName), 'i') });
    const saveError = main.getByText(/Unable to save new customer|Enter a customer name before saving/i);
    const saveButton = main.getByRole('button', { name: /^Save new customer$/i });

    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    const createContactResponse = await createContactResponsePromise;
    if (!createContactResponse) {
      throw new Error('No servsync_create_local_contact RPC request was observed after clicking Save new customer.');
    }
    if (!createContactResponse.ok()) {
      throw new Error(`Local customer create RPC failed with HTTP ${createContactResponse.status()}`);
    }

    await expect(search).toBeVisible();
    await search.fill(customerName);
    await expect(
      customerResult.or(saveError),
      'Expected the saved E2E customer to appear in the list, or a visible save error to appear.',
    ).toBeVisible({ timeout: 30_000 });

    if (await saveError.isVisible().catch(() => false)) {
      throw new Error(`Local customer save failed: ${await saveError.textContent()}`);
    }

    await expect(customerResult).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });
});
