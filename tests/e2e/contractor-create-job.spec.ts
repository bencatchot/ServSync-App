import { expect, test } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { createLocalE2ECustomer, escapeRegExp, launchCustomerProfileDraft, openE2ECustomerActionPanel, timestampForRecord } from './helpers/customers';
import { requireApprovedSandboxForMutation } from './helpers/guards';

test.describe('contractor mutating job creation', () => {
  test('creates an E2E service job for a local E2E customer', async ({ page }, testInfo) => {
    requireApprovedSandboxForMutation();

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const jobName = `E2E Test Job ${timestamp}`;

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Customers/i);
    await expectActiveTabHeading(page, /^Customers$/i);

    const { customerName } = await createLocalE2ECustomer(page, timestamp);
    await openE2ECustomerActionPanel(page, customerName);

    await launchCustomerProfileDraft(page, {
      customerName,
      output: 'job',
      title: jobName,
      scope: 'E2E safe service job created by Playwright. No report, estimate, invoice, upload, or payment action should be performed.',
    });

    await expect(main.getByRole('heading', { level: 2, name: new RegExp(escapeRegExp(jobName), 'i') })).toBeVisible({ timeout: 30_000 });
    await expect(main.getByRole('button', { name: /Back to Jobs/i })).toBeVisible();
    await expect(main.getByText(new RegExp(escapeRegExp(customerName), 'i')).first()).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });
});
