import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentialsFor, requiredEnv, type TestCredentialKey } from './helpers/env';
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
  city: string | null;
  state: string | null;
};
type ReminderFixture = {
  id: string;
  title: string;
};
type SharedHomeReminderShell = {
  reminder_id: string;
  home_id: string;
  home_display_label: string | null;
  title: string;
  due_on: string | null;
  status: 'open';
  is_overdue: boolean | null;
  role: HomeRole;
  membership_status: MembershipStatus;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run shared reminder shell probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Shared reminder shell probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing shared reminder shell fixture setup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
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
    .select('id, nickname, city, state')
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

async function createReminder(
  owner: AuthenticatedClient,
  homeId: string,
  title: string,
  status: 'open' | 'completed' | 'dismissed' = 'open',
): Promise<ReminderFixture> {
  const result = await owner.client
    .from('home_reminders')
    .insert({
      homeowner_user_id: owner.userId,
      home_id: homeId,
      title,
      notes: `Private reminder notes for ${title}`,
      due_on: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      dismissed_at: status === 'dismissed' ? new Date().toISOString() : null,
    })
    .select('id, title')
    .single();

  expect(result.error, `${status} reminder insert should not error`).toBeNull();
  expect(result.data?.id, `${status} reminder should be created`).toBeTruthy();
  return result.data as ReminderFixture;
}

async function cleanupReminders(owner: AuthenticatedClient, reminderIds: string[]) {
  if (!reminderIds.length) {
    return;
  }

  const result = await owner.client.from('home_reminders').delete().in('id', reminderIds);
  expect(result.error, 'sandbox reminder cleanup should not error').toBeNull();
}

async function listSharedReminderShells(account: AuthenticatedClient): Promise<SharedHomeReminderShell[]> {
  const result = await account.client.rpc('servsync_list_my_shared_home_reminder_shells');
  expect(result.error, 'shared home reminder shell RPC should not error').toBeNull();
  return (result.data || []) as SharedHomeReminderShell[];
}

test.describe('shared home reminder shell', () => {
  test.beforeEach(() => {
    requireApprovedSandboxForMutation();
  });

  test('active shared roles can read only minimal open reminder shell fields', async () => {
    const owner = await signInAs('homeowner');
    const sharedMember = await signInAs('homeownerB');
    const ownerHome = await firstHome(owner);
    const uniquePrefix = `FB030 shared reminder shell ${Date.now()}`;
    const reminderIds: string[] = [];

    try {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);

      const openReminder = await createReminder(owner, ownerHome.id, `${uniquePrefix} open`, 'open');
      const completedReminder = await createReminder(owner, ownerHome.id, `${uniquePrefix} completed`, 'completed');
      const dismissedReminder = await createReminder(owner, ownerHome.id, `${uniquePrefix} dismissed`, 'dismissed');
      reminderIds.push(openReminder.id, completedReminder.id, dismissedReminder.id);

      for (const role of ['admin', 'member', 'viewer'] as const) {
        insertMembership(ownerHome.id, sharedMember.userId, role, 'active');

        const shells = await listSharedReminderShells(sharedMember);
        const shell = shells.find(row => row.reminder_id === openReminder.id);

        expect(shell, `${role} should see the open shared reminder shell`).toBeTruthy();
        expect(Object.keys(shell!).sort()).toEqual([
          'due_on',
          'home_display_label',
          'home_id',
          'is_overdue',
          'membership_status',
          'reminder_id',
          'role',
          'status',
          'title',
        ]);
        expect(shell!.home_id).toBe(ownerHome.id);
        expect(shell!.home_display_label).toBe(
          ownerHome.nickname || [ownerHome.city, ownerHome.state].filter(Boolean).join(', ') || 'Shared home',
        );
        expect(shell!.title).toBe(openReminder.title);
        expect(shell!.status).toBe('open');
        expect(shell!.role).toBe(role);
        expect(shell!.membership_status).toBe('active');
        expect(typeof shell!.is_overdue).toBe('boolean');
        expect(shells.some(row => row.reminder_id === completedReminder.id), 'completed reminders should not surface').toBe(false);
        expect(shells.some(row => row.reminder_id === dismissedReminder.id), 'dismissed reminders should not surface').toBe(false);

        expect((shell as Record<string, unknown>).notes).toBeUndefined();
        expect((shell as Record<string, unknown>).homeowner_user_id).toBeUndefined();
        expect((shell as Record<string, unknown>).maintenance_log_id).toBeUndefined();
        expect((shell as Record<string, unknown>).service_request_id).toBeUndefined();
        expect((shell as Record<string, unknown>).invoice_id).toBeUndefined();
        expect((shell as Record<string, unknown>).completed_at).toBeUndefined();
        expect((shell as Record<string, unknown>).dismissed_at).toBeUndefined();
        expect((shell as Record<string, unknown>).documents).toBeUndefined();
        expect((shell as Record<string, unknown>).storage).toBeUndefined();
        expect((shell as Record<string, unknown>).service_requests).toBeUndefined();
        expect((shell as Record<string, unknown>).estimates).toBeUndefined();
        expect((shell as Record<string, unknown>).invoices).toBeUndefined();
        expect((shell as Record<string, unknown>).jobs).toBeUndefined();
        expect((shell as Record<string, unknown>).messages).toBeUndefined();
        expect((shell as Record<string, unknown>).notifications).toBeUndefined();
        expect((shell as Record<string, unknown>).contractor_connections).toBeUndefined();
        expect((shell as Record<string, unknown>).home_history).toBeUndefined();

        const directRows = await sharedMember.client
          .from('home_reminders')
          .select('id, notes, maintenance_log_id, service_request_id, invoice_id')
          .eq('id', openReminder.id);
        expect(directRows.error, 'direct shared-member reminder table probe should not error').toBeNull();
        expect(directRows.data, 'direct home_reminders RLS should remain owner-only').toHaveLength(0);

        cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      }
    } finally {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      await cleanupReminders(owner, reminderIds);
      await signOutAll([owner, sharedMember]);
    }
  });

  test('inactive memberships, unrelated homeowners, and primary owner duplication are excluded', async () => {
    const owner = await signInAs('homeowner');
    const sharedMember = await signInAs('homeownerB');
    const ownerHome = await firstHome(owner);
    const reminderIds: string[] = [];

    try {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);

      const openReminder = await createReminder(
        owner,
        ownerHome.id,
        `FB030 shared reminder shell inactive ${Date.now()}`,
        'open',
      );
      reminderIds.push(openReminder.id);

      const unrelatedShells = await listSharedReminderShells(sharedMember);
      expect(
        unrelatedShells.some(row => row.reminder_id === openReminder.id),
        'unrelated homeowner should not see owner reminder shells',
      ).toBe(false);

      for (const status of ['invited', 'declined', 'removed'] as const) {
        insertMembership(ownerHome.id, sharedMember.userId, 'viewer', status);
        const inactiveShells = await listSharedReminderShells(sharedMember);
        expect(inactiveShells.some(row => row.reminder_id === openReminder.id), `${status} membership should not surface`).toBe(false);
        cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      }

      insertMembership(ownerHome.id, sharedMember.userId, 'viewer', 'active');
      const ownerShells = await listSharedReminderShells(owner);
      expect(
        ownerShells.some(row => row.reminder_id === openReminder.id),
        'primary owner should not see owned-home reminders duplicated in shared RPC',
      ).toBe(false);
    } finally {
      cleanupMembershipArtifacts(ownerHome.id, sharedMember.userId);
      await cleanupReminders(owner, reminderIds);
      await signOutAll([owner, sharedMember]);
    }
  });
});
