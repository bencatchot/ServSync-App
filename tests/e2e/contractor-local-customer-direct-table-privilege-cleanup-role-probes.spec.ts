import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requiredEnv } from './helpers/env';
import { requireValidationTarget } from './helpers/validationTarget';

const PROBE_ENABLED = process.env.LOCAL_CUSTOMER_DIRECT_PRIVILEGE_PROBES === 'true';
type ProbeRole = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | 'inactive' | 'removed' | 'contractorB' | 'homeowner';
const ROLE_ENV: Record<ProbeRole, { email: string; password: string }> = {
  owner: { email: 'TEST_CONTRACTOR_EMAIL', password: 'TEST_CONTRACTOR_PASSWORD' },
  admin: { email: 'TEST_CONTRACTOR_ADMIN_EMAIL', password: 'TEST_CONTRACTOR_ADMIN_PASSWORD' },
  office: { email: 'TEST_CONTRACTOR_OFFICE_EMAIL', password: 'TEST_CONTRACTOR_OFFICE_PASSWORD' },
  field_tech: { email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL', password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD' },
  viewer: { email: 'TEST_CONTRACTOR_VIEWER_EMAIL', password: 'TEST_CONTRACTOR_VIEWER_PASSWORD' },
  inactive: { email: 'TEST_CONTRACTOR_DISABLED_EMAIL', password: 'TEST_CONTRACTOR_DISABLED_PASSWORD' },
  removed: { email: 'TEST_CONTRACTOR_REMOVED_EMAIL', password: 'TEST_CONTRACTOR_REMOVED_PASSWORD' },
  contractorB: { email: 'TEST_CONTRACTOR_B_EMAIL', password: 'TEST_CONTRACTOR_B_PASSWORD' },
  homeowner: { email: 'TEST_HOMEOWNER_EMAIL', password: 'TEST_HOMEOWNER_PASSWORD' },
};

async function signIn(role: ProbeRole) {
  const client = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const env = ROLE_ENV[role];
  const { error } = await client.auth.signInWithPassword({
    email: requiredEnv(env.email),
    password: requiredEnv(env.password),
  });
  expect(error, `${role} sign-in should succeed`).toBeNull();
  return client;
}

function directOperations(client: SupabaseClient, table: 'contractor_local_contacts' | 'contractor_local_homes') {
  const id = randomUUID();
  return [
    client.from(table).select('*').limit(1),
    table === 'contractor_local_contacts'
      ? client.from(table).insert({ id, contractor_id: randomUUID(), display_name: 'denied direct insert' })
      : client.from(table).insert({ id, contractor_id: randomUUID(), local_contact_id: randomUUID(), nickname: 'denied direct insert' }),
    client.from(table).update({ updated_at: new Date().toISOString() }).eq('id', id),
    client.from(table).delete().eq('id', id),
  ];
}

async function expectAllDirectOperationsDenied(client: SupabaseClient, label: string) {
  for (const table of ['contractor_local_contacts', 'contractor_local_homes'] as const) {
    const results = await Promise.all(directOperations(client, table));
    for (const [index, result] of results.entries()) {
      expect(result.error?.code, `${label} ${table} operation ${index} should be denied by ACL`).toBe('42501');
      expect(result.error?.message).toContain(`permission denied for table ${table}`);
      expect(result.data).toBeNull();
    }
  }
}

test.describe('contractor-local customer direct-table privilege Sandbox probes', () => {
  test.beforeEach(() => {
    test.skip(!PROBE_ENABLED, 'Enable only after separately authorized Sandbox migration application.');
    const target = requireValidationTarget({ requireSupabaseEnv: true });
    expect(target.targetName).toBe('sandbox');
  });

  test('denies direct CRUD to every authenticated application role', async () => {
    const accounts = Object.fromEntries(await Promise.all(
      (Object.keys(ROLE_ENV) as ProbeRole[]).map(async role => [role, await signIn(role)] as const),
    )) as Record<ProbeRole, SupabaseClient>;
    try {
      for (const role of Object.keys(accounts) as ProbeRole[]) {
        await expectAllDirectOperationsDenied(accounts[role], role);
      }
    } finally {
      await Promise.all(Object.values(accounts).map(client => client.auth.signOut().catch(() => undefined)));
    }
  });

  test('denies direct CRUD to anonymous callers', async () => {
    const anonymous = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('VITE_SUPABASE_ANON_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await expectAllDirectOperationsDenied(anonymous, 'anonymous');
  });
});
