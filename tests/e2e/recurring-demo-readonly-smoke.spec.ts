import { expect, test } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('FB-016 recurring Demo read-only smoke', () => {
  test('approved contractor scenario identity can read stable Demo surfaces', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    await loginAs(page, 'contractor');
    expect(new URL(page.url()).searchParams.has('servsync-presentation')).toBe(false);
    await expect(main.getByText(/Contractor command center/i)).toBeVisible();
    await openSidebarTab(page, /Customers/i);
    await expectActiveTabHeading(page, /^Customers$/i);
    await openSidebarTab(page, /^Work\b/i);
    await expectActiveTabHeading(page, /^Work$/i);
    await expect(main.getByText(/^Start New Draft$/i).first()).toBeVisible();
    await main.getByRole('button', { name: /^Drafts\b/i }).first().click();
    const estimateHelp = main.getByTestId('contextual-help-contractor.drafts');
    await expect(estimateHelp).toBeVisible({ timeout: 30_000 });
    await estimateHelp.click();
    const walkthrough = page.getByRole('dialog', { name: /How to create an estimate/i });
    await expect(walkthrough).toBeVisible();
    await expect(walkthrough.locator('video[aria-label="How to create an estimate"]')).toHaveAttribute('src', /^https:\/\//, { timeout: 30_000 });
    await walkthrough.getByRole('button', { name: /Close walkthrough/i }).click();
    await openSidebarTab(page, /^Financials\b/i);
    await expectActiveTabHeading(page, /^Financials$/i);
    await expect(main.getByTestId('contractor-financials-dashboard')).toBeVisible();
    await expect(page.getByTestId('demo-presentation-jobs-checkpoint-story')).toHaveCount(0);
    await openSidebarTab(page, /^Calendar\b/i);
    await expectActiveTabHeading(page, /^Calendar$/i);
    await consoleErrors.assertClean(testInfo);
  });

  test('approved homeowner scenario identity can read stable Demo surfaces', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    await loginAs(page, 'homeowner');
    expect(new URL(page.url()).searchParams.has('servsync-presentation')).toBe(false);
    await expect(main.getByText(/Home command center/i)).toBeVisible();
    await openSidebarTab(page, /^Properties\b/i);
    await expectActiveTabHeading(page, /^Properties$/i);
    await openSidebarTab(page, /^Contractors\b/i);
    await expectActiveTabHeading(page, /^Contractors$/i);
    await openSidebarTab(page, /Estimates \/ Invoices/i);
    await expectActiveTabHeading(page, /^Estimates \/ Invoices$/i);
    await openSidebarTab(page, /Home History/i);
    await expectActiveTabHeading(page, /^Home History$/i);
    await openSidebarTab(page, /^Service Requests\b/i);
    await expect(main.getByRole('button', { name: /^New request$/i })).toBeVisible();
    await consoleErrors.assertClean(testInfo);
  });
});
