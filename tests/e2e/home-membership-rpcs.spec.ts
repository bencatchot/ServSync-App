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
type CatalogResponse<T> = {
  rows?: T[];
};
type IdRow = {
  id: string;
};
type MembershipPayload = {
  id: string;
  home_id: string;
  user_id: string;
  role: HomeRole;
  status: MembershipStatus;
  accepted_at: string | null;
  removed_at: string | null;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run home membership RPC probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Home membership RPC probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing home membership RPC fixture setup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
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

function runLinkedSandboxJson<T>(sql: string): T[] {
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

function findSpareHomeownerUserId(excludedUserIds: string[]): string {
  if (excludedUserIds.length === 0) {
    throw new Error('At least one excluded user id is required.');
  }

  const excludedValues = excludedUserIds.map(uuidLiteral).join(',');
  const rows = runLinkedSandboxJson<IdRow>(`
select p.id::text as id
  from public.profiles p
 where p.role = 'homeowner'
   and p.id not in (${excludedValues})
 order by p.id
 limit 1;
`);

  expect(rows[0]?.id, 'A spare sandbox homeowner profile should exist for membership invite probes').toBeTruthy();
  assertUuid(rows[0].id);
  return rows[0].id;
}

function cleanupMembershipArtifacts(homeId: string, userIds: string[]) {
  assertUuid(homeId);
  for (const userId of userIds) {
    assertUuid(userId);
  }

  if (userIds.length === 0) {
    return;
  }

  const userValues = userIds.map(uuidLiteral).join(',');
  runLinkedSandboxSql(`
delete from public.home_membership_audit_events
 where home_id = ${uuidLiteral(homeId)}
   and (
     actor_user_id in (${userValues})
     or target_user_id in (${userValues})
     or membership_id in (
       select id
         from public.home_memberships
        where home_id = ${uuidLiteral(homeId)}
          and user_id in (${userValues})
     )
   );

delete from public.home_memberships
 where home_id = ${uuidLiteral(homeId)}
   and user_id in (${userValues});
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
  ${uuidLiteral(homeId)},
  ${uuidLiteral(userId)},
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
 where home_id = ${uuidLiteral(homeId)}
   and user_id = ${uuidLiteral(userId)};
`);
}

async function inviteMember(
  account: AuthenticatedClient,
  homeId: string,
  inviteeUserId: string,
  role: HomeRole,
): Promise<MembershipPayload> {
  const { data, error } = await account.client.rpc('servsync_invite_home_member', {
    p_home_id: homeId,
    p_invitee_user_id: inviteeUserId,
    p_role: role,
  });

  expect(error, `inviting ${role} membership should not error`).toBeNull();
  expect(data?.id, `inviting ${role} membership should return a row`).toBeTruthy();
  return data as MembershipPayload;
}

async function expectRpcRejected(
  account: AuthenticatedClient,
  rpcName: string,
  params: Record<string, unknown>,
  label: string,
) {
  const { error } = await account.client.rpc(rpcName, params);
  expect(error, label).not.toBeNull();
}

test.describe('sandbox home membership RPC foundation', () => {
  test.beforeAll(() => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();
    requireLinkedSandbox();
  });

  test('primary owner can invite, duplicate open membership is blocked, invitee can accept, and owner can revoke', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupMembershipArtifacts(homeId, [homeownerB.userId]);

      const invited = await inviteMember(homeowner, homeId, homeownerB.userId, 'admin');
      expect(invited.status).toBe('invited');
      expect(invited.role).toBe('admin');

      const accepted = await homeownerB.client.rpc('servsync_accept_home_membership_invite', {
        p_membership_id: invited.id,
      });
      expect(accepted.error, 'invitee should be able to accept their own invite').toBeNull();
      expect((accepted.data as MembershipPayload).status).toBe('active');
      expect((accepted.data as MembershipPayload).accepted_at).toBeTruthy();

      await expectRpcRejected(
        homeowner,
        'servsync_invite_home_member',
        { p_home_id: homeId, p_invitee_user_id: homeownerB.userId, p_role: 'member' },
        'duplicate active membership should be blocked',
      );

      const revoked = await homeowner.client.rpc('servsync_revoke_home_membership', {
        p_membership_id: invited.id,
      });
      expect(revoked.error, 'primary owner should be able to revoke non-primary admin').toBeNull();
      expect((revoked.data as MembershipPayload).status).toBe('removed');
      expect((revoked.data as MembershipPayload).removed_at).toBeTruthy();

      const audit = await homeowner.client
        .from('home_membership_audit_events')
        .select('event_type')
        .eq('home_id', homeId)
        .eq('target_user_id', homeownerB.userId)
        .in('event_type', ['invited', 'accepted', 'revoked']);

      expect(audit.error, 'primary owner should read home membership audit events').toBeNull();
      expect((audit.data ?? []).map(row => row.event_type).sort()).toEqual(['accepted', 'invited', 'revoked']);
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupMembershipArtifacts(homeId, [homeownerB.userId]);
      await signOutAll(accounts);
    }
  });

  test('invitee can decline own invite and declined/removed memberships cannot be accepted', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupMembershipArtifacts(homeId, [homeownerB.userId]);

      const invited = await inviteMember(homeowner, homeId, homeownerB.userId, 'viewer');
      const declined = await homeownerB.client.rpc('servsync_decline_home_membership_invite', {
        p_membership_id: invited.id,
      });
      expect(declined.error, 'invitee should be able to decline their own invite').toBeNull();
      expect((declined.data as MembershipPayload).status).toBe('declined');
      expect((declined.data as MembershipPayload).removed_at).toBeTruthy();

      await expectRpcRejected(
        homeownerB,
        'servsync_accept_home_membership_invite',
        { p_membership_id: invited.id },
        'declined membership should not be accepted later',
      );

      cleanupMembershipArtifacts(homeId, [homeownerB.userId]);
      const member = await inviteMember(homeowner, homeId, homeownerB.userId, 'member');
      const revoked = await homeowner.client.rpc('servsync_revoke_home_membership', { p_membership_id: member.id });
      expect(revoked.error, 'owner revoke should not error').toBeNull();

      await expectRpcRejected(
        homeownerB,
        'servsync_accept_home_membership_invite',
        { p_membership_id: member.id },
        'removed membership should not be accepted later',
      );
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupMembershipArtifacts(homeId, [homeownerB.userId]);
      await signOutAll(accounts);
    }
  });

  test('admin can invite member or viewer but not owner/admin, while member and viewer cannot invite', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      const spareHomeownerId = findSpareHomeownerUserId([homeowner.userId, homeownerB.userId]);
      cleanupMembershipArtifacts(homeId, [homeownerB.userId, spareHomeownerId]);

      insertMembership(homeId, homeownerB.userId, 'admin', 'active');

      const memberInvite = await inviteMember(homeownerB, homeId, spareHomeownerId, 'member');
      expect(memberInvite.status).toBe('invited');
      const memberRevoke = await homeownerB.client.rpc('servsync_revoke_home_membership', {
        p_membership_id: memberInvite.id,
      });
      expect(memberRevoke.error, 'admin should be able to revoke a member invite they can manage').toBeNull();

      const viewerInvite = await inviteMember(homeownerB, homeId, spareHomeownerId, 'viewer');
      expect(viewerInvite.status).toBe('invited');
      const viewerRevoke = await homeownerB.client.rpc('servsync_revoke_home_membership', {
        p_membership_id: viewerInvite.id,
      });
      expect(viewerRevoke.error, 'admin should be able to revoke a viewer invite they can manage').toBeNull();

      cleanupMembershipArtifacts(homeId, [spareHomeownerId]);
      await expectRpcRejected(
        homeownerB,
        'servsync_invite_home_member',
        { p_home_id: homeId, p_invitee_user_id: spareHomeownerId, p_role: 'admin' },
        'admin should not be able to invite another admin',
      );
      await expectRpcRejected(
        homeownerB,
        'servsync_invite_home_member',
        { p_home_id: homeId, p_invitee_user_id: spareHomeownerId, p_role: 'owner' },
        'owner invite role should be rejected',
      );

      updateMembership(homeId, homeownerB.userId, 'member', 'active');
      await expectRpcRejected(
        homeownerB,
        'servsync_invite_home_member',
        { p_home_id: homeId, p_invitee_user_id: spareHomeownerId, p_role: 'member' },
        'member should not be able to invite',
      );

      updateMembership(homeId, homeownerB.userId, 'viewer', 'active');
      await expectRpcRejected(
        homeownerB,
        'servsync_invite_home_member',
        { p_home_id: homeId, p_invitee_user_id: spareHomeownerId, p_role: 'viewer' },
        'viewer should not be able to invite',
      );
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      const spareHomeownerId = findSpareHomeownerUserId([homeowner.userId, homeownerB.userId]);
      cleanupMembershipArtifacts(homeId, [homeownerB.userId, spareHomeownerId]);
      await signOutAll(accounts);
    }
  });

  test('unrelated homeowner cannot invite and cannot accept or decline someone else invite', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      const spareHomeownerId = findSpareHomeownerUserId([homeowner.userId, homeownerB.userId]);
      cleanupMembershipArtifacts(homeId, [homeownerB.userId, spareHomeownerId]);

      await expectRpcRejected(
        homeownerB,
        'servsync_invite_home_member',
        { p_home_id: homeId, p_invitee_user_id: spareHomeownerId, p_role: 'member' },
        'unrelated homeowner should not invite members to another home',
      );

      const invited = await inviteMember(homeowner, homeId, spareHomeownerId, 'member');
      await expectRpcRejected(
        homeownerB,
        'servsync_accept_home_membership_invite',
        { p_membership_id: invited.id },
        'unrelated homeowner should not accept another user invite',
      );
      await expectRpcRejected(
        homeownerB,
        'servsync_decline_home_membership_invite',
        { p_membership_id: invited.id },
        'unrelated homeowner should not decline another user invite',
      );
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      const spareHomeownerId = findSpareHomeownerUserId([homeowner.userId, homeownerB.userId]);
      cleanupMembershipArtifacts(homeId, [homeownerB.userId, spareHomeownerId]);
      await signOutAll(accounts);
    }
  });

  test('primary owner cannot be revoked and admins cannot revoke other admins', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      const spareHomeownerId = findSpareHomeownerUserId([homeowner.userId, homeownerB.userId]);
      cleanupMembershipArtifacts(homeId, [homeownerB.userId, spareHomeownerId]);

      const ownerMembership = await homeowner.client
        .from('home_memberships')
        .select('id')
        .eq('home_id', homeId)
        .eq('user_id', homeowner.userId)
        .single();
      expect(ownerMembership.error, 'primary owner membership lookup should not error').toBeNull();
      await expectRpcRejected(
        homeowner,
        'servsync_revoke_home_membership',
        { p_membership_id: ownerMembership.data!.id },
        'primary owner should not be able to revoke their own owner membership',
      );

      insertMembership(homeId, homeownerB.userId, 'admin', 'active');
      insertMembership(homeId, spareHomeownerId, 'admin', 'active');
      const adminMembership = await homeowner.client
        .from('home_memberships')
        .select('id')
        .eq('home_id', homeId)
        .eq('user_id', spareHomeownerId)
        .single();
      expect(adminMembership.error, 'admin membership lookup should not error').toBeNull();
      await expectRpcRejected(
        homeownerB,
        'servsync_revoke_home_membership',
        { p_membership_id: adminMembership.data!.id },
        'admin should not be able to revoke another admin',
      );

      const ownerRevokedAdmin = await homeowner.client.rpc('servsync_revoke_home_membership', {
        p_membership_id: adminMembership.data!.id,
      });
      expect(ownerRevokedAdmin.error, 'primary owner should be able to revoke a non-primary admin').toBeNull();
      expect((ownerRevokedAdmin.data as MembershipPayload).status).toBe('removed');

      cleanupMembershipArtifacts(homeId, [spareHomeownerId]);
      insertMembership(homeId, spareHomeownerId, 'member', 'active');
      const memberMembership = await homeowner.client
        .from('home_memberships')
        .select('id')
        .eq('home_id', homeId)
        .eq('user_id', spareHomeownerId)
        .single();
      expect(memberMembership.error, 'member membership lookup should not error').toBeNull();
      const adminRevokedMember = await homeownerB.client.rpc('servsync_revoke_home_membership', {
        p_membership_id: memberMembership.data!.id,
      });
      expect(adminRevokedMember.error, 'admin should be able to revoke member').toBeNull();
      expect((adminRevokedMember.data as MembershipPayload).status).toBe('removed');
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      const spareHomeownerId = findSpareHomeownerUserId([homeowner.userId, homeownerB.userId]);
      cleanupMembershipArtifacts(homeId, [homeownerB.userId, spareHomeownerId]);
      await signOutAll(accounts);
    }
  });
});
