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

  test.beforeAll(async () => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();

    contractorA = await signInAs('contractor');
    contractorB = await signInAs('contractorB');
    homeownerA = await signInAs('homeowner');
    contractorAId = await contractorProfileId(contractorA);
    foundationAvailable = await foundationTableExists(contractorA.client);
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
});
