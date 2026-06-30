import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { credentialsFor, requiredEnv, type TestCredentialKey } from './helpers/env';
import { loginAs, openSidebarTab } from './helpers/auth';
import { requireApprovedSandboxForMutation } from './helpers/guards';

type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
  email: string;
};
type EmailInviteRow = {
  id: string;
  home_id: string;
  invited_email: string;
  role: 'admin' | 'member' | 'viewer';
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
};
type MembershipRow = {
  id: string;
  home_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'invited' | 'active' | 'removed' | 'declined';
};

function supabaseConfig() {
  return {
    url: requiredEnv('VITE_SUPABASE_URL'),
    anonKey: requiredEnv('VITE_SUPABASE_ANON_KEY'),
  };
}

async function signInClient(key: TestCredentialKey): Promise<AuthenticatedClient> {
  const { url, anonKey } = supabaseConfig();
  const credentials = credentialsFor(key);
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword(credentials);
  expect(error, `${key} login should succeed`).toBeNull();
  expect(data.user?.id, `${key} user id should be present`).toBeTruthy();
  return { client, userId: data.user!.id, email: credentials.email };
}

async function signOutAll(accounts: AuthenticatedClient[]) {
  await Promise.all(accounts.map(account => account.client.auth.signOut().catch(() => undefined)));
}

async function firstHomeId(account: AuthenticatedClient): Promise<string> {
  const result = await account.client
    .from('homes')
    .select('id')
    .eq('homeowner_user_id', account.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  expect(result.error, 'homeowner home lookup should not error').toBeNull();
  expect(result.data?.id, 'homeowner fixture home should exist').toBeTruthy();
  return result.data!.id as string;
}

async function listHomeEmailInvites(owner: AuthenticatedClient, homeId: string): Promise<EmailInviteRow[]> {
  const result = await owner.client.rpc('servsync_list_home_membership_email_invites', { p_home_id: homeId });
  expect(result.error, 'owner should list home membership email invites').toBeNull();
  return (result.data || []) as EmailInviteRow[];
}

async function createEmailInvite(owner: AuthenticatedClient, homeId: string, email: string, role: 'admin' | 'member' | 'viewer' = 'viewer') {
  const result = await owner.client.rpc('servsync_create_home_membership_email_invite', {
    p_home_id: homeId,
    p_invited_email: email,
    p_role: role,
  });
  expect(result.error, 'owner should create home access email invite').toBeNull();
  return result.data as { id: string };
}

async function revokePendingInvitesForEmail(owner: AuthenticatedClient, homeId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const invites = await listHomeEmailInvites(owner, homeId);
  await Promise.all(invites
    .filter(invite => invite.status === 'pending' && invite.invited_email.trim().toLowerCase() === normalizedEmail)
    .map(invite => owner.client.rpc('servsync_revoke_home_membership_email_invite', { p_invite_id: invite.id })));
}

async function revokeMembershipForUser(owner: AuthenticatedClient, homeId: string, userId: string) {
  const memberships = await owner.client
    .from('home_memberships')
    .select('id, home_id, user_id, role, status')
    .eq('home_id', homeId)
    .eq('user_id', userId);
  expect(memberships.error, 'owner should read memberships for cleanup').toBeNull();

  await Promise.all(((memberships.data || []) as MembershipRow[])
    .filter(membership => membership.status === 'active' || membership.status === 'invited')
    .filter(membership => membership.role !== 'owner')
    .map(membership => owner.client.rpc('servsync_revoke_home_membership', { p_membership_id: membership.id })));
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

test.describe('home access UI shell', () => {
  test.beforeEach(() => {
    requireApprovedSandboxForMutation();
  });

  test('owner creates, safely errors on duplicate, and revokes a pending email invite without claiming email was sent', async ({ page }) => {
    const owner = await signInClient('homeowner');
    const homeId = await firstHomeId(owner);
    const inviteEmail = `servsync-home-access-${Date.now()}@example.invalid`;

    try {
      await revokePendingInvitesForEmail(owner, homeId, inviteEmail);
      await loginAs(page, 'homeowner');
      await openSidebarTab(page, /^Properties$/i);

      const panel = page.getByTestId('home-access-panel');
      await expect(page.getByRole('heading', { name: /^Home Access$/i })).toBeVisible();
      await expect(panel.getByText(/Email delivery is not enabled yet during this beta step/i).first()).toBeVisible();
      await expect(panel.getByText(/do not receive shared dashboard access/i)).toBeVisible();
      await expect(panel.getByPlaceholder('person@example.com')).toBeVisible();

      const roleSelect = panel.locator('select').first();
      await expect(roleSelect).toBeVisible();
      const roleOptions = await roleSelect.locator('option').allTextContents();
      expect(roleOptions).toEqual(['Admin', 'Member', 'Viewer']);

      await panel.getByPlaceholder('person@example.com').fill(inviteEmail);
      await roleSelect.selectOption('viewer');
      await panel.getByRole('button', { name: /^Create invite$/i }).click();

      await expect(page.getByText(/Invite created/i)).toBeVisible();
      await expect(page.getByText(/Email delivery is not enabled yet during this beta step/i).first()).toBeVisible();
      await expect(page.getByText(/Email sent/i)).toHaveCount(0);
      await expect(panel.getByText(inviteEmail)).toBeVisible();

      await panel.getByPlaceholder('person@example.com').fill(inviteEmail);
      await panel.getByRole('button', { name: /^Create invite$/i }).click();
      await expect(page.getByText(/pending invite already exists/i)).toBeVisible();

      await panel.getByRole('button', { name: /^Revoke invite$/i }).click();
      await expect(page.getByText(/Pending invite revoked/i)).toBeVisible();
    } finally {
      await revokePendingInvitesForEmail(owner, homeId, inviteEmail);
      await signOutAll([owner]);
    }
  });

  test('invited homeowner can accept and decline pending invites without loading shared home records', async ({ page }) => {
    const owner = await signInClient('homeowner');
    const invitedHomeowner = await signInClient('homeownerB');
    const homeId = await firstHomeId(owner);

    try {
      await revokePendingInvitesForEmail(owner, homeId, invitedHomeowner.email);
      await revokeMembershipForUser(owner, homeId, invitedHomeowner.userId);
      await createEmailInvite(owner, homeId, invitedHomeowner.email, 'viewer');

      await loginAsHomeownerB(page);
      await openSidebarTab(page, /^Properties$/i);

      const invitationsPanel = page.getByTestId('home-invitations-panel');
      await expect(invitationsPanel.getByText(/Home invitations for you/i)).toBeVisible();
      await expect(invitationsPanel.getByText(/shared home dashboard records will be enabled in a later release/i)).toBeVisible();
      await invitationsPanel.getByRole('button', { name: /^Accept$/i }).click();
      await expect(page.getByText(/Invite accepted/i)).toBeVisible();
      await expect(page.getByText(/Shared home dashboard access will be enabled in a later release/i)).toBeVisible();
      await expect(page.getByText(/Service Requests shared from this home/i)).toHaveCount(0);

      await revokeMembershipForUser(owner, homeId, invitedHomeowner.userId);
      await createEmailInvite(owner, homeId, invitedHomeowner.email, 'member');
      await page.reload();
      await openSidebarTab(page, /^Properties$/i);

      await expect(invitationsPanel.getByText(/Home invitations for you/i)).toBeVisible();
      await invitationsPanel.getByRole('button', { name: /^Decline$/i }).click();
      await expect(page.getByText(/Invite declined/i)).toBeVisible();
    } finally {
      await revokePendingInvitesForEmail(owner, homeId, invitedHomeowner.email);
      await revokeMembershipForUser(owner, homeId, invitedHomeowner.userId);
      await signOutAll([owner, invitedHomeowner]);
    }
  });
});
