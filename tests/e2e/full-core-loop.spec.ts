import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { escapeRegExp, timestampForRecord } from './helpers/customers';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';

function appContextOptions() {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  return {
    baseURL: process.env.TEST_APP_URL,
    extraHTTPHeaders: bypass
      ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' }
      : undefined,
    viewport: { width: 1440, height: 1000 },
  };
}

async function dismissTourIfVisible(page: Page) {
  const skipTour = page.getByRole('button', { name: /^Skip Tour$/i });
  for (let attempts = 0; attempts < 3; attempts += 1) {
    let visibleSkip: Locator | null = null;
    for (let index = 0; index < await skipTour.count(); index += 1) {
      const candidate = skipTour.nth(index);
      if (await candidate.isVisible({ timeout: 500 }).catch(() => false)) {
        visibleSkip = candidate;
        break;
      }
    }
    if (!visibleSkip) return;
    await visibleSkip.click({ force: true });
  }
}

async function freshRolePage(browser: Browser, role: 'contractor' | 'homeowner') {
  const context = await browser.newContext(appContextOptions());
  const page = await context.newPage();
  const consoleErrors = captureMajorConsoleErrors(page);
  await loginAs(page, role);
  await dismissTourIfVisible(page);
  return { context, page, consoleErrors };
}

async function markSeededPricedWorkItemsCompleted(jobId: string) {
  const url = requiredEnv('VITE_SUPABASE_URL');
  if (url.includes(PRODUCTION_SUPABASE_REF) || !url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Refusing to update seeded work items outside sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }
  const client = createClient(url, requiredEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const signIn = await client.auth.signInWithPassword(credentialsFor('contractor'));
    expect(signIn.error, 'Contractor sandbox login for work-item completion should succeed').toBeNull();

    const workItems = await client
      .from('job_work_items')
      .select('id')
      .eq('inspection_id', jobId)
      .eq('billable', true)
      .eq('billing_status', 'unbilled')
      .not('unit_price_cents', 'is', null);
    expect(workItems.error, 'Seeded priced work items should be readable').toBeNull();
    expect(workItems.data?.length ?? 0, 'Accepted-estimate job should have at least one priced work item').toBeGreaterThan(0);

    const completedAt = new Date().toISOString();
    const complete = await client
      .from('job_work_items')
      .update({
        completion_status: 'completed',
        completed_at: completedAt,
        completed_by: signIn.data.user!.id,
      })
      .in('id', workItems.data!.map(item => item.id));
    expect(complete.error, 'Seeded priced work items should be markable complete by the contractor').toBeNull();
  } finally {
    await client.auth.signOut().catch(() => undefined);
  }
}

async function setPropertyScopeAllIfAvailable(main: Locator, label: RegExp) {
  const scope = main.getByLabel(label);
  if ((await scope.count()) > 0) {
    await scope.first().selectOption('all').catch(() => undefined);
  }
}

async function waitForEstimateDraftSave(main: Locator, saveEstimateButton: Locator) {
  const saveError = main
    .getByText(/Unable to save estimate|Add at least one line item|Add a .* title|contractor profile is still loading|ServSync is still connecting/i)
    .first();

  await Promise.race([
    saveEstimateButton.waitFor({ state: 'hidden', timeout: 30_000 }),
    saveError.waitFor({ state: 'visible', timeout: 30_000 }).then(async () => {
      throw new Error(`Estimate draft save failed: ${(await saveError.textContent())?.trim() || 'unknown error'}`);
    }),
  ]);
}

async function chooseConnectedContractorForRequest(page: Page, issueDescription: string) {
  const main = page.getByRole('main');

  await main.getByRole('textbox', { name: /^What do you need help with\?$/i }).fill(issueDescription);

  const handymanSuggestion = main.getByRole('button', { name: /^Handyman\b/i }).first();
  if (await handymanSuggestion.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await handymanSuggestion.click();
  } else {
    await main.getByLabel(/^Who should this go to\?$/i).selectOption({ label: 'Handyman' });
  }

  await main.getByRole('button', { name: /^Continue$/i }).click();
  await expect(main.getByText(/^Choose a contractor$/i)).toBeVisible({ timeout: 10_000 });

  const selectContractor = main.getByRole('button', { name: /^Select contractor$/i }).first();
  await expect(selectContractor).toBeVisible({ timeout: 10_000 });
  await selectContractor.click();
  await main.getByRole('button', { name: /^Continue$/i }).click();
  await expect(main.getByText(/After you send this/i)).toBeVisible({ timeout: 10_000 });
}

async function advanceServiceRequestComposerToIssueStep(page: Page) {
  const main = page.getByRole('main');
  const issueTextbox = main.getByRole('textbox', { name: /^What do you need help with\?$/i });

  await dismissTourIfVisible(page);
  if (await issueTextbox.isVisible({ timeout: 2_000 }).catch(() => false)) return issueTextbox;

  const propertySelector = main.getByRole('combobox', { name: /^Request for$/i });
  await expect(propertySelector).toBeVisible({ timeout: 10_000 });

  const selectedValue = await propertySelector.evaluate(select => (select as HTMLSelectElement).value);
  if (!selectedValue) {
    await propertySelector.selectOption({ index: 1 });
  }

  await dismissTourIfVisible(page);
  const continueButton = main.getByRole('button', { name: /^Continue$/i }).first();
  await expect(continueButton).toBeEnabled({ timeout: 10_000 });
  await continueButton.click();
  await expect(issueTextbox).toBeVisible({ timeout: 10_000 });

  return issueTextbox;
}

async function createHomeownerServiceRequest(page: Page, recordPrefix: string) {
  const main = page.getByRole('main');
  const requestTitle = `${recordPrefix} Request`;
  const requestDescription = `${recordPrefix}: install a shelf and repair a loose cabinet door for the sandbox E2E request-to-invoice core loop.`;

  await openSidebarTab(page, /Service Requests/i);
  await expectActiveTabHeading(page, /^Service Requests$/i);
  await dismissTourIfVisible(page);
  await main.getByRole('button', { name: /^New request$/i }).click();
  await dismissTourIfVisible(page);

  await advanceServiceRequestComposerToIssueStep(page);
  await chooseConnectedContractorForRequest(page, requestDescription);

  await main.getByRole('textbox', { name: /^Request title$/i }).fill(requestTitle);
  await main.getByRole('textbox', { name: /^Message to contractor$/i }).fill(requestDescription);

  const createRequestResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_create_service_request'),
    { timeout: 30_000 },
  );
  await main.getByRole('button', { name: /^Send Request$/i }).click();
  expect((await createRequestResponse).ok()).toBeTruthy();

  await expect(main.getByText(/Service request sent/i)).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId('homeowner-service-request-card').filter({ hasText: requestTitle }).first()).toBeVisible({ timeout: 30_000 });

  return { requestTitle, requestDescription };
}

async function createAndSendEstimateFromRequest(page: Page, requestTitle: string, recordPrefix: string) {
  const main = page.getByRole('main');
  const estimateTitle = `${recordPrefix} Estimate`;

  await openSidebarTab(page, /Service Requests/i);
  await expectActiveTabHeading(page, /^Service Requests$/i);
  const requestCard = main.getByTestId('contractor-service-request-card').filter({ hasText: requestTitle }).first();
  await expect(requestCard).toBeVisible({ timeout: 30_000 });

  const createEstimate = requestCard.getByTestId('contractor-create-estimate-from-request');
  await expect(createEstimate).toBeVisible({ timeout: 30_000 });
  await createEstimate.click();

  await expectActiveTabHeading(page, /^Jobs$/i);
  await expect(main.getByText(/^Estimate draft$/i)).toBeVisible({ timeout: 30_000 });
  await main.getByRole('textbox', { name: /^Estimate title$/i }).fill(estimateTitle);
  await main.getByRole('textbox', { name: /^Scope of work$/i }).fill(`${recordPrefix}: approved service scope for the full sandbox E2E core loop.`);
  await main.getByRole('textbox', { name: /^Estimate line item 1 description$/i }).fill(`${recordPrefix} approved work item`);
  await main.getByRole('spinbutton', { name: /^Estimate line item 1 quantity$/i }).fill('1');
  await main.getByRole('textbox', { name: /^Estimate line item 1 unit price$/i }).fill('125');

  const saveEstimateButton = main.getByRole('button', { name: /^Save estimate draft$/i });
  await expect(saveEstimateButton).toBeEnabled();
  await saveEstimateButton.click();
  await waitForEstimateDraftSave(main, saveEstimateButton);

  const backToJobsOverview = main.getByRole('button', { name: /^Back to Jobs Overview$/i });
  if (await backToJobsOverview.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await backToJobsOverview.click();
  }
  await main.getByRole('button', { name: /Open Estimates \/ Invoices/i }).click();
  await expect(main.getByRole('heading', { name: /^Open estimates and invoices$/i })).toBeVisible({ timeout: 30_000 });
  const estimateCard = main.getByTestId('contractor-estimate-card').filter({ hasText: estimateTitle }).first();
  await expect(estimateCard).toBeVisible({ timeout: 30_000 });

  const sendEstimateResponse = page.waitForResponse(
    response => response.url().includes('/rest/v1/estimates') && response.request().method() === 'PATCH',
    { timeout: 30_000 },
  );
  await estimateCard.getByTestId('contractor-send-estimate').click();
  expect((await sendEstimateResponse).ok()).toBeTruthy();
  await expect(estimateCard.getByText(/Waiting on homeowner/i)).toBeVisible({ timeout: 30_000 });

  return { estimateTitle };
}

async function acceptHomeownerEstimate(page: Page, estimateTitle: string) {
  const main = page.getByRole('main');

  await openSidebarTab(page, /Estimates \/ Invoices/i);
  await expectActiveTabHeading(page, /^Estimates \/ Invoices$/i);
  await setPropertyScopeAllIfAvailable(main, /^Property scope$/i);
  await main.getByRole('button').filter({ hasText: /^Needs Review/i }).first().click();

  const estimateCard = main.getByTestId('homeowner-estimate-card').filter({ hasText: estimateTitle }).first();
  await expect(estimateCard).toBeVisible({ timeout: 30_000 });
  await estimateCard.getByRole('button', { name: /^Review Estimate$/i }).click();

  const acceptResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_homeowner_respond_to_estimate'),
    { timeout: 30_000 },
  );
  await estimateCard.getByTestId('homeowner-accept-estimate').click();
  expect((await acceptResponse).ok()).toBeTruthy();
  await expect(estimateCard.getByRole('button', { name: /Updating/i })).toBeHidden({ timeout: 30_000 });
  await main.getByRole('button').filter({ hasText: /^Accepted Estimates/i }).first().click();
  const acceptedEstimateCard = main.getByTestId('homeowner-estimate-card').filter({ hasText: estimateTitle }).first();
  await expect(acceptedEstimateCard.getByText(/^Accepted$/i)).toBeVisible({ timeout: 30_000 });
}

async function createJobCompleteAndSendInvoice(page: Page, estimateTitle: string, recordPrefix: string) {
  const main = page.getByRole('main');
  const invoiceTitle = `${recordPrefix} Invoice`;

  await openSidebarTab(page, /^Jobs\b/i);
  await expectActiveTabHeading(page, /^Jobs$/i);
  await main.getByRole('button', { name: /Open Estimates \/ Invoices/i }).click();
  await expect(main.getByRole('heading', { name: /^Open estimates and invoices$/i })).toBeVisible({ timeout: 30_000 });

  const acceptedEstimateCard = main.getByTestId('contractor-estimate-card').filter({ hasText: estimateTitle }).first();
  await expect(acceptedEstimateCard).toBeVisible({ timeout: 30_000 });
  const createJobResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_create_job_from_estimate'),
    { timeout: 30_000 },
  );
  await acceptedEstimateCard.getByTestId('contractor-create-job-from-accepted-estimate').click();
  const createJob = await createJobResponse;
  expect(createJob.ok()).toBeTruthy();
  const createJobResult = await createJob.json() as { job_id?: string };
  expect(createJobResult.job_id, 'Accepted estimate job creation should return a job id').toBeTruthy();
  const jobId = createJobResult.job_id!;

  const workCheckbox = main.locator('[data-testid="contractor-approved-work-checkbox"], [data-testid="contractor-work-item-checkbox"]').first();
  await expect(workCheckbox).toBeVisible({ timeout: 30_000 });
  await expect(workCheckbox).toHaveAttribute('aria-label', /.+/);
  if (!(await workCheckbox.isChecked())) {
    await workCheckbox.check();
  }

  const saveProgressResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_update_inspection'),
    { timeout: 30_000 },
  );
  await main.getByTestId('contractor-save-job-progress').click();
  expect((await saveProgressResponse).ok()).toBeTruthy();
  await expect(main.getByText(/Progress saved/i)).toBeVisible({ timeout: 30_000 });
  await markSeededPricedWorkItemsCompleted(jobId);
  await page.reload();
  await dismissTourIfVisible(page);

  const completeJobResponse = page.waitForResponse(
    response => response.url().includes('/rest/v1/inspections') && response.request().method() === 'PATCH',
    { timeout: 30_000 },
  );
  const completeJob = main.getByTestId('contractor-complete-job');
  await expect(completeJob).toBeEnabled();
  page.once('dialog', dialog => dialog.accept());
  await completeJob.click();
  expect((await completeJobResponse).ok()).toBeTruthy();

  const partialPanel = main.getByTestId('partial-invoicing-work-items-panel');
  await expect(partialPanel).toBeVisible({ timeout: 30_000 });
  await expect(partialPanel.getByTestId('create-partial-invoice-from-completed-items')).toBeEnabled({ timeout: 30_000 });
  await partialPanel.getByTestId('create-partial-invoice-from-completed-items').click();
  await expect(main.getByRole('heading', { name: /^Create invoice from completed items$/i })).toBeVisible({ timeout: 30_000 });
  const createInvoiceResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_create_partial_invoice_from_job'),
    { timeout: 30_000 },
  );
  await main.getByTestId('confirm-create-partial-invoice').click();
  expect((await createInvoiceResponse).ok()).toBeTruthy();

  const saveAndSendInvoice = main.getByTestId('contractor-save-and-send-invoice');
  await expect(saveAndSendInvoice).toBeVisible({ timeout: 30_000 });
  await main.getByRole('textbox', { name: /^Invoice title$/i }).fill(invoiceTitle);

  const saveInvoiceResponse = page.waitForResponse(
    response => response.url().includes('/rest/v1/invoices') && ['PATCH', 'POST'].includes(response.request().method()),
    { timeout: 30_000 },
  );
  const sendInvoiceResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_send_invoice'),
    { timeout: 30_000 },
  );
  await saveAndSendInvoice.click();
  expect((await saveInvoiceResponse).ok()).toBeTruthy();
  expect((await sendInvoiceResponse).ok()).toBeTruthy();
  await expect(main.getByText(/Invoice sent to homeowner/i)).toBeVisible({ timeout: 30_000 });

  return { invoiceTitle };
}

async function fileInvoiceAndCreateReminder(page: Page, invoiceTitle: string, recordPrefix: string) {
  const main = page.getByRole('main');
  const reminderTitle = `${recordPrefix} Reminder`;
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const dueDate = due.toISOString().slice(0, 10);

  await openSidebarTab(page, /Estimates \/ Invoices/i);
  await expectActiveTabHeading(page, /^Estimates \/ Invoices$/i);
  await setPropertyScopeAllIfAvailable(main, /^Property scope$/i);
  await main.getByRole('button').filter({ hasText: /^Open Invoices/i }).first().click();

  const invoiceCard = main.getByTestId('homeowner-invoice-card').filter({ hasText: invoiceTitle }).first();
  await expect(invoiceCard).toBeVisible({ timeout: 30_000 });

  const viewInvoiceResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_homeowner_view_invoice'),
    { timeout: 30_000 },
  );
  await invoiceCard.getByRole('button', { name: /^View Invoice$/i }).click();
  expect((await viewInvoiceResponse).ok()).toBeTruthy();

  const fileInvoiceResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_file_invoice_to_home_history'),
    { timeout: 30_000 },
  );
  await invoiceCard.getByTestId('homeowner-file-invoice-to-home-history').click();
  expect((await fileInvoiceResponse).ok()).toBeTruthy();
  await expect(invoiceCard.getByText(/Filed to Home History/i)).toBeVisible({ timeout: 30_000 });

  await openSidebarTab(page, /Home History/i);
  await expectActiveTabHeading(page, /^Home History$/i);
  await setPropertyScopeAllIfAvailable(main, /^Property$/i);

  const historyEntry = main.getByTestId('home-history-entry-card').filter({ hasText: invoiceTitle }).first();
  await expect(historyEntry).toBeVisible({ timeout: 30_000 });
  await historyEntry.getByTestId('home-history-add-follow-up-reminder').click();

  const reminderForm = main.getByTestId('home-reminder-form');
  await expect(reminderForm).toBeVisible({ timeout: 30_000 });
  await reminderForm.getByRole('textbox', { name: /^Reminder title$/i }).fill(reminderTitle);
  await reminderForm.getByLabel(/^Due date$/i).fill(dueDate);
  await reminderForm.getByRole('textbox', { name: /^Notes/i }).fill(`${recordPrefix}: reminder created from invoice-linked Home History entry.`);

  const reminderResponse = page.waitForResponse(
    response => response.url().includes('/rest/v1/home_reminders') && response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await reminderForm.getByRole('button', { name: /^Save reminder$/i }).click();
  expect((await reminderResponse).ok()).toBeTruthy();
  await expect(main.getByText(/Home Reminder saved/i)).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await dismissTourIfVisible(page);
  await openSidebarTab(page, /Home History/i);
  await expectActiveTabHeading(page, /^Home History$/i);
  await setPropertyScopeAllIfAvailable(main, /^Property$/i);
  const refreshedHistoryEntry = main.getByTestId('home-history-entry-card').filter({ hasText: invoiceTitle }).first();
  await expect(refreshedHistoryEntry).toBeVisible({ timeout: 30_000 });
  await expect(refreshedHistoryEntry.getByText(/Linked Home Reminders/i)).toBeVisible({ timeout: 30_000 });
  await expect(refreshedHistoryEntry.getByText(new RegExp(`^${escapeRegExp(reminderTitle)}\\.?$`, 'i'))).toBeVisible({ timeout: 30_000 });
}

test.describe('full sandbox core loop', () => {
  test('homeowner request to contractor invoice to Home History reminder', async ({ page, browser }, testInfo) => {
    requireApprovedSandboxForMutation();
    test.setTimeout(300_000);

    const timestamp = timestampForRecord();
    const recordPrefix = `E2E Core Loop ${timestamp}`;
    const homeownerErrors = captureMajorConsoleErrors(page);

    await loginAs(page, 'homeowner');
    await dismissTourIfVisible(page);

    const { requestTitle } = await createHomeownerServiceRequest(page, recordPrefix);
    await homeownerErrors.assertClean(testInfo);

    const contractorEstimate = await freshRolePage(browser, 'contractor');
    const { estimateTitle } = await createAndSendEstimateFromRequest(contractorEstimate.page, requestTitle, recordPrefix);
    await contractorEstimate.consoleErrors.assertClean(testInfo);
    await contractorEstimate.context.close();

    const homeownerAccept = await freshRolePage(browser, 'homeowner');
    await acceptHomeownerEstimate(homeownerAccept.page, estimateTitle);
    await homeownerAccept.consoleErrors.assertClean(testInfo);
    await homeownerAccept.context.close();

    const contractorJob = await freshRolePage(browser, 'contractor');
    const { invoiceTitle } = await createJobCompleteAndSendInvoice(contractorJob.page, estimateTitle, recordPrefix);
    await contractorJob.consoleErrors.assertClean(testInfo);
    await contractorJob.context.close();

    const homeownerCloseout = await freshRolePage(browser, 'homeowner');
    await fileInvoiceAndCreateReminder(homeownerCloseout.page, invoiceTitle, recordPrefix);
    await homeownerCloseout.consoleErrors.assertClean(testInfo);
    await homeownerCloseout.context.close();
  });
});
