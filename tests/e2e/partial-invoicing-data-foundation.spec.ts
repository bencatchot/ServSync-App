import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

async function cleanupCreatedInvoices(client: SupabaseClient, invoiceIds: string[]) {
  if (invoiceIds.length === 0) return;
  await client.from('invoice_backlog_items').delete().in('invoice_id', invoiceIds);
  await client.from('invoice_line_items').delete().in('invoice_id', invoiceIds);
  await client.from('invoices').delete().in('id', invoiceIds);

  const remaining = await client.from('invoices').select('id').in('id', invoiceIds);
  expect(remaining.error, 'Invoice cleanup verification should be readable by the test contractor').toBeNull();
  const remainingIds = (remaining.data ?? []).map(row => row.id as string);
  if (remainingIds.length === 0) return;

  cleanupCreatedInvoicesWithSandboxSql(remainingIds);
}

function cleanupCreatedInvoicesWithSandboxSql(invoiceIds: string[]) {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';
  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing SQL cleanup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }

  const quotedIds = invoiceIds
    .map(id => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error(`Refusing SQL cleanup for invalid invoice id "${id}".`);
      }
      return `'${id}'::uuid`;
    })
    .join(', ');

  // Contractors can only delete draft invoices through RLS; this removes exact test-created void invoices in sandbox.
  execFileSync(
    'supabase',
    [
      'db',
      'query',
      '--linked',
      `
begin;
delete from public.invoice_backlog_items where invoice_id in (${quotedIds});
delete from public.invoice_line_items where invoice_id in (${quotedIds});
delete from public.invoices where id in (${quotedIds});
commit;
      `.trim(),
    ],
    { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
  );
}

test.describe('partial invoicing data foundation', () => {
  let contractorA: AuthenticatedClient;
  let contractorB: AuthenticatedClient;
  let homeownerA: AuthenticatedClient;
  let contractorAId: string;
  let foundationAvailable = false;
  let estimateWorkItemSeedingAvailable = false;
  let simpleWorkItemSyncAvailable = false;
  let manualWorkItemRpcAvailable = false;

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
    const simpleSyncProbe = await contractorA.client.rpc('servsync_sync_simple_job_work_items', {
      p_inspection_id: crypto.randomUUID(),
    });
    simpleWorkItemSyncAvailable = Boolean(simpleSyncProbe.error)
      && !/could not find the function|function .* does not exist/i.test(simpleSyncProbe.error.message);
    const manualWorkItemProbe = await contractorA.client.rpc('servsync_create_job_work_item', {
      p_inspection_id: crypto.randomUUID(),
      p_title: 'Codex manual work item probe',
    });
    manualWorkItemRpcAvailable = Boolean(manualWorkItemProbe.error)
      && !/could not find the function|function .* does not exist/i.test(manualWorkItemProbe.error.message);
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
      await cleanupCreatedInvoices(contractorA.client, createdInvoiceIds);
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
      await cleanupCreatedInvoices(contractorA.client, createdInvoiceIds);
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

  test('simple service work item sync creates durable source-backed items safely', async () => {
    test.skip(!foundationAvailable, 'Partial-invoicing SQL foundation is not applied in this sandbox yet.');
    test.skip(!simpleWorkItemSyncAvailable, 'Partial-invoicing simple work-item sync SQL is not applied in this sandbox yet.');

    const suffix = Date.now().toString(36);
    const jobName = `Codex Simple Work Items ${suffix}`;
    const createdInvoiceIds: string[] = [];
    let jobId = '';

    const workItemsRoom = {
      room: 'Work Items',
      room_id: `codex-simple-room-${suffix}`,
      display_name: 'Work Items',
      findings: [
        {
          source_key: `codex-simple-task-a-${suffix}`,
          source_type: 'simple_task',
          source_room_id: `codex-simple-room-${suffix}`,
          source_finding_id: `codex-simple-task-a-${suffix}`,
          title: 'Replace faucet cartridge',
          status: 'Fixed On Site',
          notes: 'Internal parts note should stay contractor-side.',
          action: 'Replaced the failed faucet cartridge.',
          due: '',
          photos: [],
        },
        {
          source_key: `codex-simple-task-b-${suffix}`,
          source_type: 'simple_task',
          source_room_id: `codex-simple-room-${suffix}`,
          source_finding_id: `codex-simple-task-b-${suffix}`,
          title: 'Check slow drain',
          status: 'Monitor',
          notes: 'Needs a follow-up if it slows again.',
          action: '',
          due: '',
          photos: [],
        },
        {
          title: 'Legacy ambiguous task without source key',
          status: 'Fixed On Site',
          notes: '',
          action: '',
          due: '',
          photos: [],
        },
      ],
    };

    try {
      const jobInsert = await contractorA.client
        .from('inspections')
        .insert({
          contractor_id: contractorAId,
          homeowner_user_id: homeownerA.userId,
          name: jobName,
          summary: 'Simple job with JSON-backed work items.',
          status: 'draft',
          job_status: 'draft',
          job_type: 'service_visit',
          rooms_with_findings: [
            workItemsRoom,
            {
              room: 'Kitchen',
              room_id: `codex-general-room-${suffix}`,
              display_name: 'Kitchen',
              findings: [
                {
                  source_key: `codex-general-finding-${suffix}`,
                  title: 'General inspection finding should not sync',
                  status: 'Fixed On Site',
                  notes: '',
                  action: '',
                  due: '',
                  photos: [],
                },
              ],
            },
          ],
        })
        .select('id')
        .single();

      expect(jobInsert.error, 'Simple service smoke job insert should succeed').toBeNull();
      jobId = jobInsert.data!.id as string;

      const firstSync = await contractorA.client.rpc('servsync_sync_simple_job_work_items', {
        p_inspection_id: jobId,
      });
      expect(firstSync.error, 'Simple work item sync should succeed').toBeNull();
      expect(firstSync.data?.synced_count).toBe(2);
      expect(firstSync.data?.skipped_missing_source_key_count).toBe(1);

      const syncedItems = await contractorA.client
        .from('job_work_items')
        .select('id,source_type,source_key,source_room_id,source_finding_id,title,description,customer_description,internal_notes,line_type,quantity,unit,unit_price_cents,billable,completion_status,billing_status,sort_order')
        .eq('inspection_id', jobId)
        .order('sort_order', { ascending: true });
      expect(syncedItems.error, 'Synced simple work item query should succeed').toBeNull();
      expect(syncedItems.data).toHaveLength(2);
      expect(syncedItems.data![0].source_type).toBe('simple_task');
      expect(syncedItems.data![0].source_key).toBe(`codex-simple-task-a-${suffix}`);
      expect(syncedItems.data![0].source_room_id).toBe(`codex-simple-room-${suffix}`);
      expect(syncedItems.data![0].source_finding_id).toBe(`codex-simple-task-a-${suffix}`);
      expect(syncedItems.data![0].title).toBe('Replace faucet cartridge');
      expect(syncedItems.data![0].customer_description).toBe('Replaced the failed faucet cartridge.');
      expect(syncedItems.data![0].internal_notes).toBe('Internal parts note should stay contractor-side.');
      expect(syncedItems.data![0].line_type).toBe('other');
      expect(Number(syncedItems.data![0].quantity)).toBe(1);
      expect(syncedItems.data![0].unit).toBe('each');
      expect(syncedItems.data![0].unit_price_cents).toBeNull();
      expect(syncedItems.data![0].billable).toBe(true);
      expect(syncedItems.data![0].completion_status).toBe('completed');
      expect(syncedItems.data![0].billing_status).toBe('unbilled');
      expect(syncedItems.data![1].completion_status).toBe('open');

      const secondSync = await contractorA.client.rpc('servsync_sync_simple_job_work_items', {
        p_inspection_id: jobId,
      });
      expect(secondSync.error, 'Repeating simple work item sync should succeed').toBeNull();
      const duplicateCheck = await contractorA.client
        .from('job_work_items')
        .select('id')
        .eq('inspection_id', jobId);
      expect(duplicateCheck.error, 'Duplicate check query should succeed').toBeNull();
      expect(duplicateCheck.data).toHaveLength(2);

      const renamedRooms = [
        {
          ...workItemsRoom,
          findings: [
            {
              ...workItemsRoom.findings[0],
              title: 'Replace faucet cartridge and handle',
              status: 'Monitor',
              action: 'Faucet still needs final trim confirmation.',
            },
          ],
        },
      ];
      const renameUpdate = await contractorA.client
        .from('inspections')
        .update({ rooms_with_findings: renamedRooms })
        .eq('id', jobId);
      expect(renameUpdate.error, 'Renamed simple task JSON update should succeed').toBeNull();

      const renameSync = await contractorA.client.rpc('servsync_sync_simple_job_work_items', {
        p_inspection_id: jobId,
      });
      expect(renameSync.error, 'Renaming with same source key should sync').toBeNull();
      expect(renameSync.data?.removed_count).toBe(1);

      const afterRename = await contractorA.client
        .from('job_work_items')
        .select('id,title,completion_status,billing_status,billable,source_key')
        .eq('inspection_id', jobId)
        .order('sort_order', { ascending: true });
      expect(afterRename.error, 'Post-rename work item query should succeed').toBeNull();
      expect(afterRename.data).toHaveLength(2);
      const renamedItem = afterRename.data!.find(item => item.source_key === `codex-simple-task-a-${suffix}`)!;
      const removedItem = afterRename.data!.find(item => item.source_key === `codex-simple-task-b-${suffix}`)!;
      expect(renamedItem.id).toBe(syncedItems.data![0].id);
      expect(renamedItem.title).toBe('Replace faucet cartridge and handle');
      expect(renamedItem.completion_status).toBe('open');
      expect(renamedItem.billing_status).toBe('unbilled');
      expect(removedItem.completion_status).toBe('removed');
      expect(removedItem.billing_status).toBe('not_billable');
      expect(removedItem.billable).toBe(false);

      const completeAndPrice = await contractorA.client
        .from('job_work_items')
        .update({
          completion_status: 'completed',
          unit_price_cents: 14500,
          completed_at: new Date().toISOString(),
          completed_by: contractorA.userId,
        })
        .eq('id', renamedItem.id);
      expect(completeAndPrice.error, 'Completing and pricing synced simple work item should succeed').toBeNull();

      const partialInvoice = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [renamedItem.id],
      });
      expect(partialInvoice.error, 'Completed priced synced simple work item should be invoiceable').toBeNull();
      const invoiceId = partialInvoice.data.invoice_id as string;
      expect(invoiceId).toBeTruthy();
      createdInvoiceIds.push(invoiceId);

      const draftedState = await contractorA.client
        .from('job_work_items')
        .select('billing_status,reserved_invoice_id,title,completion_status')
        .eq('id', renamedItem.id)
        .single();
      expect(draftedState.error, 'Drafted synced simple work item state should query').toBeNull();
      expect(draftedState.data!.billing_status).toBe('drafted');
      expect(draftedState.data!.reserved_invoice_id).toBe(invoiceId);

      const resetJsonUpdate = await contractorA.client
        .from('inspections')
        .update({
          rooms_with_findings: [
            {
              ...workItemsRoom,
              findings: [
                {
                  ...workItemsRoom.findings[0],
                  title: 'Should not overwrite drafted work item title',
                  status: 'Monitor',
                },
              ],
            },
          ],
        })
        .eq('id', jobId);
      expect(resetJsonUpdate.error, 'Drafted reset JSON update should succeed').toBeNull();

      const draftedSync = await contractorA.client.rpc('servsync_sync_simple_job_work_items', {
        p_inspection_id: jobId,
      });
      expect(draftedSync.error, 'Sync should not reset drafted work items').toBeNull();

      const preservedDrafted = await contractorA.client
        .from('job_work_items')
        .select('billing_status,title,completion_status,reserved_invoice_id')
        .eq('id', renamedItem.id)
        .single();
      expect(preservedDrafted.error, 'Preserved drafted work item query should succeed').toBeNull();
      expect(preservedDrafted.data!.billing_status).toBe('drafted');
      expect(preservedDrafted.data!.title).toBe('Replace faucet cartridge and handle');
      expect(preservedDrafted.data!.completion_status).toBe('completed');
      expect(preservedDrafted.data!.reserved_invoice_id).toBe(invoiceId);

      const generalFindingRows = await contractorA.client
        .from('job_work_items')
        .select('id')
        .eq('inspection_id', jobId)
        .eq('source_key', `codex-general-finding-${suffix}`);
      expect(generalFindingRows.error, 'General finding work item query should succeed').toBeNull();
      expect(generalFindingRows.data).toHaveLength(0);
    } finally {
      await cleanupCreatedInvoices(contractorA.client, createdInvoiceIds);
      if (jobId) {
        await contractorA.client.from('job_work_items').delete().eq('inspection_id', jobId);
        await contractorA.client.from('inspections').delete().eq('id', jobId);
      }
    }
  });

  test('manual job work item RPCs and editor enforce billing-safe create edit and remove behavior', async ({ page }) => {
    test.skip(!foundationAvailable, 'Partial-invoicing SQL foundation is not applied in this sandbox yet.');
    test.skip(!manualWorkItemRpcAvailable, 'Phase 2C manual work item SQL is not applied in this sandbox yet.');

    const suffix = Date.now().toString(36);
    const jobName = `Codex Manual Work Item Smoke ${suffix}`;
    const createdInvoiceIds: string[] = [];
    let jobId = '';

    const jobInsert = await contractorA.client
      .from('inspections')
      .insert({
        contractor_id: contractorAId,
        homeowner_user_id: homeownerA.userId,
        name: jobName,
        summary: 'Manual work item smoke job.',
        status: 'draft',
        job_status: 'draft',
        rooms_with_findings: [],
      })
      .select('id')
      .single();

    expect(jobInsert.error, 'Manual work item smoke job insert should succeed').toBeNull();
    jobId = jobInsert.data!.id as string;

    try {
      const blankTitle = await contractorA.client.rpc('servsync_create_job_work_item', {
        p_inspection_id: jobId,
        p_title: '   ',
      });
      expect(blankTitle.error, 'Blank manual work item title should be rejected').toBeTruthy();

      const negativeQuantity = await contractorA.client.rpc('servsync_create_job_work_item', {
        p_inspection_id: jobId,
        p_title: 'Negative quantity',
        p_quantity: -1,
      });
      expect(negativeQuantity.error, 'Negative quantity should be rejected').toBeTruthy();

      const negativePrice = await contractorA.client.rpc('servsync_create_job_work_item', {
        p_inspection_id: jobId,
        p_title: 'Negative price',
        p_unit_price_cents: -100,
      });
      expect(negativePrice.error, 'Negative price should be rejected').toBeTruthy();

      const negativeLaborHours = await contractorA.client.rpc('servsync_create_job_work_item', {
        p_inspection_id: jobId,
        p_title: 'Negative labor hours',
        p_labor_hours: -0.5,
      });
      expect(negativeLaborHours.error, 'Negative labor hours should be rejected').toBeTruthy();

      const crossContractorCreate = await contractorB.client.rpc('servsync_create_job_work_item', {
        p_inspection_id: jobId,
        p_title: 'Cross contractor blocked',
      });
      expect(crossContractorCreate.error, 'Another contractor should not create work items for this job').toBeTruthy();

      await loginAs(page, 'contractor');
      const main = page.getByRole('main');
      await openSidebarTab(page, /^Jobs\b/i);
      await expectActiveTabHeading(page, /^Jobs$/i);
      await main.getByRole('button', { name: /Open Jobs/i }).click();
      const jobRow = main.getByTestId('contractor-job-row').filter({ hasText: jobName }).first();
      await expect(jobRow).toBeVisible({ timeout: 30_000 });
      await jobRow.getByRole('button', { name: /Continue Job/i }).click();

      const partialPanel = main.getByTestId('partial-invoicing-work-items-panel');
      await expect(partialPanel).toBeVisible({ timeout: 30_000 });
      await partialPanel.getByTestId('add-manual-job-work-item').click();

      let manualDialog = page.getByRole('dialog', { name: /^Add work item$/i });
      await expect(manualDialog).toBeVisible();
      await manualDialog.getByTestId('save-manual-job-work-item').click();
      await expect(page.getByText('Enter a work item title.')).toBeVisible();

      const uiItemTitle = `Manual UI smoke item ${suffix}`;
      await manualDialog.getByTestId('manual-work-item-title').fill(uiItemTitle);
      await manualDialog.getByTestId('manual-work-item-customer-description').fill('Manual UI smoke description.');
      await manualDialog.getByTestId('manual-work-item-internal-note').fill('Manual UI smoke internal note.');
      await manualDialog.getByTestId('manual-work-item-quantity').fill('2');
      await manualDialog.getByTestId('manual-work-item-unit').fill('each');
      await manualDialog.getByTestId('manual-work-item-unit-price').fill('');
      await manualDialog.getByTestId('save-manual-job-work-item').click();
      await expect(page.getByRole('dialog', { name: /^Add work item$/i })).toBeHidden({ timeout: 30_000 });

      let uiItemRow = partialPanel.getByTestId('job-work-item-row').filter({ hasText: uiItemTitle }).first();
      await expect(uiItemRow).toBeVisible({ timeout: 30_000 });
      await expect(uiItemRow.getByText('Manual UI smoke description.')).toBeVisible();
      await expect(uiItemRow.getByText('Price Required').first()).toBeVisible();

      await uiItemRow.getByRole('button', { name: /^Edit$/i }).click();
      manualDialog = page.getByRole('dialog', { name: /^Edit work item$/i });
      await expect(manualDialog).toBeVisible();
      await expect(manualDialog.getByTestId('manual-work-item-title')).toHaveValue(new RegExp(`^${uiItemTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      const updatedUiItemTitle = `Manual UI smoke item updated ${suffix}`;
      await manualDialog.getByTestId('manual-work-item-title').fill(updatedUiItemTitle);
      await manualDialog.getByTestId('manual-work-item-customer-description').fill('Manual UI smoke description updated.');
      await manualDialog.getByTestId('manual-work-item-unit-price').fill('123.45');
      await manualDialog.getByTestId('manual-work-item-completion-status').selectOption('completed');
      await manualDialog.getByTestId('save-manual-job-work-item').click();
      await expect(page.getByRole('dialog', { name: /^Edit work item$/i })).toBeHidden({ timeout: 30_000 });

      uiItemRow = partialPanel.getByTestId('job-work-item-row').filter({ hasText: updatedUiItemTitle }).first();
      await expect(uiItemRow).toBeVisible({ timeout: 30_000 });
      await expect(uiItemRow.getByText('Manual UI smoke description updated.')).toBeVisible();
      await expect(uiItemRow.getByText('$123.45')).toBeVisible();

      page.once('dialog', dialog => dialog.accept());
      await uiItemRow.getByRole('button', { name: /^Remove$/i }).click();
      uiItemRow = partialPanel.getByTestId('job-work-item-row').filter({ hasText: updatedUiItemTitle }).first();
      await expect(uiItemRow).toBeVisible({ timeout: 30_000 });
      await expect(uiItemRow.getByText(/Not billable/i)).toBeVisible();

      const unpricedCreate = await contractorA.client.rpc('servsync_create_job_work_item', {
        p_inspection_id: jobId,
        p_title: 'Manual unpriced item',
        p_customer_description: 'Customer-facing manual description.',
        p_internal_notes: 'Internal manual note must stay contractor-only.',
        p_line_type: 'material',
        p_quantity: 2,
        p_unit: 'each',
        p_unit_price_cents: null,
        p_labor_hours: null,
        p_billable: true,
        p_completion_status: 'open',
      });
      expect(unpricedCreate.error, 'Unpriced manual item should be created').toBeNull();
      const unpricedItem = unpricedCreate.data as { id: string; unit_price_cents: number | null; source_type: string; billing_status: string };
      expect(unpricedItem.source_type).toBe('manual');
      expect(unpricedItem.unit_price_cents).toBeNull();
      expect(unpricedItem.billing_status).toBe('unbilled');

      const zeroPriceCreate = await contractorA.client.rpc('servsync_create_job_work_item', {
        p_inspection_id: jobId,
        p_title: 'Manual zero-price item',
        p_line_type: 'fee',
        p_quantity: 1,
        p_unit: 'job',
        p_unit_price_cents: 0,
        p_billable: true,
        p_completion_status: 'completed',
      });
      expect(zeroPriceCreate.error, 'Zero-price completed manual item should be created').toBeNull();
      expect((zeroPriceCreate.data as { unit_price_cents: number }).unit_price_cents).toBe(0);

      const openUnpricedAttempt = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [unpricedItem.id],
      });
      expect(openUnpricedAttempt.error, 'Open/unpriced manual item should not be billable').toBeTruthy();

      const editUnpriced = await contractorA.client.rpc('servsync_update_job_work_item', {
        p_work_item_id: unpricedItem.id,
        p_title: 'Manual completed priced item',
        p_customer_description: 'Manual work visible to customer.',
        p_internal_notes: 'Internal note should not become an invoice line.',
        p_line_type: 'labor',
        p_quantity: 1.5,
        p_unit: 'hour',
        p_unit_price_cents: 8000,
        p_labor_hours: 1.5,
        p_billable: true,
        p_completion_status: 'completed',
      });
      expect(editUnpriced.error, 'Unbilled manual item edit should succeed').toBeNull();
      const editedItem = editUnpriced.data as { id: string; title: string; unit_price_cents: number; completion_status: string };
      expect(editedItem.title).toBe('Manual completed priced item');
      expect(editedItem.unit_price_cents).toBe(8000);
      expect(editedItem.completion_status).toBe('completed');

      const removeCreate = await contractorA.client.rpc('servsync_create_job_work_item', {
        p_inspection_id: jobId,
        p_title: 'Manual item to remove',
        p_billable: true,
        p_completion_status: 'open',
      });
      expect(removeCreate.error, 'Manual item for remove should be created').toBeNull();
      const removeItemId = (removeCreate.data as { id: string }).id;

      const crossContractorUpdate = await contractorB.client.rpc('servsync_update_job_work_item', {
        p_work_item_id: editedItem.id,
        p_title: 'Cross contractor update blocked',
      });
      expect(crossContractorUpdate.error, 'Another contractor should not update manual work item').toBeTruthy();

      const crossContractorRemove = await contractorB.client.rpc('servsync_remove_job_work_item', {
        p_work_item_id: removeItemId,
      });
      expect(crossContractorRemove.error, 'Another contractor should not remove manual work item').toBeTruthy();

      const removeResult = await contractorA.client.rpc('servsync_remove_job_work_item', {
        p_work_item_id: removeItemId,
      });
      expect(removeResult.error, 'Unbilled manual item remove should succeed').toBeNull();
      const removedItem = removeResult.data as { completion_status: string; billing_status: string; billable: boolean };
      expect(removedItem.completion_status).toBe('removed');
      expect(removedItem.billing_status).toBe('not_billable');
      expect(removedItem.billable).toBe(false);

      const partialInvoice = await contractorA.client.rpc('servsync_create_partial_invoice_from_job', {
        p_inspection_id: jobId,
        p_work_item_ids: [editedItem.id],
      });
      expect(partialInvoice.error, 'Completed priced manual work item should be invoiceable').toBeNull();
      const invoiceId = partialInvoice.data.invoice_id as string;
      expect(invoiceId).toBeTruthy();
      createdInvoiceIds.push(invoiceId);

      const invoiceLine = await contractorA.client
        .from('invoice_line_items')
        .select('line_title,description,customer_description,unit_price_cents,job_work_item_id')
        .eq('invoice_id', invoiceId)
        .single();
      expect(invoiceLine.error, 'Manual work item invoice line should query').toBeNull();
      expect(invoiceLine.data!.job_work_item_id).toBe(editedItem.id);
      expect(invoiceLine.data!.line_title).toBe('Manual completed priced item');
      expect(invoiceLine.data!.description).not.toMatch(/Internal note/i);
      expect(invoiceLine.data!.customer_description || '').not.toMatch(/Internal note/i);

      const editDrafted = await contractorA.client.rpc('servsync_update_job_work_item', {
        p_work_item_id: editedItem.id,
        p_title: 'Should not edit drafted item',
      });
      expect(editDrafted.error, 'Drafted manual item should not be unsafe-edited').toBeTruthy();

      const removeDrafted = await contractorA.client.rpc('servsync_remove_job_work_item', {
        p_work_item_id: editedItem.id,
      });
      expect(removeDrafted.error, 'Drafted manual item should not be removed').toBeTruthy();
    } finally {
      await cleanupCreatedInvoices(contractorA.client, createdInvoiceIds);
      if (jobId) {
        await contractorA.client.from('job_work_items').delete().eq('inspection_id', jobId);
        await contractorA.client.from('inspections').delete().eq('id', jobId);
      }
    }
  });
});
