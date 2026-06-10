import { expect, test } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import {
  createLocalE2ECustomer,
  escapeRegExp,
  openE2ECustomerActionPanel,
  timestampForRecord,
  waitForContractorWorkspaceReady,
} from './helpers/customers';
import { requireApprovedSandboxForMutation } from './helpers/guards';

test.describe('contractor mutating report finalization', () => {
  test('contractor finalizes an E2E inspection report for a local customer', async ({ page }, testInfo) => {
    requireApprovedSandboxForMutation();

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const jobName = `E2E Inspection Job ${timestamp}`;
    const findingNote = `E2E Report Finding ${timestamp}: exterior trim damage observed during Playwright report finalization test.`;
    const recommendedAction = `E2E follow-up action ${timestamp}: inspect and repair exterior trim.`;

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);
    await waitForContractorWorkspaceReady(page);

    const { customerName } = await createLocalE2ECustomer(page, timestamp);
    await openE2ECustomerActionPanel(page, customerName);

    await main.getByRole('button', { name: /^Create job\b/i }).click();
    await expectActiveTabHeading(page, /^Jobs$/i);
    await expect(main.getByRole('heading', { name: /^New job$/i })).toBeVisible();
    await expect(main.getByText(new RegExp(`Creating job for:\\s*${escapeRegExp(customerName)}`, 'i'))).toBeVisible();

    await main.getByRole('button', { name: /Inspection Job/i }).click();
    const starterTemplateSelect = main.locator('select:has(option[value="starter:starter-general-maintenance-field-work"])');
    await expect(starterTemplateSelect).toBeVisible();
    await starterTemplateSelect.selectOption('starter:starter-general-maintenance-field-work');
    await main.getByLabel(/^Job name$/i).fill(jobName);
    await expect(main.getByLabel(/^Job name$/i)).toHaveValue(jobName);

    const createJobResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_field_work'),
      { timeout: 10_000 },
    );

    await main.getByRole('button', { name: /^Create job$/i }).click();
    const createJobResponse = await createJobResponsePromise;
    expect(createJobResponse.ok()).toBeTruthy();

    await expect(main.getByRole('heading', { level: 2, name: new RegExp(escapeRegExp(jobName), 'i') })).toBeVisible({ timeout: 30_000 });
    await expect(
      main.locator('p').filter({
        hasText: new RegExp(`^${escapeRegExp(customerName)}(?:\\s*·.*)?$`, 'i'),
      }).first(),
    ).toBeVisible();

    await main.getByRole('button', { name: /^Work Notes\b/i }).click();
    const findingCards = main.getByTestId('inspection-finding-card');
    await expect(findingCards.first()).toBeVisible({ timeout: 30_000 });
    const findingCard = findingCards.first();
    await expect(findingCard).toBeVisible({ timeout: 30_000 });

    await findingCard.getByTestId('inspection-finding-status-needs-repair').click();
    await findingCard.getByTestId('inspection-finding-notes').fill(findingNote);
    await findingCard.getByTestId('inspection-finding-action').fill(recommendedAction);

    await expect(findingCard.getByTestId('inspection-finding-notes')).toHaveValue(findingNote);
    await expect(findingCard.getByTestId('inspection-finding-action')).toHaveValue(recommendedAction);

    await main.getByRole('button', { name: /^Review report$/i }).click();
    await expect(main.getByText(/Report review is ready/i)).toBeVisible();
    await expect(main.getByText(/Finalize saves the PDF and files the report/i)).toBeVisible();
    await expect(main.getByText(/Finalize the report before sending it/i)).toBeVisible();
    const finalizeButton = main.getByRole('button', { name: /^Finalize Report$/i });
    await expect(finalizeButton).toBeEnabled();

    page.once('dialog', async dialog => {
      expect(dialog.message()).toMatch(/Finalize this new customer job report/i);
      await dialog.accept();
    });

    const finalizeResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_finalize_field_work'),
      { timeout: 30_000 },
    );

    await finalizeButton.click();
    const finalizeResponse = await finalizeResponsePromise;
    expect(finalizeResponse.ok()).toBeTruthy();

    await expect(main.getByText(/^New customer job report finalized\.$/i)).toBeVisible({ timeout: 30_000 });
    await expect(main.getByRole('heading', { name: /^Closed jobs$/i })).toBeVisible();

    const finalizedJobRow = main.getByTestId('contractor-job-row').filter({ hasText: jobName }).first();
    await expect(finalizedJobRow).toBeVisible({ timeout: 30_000 });
    await expect(finalizedJobRow.getByRole('button', { name: /^View report$/i })).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });
});
