import { expect, test } from '@playwright/test';

const runSandboxReadOnly = process.env.RUN_PRICE_BOOK_ROLLBACK_SANDBOX_READONLY === '1';

async function loginAsSandboxContractor(page: import('@playwright/test').Page) {
  const email = process.env.TEST_CONTRACTOR_EMAIL;
  const password = process.env.TEST_CONTRACTOR_PASSWORD;
  if (!email || !password) throw new Error('Sandbox contractor credentials are required for this opt-in observation.');
  await page.goto('/#/contractor');
  const authMain = page.getByRole('main');
  await authMain.getByLabel(/^Email$/i).fill(email);
  await authMain.getByLabel(/^Password$/i).fill(password);
  await authMain.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
}

test.describe('FB-024 Price Book rollback Sandbox read-only UI', () => {
  test.skip(!runSandboxReadOnly, 'Set RUN_PRICE_BOOK_ROLLBACK_SANDBOX_READONLY=1 for the approved Sandbox-only observation.');

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`${viewport.name} loads import history and server-authoritative rollback preview without mutation`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const rpcResponses: number[] = [];
      page.on('response', response => {
        if (response.url().includes('/rest/v1/rpc/servsync_preview_price_book_import_rollback')) {
          rpcResponses.push(response.status());
        }
      });

      await loginAsSandboxContractor(page);
      await page.getByRole('button', { name: /^Jobs$/ }).click();
      await page.getByRole('button', { name: /^Price Book/ }).first().click();
      await expect(page.getByRole('heading', { name: 'Price Book' })).toBeVisible();
      await page.getByTestId('price-book-import-tools').locator('summary').click();
      await page.getByText('Recent import history').click();
      await page.getByRole('button', { name: 'Preview rollback' }).first().click();
      await expect(page.getByTestId('price-book-rollback-preview')).toBeVisible();
      expect(rpcResponses).toContain(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByRole('button', { name: 'Confirm rollback' })).toBeVisible();
    });
  }
});
