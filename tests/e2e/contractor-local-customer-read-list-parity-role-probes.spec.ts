import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requiredEnv } from './helpers/env';
import { requireValidationTarget } from './helpers/validationTarget';

const PROBE_ENABLED = process.env.LOCAL_CUSTOMER_READ_LIST_PARITY_PROBES === 'true';

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

async function summaryRows(client: SupabaseClient) {
  return client.rpc('servsync_list_local_customer_summaries');
}

function expectSafeSummaries(payload: unknown) {
  expect(Array.isArray(payload)).toBe(true);
  for (const customer of payload as Array<Record<string, unknown>>) {
    expect(Object.keys(customer).sort()).toEqual(['display_name', 'homes', 'id']);
    for (const home of customer.homes as Array<Record<string, unknown>>) {
      expect(Object.keys(home).sort()).toEqual([
        'address_line1', 'address_line2', 'city', 'id', 'nickname', 'state', 'zip_code',
      ]);
    }
    expect(JSON.stringify(customer)).not.toMatch(/phone|email|notes|claim|invite|token|homeowner_user_id|contractor_id/);
  }
}

test.describe('contractor local customer read/list parity Sandbox role probes', () => {
  test.beforeEach(() => {
    test.skip(!PROBE_ENABLED, 'Enable only after separately authorized Sandbox migration application and fixture preparation.');
    requireValidationTarget({ requireSupabaseEnv: true });
  });

  test('allows manager and field-work summary reads while denying inactive, removed, homeowner, and anonymous callers', async () => {
    const accounts = Object.fromEntries(await Promise.all(
      (['owner', 'admin', 'office', 'field_tech', 'viewer', 'inactive', 'removed', 'homeowner'] as ProbeRole[])
        .map(async role => [role, await signIn(role)] as const),
    )) as Record<ProbeRole, SupabaseClient>;

    const visibleIds = new Map<ProbeRole, string[]>();
    for (const role of ['owner', 'admin', 'office', 'field_tech', 'viewer'] as ProbeRole[]) {
      const result = await summaryRows(accounts[role]);
      expect(result.error, `${role} summary read should succeed`).toBeNull();
      expectSafeSummaries(result.data);
      visibleIds.set(role, (result.data as Array<{ id: string }>).map(row => row.id).sort());
    }
    expect(visibleIds.get('admin')).toEqual(visibleIds.get('owner'));
    expect(visibleIds.get('office')).toEqual(visibleIds.get('owner'));
    expect(visibleIds.get('field_tech')).toEqual(visibleIds.get('owner'));
    for (const role of ['inactive', 'removed', 'homeowner'] as ProbeRole[]) {
      expect((await summaryRows(accounts[role])).error?.code, `${role} summary read should fail closed`).toBe('42501');
    }

    const anonymous = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('VITE_SUPABASE_ANON_KEY'), {
      auth: { persistSession: false },
    });
    expect((await summaryRows(anonymous)).error, 'anonymous must not execute the summary RPC').toBeTruthy();
    await Promise.all(Object.values(accounts).map(client => client.auth.signOut()));
  });

  test('limits management detail to owner/admin/office and denies cross-tenant ID substitution', async () => {
    const localContactId = requiredEnv('LOCAL_CUSTOMER_READ_LIST_CONTACT_ID');
    const unknownContactId = requiredEnv('LOCAL_CUSTOMER_READ_LIST_UNKNOWN_CONTACT_ID');
    const accounts = Object.fromEntries(await Promise.all(
      (['owner', 'admin', 'office', 'field_tech', 'viewer', 'contractorB'] as ProbeRole[])
        .map(async role => [role, await signIn(role)] as const),
    )) as Record<ProbeRole, SupabaseClient>;

    for (const role of ['owner', 'admin', 'office'] as ProbeRole[]) {
      const result = await accounts[role].rpc('servsync_get_local_customer_management_detail', {
        p_local_contact_id: localContactId,
      });
      expect(result.error, `${role} management detail should succeed`).toBeNull();
      expect(result.data?.id).toBe(localContactId);
    }
    for (const role of ['field_tech', 'viewer', 'contractorB'] as ProbeRole[]) {
      const result = await accounts[role].rpc('servsync_get_local_customer_management_detail', {
        p_local_contact_id: localContactId,
      });
      expect(result.error?.code, `${role} management detail should fail closed`).toBe('42501');
      expect(result.error?.message).toBe('Local customer is unavailable.');
    }
    const unknownResult = await accounts.owner.rpc('servsync_get_local_customer_management_detail', {
      p_local_contact_id: unknownContactId,
    });
    const foreignResult = await accounts.contractorB.rpc('servsync_get_local_customer_management_detail', {
      p_local_contact_id: localContactId,
    });
    expect(unknownResult.error?.code).toBe(foreignResult.error?.code);
    expect(unknownResult.error?.message).toBe(foreignResult.error?.message);
    await Promise.all(Object.values(accounts).map(client => client.auth.signOut()));
  });

  test('excludes claimed snapshots and limits viewer results to prepared work-linked IDs', async () => {
    const claimedContactId = requiredEnv('LOCAL_CUSTOMER_READ_LIST_CLAIMED_CONTACT_ID');
    const viewerLinkedContactId = requiredEnv('LOCAL_CUSTOMER_READ_LIST_VIEWER_LINKED_CONTACT_ID');
    const viewerUnlinkedContactId = requiredEnv('LOCAL_CUSTOMER_READ_LIST_VIEWER_UNLINKED_CONTACT_ID');
    const [owner, viewer] = await Promise.all([signIn('owner'), signIn('viewer')]);
    const [ownerResult, viewerResult] = await Promise.all([summaryRows(owner), summaryRows(viewer)]);
    expect(ownerResult.error).toBeNull();
    expect(viewerResult.error).toBeNull();
    const ownerIds = (ownerResult.data as Array<{ id: string }>).map(row => row.id);
    const viewerIds = (viewerResult.data as Array<{ id: string }>).map(row => row.id);
    expect(ownerIds).not.toContain(claimedContactId);
    expect(viewerIds).toContain(viewerLinkedContactId);
    expect(viewerIds).not.toContain(viewerUnlinkedContactId);

    const contractorB = await signIn('contractorB');
    const contractorBResult = await summaryRows(contractorB);
    expect(contractorBResult.error).toBeNull();
    expect((contractorBResult.data as Array<{ id: string }>).map(row => row.id)).not.toContain(viewerLinkedContactId);
    expectSafeSummaries(contractorBResult.data);
    await Promise.all([owner.auth.signOut(), viewer.auth.signOut(), contractorB.auth.signOut()]);
  });
});
