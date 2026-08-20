import { expect, test, type Browser, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { escapeRegExp, timestampForRecord } from './helpers/customers';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const PRODUCTION_HOSTS = new Set(['servsync.app', 'www.servsync.app']);
const PRODUCTION_TEST_ACCOUNT_SMOKE_OPT_IN = 'ALLOW_PRODUCTION_TEST_ACCOUNT_SMOKE';
const DURABLE_SANDBOX_SERVER_ORIGIN = 'https://servsync-stripe-sandbox.vercel.app';

function quoteSqlText(value: string) {
  if (!/^E2E (?:Core Loop|Partial Payment) \d{14}$/.test(value)) {
    throw new Error(`Refusing core-loop cleanup for unexpected record prefix "${value}".`);
  }
  return `'${value.replaceAll("'", "''")}%'`;
}

function cleanupCoreLoopFixtures(recordPrefixes: string[]) {
  if (recordPrefixes.length === 0) return;
  const linkedProject = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  if (linkedProject !== SANDBOX_SUPABASE_REF) {
    throw new Error(`Refusing core-loop cleanup outside Sandbox ${SANDBOX_SUPABASE_REF}.`);
  }
  const patterns = [...new Set(recordPrefixes)].map(quoteSqlText).join(', ');
  const sql = `
begin;
create temporary table audit_request_ids on commit drop as
  select id from public.service_requests where title like any (array[${patterns}]);
create temporary table audit_estimate_ids on commit drop as
  select id from public.estimates where title like any (array[${patterns}]);
create temporary table audit_job_ids on commit drop as
  select id from public.inspections where name like any (array[${patterns}]);
create temporary table audit_invoice_ids on commit drop as
  select id from public.invoices where title like any (array[${patterns}]);
delete from public.home_reminders where title like any (array[${patterns}]);
delete from public.workflow_thread_reads
 where service_request_id in (select id from audit_request_ids)
    or inspection_id in (select id from audit_job_ids);
delete from public.workflow_activity_events
 where service_request_id in (select id from audit_request_ids)
    or estimate_id in (select id from audit_estimate_ids)
    or inspection_id in (select id from audit_job_ids)
    or invoice_id in (select id from audit_invoice_ids);
delete from public.workflow_messages
 where service_request_id in (select id from audit_request_ids)
    or inspection_id in (select id from audit_job_ids);
delete from public.notifications
 where request_id in (select id from audit_request_ids)
    or estimate_id in (select id from audit_estimate_ids)
    or invoice_id in (select id from audit_invoice_ids);
alter table public.invoice_offline_payment_records disable trigger invoice_offline_payment_records_immutable;
delete from public.invoice_offline_payment_records where invoice_id in (select id from audit_invoice_ids);
alter table public.invoice_offline_payment_records enable trigger invoice_offline_payment_records_immutable;
delete from public.invoice_backlog_items where invoice_id in (select id from audit_invoice_ids);
delete from public.invoice_line_items where invoice_id in (select id from audit_invoice_ids);
update public.job_work_items
   set billing_status = case when billing_status = 'not_billable' then 'not_billable' else 'unbilled' end,
       reserved_invoice_id = null,
       invoiced_invoice_id = null,
       updated_at = now()
 where reserved_invoice_id in (select id from audit_invoice_ids)
    or invoiced_invoice_id in (select id from audit_invoice_ids);
delete from public.invoices where id in (select id from audit_invoice_ids);
delete from public.job_work_items where inspection_id in (select id from audit_job_ids);
delete from public.estimate_line_items where estimate_id in (select id from audit_estimate_ids);
delete from public.inspections where id in (select id from audit_job_ids);
delete from public.estimates where id in (select id from audit_estimate_ids);
delete from public.service_request_media where request_id in (select id from audit_request_ids);
delete from public.service_request_messages where request_id in (select id from audit_request_ids);
delete from public.service_requests where id in (select id from audit_request_ids);
commit;
  `.trim();
  execFileSync('supabase', ['db', 'query', '--linked', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

async function installSandboxServerRouteProxy(page: Page) {
  const appUrl = new URL(requiredEnv('TEST_APP_URL'));
  if (!['127.0.0.1', 'localhost'].includes(appUrl.hostname)) return;

  await page.route('**/api/stripe-invoice-payment-state', async route => {
    const request = route.request();
    const headers = {
      ...request.headers(),
      origin: DURABLE_SANDBOX_SERVER_ORIGIN,
      referer: `${DURABLE_SANDBOX_SERVER_ORIGIN}/`,
    };
    delete headers.host;
    const response = await route.fetch({
      url: `${DURABLE_SANDBOX_SERVER_ORIGIN}/api/stripe-invoice-payment-state`,
      method: request.method(),
      headers,
      postData: request.postDataBuffer(),
    });
    await route.fulfill({ response });
  });
}

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

async function freshRolePage(browser: Browser, role: 'contractor' | 'homeowner') {
  const context = await browser.newContext(appContextOptions());
  const page = await context.newPage();
  await installSandboxServerRouteProxy(page);
  const consoleErrors = captureMajorConsoleErrors(page);
  await loginAs(page, role);
  return { context, page, consoleErrors };
}

async function markSeededPricedWorkItemsCompleted(jobId: string) {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const appHost = new URL(requiredEnv('TEST_APP_URL')).hostname.toLowerCase();
  const approvedProductionTestHost = appHost.endsWith('.vercel.app') && !PRODUCTION_HOSTS.has(appHost);
  const productionTestAccountSmokeOptedIn = process.env[PRODUCTION_TEST_ACCOUNT_SMOKE_OPT_IN] === 'true';
  const productionConnectedTestAccountRun =
    url.includes(PRODUCTION_SUPABASE_REF) && approvedProductionTestHost && productionTestAccountSmokeOptedIn;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error('Refusing to complete E2E work items with a service-role key present.');
  }
  if (!url.includes(SANDBOX_SUPABASE_REF) && !productionConnectedTestAccountRun) {
    throw new Error(
      `Refusing to update seeded work items outside sandbox ref ${SANDBOX_SUPABASE_REF}. Production-connected test-account runs require ${PRODUCTION_TEST_ACCOUNT_SMOKE_OPT_IN}=true on an approved Vercel preview host.`,
    );
  }
  const client = createClient(url, requiredEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const signIn = await client.auth.signInWithPassword(credentialsFor('contractor'));
    expect(signIn.error, 'Contractor test-account login for work-item completion should succeed').toBeNull();

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
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

async function verifyPersistedInvoicePaymentState(
  invoiceTitle: string,
  expectedStatus: 'partially_paid' | 'paid',
  expectedAmountPaidCents: number,
) {
  const url = requiredEnv('VITE_SUPABASE_URL');
  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Refusing persisted Invoice verification outside sandbox ref ${SANDBOX_SUPABASE_REF}.`);
  }
  const client = createClient(url, requiredEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const signIn = await client.auth.signInWithPassword(credentialsFor('contractor'));
    expect(signIn.error, 'Contractor test-account login for persisted Invoice verification should succeed').toBeNull();

    const invoice = await client
      .from('invoices')
      .select('status, amount_paid_cents')
      .eq('title', invoiceTitle)
      .single();
    expect(invoice.error, 'Recorded payment Invoice should remain readable after the RPC response').toBeNull();
    expect(invoice.data?.status).toBe(expectedStatus);
    expect(invoice.data?.amount_paid_cents).toBe(expectedAmountPaidCents);
  } finally {
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
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

  if (await issueTextbox.isVisible({ timeout: 2_000 }).catch(() => false)) return issueTextbox;

  const propertySelector = main.getByRole('combobox', { name: /^Request for$/i });
  await expect(propertySelector).toBeVisible({ timeout: 10_000 });

  const selectedValue = await propertySelector.evaluate(select => (select as HTMLSelectElement).value);
  if (!selectedValue) {
    await propertySelector.selectOption({ index: 1 });
  }

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
  await main.getByRole('button', { name: /^New request$/i }).click();

  await advanceServiceRequestComposerToIssueStep(page);
  await chooseConnectedContractorForRequest(page, requestDescription);

  await main.getByRole('textbox', { name: /^Request title$/i }).fill(requestTitle);
  await main.getByRole('textbox', { name: /^Message to contractor$/i }).fill(requestDescription);

  const createRequestResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_commit_service_request_creation'),
    { timeout: 30_000 },
  );
  await main.getByRole('button', { name: /^Send Request$/i }).click();
  expect((await createRequestResponse).ok()).toBeTruthy();

  await expect(main.getByText(/Service request submitted/i)).toBeVisible({ timeout: 30_000 });
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

  await expectActiveTabHeading(page, /^Work$/i);
  await expect(main.getByText(/^Estimate draft$/i)).toBeVisible({ timeout: 30_000 });
  const buildBlankEstimate = main.getByRole('button', { name: /^Build blank estimate\b/i }).first();
  if (await buildBlankEstimate.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await buildBlankEstimate.click();
  }
  await main.getByRole('textbox', { name: /^Estimate title$/i }).fill(estimateTitle);
  await main.getByRole('textbox', { name: /^Scope of work$/i }).fill(`${recordPrefix}: approved service scope for the full sandbox E2E core loop.`);
  const firstLineDescription = main.getByLabel(/^Estimate line item 1 description$/i);
  if (!(await firstLineDescription.isVisible({ timeout: 2_000 }).catch(() => false))) {
    await main.getByRole('button', { name: /^Add blank line$/i }).click();
  }
  await expect(firstLineDescription).toBeVisible({ timeout: 10_000 });
  await firstLineDescription.fill(`${recordPrefix} approved work item`);
  await main.getByRole('spinbutton', { name: /^Estimate line item 1 quantity$/i }).fill('1');
  await main.getByRole('textbox', { name: /^Estimate line item 1 unit price$/i }).fill('125');

  const saveEstimateButton = main.getByRole('button', { name: /^Save estimate draft$/i });
  await expect(saveEstimateButton).toBeEnabled();
  await saveEstimateButton.click();
  await waitForEstimateDraftSave(main, saveEstimateButton);

  await expect(main.getByText(/^Saved estimate draft$/i)).toBeVisible({ timeout: 30_000 });
  const estimateCard = main.getByTestId('contractor-estimate-card').filter({ hasText: estimateTitle });
  await expect(estimateCard).toHaveCount(1, { timeout: 30_000 });
  await expect(estimateCard).toBeVisible({ timeout: 30_000 });

  const sendEstimateResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_send_estimate') && response.request().method() === 'POST',
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

  await openSidebarTab(page, /^Work\b/i);
  await expectActiveTabHeading(page, /^Work$/i);
  await main.getByRole('button', { name: /Open Estimates/i }).click();
  const estimatesTab = main.getByRole('tab', { name: /^Estimates\b/i }).first();
  await estimatesTab.waitFor({ state: 'visible', timeout: 30_000 });
  await estimatesTab.click();
  await main.getByTestId('contractor-estimate-search').fill(estimateTitle);
  await main.getByTestId('contractor-estimate-status-filter').selectOption('approved');

  const acceptedEstimateCard = main.getByTestId('contractor-estimate-card').filter({ hasText: estimateTitle });
  await expect(acceptedEstimateCard).toHaveCount(1, { timeout: 30_000 });
  await expect(acceptedEstimateCard).toBeVisible({ timeout: 30_000 });
  await expect(acceptedEstimateCard.getByTestId('contractor-create-job-from-accepted-estimate')).toBeVisible({ timeout: 30_000 });
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
    response => response.url().includes('/rpc/servsync_update_inspection')
      && response.request().postDataJSON()?.p_inspection_id === jobId,
    { timeout: 30_000 },
  );
  await main.getByTestId('contractor-save-job-progress').click();
  expect((await saveProgressResponse).ok()).toBeTruthy();
  await expect(main.getByText(/Progress (?:saved|is already saving)/i)).toBeVisible({ timeout: 30_000 });
  await markSeededPricedWorkItemsCompleted(jobId);
  await page.reload();

  const persistedWorkCheckbox = main.locator('[data-testid="contractor-approved-work-checkbox"], [data-testid="contractor-work-item-checkbox"]').first();
  await expect(persistedWorkCheckbox).toBeChecked({ timeout: 30_000 });
  await expect(main.getByPlaceholder('Describe work performed, materials used, open follow-up, or completion notes...'))
    .toHaveValue(new RegExp(escapeRegExp(recordPrefix)), { timeout: 30_000 });

  const completeJob = main.getByTestId('contractor-complete-job');
  await expect(completeJob).toBeEnabled({ timeout: 30_000 });
  const completeJobResponse = page.waitForResponse(
    response => response.url().includes('/rest/v1/inspections') && response.request().method() === 'PATCH',
    { timeout: 30_000 },
  );
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

  const createdInvoiceCard = main.getByTestId('contractor-invoice-card').first();
  await expect(createdInvoiceCard).toBeVisible({ timeout: 30_000 });
  await createdInvoiceCard.getByRole('button', { name: /^Edit draft$/i }).click();
  await expect(main.getByRole('heading', { name: /^Edit invoice$/i })).toBeVisible({ timeout: 30_000 });

  const saveAndSendInvoice = main.getByTestId('contractor-save-and-send-invoice');
  await expect(saveAndSendInvoice).toBeVisible({ timeout: 30_000 });
  await main.getByRole('textbox', { name: /^Invoice title$/i }).fill(invoiceTitle);

  const saveInvoiceResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_save_invoice_draft_idempotent'),
    { timeout: 30_000 },
  );
  const sendInvoiceResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_send_invoice'),
    { timeout: 30_000 },
  );
  await saveAndSendInvoice.click();
  expect((await saveInvoiceResponse).ok()).toBeTruthy();
  expect((await sendInvoiceResponse).ok()).toBeTruthy();
  await expect(main.getByText(/^Invoice sent$/i)).toBeVisible({ timeout: 30_000 });

  return { invoiceTitle };
}

async function openContractorInvoiceCard(page: Page, invoiceTitle: string, closed = false) {
  const main = page.getByRole('main');
  await openSidebarTab(page, /^Financials\b/i);
  await expectActiveTabHeading(page, /^Financials$/i);

  const financialsDashboard = main.getByTestId('contractor-financials-dashboard');
  const financialsOverviewTab = main.getByTestId('contractor-financials-header-tab-overview');
  await expect(financialsDashboard.or(financialsOverviewTab).first()).toBeVisible({ timeout: 30_000 });
  if (await financialsOverviewTab.isVisible()) {
    await financialsOverviewTab.click();
  }
  await expect(financialsDashboard).toBeVisible({ timeout: 30_000 });
  await financialsDashboard
    .getByTestId(closed ? 'contractor-financials-summary-closed' : 'contractor-financials-summary-open')
    .click();

  const invoicesTab = main.getByRole('tab', { name: /^Invoices\b/i }).first();
  await invoicesTab.waitFor({ state: 'visible', timeout: 30_000 });
  await expect(invoicesTab).toHaveAttribute('aria-selected', 'true');

  const search = main.getByTestId('contractor-invoice-search');
  await search.waitFor({ state: 'visible', timeout: 30_000 });
  await search.fill(invoiceTitle);
  const expectedStatusFilter = closed ? 'paid' : 'all';
  const statusFilter = main.getByTestId('contractor-invoice-status-filter');
  await statusFilter.selectOption(expectedStatusFilter);
  await expect(statusFilter).toHaveValue(expectedStatusFilter);
  const invoiceCard = main.getByTestId('contractor-invoice-card').filter({ hasText: invoiceTitle }).first();
  await expect(invoiceCard).toBeVisible({ timeout: 30_000 });
  return invoiceCard;
}

async function recordFullOfflinePayment(page: Page, invoiceTitle: string, recordPrefix: string) {
  let invoiceCard = await openContractorInvoiceCard(page, invoiceTitle);
  await invoiceCard.getByTestId('contractor-record-invoice-payment').click();

  const dialog = page.getByRole('dialog', { name: /^Record payment$/i });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByLabel(/^Payment amount$/i)).toHaveValue('125.00');
  await dialog.locator('select').selectOption('check');
  await dialog.locator('input[maxlength="120"]').fill(`${recordPrefix} check`);
  await dialog.locator('textarea[maxlength="500"]').fill(`${recordPrefix}: full offline payment E2E verification.`);

  const paymentResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_record_offline_invoice_payment'),
    { timeout: 30_000 },
  );
  await dialog.getByRole('button', { name: /^Record payment$/i }).click();
  expect((await paymentResponse).ok()).toBeTruthy();
  await expect(page.getByRole('main').getByText(/^Invoice paid$/i)).toBeVisible({ timeout: 30_000 });
  await verifyPersistedInvoicePaymentState(invoiceTitle, 'paid', 12_500);

  await page.reload();
  invoiceCard = await openContractorInvoiceCard(page, invoiceTitle, true);
  await expect(invoiceCard.getByText(/^Paid$/i).first()).toBeVisible();
  const summary = invoiceCard.getByTestId('invoice-payment-summary-detail');
  await expect(summary).toContainText('Amount paid');
  await expect(summary).toContainText('$125.00');
  await expect(summary).toContainText('Balance due');
  await expect(summary).toContainText('$0.00');

  await invoiceCard.getByTestId('contractor-record-invoice-payment').click();
  const historyDialog = page.getByRole('dialog', { name: /^Payment history$/i });
  await expect(historyDialog).toBeVisible({ timeout: 30_000 });
  await expect(historyDialog.getByRole('button', { name: /^Record payment$/i })).toHaveCount(0);
  await expect(historyDialog.getByText(/\$125\.00 · Check/i)).toHaveCount(1);
  await expect(historyDialog.getByText(`${recordPrefix} check`, { exact: false })).toBeVisible();
  await historyDialog.getByRole('button', { name: /^Close payment dialog$/i }).click();

  const downloadPromise = page.waitForEvent('download');
  await invoiceCard.getByRole('button', { name: /^Download PDF$/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/invoice.+\.pdf$/i);
  expect(await download.failure()).toBeNull();
}

async function recordPartialThenFinalOfflinePayment(page: Page, invoiceTitle: string, recordPrefix: string) {
  let invoiceCard = await openContractorInvoiceCard(page, invoiceTitle);
  await invoiceCard.getByTestId('contractor-record-invoice-payment').click();

  let dialog = page.getByRole('dialog', { name: /^Record payment$/i });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel(/^Payment amount$/i).fill('40.00');
  await dialog.locator('select').selectOption('bank_transfer');
  await dialog.locator('input[maxlength="120"]').fill(`${recordPrefix} transfer`);
  await dialog.locator('textarea[maxlength="500"]').fill(`${recordPrefix}: first partial payment.`);
  let paymentResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_record_offline_invoice_payment'),
    { timeout: 30_000 },
  );
  await dialog.getByRole('button', { name: /^Record payment$/i }).click();
  expect((await paymentResponse).ok()).toBeTruthy();
  await expect(page.getByRole('main').getByText(/^Payment recorded$/i)).toBeVisible({ timeout: 30_000 });
  await verifyPersistedInvoicePaymentState(invoiceTitle, 'partially_paid', 4_000);

  await page.reload();
  invoiceCard = await openContractorInvoiceCard(page, invoiceTitle);
  await expect(invoiceCard.getByText(/^Partially Paid$/i).first()).toBeVisible();
  let summary = invoiceCard.getByTestId('invoice-payment-summary-detail');
  await expect(summary).toContainText('Amount paid');
  await expect(summary).toContainText('$40.00');
  await expect(summary).toContainText('Balance due');
  await expect(summary).toContainText('$85.00');

  await invoiceCard.getByTestId('contractor-record-invoice-payment').click();
  dialog = page.getByRole('dialog', { name: /^Record payment$/i });
  await expect(dialog.getByLabel(/^Payment amount$/i)).toHaveValue('85.00');
  await dialog.locator('select').selectOption('cash');
  await dialog.locator('input[maxlength="120"]').fill(`${recordPrefix} cash`);
  await dialog.locator('textarea[maxlength="500"]').fill(`${recordPrefix}: exact remaining balance.`);
  paymentResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_record_offline_invoice_payment'),
    { timeout: 30_000 },
  );
  await dialog.getByRole('button', { name: /^Record payment$/i }).click();
  expect((await paymentResponse).ok()).toBeTruthy();
  await expect(page.getByRole('main').getByText(/^Invoice paid$/i)).toBeVisible({ timeout: 30_000 });
  await verifyPersistedInvoicePaymentState(invoiceTitle, 'paid', 12_500);

  await page.reload();
  invoiceCard = await openContractorInvoiceCard(page, invoiceTitle, true);
  await expect(invoiceCard.getByText(/^Paid$/i).first()).toBeVisible();
  summary = invoiceCard.getByTestId('invoice-payment-summary-detail');
  await expect(summary).toContainText('$125.00');
  await expect(summary).toContainText('$0.00');

  await invoiceCard.getByTestId('contractor-record-invoice-payment').click();
  const historyDialog = page.getByRole('dialog', { name: /^Payment history$/i });
  await expect(historyDialog.getByRole('button', { name: /^Record payment$/i })).toHaveCount(0);
  await expect(historyDialog.getByText(/\$40\.00 · Bank transfer \/ external ACH/i)).toHaveCount(1);
  await expect(historyDialog.getByText(/\$85\.00 · Cash/i)).toHaveCount(1);
  await expect(historyDialog.locator('article')).toHaveCount(2);
}

async function createConnectedSentInvoice(browser: Browser, recordPrefix: string, testInfo: TestInfo) {
  const homeownerRequest = await freshRolePage(browser, 'homeowner');
  const { requestTitle } = await createHomeownerServiceRequest(homeownerRequest.page, recordPrefix);
  await homeownerRequest.consoleErrors.assertClean(testInfo);
  await homeownerRequest.context.close();

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

  return { estimateTitle, invoiceTitle };
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
  const paidInvoices = main.getByRole('button').filter({ hasText: /^Paid \/ Closed/i }).first();
  await expect(paidInvoices).toBeVisible({ timeout: 30_000 });
  await paidInvoices.click();

  const invoiceCard = main.getByTestId('homeowner-invoice-card').filter({ hasText: invoiceTitle }).first();
  await expect(invoiceCard).toBeVisible({ timeout: 30_000 });

  await invoiceCard.getByRole('button', { name: /^View Invoice$/i }).click();
  await expect(invoiceCard.getByText(/Invoice total/i)).toBeVisible({ timeout: 30_000 });

  const fileInvoiceResponse = page.waitForResponse(
    response => response.url().includes('/rpc/servsync_file_invoice_to_home_history'),
    { timeout: 30_000 },
  );
  await invoiceCard.getByTestId('homeowner-file-invoice-to-home-history').click();
  expect((await fileInvoiceResponse).ok()).toBeTruthy();
  await expect(invoiceCard.getByText(/Filed to Home History/i)).toBeVisible({ timeout: 30_000 });
  await expect(invoiceCard.getByTestId('homeowner-invoice-filed-next-step-copy')).toContainText(
    /This invoice is saved in Home History\. You can add a follow-up reminder there for future service\./i,
  );

  await invoiceCard.getByTestId('homeowner-view-filed-invoice-home-history').click();
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
  await openSidebarTab(page, /Home History/i);
  await expectActiveTabHeading(page, /^Home History$/i);
  await setPropertyScopeAllIfAvailable(main, /^Property$/i);
  const refreshedHistoryEntry = main.getByTestId('home-history-entry-card').filter({ hasText: invoiceTitle }).first();
  await expect(refreshedHistoryEntry).toBeVisible({ timeout: 30_000 });
  await expect(refreshedHistoryEntry.getByText(/Linked Home Reminders/i)).toBeVisible({ timeout: 30_000 });
  await expect(refreshedHistoryEntry.getByText(new RegExp(`^${escapeRegExp(reminderTitle)}\\.?$`, 'i'))).toBeVisible({ timeout: 30_000 });
}

test.describe('full sandbox core loop', () => {
  const recordPrefixes: string[] = [];

  test.afterAll(() => {
    cleanupCoreLoopFixtures(recordPrefixes);
  });

  test('homeowner request to paid contractor invoice to Home History reminder', async ({ browser }, testInfo) => {
    requireApprovedSandboxForMutation();
    test.setTimeout(300_000);

    const timestamp = timestampForRecord();
    const recordPrefix = `E2E Core Loop ${timestamp}`;
    recordPrefixes.push(recordPrefix);
    const { invoiceTitle } = await createConnectedSentInvoice(browser, recordPrefix, testInfo);

    const contractorPayment = await freshRolePage(browser, 'contractor');
    await recordFullOfflinePayment(contractorPayment.page, invoiceTitle, recordPrefix);
    await contractorPayment.consoleErrors.assertClean(testInfo);
    await contractorPayment.context.close();

    const homeownerCloseout = await freshRolePage(browser, 'homeowner');
    await fileInvoiceAndCreateReminder(homeownerCloseout.page, invoiceTitle, recordPrefix);
    await homeownerCloseout.consoleErrors.assertClean(testInfo);
    await homeownerCloseout.context.close();
  });

  test('partial offline payment persists before exact final payment', async ({ browser }, testInfo) => {
    requireApprovedSandboxForMutation();
    test.setTimeout(300_000);

    const recordPrefix = `E2E Partial Payment ${timestampForRecord()}`;
    recordPrefixes.push(recordPrefix);
    const { invoiceTitle } = await createConnectedSentInvoice(browser, recordPrefix, testInfo);

    const contractorPayment = await freshRolePage(browser, 'contractor');
    await recordPartialThenFinalOfflinePayment(contractorPayment.page, invoiceTitle, recordPrefix);
    await contractorPayment.consoleErrors.assertClean(testInfo);
    await contractorPayment.context.close();
  });
});
