import { expect, test } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('FB-016 recurring Demo read-only smoke', () => {
  test('approved contractor scenario identity can read stable Demo surfaces', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    await loginAs(page, 'contractor');
    await expect(main.getByText(/Contractor command center/i)).toBeVisible();
    await openSidebarTab(page, /Customers/i);
    await expectActiveTabHeading(page, /^Customers$/i);
    await openSidebarTab(page, /^Jobs\b/i);
    await expectActiveTabHeading(page, /^Jobs$/i);
    await openSidebarTab(page, /^Calendar\b/i);
    await expectActiveTabHeading(page, /^Calendar$/i);
    await consoleErrors.assertClean(testInfo);
  });

  test('approved homeowner scenario identity can read stable Demo surfaces', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    await loginAs(page, 'homeowner');
    await expect(main.getByText(/Home command center/i)).toBeVisible();
    await openSidebarTab(page, /^Properties\b/i);
    await expectActiveTabHeading(page, /^Properties$/i);
    await openSidebarTab(page, /^Contractors\b/i);
    await expectActiveTabHeading(page, /^Contractors$/i);
    await openSidebarTab(page, /Estimates \/ Invoices/i);
    await expectActiveTabHeading(page, /^Estimates \/ Invoices$/i);
    await openSidebarTab(page, /Home History/i);
    await expectActiveTabHeading(page, /^Home History$/i);
    await consoleErrors.assertClean(testInfo);
  });
});
