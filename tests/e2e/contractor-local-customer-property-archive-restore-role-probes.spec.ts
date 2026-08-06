import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';
import { deleteLocalCustomerFixtures, setLocalHomeClaimedAt } from './helpers/sandboxLocalCustomerOperator';
import { requireValidationTarget } from './helpers/validationTarget';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const PROBE_ENABLED = process.env.LOCAL_CUSTOMER_ARCHIVE_RESTORE_PROBES === 'true';

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

function archiveCustomer(client: SupabaseClient, contactId: string) {
  return client.rpc('servsync_archive_local_customer', { p_local_contact_id: contactId });
}

function restoreCustomer(client: SupabaseClient, contactId: string) {
  return client.rpc('servsync_restore_local_customer', { p_local_contact_id: contactId });
}

function archiveProperty(client: SupabaseClient, homeId: string) {
  return client.rpc('servsync_archive_local_property', { p_local_home_id: homeId });
}

function restoreProperty(client: SupabaseClient, homeId: string) {
  return client.rpc('servsync_restore_local_property', { p_local_home_id: homeId });
}

test.describe('contractor-local archive/restore Sandbox role probes', () => {
  let accounts = {} as Record<ProbeRole, SupabaseClient>;
  let contractorId = '';
  let contactId = '';
  let homeId = '';

  test.beforeAll(async () => {
    test.skip(!PROBE_ENABLED, 'Enable only after separately authorized Sandbox migration application.');
    requireApprovedSandboxForMutation();
    requireValidationTarget({ requireSupabaseEnv: true });
    accounts = Object.fromEntries(await Promise.all(
      (Object.keys(ROLE_ENV) as ProbeRole[]).map(async role => [role, await signIn(role)] as const),
    )) as Record<ProbeRole, SupabaseClient>;

    const tag = `LCAR-${Date.now()}`;
    const { data, error } = await accounts.owner.rpc('servsync_create_local_contact', {
      p_display_name: `${tag} customer`,
      p_phone: '', p_email: '', p_notes: '', p_home_nickname: `${tag} property`,
      p_address_line1: 'Archive validation address', p_address_line2: '', p_city: 'Testville',
      p_state: 'AL', p_zip_code: '36532', p_home_type: '', p_year_built: '', p_square_feet: '', p_home_notes: '',
    });
    expect(error, 'owner should create the disposable lifecycle fixture').toBeNull();
    contractorId = data.contact.contractor_id as string;
    contactId = data.contact.id as string;
    homeId = data.home.id as string;
  });

  test.afterAll(async () => {
    await deleteLocalCustomerFixtures(contactId ? [contactId] : []);
    await Promise.all(Object.values(accounts).map(client => client.auth.signOut().catch(() => undefined)));
  });

  test('allows owner, active admin, and active office to archive and restore both targets', async () => {
    for (const role of ['owner', 'admin', 'office'] as ProbeRole[]) {
      expect((await archiveProperty(accounts[role], homeId)).error, `${role} property archive`).toBeNull();
      expect((await restoreProperty(accounts[role], homeId)).error, `${role} property restore`).toBeNull();
      expect((await archiveCustomer(accounts[role], contactId)).error, `${role} customer archive`).toBeNull();
      expect((await restoreCustomer(accounts[role], contactId)).error, `${role} customer restore`).toBeNull();
    }
  });

  test('denies lower, inactive, removed, homeowner, anonymous, and cross-tenant callers generically', async () => {
    const operations = [
      ['archive customer', (client: SupabaseClient, id: string) => archiveCustomer(client, id), contactId],
      ['restore customer', (client: SupabaseClient, id: string) => restoreCustomer(client, id), contactId],
      ['archive property', (client: SupabaseClient, id: string) => archiveProperty(client, id), homeId],
      ['restore property', (client: SupabaseClient, id: string) => restoreProperty(client, id), homeId],
    ] as const;

    for (const role of ['field_tech', 'viewer', 'inactive', 'removed', 'homeowner'] as ProbeRole[]) {
      for (const [label, operation, id] of operations) {
        const result = await operation(accounts[role], id);
        expect(result.error?.code, `${role} ${label} should be denied`).toBe('42501');
        expect(result.error?.message, `${role} ${label} should fail generically`).toMatch(/^Local (customer|property) is unavailable\.$/);
      }
    }

    for (const [label, operation, id] of operations) {
      const foreign = await operation(accounts.contractorB, id);
      const unknown = await operation(accounts.contractorB, randomUUID());
      expect(foreign.error?.code, `cross-tenant ${label}`).toBe('42501');
      expect(foreign.error?.message, `foreign and unknown ${label}`).toBe(unknown.error?.message);
    }

    const anonymous = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('VITE_SUPABASE_ANON_KEY'), {
      auth: { persistSession: false },
    });
    for (const [, operation, id] of operations) {
      expect((await operation(anonymous, id)).error).toBeTruthy();
    }
  });

  test('revokes pending invitations on customer archive and never revives them on restore', async () => {
    const created = await accounts.owner.rpc('servsync_create_local_customer_claim_invite_v2', {
      p_local_contact_id: contactId,
      p_local_home_ids: [homeId],
      p_expires_days: 14,
    });
    expect(created.error).toBeNull();

    expect((await archiveCustomer(accounts.owner, contactId)).error).toBeNull();
    const archivedInvites = await accounts.owner.rpc('servsync_list_local_customer_claim_invites_v2', {
      p_contractor_id: contractorId,
    });
    expect(archivedInvites.error).toBeNull();
    expect((archivedInvites.data as Array<{ local_contact_id: string; status: string }>).some(invite => (
      invite.local_contact_id === contactId && invite.status === 'revoked'
    ))).toBe(true);

    expect((await restoreCustomer(accounts.owner, contactId)).error).toBeNull();
    const restoredInvites = await accounts.owner.rpc('servsync_list_local_customer_claim_invites_v2', {
      p_contractor_id: contractorId,
    });
    expect(restoredInvites.error).toBeNull();
    expect((restoredInvites.data as Array<{ local_contact_id: string; status: string }>).some(invite => (
      invite.local_contact_id === contactId && invite.status === 'pending'
    ))).toBe(false);
  });

  test('keeps property state independent, blocks restore under archived parent, and denies claimed targets', async () => {
    expect((await archiveProperty(accounts.owner, homeId)).error).toBeNull();
    expect((await archiveCustomer(accounts.owner, contactId)).error).toBeNull();
    expect((await restoreProperty(accounts.owner, homeId)).error?.message).toBe('Local property is unavailable.');
    expect((await restoreCustomer(accounts.owner, contactId)).error).toBeNull();

    const archivedRows = await accounts.owner.rpc('servsync_list_archived_local_customers');
    expect(archivedRows.error).toBeNull();
    expect((archivedRows.data as Array<{ id: string; homes: Array<{ id: string }> }>).some(row => (
      row.id === contactId && row.homes.some(home => home.id === homeId)
    ))).toBe(true);
    expect((await restoreProperty(accounts.owner, homeId)).error).toBeNull();

    await setLocalHomeClaimedAt(homeId, new Date().toISOString());
    expect((await archiveProperty(accounts.owner, homeId)).error?.message).toBe('Local property is unavailable.');
    expect((await archiveCustomer(accounts.owner, contactId)).error?.message).toBe('Local customer is unavailable.');
    // The disposable customer is deleted by afterAll; deliberately do not
    // simulate an unsupported claim reversal on an immutable claimed row.
  });
});
