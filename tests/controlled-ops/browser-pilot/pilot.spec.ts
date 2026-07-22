import { expect, test as base } from '@playwright/test';
import {
  assertReporterReady,
  createBrowserEgressGuard,
} from '../../../scripts/controlled-ops/browser-launch-policy.mjs';

const test = base.extend({
  page: async ({ context, baseURL }, use) => {
    assertReporterReady({
      descriptorPath: process.env.CONTROLLED_OPS_BROWSER_LAUNCH_DESCRIPTOR,
      expectedReporterPid: process.ppid,
      nonce: process.env.CONTROLLED_OPS_BROWSER_LAUNCH_NONCE,
    });
    const guard = createBrowserEgressGuard(baseURL);
    await context.route('**/*', async (route) => {
      if (guard.shouldAllow(route.request().url())) await route.continue();
      else await route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', async (webSocket) => {
      if (!guard.shouldAllow(webSocket.url())) webSocket.close();
    });
    const page = await context.newPage();
    await use(page);
    expect(guard.violationCount).toBe(0);
  },
});

test('synthetic-form-submit', async ({ page, baseURL }) => {
  await test.step('open-local-page', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'controlled ops local pilot' })).toBeVisible();
    expect(page.url().startsWith(baseURL ?? '')).toBe(true);
  });

  await test.step('enter-safe-value', async () => {
    await page.getByLabel('Safe input').fill('synthetic-value');
  });

  await test.step('confirm-success-state', async () => {
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('#result')).toHaveText('synthetic-success');
    await page.waitForTimeout(100);
  });
});
