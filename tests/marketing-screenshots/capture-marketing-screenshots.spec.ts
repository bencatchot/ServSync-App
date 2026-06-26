import { expect, test } from '@playwright/test';
import { loginAsDemo, openDemoTab } from './helpers/marketingAuth';
import { captureMarketingScreenshot } from './helpers/screenshotOutput';

test.describe('ServSync marketing screenshots', () => {
  test('captures public landing and auth screens', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    await captureMarketingScreenshot(page, testInfo, testInfo.project.name === 'social' ? 'landing-page' : 'public-landing-page');

    if (testInfo.project.name !== 'social') {
      await page.goto('/#/contractor');
      await expect(page.getByRole('main')).toBeVisible();
      await captureMarketingScreenshot(page, testInfo, 'contractor-sign-in');
    }
  });

  test('captures contractor demo screens', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'social', 'Social crop captures the public landing page only.');

    const signedIn = await loginAsDemo(page, 'contractor');
    test.skip(!signedIn, 'Missing contractor demo credentials.');

    await captureMarketingScreenshot(page, testInfo, 'contractor-dashboard');

    await captureOptionalTab(page, testInfo, /^Business Profile\b/i, 'contractor-business-profile');
    await captureOptionalTab(page, testInfo, /^Jobs\b/i, 'contractor-jobs-workspace');
    await captureOptionalTab(page, testInfo, /^Calendar\b/i, 'contractor-calendar');
    await captureOptionalTab(page, testInfo, /Homeowners/i, 'contractor-homeowners');
  });

  test('captures homeowner demo screens', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'social', 'Social crop captures the public landing page only.');

    const signedIn = await loginAsDemo(page, 'homeowner');
    test.skip(!signedIn, 'Missing homeowner demo credentials.');

    await captureMarketingScreenshot(page, testInfo, 'homeowner-dashboard');

    await captureOptionalTab(page, testInfo, /^Documents\b/i, 'homeowner-documents');
    await captureOptionalTab(page, testInfo, /Service Requests/i, 'homeowner-service-requests');
    await captureOptionalTab(page, testInfo, /Estimates \/ Invoices/i, 'homeowner-estimates-invoices');
    await captureOptionalTab(page, testInfo, /Home History/i, 'homeowner-home-history');
  });
});

async function captureOptionalTab(page: Parameters<typeof openDemoTab>[0], testInfo: Parameters<typeof captureMarketingScreenshot>[1], label: RegExp, fileName: string) {
  const tab = page.getByRole('button', { name: label }).first();
  if (!(await tab.isVisible().catch(() => false))) {
    console.warn(`Skipping ${fileName}; matching tab was not visible.`);
    return;
  }

  await openDemoTab(page, label);
  await captureMarketingScreenshot(page, testInfo, fileName);
}
