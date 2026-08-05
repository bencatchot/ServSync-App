import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';
import { deleteLocalCustomerFixtures } from './helpers/sandboxLocalCustomerOperator';
import { requireValidationTarget } from './helpers/validationTarget';

const PROBE_ENABLED = process.env.ADMIN_OFFICE_CUSTOMER_CREATION_PARITY_PROBES === 'true';

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

function createCustomer(client: SupabaseClient, tag: string) {
  return client.rpc('servsync_create_local_contact', {
    p_display_name: `${tag} customer`,
    p_phone: '(555) 010-4400',
    p_email: `${tag.toLowerCase()}@example.test`,
    p_notes: `${tag} private note`,
    p_home_nickname: `${tag} property`,
    p_address_line1: '4400 Creation Parity Lane',
    p_address_line2: '',
    p_city: 'Testville',
    p_state: 'AL',
    p_zip_code: '36532',
    p_home_type: 'Single family',
    p_year_built: '2004',
    p_square_feet: '1800',
    p_home_notes: `${tag} property note`,
  });
}

function expectBoundedCreation(payload: Record<string, Record<string, unknown>>) {
  expect(Object.keys(payload).sort()).toEqual(['contact', 'home']);
  expect(Object.keys(payload.contact).sort()).toEqual([
    'contractor_id', 'created_at', 'display_name', 'email', 'id', 'notes', 'phone', 'updated_at',
  ]);
  expect(Object.keys(payload.home).sort()).toEqual([
    'address_line1', 'address_line2', 'city', 'contractor_id', 'created_at', 'home_type', 'id',
    'local_contact_id', 'nickname', 'notes', 'square_feet', 'state', 'updated_at', 'year_built', 'zip_code',
  ]);
  expect(payload.home.contractor_id).toBe(payload.contact.contractor_id);
  expect(payload.home.local_contact_id).toBe(payload.contact.id);
  expect(JSON.stringify(payload)).not.toMatch(/claim|invite|token|homeowner_user_id|home_id/);
}

test.describe('Admin/Office customer creation parity Sandbox role probes', () => {
  let accounts = {} as Record<ProbeRole, SupabaseClient>;
  let ownerContractorId = '';
  const createdContactIds: string[] = [];
  const contractorBCreatedContactIds: string[] = [];

  test.beforeAll(async () => {
    test.skip(!PROBE_ENABLED, 'Enable only after separately authorized Sandbox migration application.');
    requireApprovedSandboxForMutation();
    requireValidationTarget({ requireSupabaseEnv: true });
    accounts = Object.fromEntries(await Promise.all(
      (Object.keys(ROLE_ENV) as ProbeRole[]).map(async role => [role, await signIn(role)] as const),
    )) as Record<ProbeRole, SupabaseClient>;
    const { data, error } = await accounts.owner.rpc('servsync_current_contractor_profile');
    expect(error).toBeNull();
    ownerContractorId = (Array.isArray(data) ? data[0]?.id : data?.id) as string;
    expect(ownerContractorId).toBeTruthy();
  });

  test.afterAll(async () => {
    await deleteLocalCustomerFixtures([...createdContactIds, ...contractorBCreatedContactIds]);
    await Promise.all(Object.values(accounts).map(client => client.auth.signOut().catch(() => undefined)));
  });

  test('allows Owner/Admin/Office to create an atomically bound customer and initial property', async () => {
    for (const role of ['owner', 'admin', 'office'] as ProbeRole[]) {
      const tag = `AOCC-${role}-${Date.now()}`;
      const result = await createCustomer(accounts[role], tag);
      const createdId = result.data?.contact?.id as string | undefined;
      if (createdId) createdContactIds.push(createdId);
      expect(result.error, `${role} creation should succeed`).toBeNull();
      const payload = result.data as Record<string, Record<string, unknown>>;
      expectBoundedCreation(payload);
      expect(payload.contact.contractor_id).toBe(ownerContractorId);
      expect(payload.contact.display_name).toBe(`${tag} customer`);
      expect(payload.home.nickname).toBe(`${tag} property`);
      expect(payload.home.address_line1).toBe('4400 Creation Parity Lane');
      const directory = await accounts[role].rpc('servsync_list_local_customer_summaries');
      expect(directory.error, `${role} should read the new customer through the controlled directory`).toBeNull();
      expect((directory.data as Array<{ id: string }>).some(row => row.id === payload.contact.id)).toBe(true);
    }
  });

  test('denies non-management roles, inactive/removed users, homeowners, and anonymous callers', async () => {
    for (const role of ['field_tech', 'viewer', 'inactive', 'removed', 'homeowner'] as ProbeRole[]) {
      const result = await createCustomer(accounts[role], `DENIED-${role}-${Date.now()}`);
      const unexpectedId = result.data?.contact?.id as string | undefined;
      if (unexpectedId) createdContactIds.push(unexpectedId);
      expect(result.error?.code, `${role} should be denied`).toBe('42501');
      expect(result.error?.message).toBe('Customer creation is unavailable.');
      expect(result.data).toBeNull();
    }

    const anonymous = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('VITE_SUPABASE_ANON_KEY'), {
      auth: { persistSession: false },
    });
    const anonymousResult = await createCustomer(anonymous, `DENIED-anonymous-${Date.now()}`);
    expect(anonymousResult.error, 'anonymous should not execute the creation RPC').toBeTruthy();
    expect(anonymousResult.data).toBeNull();
  });

  test('accepts no caller-selected contractor or parent identifier for cross-tenant substitution', async () => {
    const tag = `DENIED-cross-tenant-${Date.now()}`;
    const result = await accounts.contractorB.rpc('servsync_create_local_contact', {
      p_contractor_id: ownerContractorId,
      p_display_name: `${tag} customer`,
      p_home_nickname: `${tag} property`,
    });
    const unexpectedId = result.data?.contact?.id as string | undefined;
    if (unexpectedId) contractorBCreatedContactIds.push(unexpectedId);
    expect(result.error, 'A caller-supplied contractor identifier must not match an RPC signature').toBeTruthy();
    expect(result.data).toBeNull();

    const { data: ownerRows, error: ownerLookupError } = await accounts.owner.rpc('servsync_list_local_customer_summaries');
    expect(ownerLookupError).toBeNull();
    expect((ownerRows as Array<{ display_name: string }>).some(row => row.display_name === `${tag} customer`)).toBe(false);
  });
});
