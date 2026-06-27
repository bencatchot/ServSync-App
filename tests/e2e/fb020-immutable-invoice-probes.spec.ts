import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const PROBE_ENABLED = process.env.FB020_IMMUTABLE_INVOICE_PROBES === 'true';

type AuthenticatedClient = {
  client: SupabaseClient;
  role: 'owner' | 'homeowner';
  userId: string;
};

type ProbeResult = {
  action: string;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'partially_paid' | 'void' | 'overdue';
  expectedV1: 'allowed' | 'denied';
  observed: 'allowed' | 'denied';
  message?: string;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run FB-020 immutable-invoice probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`FB-020 immutable-invoice probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function projectRefForSandboxSql() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  return existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';
}

function requireLinkedSandboxForExactCleanup() {
  const linkedProjectRef = projectRefForSandboxSql();
  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing immutable-invoice probe setup/cleanup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }
}

function quoteUuidList(ids: string[]) {
  return ids
    .map(id => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error(`Refusing sandbox cleanup for invalid UUID "${id}".`);
      }
      return `'${id}'::uuid`;
    })
    .join(', ');
}

function cleanupExactSandboxProbeRows(invoiceIds: string[]) {
  const exactInvoiceIds = [...new Set(invoiceIds)];
  if (exactInvoiceIds.length === 0) return;

  requireLinkedSandboxForExactCleanup();
  const invoiceList = quoteUuidList(exactInvoiceIds);
  const sql = `
begin;
delete from public.notifications where invoice_id in (${invoiceList});
delete from public.invoice_backlog_items where invoice_id in (${invoiceList});
delete from public.invoice_line_items where invoice_id in (${invoiceList});
update public.job_work_items
   set billing_status = case when billing_status = 'not_billable' then 'not_billable' else 'unbilled' end,
       reserved_invoice_id = null,
       invoiced_invoice_id = null,
       updated_at = now()
 where reserved_invoice_id in (${invoiceList})
    or invoiced_invoice_id in (${invoiceList});
delete from public.invoices where id in (${invoiceList});
commit;
  `.trim();

  execFileSync('supabase', ['db', 'query', '--linked', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

async function signIn(emailEnv: string, passwordEnv: string, role: AuthenticatedClient['role']): Promise<AuthenticatedClient> {
  const { url, anonKey } = requireSandboxSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: requiredEnv(emailEnv),
    password: requiredEnv(passwordEnv),
  });

  expect(error, `${role} login should succeed`).toBeNull();
  expect(data.user?.id, `${role} auth user should be present`).toBeTruthy();

  return { client, role, userId: data.user!.id };
}

async function signOutAll(accounts: Array<AuthenticatedClient | null | undefined>) {
  await Promise.all(accounts.filter(Boolean).map(account => account!.client.auth.signOut().catch(() => undefined)));
}

async function contractorProfileId(owner: AuthenticatedClient): Promise<string> {
  const own = await owner.client
    .from('contractor_profiles')
    .select('id')
    .eq('owner_user_id', owner.userId)
    .maybeSingle();

  expect(own.error, 'owner contractor lookup should not error').toBeNull();
  expect(own.data?.id, 'owner contractor profile should exist').toBeTruthy();
  return own.data!.id as string;
}

async function createDraftInvoiceWithLine(
  owner: AuthenticatedClient,
  contractorId: string,
  homeownerUserId: string,
  label: string,
) {
  const invoice = await owner.client
    .from('invoices')
    .insert({
      contractor_id: contractorId,
      homeowner_user_id: homeownerUserId,
      title: `Codex FB-020 Immutable Invoice ${label} ${Date.now().toString(36)}`,
      scope: 'Sandbox-only immutable invoice direct-mutation probe.',
      status: 'draft',
      subtotal_cents: 1000,
      total_cents: 1000,
      amount_paid_cents: 0,
    })
    .select('id')
    .single();

  expect(invoice.error, `${label} draft invoice fixture should create`).toBeNull();
  const invoiceId = invoice.data!.id as string;

  const line = await owner.client
    .from('invoice_line_items')
    .insert({
      invoice_id: invoiceId,
      line_type: 'labor',
      description: `Codex immutable invoice line ${label}`,
      line_title: `Codex immutable invoice line ${label}`,
      quantity: 1,
      unit: 'each',
      unit_price_cents: 1000,
      sort_order: 0,
    })
    .select('id')
    .single();

  expect(line.error, `${label} invoice line fixture should create`).toBeNull();

  return { invoiceId, lineId: line.data!.id as string };
}

async function sendInvoice(owner: AuthenticatedClient, invoiceId: string) {
  const result = await owner.client.rpc('servsync_send_invoice', { p_invoice_id: invoiceId });
  expect(result.error, 'send invoice RPC fixture transition should succeed').toBeNull();
}

async function markInvoicePaid(owner: AuthenticatedClient, invoiceId: string) {
  const result = await owner.client.rpc('servsync_mark_invoice_paid', { p_invoice_id: invoiceId });
  expect(result.error, 'mark paid RPC fixture transition should succeed').toBeNull();
}

async function voidInvoice(owner: AuthenticatedClient, invoiceId: string) {
  const result = await owner.client.rpc('servsync_void_invoice', { p_invoice_id: invoiceId });
  expect(result.error, 'void invoice RPC fixture transition should succeed').toBeNull();
}

async function attemptProbe(
  action: string,
  status: ProbeResult['status'],
  expectedV1: ProbeResult['expectedV1'],
  operation: () => Promise<{ id?: string | null; error?: { message?: string } | null }>,
): Promise<ProbeResult> {
  const result = await operation();
  const observed = result.error ? 'denied' : 'allowed';
  const probe: ProbeResult = {
    action,
    status,
    expectedV1,
    observed,
    message: result.error?.message,
  };
  console.log(`[FB-020 immutable invoice probe] ${status} ${action}: expected=${expectedV1} observed=${observed}${probe.message ? ` (${probe.message})` : ''}`);
  return probe;
}

test.describe('FB-020 sandbox immutable invoice direct-mutation probes', () => {
  let owner!: AuthenticatedClient;
  let homeowner!: AuthenticatedClient;
  let contractorId = '';
  const createdInvoiceIds: string[] = [];

  test.beforeAll(async () => {
    test.skip(
      !PROBE_ENABLED,
      'Set FB020_IMMUTABLE_INVOICE_PROBES=true to run these sandbox-mutating immutable invoice probes.',
    );
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();
    requireLinkedSandboxForExactCleanup();

    owner = await signIn('TEST_CONTRACTOR_EMAIL', 'TEST_CONTRACTOR_PASSWORD', 'owner');
    homeowner = await signIn('TEST_HOMEOWNER_EMAIL', 'TEST_HOMEOWNER_PASSWORD', 'homeowner');
    contractorId = await contractorProfileId(owner);
  });

  test.afterAll(async () => {
    cleanupExactSandboxProbeRows(createdInvoiceIds);
    await signOutAll([owner, homeowner]);
  });

  test('reports direct invoice and line mutation exposure after customer-facing statuses', async () => {
    const results: ProbeResult[] = [];

    const sent = await createDraftInvoiceWithLine(owner, contractorId, homeowner.userId, 'Sent');
    createdInvoiceIds.push(sent.invoiceId);
    await sendInvoice(owner, sent.invoiceId);

    const paid = await createDraftInvoiceWithLine(owner, contractorId, homeowner.userId, 'Paid');
    createdInvoiceIds.push(paid.invoiceId);
    await sendInvoice(owner, paid.invoiceId);
    await markInvoicePaid(owner, paid.invoiceId);

    const voided = await createDraftInvoiceWithLine(owner, contractorId, homeowner.userId, 'Void');
    createdInvoiceIds.push(voided.invoiceId);
    await sendInvoice(owner, voided.invoiceId);
    await voidInvoice(owner, voided.invoiceId);

    for (const invoice of [
      { status: 'sent' as const, id: sent.invoiceId, lineId: sent.lineId },
      { status: 'paid' as const, id: paid.invoiceId, lineId: paid.lineId },
      { status: 'void' as const, id: voided.invoiceId, lineId: voided.lineId },
    ]) {
      results.push(await attemptProbe('direct invoice update', invoice.status, 'denied', async () => {
        const result = await owner.client
          .from('invoices')
          .update({ notes: `Mutated by immutable invoice probe ${Date.now().toString(36)}` })
          .eq('id', invoice.id)
          .select('id')
          .single();
        return { id: result.data?.id as string | undefined, error: result.error };
      }));

      results.push(await attemptProbe('direct invoice line insert', invoice.status, 'denied', async () => {
        const result = await owner.client
          .from('invoice_line_items')
          .insert({
            invoice_id: invoice.id,
            line_type: 'fee',
            description: `Inserted after ${invoice.status} by immutable invoice probe`,
            line_title: `Inserted after ${invoice.status}`,
            quantity: 1,
            unit: 'each',
            unit_price_cents: 111,
            sort_order: 50,
          })
          .select('id')
          .single();
        return { id: result.data?.id as string | undefined, error: result.error };
      }));

      results.push(await attemptProbe('direct invoice line update', invoice.status, 'denied', async () => {
        const result = await owner.client
          .from('invoice_line_items')
          .update({ description: `Updated after ${invoice.status} by immutable invoice probe` })
          .eq('id', invoice.lineId)
          .select('id')
          .single();
        return { id: result.data?.id as string | undefined, error: result.error };
      }));
    }

    const exposures = results.filter(result => result.expectedV1 === 'denied' && result.observed === 'allowed');
    console.log(`[FB-020 immutable invoice probe] customer-facing direct mutation exposures: ${JSON.stringify(exposures)}`);
    expect(results.map(result => result.observed).every(status => status === 'allowed' || status === 'denied')).toBe(true);
    expect(exposures, 'direct edits to sent, paid, or void invoice records should be denied after immutable invoice hardening').toEqual([]);
  });

  test('reports draft edit behavior remains available for billing-authorized users', async () => {
    const results: ProbeResult[] = [];
    const draft = await createDraftInvoiceWithLine(owner, contractorId, homeowner.userId, 'Draft');
    createdInvoiceIds.push(draft.invoiceId);

    results.push(await attemptProbe('direct invoice update', 'draft', 'allowed', async () => {
      const result = await owner.client
        .from('invoices')
        .update({ notes: 'Draft mutation allowed by immutable invoice probe.' })
        .eq('id', draft.invoiceId)
        .select('id')
        .single();
      return { id: result.data?.id as string | undefined, error: result.error };
    }));

    results.push(await attemptProbe('direct invoice line insert', 'draft', 'allowed', async () => {
      const result = await owner.client
        .from('invoice_line_items')
        .insert({
          invoice_id: draft.invoiceId,
          line_type: 'fee',
          description: 'Draft insert allowed by immutable invoice probe.',
          line_title: 'Draft insert allowed',
          quantity: 1,
          unit: 'each',
          unit_price_cents: 222,
          sort_order: 60,
        })
        .select('id')
        .single();
      return { id: result.data?.id as string | undefined, error: result.error };
    }));

    results.push(await attemptProbe('direct invoice line update', 'draft', 'allowed', async () => {
      const result = await owner.client
        .from('invoice_line_items')
        .update({ description: 'Draft update allowed by immutable invoice probe.' })
        .eq('id', draft.lineId)
        .select('id')
        .single();
      return { id: result.data?.id as string | undefined, error: result.error };
    }));

    results.push(await attemptProbe('direct invoice line delete', 'draft', 'allowed', async () => {
      const result = await owner.client
        .from('invoice_line_items')
        .delete()
        .eq('id', draft.lineId)
        .select('id')
        .single();
      return { id: result.data?.id as string | undefined, error: result.error };
    }));

    const unexpectedDenials = results.filter(result => result.expectedV1 === 'allowed' && result.observed === 'denied');
    console.log(`[FB-020 immutable invoice probe] draft direct edit results: ${JSON.stringify(results)}`);
    expect(unexpectedDenials, 'direct draft invoice and line edits should remain available').toEqual([]);
  });

  test('reports approved invoice lifecycle RPCs and homeowner visibility still work', async () => {
    const rpcInvoice = await createDraftInvoiceWithLine(owner, contractorId, homeowner.userId, 'Lifecycle');
    createdInvoiceIds.push(rpcInvoice.invoiceId);

    await sendInvoice(owner, rpcInvoice.invoiceId);

    const homeownerLineRead = await homeowner.client
      .from('invoice_line_items')
      .select('id')
      .eq('invoice_id', rpcInvoice.invoiceId);
    expect(homeownerLineRead.error, 'homeowner non-draft invoice line read should not error').toBeNull();
    expect(homeownerLineRead.data, 'homeowner should see own non-draft invoice line').toHaveLength(1);

    const viewResult = await homeowner.client.rpc('servsync_homeowner_view_invoice', { p_invoice_id: rpcInvoice.invoiceId });
    expect(viewResult.error, 'homeowner view invoice RPC should succeed').toBeNull();

    await markInvoicePaid(owner, rpcInvoice.invoiceId);

    const voidableInvoice = await createDraftInvoiceWithLine(owner, contractorId, homeowner.userId, 'Voidable');
    createdInvoiceIds.push(voidableInvoice.invoiceId);
    await sendInvoice(owner, voidableInvoice.invoiceId);
    await voidInvoice(owner, voidableInvoice.invoiceId);

    const draftInvoice = await createDraftInvoiceWithLine(owner, contractorId, homeowner.userId, 'HomeownerHiddenDraft');
    createdInvoiceIds.push(draftInvoice.invoiceId);
    const homeownerDraftRead = await homeowner.client
      .from('invoices')
      .select('id')
      .eq('id', draftInvoice.invoiceId);
    expect(homeownerDraftRead.error, 'homeowner draft invoice read should not error').toBeNull();
    expect(homeownerDraftRead.data, 'homeowner should not see draft invoices').toHaveLength(0);

    console.log('[FB-020 immutable invoice probe] approved lifecycle RPCs and homeowner visibility passed.');
  });
});
