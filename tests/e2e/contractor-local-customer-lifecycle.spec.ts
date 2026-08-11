import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  acceptEstimateWithServiceRole,
  bootstrapEstimateSessionWithServiceRole,
  createRequestFreeEstimateDeliveryHandler,
  lookupEstimateResponseWithServiceRole,
  lookupEstimateSessionWithServiceRole,
  respondToEstimateWithServiceRole,
} from '../../api/request-free-local-estimate-delivery';
import {
  bootstrapInvoiceSessionWithServiceRole,
  createRequestFreeInvoiceDeliveryHandler,
  lookupInvoiceSessionWithServiceRole,
} from '../../api/request-free-local-invoice-delivery';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import {
  createLocalE2ECustomer,
  escapeRegExp,
  launchCustomerProfileDraft,
  openE2ECustomerActionPanel,
  timestampForRecord,
  waitForContractorWorkspaceReady,
} from './helpers/customers';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const DURABLE_SANDBOX_SERVER_ORIGIN = 'https://servsync-stripe-sandbox.vercel.app';
const SANDBOX_PROJECT_REF = 'zpzdkoaubyjtsomccxya';

const estimateGateway = createRequestFreeEstimateDeliveryHandler({
  checkEntryRateLimit: async () => ({ rateLimited: false }),
  bootstrapEstimateSession: bootstrapEstimateSessionWithServiceRole,
  lookupEstimateSession: lookupEstimateSessionWithServiceRole,
  lookupEstimateResponse: lookupEstimateResponseWithServiceRole,
  acceptEstimate: acceptEstimateWithServiceRole,
  respondToEstimate: respondToEstimateWithServiceRole,
  generateSessionIdentifier: () => randomBytes(32).toString('hex'),
});

const invoiceGateway = createRequestFreeInvoiceDeliveryHandler({
  checkEntryRateLimit: async () => ({ rateLimited: false }),
  bootstrapInvoiceSession: bootstrapInvoiceSessionWithServiceRole,
  lookupInvoiceSession: lookupInvoiceSessionWithServiceRole,
  generateSessionIdentifier: () => randomBytes(32).toString('hex'),
});

async function withSandboxServiceRole<T>(operation: () => Promise<T>) {
  if (requiredEnv('TEST_SUPABASE_PROJECT_REF') !== SANDBOX_PROJECT_REF
    || !requiredEnv('TEST_SUPABASE_URL').includes(SANDBOX_PROJECT_REF)) {
    throw new Error(`Refusing request-free server validation outside Sandbox ${SANDBOX_PROJECT_REF}.`);
  }
  const previousUrl = process.env.SUPABASE_URL;
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = requiredEnv('TEST_SUPABASE_URL');
  process.env.SUPABASE_SERVICE_ROLE_KEY = requiredEnv('TEST_SUPABASE_SERVICE_ROLE_KEY');
  try {
    return await operation();
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
}

function quoteUuidList(ids: string[]) {
  return [...new Set(ids)].map(id => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error(`Refusing local-lifecycle cleanup for invalid UUID "${id}".`);
    }
    return `'${id}'::uuid`;
  }).join(', ');
}

function cleanupLocalLifecycleFixtures(contactIds: string[]) {
  if (contactIds.length === 0) return;
  const linkedProject = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  if (linkedProject !== SANDBOX_PROJECT_REF) {
    throw new Error(`Refusing local-lifecycle cleanup outside Sandbox ${SANDBOX_PROJECT_REF}.`);
  }
  const contactList = quoteUuidList(contactIds);
  const sql = `
begin;
create temporary table audit_contact_ids(id uuid primary key) on commit drop;
insert into audit_contact_ids values ${contactList.split(', ').map(value => `(${value})`).join(', ')};
create temporary table audit_estimate_ids on commit drop as
  select id from public.estimates where local_contact_id in (select id from audit_contact_ids);
create temporary table audit_job_ids on commit drop as
  select id from public.inspections where local_contact_id in (select id from audit_contact_ids);
create temporary table audit_invoice_ids on commit drop as
  select id from public.invoices where local_contact_id in (select id from audit_contact_ids);
create temporary table audit_draft_ids on commit drop as
  select id from public.contractor_work_drafts where local_contact_id in (select id from audit_contact_ids);
delete from public.notifications
 where estimate_id in (select id from audit_estimate_ids)
    or invoice_id in (select id from audit_invoice_ids);
delete from public.workflow_activity_events
 where estimate_id in (select id from audit_estimate_ids)
    or inspection_id in (select id from audit_job_ids)
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
delete from public.inspections where id in (select id from audit_job_ids);
delete from public.estimate_line_items where estimate_id in (select id from audit_estimate_ids);
delete from public.contractor_work_draft_launches where draft_id in (select id from audit_draft_ids);
delete from public.contractor_work_drafts where id in (select id from audit_draft_ids);
delete from public.estimates where id in (select id from audit_estimate_ids);
delete from public.contractor_local_contacts where id in (select id from audit_contact_ids);
commit;
  `.trim();
  execFileSync('supabase', ['db', 'query', '--linked', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

async function installSandboxServerRoutes(page: Page) {
  for (const path of [
    '/api/request-free-local-estimate-delivery',
    '/api/request-free-local-invoice-delivery',
    '/api/stripe-invoice-payment-state',
  ]) {
    await page.route(`**${path}`, async route => {
      const request = route.request();
      if (path !== '/api/stripe-invoice-payment-state') {
        const requestHeaders = new Headers(request.headers());
        const body = request.postDataBuffer();
        const gatewayRequest = new Request(`https://servsync-sandbox.test${path}`, {
          method: request.method(),
          headers: requestHeaders,
          body: body ? new Uint8Array(body) : undefined,
        });
        const response = await withSandboxServiceRole(() => path.includes('estimate')
          ? estimateGateway(gatewayRequest)
          : invoiceGateway(gatewayRequest));
        const responseHeaders = Object.fromEntries(response.headers.entries());
        await route.fulfill({
          status: response.status,
          headers: responseHeaders,
          body: Buffer.from(await response.arrayBuffer()),
        });
        return;
      }
      const headers = {
        ...request.headers(),
        origin: DURABLE_SANDBOX_SERVER_ORIGIN,
        referer: `${DURABLE_SANDBOX_SERVER_ORIGIN}/`,
      };
      delete headers.host;
      try {
        const response = await route.fetch({
          url: `${DURABLE_SANDBOX_SERVER_ORIGIN}${path}`,
          method: request.method(),
          headers,
          postData: request.postDataBuffer(),
        });
        await route.fulfill({ response });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/Route is already handled|Target page, context or browser has been closed/i.test(message)) return;
        throw error;
      }
    });
  }
}

async function markPricedWorkItemsCompleted(jobId: string) {
  const client = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const signIn = await client.auth.signInWithPassword(credentialsFor('contractor'));
    expect(signIn.error).toBeNull();
    const workItems = await client
      .from('job_work_items')
      .select('id')
      .eq('inspection_id', jobId)
      .eq('billable', true)
      .eq('billing_status', 'unbilled')
      .not('unit_price_cents', 'is', null);
    expect(workItems.error).toBeNull();
    expect(workItems.data?.length ?? 0).toBeGreaterThan(0);
    const completed = await client
      .from('job_work_items')
      .update({
        completion_status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: signIn.data.user!.id,
      })
      .in('id', workItems.data!.map(item => item.id));
    expect(completed.error).toBeNull();
  } finally {
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

async function verifyPersistedPaidInvoice(invoiceTitle: string) {
  const client = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const signIn = await client.auth.signInWithPassword(credentialsFor('contractor'));
    expect(signIn.error).toBeNull();
    const invoice = await client
      .from('invoices')
      .select('id,status,total_cents,amount_paid_cents,paid_at')
      .eq('title', invoiceTitle)
      .single();
    expect(invoice.error).toBeNull();
    expect(invoice.data).toMatchObject({ status: 'paid', total_cents: 12_300, amount_paid_cents: 12_300 });
    expect(invoice.data?.paid_at).toBeTruthy();
    const payments = await client.rpc('servsync_list_invoice_offline_payments', { p_invoice_id: invoice.data!.id });
    expect(payments.error).toBeNull();
    expect(payments.data).toHaveLength(1);
    expect(payments.data[0]).toMatchObject({ amount_cents: 12_300, payment_method: 'cash' });
  } finally {
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

test.describe('contractor-created local Customer lifecycle', () => {
  const createdContactIds: string[] = [];

  test.afterAll(async () => {
    cleanupLocalLifecycleFixtures(createdContactIds);
  });

  test('runs account-free Estimate approval through issued Invoice and offline Paid closeout', async ({ browser }, testInfo) => {
    requireApprovedSandboxForMutation();
    test.setTimeout(300_000);

    const timestamp = timestampForRecord();
    const recordPrefix = `E2E Local Lifecycle ${timestamp}`;
    const estimateTitle = `${recordPrefix} Estimate`;
    const invoiceTitle = `${recordPrefix} Invoice`;

    const contractorContext = await browser.newContext({ baseURL: requiredEnv('TEST_APP_URL') });
    const contractorPage = await contractorContext.newPage();
    await installSandboxServerRoutes(contractorPage);
    const contractorConsole = captureMajorConsoleErrors(contractorPage);
    const main = contractorPage.getByRole('main');

    await loginAs(contractorPage, 'contractor');
    await openSidebarTab(contractorPage, /Customers/i);
    await expectActiveTabHeading(contractorPage, /^Customers$/i);

    const createContactResponse = contractorPage.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_local_contact'),
      { timeout: 30_000 },
    );
    const { customerName } = await createLocalE2ECustomer(contractorPage, timestamp);
    const createdContact = await createContactResponse;
    expect(createdContact.ok()).toBeTruthy();
    const createdPayload = await createdContact.json() as { contact?: { id?: string } };
    expect(createdPayload.contact?.id).toBeTruthy();
    createdContactIds.push(createdPayload.contact!.id!);

    await openE2ECustomerActionPanel(contractorPage, customerName);
    await launchCustomerProfileDraft(contractorPage, {
      customerName,
      output: 'estimate',
      title: estimateTitle,
      scope: `${recordPrefix}: account-free Estimate approval and payment audit.`,
    });

    await expect(main.getByRole('heading', { name: /^Saved estimate draft$/i })).toBeVisible({ timeout: 30_000 });
    let estimateCard = main.getByTestId('contractor-estimate-card').filter({ hasText: estimateTitle }).first();
    await expect(estimateCard).toBeVisible({ timeout: 30_000 });
    await estimateCard.getByRole('button', { name: /^Estimate delivery$/i }).click();
    const issueEstimateResponse = contractorPage.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_local_estimate_delivery_link'),
      { timeout: 30_000 },
    );
    await estimateCard.getByRole('button', { name: /^Issue Estimate & copy link$/i }).click();
    expect((await issueEstimateResponse).ok()).toBeTruthy();
    const estimateLinkDialog = contractorPage.getByRole('dialog', { name: /^Secure Estimate link ready$/i });
    await expect(estimateLinkDialog).toBeVisible();
    const estimateUrl = await estimateLinkDialog.getByRole('textbox', { name: /^One-time link copy$/i }).inputValue();
    expect(estimateUrl).toContain('#/estimate-delivery?access=');

    const recipientContext = await browser.newContext({ baseURL: requiredEnv('TEST_APP_URL') });
    const recipientPage = await recipientContext.newPage();
    await installSandboxServerRoutes(recipientPage);
    const recipientConsole = captureMajorConsoleErrors(recipientPage);
    await recipientPage.goto(estimateUrl);
    await expect(recipientPage.getByTestId('request-free-estimate-acceptance-eligible')).toBeVisible({ timeout: 30_000 });
    const acceptResponse = recipientPage.waitForResponse(
      response => response.url().includes('/api/request-free-local-estimate-delivery') && response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    recipientPage.once('dialog', dialog => dialog.accept());
    await recipientPage.getByRole('button', { name: /^Accept Estimate$/i }).click();
    expect((await acceptResponse).ok()).toBeTruthy();
    await expect(recipientPage.getByTestId('request-free-estimate-accepted')).toBeVisible({ timeout: 30_000 });
    await recipientConsole.assertClean(testInfo);
    await recipientContext.close();

    await contractorPage.reload();
    await openSidebarTab(contractorPage, /^Jobs\b/i);
    await expectActiveTabHeading(contractorPage, /^Jobs$/i);
    const acceptedQueue = main.getByRole('button').filter({ hasText: /\d+ need jobs/i }).first();
    if (await acceptedQueue.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await acceptedQueue.click();
    } else {
      await main.getByRole('button', { name: /Needs Attention/i }).click();
      await main.getByRole('button', { name: new RegExp(`^${escapeRegExp(estimateTitle)}\\b`, 'i') }).click();
    }
    estimateCard = main.getByTestId('contractor-estimate-card').filter({ hasText: estimateTitle }).first();
    await expect(estimateCard.getByText(/^Accepted$/i)).toBeVisible({ timeout: 30_000 });
    const createJobResponse = contractorPage.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_job_from_estimate'),
      { timeout: 30_000 },
    );
    await estimateCard.getByTestId('contractor-create-job-from-accepted-estimate').click();
    const jobResponse = await createJobResponse;
    expect(jobResponse.ok()).toBeTruthy();
    const jobId = ((await jobResponse.json()) as { job_id?: string }).job_id;
    expect(jobId).toBeTruthy();

    const workCheckbox = main.locator('[data-testid="contractor-approved-work-checkbox"], [data-testid="contractor-work-item-checkbox"]').first();
    await expect(workCheckbox).toBeVisible({ timeout: 30_000 });
    if (!(await workCheckbox.isChecked())) await workCheckbox.check();
    const progressResponse = contractorPage.waitForResponse(
      response => response.url().includes('/rpc/servsync_update_inspection'),
      { timeout: 30_000 },
    );
    await main.getByTestId('contractor-save-job-progress').click();
    expect((await progressResponse).ok()).toBeTruthy();
    await markPricedWorkItemsCompleted(jobId!);
    await contractorPage.reload();

    const completeJob = main.getByTestId('contractor-complete-job');
    await expect(completeJob).toBeEnabled({ timeout: 30_000 });
    contractorPage.once('dialog', dialog => dialog.accept());
    const completeResponse = contractorPage.waitForResponse(
      response => response.url().includes('/rest/v1/inspections') && response.request().method() === 'PATCH',
      { timeout: 30_000 },
    );
    await completeJob.click();
    expect((await completeResponse).ok()).toBeTruthy();

    const partialPanel = main.getByTestId('partial-invoicing-work-items-panel');
    await expect(partialPanel).toBeVisible({ timeout: 30_000 });
    await partialPanel.getByTestId('create-partial-invoice-from-completed-items').click();
    await expect(main.getByRole('heading', { name: /^Create invoice from completed items$/i })).toBeVisible();
    const invoiceResponse = contractorPage.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_partial_invoice_from_job'),
      { timeout: 30_000 },
    );
    await main.getByTestId('confirm-create-partial-invoice').click();
    expect((await invoiceResponse).ok()).toBeTruthy();

    let invoiceCard = main.getByTestId('contractor-invoice-card').first();
    await expect(invoiceCard).toBeVisible({ timeout: 30_000 });
    await invoiceCard.getByRole('button', { name: /^Edit draft$/i }).click();
    await main.getByRole('textbox', { name: /^Invoice title$/i }).fill(invoiceTitle);
    const saveInvoiceResponse = contractorPage.waitForResponse(
      response => response.url().includes('/rest/v1/invoices') && ['PATCH', 'POST'].includes(response.request().method()),
      { timeout: 30_000 },
    );
    await main.getByRole('button', { name: /^Update draft invoice$/i }).click();
    expect((await saveInvoiceResponse).ok()).toBeTruthy();

    await expect(main.getByRole('heading', { name: /^Saved invoice draft$/i })).toBeVisible({ timeout: 30_000 });
    invoiceCard = main.getByTestId('contractor-invoice-card').filter({ hasText: invoiceTitle }).first();
    await expect(invoiceCard).toBeVisible({ timeout: 30_000 });
    await invoiceCard.getByRole('button', { name: /^Secure customer link$/i }).click();
    const issueInvoiceResponse = contractorPage.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_local_invoice_delivery_link'),
      { timeout: 30_000 },
    );
    await invoiceCard.getByRole('button', { name: /^Issue invoice & create link$/i }).click();
    expect((await issueInvoiceResponse).ok()).toBeTruthy();
    const invoiceLinkDialog = contractorPage.getByRole('dialog', { name: /^Secure Invoice link ready$/i });
    await expect(invoiceLinkDialog).toBeVisible();
    const invoiceUrl = await invoiceLinkDialog.getByRole('textbox', { name: /^One-time link copy$/i }).inputValue();
    expect(invoiceUrl).toContain('#/invoice-delivery?access=');
    await invoiceLinkDialog.getByRole('button', { name: /^Done$/i }).click();

    const invoiceRecipientContext = await browser.newContext({ baseURL: requiredEnv('TEST_APP_URL') });
    const invoiceRecipientPage = await invoiceRecipientContext.newPage();
    await installSandboxServerRoutes(invoiceRecipientPage);
    const invoiceRecipientConsole = captureMajorConsoleErrors(invoiceRecipientPage);
    await invoiceRecipientPage.goto(invoiceUrl);
    await expect(invoiceRecipientPage.getByTestId('request-free-invoice-valid')).toBeVisible({ timeout: 30_000 });
    await expect(invoiceRecipientPage.getByText(invoiceTitle, { exact: true })).toBeVisible();
    await invoiceRecipientConsole.assertClean(testInfo);
    await invoiceRecipientPage.unrouteAll({ behavior: 'ignoreErrors' });
    await invoiceRecipientContext.close();

    await contractorPage.reload();
    await openSidebarTab(contractorPage, /^Jobs\b/i);
    await waitForContractorWorkspaceReady(contractorPage);
    const openFinancial = main.getByRole('button').filter({ hasText: /Open Estimates \/ Invoices/i }).first();
    if (await openFinancial.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await openFinancial.click();
    } else {
      await main.getByRole('button', { name: /^Invoices:/i }).click();
    }
    await main.getByRole('tab', { name: /^Invoices\b/i }).click();
    await main.getByTestId('contractor-invoice-search').fill(invoiceTitle);
    invoiceCard = main.getByTestId('contractor-invoice-card').filter({ hasText: invoiceTitle }).first();
    await expect(invoiceCard.getByText(/^Sent$/i).first()).toBeVisible({ timeout: 30_000 });
    await invoiceCard.getByTestId('contractor-record-invoice-payment').click();
    const paymentDialog = contractorPage.getByRole('dialog', { name: /^Record payment$/i });
    await expect(paymentDialog.getByLabel(/^Payment amount$/i)).toHaveValue('123.00');
    await paymentDialog.locator('select').selectOption('cash');
    await paymentDialog.locator('textarea[maxlength="500"]').fill(`${recordPrefix}: paid at closeout.`);
    const paymentResponse = contractorPage.waitForResponse(
      response => response.url().includes('/rpc/servsync_record_offline_invoice_payment'),
      { timeout: 30_000 },
    );
    await paymentDialog.getByRole('button', { name: /^Record payment$/i }).click();
    expect((await paymentResponse).ok()).toBeTruthy();

    await verifyPersistedPaidInvoice(invoiceTitle);
    await contractorPage.reload();
    await openSidebarTab(contractorPage, /^Jobs\b/i);
    await expectActiveTabHeading(contractorPage, /^Jobs$/i);
    await main.getByRole('button', { name: /^Invoices:/i }).click();
    await main.getByRole('tab', { name: /^Invoices\b/i }).first().click();
    await main.getByTestId('contractor-invoice-search').fill(invoiceTitle);
    await main.getByTestId('contractor-invoice-status-filter').selectOption('paid');
    invoiceCard = main.getByTestId('contractor-invoice-card').filter({ hasText: invoiceTitle }).first();
    await expect(invoiceCard.getByText(/^Paid$/i).first()).toBeVisible({ timeout: 30_000 });
    const paymentSummary = invoiceCard.getByTestId('invoice-payment-summary-detail');
    await expect(paymentSummary).toContainText('$123.00');
    await expect(paymentSummary).toContainText('$0.00');
    await invoiceCard.getByTestId('contractor-record-invoice-payment').click();
    const historyDialog = contractorPage.getByRole('dialog', { name: /^Payment history$/i });
    await expect(historyDialog.getByRole('button', { name: /^Record payment$/i })).toHaveCount(0);
    await expect(historyDialog.getByText(/\$123\.00 · Cash/i)).toHaveCount(1);
    await historyDialog.getByRole('button', { name: /^Close payment dialog$/i }).click();
    const downloadPromise = contractorPage.waitForEvent('download');
    await invoiceCard.getByRole('button', { name: /^Download PDF$/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/invoice.+\.pdf$/i);
    expect(await download.failure()).toBeNull();

    await contractorConsole.assertClean(testInfo);
    await contractorContext.close();
  });

  test('marks a saved local-customer Draft Invoice paid without sending it', async ({ browser }, testInfo) => {
    requireApprovedSandboxForMutation();
    test.setTimeout(180_000);

    const timestamp = timestampForRecord();
    const recordPrefix = `E2E Local Lifecycle ${timestamp}`;
    const invoiceTitle = `${recordPrefix} Draft Paid Invoice`;
    const paymentReference = `DRAFT-${timestamp}`;
    const paymentNote = `${recordPrefix}: full offline payment before send.`;
    const context = await browser.newContext({ baseURL: requiredEnv('TEST_APP_URL') });
    const page = await context.newPage();
    await installSandboxServerRoutes(page);
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const providerRequests: string[] = [];
    let invoiceSendRequests = 0;
    page.on('request', request => {
      const url = request.url();
      if (/stripe\.com|\/api\/stripe-|\/rpc\/servsync_create_stripe/i.test(url)) providerRequests.push(url);
      if (url.includes('/rpc/servsync_send_invoice')) invoiceSendRequests += 1;
    });

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Customers/i);
    await expectActiveTabHeading(page, /^Customers$/i);
    const createContactResponse = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_local_contact'),
      { timeout: 30_000 },
    );
    const { customerName } = await createLocalE2ECustomer(page, timestamp);
    const createdContact = await createContactResponse;
    expect(createdContact.ok()).toBeTruthy();
    const createdPayload = await createdContact.json() as { contact?: { id?: string } };
    const contactId = createdPayload.contact?.id;
    expect(contactId).toBeTruthy();
    createdContactIds.push(contactId!);

    await openE2ECustomerActionPanel(page, customerName);
    await launchCustomerProfileDraft(page, {
      customerName,
      output: 'invoice',
      title: invoiceTitle,
      scope: `${recordPrefix}: Draft Invoice full-payment audit without delivery.`,
    });

    await expect(main.getByRole('heading', { name: /^Saved invoice draft$/i })).toBeVisible({ timeout: 30_000 });
    let invoiceCard = main.getByTestId('contractor-invoice-card').filter({ hasText: invoiceTitle }).first();
    await expect(invoiceCard.getByText(/^Draft$/i).first()).toBeVisible();
    const markPaidAction = invoiceCard.getByTestId('contractor-record-invoice-payment');
    await expect(markPaidAction).toContainText(/^Mark Paid$/i);
    await markPaidAction.click();

    const paymentDialog = page.getByRole('dialog', { name: /^Mark Paid$/i });
    await expect(paymentDialog).toBeVisible();
    await expect(paymentDialog.getByText(/finalizes the Invoice/i)).toBeVisible();
    await expect(paymentDialog.getByLabel(/^Payment amount$/i)).toHaveValue('123.00');
    await expect(paymentDialog.getByLabel(/^Payment amount$/i)).toHaveAttribute('readonly', '');
    await paymentDialog.locator('select').selectOption('check');
    await paymentDialog.getByLabel(/Reference or check number/i).fill(paymentReference);
    await paymentDialog.getByLabel(/^Note/i).fill(paymentNote);

    const paymentResponse = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_record_offline_invoice_payment'),
      { timeout: 30_000 },
    );
    await paymentDialog.getByRole('button', { name: /^Mark Paid$/i }).click();
    const recordedPayment = await paymentResponse;
    expect(recordedPayment.ok()).toBeTruthy();
    expect(await recordedPayment.json()).toMatchObject({
      created: true,
      status: 'paid',
      amount_paid_cents: 12_300,
      balance_due_cents: 0,
      finalized_from_draft: true,
    });
    await expect(main.getByText(/^Invoice paid$/i)).toBeVisible({ timeout: 30_000 });
    expect(invoiceSendRequests).toBe(0);
    expect(providerRequests).toEqual([]);

    const client = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('VITE_SUPABASE_ANON_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    try {
      const signIn = await client.auth.signInWithPassword(credentialsFor('contractor'));
      expect(signIn.error).toBeNull();
      const invoice = await client
        .from('invoices')
        .select('id,status,total_cents,amount_paid_cents,paid_at,issued_at,local_contact_id,local_home_id,job_id,estimate_id')
        .eq('title', invoiceTitle)
        .single();
      expect(invoice.error).toBeNull();
      expect(invoice.data).toMatchObject({
        status: 'paid',
        total_cents: 12_300,
        amount_paid_cents: 12_300,
        local_contact_id: contactId,
        job_id: null,
        estimate_id: null,
      });
      expect(invoice.data?.local_home_id).toBeTruthy();
      expect(invoice.data?.issued_at).toBeTruthy();
      expect(invoice.data?.paid_at).toBeTruthy();
      const payments = await client.rpc('servsync_list_invoice_offline_payments', { p_invoice_id: invoice.data!.id });
      expect(payments.error).toBeNull();
      expect(payments.data).toHaveLength(1);
      expect(payments.data[0]).toMatchObject({
        amount_cents: 12_300,
        payment_method: 'check',
        reference: paymentReference,
        note: paymentNote,
      });
      const invoiceId = invoice.data!.id;
      if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new Error('Refusing actor verification for malformed Invoice ID.');
      const actorQuery = execFileSync('supabase', [
        'db', 'query', '--linked', '--output', 'json',
        `select recorded_by_user_id::text as recorded_by_user_id from public.invoice_offline_payment_records where invoice_id = '${invoiceId}'::uuid`,
      ], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const actorRows = (JSON.parse(actorQuery) as { rows?: Array<{ recorded_by_user_id?: string }> }).rows ?? [];
      expect(actorRows).toEqual([{ recorded_by_user_id: signIn.data.user!.id }]);
    } finally {
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }

    await page.reload();
    await openSidebarTab(page, /^Jobs\b/i);
    await expectActiveTabHeading(page, /^Jobs$/i);
    await main.getByRole('button', { name: /^Invoices:/i }).click();
    await main.getByRole('tab', { name: /^Invoices\b/i }).first().click();
    await main.getByTestId('contractor-invoice-search').fill(invoiceTitle);
    await main.getByTestId('contractor-invoice-status-filter').selectOption('paid');
    invoiceCard = main.getByTestId('contractor-invoice-card').filter({ hasText: invoiceTitle }).first();
    await expect(invoiceCard.getByText(/^Paid$/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(invoiceCard.getByTestId('invoice-payment-summary-detail')).toContainText('$123.00');
    await expect(invoiceCard.getByTestId('invoice-payment-summary-detail')).toContainText('$0.00');
    await invoiceCard.getByTestId('contractor-record-invoice-payment').click();
    const historyDialog = page.getByRole('dialog', { name: /^Payment history$/i });
    await expect(historyDialog.getByRole('button', { name: /^(?:Mark Paid|Record payment)$/i })).toHaveCount(0);
    await expect(historyDialog.getByText(/\$123\.00 · Check/i)).toHaveCount(1);
    await expect(historyDialog.getByText(`Reference: ${paymentReference}`, { exact: true })).toBeVisible();
    await expect(historyDialog.getByText(paymentNote, { exact: true })).toBeVisible();
    await historyDialog.getByRole('button', { name: /^Close payment dialog$/i }).click();

    const downloadPromise = page.waitForEvent('download');
    await invoiceCard.getByRole('button', { name: /^Download PDF$/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/invoice.+\.pdf$/i);
    expect(await download.failure()).toBeNull();
    expect(invoiceSendRequests).toBe(0);
    expect(providerRequests).toEqual([]);
    await consoleErrors.assertClean(testInfo);
    await context.close();
  });
});
