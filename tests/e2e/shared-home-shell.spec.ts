import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentialsFor, requiredEnv, type TestCredentialKey } from './helpers/env';
import { openSidebarTab } from './helpers/auth';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';

type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
};
type HomeRole = 'admin' | 'member' | 'viewer';
type MembershipStatus = 'invited' | 'active' | 'removed' | 'declined';
type HomeFixture = {
  id: string;
  nickname: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};
type SharedHomeShell = {
  home_id: string;
  display_label: string | null;
  nickname: string | null;
  city: string | null;
  state: string | null;
  role: HomeRole;
  membership_status: MembershipStatus;
};
type SharedHomeAddressShell = SharedHomeShell & {
  address_line1: string | null;
  address_line2: string | null;
  zip_code: string | null;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run shared home shell probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Shared home shell probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing shared home shell fixture setup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }
}

function assertUuid(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Refusing sandbox SQL for invalid UUID "${id}".`);
  }
}

function uuidLiteral(id: string) {
  assertUuid(id);
  return `'${id}'::uuid`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runLinkedSandboxSql(sql: string) {
  requireLinkedSandbox();
  execFileSync('supabase', ['db', 'query', '--linked', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

async function signInAs(key: TestCredentialKey): Promise<AuthenticatedClient> {
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

async function firstHome(account: AuthenticatedClient): Promise<HomeFixture> {
  const result = await account.client
    .from('homes')
    .select('id, nickname, address_line1, address_line2, city, state, zip_code')
    .eq('homeowner_user_id', account.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  expect(result.error, 'homeowner home lookup should not error').toBeNull();
  expect(result.data?.id, 'homeowner fixture home should exist').toBeTruthy();
  return result.data as HomeFixture;
}

function cleanupMembershipArtifacts(homeId: string, userId: string) {
  runLinkedSandboxSql(`
delete from public.home_membership_audit_events
 where home_id = ${uuidLiteral(homeId)}
   and (
     actor_user_id = ${uuidLiteral(userId)}
     or target_user_id = ${uuidLiteral(userId)}
     or membership_id in (
       select id
         from public.home_memberships
        where home_id = ${uuidLiteral(homeId)}
          and user_id = ${uuidLiteral(userId)}
     )
   );

delete from public.home_membership_email_invites
 where home_id = ${uuidLiteral(homeId)}
   and (
     accepted_by_user_id = ${uuidLiteral(userId)}
     or membership_id in (
       select id
         from public.home_memberships
        where home_id = ${uuidLiteral(homeId)}
          and user_id = ${uuidLiteral(userId)}
     )
   );

delete from public.home_memberships
 where home_id = ${uuidLiteral(homeId)}
   and user_id = ${uuidLiteral(userId)};
`);
}

function insertMembership(homeId: string, userId: string, role: HomeRole, status: MembershipStatus) {
  runLinkedSandboxSql(`
insert into public.home_memberships (
  home_id,
  user_id,
  role,
  status,
  accepted_at,
  removed_at
) values (
  ${uuidLiteral(homeId)},
  ${uuidLiteral(userId)},
  '${role}',
  '${status}',
  case when '${status}' = 'active' then now() else null end,
  case when '${status}' in ('removed', 'declined') then now() else null end
);
`);
}

async function listSharedHomeShells(account: AuthenticatedClient): Promise<SharedHomeShell[]> {
  const result = await account.client.rpc('servsync_list_my_shared_home_shells');
  expect(result.error, 'shared home shell RPC should not error').toBeNull();
  return (result.data || []) as SharedHomeShell[];
}

async function listSharedHomeAddressShells(account: AuthenticatedClient): Promise<SharedHomeAddressShell[]> {
  const result = await account.client.rpc('servsync_list_my_shared_home_address_shells');
  expect(result.error, 'shared home address shell RPC should not error').toBeNull();
  return (result.data || []) as SharedHomeAddressShell[];
}

async function loginAsHomeownerB(page: Page) {
  const credentials = credentialsFor('homeownerB');
  await page.goto('/#/homeowner');
  const authMain = page.getByRole('main');

  await expect(authMain.getByRole('heading', { name: /^Sign in$/i })).toBeVisible();
  await authMain.getByLabel(/^Email$/i).fill(credentials.email);
  await authMain.getByLabel(/^Password$/i).fill(credentials.password);
  await authMain.getByRole('button', { name: /^Sign in$/i }).click();

  await expect(page.getByRole('heading', { name: /^Sign in$/i })).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^Properties$/i })).toBeVisible();
}

test.describe('shared home shell', () => {
  test.beforeEach(() => {
    requireApprovedSandboxForMutation();
  });

  test('RPC returns only active shared shells with safe fields', async () => {
    const owner = await signInAs('homeowner');
    const sharedMember = await signInAs('homeownerB');
    const ownerHome = await firstHome(owner);

    try {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);

      for (const status of ['invited', 'declined', 'removed'] as const) {
        insertMembership(ownerHome.id, sharedMember.userId, 'viewer', status);
        const inactiveShells = await listSharedHomeShells(sharedMember);
        expect(inactiveShells.some(shell => shell.home_id === ownerHome.id), `${status} membership should not surface`).toBe(false);
        cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      }

      insertMembership(ownerHome.id, sharedMember.userId, 'viewer', 'active');

      const ownerShells = await listSharedHomeShells(owner);
      expect(ownerShells.some(shell => shell.home_id === ownerHome.id), 'owner should not see owned home duplicated as shared').toBe(false);

      const sharedShells = await listSharedHomeShells(sharedMember);
      const shell = sharedShells.find(row => row.home_id === ownerHome.id);
      expect(shell, 'active shared member should see a shared home shell').toBeTruthy();
      expect(shell!.role).toBe('viewer');
      expect(shell!.membership_status).toBe('active');
      expect(shell!.city).toBe(ownerHome.city);
      expect(shell!.state).toBe(ownerHome.state);
      expect(Object.keys(shell!).sort()).toEqual([
        'city',
        'display_label',
        'home_id',
        'membership_status',
        'nickname',
        'role',
        'state',
      ]);
      expect((shell as Record<string, unknown>).address_line1).toBeUndefined();
      expect((shell as Record<string, unknown>).homeowner_user_id).toBeUndefined();
      expect((shell as Record<string, unknown>).contractor_id).toBeUndefined();
    } finally {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      await signOutAll([owner, sharedMember]);
    }
  });

  test('address shell RPC exposes street and zip only to active admin and member roles', async () => {
    const owner = await signInAs('homeowner');
    const sharedMember = await signInAs('homeownerB');
    const ownerHome = await firstHome(owner);
    const expectedKeys = [
      'address_line1',
      'address_line2',
      'city',
      'display_label',
      'home_id',
      'membership_status',
      'nickname',
      'role',
      'state',
      'zip_code',
    ];

    try {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);

      for (const status of ['invited', 'declined', 'removed'] as const) {
        insertMembership(ownerHome.id, sharedMember.userId, 'member', status);
        const inactiveShells = await listSharedHomeAddressShells(sharedMember);
        expect(inactiveShells.some(shell => shell.home_id === ownerHome.id), `${status} membership should not surface`).toBe(false);
        cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      }

      const ownerShells = await listSharedHomeAddressShells(owner);
      expect(ownerShells.some(shell => shell.home_id === ownerHome.id), 'owner should not see owned home duplicated as shared').toBe(false);

      for (const role of ['admin', 'member', 'viewer'] as const) {
        insertMembership(ownerHome.id, sharedMember.userId, role, 'active');
        const shells = await listSharedHomeAddressShells(sharedMember);
        const shell = shells.find(row => row.home_id === ownerHome.id);

        expect(shell, `${role} should see active shared home address shell`).toBeTruthy();
        expect(Object.keys(shell!).sort()).toEqual(expectedKeys);
        expect(shell!.role).toBe(role);
        expect(shell!.membership_status).toBe('active');
        expect(shell!.city).toBe(ownerHome.city);
        expect(shell!.state).toBe(ownerHome.state);

        if (role === 'viewer') {
          expect(shell!.address_line1, 'viewer should not receive street line 1').toBeNull();
          expect(shell!.address_line2, 'viewer should not receive street line 2').toBeNull();
          expect(shell!.zip_code, 'viewer should not receive zip code').toBeNull();
        } else {
          expect(shell!.address_line1, `${role} should receive street line 1`).toBe(ownerHome.address_line1);
          expect(shell!.address_line2, `${role} should receive street line 2`).toBe(ownerHome.address_line2);
          expect(shell!.zip_code, `${role} should receive zip code`).toBe(ownerHome.zip_code);
        }

        expect((shell as Record<string, unknown>).homeowner_user_id).toBeUndefined();
        expect((shell as Record<string, unknown>).owner_email).toBeUndefined();
        expect((shell as Record<string, unknown>).contractor_id).toBeUndefined();
        expect((shell as Record<string, unknown>).service_requests).toBeUndefined();
        expect((shell as Record<string, unknown>).estimates).toBeUndefined();
        expect((shell as Record<string, unknown>).invoices).toBeUndefined();
        expect((shell as Record<string, unknown>).jobs).toBeUndefined();
        expect((shell as Record<string, unknown>).documents).toBeUndefined();
        expect((shell as Record<string, unknown>).messages).toBeUndefined();
        expect((shell as Record<string, unknown>).storage).toBeUndefined();
        expect((shell as Record<string, unknown>).contractor_connections).toBeUndefined();
        expect((shell as Record<string, unknown>).home_history).toBeUndefined();

        cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      }

      const oldShells = await listSharedHomeShells(sharedMember);
      expect(oldShells.find(row => row.home_id === ownerHome.id), 'old RPC should remain compatible after cleanup').toBeUndefined();
    } finally {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      await signOutAll([owner, sharedMember]);
    }
  });

  test('homeowner UI renders member shared address shell without owner-only actions or record surfaces', async ({ page }) => {
    const owner = await signInAs('homeowner');
    const sharedMember = await signInAs('homeownerB');
    const ownerHome = await firstHome(owner);
    const expectedLabel = ownerHome.nickname || [ownerHome.city, ownerHome.state].filter(Boolean).join(', ') || 'Shared home';
    const expectedCityStateZip = [[ownerHome.city, ownerHome.state].filter(Boolean).join(', '), ownerHome.zip_code].filter(Boolean).join(' ');

    try {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      insertMembership(ownerHome.id, sharedMember.userId, 'member', 'active');

      await loginAsHomeownerB(page);
      await openSidebarTab(page, /^Properties$/i);

      const panel = page.getByTestId('shared-home-shells-panel');
      await expect(page.getByText(/Homes shared with me/i)).toBeVisible();
      await expect(panel.getByText(/Shared home records are limited/i)).toBeVisible();
      await expect(panel.getByText(/contractor connections, and Home History remain private/i)).toBeVisible();

      const card = panel.getByTestId('shared-home-shell-card').filter({ hasText: expectedLabel }).first();
      await expect(card).toBeVisible();
      await expect(card.getByText(/Member/i)).toBeVisible();
      await expect(card.getByText(/Active/i)).toBeVisible();
      await expect(card.getByText(/cannot be selected for owner dashboard records yet/i)).toBeVisible();
      await expect(card.getByRole('button')).toHaveCount(0);

      if (ownerHome.address_line1) {
        await expect(card.getByText(ownerHome.address_line1, { exact: true })).toBeVisible();
      }
      if (ownerHome.address_line2) {
        await expect(card.getByText(ownerHome.address_line2, { exact: true })).toBeVisible();
      }
      if (expectedCityStateZip) {
        await expect(card.getByText(expectedCityStateZip, { exact: true })).toBeVisible();
      }
      await expect(card.getByText(/Limited location shared/i)).toHaveCount(0);
      await expect(panel.getByText(/Service Requests shared from this home/i)).toHaveCount(0);
      await expect(panel.getByText(/Documents shared from this home/i)).toHaveCount(0);
    } finally {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      await signOutAll([owner, sharedMember]);
    }
  });

  test('homeowner UI renders viewer shared shell without street or zip placeholders', async ({ page }) => {
    const owner = await signInAs('homeowner');
    const sharedMember = await signInAs('homeownerB');
    const ownerHome = await firstHome(owner);
    const expectedLabel = ownerHome.nickname || [ownerHome.city, ownerHome.state].filter(Boolean).join(', ') || 'Shared home';
    const expectedLocation = [ownerHome.city, ownerHome.state].filter(Boolean).join(', ');

    try {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      insertMembership(ownerHome.id, sharedMember.userId, 'viewer', 'active');

      await loginAsHomeownerB(page);
      await openSidebarTab(page, /^Properties$/i);

      const panel = page.getByTestId('shared-home-shells-panel');
      const card = panel.getByTestId('shared-home-shell-card').filter({ hasText: expectedLabel }).first();

      await expect(card).toBeVisible();
      await expect(card.getByText(/Viewer/i)).toBeVisible();
      await expect(card.getByText(/Active/i)).toBeVisible();
      await expect(card.getByText(/Limited location shared/i)).toBeVisible();
      await expect(card.getByText(/cannot be selected for owner dashboard records yet/i)).toBeVisible();
      await expect(card.getByRole('button')).toHaveCount(0);

      if (expectedLocation) {
        await expect(card.getByText(expectedLocation, { exact: true })).toBeVisible();
      }
      if (ownerHome.address_line1) {
        await expect(card.getByText(ownerHome.address_line1, { exact: true })).toHaveCount(0);
      }
      if (ownerHome.address_line2) {
        await expect(card.getByText(ownerHome.address_line2, { exact: true })).toHaveCount(0);
      }
      if (ownerHome.zip_code) {
        await expect(card.getByText(new RegExp(`\\b${escapeRegExp(ownerHome.zip_code)}\\b`))).toHaveCount(0);
      }
      await expect(card.getByText(/undefined|null/i)).toHaveCount(0);
      await expect(panel.getByText(/Service Requests shared from this home/i)).toHaveCount(0);
      await expect(panel.getByText(/Documents shared from this home/i)).toHaveCount(0);
    } finally {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      await signOutAll([owner, sharedMember]);
    }
  });
});
