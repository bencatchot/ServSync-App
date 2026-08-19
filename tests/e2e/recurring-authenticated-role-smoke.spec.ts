import { expect, test, type Page } from '@playwright/test';
const ENABLED = process.env.SERVSYNC_RECURRING_ROLE_UI === 'true';
type ContractorRole = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const ROLE_ENV: Record<ContractorRole, { email: string; password: string }> = {
  owner: { email: 'TEST_CONTRACTOR_EMAIL', password: 'TEST_CONTRACTOR_PASSWORD' },
  admin: { email: 'TEST_CONTRACTOR_ADMIN_EMAIL', password: 'TEST_CONTRACTOR_ADMIN_PASSWORD' },
  office: { email: 'TEST_CONTRACTOR_OFFICE_EMAIL', password: 'TEST_CONTRACTOR_OFFICE_PASSWORD' },
  field_tech: { email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL', password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD' },
  viewer: { email: 'TEST_CONTRACTOR_VIEWER_EMAIL', password: 'TEST_CONTRACTOR_VIEWER_PASSWORD' },
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing recurring role-smoke variable ${name}. Value was not printed.`);
  return value;
}

async function signInContractor(page: Page, role: ContractorRole) {
  await page.goto('/#/contractor');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: /^Sign in$/i })).toBeVisible();
  await main.getByLabel(/^Email$/i).fill(required(ROLE_ENV[role].email));
  await main.getByLabel(/^Password$/i).fill(required(ROLE_ENV[role].password));
  await main.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(main.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
  return main;
}

async function signInHomeowner(page: Page) {
  await page.goto('/#/homeowner');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: /^Sign in$/i })).toBeVisible();
  await main.getByLabel(/^Email$/i).fill(required('TEST_HOMEOWNER_EMAIL'));
  await main.getByLabel(/^Password$/i).fill(required('TEST_HOMEOWNER_PASSWORD'));
  await main.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(main.getByText(/Home command center/i)).toBeVisible({ timeout: 30_000 });
  return main;
}

async function openTab(page: Page, name: RegExp, heading: RegExp) {
  await page.getByRole('button', { name }).first().click();
  await expect(page.getByRole('main').getByRole('heading', { name: heading }).first()).toBeVisible();
}

async function openJobs(page: Page) {
  await openTab(page, /^Jobs(?:\s+\d+)?$/i, /^Jobs$/i);
  const main = page.getByRole('main');
  await expect(main.getByText(/Loading contractor workspace/i)).toBeHidden({ timeout: 30_000 });
  await expect(main.getByText(/^Jobs workspace$/i)).toBeVisible();
  return main;
}

function captureOperationalErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push('browser console error');
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    const expectedLocalAnalyticsMiss = url.hostname === '127.0.0.1'
      && url.pathname === '/_vercel/insights/script.js'
      && response.status() === 404;
    if (!expectedLocalAnalyticsMiss) errors.push(`HTTP ${response.status()} from ${url.hostname}${url.pathname}`);
  });
  return () => expect(errors).toEqual([]);
}

async function openMobileDrawer(page: Page) {
  const mobileHeader = page.locator('div.md\\:hidden').first();
  await mobileHeader.getByRole('button').first().click();
  const drawer = page.locator('div.fixed.inset-0.z-50 aside').first();
  await expect(drawer).toBeVisible();
  return drawer;
}

async function openMobileTab(page: Page, name: RegExp, heading: RegExp) {
  const drawer = await openMobileDrawer(page);
  await drawer.getByRole('button', { name }).first().click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('main').getByRole('heading', { name: heading }).first()).toBeVisible();
}

test.describe('FB-016 recurring authenticated role browser smoke', () => {
  test.beforeEach(() => {
    test.skip(!ENABLED, 'Enable only for the approved read-only recurring Sandbox smoke.');
  });

  test('Owner core contractor surfaces remain readable', async ({ page }) => {
    const assertClean = captureOperationalErrors(page);
    await signInContractor(page, 'owner');
    await openTab(page, /Customers/i, /^Customers$/i);
    await openJobs(page);
    await openTab(page, /^Calendar\b/i, /^Calendar$/i);
    assertClean();
  });

  for (const role of ['admin', 'office'] as const) {
    test(`${role} key management and Job surfaces remain readable`, async ({ page }) => {
      const assertClean = captureOperationalErrors(page);
      await signInContractor(page, role);
      await openTab(page, /Customers/i, /^Customers$/i);
      await openJobs(page);
      assertClean();
    });
  }

  test('Field Technician retains Job operations without financial authoring', async ({ page }) => {
    const assertClean = captureOperationalErrors(page);
    await signInContractor(page, 'field_tech');
    const main = await openJobs(page);
    await expect(main.getByRole('button', { name: /New Estimate\/Invoice|Create Invoice|Record payment/i })).toHaveCount(0);
    await expect(main.getByText(/Internal cost|Gross margin/i)).toHaveCount(0);
    assertClean();
  });

  test('Viewer receives a read-only Job experience', async ({ page }) => {
    const assertClean = captureOperationalErrors(page);
    await signInContractor(page, 'viewer');
    const main = await openJobs(page);
    await expect(main.getByTestId('contractor-work-start-draft')).toHaveCount(0);
    await expect(main.getByRole('button', { name: /New Estimate\/Invoice|Create Invoice|Record payment/i })).toHaveCount(0);
    const viewJob = main.getByRole('button', { name: /^View Job$/i }).first();
    await expect(viewJob).toBeVisible();
    await viewJob.click();
    await expect(main.getByTestId('contractor-job-readonly-detail')).toBeVisible();
    await expect(main.getByRole('button', { name: /^Save$|Complete Job|Finalize Report|Delete/i })).toHaveCount(0);
    assertClean();
  });

  test('Homeowner core read surfaces remain usable', async ({ page }) => {
    const assertClean = captureOperationalErrors(page);
    await signInHomeowner(page);
    await openTab(page, /^Properties\b/i, /^Properties$/i);
    await openTab(page, /^Contractors\b/i, /^Contractors$/i);
    await openTab(page, /Estimates \/ Invoices/i, /^Estimates \/ Invoices$/i);
    await openTab(page, /Home History/i, /^Home History$/i);
    assertClean();
  });

  for (const portal of ['contractor', 'homeowner'] as const) {
    test(`${portal} bounded mobile navigation remains usable`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const assertClean = captureOperationalErrors(page);
      if (portal === 'contractor') {
        await signInContractor(page, 'owner');
        await openMobileTab(page, /^Jobs(?:\s+\d+)?$/i, /^Jobs$/i);
        await expect(page.getByRole('main').getByText(/^Jobs workspace$/i)).toBeVisible();
      } else {
        await signInHomeowner(page);
        await openMobileTab(page, /^Properties\b/i, /^Properties$/i);
      }
      expect(await page.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      assertClean();
    });
  }
});
