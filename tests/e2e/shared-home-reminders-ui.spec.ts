import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentialsFor, requiredEnv, type TestCredentialKey } from './helpers/env';
import { openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';

type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
};
type HomeRole = 'admin' | 'member' | 'viewer';
type HomeFixture = {
  id: string;
  nickname: string;
};
type ReminderFixture = {
  id: string;
  title: string;
  due_on: string;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run shared reminder UI probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Shared reminder UI probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing shared reminder UI fixture setup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
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

async function createSandboxHome(owner: AuthenticatedClient, nickname: string): Promise<HomeFixture> {
  const result = await owner.client
    .from('homes')
    .insert({
      homeowner_user_id: owner.userId,
      nickname,
      address_line1: '123 Shared Reminder Way',
      city: 'Minneapolis',
      state: 'MN',
      zip_code: '55401',
    })
    .select('id, nickname')
    .single();

  expect(result.error, 'sandbox shared reminder home insert should not error').toBeNull();
  expect(result.data?.id, 'sandbox shared reminder home should be created').toBeTruthy();
  return result.data as HomeFixture;
}

async function createSandboxReminder(owner: AuthenticatedClient, homeId: string, title: string): Promise<ReminderFixture> {
  const dueOn = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const result = await owner.client
    .from('home_reminders')
    .insert({
      homeowner_user_id: owner.userId,
      home_id: homeId,
      title,
      notes: `Private shared reminder note for ${title}`,
      due_on: dueOn,
      status: 'open',
    })
    .select('id, title, due_on')
    .single();

  expect(result.error, 'sandbox shared reminder insert should not error').toBeNull();
  expect(result.data?.id, 'sandbox shared reminder should be created').toBeTruthy();
  return result.data as ReminderFixture;
}

function insertMembership(homeId: string, userId: string, role: HomeRole) {
  runLinkedSandboxSql(`
insert into public.home_memberships (
  home_id,
  user_id,
  role,
  status,
  accepted_at
) values (
  ${uuidLiteral(homeId)},
  ${uuidLiteral(userId)},
  '${role}',
  'active',
  now()
);
`);
}

function cleanupSandboxHome(homeId: string, userId: string) {
  runLinkedSandboxSql(`
delete from public.home_reminders
 where home_id = ${uuidLiteral(homeId)};

delete from public.home_membership_audit_events
 where home_id = ${uuidLiteral(homeId)};

delete from public.home_membership_email_invites
 where home_id = ${uuidLiteral(homeId)};

delete from public.home_memberships
 where home_id = ${uuidLiteral(homeId)};

delete from public.homes
 where id = ${uuidLiteral(homeId)};
`);
}

async function openProperties(page: Page) {
  await openSidebarTab(page, /^Properties$/i);
  await expect(page.getByTestId('shared-home-shells-panel')).toBeVisible();
}

async function loginAsHomeownerB(page: Page) {
  const credentials = credentialsFor('homeownerB');
  await page.goto('/');
  await page.getByRole('button', { name: /^Homeowner$/i }).click();

  const authMain = page.getByRole('main');
  await expect(authMain.getByRole('heading', { name: /^Sign in$/i })).toBeVisible();
  await authMain.getByLabel(/^Email$/i).fill(credentials.email);
  await authMain.getByLabel(/^Password$/i).fill(credentials.password);
  await authMain.getByRole('button', { name: /^Sign in$/i }).click();

  await expect(page.getByRole('heading', { name: /^Sign in$/i })).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^Properties$/i })).toBeVisible();
}

test.describe('shared home reminders UI', () => {
  test.beforeEach(() => {
    requireApprovedSandboxForMutation();
  });

  test('renders open shared reminder shells read-only under the shared home card', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const owner = await signInAs('homeowner');
    const sharedMember = await signInAs('homeownerB');
    const unique = Date.now();
    const home = await createSandboxHome(owner, `Shared reminder UI ${unique}`);
    const reminder = await createSandboxReminder(owner, home.id, `Shared reminder title ${unique}`);

    try {
      insertMembership(home.id, sharedMember.userId, 'member');

      await loginAsHomeownerB(page);
      await expect(page.getByRole('main').getByText(reminder.title)).toHaveCount(0);

      await openProperties(page);

      const sharedPanel = page.getByTestId('shared-home-shells-panel');
      const sharedHomeCard = sharedPanel.getByTestId('shared-home-shell-card').filter({ hasText: home.nickname }).first();
      await expect(sharedHomeCard).toBeVisible();
      await expect(sharedHomeCard.getByText(/This shared home cannot be selected for owner dashboard records yet/i)).toBeVisible();

      const remindersSection = sharedHomeCard.getByTestId('shared-home-reminders-section');
      await expect(remindersSection.getByText(/Shared reminders/i)).toBeVisible();
      await expect(remindersSection.getByText(/Read-only reminders shared with this home/i)).toBeVisible();
      await expect(remindersSection.getByText(/Notes and linked records are not shared yet/i)).toBeVisible();
      await expect(remindersSection.getByText(reminder.title)).toBeVisible();
      await expect(remindersSection.getByText('open', { exact: true })).toBeVisible();
      await expect(remindersSection.getByText('Open', { exact: true })).toBeVisible();
      await expect(remindersSection.getByText(/Due /i)).toBeVisible();
      await expect(remindersSection.getByRole('button')).toHaveCount(0);

      await expect(page.getByText(/Private shared reminder note/i)).toHaveCount(0);
      await expect(page.getByText(reminder.id)).toHaveCount(0);
      await expect(sharedHomeCard.getByText(/service request|invoice|job|document|storage|contractor connection|home history/i)).toHaveCount(0);
      await expect(sharedHomeCard.getByRole('button', { name: /add|edit|complete|dismiss|delete/i })).toHaveCount(0);
      await consoleErrors.assertClean(testInfo);
    } finally {
      cleanupSandboxHome(home.id, sharedMember.userId);
      await signOutAll([owner, sharedMember]);
    }
  });

  test('renders an empty state for shared homes with no open reminder shells', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const owner = await signInAs('homeowner');
    const sharedMember = await signInAs('homeownerB');
    const home = await createSandboxHome(owner, `Shared reminder empty ${Date.now()}`);

    try {
      insertMembership(home.id, sharedMember.userId, 'viewer');

      await loginAsHomeownerB(page);
      await openProperties(page);

      const sharedPanel = page.getByTestId('shared-home-shells-panel');
      const sharedHomeCard = sharedPanel.getByTestId('shared-home-shell-card').filter({ hasText: home.nickname }).first();
      await expect(sharedHomeCard).toBeVisible();
      const remindersSection = sharedHomeCard.getByTestId('shared-home-reminders-section');

      await expect(remindersSection.getByText(/No shared reminders for this home/i)).toBeVisible();
      await expect(remindersSection.getByRole('button')).toHaveCount(0);
      await expect(sharedHomeCard.getByText(/This shared home cannot be selected for owner dashboard records yet/i)).toBeVisible();
      await consoleErrors.assertClean(testInfo);
    } finally {
      cleanupSandboxHome(home.id, sharedMember.userId);
      await signOutAll([owner, sharedMember]);
    }
  });
});
