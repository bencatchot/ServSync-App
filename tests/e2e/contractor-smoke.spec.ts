import { expect, test } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';

test.describe('contractor read-only smoke', () => {
  test('contractor dashboard, navigation, and beta feedback load', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');

    await loginAs(page, 'contractor');
    await expect(main.getByText(/Contractor command center/i)).toBeVisible();
    await expect(main.getByRole('heading', { name: /Schedule snapshot/i })).toBeVisible();
    await expect(main.getByRole('heading', { name: /Workflow overview/i })).toBeVisible();
    await expect(main.getByText(/Tools & setup/i)).toBeVisible();

    const reportBugButton = page.getByRole('button', { name: /Report bug/i });
    if (!(await reportBugButton.isVisible().catch(() => false))) {
      await main.getByText(/Tools & setup/i).click();
    }
    await expect(reportBugButton).toBeVisible();

    await reportBugButton.click();
    await expectActiveTabHeading(page, /^Support$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^ServSync support$/i })).toBeVisible();
    await expect(main.getByText(/Help us improve ServSync/i)).toBeVisible();
    const feedbackTypeSelect = main.locator('select:has(option[value="feature_request"])');
    await expect(feedbackTypeSelect).toHaveCount(1);
    await expect(feedbackTypeSelect).toHaveValue('bug');
    await expect(main.getByPlaceholder(/Example: Add saved filters/i)).toHaveValue('Bug report');
    await expect(main.getByPlaceholder(/Tell us what you want changed/i)).toHaveValue(/Page\/context: Contractor portal - Dashboard/);

    await openSidebarTab(page, /^Dashboard\b/i);
    await expectActiveTabHeading(page, /^Dashboard$/i);
    await expect(main.getByText(/Contractor command center/i)).toBeVisible();

    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);
    await expect(main.getByPlaceholder(/Search homeowner, city, address/i)).toBeVisible();

    await openSidebarTab(page, /Service Requests/i);
    await expectActiveTabHeading(page, /^Service Requests$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^Service requests$/i })).toBeVisible();

    await openSidebarTab(page, /^Jobs\b/i);
    await expectActiveTabHeading(page, /^Jobs$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^Jobs$/i })).toBeVisible();
    await expect(main.getByRole('heading', { level: 3, name: /^Estimates \/ Invoices$/i })).toBeVisible();

    await openSidebarTab(page, /^Calendar\b/i);
    await expectActiveTabHeading(page, /^Calendar$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^Calendar$/i })).toBeVisible();

    await openSidebarTab(page, /^Support\b/i);
    await expectActiveTabHeading(page, /^Support$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^ServSync support$/i })).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });
});
