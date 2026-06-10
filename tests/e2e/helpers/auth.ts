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
    await expect(page.getByText(/Home command center/i)).toBeVisible({ timeout: 30_000 });
  }
}

export async function openSidebarTab(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click();
  await expect(page.locator('main')).toBeVisible();
}

export async function expectActiveTabHeading(page: Page, name: RegExp) {
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name })).toBeVisible();
}
