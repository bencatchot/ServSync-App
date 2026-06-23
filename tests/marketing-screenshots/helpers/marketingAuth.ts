import { expect, type Page } from '@playwright/test';
import { demoCredentialsFor, type DemoRole } from './marketingEnv';

export async function loginAsDemo(page: Page, role: DemoRole) {
  const credentials = demoCredentialsFor(role);
  if (!credentials) return false;

  await page.context().clearCookies();
  await page.goto(`/#/${role}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  }).catch(() => undefined);
  await page.goto(`/#/${role}`, { waitUntil: 'domcontentloaded' });

  const main = page.getByRole('main');
  await assertNoDeploymentError(page);
  await ensureSignInMode(page);

  const emailInput = main.getByLabel(/^Email$/i);
  const passwordInput = main.getByLabel(/^Password$/i);
  const signInButton = main.getByRole('button', { name: /^Sign in$/i });

  await expect(emailInput, 'Expected the ServSync auth form email input to be visible.').toBeVisible();
  await expect(passwordInput, 'Expected the ServSync auth form password input to be visible.').toBeVisible();
  await expect(signInButton, 'Expected the ServSync auth form sign-in button to be visible.').toBeVisible();

  await emailInput.fill(credentials.email);
  await passwordInput.fill(credentials.password);
  await signInButton.click();

  if (role === 'contractor') {
    await expect(main.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(main.getByText(/Home command center/i)).toBeVisible({ timeout: 30_000 });
  }

  return true;
}

async function assertNoDeploymentError(page: Page) {
  const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
  if (/DEPLOYMENT_NOT_FOUND|404\s*:?\s*NOT_FOUND/i.test(bodyText)) {
    throw new Error('Marketing screenshot login could not reach the ServSync app. TEST_APP_URL appears to point to a missing Vercel deployment.');
  }
}

async function ensureSignInMode(page: Page) {
  const main = page.getByRole('main');
  const emailInput = main.getByLabel(/^Email$/i);
  const passwordInput = main.getByLabel(/^Password$/i);
  const signInButton = main.getByRole('button', { name: /^Sign in$/i });

  if (await emailInput.isVisible().catch(() => false)
    && await passwordInput.isVisible().catch(() => false)
    && await signInButton.isVisible().catch(() => false)) {
    return;
  }

  const alreadyHaveAccount = main.getByRole('button', { name: /Already have an account\? Sign in/i });
  if (await alreadyHaveAccount.isVisible().catch(() => false)) {
    await alreadyHaveAccount.click();
    return;
  }

  const signInLink = main.getByRole('button', { name: /Sign in/i }).first();
  if (await signInLink.isVisible().catch(() => false)) {
    await signInLink.click();
  }
}

export async function openDemoTab(page: Page, label: RegExp) {
  await page.getByRole('button', { name: label }).first().click();
  await expect(page.getByRole('main')).toBeVisible();
}
