import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { captureMajorConsoleErrors } from './helpers/console';
import { credentialsFor, type TestRole } from './helpers/env';

test.use({ ...devices['Pixel 7'] });

async function loginMobile(page: Page, role: TestRole) {
  const credentials = credentialsFor(role);

  await page.goto(`/#/${role}`);
  const authMain = page.getByRole('main');

  await expect(authMain.getByRole('heading', { name: /^Sign in$/i })).toBeVisible();
  await authMain.getByLabel(/^Email$/i).fill(credentials.email);
  await authMain.getByLabel(/^Password$/i).fill(credentials.password);
  await authMain.getByRole('button', { name: /^Sign in$/i }).click();

  await expect(page.getByText(role === 'contractor' ? /Contractor command center/i : /Home command center/i)).toBeVisible({ timeout: 30_000 });
}

async function dismissTourIfVisible(page: Page) {
  const skipTour = page.getByRole('button', { name: /^Skip Tour$/i });
  for (let index = 0; index < await skipTour.count(); index += 1) {
    const candidate = skipTour.nth(index);
    if (await candidate.isVisible({ timeout: 500 }).catch(() => false)) {
      await candidate.click({ force: true });
      break;
    }
  }
}

function mobileHeader(page: Page): Locator {
  return page.locator('div.md\\:hidden').first();
}

async function openMobileDrawer(page: Page): Promise<Locator> {
  const menuButton = mobileHeader(page).getByRole('button').first();
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const drawer = page.locator('div.fixed.inset-0.z-50 aside').first();
  await expect(drawer).toBeVisible();
  return drawer;
}

async function openMobileTab(page: Page, name: RegExp, label: string) {
  const drawer = await openMobileDrawer(page);
  await drawer.getByRole('button', { name }).first().click();
  await expect(drawer).toBeHidden();
  await expect(mobileHeader(page).getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth;
  });
  expect(overflow, 'page should not have obvious horizontal overflow').toBeLessThanOrEqual(2);
}

test.describe('mobile read-only smoke', () => {
  test('homeowner mobile navigation and high-risk screens load', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');

    await loginMobile(page, 'homeowner');
    await dismissTourIfVisible(page);
    await expectNoHorizontalOverflow(page);
    await expect(main.getByText(/Home command center/i)).toBeVisible();
    await expect(main.getByText(/Upcoming reminders/i)).toBeVisible();

    let drawer = await openMobileDrawer(page);
    await expect(drawer.getByRole('button', { name: /Service Requests/i })).toBeVisible();
    await page.keyboard.press('Escape').catch(() => undefined);
    if (await drawer.isVisible().catch(() => false)) {
      await drawer.getByRole('button', { name: /^Dashboard\b/i }).click();
    }
    await expect(drawer).toBeHidden();

    await openMobileTab(page, /Service Requests/i, 'Service Requests');
    await expect(main.getByRole('heading', { level: 2, name: /^Start a new service request$/i })).toBeVisible();

    await openMobileTab(page, /Estimates \/ Invoices/i, 'Estimates / Invoices');
    await expect(main.getByText(/^Review estimates and invoices from connected contractors$/i)).toBeVisible();

    await openMobileTab(page, /Home History/i, 'Home History');
    await expect(main.getByRole('heading', { level: 2, name: /^Home History$/i })).toBeVisible();
    await expect(main.getByText(/Home Reminders are manual follow-up notes/i)).toBeVisible();

    await openMobileTab(page, /^Calendar\b/i, 'Calendar');
    await expect(main.getByRole('heading', { level: 2, name: /^My calendar$/i })).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });

  test('contractor mobile navigation and high-risk screens load', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');

    await loginMobile(page, 'contractor');
    await dismissTourIfVisible(page);
    await expectNoHorizontalOverflow(page);
    await expect(main.getByText(/Contractor command center/i)).toBeVisible();

    let drawer = await openMobileDrawer(page);
    await expect(drawer.getByRole('button', { name: /Service Requests/i })).toBeVisible();
    await page.keyboard.press('Escape').catch(() => undefined);
    if (await drawer.isVisible().catch(() => false)) {
      await drawer.getByRole('button', { name: /^Dashboard\b/i }).click();
    }
    await expect(drawer).toBeHidden();

    await openMobileTab(page, /Homeowners/i, 'Homeowners');
    await expect(main.getByPlaceholder(/Search homeowner, city, address/i)).toBeVisible();

    await openMobileTab(page, /Service Requests/i, 'Service Requests');
    await expect(main.getByRole('heading', { level: 2, name: /^Service requests$/i })).toBeVisible();

    await openMobileTab(page, /^Jobs\b/i, 'Jobs');
    await expect(main.getByRole('heading', { level: 2, name: /^Jobs$/i })).toBeVisible();
    await expect(main.getByRole('heading', { level: 3, name: /^Estimates \/ Invoices$/i })).toBeVisible();

    await openMobileTab(page, /^Calendar\b/i, 'Calendar');
    await expect(main.getByRole('heading', { level: 2, name: /^Calendar$/i })).toBeVisible();

    await openMobileTab(page, /Business Profile/i, 'Business Profile');
    await expect(main.getByRole('heading', { level: 2, name: /^Business profile$/i })).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });
});
