import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Browser, type BrowserContext, type Locator, type Page, test } from '@playwright/test';
import { requireApprovedSandboxForMutation } from './helpers/guards';

type TestRole = 'contractor' | 'homeowner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const AUTH_ENV = [
  'TEST_CONTRACTOR_EMAIL',
  'TEST_CONTRACTOR_PASSWORD',
  'TEST_HOMEOWNER_EMAIL',
  'TEST_HOMEOWNER_PASSWORD',
] as const;

function missingAuthEnv(): string[] {
  return AUTH_ENV.filter((name) => !process.env[name]?.trim());
}

function appContextOptions() {
  const headers: Record<string, string> = {};
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) {
    headers['x-vercel-protection-bypass'] = bypass;
  }

  return {
    baseURL: process.env.TEST_APP_URL,
    extraHTTPHeaders: headers,
    viewport: { width: 1440, height: 1000 },
  };
}

function credentialsFor(role: TestRole): { email: string; password: string } {
  const prefix = role === 'contractor' ? 'TEST_CONTRACTOR' : 'TEST_HOMEOWNER';
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`]?.trim();
  if (!email || !password) {
    throw new Error(`Missing ${prefix}_EMAIL or ${prefix}_PASSWORD`);
  }
  return { email, password };
}

function main(page: Page): Locator {
  return page.getByRole('main');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function isVisible(locator: Locator, timeout = 1_000): Promise<boolean> {
  return locator.isVisible({ timeout }).catch(() => false);
}

async function dismissTourIfVisible(page: Page): Promise<void> {
  const closeTour = page.getByRole('button', { name: /got it|skip tour|close/i }).first();
  if (await isVisible(closeTour, 700)) {
    await closeTour.click();
  }
}

function captureMajorConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') {
      return;
    }
    const text = msg.text();
    if (
      /favicon|manifest|ResizeObserver|WebSocket connection|Failed to load resource: the server responded with a status of 404/i.test(
        text,
      )
    ) {
      return;
    }
    errors.push(text);
  });

  return {
    assertClean(testInfo: { title: string }) {
      expect(errors, `unexpected console errors during ${testInfo.title}`).toEqual([]);
    },
  };
}

async function signIn(page: Page, role: TestRole): Promise<void> {
  const { email, password } = credentialsFor(role);
  await page.goto('/#/role');
  await page.getByRole('button', { name: role === 'contractor' ? /^Contractor$/i : /^Homeowner$/i }).click();
  const authMain = page.getByRole('main');
  await authMain.getByLabel(/email/i).fill(email);
  await authMain.getByLabel(/password/i).fill(password);
  await authMain.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(authMain.getByRole('heading', { name: /^Sign in$/i })).toBeHidden({ timeout: 30_000 });
  await dismissTourIfVisible(page);
}

async function freshRolePage(
  browser: Browser,
  role: TestRole,
): Promise<{ context: BrowserContext; page: Page; consoleErrors: ReturnType<typeof captureMajorConsoleErrors> }> {
  const context = await browser.newContext(appContextOptions());
  const page = await context.newPage();
  const consoleErrors = captureMajorConsoleErrors(page);
  await signIn(page, role);
  return { context, page, consoleErrors };
}

async function openSidebarTab(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('button', { name }).click();
  await dismissTourIfVisible(page);
}

async function setPropertyScopeAllIfAvailable(page: Page): Promise<void> {
  const selector = page.getByLabel(/Property scope/i);
  if (await isVisible(selector, 1_000)) {
    await selector.selectOption('all').catch(async () => {
      await selector.selectOption({ label: /All properties/i as unknown as string });
    });
  }
}

async function advanceServiceRequestComposerToIssueStep(page: Page): Promise<void> {
  const issueTextbox = main(page).getByRole('textbox', { name: /^What do you need help with\?$/i });
  if (await isVisible(issueTextbox, 2_000)) {
    return;
  }

  const continueButton = main(page).getByRole('button', { name: /^Continue$/i }).first();
  await expect(continueButton).toBeEnabled({ timeout: 10_000 });
  await continueButton.click();
  await expect(issueTextbox).toBeVisible({ timeout: 10_000 });
}

async function createHomeownerServiceRequest(page: Page, requestTitle: string): Promise<void> {
  await openSidebarTab(page, /Service Requests/i);
  await setPropertyScopeAllIfAvailable(page);

  await main(page).getByRole('button', { name: /New request/i }).click();
  await advanceServiceRequestComposerToIssueStep(page);
  await main(page).getByRole('textbox', { name: /^What do you need help with\?$/i }).fill('E2E sandbox-only schedule invoice smoke request.');
  const handymanSuggestion = main(page).getByRole('button', { name: /^Handyman\b/i }).first();
  if (await isVisible(handymanSuggestion, 5_000)) {
    await handymanSuggestion.click();
  } else {
    await main(page).getByLabel(/^Who should this go to\?/i).selectOption({ label: 'Handyman' });
  }
  await main(page).getByRole('button', { name: /^Continue$/i }).click();
  await expect(main(page).getByText(/^Choose a contractor$/i)).toBeVisible({ timeout: 10_000 });
  const selectContractor = main(page).getByRole('button', { name: /^Select contractor$/i }).first();
  await expect(selectContractor).toBeVisible({ timeout: 10_000 });
  await selectContractor.click();
  await main(page).getByRole('button', { name: /^Continue$/i }).click();
  await expect(main(page).getByText(/After you send this/i)).toBeVisible({ timeout: 10_000 });
  await main(page).getByLabel(/Request title/i).fill(requestTitle);
  await main(page).getByLabel(/Message to contractor/i).fill('E2E sandbox-only schedule invoice smoke request.');

  const createRequest = page.waitForResponse((response) =>
    response.url().includes('/rpc/servsync_create_service_request'),
  );
  await main(page).getByRole('button', { name: /Send Request/i }).click();
  const response = await createRequest;
  expect(response.ok(), 'service request creation RPC should succeed').toBeTruthy();
  await expect(main(page).getByText(/Service request sent/i)).toBeVisible({ timeout: 30_000 });
  await dismissTourIfVisible(page);

  const openPendingRequests = main(page).getByRole('button', { name: /Open \/ Pending Requests/i }).first();
  if (await isVisible(openPendingRequests, 2_000)) {
    await openPendingRequests.click();
  }
  await expect(
    main(page).getByTestId('homeowner-service-request-card').filter({ hasText: requestTitle }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

async function openContractorRequest(page: Page, requestTitle: string): Promise<Locator> {
  await openSidebarTab(page, /Service Requests/i);
  const skipSetup = main(page).getByRole('button', { name: /^Skip for Now$/i }).first();
  if (await isVisible(skipSetup, 1_000)) {
    await skipSetup.click();
  }

  const newRequestsQueue = main(page).getByRole('button', { name: /^New requests\b/i }).first();
  if (await isVisible(newRequestsQueue, 2_000)) {
    await newRequestsQueue.click();
  }

  const queueSearch = main(page).getByRole('textbox', { name: /^Search this queue$/i }).first();
  if (await isVisible(queueSearch, 2_000)) {
    await queueSearch.fill(requestTitle);
  }

  const requestCard = main(page).getByTestId('contractor-service-request-card').filter({ hasText: requestTitle }).first();
  await expect(requestCard).toBeVisible({ timeout: 30_000 });
  return requestCard;
}

async function openContractorEstimatesTab(page: Page): Promise<void> {
  await openSidebarTab(page, /^Jobs\b/i);

  const estimatesTab = main(page).getByRole('tab', { name: /^Estimates\b/i }).first();
  if (await isVisible(estimatesTab, 3_000)) {
    await estimatesTab.click();
    return;
  }

  const estimatesButton = main(page).getByRole('button', { name: /^Estimates$/i }).first();
  if (await isVisible(estimatesButton, 2_000)) {
    await estimatesButton.click();
    return;
  }

  const legacyOpenFinancials = main(page).getByRole('button', { name: /Open Estimates \/ Invoices/i }).first();
  if (await isVisible(legacyOpenFinancials, 2_000)) {
    await legacyOpenFinancials.click();
    return;
  }

  throw new Error('Could not open contractor Jobs → Estimates tab.');
}

async function openEstimateComposerFromRequest(page: Page, requestTitle: string): Promise<void> {
  const requestCard = await openContractorRequest(page, requestTitle);
  await requestCard.getByTestId('contractor-create-estimate-from-request').click();

  const buildBlank = main(page).getByRole('button', { name: /^Build blank estimate\b/i }).first();
  if (await isVisible(buildBlank, 5_000)) {
    await buildBlank.click();
  }

  await expect(main(page).getByRole('textbox', { name: /Estimate title/i })).toBeVisible({ timeout: 10_000 });
}

async function createAndSendScheduledEstimateFromRequest(
  page: Page,
  requestTitle: string,
  estimateTitle: string,
): Promise<void> {
  await openEstimateComposerFromRequest(page, requestTitle);

  await main(page).getByRole('textbox', { name: /Estimate title/i }).fill(estimateTitle);

  const scope = main(page).getByRole('textbox', { name: /Scope of work/i });
  if (await isVisible(scope, 1_000)) {
    await scope.fill('Replace and tune the E2E sandbox scheduled billing workflow.');
  }

  const terms = main(page).getByRole('textbox', { name: /^Terms$/i });
  if (await isVisible(terms, 1_000)) {
    await terms.fill('E2E schedule terms remain separate from the payment schedule.');
  }

  const addLine = main(page).getByRole('button', { name: /^Add blank line$/i }).first();
  if (await isVisible(addLine, 1_000)) {
    await addLine.click();
  }

  await main(page)
    .getByRole('textbox', { name: /Estimate line item 1 description/i })
    .fill('Schedule invoice smoke labor');
  await main(page)
    .getByRole('spinbutton', { name: /Estimate line item 1 quantity/i })
    .fill('1');
  await main(page)
    .getByRole('textbox', { name: /Estimate line item 1 unit price/i })
    .fill('200');

  await main(page).getByRole('button', { name: /^Deposit \+ final$/i }).click();
  const scheduleRows = main(page).getByTestId('estimate-payment-schedule-row');
  await expect(scheduleRows).toHaveCount(2);
  await expect(scheduleRows.nth(0)).toContainText(/Deposit/i);
  await expect(scheduleRows.nth(0).getByRole('textbox', { name: /^Payment schedule due trigger$/i })).toHaveValue(
    /Due on approval/i,
  );
  await expect(scheduleRows.nth(1).getByRole('textbox', { name: /^Payment schedule label$/i })).toHaveValue(
    /Final payment/i,
  );
  await expect(scheduleRows.nth(1).getByRole('textbox', { name: /^Payment schedule due trigger$/i })).toHaveValue(
    /Due on completion/i,
  );

  const saveEstimate = page.waitForResponse((response) => {
    const url = response.url();
    return url.includes('/rest/v1/estimates') && ['POST', 'PATCH'].includes(response.request().method());
  });
  await main(page).getByRole('button', { name: /Save estimate draft/i }).click();
  const saveResponse = await saveEstimate;
  expect(saveResponse.ok(), 'estimate draft save should succeed').toBeTruthy();

  await openContractorEstimatesTab(page);
  const estimateCard = main(page).getByTestId('contractor-estimate-card').filter({ hasText: estimateTitle }).first();
  await expect(estimateCard).toBeVisible({ timeout: 30_000 });

  const nonAcceptedSchedule = estimateCard.getByTestId('contractor-estimate-payment-schedule-section');
  await expect(nonAcceptedSchedule).toContainText(/Invoices can be created after homeowner approval/i);
  await expect(nonAcceptedSchedule.getByTestId('contractor-create-schedule-invoice')).toHaveCount(0);

  const sendEstimate = page.waitForResponse((response) => {
    const url = response.url();
    return url.includes('/rest/v1/estimates') && response.request().method() === 'PATCH';
  });
  await estimateCard.getByTestId('contractor-send-estimate').click();
  const sendResponse = await sendEstimate;
  expect(sendResponse.ok(), 'estimate send should succeed').toBeTruthy();

  await expect(estimateCard).toContainText(/sent|awaiting|review/i, { timeout: 15_000 });
  await expect(nonAcceptedSchedule.getByTestId('contractor-create-schedule-invoice')).toHaveCount(0);
}

async function acceptHomeownerEstimate(page: Page, estimateTitle: string): Promise<void> {
  await openSidebarTab(page, /Estimates \/ Invoices/i);
  await setPropertyScopeAllIfAvailable(page);

  const needsReview = main(page).getByRole('button', { name: /Needs Review/i }).first();
  if (await isVisible(needsReview, 2_000)) {
    await needsReview.click();
  }

  const estimateCard = main(page).getByTestId('homeowner-estimate-card').filter({ hasText: estimateTitle }).first();
  await expect(estimateCard).toBeVisible({ timeout: 30_000 });

  const review = estimateCard.getByRole('button', { name: /Review Estimate/i }).first();
  if (await isVisible(review, 2_000)) {
    await review.click();
  }

  const schedule = estimateCard.getByTestId('homeowner-estimate-payment-schedule');
  await expect(schedule).toBeVisible({ timeout: 10_000 });
  await expect(schedule).toContainText(/Payment Schedule/i);
  await expect(schedule).toContainText(/Deposit/i);
  await expect(schedule).toContainText(/Deposit invoice/i);
  await expect(schedule).toContainText(/\$100\.00/);
  await expect(schedule).toContainText(/Due on approval/i);
  await expect(schedule).toContainText(/Final payment/i);
  await expect(schedule).toContainText(/Final invoice/i);
  await expect(schedule).toContainText(/Due on completion/i);
  await expect(schedule).toContainText(/Schedule total/i);
  await expect(estimateCard).toContainText(/E2E schedule terms remain separate/i);
  await expect(estimateCard).toContainText(/By approving, you accept the estimate scope, total, and payment schedule/i);

  const acceptEstimate = page.waitForResponse((response) =>
    response.url().includes('/rpc/servsync_homeowner_respond_to_estimate'),
  );
  await estimateCard.getByTestId('homeowner-accept-estimate').click();
  const response = await acceptEstimate;
  expect(response.ok(), 'homeowner accept estimate RPC should succeed').toBeTruthy();
  await expect(estimateCard.getByRole('button', { name: /Updating/i })).toBeHidden({ timeout: 30_000 });
  await main(page).getByRole('button').filter({ hasText: /^Accepted Estimates/i }).first().click();
  const acceptedEstimateCard = main(page).getByTestId('homeowner-estimate-card').filter({ hasText: estimateTitle }).first();
  await expect(acceptedEstimateCard.getByText(/^Accepted$/i)).toBeVisible({ timeout: 30_000 });
}

async function acceptedContractorEstimateCard(page: Page, estimateTitle: string): Promise<Locator> {
  await openContractorEstimatesTab(page);
  const estimateCard = main(page).getByTestId('contractor-estimate-card').filter({ hasText: estimateTitle }).first();
  await expect(estimateCard).toBeVisible({ timeout: 30_000 });
  await expect(estimateCard).toContainText(/accepted|approved/i, { timeout: 20_000 });
  return estimateCard;
}

async function expectScheduleSummary(
  estimateCard: Locator,
  created: number,
  totalRows: number,
  uninvoicedAmount: string,
): Promise<Locator> {
  const section = estimateCard.getByTestId('contractor-estimate-payment-schedule-section');
  await expect(section).toBeVisible({ timeout: 10_000 });

  const summary = section.getByTestId('contractor-estimate-payment-schedule-summary');
  await expect(summary).toContainText(`${created} of ${totalRows} schedule invoices created`);
  await expect(summary).toContainText(/Scheduled total/i);
  await expect(summary).toContainText('$200.00');
  await expect(summary).toContainText(/Uninvoiced scheduled/i);
  await expect(summary).toContainText(uninvoicedAmount);
  return section;
}

test.describe('contractor schedule invoice authenticated smoke', () => {
  test('runs the accepted estimate schedule-row draft invoice path against an approved sandbox', async ({
    browser,
  }, testInfo) => {
    const missing = missingAuthEnv();
    test.skip(missing.length > 0, `Missing authenticated sandbox env: ${missing.join(', ')}`);

    requireApprovedSandboxForMutation();
    const appUrl = new URL(process.env.TEST_APP_URL ?? '');
    expect(appUrl.hostname, 'smoke test must not target production').not.toMatch(/^(www\.)?servsync\.app$/i);

    const timestamp = Date.now();
    const requestTitle = `E2E Schedule Invoice Request ${timestamp}`;
    const estimateTitle = `E2E Payment Schedule Estimate ${timestamp}`;

    const homeownerRequest = await freshRolePage(browser, 'homeowner');
    await createHomeownerServiceRequest(homeownerRequest.page, requestTitle);
    homeownerRequest.consoleErrors.assertClean(testInfo);
    await homeownerRequest.context.close();

    const contractorEstimate = await freshRolePage(browser, 'contractor');
    await createAndSendScheduledEstimateFromRequest(contractorEstimate.page, requestTitle, estimateTitle);
    contractorEstimate.consoleErrors.assertClean(testInfo);
    await contractorEstimate.context.close();

    const homeownerReview = await freshRolePage(browser, 'homeowner');
    await acceptHomeownerEstimate(homeownerReview.page, estimateTitle);
    homeownerReview.consoleErrors.assertClean(testInfo);
    await homeownerReview.context.close();

    const contractorInvoice = await freshRolePage(browser, 'contractor');
    let estimateCard = await acceptedContractorEstimateCard(contractorInvoice.page, estimateTitle);
    let scheduleSection = await expectScheduleSummary(estimateCard, 0, 2, '$200.00');
    let scheduleRows = scheduleSection.getByTestId('contractor-estimate-payment-schedule-row');
    await expect(scheduleRows).toHaveCount(2);
    await expect(scheduleRows.nth(0).getByTestId('contractor-create-schedule-invoice')).toBeVisible();
    await expect(scheduleRows.nth(0).getByRole('button', { name: /Open invoice/i })).toHaveCount(0);
    await expect(scheduleRows.nth(1).getByTestId('contractor-create-schedule-invoice')).toBeVisible();

    const scheduleInvoiceRpc = contractorInvoice.page.waitForResponse((response) =>
      response.url().includes('/rpc/servsync_create_invoice_from_estimate_schedule_item'),
    );
    await scheduleRows.nth(0).getByTestId('contractor-create-schedule-invoice').click();
    const rpcResponse = await scheduleInvoiceRpc;
    expect(rpcResponse.ok(), 'schedule-row invoice RPC should succeed').toBeTruthy();

    await expect(main(contractorInvoice.page).getByRole('heading', { name: /Edit invoice/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(main(contractorInvoice.page).getByRole('textbox', { name: /Invoice title/i })).toHaveValue(
      new RegExp(`^Deposit - ${escapeRegExp(estimateTitle)}$`),
    );
    await expect(main(contractorInvoice.page)).toContainText(/Deposit/i);
    await expect(main(contractorInvoice.page)).toContainText(/\$100\.00/);

    estimateCard = await acceptedContractorEstimateCard(contractorInvoice.page, estimateTitle);
    scheduleSection = await expectScheduleSummary(estimateCard, 1, 2, '$100.00');
    const linkedInvoiceSummary = scheduleSection.getByTestId('contractor-estimate-payment-schedule-summary');
    await expect(linkedInvoiceSummary).toContainText(/Loaded invoice statuses/i);
    await expect(linkedInvoiceSummary).toContainText(/1 draft/i);
    scheduleRows = scheduleSection.getByTestId('contractor-estimate-payment-schedule-row');

    await expect(scheduleRows.nth(0)).toContainText(/Draft invoice created/i);
    await expect(scheduleRows.nth(0).getByRole('button', { name: /Open invoice/i })).toBeVisible();
    await expect(scheduleRows.nth(0).getByTestId('contractor-create-schedule-invoice')).toHaveCount(0);
    await expect(scheduleRows.nth(1).getByTestId('contractor-create-schedule-invoice')).toBeVisible();

    await scheduleRows.nth(0).getByRole('button', { name: /Open invoice/i }).click();
    await expect(main(contractorInvoice.page).getByRole('heading', { name: /Edit invoice/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(main(contractorInvoice.page).getByRole('textbox', { name: /Invoice title/i })).toHaveValue(
      new RegExp(`^Deposit - ${escapeRegExp(estimateTitle)}$`),
    );

    contractorInvoice.consoleErrors.assertClean(testInfo);
    await contractorInvoice.context.close();
  });
});

test.describe('contractor schedule invoice smoke source guards', () => {
  test('keeps the schedule-row invoice UI on the approved RPC path', async () => {
    const source = await readFile(path.join(REPO_ROOT, 'src/App.tsx'), 'utf8');
    const fullCoreSmokeSource = await readFile(path.join(REPO_ROOT, 'tests/e2e/full-core-loop.spec.ts'), 'utf8');

    expect(source).toContain('servsync_create_invoice_from_estimate_schedule_item');
    expect(source).toContain('contractor-create-schedule-invoice');
    expect(source).toContain('canUseGenericEstimateInvoiceAction = canCreateInvoiceDraftFromEstimate && !hasPaymentScheduleRows');
    expect(source).toContain('This schedule row is linked to a voided invoice. Replacement invoices are not supported yet.');

    const scheduleInvoiceHandlerStart = source.indexOf('const createInvoiceFromEstimateScheduleItem = async');
    expect(scheduleInvoiceHandlerStart, 'schedule invoice handler should exist').toBeGreaterThanOrEqual(0);
    const scheduleInvoiceHandlerEnd = source.indexOf('const renderContractorEstimatePaymentScheduleSection', scheduleInvoiceHandlerStart);
    expect(scheduleInvoiceHandlerEnd, 'handler should be bounded before the renderer').toBeGreaterThan(scheduleInvoiceHandlerStart);
    const scheduleInvoiceHandler = source.slice(scheduleInvoiceHandlerStart, scheduleInvoiceHandlerEnd);

    expect(scheduleInvoiceHandler).toContain('servsync_create_invoice_from_estimate_schedule_item');
    expect(scheduleInvoiceHandler).not.toContain(".from('invoices')");
    expect(scheduleInvoiceHandler).not.toContain(".from('invoice_line_items')");
    expect(scheduleInvoiceHandler).not.toContain(".from('estimate_payment_schedule_items')");
    expect(scheduleInvoiceHandler).not.toContain('linked_invoice_id');
    expect(scheduleInvoiceHandler).not.toMatch(/home history|home_history|stripe|quickbooks|sendgrid|twilio/i);

    expect(fullCoreSmokeSource).toContain("const PRODUCTION_TEST_ACCOUNT_SMOKE_OPT_IN = 'ALLOW_PRODUCTION_TEST_ACCOUNT_SMOKE';");
    expect(fullCoreSmokeSource).toContain('process.env[PRODUCTION_TEST_ACCOUNT_SMOKE_OPT_IN] === \'true\'');
    expect(fullCoreSmokeSource).toContain('url.includes(SANDBOX_SUPABASE_REF)');
    expect(fullCoreSmokeSource).toContain('productionConnectedTestAccountRun');
    expect(fullCoreSmokeSource).toContain('SUPABASE_SERVICE_ROLE_KEY');

    const workItemCompletionStart = fullCoreSmokeSource.indexOf('async function markSeededPricedWorkItemsCompleted');
    expect(workItemCompletionStart, 'work-item completion helper should exist').toBeGreaterThanOrEqual(0);
    const workItemCompletionEnd = fullCoreSmokeSource.indexOf('async function setPropertyScopeAllIfAvailable', workItemCompletionStart);
    expect(workItemCompletionEnd, 'work-item completion helper should be bounded').toBeGreaterThan(workItemCompletionStart);
    const workItemCompletionHelper = fullCoreSmokeSource.slice(workItemCompletionStart, workItemCompletionEnd);

    expect(workItemCompletionHelper).toContain('productionConnectedTestAccountRun');
    expect(workItemCompletionHelper).toContain('productionTestAccountSmokeOptedIn');
    expect(workItemCompletionHelper).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()');
    expect(workItemCompletionHelper).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY[^?]*requiredEnv/);
  });
});
