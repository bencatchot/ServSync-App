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
type HomeRole = 'owner' | 'admin' | 'member' | 'viewer';
type CatalogResponse<T> = {
  rows?: T[];
};
type CountRow = {
  count: number;
};
type InviteRow = {
  id: string;
  home_id: string;
  invited_email: string;
  invited_email_normalized: string;
  role: Exclude<HomeRole, 'owner'>;
  status: string;
  expires_at: string | null;
  delivery_status: string;
  delivery_attempt_count: number;
  last_delivery_attempt_at: string | null;
  last_sent_at: string | null;
  last_delivery_error_code: string | null;
  provider_message_id: string | null;
};
type PreparePayload = {
  delivery_enabled: boolean;
  route_hint: string;
  invite_id: string;
  home_id: string;
  invited_email: string;
  role: Exclude<HomeRole, 'owner'>;
  home_display_label: string;
  city: string | null;
  state: string | null;
  inviter_display_label: string;
  expires_at: string;
  delivery_status: string;
  delivery_attempt_count: number;
};
type RecordResultPayload = {
  invite_id: string;
  delivery_status: string;
  delivery_attempt_count: number;
  last_delivery_attempt_at: string;
  last_sent_at: string | null;
  last_delivery_error_code: string | null;
  provider_message_id_present: boolean;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run home access invite delivery probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Home access invite delivery probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing home access invite delivery fixture setup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
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

function uniqueEmail(label: string) {
  return `fb030-delivery-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}@example.invalid`;
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

function cleanupDeliveryInviteArtifacts(homeId: string, emails: string[], userIds: string[] = []) {
  assertUuid(homeId);
  const normalizedEmails = emails.map(normalizeEmail);
  const emailValues = normalizedEmails.map(textLiteral).join(',');
  const userValues = userIds.map(uuidLiteral).join(',');

  if (emailValues) {
    runLinkedSandboxSql(`
delete from public.home_membership_audit_events
 where home_id = ${uuidLiteral(homeId)}
   and (
     metadata ->> 'target_email' in (${emailValues})
     or metadata ->> 'email_invite_id' in (
       select id::text
         from public.home_membership_email_invites
        where home_id = ${uuidLiteral(homeId)}
          and invited_email_normalized in (${emailValues})
     )
   );

delete from public.home_membership_email_invites
 where home_id = ${uuidLiteral(homeId)}
   and invited_email_normalized in (${emailValues});
`);
  }

  if (userValues) {
    runLinkedSandboxSql(`
delete from public.home_membership_audit_events
 where home_id = ${uuidLiteral(homeId)}
   and metadata ->> 'email_invite_id' in (
     select id::text
       from public.home_membership_email_invites
      where home_id = ${uuidLiteral(homeId)}
        and (
          accepted_by_user_id in (${userValues})
          or membership_id in (
            select id
              from public.home_memberships
             where home_id = ${uuidLiteral(homeId)}
               and user_id in (${userValues})
          )
        )
   );

delete from public.home_membership_email_invites
 where home_id = ${uuidLiteral(homeId)}
   and (
     accepted_by_user_id in (${userValues})
     or membership_id in (
       select id
         from public.home_memberships
        where home_id = ${uuidLiteral(homeId)}
          and user_id in (${userValues})
     )
   );

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

function upsertMembership(homeId: string, userId: string, role: HomeRole, status: 'active' | 'removed') {
  assertUuid(homeId);
  assertUuid(userId);
  runLinkedSandboxSql(`
delete from public.home_memberships
 where home_id = ${uuidLiteral(homeId)}
   and user_id = ${uuidLiteral(userId)};

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

function updateInviteStatus(inviteId: string, statusSql: string) {
  assertUuid(inviteId);
  runLinkedSandboxSql(`
update public.home_membership_email_invites
   set ${statusSql}
 where id = ${uuidLiteral(inviteId)};
`);
}

async function createEmailInvite(
  account: AuthenticatedClient,
  homeId: string,
  invitedEmail: string,
  role: Exclude<HomeRole, 'owner'>,
): Promise<InviteRow> {
  const { data, error } = await account.client.rpc('servsync_create_home_membership_email_invite', {
    p_home_id: homeId,
    p_invited_email: invitedEmail,
    p_role: role,
  });

  expect(error, `creating ${role} email invite should not error`).toBeNull();
  expect(data?.id, `creating ${role} email invite should return a row`).toBeTruthy();
  return data as InviteRow;
}

async function prepareDelivery(account: AuthenticatedClient, inviteId: string): Promise<PreparePayload> {
  const { data, error } = await account.client.rpc('servsync_prepare_home_access_invite_delivery', {
    p_invite_id: inviteId,
  });

  expect(error, 'preparing home access invite delivery should not error').toBeNull();
  expect(data?.invite_id, 'preparing delivery should return a payload').toBeTruthy();
  return data as PreparePayload;
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

function inviteRows(inviteId: string) {
  return runLinkedSandboxJson<InviteRow>(`
select
  id::text,
  home_id::text,
  invited_email,
  invited_email_normalized,
  role,
  status,
  expires_at::text,
  delivery_status,
  delivery_attempt_count,
  last_delivery_attempt_at::text,
  last_sent_at::text,
  last_delivery_error_code,
  provider_message_id
from public.home_membership_email_invites
where id = ${uuidLiteral(inviteId)};
`);
}

test.describe('sandbox home access invite delivery foundation', () => {
  test.beforeAll(() => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();
    requireLinkedSandbox();
  });

  test('owner-created invites default to 30-day expiry and prepare returns disabled sanitized payload', async () => {
    const homeowner = await signInAs('homeowner');
    const accounts = [homeowner];
    const inviteEmail = uniqueEmail('owner');

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupDeliveryInviteArtifacts(homeId, [inviteEmail]);

      const invite = await createEmailInvite(homeowner, homeId, ` ${inviteEmail.toUpperCase()} `, 'viewer');
      expect(invite.expires_at, 'new email invites should get a 30-day expiry').toBeTruthy();
      expect(invite.delivery_status).toBe('not_sent');
      expect(invite.delivery_attempt_count).toBe(0);

      const expiresAt = new Date(invite.expires_at!);
      const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysUntilExpiry).toBeGreaterThan(29);
      expect(daysUntilExpiry).toBeLessThan(31);

      const prepared = await prepareDelivery(homeowner, invite.id);
      expect(prepared.delivery_enabled).toBe(false);
      expect(prepared.delivery_status).toBe('disabled');
      expect(prepared.delivery_attempt_count).toBe(1);
      expect(prepared.invite_id).toBe(invite.id);
      expect(prepared.home_id).toBe(homeId);
      expect(normalizeEmail(prepared.invited_email)).toBe(inviteEmail);
      expect(prepared.role).toBe('viewer');
      expect(prepared.route_hint).toBe('home-access-invite');
      expect(prepared.home_display_label).toBeTruthy();
      expect(Object.keys(prepared)).not.toContain('address_line1');
      expect(Object.keys(prepared)).not.toContain('zip_code');
      expect(Object.keys(prepared)).not.toContain('target_user_id');
      expect(Object.keys(prepared)).not.toContain('service_requests');

      const row = inviteRows(invite.id)[0];
      expect(row.delivery_status).toBe('disabled');
      expect(row.delivery_attempt_count).toBe(1);
      expect(row.last_delivery_attempt_at).toBeTruthy();
      expect(row.last_delivery_error_code).toBe('delivery_disabled');
      expect(row.provider_message_id).toBeNull();

      await expectRpcRejected(
        homeowner,
        'servsync_prepare_home_access_invite_delivery',
        { p_invite_id: invite.id },
        'cooldown should block immediate repeated delivery preparation',
      );

      const auditRows = runLinkedSandboxJson<CountRow>(`
select count(*)::int as count
  from public.home_membership_audit_events
 where home_id = ${uuidLiteral(homeId)}
   and event_type = 'email_invite_delivery_disabled'
   and metadata ->> 'email_invite_id' = ${textLiteral(invite.id)};
`);
      expect(auditRows[0]?.count).toBe(1);
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupDeliveryInviteArtifacts(homeId, [inviteEmail]);
      await signOutAll(accounts);
    }
  });

  test('admin can prepare delivery for non-admin invites, but member/viewer/unrelated/contractor users cannot', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const contractor = await signInAs('contractor');
    const accounts = [homeowner, homeownerB, contractor];
    const adminPreparedEmail = uniqueEmail('admin-prepared');
    const deniedMemberEmail = uniqueEmail('member-denied');
    const deniedViewerEmail = uniqueEmail('viewer-denied');
    const deniedContractorEmail = uniqueEmail('contractor-denied');
    const deniedUnrelatedEmail = uniqueEmail('unrelated-denied');
    const adminInviteEmail = uniqueEmail('admin-invite');

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      const otherHomeId = await firstHomeId(homeownerB, 'Homeowner B');
      cleanupDeliveryInviteArtifacts(
        homeId,
        [
          adminPreparedEmail,
          deniedMemberEmail,
          deniedViewerEmail,
          deniedContractorEmail,
          deniedUnrelatedEmail,
          adminInviteEmail,
        ],
        [homeownerB.userId],
      );

      upsertMembership(homeId, homeownerB.userId, 'admin', 'active');
      const adminPreparedInvite = await createEmailInvite(homeowner, homeId, adminPreparedEmail, 'member');
      const adminPrepared = await prepareDelivery(homeownerB, adminPreparedInvite.id);
      expect(adminPrepared.delivery_status).toBe('disabled');

      const adminRoleInvite = await createEmailInvite(homeowner, homeId, adminInviteEmail, 'admin');
      await expectRpcRejected(
        homeownerB,
        'servsync_prepare_home_access_invite_delivery',
        { p_invite_id: adminRoleInvite.id },
        'non-primary admin should not prepare admin invite delivery',
      );

      upsertMembership(homeId, homeownerB.userId, 'member', 'active');
      const memberDeniedInvite = await createEmailInvite(homeowner, homeId, deniedMemberEmail, 'viewer');
      await expectRpcRejected(
        homeownerB,
        'servsync_prepare_home_access_invite_delivery',
        { p_invite_id: memberDeniedInvite.id },
        'member should not prepare home access invite delivery',
      );

      upsertMembership(homeId, homeownerB.userId, 'viewer', 'active');
      const viewerDeniedInvite = await createEmailInvite(homeowner, homeId, deniedViewerEmail, 'viewer');
      await expectRpcRejected(
        homeownerB,
        'servsync_prepare_home_access_invite_delivery',
        { p_invite_id: viewerDeniedInvite.id },
        'viewer should not prepare home access invite delivery',
      );

      const contractorDeniedInvite = await createEmailInvite(homeowner, homeId, deniedContractorEmail, 'viewer');
      await expectRpcRejected(
        contractor,
        'servsync_prepare_home_access_invite_delivery',
        { p_invite_id: contractorDeniedInvite.id },
        'contractor should not prepare home access invite delivery',
      );

      const unrelatedInvite = await createEmailInvite(homeownerB, otherHomeId, deniedUnrelatedEmail, 'viewer');
      await expectRpcRejected(
        homeowner,
        'servsync_prepare_home_access_invite_delivery',
        { p_invite_id: unrelatedInvite.id },
        'unrelated homeowner should not prepare delivery for another home',
      );
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      const otherHomeId = await firstHomeId(homeownerB, 'Homeowner B');
      cleanupDeliveryInviteArtifacts(
        homeId,
        [
          adminPreparedEmail,
          deniedMemberEmail,
          deniedViewerEmail,
          deniedContractorEmail,
          deniedUnrelatedEmail,
          adminInviteEmail,
        ],
        [homeownerB.userId],
      );
      cleanupDeliveryInviteArtifacts(otherHomeId, [deniedUnrelatedEmail]);
      await signOutAll(accounts);
    }
  });

  test('prepare rejects expired and non-pending email invites', async () => {
    const homeowner = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const accounts = [homeowner, homeownerB];
    const expiredEmail = uniqueEmail('expired');
    const revokedEmail = uniqueEmail('revoked');
    const acceptedEmail = homeownerB.email;

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupDeliveryInviteArtifacts(homeId, [expiredEmail, revokedEmail, acceptedEmail], [homeownerB.userId]);

      const expiredInvite = await createEmailInvite(homeowner, homeId, expiredEmail, 'viewer');
      updateInviteStatus(expiredInvite.id, "expires_at = now() - interval '1 minute'");
      await expectRpcRejected(
        homeowner,
        'servsync_prepare_home_access_invite_delivery',
        { p_invite_id: expiredInvite.id },
        'expired invite should not be prepared for delivery',
      );

      const revokedInvite = await createEmailInvite(homeowner, homeId, revokedEmail, 'viewer');
      const revoked = await homeowner.client.rpc('servsync_revoke_home_membership_email_invite', {
        p_invite_id: revokedInvite.id,
      });
      expect(revoked.error, 'owner should revoke setup invite').toBeNull();
      await expectRpcRejected(
        homeowner,
        'servsync_prepare_home_access_invite_delivery',
        { p_invite_id: revokedInvite.id },
        'revoked invite should not be prepared for delivery',
      );

      const acceptedInvite = await createEmailInvite(homeowner, homeId, acceptedEmail, 'viewer');
      const accepted = await homeownerB.client.rpc('servsync_accept_home_membership_email_invite', {
        p_invite_id: acceptedInvite.id,
      });
      expect(accepted.error, 'addressed invitee should accept setup invite').toBeNull();
      await expectRpcRejected(
        homeowner,
        'servsync_prepare_home_access_invite_delivery',
        { p_invite_id: acceptedInvite.id },
        'accepted invite should not be prepared for delivery',
      );
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupDeliveryInviteArtifacts(homeId, [expiredEmail, revokedEmail, acceptedEmail], [homeownerB.userId]);
      await signOutAll(accounts);
    }
  });

  test('record delivery result is unavailable to browser roles and updates only delivery metadata internally', async () => {
    const homeowner = await signInAs('homeowner');
    const accounts = [homeowner];
    const inviteEmail = uniqueEmail('record');

    try {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupDeliveryInviteArtifacts(homeId, [inviteEmail]);

      const invite = await createEmailInvite(homeowner, homeId, inviteEmail, 'member');
      await expectRpcRejected(
        homeowner,
        'servsync_record_home_access_invite_delivery_result',
        {
          p_invite_id: invite.id,
          p_delivery_status: 'sent',
          p_provider_message_id: 'provider-secretish-id',
          p_error_code: null,
        },
        'authenticated browser role should not execute internal delivery result RPC',
      );

      const rows = runLinkedSandboxJson<{ payload: RecordResultPayload }>(`
select public.servsync_record_home_access_invite_delivery_result(
  ${uuidLiteral(invite.id)},
  'failed',
  'provider-message-id-should-not-be-returned-raw',
  'Provider Error / transient'
) as payload;
`);
      const payload = rows[0]?.payload;
      expect(payload.invite_id).toBe(invite.id);
      expect(payload.delivery_status).toBe('failed');
      expect(payload.delivery_attempt_count).toBe(1);
      expect(payload.last_delivery_error_code).toBe('provider_error_transient');
      expect(payload.provider_message_id_present).toBe(false);

      const row = inviteRows(invite.id)[0];
      expect(row.status).toBe('pending');
      expect(row.delivery_status).toBe('failed');
      expect(row.delivery_attempt_count).toBe(1);
      expect(row.last_delivery_attempt_at).toBeTruthy();
      expect(row.last_sent_at).toBeNull();
      expect(row.last_delivery_error_code).toBe('provider_error_transient');
      expect(row.provider_message_id).toBeNull();

      const auditRows = runLinkedSandboxJson<CountRow>(`
select count(*)::int as count
  from public.home_membership_audit_events
 where home_id = ${uuidLiteral(homeId)}
   and event_type = 'email_invite_delivery_failed'
   and metadata ->> 'email_invite_id' = ${textLiteral(invite.id)}
   and metadata ->> 'provider_message_id_present' = 'false';
`);
      expect(auditRows[0]?.count).toBe(1);
    } finally {
      const homeId = await firstHomeId(homeowner, 'Homeowner A');
      cleanupDeliveryInviteArtifacts(homeId, [inviteEmail]);
      await signOutAll(accounts);
    }
  });
});
