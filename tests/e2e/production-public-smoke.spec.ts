import { expect, test } from '@playwright/test';
import { captureMajorConsoleErrors } from './helpers/console';

const DEFAULT_PUBLIC_APP_URL = 'https://servsync.app';

const PUBLIC_ROUTES = [
  { path: '/', label: 'public landing page', expectedText: /ServSync/i },
  { path: '/#/homeowner', label: 'homeowner auth page', expectedText: /Sign in/i },
  { path: '/#/contractor', label: 'contractor auth page', expectedText: /Sign in/i },
  { path: '/#/terms', label: 'terms page', expectedText: /Terms of Service/i },
  { path: '/#/privacy', label: 'privacy page', expectedText: /Privacy Policy/i },
  { path: '/#/acceptable-use', label: 'acceptable use page', expectedText: /Acceptable Use/i },
  { path: '/#/trust-safety', label: 'trust and safety page', expectedText: /Trust & Safety/i },
];

function publicAppBaseUrl() {
  return (process.env.TEST_APP_URL || DEFAULT_PUBLIC_APP_URL).replace(/\/+$/, '');
}

function routeUrl(path: string) {
  return `${publicAppBaseUrl()}${path}`;
}

test.describe('production-safe public smoke', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.label} loads without signing in`, async ({ page }, testInfo) => {
      const consoleErrors = captureMajorConsoleErrors(page);
      const response = await page.goto(routeUrl(route.path), { waitUntil: 'domcontentloaded' });

      expect(response?.ok(), `${route.label} should return a successful document response`).toBe(true);
      await expect(page).toHaveTitle(/ServSync/i);
      await expect(page.locator('body')).toContainText(route.expectedText, { timeout: 15_000 });

      const bodyText = (await page.locator('body').innerText()).trim();
      expect(bodyText.length, `${route.label} should render meaningful public content`).toBeGreaterThan(80);

      await consoleErrors.assertClean(testInfo);
    });
  }
});
