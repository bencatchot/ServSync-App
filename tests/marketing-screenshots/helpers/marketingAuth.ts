import { expect, type Page } from '@playwright/test';
import { demoCredentialsFor, type DemoRole } from './marketingEnv';

export async function loginAsDemo(page: Page, role: DemoRole) {
  const credentials = demoCredentialsFor(role);
  if (!credentials) return false;

  await page.goto(`/#/${role}`);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: /^Sign in$/i })).toBeVisible();
  await main.getByLabel(/^Email$/i).fill(credentials.email);
  await main.getByLabel(/^Password$/i).fill(credentials.password);
  await main.getByRole('button', { name: /^Sign in$/i }).click();

  if (role === 'contractor') {
    await expect(main.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(main.getByText(/Home command center/i)).toBeVisible({ timeout: 30_000 });
  }

  return true;
}

export async function openDemoTab(page: Page, label: RegExp) {
  await page.getByRole('button', { name: label }).first().click();
  await expect(page.getByRole('main')).toBeVisible();
}
