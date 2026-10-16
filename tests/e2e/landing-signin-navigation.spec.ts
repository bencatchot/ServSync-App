import { chromium, webkit, expect, test, type Browser } from '@playwright/test';

// Exercise actual native pointer/focus/navigation behavior; never submit Auth forms.
for (const browserName of ['chromium', 'webkit'] as const) {
  test.describe(`${browserName} public sign-in navigation`, () => {
    let browser: Browser;
    test.beforeAll(async () => { browser = await ({ chromium, webkit })[browserName].launch(); });
    test.afterAll(async () => { await browser?.close(); });
    for (const width of [1440, 820, 390]) {
      test(`both roles reach sign-in at ${width}px`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 1000 });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const role of ['Homeowner', 'Contractor']) {
          await page.goto(process.env.TEST_APP_URL!);
          if (width < 700) {
            await page.getByRole('button', { name: 'Open menu', exact: true }).tap();
            await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: `${role} sign in`, exact: true }).tap();
          } else {
            const menu = page.locator('.ss-signin-menu');
            await menu.locator('summary').click();
            const link = menu.getByRole('link', { name: role, exact: true });
            if (width < 1000) await link.tap();
            else await link.click();
          }
          await expect(page).toHaveURL(new RegExp(`#/${role.toLowerCase()}$`));
          await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
          await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
          await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
        }
        expect(errors).toEqual([]);
        await context.close();
      });
    }
    test('keyboard choice and menu dismissal remain usable', async () => {
      const context = await browser.newContext({ baseURL: process.env.TEST_APP_URL, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.goto('/');
      const menu = page.locator('.ss-signin-menu');
      const summary = menu.locator('summary');
      await summary.focus();
      await summary.press('Enter');
      const first = menu.getByRole('link', { name: 'Homeowner', exact: true });
      await first.focus();
      await first.press('Escape');
      await expect(menu).not.toHaveAttribute('open', '');
      await expect(summary).toBeFocused();
      await summary.press('Enter');
      await page.getByRole('heading', { level: 1 }).click();
      await expect(menu).not.toHaveAttribute('open', '');
      await summary.click();
      await menu.getByRole('link', { name: 'Contractor', exact: true }).focus();
      await page.getByRole('link', { name: 'Get started', exact: true }).focus();
      await expect(menu).not.toHaveAttribute('open', '');
      await summary.click();
      await first.focus();
      await first.press('Enter');
      await expect(page).toHaveURL(/#\/homeowner$/);
      await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
      await context.close();
    });
  });
}
