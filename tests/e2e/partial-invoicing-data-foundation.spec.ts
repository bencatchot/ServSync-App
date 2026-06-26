import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createInvoicePdf } from '../../src/utils/pdfDocuments';
import type { Invoice } from '../../src/types';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';

type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run partial-invoicing data foundation tests against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Partial-invoicing data foundation tests require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

async function signInAs(key: 'contractor' | 'contractorB' | 'homeowner'): Promise<AuthenticatedClient> {
  const { url, anonKey } = requireSandboxSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword(credentialsFor(key));
  expect(error, `${key} login should succeed`).toBeNull();
  expect(data.user?.id, `${key} auth user should be present`).toBeTruthy();

  return { client, userId: data.user!.id };
}

async function contractorProfileId(account: AuthenticatedClient): Promise<string> {
  const own = await account.client
    .from('contractor_profiles')
    .select('id')
    .eq('owner_user_id', account.userId)
    .maybeSingle();

  expect(own.error, 'Contractor profile owner lookup should not error').toBeNull();
  if (own.data?.id) return own.data.id as string;

  const { data, error } = await account.client.rpc('servsync_current_contractor_profile');
  expect(error, 'Current contractor profile RPC should not error').toBeNull();
  const profile = Array.isArray(data) ? data[0] : data;
  expect(profile?.id, 'Contractor profile should exist in sandbox').toBeTruthy();
  return profile.id as string;
}

async function foundationTableExists(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.from('job_work_items').select('id', { count: 'exact', head: true });
  return !error;
}

test.describe('partial invoicing data foundation', () => {
  let contractorA: AuthenticatedClient;
  let contractorB: AuthenticatedClient;
  let homeownerA: AuthenticatedClient;
  let contractorAId: string;
  let foundationAvailable = false;
  let estimateWorkItemSeedingAvailable = false;

  test.beforeAll(async () => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();

    contractorA = await signInAs('contractor');
    contractorB = await signInAs('contractorB');
    homeownerA = await signInAs('homeowner');
    contractorAId = await contractorProfileId(contractorA);
    foundationAvailable = await foundationTableExists(contractorA.client);
    const seedProbe = await contractorA.client.rpc('servsync_seed_job_work_items_from_estimate', {
      p_estimate_id: crypto.randomUUID(),
      p_inspection_id: crypto.randomUUID(),
    });
    estimateWorkItemSeedingAvailable = Boolean(seedProbe.error)
      && !/could not find the function|function .* does not exist/i.test(seedProbe.error.message);
  });

  test.afterAll(async () => {
    await Promise.all([
      contractorA?.client.auth.signOut().catch(() => undefined),
      contractorB?.client.auth.signOut().catch(() => undefined),
      homeownerA?.client.auth.signOut().catch(() => undefined),
    ]);
  });

  test('creates draft invoice from completed billable items only and snapshots open backlog', async ({ page }, testInfo) => {
    test.skip(!foundationAvailable, 'Partial-invoicing SQL foundation is not applied in this sandbox yet.');

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const suffix = Date.now().toString(36);
    const jobName = `Codex Partial Invoice Smoke ${suffix}`;
    const createdInvoiceIds: string[] = [];

    const jobInsert = await contractorA.client
      .from('inspections')
      .insert({
        contractor_id: contractorAId,
        homeowner_user_id: homeownerA.userId,
        name: jobName,
        summary: 'Partial invoice smoke job.',
        status: 'draft',
        job_status: 'draft',
        rooms_with_findings: [],
      })
      .select('id')
      .single();

    expect(jobInsert.error, 'Smoke job insert should succeed').toBeNull();
    const jobId = jobInsert.data!.id as string;

    try {
      const workItemInsert = await contractorA.client
        .from('job_work_items')
        .insert([
          {
            inspection_id: jobId,
            contractor_id: contractorAId,
            title: 'Completed billable work',
            description: 'Completed work ready to bill.',
            line_type: 'labor',
            quantity: 1,
            unit: 'each',
            unit_price_cents: 12500,
            completion_status: 'completed',
            billing_status: 'unbilled',
            billable: true,
            completed_at: new Date().toISOString(),
            completed_by: contractorA.userId,
            sort_order: 1,
          },
          {
            inspection_id: jobId,
            contractor_id: contractorAId,
            title: 'Open backlog work',
            description: 'Open work that should not be billed yet.',
            line_type: 'labor',
            quantity: 1,
            unit: 'each',
            unit_price_cents: 5000,
            completion_status: 'open',
            billing_status: 'unbilled',
            billable: true,
            sort_order: 2,
          },
          {
            inspection_id: jobId,
            contractor_id: contractorAId,
            title: 'Completed non-billable work',
            description: 'Completed work that should not be billable.',
            line_type: 'labor',
            quantity: 1,
            unit: 'each',
            unit_price_cents: 9900,
            completion_status: 'completed',
            billing_status: 'not_billable',
            billable: false,
            completed_at: new Date().toISOString(),
            completed_by: contractorA.userId,
            sort_order: 3,
          },
          {
            inspection_id: jobId,
            contractor_id: contractorAId,
            title: 'Missing price completed work',
            description: 'Completed work that still needs pricing.',
            line_type: 'material',
            quantity: 1,
            unit: 'each',
            unit_price_cents: null,
            completion_status: 'completed',
            billing_status: 'unbilled',
            billable: true,
            completed_at: new Date().toISOString(),
            completed_by: contractorA.userId,
            sort_order: 4,
          },
        ])
        .select('id,title,completion_status,billing_status,sort_order');

      expect(workItemInsert.error, 'Smoke job work item insert should succeed').toBeNull();
      const insertedWorkItems = [...workItemInsert.data!].sort((a, b) => a.sort_order - b.sort_order);
      const completedItem = insertedWorkItems[0];
      const openItem = insertedWorkItems[1];
      const nonBillableItem = insertedWorkItems[2];
      const missingPriceItem = insertedWorkItems[3];

      const openAttempt = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [openItem.id],
      });
      expect(openAttempt.error, 'Open/incomplete work item should not be invoiceable').toBeTruthy();

      const nonBillableAttempt = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [nonBillableItem.id],
      });
      expect(nonBillableAttempt.error, 'Non-billable work item should not be invoiceable').toBeTruthy();

      await loginAs(page, 'contractor');
      await openSidebarTab(page, /^Jobs\b/i);
      await expectActiveTabHeading(page, /^Jobs$/i);
      await main.getByRole('button', { name: /Open Jobs/i }).click();
      const jobRow = main.getByTestId('contractor-job-row').filter({ hasText: jobName }).first();
      await expect(jobRow).toBeVisible({ timeout: 30_000 });
      await jobRow.getByRole('button', { name: /Continue Job/i }).click();

      const partialPanel = main.getByTestId('partial-invoicing-work-items-panel');
      await expect(partialPanel).toBeVisible({ timeout: 30_000 });
      await expect(partialPanel.getByText(/^Completed, ready to invoice$/i)).toBeVisible();
      await expect(partialPanel.getByText(/^Open backlog$/i).first()).toBeVisible();
      await expect(partialPanel.getByText(/^Price Required$/i).first()).toBeVisible();

      await partialPanel.getByTestId('create-partial-invoice-from-completed-items').click();
      await expect(main.getByRole('heading', { name: /^Create invoice from completed items$/i })).toBeVisible();
      const pricedCheckbox = main.getByRole('checkbox', { name: /^Select work item for invoice: Completed billable work$/i });
      const openCheckbox = main.getByRole('checkbox', { name: /^Select work item for invoice: Open backlog work$/i });
      const missingPriceCheckbox = main.getByRole('checkbox', { name: /^Select work item for invoice: Missing price completed work$/i });
      await expect(pricedCheckbox).toBeEnabled();
      await expect(pricedCheckbox).toBeChecked();
      await expect(openCheckbox).toBeDisabled();
      await expect(missingPriceCheckbox).toBeDisabled();
      await expect(main.getByText(/^Completed non-billable work$/i).first()).toBeVisible();

      const createInvoiceResponse = page.waitForResponse(
        response => response.url().includes('/rpc/servsync_create_partial_invoice_from_job'),
        { timeout: 30_000 },
      );
      await main.getByTestId('confirm-create-partial-invoice').click();
      const createInvoice = await createInvoiceResponse;
      expect(createInvoice.ok(), 'Partial invoice RPC should create draft invoice from the UI').toBeTruthy();
      const createInvoiceData = await createInvoice.json() as { invoice_id?: string };
      const invoiceId = createInvoiceData.invoice_id as string;
      expect(invoiceId, 'Partial invoice RPC should return an invoice id').toBeTruthy();
      createdInvoiceIds.push(invoiceId);

      const lineRows = await contractorA.client
        .from('invoice_line_items')
        .select('id,job_work_item_id,line_title,unit_price_cents')
        .eq('invoice_id', invoiceId)
        .order('sort_order', { ascending: true });
      expect(lineRows.error, 'Invoice line query should succeed').toBeNull();
      expect(lineRows.data).toHaveLength(1);
      expect(lineRows.data![0].job_work_item_id).toBe(completedItem.id);
      expect(lineRows.data![0].unit_price_cents).toBe(12500);

      const invoiceTotals = await contractorA.client
        .from('invoices')
        .select('id, contractor_id, homeowner_user_id, local_contact_id, service_request_id, job_id, estimate_id, home_id, local_home_id, invoice_number, title, scope, notes, terms, status, subtotal_cents, labor_mode, labor_rate_cents, job_labor_hours, material_total_cents, labor_total_cents, fee_total_cents, other_total_cents, tax_cents, tax_rate_percent, discount_cents, discount_type, discount_value, discount_reason, total_cents, amount_paid_cents, issued_at, due_at, paid_at, voided_at, created_at, updated_at, line_items:invoice_line_items(*), backlog_items:invoice_backlog_items(*)')
        .eq('id', invoiceId)
        .single();
      expect(invoiceTotals.error, 'Invoice totals query should succeed').toBeNull();
      expect(invoiceTotals.data!.subtotal_cents).toBe(12500);
      expect(invoiceTotals.data!.tax_cents).toBe(0);
      expect(invoiceTotals.data!.total_cents).toBe(12500);
      expect(invoiceTotals.data!.line_items).toHaveLength(1);
      expect(invoiceTotals.data!.backlog_items).toHaveLength(1);
      expect(invoiceTotals.data!.line_items[0].job_work_item_id).toBe(completedItem.id);
      expect(invoiceTotals.data!.backlog_items[0].job_work_item_id).toBe(openItem.id);
      expect(invoiceTotals.data!.line_items.some(line => line.job_work_item_id === missingPriceItem.id)).toBe(false);

      const invoicePdf = await createInvoicePdf(invoiceTotals.data as Invoice, {
        contractorName: 'Codex Contractor',
        customerName: 'Codex Homeowner',
        serviceLabel: 'Sandbox home',
      });
      expect(invoicePdf.fileName).toMatch(/Codex-Contractor-invoice/i);
      expect(invoicePdf.blob.size, 'Invoice PDF should be generated with line and backlog content').toBeGreaterThan(1000);

      const backlogRows = await contractorA.client
        .from('invoice_backlog_items')
        .select('id,job_work_item_id,title,not_included_reason')
        .eq('invoice_id', invoiceId);
      expect(backlogRows.error, 'Backlog snapshot query should succeed').toBeNull();
      expect(backlogRows.data).toHaveLength(1);
      expect(backlogRows.data![0].job_work_item_id).toBe(openItem.id);
      expect(backlogRows.data![0].not_included_reason).toMatch(/not included/i);

      const completedState = await contractorA.client
        .from('job_work_items')
        .select('billing_status,reserved_invoice_id,invoiced_invoice_id')
        .eq('id', completedItem.id)
        .single();
      expect(completedState.error, 'Completed item state query should succeed').toBeNull();
      expect(completedState.data!.billing_status).toBe('drafted');
      expect(completedState.data!.reserved_invoice_id).toBe(invoiceId);
      expect(completedState.data!.invoiced_invoice_id).toBeNull();

      const duplicateAttempt = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [completedItem.id],
      });
      expect(duplicateAttempt.error, 'Drafted work item should not be double-invoiced').toBeTruthy();

      const unrelatedRead = await contractorB.client.from('job_work_items').select('id').eq('id', completedItem.id);
      expect(unrelatedRead.error, 'Unrelated contractor read should not error').toBeNull();
      expect(unrelatedRead.data).toHaveLength(0);

      const unrelatedUpdate = await contractorB.client
        .from('job_work_items')
        .update({ title: 'Should not update cross-contractor work item' })
        .eq('id', completedItem.id)
        .select('id');
      expect(unrelatedUpdate.error, 'Unrelated contractor update should not error through RLS').toBeNull();
      expect(unrelatedUpdate.data).toHaveLength(0);

      const homeownerDraftBacklogRead = await homeownerA.client.from('invoice_backlog_items').select('id').eq('invoice_id', invoiceId);
      expect(homeownerDraftBacklogRead.error, 'Homeowner draft backlog read should not error').toBeNull();
      expect(homeownerDraftBacklogRead.data).toHaveLength(0);

      const sendInvoice = await contractorA.client.rpc('servsync_send_invoice', { p_invoice_id: invoiceId });
      expect(sendInvoice.error, 'Sending partial invoice should succeed').toBeNull();

      const invoicedState = await contractorA.client
        .from('job_work_items')
        .select('billing_status,reserved_invoice_id,invoiced_invoice_id')
        .eq('id', completedItem.id)
        .single();
      expect(invoicedState.error, 'Invoiced item state query should succeed').toBeNull();
      expect(invoicedState.data!.billing_status).toBe('invoiced');
      expect(invoicedState.data!.reserved_invoice_id).toBeNull();
      expect(invoicedState.data!.invoiced_invoice_id).toBe(invoiceId);

      const homeownerSentBacklogRead = await homeownerA.client.from('invoice_backlog_items').select('id').eq('invoice_id', invoiceId);
      expect(homeownerSentBacklogRead.error, 'Homeowner sent backlog read should not error').toBeNull();
      expect(homeownerSentBacklogRead.data).toHaveLength(1);

      const duplicateInvoicedAttempt = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [completedItem.id],
      });
      expect(duplicateInvoicedAttempt.error, 'Invoiced work item should not be double-invoiced').toBeTruthy();

      const voidInvoice = await contractorA.client.rpc('servsync_void_invoice', { p_invoice_id: invoiceId });
      expect(voidInvoice.error, 'Voiding sent partial invoice should succeed').toBeNull();

      const voidedState = await contractorA.client
        .from('job_work_items')
        .select('billing_status,reserved_invoice_id,invoiced_invoice_id')
        .eq('id', completedItem.id)
        .single();
      expect(voidedState.error, 'Voided item state query should succeed').toBeNull();
      expect(voidedState.data!.billing_status).toBe('unbilled');
      expect(voidedState.data!.reserved_invoice_id).toBeNull();
      expect(voidedState.data!.invoiced_invoice_id).toBeNull();

      const createDraftForLineDelete = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [completedItem.id],
      });
      expect(createDraftForLineDelete.error, 'Second draft after void should be allowed').toBeNull();
      const lineDeleteInvoiceId = createDraftForLineDelete.data.invoice_id as string;
      createdInvoiceIds.push(lineDeleteInvoiceId);

      const removeLine = await contractorA.client.from('invoice_line_items').delete().eq('invoice_id', lineDeleteInvoiceId);
      expect(removeLine.error, 'Deleting draft invoice line should release work item').toBeNull();

      const releasedState = await contractorA.client
        .from('job_work_items')
        .select('billing_status,reserved_invoice_id,invoiced_invoice_id')
        .eq('id', completedItem.id)
        .single();
      expect(releasedState.error, 'Released item state query should succeed').toBeNull();
      expect(releasedState.data!.billing_status).toBe('unbilled');
      expect(releasedState.data!.reserved_invoice_id).toBeNull();
      expect(releasedState.data!.invoiced_invoice_id).toBeNull();
      await consoleErrors.assertClean(testInfo);
    } finally {
      if (createdInvoiceIds.length > 0) {
        await contractorA.client.from('invoice_backlog_items').delete().in('invoice_id', createdInvoiceIds);
        await contractorA.client.from('invoice_line_items').delete().in('invoice_id', createdInvoiceIds);
        await contractorA.client.from('invoices').delete().in('id', createdInvoiceIds).eq('status', 'draft');
      }
      await contractorA.client.from('job_work_items').delete().eq('inspection_id', jobId);
      await contractorA.client.from('inspections').delete().eq('id', jobId);
    }
  });

  test('accepted estimate job creation seeds durable work items without duplicates', async () => {
    test.skip(!foundationAvailable, 'Partial-invoicing SQL foundation is not applied in this sandbox yet.');
    test.skip(!estimateWorkItemSeedingAvailable, 'Partial-invoicing estimate work-item seeding SQL is not applied in this sandbox yet.');

    const suffix = Date.now().toString(36);
    const estimateTitle = `Codex Estimate Work Items ${suffix}`;
    const createdInvoiceIds: string[] = [];
    let estimateId = '';
    let jobId = '';

    try {
      const estimateInsert = await contractorA.client
        .from('estimates')
        .insert({
          contractor_id: contractorAId,
          homeowner_user_id: homeownerA.userId,
          title: estimateTitle,
          scope: 'Accepted estimate scope for durable work-item seeding.',
          notes: 'Contractor notes should stay with the estimate/job context.',
          terms: 'Standard sandbox terms.',
          status: 'accepted',
          subtotal_cents: 12500,
          total_cents: 12500,
          labor_mode: 'line_specific',
          labor_rate_cents: 9500,
        })
        .select('id')
        .single();
      expect(estimateInsert.error, 'Accepted estimate insert should succeed').toBeNull();
      estimateId = estimateInsert.data!.id as string;

      const lineInsert = await contractorA.client
        .from('estimate_line_items')
        .insert([
          {
            estimate_id: estimateId,
            line_type: 'material',
            description: 'Cabinet hinge set legacy description',
            line_title: 'Cabinet hinge set',
            customer_description: 'Replacement hinges for cabinet door.',
            quantity: 2,
            unit: 'set',
            unit_price_cents: null,
            sort_order: 1,
          },
          {
            estimate_id: estimateId,
            line_type: 'labor',
            description: 'Install shelf and repair cabinet door',
            line_title: 'Install shelf and repair cabinet door',
            customer_description: 'Install one shelf and repair loose cabinet door.',
            quantity: 1,
            unit: 'job',
            unit_price_cents: 12500,
            labor_hours: 1.5,
            sort_order: 2,
          },
          {
            estimate_id: estimateId,
            line_type: 'fee',
            description: 'No-charge follow-up check',
            line_title: 'No-charge follow-up check',
            customer_description: 'Included follow-up check.',
            quantity: 1,
            unit: 'each',
            unit_price_cents: 0,
            sort_order: 3,
          },
        ])
        .select('id,line_type,line_title,customer_description,quantity,unit,unit_price_cents,labor_hours,sort_order')
        .order('sort_order', { ascending: true });
      expect(lineInsert.error, 'Estimate line inserts should succeed').toBeNull();
      expect(lineInsert.data).toHaveLength(3);

      const createJob = await contractorA.client.rpc('servsync_create_job_from_estimate', {
        p_estimate_id: estimateId,
      });
      expect(createJob.error, 'Accepted estimate should convert to job').toBeNull();
      expect(createJob.data?.job_id, 'Job id should be returned').toBeTruthy();
      expect(createJob.data?.created, 'First conversion should create a job').toBe(true);
      expect(createJob.data?.work_items_created, 'First conversion should seed one work item per estimate line').toBe(3);
      jobId = createJob.data.job_id as string;

      const jobRows = await contractorA.client
        .from('inspections')
        .select('id, estimate_id, rooms_with_findings')
        .eq('id', jobId)
        .single();
      expect(jobRows.error, 'Linked job query should succeed').toBeNull();
      expect(jobRows.data!.estimate_id).toBe(estimateId);
      expect(JSON.stringify(jobRows.data!.rooms_with_findings)).toContain('Approved Scope');

      const workItems = await contractorA.client
        .from('job_work_items')
        .select('id,source_estimate_line_item_id,title,description,customer_description,line_type,quantity,unit,unit_price_cents,labor_hours,billable,completion_status,billing_status,sort_order')
        .eq('inspection_id', jobId)
        .order('sort_order', { ascending: true });
      expect(workItems.error, 'Seeded work item query should succeed').toBeNull();
      expect(workItems.data).toHaveLength(3);

      for (const [index, line] of lineInsert.data!.entries()) {
        const item = workItems.data![index];
        expect(item.source_estimate_line_item_id).toBe(line.id);
        expect(item.title).toBe(line.line_title);
        expect(item.customer_description).toBe(line.customer_description);
        expect(Number(item.quantity)).toBe(Number(line.quantity));
        expect(item.unit).toBe(line.unit);
        expect(item.unit_price_cents).toBe(line.unit_price_cents);
        expect(Number(item.sort_order)).toBe(Number(line.sort_order));
        expect(item.billable).toBe(true);
        expect(item.completion_status).toBe('open');
        expect(item.billing_status).toBe('unbilled');
      }
      expect(workItems.data![1].line_type).toBe('labor');
      expect(Number(workItems.data![1].labor_hours)).toBe(1.5);
      expect(workItems.data![0].unit_price_cents).toBeNull();
      expect(workItems.data![2].unit_price_cents).toBe(0);

      const retryCreateJob = await contractorA.client.rpc('servsync_create_job_from_estimate', {
        p_estimate_id: estimateId,
      });
      expect(retryCreateJob.error, 'Retrying accepted estimate job creation should succeed').toBeNull();
      expect(retryCreateJob.data?.job_id).toBe(jobId);
      expect(retryCreateJob.data?.created).toBe(false);
      expect(retryCreateJob.data?.work_items_created).toBe(0);

      const retryWorkItems = await contractorA.client
        .from('job_work_items')
        .select('id')
        .eq('inspection_id', jobId);
      expect(retryWorkItems.error, 'Retry seeded work item query should succeed').toBeNull();
      expect(retryWorkItems.data).toHaveLength(3);

      const pricedWorkItem = workItems.data![1];
      const unpricedWorkItem = workItems.data![0];

      const openAttempt = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [pricedWorkItem.id],
      });
      expect(openAttempt.error, 'Open seeded work item should not be invoiceable').toBeTruthy();

      const completePriced = await contractorA.client
        .from('job_work_items')
        .update({
          completion_status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: contractorA.userId,
        })
        .eq('id', pricedWorkItem.id);
      expect(completePriced.error, 'Completing priced seeded work item should succeed').toBeNull();

      const completedUnpriced = await contractorA.client
        .from('job_work_items')
        .update({
          completion_status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: contractorA.userId,
        })
        .eq('id', unpricedWorkItem.id);
      expect(completedUnpriced.error, 'Completing unpriced seeded work item should succeed').toBeNull();

      const unpricedAttempt = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [unpricedWorkItem.id],
      });
      expect(unpricedAttempt.error, 'Completed unpriced work item should remain blocked by Price Required behavior').toBeTruthy();

      const partialInvoice = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [pricedWorkItem.id],
      });
      expect(partialInvoice.error, 'Completed priced seeded work item should create a partial invoice').toBeNull();
      const invoiceId = partialInvoice.data.invoice_id as string;
      expect(invoiceId).toBeTruthy();
      createdInvoiceIds.push(invoiceId);

      const partialInvoiceLine = await contractorA.client
        .from('invoice_line_items')
        .select('job_work_item_id,line_title,unit_price_cents')
        .eq('invoice_id', invoiceId)
        .single();
      expect(partialInvoiceLine.error, 'Partial invoice line query should succeed').toBeNull();
      expect(partialInvoiceLine.data!.job_work_item_id).toBe(pricedWorkItem.id);
      expect(partialInvoiceLine.data!.line_title).toBe(pricedWorkItem.title);
      expect(partialInvoiceLine.data!.unit_price_cents).toBe(12500);
    } finally {
      if (createdInvoiceIds.length > 0) {
        await contractorA.client.from('invoice_backlog_items').delete().in('invoice_id', createdInvoiceIds);
        await contractorA.client.from('invoice_line_items').delete().in('invoice_id', createdInvoiceIds);
        await contractorA.client.from('invoices').delete().in('id', createdInvoiceIds).eq('status', 'draft');
      }
      if (jobId) {
        await contractorA.client.from('job_work_items').delete().eq('inspection_id', jobId);
        await contractorA.client.from('inspections').delete().eq('id', jobId);
      }
      if (estimateId) {
        await contractorA.client.from('estimate_line_items').delete().eq('estimate_id', estimateId);
        await contractorA.client.from('estimates').delete().eq('id', estimateId);
      }
    }
  });
});
