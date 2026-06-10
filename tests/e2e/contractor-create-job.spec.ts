import { expect, test } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { createLocalE2ECustomer, escapeRegExp, openE2ECustomerActionPanel, timestampForRecord } from './helpers/customers';
import { requireApprovedSandboxForMutation } from './helpers/guards';

test.describe('contractor mutating job creation', () => {
  test('creates an E2E service job for a local E2E customer', async ({ page }, testInfo) => {
    requireApprovedSandboxForMutation();

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const jobName = `E2E Test Job ${timestamp}`;

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);

    const { customerName } = await createLocalE2ECustomer(page, timestamp);
    await openE2ECustomerActionPanel(page, customerName);

    await main.getByRole('button', { name: /^Create job\b/i }).click();
    await expectActiveTabHeading(page, /^Jobs$/i);
    await expect(main.getByRole('heading', { name: /^New job$/i })).toBeVisible();
    await expect(main.getByText(new RegExp(`Creating job for:\\s*${escapeRegExp(customerName)}`, 'i'))).toBeVisible();

    await main.getByRole('button', { name: /Service Job/i }).click();
    await main.getByLabel(/^Job name$/i).fill(jobName);
    await main.getByLabel(/^Scope \/ description$/i).fill('E2E safe service job created by Playwright. No report, estimate, invoice, upload, or payment action should be performed.');
    await expect(main.getByLabel(/^Job name$/i)).toHaveValue(jobName);

    const createJobResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_field_work'),
      { timeout: 10_000 },
    );

    await main.getByRole('button', { name: /^Create job$/i }).click();
    const createJobResponse = await createJobResponsePromise;
    expect(createJobResponse.ok()).toBeTruthy();

    await expect(main.getByRole('heading', { level: 2, name: new RegExp(escapeRegExp(jobName), 'i') })).toBeVisible({ timeout: 30_000 });
    await expect(main.getByRole('button', { name: /Back to Jobs/i })).toBeVisible();
    await expect(main.getByText(customerName, { exact: true })).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });
});
