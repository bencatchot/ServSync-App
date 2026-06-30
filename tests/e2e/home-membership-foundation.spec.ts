import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';

type CredentialKey = Parameters<typeof credentialsFor>[0];
type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
};
type HomeRole = 'owner' | 'admin' | 'member' | 'viewer';
type MembershipStatus = 'invited' | 'active' | 'removed' | 'declined';

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run home membership foundation probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Home membership foundation probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing home membership fixture setup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }
}

function assertUuid(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Refusing sandbox SQL for invalid UUID "${id}".`);
  }
}

function runLinkedSandboxSql(sql: string) {
  requireLinkedSandbox();
  execFileSync('supabase', ['db', 'query', '--linked', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

async function signInAs(key: CredentialKey): Promise<AuthenticatedClient> {
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

async function signOutAll(accounts: AuthenticatedClient[]) {
  await Promise.all(accounts.map(account => account.client.auth.signOut().catch(() => undefined)));
}

async function firstHomeId(account: AuthenticatedClient, label: string): Promise<string> {
  const result = await account.client
    .from('homes')
    .select('id')
    .eq('homeowner_user_id', account.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  expect(result.error, `${label} home lookup should not error`).toBeNull();
  expect(result.data?.id, `${label} home fixture should exist`).toBeTruthy();
  return result.data!.id as string;
}

async function currentHomeRole(account: AuthenticatedClient, homeId: string): Promise<string | null> {
  const { data, error } = await account.client.rpc('current_user_home_role', { p_home_id: homeId });
  expect(error, 'current_user_home_role should not error').toBeNull();
  return data as string | null;
}

async function can(account: AuthenticatedClient, rpcName: string, homeId: string): Promise<boolean> {
  const { data, error } = await account.client.rpc(rpcName, { p_home_id: homeId });
  expect(error, `${rpcName} should not error`).toBeNull();
  return data as boolean;
}

async function expectCapabilities(
  account: AuthenticatedClient,
  homeId: string,
  expected: {
    role: string | null;
    access: boolean;
    manage: boolean;
    approve: boolean;
    connections: boolean;
  },
) {
  await expect(currentHomeRole(account, homeId)).resolves.toBe(expected.role);
  await expect(can(account, 'current_user_can_access_home', homeId)).resolves.toBe(expected.access);
  await expect(can(account, 'current_user_can_manage_home', homeId)).resolves.toBe(expected.manage);
  await expect(can(account, 'current_user_can_approve_home_work', homeId)).resolves.toBe(expected.approve);
  await expect(can(account, 'current_user_can_manage_home_connections', homeId)).resolves.toBe(expected.connections);
}

function deleteMembership(homeId: string, userId: string) {
  assertUuid(homeId);
  assertUuid(userId);
  runLinkedSandboxSql(`
delete from public.home_memberships
 where home_id = '${homeId}'
   and user_id = '${userId}';
`);
}

function insertMembership(homeId: string, userId: string, role: HomeRole, status: MembershipStatus) {
  assertUuid(homeId);
  assertUuid(userId);
  runLinkedSandboxSql(`
insert into public.home_memberships (
  home_id,
  user_id,
  role,
  status,
  accepted_at,
  removed_at
) values (
  '${homeId}',
  '${userId}',
  '${role}',
  '${status}',
  case when '${status}' = 'active' then now() else null end,
  case when '${status}' in ('removed', 'declined') then now() else null end
);
`);
}

function updateMembership(homeId: string, userId: string, role: HomeRole, status: MembershipStatus) {
  assertUuid(homeId);
  assertUuid(userId);
  runLinkedSandboxSql(`
update public.home_memberships
   set role = '${role}',
       status = '${status}',
       accepted_at = case when '${status}' = 'active' then now() else null end,
       removed_at = case when '${status}' in ('removed', 'declined') then now() else null end
 where home_id = '${homeId}'
   and user_id = '${userId}';
`);
}

test.describe('sandbox home membership foundation', () => {
  test.beforeAll(() => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();
    requireLinkedSandbox();
  });

  test('existing home owner has owner membership and helper access while unrelated homeowner is denied', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');

      const membership = await homeowner.client
        .from('home_memberships')
        .select('home_id,user_id,role,status')
        .eq('home_id', homeId)
        .eq('user_id', homeowner.userId)
        .maybeSingle();

      expect(membership.error, 'owner membership lookup should not error').toBeNull();
      expect(membership.data?.role, 'existing owner should have owner membership from backfill').toBe('owner');
      expect(membership.data?.status, 'existing owner membership should be active').toBe('active');

      await expectCapabilities(homeowner, homeId, {
        role: 'owner',
        access: true,
        manage: true,
        approve: true,
        connections: true,
      });

      await expectCapabilities(homeownerB, homeId, {
        role: null,
        access: false,
        manage: false,
        approve: false,
        connections: false,
      });
    } finally {
      await signOutAll(accounts);
    }
  });

  test('active membership roles qualify only for their intended helper capabilities', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      deleteMembership(homeId, homeownerB.userId);

      insertMembership(homeId, homeownerB.userId, 'admin', 'active');
      await expectCapabilities(homeownerB, homeId, {
        role: 'admin',
        access: true,
        manage: true,
        approve: true,
        connections: true,
      });

      updateMembership(homeId, homeownerB.userId, 'member', 'active');
      await expectCapabilities(homeownerB, homeId, {
        role: 'member',
        access: true,
        manage: false,
        approve: false,
        connections: false,
      });

      updateMembership(homeId, homeownerB.userId, 'viewer', 'active');
      await expectCapabilities(homeownerB, homeId, {
        role: 'viewer',
        access: true,
        manage: false,
        approve: false,
        connections: false,
      });
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      deleteMembership(homeId, homeownerB.userId);
      await signOutAll(accounts);
    }
  });

  test('non-active memberships do not qualify for normal home access helpers', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');

      for (const status of ['invited', 'removed', 'declined'] as MembershipStatus[]) {
        deleteMembership(homeId, homeownerB.userId);
        insertMembership(homeId, homeownerB.userId, 'member', status);

        await expectCapabilities(homeownerB, homeId, {
          role: null,
          access: false,
          manage: false,
          approve: false,
          connections: false,
        });
      }
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      deleteMembership(homeId, homeownerB.userId);
      await signOutAll(accounts);
    }
  });

  test('duplicate open memberships and primary owner removal are blocked', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      deleteMembership(homeId, homeownerB.userId);
      insertMembership(homeId, homeownerB.userId, 'member', 'active');

      expect(() => insertMembership(homeId, homeownerB.userId, 'viewer', 'active')).toThrow();

      expect(() =>
        runLinkedSandboxSql(`
update public.home_memberships
   set role = 'viewer',
       status = 'removed',
       removed_at = now()
 where home_id = '${homeId}'
   and user_id = '${homeowner.userId}';
`),
      ).toThrow();

      await expectCapabilities(homeowner, homeId, {
        role: 'owner',
        access: true,
        manage: true,
        approve: true,
        connections: true,
      });
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      deleteMembership(homeId, homeownerB.userId);
      await signOutAll(accounts);
    }
  });
});
