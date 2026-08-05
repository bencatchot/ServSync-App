import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const PROBE_ENABLED = process.env.CUSTOMER_MANAGEMENT_EDIT_BOUNDARY_PROBES === 'true';

type ProbeRole = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | 'disabled' | 'contractorB';

type AuthenticatedClient = {
  client: SupabaseClient;
  role: ProbeRole;
  userId: string;
};

const ROLE_ENV: Record<ProbeRole, { email: string; password: string }> = {
  owner: { email: 'TEST_CONTRACTOR_EMAIL', password: 'TEST_CONTRACTOR_PASSWORD' },
  admin: { email: 'TEST_CONTRACTOR_ADMIN_EMAIL', password: 'TEST_CONTRACTOR_ADMIN_PASSWORD' },
  office: { email: 'TEST_CONTRACTOR_OFFICE_EMAIL', password: 'TEST_CONTRACTOR_OFFICE_PASSWORD' },
  field_tech: { email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL', password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD' },
  viewer: { email: 'TEST_CONTRACTOR_VIEWER_EMAIL', password: 'TEST_CONTRACTOR_VIEWER_PASSWORD' },
  disabled: { email: 'TEST_CONTRACTOR_DISABLED_EMAIL', password: 'TEST_CONTRACTOR_DISABLED_PASSWORD' },
  contractorB: { email: 'TEST_CONTRACTOR_B_EMAIL', password: 'TEST_CONTRACTOR_B_PASSWORD' },
};

function sandboxConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');
  if (url.includes(PRODUCTION_SUPABASE_REF) || !url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Customer-management role probes require Sandbox ${SANDBOX_SUPABASE_REF}.`);
  }
  return { url, anonKey };
}

function missingRoleEnv() {
  return Object.values(ROLE_ENV).flatMap(({ email, password }) => [email, password])
    .filter(name => !process.env[name]?.trim());
}

async function signIn(role: ProbeRole): Promise<AuthenticatedClient> {
  const { url, anonKey } = sandboxConfig();
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const env = ROLE_ENV[role];
  const { data, error } = await client.auth.signInWithPassword({
    email: requiredEnv(env.email),
    password: requiredEnv(env.password),
  });
  expect(error, `${role} sign-in should succeed`).toBeNull();
  expect(data.user?.id).toBeTruthy();
  return { client, role, userId: data.user!.id };
}

async function contractorId(account: AuthenticatedClient) {
  const { data, error } = await account.client.rpc('servsync_current_contractor_profile');
  expect(error, `${account.role} should resolve a contractor profile`).toBeNull();
  const row = Array.isArray(data) ? data[0] : data;
  expect(row?.id).toBeTruthy();
  return row.id as string;
}

async function canManage(account: AuthenticatedClient, id: string) {
  const { data, error } = await account.client.rpc('current_user_can_manage_contractor_customers', {
    p_contractor_id: id,
  });
  expect(error, `${account.role} helper call should return a boolean`).toBeNull();
  return data === true;
}

async function updateCustomer(account: AuthenticatedClient, contactId: string, displayName: string) {
  return account.client.rpc('servsync_update_local_contact_profile', {
    p_local_contact_id: contactId,
    p_display_name: displayName,
    p_phone: '',
    p_email: '',
    p_notes: '',
  });
}

async function createProperty(account: AuthenticatedClient, contactId: string, nickname: string) {
  return account.client.rpc('servsync_create_local_home', {
    p_local_contact_id: contactId,
    p_nickname: nickname,
    p_address_line1: 'Role probe address',
    p_address_line2: '',
    p_city: 'Testville',
    p_state: 'AL',
    p_zip_code: '36532',
    p_notes: '',
  });
}

async function updateProperty(account: AuthenticatedClient, homeId: string, nickname: string) {
  return account.client.rpc('servsync_update_local_home', {
    p_local_home_id: homeId,
    p_nickname: nickname,
    p_address_line1: 'Updated role probe address',
    p_address_line2: '',
    p_city: 'Testville',
    p_state: 'AL',
    p_zip_code: '36532',
    p_notes: '',
  });
}

test.describe('customer management edit boundary Sandbox role probes', () => {
  let owner: AuthenticatedClient;
  let admin: AuthenticatedClient;
  let office: AuthenticatedClient;
  let fieldTech: AuthenticatedClient;
  let viewer: AuthenticatedClient;
  let disabled: AuthenticatedClient;
  let contractorB: AuthenticatedClient;
  let ownerContractorId = '';
  let contactId = '';
  let homeId = '';

  test.beforeAll(async () => {
    test.skip(!PROBE_ENABLED, 'Set CUSTOMER_MANAGEMENT_EDIT_BOUNDARY_PROBES=true after authorized Sandbox SQL application.');
    requireApprovedSandboxForMutation();
    expect(missingRoleEnv(), 'Every contractor role fixture must be configured').toEqual([]);
    [owner, admin, office, fieldTech, viewer, disabled, contractorB] = await Promise.all([
      signIn('owner'),
      signIn('admin'),
      signIn('office'),
      signIn('field_tech'),
      signIn('viewer'),
      signIn('disabled'),
      signIn('contractorB'),
    ]);
    ownerContractorId = await contractorId(owner);

    const tag = `CMEB-${Date.now()}`;
    const { data, error } = await owner.client.rpc('servsync_create_local_contact', {
      p_display_name: tag,
      p_phone: '',
      p_email: '',
      p_notes: '',
      p_home_nickname: `${tag}-home`,
      p_address_line1: 'Role probe address',
      p_address_line2: '',
      p_city: 'Testville',
      p_state: 'AL',
      p_zip_code: '36532',
      p_home_type: '',
      p_year_built: '',
      p_square_feet: '',
      p_home_notes: '',
    });
    expect(error, 'owner should create the temporary local customer fixture').toBeNull();
    contactId = data.contact.id as string;
    homeId = data.home.id as string;
  });

  test.afterAll(async () => {
    if (owner?.client && contactId) {
      await owner.client.from('contractor_local_contacts').delete().eq('id', contactId);
    }
    await Promise.all(
      [owner, admin, office, fieldTech, viewer, disabled, contractorB]
        .filter(Boolean)
        .map(account => account.client.auth.signOut().catch(() => undefined)),
    );
  });

  test('allows owner/admin/office and denies field tech, viewer, inactive, cross-tenant, and anonymous helper access', async () => {
    await expect(canManage(owner, ownerContractorId)).resolves.toBe(true);
    await expect(canManage(admin, ownerContractorId)).resolves.toBe(true);
    await expect(canManage(office, ownerContractorId)).resolves.toBe(true);
    await expect(canManage(fieldTech, ownerContractorId)).resolves.toBe(false);
    await expect(canManage(viewer, ownerContractorId)).resolves.toBe(false);
    await expect(canManage(disabled, ownerContractorId)).resolves.toBe(false);
    await expect(canManage(contractorB, ownerContractorId)).resolves.toBe(false);

    const { url, anonKey } = sandboxConfig();
    const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
    const anonymousResult = await anonymous.rpc('current_user_can_manage_contractor_customers', {
      p_contractor_id: ownerContractorId,
    });
    expect(anonymousResult.error, 'anonymous callers must not execute the helper').toBeTruthy();
  });

  test('enforces role and generic foreign-or-unknown denial across all three mutation RPCs', async () => {
    for (const account of [owner, admin, office]) {
      expect((await updateCustomer(account, contactId, `Allowed ${account.role}`)).error).toBeNull();
      expect((await updateProperty(account, homeId, `Allowed ${account.role} property`)).error).toBeNull();
      expect((await createProperty(account, contactId, `Allowed ${account.role} added property`)).error).toBeNull();
    }

    for (const account of [fieldTech, viewer, disabled]) {
      expect((await updateCustomer(account, contactId, `Denied ${account.role}`)).error?.message).toBe('Local customer is unavailable.');
      expect((await createProperty(account, contactId, `Denied ${account.role}`)).error?.message).toBe('Local customer is unavailable.');
      expect((await updateProperty(account, homeId, `Denied ${account.role}`)).error?.message).toBe('Local property is unavailable.');
    }

    const unknownContactId = randomUUID();
    const unknownHomeId = randomUUID();
    expect((await updateCustomer(contractorB, contactId, 'Foreign')).error?.message)
      .toBe((await updateCustomer(contractorB, unknownContactId, 'Unknown')).error?.message);
    expect((await createProperty(contractorB, contactId, 'Foreign')).error?.message)
      .toBe((await createProperty(contractorB, unknownContactId, 'Unknown')).error?.message);
    expect((await updateProperty(contractorB, homeId, 'Foreign')).error?.message)
      .toBe((await updateProperty(contractorB, unknownHomeId, 'Unknown')).error?.message);
  });

  test('preserves claimed-record mutation denial', async () => {
    const claimedAt = new Date().toISOString();
    expect((await owner.client.from('contractor_local_homes').update({ claimed_at: claimedAt }).eq('id', homeId)).error).toBeNull();
    expect((await updateProperty(owner, homeId, 'Claimed update')).error?.message)
      .toContain('homeowner-controlled after claim');
    expect((await updateCustomer(owner, contactId, 'Claimed customer update')).error?.message)
      .toContain('homeowner-controlled after claim');
    expect((await owner.client.from('contractor_local_homes').update({ claimed_at: null }).eq('id', homeId)).error).toBeNull();
  });
});
