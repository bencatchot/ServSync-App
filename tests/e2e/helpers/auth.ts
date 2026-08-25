import { expect, type Page } from '@playwright/test';
import { credentialsFor, type TestRole } from './env';

export async function loginAs(page: Page, role: TestRole) {
  const credentials = credentialsFor(role);

  await page.goto(`/#/${role}`);
  const authMain = page.getByRole('main');

  await expect(authMain.getByRole('heading', { name: /^Sign in$/i })).toBeVisible();
  await authMain.getByLabel(/^Email$/i).fill(credentials.email);
  await authMain.getByLabel(/^Password$/i).fill(credentials.password);
  await authMain.getByRole('button', { name: /^Sign in$/i }).click();

  if (role === 'contractor') {
    await expect(page.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByRole('heading', { name: /^Sign in$/i })).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('main').getByText(/Home command center/i)).toBeVisible();
    if ((page.viewportSize()?.width ?? 1280) >= 768) {
      await expect(page.getByRole('button', { name: /^Properties$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Estimates \/ Invoices(?: \d+)?$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Discover$/i })).toBeVisible();
    }
  }
}

export async function openSidebarTab(page: Page, name: RegExp) {
  const visibleTab = page.getByRole('button', { name }).filter({ visible: true }).first();
  if (await visibleTab.isVisible()) {
    await visibleTab.click();
  } else {
    const mobileHeader = page.locator('div.md\\:hidden').first();
    await mobileHeader.getByRole('button').first().click();
    const drawer = page.locator('div.fixed.inset-0.z-50 aside').first();
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name }).first().click();
    await expect(drawer).toBeHidden();
  }
  await expect(page.locator('main')).toBeVisible();
}

export async function expectActiveTabHeading(page: Page, name: RegExp) {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
