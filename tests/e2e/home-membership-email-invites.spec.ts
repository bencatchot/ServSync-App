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
  email: string;
};
type EmailInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
type HomeRole = 'owner' | 'admin' | 'member' | 'viewer';
type CatalogResponse<T> = {
  rows?: T[];
};
type IdRow = {
  id: string;
};
type CountRow = {
  count: number;
};
type EmailInvitePayload = {
  id: string;
  home_id: string;
  invited_email: string;
  invited_email_normalized: string;
  role: Exclude<HomeRole, 'owner'>;
  status: EmailInviteStatus;
  membership_id?: string;
  accepted_by_user_id?: string;
  accepted_at?: string;
  declined_at?: string;
  revoked_at?: string;
};
type MyInviteRow = {
  id: string;
  home_id: string;
  home_nickname: string;
  home_city: string;
  home_state: string;
  role: Exclude<HomeRole, 'owner'>;
  status: EmailInviteStatus;
  invited_email: string;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run home membership email invite probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Home membership email invite probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing home membership email invite fixture setup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }
}

function assertUuid(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Refusing sandbox SQL for invalid UUID "${id}".`);
  }
}

function uuidLiteral(id: string) {
  assertUuid(id);
  return `'${id}'::uuid`;
}

function textLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
  const credentials = credentialsFor(key);
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword(credentials);
  expect(error, `${key} login should succeed`).toBeNull();
  expect(data.user?.id, `${key} auth user should be present`).toBeTruthy();

  return { client, userId: data.user!.id, email: credentials.email };
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

function cleanupEmailInviteArtifacts(homeId: string, emails: string[], userIds: string[] = []) {
  assertUuid(homeId);
  const normalizedEmails = emails.map(normalizeEmail);
  const emailValues = normalizedEmails.map(textLiteral).join(',');
  const userValues = userIds.map(uuidLiteral).join(',');

  if (emailValues) {
    runLinkedSandboxSql(`
delete from public.home_membership_audit_events
 where home_id = ${uuidLiteral(homeId)}
   and metadata ->> 'target_email' in (${emailValues});

delete from public.home_membership_email_invites
 where home_id = ${uuidLiteral(homeId)}
   and invited_email_normalized in (${emailValues});
`);
  }

  if (userValues) {
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
}

function insertMembership(homeId: string, userId: string, role: HomeRole, status: 'active' | 'removed') {
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
  case when '${status}' = 'removed' then now() else null end
);
`);
}

function updateMembership(homeId: string, userId: string, role: HomeRole, status: 'active' | 'removed') {
  assertUuid(homeId);
  assertUuid(userId);
  runLinkedSandboxSql(`
update public.home_memberships
   set role = '${role}',
       status = '${status}',
       accepted_at = case when '${status}' = 'active' then now() else null end,
       removed_at = case when '${status}' = 'removed' then now() else null end
 where home_id = ${uuidLiteral(homeId)}
   and user_id = ${uuidLiteral(userId)};
`);
}

async function createEmailInvite(
  account: AuthenticatedClient,
  homeId: string,
  invitedEmail: string,
  role: Exclude<HomeRole, 'owner'>,
): Promise<EmailInvitePayload> {
  const { data, error } = await account.client.rpc('servsync_create_home_membership_email_invite', {
    p_home_id: homeId,
    p_invited_email: invitedEmail,
    p_role: role,
  });

  expect(error, `creating ${role} email invite should not error`).toBeNull();
  expect(data?.id, `creating ${role} email invite should return a row`).toBeTruthy();
  return data as EmailInvitePayload;
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

function uniqueEmail(label: string) {
  return `fb030-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}@example.invalid`;
}

test.describe('sandbox home membership email invite foundation', () => {
  test.beforeAll(() => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();
    requireLinkedSandbox();
  });

  test('owner creates normalized pending invites without direct table mutation or account lookup return data', async () => {
    const homeowner = await signInAs('homeowner');
    const accounts = [homeowner];
    const unknownEmail = uniqueEmail('unknown');

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupEmailInviteArtifacts(homeId, [unknownEmail]);

      const displayEmail = `  ${unknownEmail.toUpperCase()}  `;
      const invite = await createEmailInvite(homeowner, homeId, displayEmail, 'member');
      expect(invite.status).toBe('pending');
      expect(invite.role).toBe('member');
      expect(invite.invited_email_normalized).toBe(unknownEmail);
      expect(Object.keys(invite).sort()).not.toContain('target_user_id');

      await expectRpcRejected(
        homeowner,
        'servsync_create_home_membership_email_invite',
        { p_home_id: homeId, p_invited_email: unknownEmail, p_role: 'viewer' },
        'duplicate pending invite should be blocked regardless of casing or spacing',
      );

      await expectRpcRejected(
        homeowner,
        'servsync_create_home_membership_email_invite',
        { p_home_id: homeId, p_invited_email: 'not-an-email', p_role: 'viewer' },
        'invalid email strings should be rejected server-side',
      );

      await expectRpcRejected(
        homeowner,
        'servsync_create_home_membership_email_invite',
        { p_home_id: homeId, p_invited_email: uniqueEmail('owner-role'), p_role: 'owner' },
        'owner email invite role should be rejected',
      );

      const directInsert = await homeowner.client.from('home_membership_email_invites').insert({
        home_id: homeId,
        invited_email: uniqueEmail('direct'),
        invited_email_normalized: uniqueEmail('direct-normalized'),
        role: 'viewer',
        status: 'pending',
        invited_by_user_id: homeowner.userId,
      });
      expect(directInsert.error, 'authenticated users should not directly insert email invites').not.toBeNull();

      const directUpdate = await homeowner.client
        .from('home_membership_email_invites')
        .update({ status: 'revoked' })
        .eq('id', invite.id);
      expect(directUpdate.error, 'authenticated users should not directly update email invites').not.toBeNull();

      const directDelete = await homeowner.client.from('home_membership_email_invites').delete().eq('id', invite.id);
      expect(directDelete.error, 'authenticated users should not directly delete email invites').not.toBeNull();
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupEmailInviteArtifacts(homeId, [unknownEmail]);
      await signOutAll(accounts);
    }
  });

  test('invitee lists only matching email invites, accepts one, and audit/membership rows are created', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupEmailInviteArtifacts(homeId, [homeownerB.email], [homeownerB.userId]);

      const invite = await createEmailInvite(homeowner, homeId, ` ${homeownerB.email.toUpperCase()} `, 'viewer');

      const otherUserList = await homeowner.client.rpc('servsync_list_my_home_membership_email_invites');
      expect(otherUserList.error, 'non-addressed user invite list should not error').toBeNull();
      expect((otherUserList.data as MyInviteRow[] | null) ?? []).toHaveLength(0);

      const myList = await homeownerB.client.rpc('servsync_list_my_home_membership_email_invites');
      expect(myList.error, 'addressed invitee should list own pending invite').toBeNull();
      expect((myList.data as MyInviteRow[]).map(row => row.id)).toContain(invite.id);
      const ownInvite = (myList.data as MyInviteRow[]).find(row => row.id === invite.id)!;
      expect(ownInvite.invited_email.toLowerCase()).toContain(normalizeEmail(homeownerB.email));
      expect(Object.keys(ownInvite)).not.toContain('address_line1');

      await expectRpcRejected(
        homeowner,
        'servsync_accept_home_membership_email_invite',
        { p_invite_id: invite.id },
        'a signed-in user cannot accept an invite addressed to another email',
      );

      const accepted = await homeownerB.client.rpc('servsync_accept_home_membership_email_invite', {
        p_invite_id: invite.id,
      });
      expect(accepted.error, 'addressed invitee should accept pending email invite').toBeNull();
      const acceptedPayload = accepted.data as EmailInvitePayload;
      expect(acceptedPayload.status).toBe('accepted');
      expect(acceptedPayload.accepted_by_user_id).toBe(homeownerB.userId);
      expect(acceptedPayload.membership_id).toBeTruthy();
      expect(acceptedPayload.accepted_at).toBeTruthy();

      const membership = await homeownerB.client
        .from('home_memberships')
        .select('id, home_id, user_id, role, status')
        .eq('home_id', homeId)
        .eq('user_id', homeownerB.userId)
        .single();
      expect(membership.error, 'accepted invitee should read their own membership row').toBeNull();
      expect(membership.data?.role).toBe('viewer');
      expect(membership.data?.status).toBe('active');

      await expectRpcRejected(
        homeownerB,
        'servsync_accept_home_membership_email_invite',
        { p_invite_id: invite.id },
        'accepted email invite cannot be accepted again',
      );

      const auditRows = runLinkedSandboxJson<CountRow>(`
select count(*)::int as count
  from public.home_membership_audit_events
 where home_id = ${uuidLiteral(homeId)}
   and event_type in ('email_invite_created', 'email_invite_accepted')
   and metadata ->> 'email_invite_id' = ${textLiteral(invite.id)};
`);
      expect(auditRows[0]?.count).toBe(2);
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupEmailInviteArtifacts(homeId, [homeownerB.email], [homeownerB.userId]);
      await signOutAll(accounts);
    }
  });

  test('owner/admin authority matches v1 limits and unrelated/member/viewer users cannot invite', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];
    const memberEmail = uniqueEmail('member');
    const viewerEmail = uniqueEmail('viewer');
    const adminEmail = uniqueEmail('admin');
    const deniedEmail = uniqueEmail('denied');

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupEmailInviteArtifacts(homeId, [memberEmail, viewerEmail, adminEmail, deniedEmail], [homeownerB.userId]);

      insertMembership(homeId, homeownerB.userId, 'admin', 'active');

      const memberInvite = await createEmailInvite(homeownerB, homeId, memberEmail, 'member');
      const viewerInvite = await createEmailInvite(homeownerB, homeId, viewerEmail, 'viewer');

      await expectRpcRejected(
        homeownerB,
        'servsync_create_home_membership_email_invite',
        { p_home_id: homeId, p_invited_email: adminEmail, p_role: 'admin' },
        'admin should not invite another admin in v1',
      );

      updateMembership(homeId, homeownerB.userId, 'member', 'active');
      await expectRpcRejected(
        homeownerB,
        'servsync_create_home_membership_email_invite',
        { p_home_id: homeId, p_invited_email: deniedEmail, p_role: 'member' },
        'member should not create home email invites',
      );

      updateMembership(homeId, homeownerB.userId, 'viewer', 'active');
      await expectRpcRejected(
        homeownerB,
        'servsync_create_home_membership_email_invite',
        { p_home_id: homeId, p_invited_email: deniedEmail, p_role: 'viewer' },
        'viewer should not create home email invites',
      );

      const otherHomeId = await firstHomeId(homeownerB, 'Homeowner B');
      await expectRpcRejected(
        homeowner,
        'servsync_create_home_membership_email_invite',
        { p_home_id: otherHomeId, p_invited_email: deniedEmail, p_role: 'viewer' },
        'unrelated homeowner should not create email invites for another home',
      );

      updateMembership(homeId, homeownerB.userId, 'admin', 'active');
      const adminRevokeMember = await homeownerB.client.rpc('servsync_revoke_home_membership_email_invite', {
        p_invite_id: memberInvite.id,
      });
      expect(adminRevokeMember.error, 'admin should revoke member email invite').toBeNull();
      expect((adminRevokeMember.data as EmailInvitePayload).status).toBe('revoked');

      const adminRevokeViewer = await homeownerB.client.rpc('servsync_revoke_home_membership_email_invite', {
        p_invite_id: viewerInvite.id,
      });
      expect(adminRevokeViewer.error, 'admin should revoke viewer email invite').toBeNull();
      expect((adminRevokeViewer.data as EmailInvitePayload).status).toBe('revoked');

      const ownerAdminInvite = await createEmailInvite(homeowner, homeId, adminEmail, 'admin');
      await expectRpcRejected(
        homeownerB,
        'servsync_revoke_home_membership_email_invite',
        { p_invite_id: ownerAdminInvite.id },
        'admin should not revoke admin email invite',
      );

      const ownerRevokeAdmin = await homeowner.client.rpc('servsync_revoke_home_membership_email_invite', {
        p_invite_id: ownerAdminInvite.id,
      });
      expect(ownerRevokeAdmin.error, 'primary owner should revoke admin email invite').toBeNull();
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupEmailInviteArtifacts(
        homeId,
        [memberEmail, viewerEmail, adminEmail, deniedEmail],
        [homeownerB.userId],
      );
      await signOutAll(accounts);
    }
  });

  test('declined, revoked, and expired email invites cannot be accepted later', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupEmailInviteArtifacts(homeId, [homeownerB.email], [homeownerB.userId]);

      const declinedInvite = await createEmailInvite(homeowner, homeId, homeownerB.email, 'member');
      const declined = await homeownerB.client.rpc('servsync_decline_home_membership_email_invite', {
        p_invite_id: declinedInvite.id,
      });
      expect(declined.error, 'addressed invitee should decline pending email invite').toBeNull();
      expect((declined.data as EmailInvitePayload).status).toBe('declined');
      expect((declined.data as EmailInvitePayload).declined_at).toBeTruthy();

      await expectRpcRejected(
        homeownerB,
        'servsync_accept_home_membership_email_invite',
        { p_invite_id: declinedInvite.id },
        'declined email invite should not be accepted',
      );

      const revokedInvite = await createEmailInvite(homeowner, homeId, homeownerB.email, 'viewer');
      const revoked = await homeowner.client.rpc('servsync_revoke_home_membership_email_invite', {
        p_invite_id: revokedInvite.id,
      });
      expect(revoked.error, 'owner should revoke pending email invite').toBeNull();
      expect((revoked.data as EmailInvitePayload).status).toBe('revoked');
      expect((revoked.data as EmailInvitePayload).revoked_at).toBeTruthy();

      await expectRpcRejected(
        homeownerB,
        'servsync_accept_home_membership_email_invite',
        { p_invite_id: revokedInvite.id },
        'revoked email invite should not be accepted',
      );

      const expiredInvite = await createEmailInvite(homeowner, homeId, homeownerB.email, 'viewer');
      runLinkedSandboxSql(`
update public.home_membership_email_invites
   set expires_at = now() - interval '1 minute'
 where id = ${uuidLiteral(expiredInvite.id)};
`);

      await expectRpcRejected(
        homeownerB,
        'servsync_accept_home_membership_email_invite',
        { p_invite_id: expiredInvite.id },
        'expired email invite should not be accepted',
      );
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupEmailInviteArtifacts(homeId, [homeownerB.email], [homeownerB.userId]);
      await signOutAll(accounts);
    }
  });

  test('non-homeowner accounts cannot list or accept home membership email invites', async () => {
    const homeowner = await signInAs('homeowner');
    const contractor = await signInAs('contractor');
    const accounts = [homeowner, contractor];

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupEmailInviteArtifacts(homeId, [contractor.email], [contractor.userId]);

      const invite = await createEmailInvite(homeowner, homeId, contractor.email, 'viewer');
      const contractorList = await contractor.client.rpc('servsync_list_my_home_membership_email_invites');
      expect(contractorList.error, 'contractor invite list should not error').toBeNull();
      expect((contractorList.data as MyInviteRow[] | null) ?? []).toHaveLength(0);

      await expectRpcRejected(
        contractor,
        'servsync_accept_home_membership_email_invite',
        { p_invite_id: invite.id },
        'contractor account should not accept home membership email invite',
      );

      const membershipCount = runLinkedSandboxJson<CountRow>(`
select count(*)::int as count
  from public.home_memberships
 where home_id = ${uuidLiteral(homeId)}
   and user_id = ${uuidLiteral(contractor.userId)};
`);
      expect(membershipCount[0]?.count).toBe(0);
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupEmailInviteArtifacts(homeId, [contractor.email], [contractor.userId]);
      await signOutAll(accounts);
    }
  });
});
