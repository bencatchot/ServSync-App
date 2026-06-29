import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';

type CredentialKey = Parameters<typeof credentialsFor>[0];
type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
};
type ConnectionPermissionSnapshot = {
  exists: boolean;
  share_contact: boolean;
  share_home_overview: boolean;
  share_address: boolean;
  share_preferred_vendors: boolean;
  share_photos: boolean;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run connected-property proposal probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Connected-property proposal probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing connected-property proposal cleanup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }
}

function assertUuid(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Refusing sandbox cleanup for invalid UUID "${id}".`);
  }
}

function uuidArray(ids: string[]) {
  ids.forEach(assertUuid);
  return `array[${ids.map(id => `'${id}'`).join(',')}]::uuid[]`;
}

function boolSql(value: boolean) {
  return value ? 'true' : 'false';
}

function timestampForRecord() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanupSandboxRecords(
  connectionId: string,
  permissionSnapshot: ConnectionPermissionSnapshot | null,
  proposalIds: string[],
  homeIds: string[],
) {
  requireLinkedSandbox();
  if (connectionId) assertUuid(connectionId);

  const statements: string[] = ['begin;'];

  if (homeIds.length > 0) {
    statements.push(`delete from public.connection_shared_properties where home_id = any(${uuidArray(homeIds)});`);
  }

  if (proposalIds.length > 0) {
    statements.push(`delete from public.contractor_home_property_proposals where id = any(${uuidArray(proposalIds)});`);
  }

  if (homeIds.length > 0) {
    statements.push(`delete from public.homes where id = any(${uuidArray(homeIds)});`);
  }

  if (permissionSnapshot) {
    if (permissionSnapshot.exists) {
      statements.push(`
insert into public.connection_permissions (
  connection_id,
  share_contact,
  share_home_overview,
  share_address,
  share_preferred_vendors,
  share_photos
) values (
  '${connectionId}',
  ${boolSql(permissionSnapshot.share_contact)},
  ${boolSql(permissionSnapshot.share_home_overview)},
  ${boolSql(permissionSnapshot.share_address)},
  ${boolSql(permissionSnapshot.share_preferred_vendors)},
  ${boolSql(permissionSnapshot.share_photos)}
)
on conflict (connection_id) do update
   set share_contact = excluded.share_contact,
       share_home_overview = excluded.share_home_overview,
       share_address = excluded.share_address,
       share_preferred_vendors = excluded.share_preferred_vendors,
       share_photos = excluded.share_photos,
       updated_at = now();`);
    } else {
      statements.push(`delete from public.connection_permissions where connection_id = '${connectionId}';`);
    }
  }

  statements.push('commit;');

  execFileSync('supabase', ['db', 'query', '--linked', statements.join('\n')], {
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

async function contractorProfileId(account: AuthenticatedClient): Promise<string> {
  const own = await account.client
    .from('contractor_profiles')
    .select('id')
    .eq('owner_user_id', account.userId)
    .maybeSingle();

  expect(own.error, 'contractor owner profile lookup should not error').toBeNull();
  if (own.data?.id) return own.data.id as string;

  const { data, error } = await account.client.rpc('servsync_current_contractor_profile');
  expect(error, 'current contractor profile RPC should not error').toBeNull();
  const profile = Array.isArray(data) ? data[0] : data;
  expect(profile?.id, 'contractor profile should exist').toBeTruthy();
  return profile.id as string;
}

async function activeConnectionId(homeowner: AuthenticatedClient, contractorId: string) {
  const result = await homeowner.client
    .from('homeowner_contractor_connections')
    .select('id')
    .eq('homeowner_user_id', homeowner.userId)
    .eq('contractor_id', contractorId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  expect(result.error, 'homeowner active contractor connection lookup should not error').toBeNull();
  expect(result.data?.id, 'sandbox homeowner should have an active connection to contractor fixture').toBeTruthy();
  return result.data!.id as string;
}

async function homeownerConnectionLabel(homeowner: AuthenticatedClient, connectionId: string) {
  const result = await homeowner.client.rpc('servsync_get_homeowner_connections');
  expect(result.error, 'homeowner connection RPC should not error').toBeNull();
  const connection = ((result.data || []) as Array<{ connection_id?: string; business_name?: string }>).find(item => item.connection_id === connectionId);
  expect(connection?.business_name, 'active connection should include contractor business name').toBeTruthy();
  return connection!.business_name!;
}

async function snapshotConnectionPermissions(homeowner: AuthenticatedClient, connectionId: string): Promise<ConnectionPermissionSnapshot> {
  const result = await homeowner.client
    .from('connection_permissions')
    .select('share_contact,share_home_overview,share_address,share_preferred_vendors,share_photos')
    .eq('connection_id', connectionId)
    .maybeSingle();

  expect(result.error, 'connection permission snapshot lookup should not error').toBeNull();
  if (!result.data) {
    return {
      exists: false,
      share_contact: false,
      share_home_overview: false,
      share_address: false,
      share_preferred_vendors: false,
      share_photos: false,
    };
  }

  return {
    exists: true,
    share_contact: Boolean(result.data.share_contact),
    share_home_overview: Boolean(result.data.share_home_overview),
    share_address: Boolean(result.data.share_address),
    share_preferred_vendors: Boolean(result.data.share_preferred_vendors),
    share_photos: Boolean(result.data.share_photos),
  };
}

async function createProposal(contractor: AuthenticatedClient, connectionId: string, label: string) {
  const result = await contractor.client.rpc('servsync_create_home_property_proposal', {
    p_connection_id: connectionId,
    p_nickname: `E2E Proposed Property ${label}`,
    p_address_line1: `123 ${label} Proposal Street`,
    p_address_line2: '',
    p_city: 'Testville',
    p_state: 'AL',
    p_zip_code: '36532',
    p_homeowner_visible_note: 'Sandbox-only connected property proposal probe.',
  });

  expect(result.error, 'contractor should create connected-homeowner property proposal').toBeNull();
  expect(result.data?.id, 'created proposal id should be returned').toBeTruthy();
  return result.data as { id: string; status: string; homeowner_user_id: string; connection_id: string };
}

async function createHome(homeowner: AuthenticatedClient, label: string) {
  const result = await homeowner.client
    .from('homes')
    .insert({
      homeowner_user_id: homeowner.userId,
      nickname: `E2E Existing Home ${label}`,
      address_line1: `456 ${label} Existing Avenue`,
      address_line2: '',
      city: 'Testville',
      state: 'AL',
      zip_code: '36533',
      home_type: '',
      year_built: '',
      square_feet: '',
      notes: '',
    })
    .select('id')
    .single();

  expect(result.error, 'homeowner should create existing-home fixture').toBeNull();
  expect(result.data?.id, 'existing-home fixture id should be returned').toBeTruthy();
  return result.data!.id as string;
}

async function countById(client: SupabaseClient, table: string, id: string) {
  const result = await client.from(table).select('id', { count: 'exact', head: true }).eq('id', id);
  expect(result.error, `${table} count by id should not error`).toBeNull();
  return result.count ?? 0;
}

test.describe.configure({ mode: 'serial' });

test.describe('connected-homeowner property proposal RPC foundation', () => {
  let homeownerA: AuthenticatedClient;
  let homeownerB: AuthenticatedClient;
  let contractorA: AuthenticatedClient;
  let contractorB: AuthenticatedClient;
  let contractorAId = '';
  let connectionId = '';
  let permissionSnapshot: ConnectionPermissionSnapshot | null = null;
  const createdProposalIds: string[] = [];
  const createdHomeIds: string[] = [];

  test.beforeAll(async () => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();
    requireLinkedSandbox();

    homeownerA = await signInAs('homeowner');
    homeownerB = await signInAs('homeownerB');
    contractorA = await signInAs('contractor');
    contractorB = await signInAs('contractorB');
    contractorAId = await contractorProfileId(contractorA);
    connectionId = await activeConnectionId(homeownerA, contractorAId);
    permissionSnapshot = await snapshotConnectionPermissions(homeownerA, connectionId);
  });

  test.afterAll(async () => {
    try {
      cleanupSandboxRecords(connectionId, permissionSnapshot, createdProposalIds, createdHomeIds);
    } finally {
      await signOutAll([homeownerA, homeownerB, contractorA, contractorB].filter(Boolean));
    }
  });

  test('contractor creates a pending proposal and unrelated users cannot read or mutate it', async () => {
    const proposal = await createProposal(contractorA, connectionId, `Create ${Date.now().toString(36)}`);
    createdProposalIds.push(proposal.id);

    expect(proposal.status).toBe('pending');
    expect(proposal.homeowner_user_id).toBe(homeownerA.userId);
    expect(proposal.connection_id).toBe(connectionId);

    const homeownerRead = await homeownerA.client
      .from('contractor_home_property_proposals')
      .select('id,status,homeowner_visible_note')
      .eq('id', proposal.id)
      .maybeSingle();
    expect(homeownerRead.error, 'homeowner should read own pending proposal').toBeNull();
    expect(homeownerRead.data?.id).toBe(proposal.id);

    await expect(countById(contractorB.client, 'contractor_home_property_proposals', proposal.id)).resolves.toBe(0);
    await expect(countById(homeownerB.client, 'contractor_home_property_proposals', proposal.id)).resolves.toBe(0);

    const directInsert = await contractorA.client.from('contractor_home_property_proposals').insert({
      contractor_id: contractorAId,
      homeowner_user_id: homeownerA.userId,
      connection_id: connectionId,
      proposed_by_user_id: contractorA.userId,
      nickname: 'Direct insert should fail',
    });
    expect(directInsert.error, 'browser roles should not directly insert property proposals').toBeTruthy();

    const deniedCreate = await contractorB.client.rpc('servsync_create_home_property_proposal', {
      p_connection_id: connectionId,
      p_nickname: 'Cross contractor denied',
      p_address_line1: '999 Denied Street',
      p_address_line2: '',
      p_city: 'Blocked',
      p_state: 'AL',
      p_zip_code: '36534',
      p_homeowner_visible_note: '',
    });
    expect(deniedCreate.error, 'unrelated contractor should not create proposal on another contractor connection').toBeTruthy();
  });

  test('contractor creates and revokes a pending property suggestion from the customer workspace', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const proposedLabel = `E2E UI Proposed Property ${timestamp}`;
    const homeownerVisibleNote = `Sandbox-only homeowner-visible proposal note ${timestamp}.`;

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);

    await expect(main.getByPlaceholder(/Search homeowner, city, address/i)).toBeVisible();
    const connectedHomeownerRow = main.getByRole('button').filter({ hasText: /Connected/i }).first();
    await expect(connectedHomeownerRow).toBeVisible({ timeout: 30_000 });
    await connectedHomeownerRow.click();

    const suggestions = main.getByTestId('connected-property-suggestions');
    await expect(suggestions).toBeVisible({ timeout: 30_000 });
    await expect(suggestions.getByText(/homeowner approval|homeowner review/i)).toBeVisible();
    await suggestions.getByRole('button', { name: /^Suggest property$/i }).click();

    const form = main.getByTestId('connected-property-proposal-form');
    await expect(form).toBeVisible();
    await expect(form.getByText(/The homeowner decides whether to add or share this property/i)).toBeVisible();
    await form.getByLabel(/^Property label$/i).fill(proposedLabel);
    await form.getByLabel(/^Street address$/i).fill('777 Proposal UI Street');
    await form.getByLabel(/^City$/i).fill('Testville');
    await form.getByPlaceholder(/Start typing a state/i).fill('AL');
    await form.getByLabel(/^ZIP$/i).fill('36532');
    await form.getByLabel(/^Homeowner-visible note$/i).fill(homeownerVisibleNote);

    const createResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_home_property_proposal'),
      { timeout: 10_000 },
    );
    await form.getByRole('button', { name: /^Send for homeowner review$/i }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok()).toBeTruthy();
    const createBody = await createResponse.json().catch(() => null) as { id?: string } | null;
    if (createBody?.id) createdProposalIds.push(createBody.id);

    const proposalCard = main.getByTestId('connected-property-proposal-card').filter({ hasText: proposedLabel }).first();
    await expect(proposalCard).toBeVisible({ timeout: 30_000 });
    await expect(proposalCard.getByText(/Waiting for homeowner review/i)).toBeVisible();
    await expect(proposalCard.getByText(homeownerVisibleNote)).toBeVisible();
    await expect(proposalCard.getByText(/not available for jobs, estimates, invoices, reports, or Home History/i)).toBeVisible();
    await expect(main.getByRole('button', { name: /Invite to ServSync|Create New ServSync Invite/i })).toHaveCount(0);
    await expect(main.getByRole('button', { name: /Accept suggestion|Reject suggestion/i })).toHaveCount(0);

    await main.getByTestId('contractor-customer-tab-fieldwork').click();
    await expect(main.getByRole('heading', { name: /^Jobs dashboard$/i })).toBeVisible();
    await main.getByRole('button', { name: /^Create job\b/i }).click();
    await expectActiveTabHeading(page, /^Jobs$/i);
    await expect(main.getByRole('heading', { name: /^Create Job$/i })).toBeVisible();
    await expect(main.getByText(new RegExp(escapeRegExp(proposedLabel), 'i'))).toHaveCount(0);

    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);
    const reopenedConnectedHomeownerRow = main.getByRole('button').filter({ hasText: /Connected/i }).first();
    await expect(reopenedConnectedHomeownerRow).toBeVisible();
    await reopenedConnectedHomeownerRow.click();
    const reopenedProposalCard = main.getByTestId('connected-property-proposal-card').filter({ hasText: proposedLabel }).first();
    await expect(reopenedProposalCard).toBeVisible({ timeout: 30_000 });

    page.once('dialog', dialog => void dialog.accept());
    const revokeResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_revoke_home_property_proposal'),
      { timeout: 10_000 },
    );
    await reopenedProposalCard.getByRole('button', { name: /^Revoke suggestion$/i }).click();
    const revokeResponse = await revokeResponsePromise;
    expect(revokeResponse.ok()).toBeTruthy();

    await expect(reopenedProposalCard.getByText(/Revoked by contractor/i)).toBeVisible({ timeout: 30_000 });
    await expect(reopenedProposalCard.getByRole('button', { name: /^Revoke suggestion$/i })).toHaveCount(0);

    if (!createBody?.id) {
      const proposalLookup = await contractorA.client
        .from('contractor_home_property_proposals')
        .select('id')
        .eq('connection_id', connectionId)
        .eq('nickname', proposedLabel)
        .maybeSingle();
      expect(proposalLookup.error, 'UI proposal lookup for cleanup should not error').toBeNull();
      if (proposalLookup.data?.id) createdProposalIds.push(proposalLookup.data.id as string);
    }

    await consoleErrors.assertClean(testInfo);
  });

  test('homeowner accepts a pending property suggestion into a new unshared home from the contractor card', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const proposal = await createProposal(contractorA, connectionId, `UI Accept New ${timestamp}`);
    createdProposalIds.push(proposal.id);
    const businessName = await homeownerConnectionLabel(homeownerA, connectionId);
    const proposalLabel = `E2E Proposed Property UI Accept New ${timestamp}`;

    await loginAs(page, 'homeowner');
    await openSidebarTab(page, /^Contractors\b/i);
    await expectActiveTabHeading(page, /^Contractors$/i);
    await main.getByRole('button').filter({ hasText: businessName }).first().click();

    const suggestions = main.getByTestId('homeowner-property-suggestions');
    await expect(suggestions).toBeVisible({ timeout: 30_000 });
    await expect(suggestions.getByText(/Nothing is added or shared unless you accept/i)).toBeVisible();
    const card = suggestions.getByTestId('homeowner-property-suggestion-card').filter({ hasText: proposalLabel }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/Waiting for homeowner review/i)).toBeVisible();
    await expect(card.getByText(/Accepting creates or links a property in your profile/i)).toBeVisible();
    await card.getByRole('button', { name: /^Accept suggestion$/i }).click();

    const dialog = page.getByTestId('homeowner-property-proposal-accept-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Accepting adds or links a property in your profile/i)).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /Create a new home from this suggestion/i })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: /Link to one of my existing homes/i })).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: new RegExp(`Share this property with ${escapeRegExp(businessName)}`, 'i') })).not.toBeChecked();
    await expect(dialog.getByText(/If you do not share, the home stays in your profile only/i)).toBeVisible();

    const acceptResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_homeowner_accept_home_property_proposal'),
      { timeout: 10_000 },
    );
    await dialog.getByRole('button', { name: /^Accept suggestion$/i }).click();
    const acceptResponse = await acceptResponsePromise;
    expect(acceptResponse.ok()).toBeTruthy();
    const acceptBody = await acceptResponse.json().catch(() => null) as { accepted_home_id?: string } | null;
    if (acceptBody?.accepted_home_id) createdHomeIds.push(acceptBody.accepted_home_id);

    await expect(card.getByText(/Accepted by homeowner/i)).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole('button', { name: /^Accept suggestion$/i })).toHaveCount(0);
    await expect(card.getByRole('button', { name: /^Reject$/i })).toHaveCount(0);

    const acceptedProposal = await homeownerA.client
      .from('contractor_home_property_proposals')
      .select('accepted_home_id,status')
      .eq('id', proposal.id)
      .single();
    expect(acceptedProposal.error, 'accepted UI proposal lookup should not error').toBeNull();
    expect(acceptedProposal.data?.status).toBe('accepted');
    const acceptedHomeId = acceptedProposal.data!.accepted_home_id as string;
    if (!createdHomeIds.includes(acceptedHomeId)) createdHomeIds.push(acceptedHomeId);

    const sharedRows = await homeownerA.client
      .from('connection_shared_properties')
      .select('id')
      .eq('connection_id', connectionId)
      .eq('home_id', acceptedHomeId);
    expect(sharedRows.error, 'unshared accepted proposal shared-property lookup should not error').toBeNull();
    expect(sharedRows.data ?? []).toHaveLength(0);

    await consoleErrors.assertClean(testInfo);
  });

  test('homeowner links a pending property suggestion to an existing home and shares it from the review dialog', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const existingHomeId = await createHome(homeownerA, `UI Link Shared ${timestamp}`);
    createdHomeIds.push(existingHomeId);
    const proposal = await createProposal(contractorA, connectionId, `UI Link Shared ${timestamp}`);
    createdProposalIds.push(proposal.id);
    const businessName = await homeownerConnectionLabel(homeownerA, connectionId);
    const proposalLabel = `E2E Proposed Property UI Link Shared ${timestamp}`;

    await loginAs(page, 'homeowner');
    await openSidebarTab(page, /^Contractors\b/i);
    await expectActiveTabHeading(page, /^Contractors$/i);
    await main.getByRole('button').filter({ hasText: businessName }).first().click();

    const card = main.getByTestId('homeowner-property-suggestion-card').filter({ hasText: proposalLabel }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: /^Accept suggestion$/i }).click();

    const dialog = page.getByTestId('homeowner-property-proposal-accept-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: /Link to one of my existing homes/i }).check();
    await dialog.getByLabel(/^Existing home$/i).selectOption(existingHomeId);
    await dialog.getByRole('checkbox', { name: new RegExp(`Share this property with ${escapeRegExp(businessName)}`, 'i') }).check();
    await expect(dialog.getByText(/Sharing lets this contractor use the property for service requests, jobs, estimates, invoices, reports/i)).toBeVisible();

    const acceptResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_homeowner_accept_home_property_proposal'),
      { timeout: 10_000 },
    );
    await dialog.getByRole('button', { name: /^Accept suggestion$/i }).click();
    const acceptResponse = await acceptResponsePromise;
    expect(acceptResponse.ok()).toBeTruthy();

    await expect(card.getByText(/Accepted by homeowner/i)).toBeVisible({ timeout: 30_000 });
    const sharedRows = await contractorA.client
      .from('connection_shared_properties')
      .select('id,share_home_overview,share_address,share_preferred_vendors,share_photos')
      .eq('connection_id', connectionId)
      .eq('home_id', existingHomeId);
    expect(sharedRows.error, 'contractor should see shared accepted property access').toBeNull();
    expect(sharedRows.data ?? []).toHaveLength(1);
    expect(sharedRows.data![0].share_home_overview).toBe(true);
    expect(sharedRows.data![0].share_address).toBe(true);
    expect(sharedRows.data![0].share_photos).toBe(false);

    await consoleErrors.assertClean(testInfo);
  });

  test('homeowner rejects a pending property suggestion from the contractor card', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const proposal = await createProposal(contractorA, connectionId, `UI Reject ${timestamp}`);
    createdProposalIds.push(proposal.id);
    const businessName = await homeownerConnectionLabel(homeownerA, connectionId);
    const proposalLabel = `E2E Proposed Property UI Reject ${timestamp}`;

    await loginAs(page, 'homeowner');
    await openSidebarTab(page, /^Contractors\b/i);
    await expectActiveTabHeading(page, /^Contractors$/i);
    await main.getByRole('button').filter({ hasText: businessName }).first().click();

    const card = main.getByTestId('homeowner-property-suggestion-card').filter({ hasText: proposalLabel }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    page.once('dialog', dialog => void dialog.accept());
    const rejectResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_homeowner_reject_home_property_proposal'),
      { timeout: 10_000 },
    );
    await card.getByRole('button', { name: /^Reject$/i }).click();
    const rejectResponse = await rejectResponsePromise;
    expect(rejectResponse.ok()).toBeTruthy();

    await expect(card.getByText(/Rejected by homeowner/i)).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole('button', { name: /^Accept suggestion$/i })).toHaveCount(0);
    await expect(card.getByRole('button', { name: /^Reject$/i })).toHaveCount(0);

    const rejectedAccept = await homeownerA.client.rpc('servsync_homeowner_accept_home_property_proposal', {
      p_proposal_id: proposal.id,
      p_existing_home_id: null,
      p_share_with_contractor: true,
      p_nickname: '',
      p_address_line1: '',
      p_address_line2: '',
      p_city: '',
      p_state: '',
      p_zip_code: '',
    });
    expect(rejectedAccept.error, 'rejected proposal should not be accepted later').toBeTruthy();

    await consoleErrors.assertClean(testInfo);
  });

  test('homeowner accepts a proposal into a new home and explicitly shares it', async () => {
    const proposal = await createProposal(contractorA, connectionId, `Share ${Date.now().toString(36)}`);
    createdProposalIds.push(proposal.id);

    const accept = await homeownerA.client.rpc('servsync_homeowner_accept_home_property_proposal', {
      p_proposal_id: proposal.id,
      p_existing_home_id: null,
      p_share_with_contractor: true,
      p_nickname: 'E2E Accepted Shared Property',
      p_address_line1: '500 Accepted Shared Street',
      p_address_line2: '',
      p_city: 'Sharedville',
      p_state: 'AL',
      p_zip_code: '36535',
    });
    expect(accept.error, 'homeowner should accept and share proposal').toBeNull();
    expect(accept.data?.status).toBe('accepted');
    expect(accept.data?.accepted_home_id, 'accepted proposal should return accepted home id').toBeTruthy();
    createdHomeIds.push(accept.data.accepted_home_id as string);

    const sharedProperty = await homeownerA.client
      .from('connection_shared_properties')
      .select('id,home_id,share_home_overview,share_address,share_photos')
      .eq('connection_id', connectionId)
      .eq('home_id', accept.data.accepted_home_id)
      .maybeSingle();
    expect(sharedProperty.error, 'homeowner should read accepted shared-property row').toBeNull();
    expect(sharedProperty.data?.share_home_overview).toBe(true);
    expect(sharedProperty.data?.share_address).toBe(true);
    expect(sharedProperty.data?.share_photos).toBe(false);

    const contractorSharedRead = await contractorA.client
      .from('connection_shared_properties')
      .select('id')
      .eq('connection_id', connectionId)
      .eq('home_id', accept.data.accepted_home_id);
    expect(contractorSharedRead.error, 'contractor should read explicitly shared accepted property').toBeNull();
    expect(contractorSharedRead.data).toHaveLength(1);
  });

  test('homeowner accepts a proposal without sharing and can link an existing home', async () => {
    const existingHomeId = await createHome(homeownerA, Date.now().toString(36));
    createdHomeIds.push(existingHomeId);
    const proposal = await createProposal(contractorA, connectionId, `NoShare ${Date.now().toString(36)}`);
    createdProposalIds.push(proposal.id);

    const accept = await homeownerA.client.rpc('servsync_homeowner_accept_home_property_proposal', {
      p_proposal_id: proposal.id,
      p_existing_home_id: existingHomeId,
      p_share_with_contractor: false,
      p_nickname: '',
      p_address_line1: '',
      p_address_line2: '',
      p_city: '',
      p_state: '',
      p_zip_code: '',
    });
    expect(accept.error, 'homeowner should accept proposal without sharing').toBeNull();
    expect(accept.data?.status).toBe('accepted');
    expect(accept.data?.accepted_home_id).toBe(existingHomeId);

    const noSharedProperty = await homeownerA.client
      .from('connection_shared_properties')
      .select('id')
      .eq('connection_id', connectionId)
      .eq('home_id', existingHomeId);
    expect(noSharedProperty.error, 'no-share accepted proposal csp lookup should not error').toBeNull();
    expect(noSharedProperty.data).toHaveLength(0);
  });

  test('homeowner rejection and contractor revocation close pending proposals', async () => {
    const rejectedProposal = await createProposal(contractorA, connectionId, `Reject ${Date.now().toString(36)}`);
    createdProposalIds.push(rejectedProposal.id);

    const reject = await homeownerA.client.rpc('servsync_homeowner_reject_home_property_proposal', {
      p_proposal_id: rejectedProposal.id,
    });
    expect(reject.error, 'homeowner should reject pending proposal').toBeNull();
    expect(reject.data?.status).toBe('rejected');

    const rejectedAccept = await homeownerA.client.rpc('servsync_homeowner_accept_home_property_proposal', {
      p_proposal_id: rejectedProposal.id,
      p_existing_home_id: null,
      p_share_with_contractor: true,
      p_nickname: '',
      p_address_line1: '',
      p_address_line2: '',
      p_city: '',
      p_state: '',
      p_zip_code: '',
    });
    expect(rejectedAccept.error, 'rejected proposal should not later be accepted').toBeTruthy();

    const revokedProposal = await createProposal(contractorA, connectionId, `Revoke ${Date.now().toString(36)}`);
    createdProposalIds.push(revokedProposal.id);

    const crossRevoke = await contractorB.client.rpc('servsync_revoke_home_property_proposal', {
      p_proposal_id: revokedProposal.id,
    });
    expect(crossRevoke.error, 'unrelated contractor should not revoke another contractor proposal').toBeTruthy();

    const revoke = await contractorA.client.rpc('servsync_revoke_home_property_proposal', {
      p_proposal_id: revokedProposal.id,
    });
    expect(revoke.error, 'contractor should revoke own pending proposal').toBeNull();
    expect(revoke.data?.status).toBe('revoked');

    const revokedAccept = await homeownerA.client.rpc('servsync_homeowner_accept_home_property_proposal', {
      p_proposal_id: revokedProposal.id,
      p_existing_home_id: null,
      p_share_with_contractor: true,
      p_nickname: '',
      p_address_line1: '',
      p_address_line2: '',
      p_city: '',
      p_state: '',
      p_zip_code: '',
    });
    expect(revokedAccept.error, 'revoked proposal should not be accepted').toBeTruthy();
  });

  test('pending proposals cannot be used as connected-homeowner work properties', async () => {
    const proposal = await createProposal(contractorA, connectionId, `Work ${Date.now().toString(36)}`);
    createdProposalIds.push(proposal.id);

    const fieldWork = await contractorA.client.rpc('servsync_create_field_work', {
      p_homeowner_user_id: homeownerA.userId,
      p_home_id: proposal.id,
      p_local_contact_id: null,
      p_local_home_id: null,
      p_service_request_id: null,
      p_name: 'Should not create work against a proposal id',
      p_rooms_with_findings: [],
      p_template_id: null,
    });
    expect(fieldWork.error, 'pending proposal id should not be accepted as a homeowner home_id').toBeTruthy();
  });
});
