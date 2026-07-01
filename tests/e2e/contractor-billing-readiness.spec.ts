import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentialsFor, requiredEnv } from './helpers/env';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';

type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
  email: string;
};

type CatalogResponse<T> = {
  rows?: T[];
};

type EntitlementRow = {
  contractor_id: string | null;
  billing_status: string;
  current_plan: string;
  access_mode: string;
  subscription_required_after: string | null;
  grace_period_ends_at: string | null;
  can_use_workspace: boolean;
  can_create_service_requests_for_local_customers: boolean;
  can_create_estimates: boolean;
  can_send_estimates: boolean;
  can_create_jobs: boolean;
  can_create_invoices: boolean;
  can_send_invoices: boolean;
  can_use_discover_profile: boolean;
  can_accept_new_connections: boolean;
  can_use_ai_features: boolean;
  can_invite_team_members: boolean;
  max_team_seats: number;
  max_storage_mb: number;
  read_only_reason: string;
};

type BillingAccountRow = {
  id: string;
  contractor_id: string;
  billing_status: string;
  beta_started_at: string | null;
  beta_cohort: string | null;
  founder_discount_eligible: boolean;
  founder_discount_notes: string;
  current_plan: string;
  subscription_required_after: string | null;
  grace_period_ends_at: string | null;
  access_mode: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_subscription_status: string | null;
  monthly_price_cents: number;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run contractor billing-readiness tests against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Contractor billing-readiness tests require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing linked SQL because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }
}

function runSandboxSql<T>(sql: string): T[] {
  requireLinkedSandbox();

  const output = execFileSync('supabase', ['db', 'query', '--linked', '--output', 'json', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });

  const jsonStart = output.indexOf('{');
  const jsonEnd = output.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error(`Supabase CLI did not return parseable JSON output: ${output.slice(0, 240)}`);
  }

  const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as CatalogResponse<T>;
  return parsed.rows ?? [];
}

async function signInAs(key: 'contractor' | 'contractorB' | 'homeowner'): Promise<AuthenticatedClient> {
  const { url, anonKey } = requireSandboxSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const credentials = credentialsFor(key);
  const { data, error } = await client.auth.signInWithPassword(credentials);
  expect(error, `${key} login should succeed`).toBeNull();
  expect(data.user?.id, `${key} auth user should be present`).toBeTruthy();

  return { client, userId: data.user!.id, email: credentials.email };
}

function optionalRoleCredentials(role: 'admin' | 'office') {
  const suffix = role === 'admin' ? 'ADMIN' : 'OFFICE';
  const email = process.env[`TEST_CONTRACTOR_${suffix}_EMAIL`]?.trim();
  const password = process.env[`TEST_CONTRACTOR_${suffix}_PASSWORD`]?.trim();
  return email && password ? { email, password } : null;
}

async function signInOptionalRole(role: 'admin' | 'office'): Promise<AuthenticatedClient | null> {
  const credentials = optionalRoleCredentials(role);
  if (!credentials) return null;
  const { url, anonKey } = requireSandboxSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword(credentials);
  expect(error, `${role} login should succeed when configured`).toBeNull();
  expect(data.user?.id, `${role} auth user should be present`).toBeTruthy();
  return { client, userId: data.user!.id, email: credentials.email };
}

async function signOutAll(accounts: Array<AuthenticatedClient | null | undefined>) {
  await Promise.all(accounts.filter(Boolean).map(account => account!.client.auth.signOut().catch(() => undefined)));
}

async function contractorProfileId(account: AuthenticatedClient, label = 'contractor'): Promise<string> {
  const own = await account.client
    .from('contractor_profiles')
    .select('id')
    .eq('owner_user_id', account.userId)
    .maybeSingle();

  expect(own.error, `${label} contractor profile owner lookup should not error`).toBeNull();
  if (own.data?.id) return own.data.id as string;

  const { data, error } = await account.client.rpc('servsync_current_contractor_profile');
  expect(error, `${label} current contractor profile RPC should not error`).toBeNull();
  const profile = Array.isArray(data) ? data[0] : data;
  expect(profile?.id, `${label} contractor profile should exist in sandbox`).toBeTruthy();
  return profile.id as string;
}

async function currentEntitlements(account: AuthenticatedClient, contractorId?: string): Promise<EntitlementRow> {
  const { data, error } = await account.client.rpc('servsync_current_contractor_entitlements', {
    p_contractor_id: contractorId ?? null,
  });
  expect(error, 'entitlement RPC should not error for eligible caller').toBeNull();
  const row = Array.isArray(data) ? data[0] : data;
  expect(row, 'entitlement RPC should return one row').toBeTruthy();
  return row as EntitlementRow;
}

function snapshotBillingAccount(contractorId: string): BillingAccountRow {
  const [row] = runSandboxSql<BillingAccountRow>(`
select
  id,
  contractor_id,
  billing_status,
  beta_started_at,
  beta_cohort,
  founder_discount_eligible,
  founder_discount_notes,
  current_plan,
  subscription_required_after,
  grace_period_ends_at,
  access_mode,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,
  stripe_subscription_status,
  monthly_price_cents
from public.contractor_billing_accounts
where contractor_id = '${contractorId}'::uuid
limit 1;
  `);
  expect(row, 'billing account snapshot should exist').toBeTruthy();
  return row;
}

function restoreBillingAccount(row: BillingAccountRow) {
  runSandboxSql(`
update public.contractor_billing_accounts
   set billing_status = '${row.billing_status}',
       beta_started_at = ${row.beta_started_at ? `'${row.beta_started_at}'::timestamptz` : 'null'},
       beta_cohort = ${row.beta_cohort ? `'${row.beta_cohort.replace(/'/g, "''")}'` : 'null'},
       founder_discount_eligible = ${row.founder_discount_eligible ? 'true' : 'false'},
       founder_discount_notes = '${row.founder_discount_notes.replace(/'/g, "''")}',
       current_plan = '${row.current_plan.replace(/'/g, "''")}',
       subscription_required_after = ${row.subscription_required_after ? `'${row.subscription_required_after}'::timestamptz` : 'null'},
       grace_period_ends_at = ${row.grace_period_ends_at ? `'${row.grace_period_ends_at}'::timestamptz` : 'null'},
       access_mode = '${row.access_mode}',
       stripe_customer_id = ${row.stripe_customer_id ? `'${row.stripe_customer_id.replace(/'/g, "''")}'` : 'null'},
       stripe_subscription_id = ${row.stripe_subscription_id ? `'${row.stripe_subscription_id.replace(/'/g, "''")}'` : 'null'},
       stripe_price_id = ${row.stripe_price_id ? `'${row.stripe_price_id.replace(/'/g, "''")}'` : 'null'},
       stripe_subscription_status = ${row.stripe_subscription_status ? `'${row.stripe_subscription_status.replace(/'/g, "''")}'` : 'null'},
       monthly_price_cents = ${row.monthly_price_cents}
 where contractor_id = '${row.contractor_id}'::uuid;
  `);
}

test.describe('contractor beta billing-readiness foundation', () => {
  let contractor: AuthenticatedClient;
  let contractorB: AuthenticatedClient;
  let homeowner: AuthenticatedClient;
  let admin: AuthenticatedClient | null;
  let office: AuthenticatedClient | null;
  let contractorId: string;
  let contractorBId: string;

  test.beforeAll(async () => {
    requireSandboxSupabaseConfig();
    requireLinkedSandbox();
    contractor = await signInAs('contractor');
    contractorB = await signInAs('contractorB');
    homeowner = await signInAs('homeowner');
    admin = await signInOptionalRole('admin');
    office = await signInOptionalRole('office');
    contractorId = await contractorProfileId(contractor, 'Contractor A');
    contractorBId = await contractorProfileId(contractorB, 'Contractor B');
  });

  test.afterAll(async () => {
    await signOutAll([contractor, contractorB, homeowner, admin, office]);
  });

  test('backfill creates one free beta billing account per contractor', async () => {
    const [counts] = runSandboxSql<{ contractor_count: number; billing_count: number; duplicate_count: number }>(`
select
  (select count(*)::int from public.contractor_profiles) as contractor_count,
  (select count(*)::int from public.contractor_billing_accounts) as billing_count,
  (
    select count(*)::int
      from (
        select contractor_id
          from public.contractor_billing_accounts
         group by contractor_id
        having count(*) > 1
      ) dupes
  ) as duplicate_count;
    `);

    expect(counts.billing_count, 'each contractor should have one billing account').toBe(counts.contractor_count);
    expect(counts.duplicate_count, 'billing accounts should remain one-to-one').toBe(0);

    const own = await contractor.client
      .from('contractor_billing_accounts')
      .select('contractor_id,billing_status,current_plan,access_mode,beta_started_at,beta_cohort,founder_discount_eligible')
      .eq('contractor_id', contractorId)
      .single();

    expect(own.error, 'contractor owner should read own billing account').toBeNull();
    expect(own.data?.billing_status).toBe('beta_free');
    expect(own.data?.current_plan).toBe('beta_free');
    expect(own.data?.access_mode).toBe('full_beta');
    expect(own.data?.beta_started_at, 'beta start timestamp should be populated').toBeTruthy();
    expect(own.data?.beta_cohort).toBeTruthy();
    expect(own.data?.founder_discount_eligible).toBe(true);
  });

  test('billing account RLS allows own read but denies anonymous, unrelated, and direct contractor writes', async () => {
    const { url, anonKey } = requireSandboxSupabaseConfig();
    const anonymous = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const anonRead = await anonymous.from('contractor_billing_accounts').select('id').limit(1);
    expect(anonRead.error, 'anonymous users should not read contractor billing accounts').toBeTruthy();

    const ownRead = await contractor.client
      .from('contractor_billing_accounts')
      .select('id,contractor_id')
      .eq('contractor_id', contractorId);
    expect(ownRead.error, 'contractor owner should read own billing account').toBeNull();
    expect(ownRead.data).toHaveLength(1);

    const unrelatedRead = await contractorB.client
      .from('contractor_billing_accounts')
      .select('id,contractor_id')
      .eq('contractor_id', contractorId);
    expect(unrelatedRead.error, 'unrelated contractor read should be hidden by RLS without leaking detail').toBeNull();
    expect(unrelatedRead.data).toHaveLength(0);

    const insertAttempt = await contractor.client
      .from('contractor_billing_accounts')
      .insert({ contractor_id: contractorBId })
      .select('id');
    expect(insertAttempt.error, 'contractors should not directly insert billing accounts').toBeTruthy();

    const updateAttempt = await contractor.client
      .from('contractor_billing_accounts')
      .update({ access_mode: 'read_only' })
      .eq('contractor_id', contractorId)
      .select('id');
    expect(updateAttempt.error, 'contractor update denial may be represented as zero affected rows').toBeNull();
    expect(updateAttempt.data, 'contractors should not directly update billing accounts').toHaveLength(0);

    const deleteAttempt = await contractor.client
      .from('contractor_billing_accounts')
      .delete()
      .eq('contractor_id', contractorId)
      .select('id');
    expect(deleteAttempt.error, 'contractors should not directly delete billing accounts').toBeTruthy();

    const stillOwn = await contractor.client
      .from('contractor_billing_accounts')
      .select('access_mode')
      .eq('contractor_id', contractorId)
      .single();
    expect(stillOwn.error).toBeNull();
    expect(stillOwn.data?.access_mode).toBe('full_beta');
  });

  test('configured admin or office team members can read their contractor billing account', async () => {
    test.skip(!admin && !office, 'Contractor admin/office fixtures are not configured in this environment.');

    for (const account of [admin, office].filter(Boolean) as AuthenticatedClient[]) {
      const roleContractorId = await contractorProfileId(account, account.email);
      expect(roleContractorId, 'configured role fixture should resolve to Contractor A account').toBe(contractorId);

      const read = await account.client
        .from('contractor_billing_accounts')
        .select('contractor_id,billing_status,access_mode')
        .eq('contractor_id', contractorId)
        .single();
      expect(read.error, `${account.email} should read own contractor billing account`).toBeNull();
      expect(read.data?.contractor_id).toBe(contractorId);
    }
  });

  test('entitlement RPC returns explicit full-beta access for existing beta contractors', async () => {
    const entitlements = await currentEntitlements(contractor);

    expect(entitlements.contractor_id).toBe(contractorId);
    expect(entitlements.billing_status).toBe('beta_free');
    expect(entitlements.current_plan).toBe('beta_free');
    expect(entitlements.access_mode).toBe('full_beta');
    expect(entitlements.can_use_workspace).toBe(true);
    expect(entitlements.can_create_service_requests_for_local_customers).toBe(true);
    expect(entitlements.can_create_estimates).toBe(true);
    expect(entitlements.can_send_estimates).toBe(true);
    expect(entitlements.can_create_jobs).toBe(true);
    expect(entitlements.can_create_invoices).toBe(true);
    expect(entitlements.can_send_invoices).toBe(true);
    expect(entitlements.can_use_discover_profile).toBe(true);
    expect(entitlements.can_accept_new_connections).toBe(true);
    expect(entitlements.can_use_ai_features).toBe(true);
    expect(entitlements.can_invite_team_members).toBe(true);
    expect(entitlements.max_team_seats).toBeGreaterThan(1);
    expect(entitlements.max_storage_mb).toBeGreaterThan(100);
    expect(entitlements.read_only_reason).toBe('');

    const helper = await contractor.client.rpc('current_user_has_contractor_entitlement', {
      p_contractor_id: contractorId,
      p_capability: 'can_create_estimates',
    });
    expect(helper.error, 'entitlement helper should not error for own contractor').toBeNull();
    expect(helper.data).toBe(true);

    const unknownHelper = await contractor.client.rpc('current_user_has_contractor_entitlement', {
      p_contractor_id: contractorId,
      p_capability: 'not_a_real_capability',
    });
    expect(unknownHelper.error, 'unknown entitlement helper capability should not error').toBeNull();
    expect(unknownHelper.data).toBe(false);
  });

  test('entitlement RPC denies unrelated contractors and returns safe no-contractor values for homeowners', async () => {
    const denied = await contractorB.client.rpc('servsync_current_contractor_entitlements', {
      p_contractor_id: contractorId,
    });
    expect(denied.error, 'unrelated contractor should not read Contractor A entitlements').toBeTruthy();

    const homeownerEntitlements = await currentEntitlements(homeowner);
    expect(homeownerEntitlements.contractor_id).toBeNull();
    expect(homeownerEntitlements.billing_status).toBe('none');
    expect(homeownerEntitlements.can_use_workspace).toBe(false);
    expect(homeownerEntitlements.can_create_estimates).toBe(false);
    expect(homeownerEntitlements.can_send_invoices).toBe(false);
    expect(homeownerEntitlements.read_only_reason).toMatch(/No contractor account/i);
  });

  test('read-only access mode blocks new paid-feature creation flags while preserving workspace access', async () => {
    const original = snapshotBillingAccount(contractorId);
    try {
      runSandboxSql(`
update public.contractor_billing_accounts
   set billing_status = 'canceled',
       access_mode = 'read_only',
       current_plan = 'beta_free',
       updated_at = now()
 where contractor_id = '${contractorId}'::uuid;
      `);

      const entitlements = await currentEntitlements(contractor, contractorId);
      expect(entitlements.billing_status).toBe('canceled');
      expect(entitlements.access_mode).toBe('read_only');
      expect(entitlements.can_use_workspace).toBe(true);
      expect(entitlements.can_create_service_requests_for_local_customers).toBe(false);
      expect(entitlements.can_create_estimates).toBe(false);
      expect(entitlements.can_send_estimates).toBe(false);
      expect(entitlements.can_create_jobs).toBe(false);
      expect(entitlements.can_create_invoices).toBe(false);
      expect(entitlements.can_send_invoices).toBe(false);
      expect(entitlements.can_use_discover_profile).toBe(false);
      expect(entitlements.can_accept_new_connections).toBe(false);
      expect(entitlements.can_use_ai_features).toBe(false);
      expect(entitlements.can_invite_team_members).toBe(false);
      expect(entitlements.read_only_reason).toMatch(/read-only|billing/i);

      const workspaceHelper = await contractor.client.rpc('current_user_has_contractor_entitlement', {
        p_contractor_id: contractorId,
        p_capability: 'can_use_workspace',
      });
      expect(workspaceHelper.error).toBeNull();
      expect(workspaceHelper.data).toBe(true);

      const createHelper = await contractor.client.rpc('current_user_has_contractor_entitlement', {
        p_contractor_id: contractorId,
        p_capability: 'can_create_estimates',
      });
      expect(createHelper.error).toBeNull();
      expect(createHelper.data).toBe(false);
    } finally {
      restoreBillingAccount(original);
    }
  });
});
