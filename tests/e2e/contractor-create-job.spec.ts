import { expect, test, type Page } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { requireApprovedSandboxForMutation } from './helpers/guards';

function timestampForRecord() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  return { customerName };
}

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

    await main.getByRole('button', { name: /^Create job$/i }).first().click();
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
