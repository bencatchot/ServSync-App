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
  city: string | null;
  state: string | null;
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
    .select('id, nickname, address_line1, city, state')
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

  test('homeowner UI renders shared shells without owner-only actions or record surfaces', async ({ page }) => {
    const owner = await signInAs('homeowner');
    const sharedMember = await signInAs('homeownerB');
    const ownerHome = await firstHome(owner);
    const expectedLabel = ownerHome.nickname || [ownerHome.city, ownerHome.state].filter(Boolean).join(', ') || 'Shared home';

    try {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      insertMembership(ownerHome.id, sharedMember.userId, 'member', 'active');

      await loginAsHomeownerB(page);
      await openSidebarTab(page, /^Properties$/i);

      const panel = page.getByTestId('shared-home-shells-panel');
      await expect(page.getByText(/Homes shared with me/i)).toBeVisible();
      await expect(panel.getByText(/Shared home records are not enabled yet/i)).toBeVisible();
      await expect(panel.getByText(/contractor connections, and Home History remain private/i)).toBeVisible();

      const card = panel.getByTestId('shared-home-shell-card').filter({ hasText: expectedLabel }).first();
      await expect(card).toBeVisible();
      await expect(card.getByText(/Member/i)).toBeVisible();
      await expect(card.getByText(/Active/i)).toBeVisible();
      await expect(card.getByText(/cannot be selected for owner dashboard records yet/i)).toBeVisible();
      await expect(card.getByRole('button')).toHaveCount(0);

      if (ownerHome.address_line1) {
        await expect(panel.getByText(ownerHome.address_line1, { exact: true })).toHaveCount(0);
      }
      await expect(panel.getByText(/Service Requests shared from this home/i)).toHaveCount(0);
      await expect(panel.getByText(/Documents shared from this home/i)).toHaveCount(0);
    } finally {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      await signOutAll([owner, sharedMember]);
    }
  });
});
