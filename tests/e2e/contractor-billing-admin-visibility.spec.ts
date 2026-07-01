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
};

type CatalogResponse<T> = {
  rows?: T[];
};

type AdminBillingRpcCatalogRow = {
  exists: boolean;
  security_definer: boolean | null;
  search_path_public: boolean | null;
  public_execute: boolean | null;
  anon_execute: boolean | null;
  authenticated_execute: boolean | null;
  exposes_raw_stripe_customer_id: boolean | null;
  exposes_raw_stripe_subscription_id: boolean | null;
  exposes_presence_booleans: boolean | null;
};

type AdminBillingReadinessRow = {
  contractor_id: string;
  billing_status: string;
  access_mode: string;
  current_plan: string;
  has_stripe_customer_id: boolean;
  has_stripe_subscription_id: boolean;
  can_create_estimates: boolean;
  can_create_jobs: boolean;
  can_create_invoices: boolean;
  can_use_ai_features: boolean;
  can_invite_team_members: boolean;
  max_team_seats: number;
  max_storage_mb: number;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run contractor billing admin visibility tests against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Contractor billing admin visibility tests require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
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

async function signInAs(key: 'contractor' | 'homeowner'): Promise<AuthenticatedClient> {
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

  return { client, userId: data.user!.id };
}

async function signInOptionalPlatformAdmin(): Promise<AuthenticatedClient | null> {
  const email = process.env.TEST_ADMIN_EMAIL?.trim();
  const password = process.env.TEST_ADMIN_PASSWORD?.trim();
  if (!email || !password) return null;

  const { url, anonKey } = requireSandboxSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  expect(error, 'platform admin login should succeed when configured').toBeNull();
  expect(data.user?.id, 'platform admin auth user should be present').toBeTruthy();
  return { client, userId: data.user!.id };
}

async function signOutAll(accounts: Array<AuthenticatedClient | null | undefined>) {
  await Promise.all(accounts.filter(Boolean).map(account => account!.client.auth.signOut().catch(() => undefined)));
}

test.describe('contractor billing admin visibility', () => {
  test('admin billing-readiness RPC is hardened and does not expose raw Stripe identifiers', () => {
    const [row] = runSandboxSql<AdminBillingRpcCatalogRow>(`
select
  p.oid is not null as exists,
  p.prosecdef as security_definer,
  'search_path=public' = any(p.proconfig) as search_path_public,
  exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) as public_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  pg_get_function_result(p.oid) like '%stripe_customer_id text%' as exposes_raw_stripe_customer_id,
  pg_get_function_result(p.oid) like '%stripe_subscription_id text%' as exposes_raw_stripe_subscription_id,
  pg_get_function_result(p.oid) like '%has_stripe_customer_id boolean%'
    and pg_get_function_result(p.oid) like '%has_stripe_subscription_id boolean%' as exposes_presence_booleans
from pg_proc p
where p.proname = 'servsync_admin_contractor_billing_readiness'
  and p.pronamespace = 'public'::regnamespace
limit 1;
    `);

    expect(row, 'admin billing-readiness RPC should exist').toBeTruthy();
    expect(row.exists, 'admin billing-readiness RPC should exist').toBe(true);
    expect(row.security_definer, 'admin billing-readiness RPC should be SECURITY DEFINER').toBe(true);
    expect(row.search_path_public, 'admin billing-readiness RPC should set search_path=public').toBe(true);
    expect(row.public_execute, 'admin billing-readiness RPC should not grant EXECUTE to PUBLIC').toBe(false);
    expect(row.anon_execute, 'admin billing-readiness RPC should not grant EXECUTE to anon').toBe(false);
    expect(row.authenticated_execute, 'admin billing-readiness RPC should grant EXECUTE to authenticated behind platform-admin guard').toBe(true);
    expect(row.exposes_raw_stripe_customer_id, 'admin RPC should not return raw Stripe customer IDs').toBe(false);
    expect(row.exposes_raw_stripe_subscription_id, 'admin RPC should not return raw Stripe subscription IDs').toBe(false);
    expect(row.exposes_presence_booleans, 'admin RPC should return Stripe presence booleans').toBe(true);
  });

  test('non-admin homeowner and contractor callers cannot call admin billing-readiness RPC', async () => {
    const homeowner = await signInAs('homeowner');
    const contractor = await signInAs('contractor');

    try {
      const homeownerResult = await homeowner.client.rpc('servsync_admin_contractor_billing_readiness');
      expect(homeownerResult.error, 'homeowner should be denied admin billing-readiness RPC').not.toBeNull();

      const contractorResult = await contractor.client.rpc('servsync_admin_contractor_billing_readiness');
      expect(contractorResult.error, 'contractor should be denied admin billing-readiness RPC').not.toBeNull();
    } finally {
      await signOutAll([homeowner, contractor]);
    }
  });

  test('platform admin can call billing-readiness RPC when sandbox admin credentials are configured', async () => {
    const admin = await signInOptionalPlatformAdmin();
    test.skip(!admin, 'Platform admin fixture is not configured with TEST_ADMIN_EMAIL/PASSWORD.');

    try {
      const { data, error } = await admin!.client.rpc('servsync_admin_contractor_billing_readiness');
      expect(error, 'platform admin should be able to call billing-readiness RPC').toBeNull();

      const rows = (data || []) as AdminBillingReadinessRow[];
      for (const row of rows) {
        expect(row.contractor_id, 'admin row should include contractor id').toBeTruthy();
        expect(row.billing_status, 'admin row should include billing status').toBeTruthy();
        expect(row.access_mode, 'admin row should include access mode').toBeTruthy();
        expect(row.current_plan, 'admin row should include current plan').toBeTruthy();
        expect(typeof row.has_stripe_customer_id, 'Stripe customer presence should be boolean').toBe('boolean');
        expect(typeof row.has_stripe_subscription_id, 'Stripe subscription presence should be boolean').toBe('boolean');
        expect(typeof row.can_create_estimates, 'estimate entitlement should be boolean').toBe('boolean');
        expect(typeof row.can_create_jobs, 'job entitlement should be boolean').toBe('boolean');
        expect(typeof row.can_create_invoices, 'invoice entitlement should be boolean').toBe('boolean');
        expect(typeof row.can_use_ai_features, 'AI entitlement should be boolean').toBe('boolean');
        expect(typeof row.can_invite_team_members, 'team entitlement should be boolean').toBe('boolean');
        expect(Number.isInteger(row.max_team_seats), 'max team seats should be explicit integer').toBe(true);
        expect(Number.isInteger(row.max_storage_mb), 'max storage should be explicit integer').toBe(true);
      }
    } finally {
      await signOutAll([admin]);
    }
  });

  test('admin UI source renders read-only billing readiness labels without full provider IDs', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(source).toContain('Billing readiness is internal tracking only.');
    expect(source).toContain('Stripe billing is not active.');
    expect(source).toContain('Beta contractors remain free.');
    expect(source).toContain('Homeowners remain free and are not part of contractor billing.');
    expect(source).toContain('Stripe customer present');
    expect(source).toContain('Stripe subscription present');
    expect(source).toContain('Legacy/admin profile fields');
    expect(source).toContain('Legacy subscription');
    expect(source).not.toContain('Stripe customer ID');
    expect(source).not.toContain('Stripe subscription ID');
    expect(source).not.toContain('Homeowner billing');
  });
});
