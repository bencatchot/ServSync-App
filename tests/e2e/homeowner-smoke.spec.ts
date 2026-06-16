import { expect, test } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';

test.describe('homeowner read-only smoke', () => {
  test('homeowner dashboard, navigation, and beta feedback load', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');

    await loginAs(page, 'homeowner');
    await expect(main.getByText(/Home command center/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Report bug/i })).toBeVisible();

    await page.getByRole('button', { name: /Suggest improvement/i }).click();
    await expectActiveTabHeading(page, /^Support$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^ServSync support$/i })).toBeVisible();
    await expect(main.getByText(/Help us improve ServSync/i)).toBeVisible();
    const feedbackTypeSelect = main.locator('select:has(option[value="feature_request"])');
    await expect(feedbackTypeSelect).toHaveCount(1);
    await expect(feedbackTypeSelect).toHaveValue('feature_request');
    await expect(main.getByPlaceholder(/Example: Add saved filters/i)).toHaveValue('Feature suggestion');
    await expect(main.getByPlaceholder(/Tell us what you want changed/i)).toHaveValue(/Page\/context: Homeowner portal - Dashboard/);

    await openSidebarTab(page, /^Dashboard\b/i);
    await expectActiveTabHeading(page, /^Dashboard$/i);
    await expect(main.getByText(/Home command center/i)).toBeVisible();

    await openSidebarTab(page, /^Documents\b/i);
    await expectActiveTabHeading(page, /^Documents$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^Home documents$/i })).toBeVisible();

    await openSidebarTab(page, /Service Requests/i);
    await expectActiveTabHeading(page, /^Service Requests$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^Start a new service request$/i })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Don’t see your contractor\? Invite them to join ServSync\.$/i })).toBeVisible();

    await openSidebarTab(page, /^Contractors\b/i);
    await expectActiveTabHeading(page, /^Contractors$/i);
    await expect(main.getByRole('button', { name: /^Invite a contractor to ServSync$/i })).toBeVisible();
    await expect(main.getByRole('heading', { level: 2, name: /^My contractor invites$/i })).toBeVisible();
    await expect(main.getByRole('heading', { level: 2, name: /^Find or request service$/i })).toHaveCount(0);
    await main.getByRole('button', { name: /^Invite a contractor to ServSync$/i }).click();
    const inviteDialog = page.getByRole('dialog', { name: /^Invite a contractor to ServSync$/i });
    await expect(inviteDialog).toBeVisible();
    await expect(inviteDialog.getByLabel(/^Business name$/i)).toBeVisible();
    await expect(inviteDialog.getByLabel(/^Location$/i)).toBeVisible();
    await inviteDialog.getByRole('button', { name: /^Close contractor invite$/i }).click();
    await expect(inviteDialog).toHaveCount(0);

    await openSidebarTab(page, /Estimates \/ Invoices/i);
    await expectActiveTabHeading(page, /^Estimates \/ Invoices$/i);
    await expect(main.getByText(/^Review estimates and invoices from connected contractors$/i)).toBeVisible();

    await openSidebarTab(page, /Home History/i);
    await expectActiveTabHeading(page, /^Home History$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^Home History$/i })).toBeVisible();

    await openSidebarTab(page, /^Calendar\b/i);
    await expectActiveTabHeading(page, /^Calendar$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^My calendar$/i })).toBeVisible();

    await openSidebarTab(page, /^Support\b/i);
    await expectActiveTabHeading(page, /^Support$/i);
    await expect(main.getByRole('heading', { level: 2, name: /^ServSync support$/i })).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });
});
