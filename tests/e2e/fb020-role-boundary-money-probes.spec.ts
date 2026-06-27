import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const PROBE_ENABLED = process.env.FB020_ROLE_BOUNDARY_PROBES === 'true';

type ContractorProbeRole = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | 'disabled' | 'contractorB';

type AuthenticatedClient = {
  client: SupabaseClient;
  emailName: string;
  role: ContractorProbeRole;
  userId: string;
};

type ProbeResult = {
  action: string;
  role: ContractorProbeRole;
  expectedV1: 'allowed' | 'denied';
  observed: 'allowed' | 'denied';
  message?: string;
};

const ROLE_ENV: Record<ContractorProbeRole, { email: string; password: string; requiredRole?: string }> = {
  owner: {
    email: 'TEST_CONTRACTOR_EMAIL',
    password: 'TEST_CONTRACTOR_PASSWORD',
  },
  admin: {
    email: 'TEST_CONTRACTOR_ADMIN_EMAIL',
    password: 'TEST_CONTRACTOR_ADMIN_PASSWORD',
    requiredRole: 'admin',
  },
  office: {
    email: 'TEST_CONTRACTOR_OFFICE_EMAIL',
    password: 'TEST_CONTRACTOR_OFFICE_PASSWORD',
    requiredRole: 'office',
  },
  field_tech: {
    email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL',
    password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD',
    requiredRole: 'field_tech',
  },
  viewer: {
    email: 'TEST_CONTRACTOR_VIEWER_EMAIL',
    password: 'TEST_CONTRACTOR_VIEWER_PASSWORD',
    requiredRole: 'viewer',
  },
  disabled: {
    email: 'TEST_CONTRACTOR_DISABLED_EMAIL',
    password: 'TEST_CONTRACTOR_DISABLED_PASSWORD',
  },
  contractorB: {
    email: 'TEST_CONTRACTOR_B_EMAIL',
    password: 'TEST_CONTRACTOR_B_PASSWORD',
  },
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run FB-020 role-boundary probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`FB-020 role-boundary probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function optionalRoleConfigured(role: ContractorProbeRole) {
  const env = ROLE_ENV[role];
  return Boolean(process.env[env.email]?.trim() && process.env[env.password]?.trim());
}

function missingRoleEnv(roles: ContractorProbeRole[]) {
  return roles.flatMap(role => {
    const env = ROLE_ENV[role];
    const missing: string[] = [];
    if (!process.env[env.email]?.trim()) missing.push(env.email);
    if (!process.env[env.password]?.trim()) missing.push(env.password);
    return missing;
  });
}

async function signInAs(role: ContractorProbeRole): Promise<AuthenticatedClient> {
  const missing = missingRoleEnv([role]);
  expect(missing, `${role} fixture env vars must be configured`).toEqual([]);

  const { url, anonKey } = requireSandboxSupabaseConfig();
  const env = ROLE_ENV[role];
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: process.env[env.email]!.trim(),
    password: process.env[env.password]!.trim(),
  });

  expect(error, `${role} login should succeed`).toBeNull();
  expect(data.user?.id, `${role} auth user should be present`).toBeTruthy();

  return {
    client,
    emailName: env.email,
    role,
    userId: data.user!.id,
  };
}

async function signOutAll(accounts: Array<AuthenticatedClient | null | undefined>) {
  await Promise.all(accounts.filter(Boolean).map(account => account!.client.auth.signOut().catch(() => undefined)));
}

async function contractorProfileId(account: AuthenticatedClient, label = account.role): Promise<string> {
  const own = await account.client
    .from('contractor_profiles')
    .select('id')
    .eq('owner_user_id', account.userId)
    .maybeSingle();

  expect(own.error, `${label} owner contractor lookup should not error`).toBeNull();
  if (own.data?.id) return own.data.id as string;

  const { data, error } = await account.client.rpc('servsync_current_contractor_profile');
  expect(error, `${label} current contractor profile RPC should not error`).toBeNull();
  const profile = Array.isArray(data) ? data[0] : data;
  expect(profile?.id, `${label} contractor profile should exist`).toBeTruthy();
  return profile.id as string;
}

async function expectTeamRole(
  account: AuthenticatedClient,
  contractorId: string,
  expectedRole: string,
  expectedStatus = 'active',
  lookupClient = account.client,
) {
  const result = await lookupClient
    .from('contractor_team_members')
    .select('role,status,contractor_id,user_id')
    .eq('contractor_id', contractorId)
    .eq('user_id', account.userId)
    .maybeSingle();

  expect(result.error, `${account.role} team membership lookup should not error`).toBeNull();
  expect(result.data?.contractor_id, `${account.role} should be linked to owner contractor fixture`).toBe(contractorId);
  expect(result.data?.role, `${account.role} fixture should have expected role`).toBe(expectedRole);
  expect(result.data?.status, `${account.role} fixture should have expected status`).toBe(expectedStatus);
}

async function expectSameContractor(account: AuthenticatedClient, ownerContractorId: string) {
  const profileId = await contractorProfileId(account);
  expect(profileId, `${account.role} current contractor should match owner contractor fixture`).toBe(ownerContractorId);
}

function projectRefForSandboxSql() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  return existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';
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

function cleanupExactSandboxProbeRows(options: { invoiceIds?: string[]; jobIds?: string[]; workItemIds?: string[] }) {
  const invoiceIds = [...new Set(options.invoiceIds ?? [])];
  const jobIds = [...new Set(options.jobIds ?? [])];
  const workItemIds = [...new Set(options.workItemIds ?? [])];
  if (invoiceIds.length === 0 && jobIds.length === 0 && workItemIds.length === 0) return;

  const linkedProjectRef = projectRefForSandboxSql();
  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing sandbox cleanup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }

  const invoiceList = invoiceIds.length ? quoteUuidList(invoiceIds) : null;
  const jobList = jobIds.length ? quoteUuidList(jobIds) : null;
  const workItemList = workItemIds.length ? quoteUuidList(workItemIds) : null;

  const statements = ['begin;'];
  if (invoiceList) {
    statements.push(`delete from public.notifications where invoice_id in (${invoiceList});`);
    statements.push(`delete from public.invoice_backlog_items where invoice_id in (${invoiceList});`);
    statements.push(`delete from public.invoice_line_items where invoice_id in (${invoiceList});`);
    statements.push(`
update public.job_work_items
   set billing_status = case when billing_status = 'not_billable' then 'not_billable' else 'unbilled' end,
       reserved_invoice_id = null,
       invoiced_invoice_id = null,
       updated_at = now()
 where reserved_invoice_id in (${invoiceList})
    or invoiced_invoice_id in (${invoiceList});
    `.trim());
    statements.push(`delete from public.invoices where id in (${invoiceList});`);
  }
  if (workItemList) {
    statements.push(`delete from public.job_work_items where id in (${workItemList});`);
  }
  if (jobList) {
    statements.push(`delete from public.invoice_backlog_items where invoice_id in (select id from public.invoices where job_id in (${jobList}));`);
    statements.push(`delete from public.invoice_line_items where invoice_id in (select id from public.invoices where job_id in (${jobList}));`);
    statements.push(`delete from public.invoices where job_id in (${jobList});`);
    statements.push(`delete from public.job_work_items where inspection_id in (${jobList});`);
    statements.push(`delete from public.inspections where id in (${jobList});`);
  }
  statements.push('commit;');

  execFileSync('supabase', ['db', 'query', '--linked', statements.join('\n')], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

async function attemptProbe(
  action: string,
  role: ContractorProbeRole,
  expectedV1: 'allowed' | 'denied',
  operation: () => Promise<{ id?: string | null; error?: { message?: string } | null }>,
): Promise<ProbeResult> {
  const result = await operation();
  const observed = result.error ? 'denied' : 'allowed';
  const probe: ProbeResult = {
    action,
    role,
    expectedV1,
    observed,
    message: result.error?.message,
  };
  console.log(`[FB-020 role-boundary probe] ${role} ${action}: expected=${expectedV1} observed=${observed}${probe.message ? ` (${probe.message})` : ''}`);
  return probe;
}

async function createProbeJob(owner: AuthenticatedClient, contractorId: string, homeownerUserId: string, label: string) {
  const result = await owner.client
    .from('inspections')
    .insert({
      contractor_id: contractorId,
      homeowner_user_id: homeownerUserId,
      name: `Codex FB-020 Role Boundary ${label} ${Date.now().toString(36)}`,
      summary: 'Sandbox-only FB-020 role-boundary probe job.',
      status: 'draft',
      job_status: 'completed',
      rooms_with_findings: [],
    })
    .select('id')
    .single();

  expect(result.error, 'owner should create probe job fixture').toBeNull();
  return result.data!.id as string;
}

async function createProbeInvoice(
  owner: AuthenticatedClient,
  contractorId: string,
  homeownerUserId: string,
  status: 'draft' | 'sent' = 'draft',
  jobId?: string,
) {
  const result = await owner.client
    .from('invoices')
    .insert({
      contractor_id: contractorId,
      homeowner_user_id: homeownerUserId,
      job_id: jobId ?? null,
      title: `Codex FB-020 Role Boundary Invoice ${Date.now().toString(36)}`,
      scope: 'Sandbox-only role-boundary probe invoice.',
      status: 'draft',
      subtotal_cents: 1000,
      total_cents: 1000,
      issued_at: null,
    })
    .select('id')
    .single();

  expect(result.error, 'owner should create probe invoice fixture').toBeNull();
  const invoiceId = result.data!.id as string;

  if (status === 'sent') {
    const sendResult = await owner.client.rpc('servsync_send_invoice', { p_invoice_id: invoiceId });
    expect(sendResult.error, 'owner should send probe invoice fixture').toBeNull();
  }

  return invoiceId;
}

async function createProbeWorkItem(owner: AuthenticatedClient, contractorId: string, jobId: string, title: string) {
  const result = await owner.client
    .from('job_work_items')
    .insert({
      inspection_id: jobId,
      contractor_id: contractorId,
      source_type: 'manual',
      source_key: `fb020-probe:${randomUUID()}`,
      title,
      description: 'Sandbox-only role-boundary probe work item.',
      customer_description: 'Sandbox-only role-boundary probe work item.',
      line_type: 'labor',
      quantity: 1,
      unit: 'each',
      unit_price_cents: 1000,
      completion_status: 'completed',
      billing_status: 'unbilled',
      billable: true,
      sort_order: 10,
    })
    .select('id')
    .single();

  expect(result.error, 'owner should create probe work item fixture').toBeNull();
  return result.data!.id as string;
}

test.describe('FB-020 sandbox contractor role-boundary money-action probes', () => {
  let owner: AuthenticatedClient;
  let homeowner: AuthenticatedClient;
  let fieldTech: AuthenticatedClient;
  let viewer: AuthenticatedClient;
  let contractorB: AuthenticatedClient;
  let admin: AuthenticatedClient | null = null;
  let office: AuthenticatedClient | null = null;
  let disabled: AuthenticatedClient | null = null;
  let contractorId = '';

  test.beforeAll(async () => {
    test.skip(
      !PROBE_ENABLED,
      'Set FB020_ROLE_BOUNDARY_PROBES=true to run these sandbox-mutating role-boundary probes.',
    );
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();

    const requiredMissing = missingRoleEnv(['owner', 'field_tech', 'viewer', 'contractorB']);
    expect(requiredMissing, 'Required owner, field tech, viewer, and contractorB fixtures must be configured').toEqual([]);

    owner = await signInAs('owner');
    homeowner = {
      ...(await (async () => {
        const { url, anonKey } = requireSandboxSupabaseConfig();
        const client = createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data, error } = await client.auth.signInWithPassword({
          email: requiredEnv('TEST_HOMEOWNER_EMAIL'),
          password: requiredEnv('TEST_HOMEOWNER_PASSWORD'),
        });
        expect(error, 'homeowner login should succeed').toBeNull();
        return { client, userId: data.user!.id };
      })()),
      emailName: 'TEST_HOMEOWNER_EMAIL',
      role: 'owner',
    };
    fieldTech = await signInAs('field_tech');
    viewer = await signInAs('viewer');
    contractorB = await signInAs('contractorB');
    if (optionalRoleConfigured('admin')) admin = await signInAs('admin');
    if (optionalRoleConfigured('office')) office = await signInAs('office');
    if (optionalRoleConfigured('disabled')) disabled = await signInAs('disabled');

    contractorId = await contractorProfileId(owner, 'owner');
    await expectSameContractor(fieldTech, contractorId);
    await expectTeamRole(fieldTech, contractorId, 'field_tech');
    await expectSameContractor(viewer, contractorId);
    await expectTeamRole(viewer, contractorId, 'viewer');
    if (admin) {
      await expectSameContractor(admin, contractorId);
      await expectTeamRole(admin, contractorId, 'admin');
    }
    if (office) {
      await expectSameContractor(office, contractorId);
      await expectTeamRole(office, contractorId, 'office');
    }
    if (disabled) {
      await expectTeamRole(disabled, contractorId, 'field_tech', 'disabled', owner.client);
    }
  });

  test.afterAll(async () => {
    await signOutAll([owner, homeowner, fieldTech, viewer, contractorB, admin, office, disabled]);
  });

  test('reports configured role fixture availability', async () => {
    const fixtures = {
      owner: true,
      admin: Boolean(admin),
      office: Boolean(office),
      field_tech: true,
      viewer: true,
      disabled: Boolean(disabled),
      contractorB: true,
    };

    console.log(`[FB-020 role-boundary probe] fixture availability: ${JSON.stringify(fixtures)}`);
    expect(fixtures.owner).toBe(true);
    expect(fixtures.field_tech).toBe(true);
    expect(fixtures.viewer).toBe(true);
    expect(fixtures.contractorB).toBe(true);
  });

  test('reports whether field tech can perform money actions that v1 should deny', async () => {
    const invoiceIds: string[] = [];
    const jobIds: string[] = [];
    const workItemIds: string[] = [];
    const results: ProbeResult[] = [];

    try {
      const directCreate = await attemptProbe('direct draft invoice create', 'field_tech', 'denied', async () => {
        const result = await fieldTech.client
          .from('invoices')
          .insert({
            contractor_id: contractorId,
            homeowner_user_id: homeowner.userId,
            title: `Codex FB-020 Field Tech Direct Invoice ${Date.now().toString(36)}`,
            scope: 'Sandbox-only role-boundary probe.',
            status: 'draft',
            subtotal_cents: 1000,
            total_cents: 1000,
          })
          .select('id')
          .single();
        if (result.data?.id) invoiceIds.push(result.data.id as string);
        return { id: result.data?.id as string | undefined, error: result.error };
      });
      results.push(directCreate);

      const sendInvoiceId = await createProbeInvoice(owner, contractorId, homeowner.userId, 'draft');
      invoiceIds.push(sendInvoiceId);
      results.push(await attemptProbe('send invoice RPC', 'field_tech', 'denied', async () => {
        const result = await fieldTech.client.rpc('servsync_send_invoice', { p_invoice_id: sendInvoiceId });
        return { error: result.error };
      }));

      const voidInvoiceId = await createProbeInvoice(owner, contractorId, homeowner.userId, 'sent');
      invoiceIds.push(voidInvoiceId);
      results.push(await attemptProbe('void invoice RPC', 'field_tech', 'denied', async () => {
        const result = await fieldTech.client.rpc('servsync_void_invoice', { p_invoice_id: voidInvoiceId });
        return { error: result.error };
      }));

      const paidInvoiceId = await createProbeInvoice(owner, contractorId, homeowner.userId, 'sent');
      invoiceIds.push(paidInvoiceId);
      results.push(await attemptProbe('mark invoice paid RPC', 'field_tech', 'denied', async () => {
        const result = await fieldTech.client.rpc('servsync_mark_invoice_paid', { p_invoice_id: paidInvoiceId });
        return { error: result.error };
      }));

      const partialJobId = await createProbeJob(owner, contractorId, homeowner.userId, 'Partial Invoice');
      jobIds.push(partialJobId);
      const partialWorkItemId = await createProbeWorkItem(owner, contractorId, partialJobId, 'Field tech partial invoice probe item');
      workItemIds.push(partialWorkItemId);
      results.push(await attemptProbe('partial invoice RPC', 'field_tech', 'denied', async () => {
        const result = await fieldTech.client.rpc('servsync_create_partial_invoice_from_job', {
          p_inspection_id: partialJobId,
          p_work_item_ids: [partialWorkItemId],
        });
        const invoiceId = (result.data as { invoice_id?: string } | null)?.invoice_id;
        if (invoiceId) invoiceIds.push(invoiceId);
        return { id: invoiceId, error: result.error };
      }));

      const manualJobId = await createProbeJob(owner, contractorId, homeowner.userId, 'Manual Work Item');
      jobIds.push(manualJobId);
      let manualWorkItemId = '';
      results.push(await attemptProbe('price-bearing manual work item create RPC', 'field_tech', 'denied', async () => {
        const result = await fieldTech.client.rpc('servsync_create_job_work_item', {
          p_inspection_id: manualJobId,
          p_title: 'Field tech price-bearing manual probe item',
          p_customer_description: 'Sandbox-only role-boundary probe.',
          p_line_type: 'labor',
          p_quantity: 1,
          p_unit: 'each',
          p_unit_price_cents: 2500,
          p_billable: true,
          p_completion_status: 'completed',
        });
        const itemId = (result.data as { id?: string } | null)?.id;
        if (itemId) {
          manualWorkItemId = itemId;
          workItemIds.push(itemId);
        }
        return { id: itemId, error: result.error };
      }));

      if (!manualWorkItemId) {
        manualWorkItemId = await createProbeWorkItem(owner, contractorId, manualJobId, 'Owner-created manual probe item for field tech update');
        workItemIds.push(manualWorkItemId);
      }
      results.push(await attemptProbe('price-bearing manual work item update RPC', 'field_tech', 'denied', async () => {
        const result = await fieldTech.client.rpc('servsync_update_job_work_item', {
          p_work_item_id: manualWorkItemId,
          p_title: 'Field tech updated price-bearing manual probe item',
          p_customer_description: 'Sandbox-only role-boundary probe update.',
          p_line_type: 'labor',
          p_quantity: 1,
          p_unit: 'each',
          p_unit_price_cents: 3500,
          p_billable: true,
          p_completion_status: 'completed',
        });
        return { id: (result.data as { id?: string } | null)?.id, error: result.error };
      }));

      const exposures = results.filter(result => result.expectedV1 === 'denied' && result.observed === 'allowed');
      console.log(`[FB-020 role-boundary probe] field_tech exposures: ${JSON.stringify(exposures)}`);
      expect(results.map(result => result.observed).every(status => status === 'allowed' || status === 'denied')).toBe(true);
      expect(exposures, 'field tech should be denied for all invoice, paid/void/send, and price-bearing work-item actions').toEqual([]);
    } finally {
      cleanupExactSandboxProbeRows({ invoiceIds, jobIds, workItemIds });
    }
  });

  test('reports whether viewer can perform write or money actions', async () => {
    const invoiceIds: string[] = [];
    const jobIds: string[] = [];
    const results: ProbeResult[] = [];

    try {
      results.push(await attemptProbe('direct draft invoice create', 'viewer', 'denied', async () => {
        const result = await viewer.client
          .from('invoices')
          .insert({
            contractor_id: contractorId,
            homeowner_user_id: homeowner.userId,
            title: `Codex FB-020 Viewer Direct Invoice ${Date.now().toString(36)}`,
            scope: 'Sandbox-only role-boundary probe.',
            status: 'draft',
            subtotal_cents: 1000,
            total_cents: 1000,
          })
          .select('id')
          .single();
        if (result.data?.id) invoiceIds.push(result.data.id as string);
        return { id: result.data?.id as string | undefined, error: result.error };
      }));

      const jobId = await createProbeJob(owner, contractorId, homeowner.userId, 'Viewer Manual Work Item');
      jobIds.push(jobId);
      results.push(await attemptProbe('price-bearing manual work item create RPC', 'viewer', 'denied', async () => {
        const result = await viewer.client.rpc('servsync_create_job_work_item', {
          p_inspection_id: jobId,
          p_title: 'Viewer price-bearing manual probe item',
          p_line_type: 'labor',
          p_quantity: 1,
          p_unit: 'each',
          p_unit_price_cents: 2500,
          p_billable: true,
          p_completion_status: 'completed',
        });
        return { id: (result.data as { id?: string } | null)?.id, error: result.error };
      }));

      const exposures = results.filter(result => result.expectedV1 === 'denied' && result.observed === 'allowed');
      console.log(`[FB-020 role-boundary probe] viewer exposures: ${JSON.stringify(exposures)}`);
      expect(results.map(result => result.observed).every(status => status === 'allowed' || status === 'denied')).toBe(true);
      expect(exposures, 'viewer should remain read-only for write and money actions').toEqual([]);
    } finally {
      cleanupExactSandboxProbeRows({ invoiceIds, jobIds });
    }
  });

  test('reports whether owner, office, and admin can perform representative billing actions', async () => {
    const invoiceIds: string[] = [];
    const rolesToProbe = [owner, office, admin].filter(Boolean) as AuthenticatedClient[];
    const results: ProbeResult[] = [];

    try {
      for (const account of rolesToProbe) {
        results.push(await attemptProbe('direct draft invoice create', account.role, 'allowed', async () => {
          const result = await account.client
            .from('invoices')
            .insert({
              contractor_id: contractorId,
              homeowner_user_id: homeowner.userId,
              title: `Codex FB-020 ${account.role} Direct Invoice ${Date.now().toString(36)}`,
              scope: 'Sandbox-only role-boundary probe.',
              status: 'draft',
              subtotal_cents: 1000,
              total_cents: 1000,
            })
            .select('id')
            .single();
          if (result.data?.id) invoiceIds.push(result.data.id as string);
          return { id: result.data?.id as string | undefined, error: result.error };
        }));
      }

      console.log(`[FB-020 role-boundary probe] billing allowed-role results: ${JSON.stringify(results)}`);
      expect(results.map(result => result.observed).every(status => status === 'allowed' || status === 'denied')).toBe(true);
      const unexpectedDenials = results.filter(result => result.expectedV1 === 'allowed' && result.observed === 'denied');
      expect(unexpectedDenials, 'owner, office, and admin fixtures should retain representative billing access').toEqual([]);
    } finally {
      cleanupExactSandboxProbeRows({ invoiceIds });
    }
  });

  test('reports cross-contractor and disabled-member money-action behavior when fixtures exist', async () => {
    const invoiceIds: string[] = [];
    const results: ProbeResult[] = [];

    try {
      results.push(await attemptProbe('cross-contractor direct draft invoice create', 'contractorB', 'denied', async () => {
        const result = await contractorB.client
          .from('invoices')
          .insert({
            contractor_id: contractorId,
            homeowner_user_id: homeowner.userId,
            title: `Codex FB-020 Contractor B Direct Invoice ${Date.now().toString(36)}`,
            scope: 'Sandbox-only role-boundary probe.',
            status: 'draft',
            subtotal_cents: 1000,
            total_cents: 1000,
          })
          .select('id')
          .single();
        if (result.data?.id) invoiceIds.push(result.data.id as string);
        return { id: result.data?.id as string | undefined, error: result.error };
      }));

      if (disabled) {
        results.push(await attemptProbe('disabled team member direct draft invoice create', 'disabled', 'denied', async () => {
          const result = await disabled!.client
            .from('invoices')
            .insert({
              contractor_id: contractorId,
              homeowner_user_id: homeowner.userId,
              title: `Codex FB-020 Disabled Team Invoice ${Date.now().toString(36)}`,
              scope: 'Sandbox-only role-boundary probe.',
              status: 'draft',
              subtotal_cents: 1000,
              total_cents: 1000,
            })
            .select('id')
            .single();
          if (result.data?.id) invoiceIds.push(result.data.id as string);
          return { id: result.data?.id as string | undefined, error: result.error };
        }));
      } else {
        console.log('[FB-020 role-boundary probe] disabled team member fixture not configured; disabled-member probe skipped.');
      }

      const exposures = results.filter(result => result.expectedV1 === 'denied' && result.observed === 'allowed');
      console.log(`[FB-020 role-boundary probe] cross/disabled exposures: ${JSON.stringify(exposures)}`);
      expect(results.map(result => result.observed).every(status => status === 'allowed' || status === 'denied')).toBe(true);
      expect(exposures, 'cross-contractor and disabled team-member fixtures should be denied money actions').toEqual([]);
    } finally {
      cleanupExactSandboxProbeRows({ invoiceIds });
    }
  });
});
