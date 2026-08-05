import { expect, test, type Page } from '@playwright/test';
import { captureMajorConsoleErrors } from './helpers/console';
import { requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';
import { deleteLocalCustomerFixtures } from './helpers/sandboxLocalCustomerOperator';
import { requireValidationTarget } from './helpers/validationTarget';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const UI_ENABLED = process.env.ADMIN_OFFICE_CUSTOMER_CREATION_PARITY_UI === 'true';
type UiRole = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer';

const ROLE_ENV: Record<UiRole, { email: string; password: string }> = {
  owner: { email: 'TEST_CONTRACTOR_EMAIL', password: 'TEST_CONTRACTOR_PASSWORD' },
  admin: { email: 'TEST_CONTRACTOR_ADMIN_EMAIL', password: 'TEST_CONTRACTOR_ADMIN_PASSWORD' },
  office: { email: 'TEST_CONTRACTOR_OFFICE_EMAIL', password: 'TEST_CONTRACTOR_OFFICE_PASSWORD' },
  field_tech: { email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL', password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD' },
  viewer: { email: 'TEST_CONTRACTOR_VIEWER_EMAIL', password: 'TEST_CONTRACTOR_VIEWER_PASSWORD' },
};

async function login(page: Page, role: UiRole) {
  await page.goto('/#/contractor');
  const main = page.getByRole('main');
  await main.getByLabel(/^Email$/i).fill(requiredEnv(ROLE_ENV[role].email));
  await main.getByLabel(/^Password$/i).fill(requiredEnv(ROLE_ENV[role].password));
  await main.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Customers/i }).first().click();
  await expect(main.getByRole('heading', { level: 1, name: /^Customers$/i })).toBeVisible();
  await expect(main.getByText(/Loading contractor workspace/i)).toBeHidden({ timeout: 30_000 });
}

async function validateManagerCreation(page: Page, role: 'admin' | 'office', recordCreatedContactId: (id: string) => void) {
  const main = page.getByRole('main');
  const tag = `AOCC UI ${role} ${Date.now()}`;
  await main.getByRole('button', { name: /^Add$/i }).click();
  await expect(main.getByRole('heading', { name: /^Add new customer$/i })).toBeVisible();
  await main.getByPlaceholder(/e\.g\. Becky Thomas/i).fill(tag);
  await main.getByPlaceholder(/^Main home$/i).fill(`${tag} property`);
  await main.getByPlaceholder(/^Street address$/i).fill('700 UI Parity Street');
  const responsePromise = page.waitForResponse(response => response.url().includes('/rpc/servsync_create_local_contact'));
  await main.getByRole('button', { name: /^Save new customer$/i }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { contact: { id: string }; home: { id: string } };
  if (payload.contact.id) recordCreatedContactId(payload.contact.id);
  expect(payload.contact.id).toBeTruthy();
  expect(payload.home.id).toBeTruthy();
  expect(JSON.stringify(payload)).not.toMatch(/claim|invite|token/);

  const search = main.getByPlaceholder(/Search customers, city, or address/i);
  await search.fill(tag);
  const customer = main.getByRole('button').filter({ hasText: tag }).first();
  await expect(customer).toBeVisible({ timeout: 30_000 });
  await customer.click();
  await main.getByRole('button', { name: /\bJobs\b.*(?:Create work for this customer|Items in progress)/i }).click();
  await main.getByRole('button', { name: /^Create Draft\b/i }).click();
  await expect(main.getByTestId('shared-draft-composer')).toBeVisible();
  await expect(main.getByRole('combobox', { name: /^Customer$/i })).toContainText(tag);
  await expect(main.getByRole('combobox', { name: /^Property$/i }).locator('option:checked')).toContainText(`${tag} property`);
}

test.describe('Admin/Office customer creation parity Preview UI', () => {
  const createdContactIds: string[] = [];

  test.beforeEach(() => {
    test.skip(!UI_ENABLED, 'Enable only for separately authorized exact-head Preview/Sandbox validation.');
    requireApprovedSandboxForMutation();
    requireValidationTarget({ requireAppUrl: true, requireSupabaseEnv: true });
  });

  test.afterAll(async () => {
    if (!UI_ENABLED || createdContactIds.length === 0) return;
    await deleteLocalCustomerFixtures(createdContactIds);
  });

  test('Owner retains customer creation controls', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    await login(page, 'owner');
    await expect(page.getByRole('main').getByRole('button', { name: /^Add$/i })).toBeVisible();
    await consoleErrors.assertClean(testInfo);
  });

  test('Admin creates and selects a customer on desktop', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await login(page, 'admin');
    await validateManagerCreation(page, 'admin', id => createdContactIds.push(id));
    await consoleErrors.assertClean(testInfo);
  });

  test('Office creates and selects a customer on mobile without overflow', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'office');
    await validateManagerCreation(page, 'office', id => createdContactIds.push(id));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await consoleErrors.assertClean(testInfo);
  });

  for (const role of ['field_tech', 'viewer'] as const) {
    test(`${role} cannot see customer creation controls`, async ({ page }, testInfo) => {
      const consoleErrors = captureMajorConsoleErrors(page);
      await login(page, role);
      await expect(page.getByRole('main').getByRole('button', { name: /^Add$/i })).toHaveCount(0);
      await expect(page.getByRole('main').getByRole('heading', { name: /^Add new customer$/i })).toHaveCount(0);
      await consoleErrors.assertClean(testInfo);
    });
  }
});
