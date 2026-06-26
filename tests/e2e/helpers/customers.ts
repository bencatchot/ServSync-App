import { expect, type Page } from '@playwright/test';

export function timestampForRecord() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function waitForContractorWorkspaceReady(page: Page) {
  await expect(page.getByRole('main').getByText(/Loading contractor workspace/i)).toBeHidden({ timeout: 30_000 });
}

export async function createLocalE2ECustomer(page: Page, timestamp: string) {
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

  await openE2ECustomerDetail(page, customerName);

  return { customerName };
}

export async function openE2ECustomerDetail(page: Page, customerName: string) {
  const main = page.getByRole('main');
  const search = main.getByPlaceholder(/Search homeowner, city, address/i);
  const customerResult = main
    .getByRole('button')
    .filter({ hasText: customerName })
    .first();

  await expect(search).toBeVisible();
  await search.fill(customerName);
  await expect(customerResult).toBeVisible({ timeout: 30_000 });
  await customerResult.click();
  await expect(main.getByRole('heading', { level: 2, name: new RegExp(`^${escapeRegExp(customerName)}$`, 'i') })).toBeVisible();
  await waitForContractorWorkspaceReady(page);
}

export async function openE2ECustomerActionPanel(page: Page, customerName: string) {
  const main = page.getByRole('main');

  await openE2ECustomerDetail(page, customerName);
  await main.getByRole('button', { name: /\bJobs\b.*(?:Create work for this customer|Items in progress)/i }).click();

  await expect(main.getByRole('heading', { name: /^Jobs dashboard$/i })).toBeVisible();
  await expect(main.getByRole('button', { name: /^Create job\b/i })).toBeVisible();
  await expect(main.getByRole('button', { name: /^Create estimate\b/i })).toBeVisible();
  await expect(main.getByRole('button', { name: /^Create invoice\b/i })).toBeVisible();
}
