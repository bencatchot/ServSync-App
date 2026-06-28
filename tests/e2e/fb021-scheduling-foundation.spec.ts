import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const PROBE_ENABLED = process.env.FB021_SCHEDULING_FOUNDATION === 'true';

type ContractorProbeRole = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | 'contractorB';

type AuthenticatedClient = {
  client: SupabaseClient;
  role: ContractorProbeRole | 'homeowner' | 'homeownerB';
  userId: string;
};

type WindowRow = {
  id: string;
  request_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  proposal_batch_id: string;
};

type AppointmentRow = {
  id: string;
  request_id: string;
  proposed_at: string;
  status: string;
  proposed_by: string;
};

const ROLE_ENV: Record<Exclude<ContractorProbeRole, 'owner' | 'contractorB'>, { email: string; password: string; role: string }> = {
  admin: {
    email: 'TEST_CONTRACTOR_ADMIN_EMAIL',
    password: 'TEST_CONTRACTOR_ADMIN_PASSWORD',
    role: 'admin',
  },
  office: {
    email: 'TEST_CONTRACTOR_OFFICE_EMAIL',
    password: 'TEST_CONTRACTOR_OFFICE_PASSWORD',
    role: 'office',
  },
  field_tech: {
    email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL',
    password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD',
    role: 'field_tech',
  },
  viewer: {
    email: 'TEST_CONTRACTOR_VIEWER_EMAIL',
    password: 'TEST_CONTRACTOR_VIEWER_PASSWORD',
    role: 'viewer',
  },
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run FB-021 scheduling foundation probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`FB-021 scheduling foundation probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function roleConfigured(role: keyof typeof ROLE_ENV) {
  const env = ROLE_ENV[role];
  return Boolean(process.env[env.email]?.trim() && process.env[env.password]?.trim());
}

async function signInWithCredentials(role: AuthenticatedClient['role'], credentials: { email: string; password: string }): Promise<AuthenticatedClient> {
  const { url, anonKey } = requireSandboxSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword(credentials);
  expect(error, `${role} login should succeed`).toBeNull();
  expect(data.user?.id, `${role} auth user should be present`).toBeTruthy();

  return { client, role, userId: data.user!.id };
}

async function signInAs(role: ContractorProbeRole | 'homeowner' | 'homeownerB'): Promise<AuthenticatedClient> {
  if (role === 'owner') return signInWithCredentials(role, credentialsFor('contractor'));
  if (role === 'contractorB') return signInWithCredentials(role, credentialsFor('contractorB'));
  if (role === 'homeowner') return signInWithCredentials(role, credentialsFor('homeowner'));
  if (role === 'homeownerB') return signInWithCredentials(role, credentialsFor('homeownerB'));

  const env = ROLE_ENV[role];
  expect(process.env[env.email]?.trim(), `${env.email} must be configured for ${role} scheduling probe`).toBeTruthy();
  expect(process.env[env.password]?.trim(), `${env.password} must be configured for ${role} scheduling probe`).toBeTruthy();
  return signInWithCredentials(role, {
    email: process.env[env.email]!.trim(),
    password: process.env[env.password]!.trim(),
  });
}

async function signOutAll(accounts: Array<AuthenticatedClient | null | undefined>) {
  await Promise.all(accounts.filter(Boolean).map(account => account!.client.auth.signOut().catch(() => undefined)));
}

async function contractorProfileId(account: AuthenticatedClient, label = account.role): Promise<string> {
  const own = await account.client
    .from('contractor_profiles')
    .select('id')
    .eq('owner_user_id', account.userId)
    .maybeSingle();

  expect(own.error, `${label} owner contractor lookup should not error`).toBeNull();
  if (own.data?.id) return own.data.id as string;

  const { data, error } = await account.client.rpc('servsync_current_contractor_profile');
  expect(error, `${label} current contractor profile RPC should not error`).toBeNull();
  const profile = Array.isArray(data) ? data[0] : data;
  expect(profile?.id, `${label} contractor profile should exist`).toBeTruthy();
  return profile.id as string;
}

async function expectSameContractor(account: AuthenticatedClient, ownerContractorId: string) {
  const profileId = await contractorProfileId(account);
  expect(profileId, `${account.role} current contractor should match owner contractor fixture`).toBe(ownerContractorId);
}

async function expectTeamRole(account: AuthenticatedClient, contractorId: string, expectedRole: string, lookupClient = account.client) {
  const result = await lookupClient
    .from('contractor_team_members')
    .select('role,status,contractor_id,user_id')
    .eq('contractor_id', contractorId)
    .eq('user_id', account.userId)
    .maybeSingle();

  expect(result.error, `${account.role} team membership lookup should not error`).toBeNull();
  expect(result.data?.contractor_id, `${account.role} should be linked to owner contractor fixture`).toBe(contractorId);
  expect(result.data?.role, `${account.role} fixture should have expected role`).toBe(expectedRole);
  expect(result.data?.status, `${account.role} fixture should be active`).toBe('active');
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

async function primaryHomeId(homeowner: AuthenticatedClient) {
  const result = await homeowner.client
    .from('homes')
    .select('id')
    .eq('homeowner_user_id', homeowner.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  expect(result.error, 'homeowner primary home lookup should not error').toBeNull();
  return (result.data?.id as string | undefined) ?? null;
}

async function createServiceRequestRecord(homeowner: AuthenticatedClient, contractorId: string, label: string) {
  const connectionId = await activeConnectionId(homeowner, contractorId);
  const homeId = await primaryHomeId(homeowner);
  const title = `Codex FB-021 Scheduling ${label} ${Date.now().toString(36)}`;
  const result = await homeowner.client.rpc('servsync_create_service_request', {
    p_connection_id: connectionId,
    p_category: 'General Maintenance',
    p_urgency: 'normal',
    p_title: title,
    p_description: 'Sandbox-only FB-021 scheduling foundation probe request.',
    p_home_id: homeId,
  });

  expect(result.error, 'homeowner should create scheduling probe service request').toBeNull();
  const requestId = (result.data as { request_id?: string } | null)?.request_id;
  expect(requestId, 'created service request id should be returned').toBeTruthy();
  return { requestId: requestId!, title };
}

async function createServiceRequest(homeowner: AuthenticatedClient, contractorId: string, label: string) {
  const record = await createServiceRequestRecord(homeowner, contractorId, label);
  return record.requestId;
}

function futureWindows(count = 2, offsetDays = 7) {
  const base = Date.now() + offsetDays * 24 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, index) => {
    const startsAt = new Date(base + index * 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    return {
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      note: `Window ${index + 1}`,
    };
  });
}

function futureWindowInputValues(count = 2, offsetDays = 7) {
  return futureWindows(count, offsetDays).map(window => ({
    startsAt: window.starts_at.slice(0, 16),
    endsAt: window.ends_at.slice(0, 16),
  }));
}

async function proposeWindows(account: AuthenticatedClient, requestId: string, count = 2, offsetDays = 7) {
  const result = await account.client.rpc('servsync_propose_service_request_appointment_windows', {
    p_request_id: requestId,
    p_windows: futureWindows(count, offsetDays),
    p_note: 'Sandbox-only FB-021 scheduling probe.',
  });
  expect(result.error, `${account.role} should propose appointment windows`).toBeNull();
  return result.data as { proposal_batch_id: string; window_ids: string[] };
}

async function expectRpcDenied(result: { error: { message?: string } | null }, label: string) {
  expect(result.error, label).toBeTruthy();
}

async function openRequestCard(page: Page, testId: string, title: string) {
  const main = page.getByRole('main');
  await openSidebarTab(page, /Service Requests/i);
  await expectActiveTabHeading(page, /^Service Requests$/i);

  const skipTour = page.getByRole('button', { name: /^Skip Tour$/i });
  if (await skipTour.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await skipTour.click();
  }

  if (testId === 'homeowner-service-request-card') {
    const propertyFilter = main.getByLabel(/^Property$/i);
    if (await propertyFilter.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await propertyFilter.selectOption({ label: 'All properties' });
      await expect(propertyFilter).toHaveValue('all');
    }
  }

  const card = main.getByTestId(testId).filter({ hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  const windowsPanel = card.getByTestId('service-request-appointment-windows').first();
  if (!(await windowsPanel.isVisible({ timeout: 1_000 }).catch(() => false))) {
    await card.getByRole('button').first().click();
  }

  return card;
}

async function requestWindows(account: AuthenticatedClient, requestId: string) {
  const result = await account.client
    .from('service_request_appointment_windows')
    .select('id,request_id,starts_at,ends_at,status,proposal_batch_id')
    .eq('request_id', requestId)
    .order('starts_at', { ascending: true });

  expect(result.error, 'appointment windows should be readable by connected party').toBeNull();
  return (result.data ?? []) as WindowRow[];
}

async function requestAppointment(account: AuthenticatedClient, requestId: string) {
  const result = await account.client
    .from('service_request_appointments')
    .select('id,request_id,proposed_at,status,proposed_by')
    .eq('request_id', requestId)
    .maybeSingle();

  expect(result.error, 'appointment summary lookup should not error').toBeNull();
  return result.data as AppointmentRow | null;
}

async function requestEvents(account: AuthenticatedClient, requestId: string) {
  const result = await account.client
    .from('service_request_appointment_events')
    .select('id,event_type,request_id')
    .eq('request_id', requestId);

  expect(result.error, 'appointment event history lookup should not error').toBeNull();
  return result.data ?? [];
}

function projectRefForSandboxSql() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  return existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';
}

function quoteUuidList(ids: string[]) {
  return [...new Set(ids)]
    .map(id => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error(`Refusing sandbox cleanup for invalid UUID "${id}".`);
      }
      return `'${id}'::uuid`;
    })
    .join(', ');
}

function cleanupRequestsWithSandboxSql(requestIds: string[]) {
  if (requestIds.length === 0) return;
  const linkedProjectRef = projectRefForSandboxSql();
  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing FB-021 sandbox cleanup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }

  const requestList = quoteUuidList(requestIds);
  execFileSync(
    'supabase',
    [
      'db',
      'query',
      '--linked',
      `
begin;
delete from public.notifications where request_id in (${requestList});
delete from public.service_request_appointment_events where request_id in (${requestList});
delete from public.service_request_appointment_windows where request_id in (${requestList});
delete from public.service_request_appointments where request_id in (${requestList});
delete from public.service_request_messages where request_id in (${requestList});
delete from public.service_requests where id in (${requestList});
commit;
      `.trim(),
    ],
    { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
  );
}

test.describe('FB-021 sandbox scheduling foundation probes', () => {
  let owner: AuthenticatedClient;
  let homeowner: AuthenticatedClient;
  let homeownerB: AuthenticatedClient;
  let contractorB: AuthenticatedClient;
  let admin: AuthenticatedClient | null = null;
  let office: AuthenticatedClient | null = null;
  let fieldTech: AuthenticatedClient | null = null;
  let viewer: AuthenticatedClient | null = null;
  let contractorId = '';
  const createdRequestIds: string[] = [];

  test.beforeAll(async () => {
    test.skip(
      !PROBE_ENABLED,
      'Set FB021_SCHEDULING_FOUNDATION=true to run these sandbox-mutating scheduling foundation probes.',
    );
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();

    owner = await signInAs('owner');
    homeowner = await signInAs('homeowner');
    homeownerB = await signInAs('homeownerB');
    contractorB = await signInAs('contractorB');
    if (roleConfigured('admin')) admin = await signInAs('admin');
    if (roleConfigured('office')) office = await signInAs('office');
    if (roleConfigured('field_tech')) fieldTech = await signInAs('field_tech');
    if (roleConfigured('viewer')) viewer = await signInAs('viewer');

    contractorId = await contractorProfileId(owner, 'owner');
    if (admin) {
      await expectSameContractor(admin, contractorId);
      await expectTeamRole(admin, contractorId, 'admin');
    }
    if (office) {
      await expectSameContractor(office, contractorId);
      await expectTeamRole(office, contractorId, 'office');
    }
    if (fieldTech) {
      await expectSameContractor(fieldTech, contractorId);
      await expectTeamRole(fieldTech, contractorId, 'field_tech');
    }
    if (viewer) {
      await expectSameContractor(viewer, contractorId);
      await expectTeamRole(viewer, contractorId, 'viewer');
    }
  });

  test.afterAll(async () => {
    cleanupRequestsWithSandboxSql(createdRequestIds);
    await signOutAll([owner, homeowner, homeownerB, contractorB, admin, office, fieldTech, viewer]);
  });

  test('owner, admin, and office can propose windows while field tech, viewer, and cross-contractor are denied', async () => {
    const allowedActors: Array<{ label: string; account: AuthenticatedClient | null }> = [
      { label: 'owner', account: owner },
      { label: 'admin', account: admin },
      { label: 'office', account: office },
    ];

    for (const actor of allowedActors) {
      if (!actor.account) {
        console.log(`[FB-021 scheduling probe] ${actor.label} fixture is not configured; skipping positive ${actor.label} coverage.`);
        continue;
      }
      const requestId = await createServiceRequest(homeowner, contractorId, `${actor.label} Allow`);
      createdRequestIds.push(requestId);
      const proposed = await proposeWindows(actor.account!, requestId, 2);
      expect(proposed.window_ids).toHaveLength(2);
      const windows = await requestWindows(homeowner, requestId);
      expect(windows.filter(window => window.status === 'proposed')).toHaveLength(2);
    }

    const deniedRequestId = await createServiceRequest(homeowner, contractorId, 'Denied Roles');
    createdRequestIds.push(deniedRequestId);

    if (fieldTech) {
      const result = await fieldTech.client.rpc('servsync_propose_service_request_appointment_windows', {
        p_request_id: deniedRequestId,
        p_windows: futureWindows(1, 8),
        p_note: 'field tech denied',
      });
      await expectRpcDenied(result, 'field tech should not propose appointment windows');
    }

    if (viewer) {
      const result = await viewer.client.rpc('servsync_propose_service_request_appointment_windows', {
        p_request_id: deniedRequestId,
        p_windows: futureWindows(1, 9),
        p_note: 'viewer denied',
      });
      await expectRpcDenied(result, 'viewer should not propose appointment windows');
    }

    const crossResult = await contractorB.client.rpc('servsync_propose_service_request_appointment_windows', {
      p_request_id: deniedRequestId,
      p_windows: futureWindows(1, 10),
      p_note: 'cross contractor denied',
    });
    await expectRpcDenied(crossResult, 'cross-contractor should not propose appointment windows');
  });

  test('window proposal batches reject 0 or 4 windows and accept valid 1 to 3 window batches', async () => {
    const invalidRequestId = await createServiceRequest(homeowner, contractorId, 'Window Count Invalid');
    createdRequestIds.push(invalidRequestId);

    const zeroWindowResult = await owner.client.rpc('servsync_propose_service_request_appointment_windows', {
      p_request_id: invalidRequestId,
      p_windows: [],
      p_note: 'zero windows should be rejected',
    });
    await expectRpcDenied(zeroWindowResult, 'zero appointment windows should be rejected');

    const fourWindowResult = await owner.client.rpc('servsync_propose_service_request_appointment_windows', {
      p_request_id: invalidRequestId,
      p_windows: futureWindows(4, 20),
      p_note: 'four windows should be rejected',
    });
    await expectRpcDenied(fourWindowResult, 'four appointment windows should be rejected');

    for (const count of [1, 2, 3]) {
      const requestId = await createServiceRequest(homeowner, contractorId, `Window Count ${count}`);
      createdRequestIds.push(requestId);
      const proposed = await proposeWindows(owner, requestId, count, 20 + count);
      expect(proposed.window_ids, `${count} appointment windows should be accepted`).toHaveLength(count);
      const windows = await requestWindows(homeowner, requestId);
      expect(windows.filter(window => window.status === 'proposed')).toHaveLength(count);
    }
  });

  test('homeowner accepts one proposed window, supersedes siblings, and preserves single appointment summary compatibility', async () => {
    const requestId = await createServiceRequest(homeowner, contractorId, 'Accept One');
    createdRequestIds.push(requestId);
    const proposed = await proposeWindows(owner, requestId, 3, 11);
    expect(proposed.window_ids).toHaveLength(3);

    const otherHomeownerAccept = await homeownerB.client.rpc('servsync_accept_service_request_appointment_window', {
      p_window_id: proposed.window_ids[0],
    });
    await expectRpcDenied(otherHomeownerAccept, 'other homeowner should not accept someone else’s appointment window');

    const contractorAccept = await owner.client.rpc('servsync_accept_service_request_appointment_window', {
      p_window_id: proposed.window_ids[0],
    });
    await expectRpcDenied(contractorAccept, 'contractor should not accept as homeowner');

    const acceptResult = await homeowner.client.rpc('servsync_accept_service_request_appointment_window', {
      p_window_id: proposed.window_ids[0],
    });
    expect(acceptResult.error, 'own homeowner should accept proposed appointment window').toBeNull();

    const windows = await requestWindows(homeowner, requestId);
    expect(windows.filter(window => window.status === 'accepted')).toHaveLength(1);
    expect(windows.filter(window => window.status === 'superseded')).toHaveLength(2);

    const summary = await requestAppointment(homeowner, requestId);
    expect(summary?.status, 'accepted window should create confirmed appointment summary').toBe('confirmed');
    expect(summary?.proposed_by, 'confirmed appointment summary should remain contractor-proposed for existing cards').toBe('contractor');
    expect(new Date(summary!.proposed_at).toISOString()).toBe(new Date(windows.find(window => window.status === 'accepted')!.starts_at).toISOString());

    const staleAccept = await homeowner.client.rpc('servsync_accept_service_request_appointment_window', {
      p_window_id: proposed.window_ids[1],
    });
    await expectRpcDenied(staleAccept, 'superseded appointment window should not be accepted');

    const acceptedCount = windows.filter(window => window.status === 'accepted').length;
    expect(acceptedCount, 'only one window should be accepted for the request').toBe(1);
  });

  test('contractor proposes one and three windows from the request card while UI bounds stay enforced', async ({ page }) => {
    const oneWindowRequest = await createServiceRequestRecord(homeowner, contractorId, 'UI One Window');
    const threeWindowRequest = await createServiceRequestRecord(homeowner, contractorId, 'UI Three Windows');
    const closedRequest = await createServiceRequestRecord(homeowner, contractorId, 'UI Closed No Proposal');
    const declinedRequest = await createServiceRequestRecord(homeowner, contractorId, 'UI Declined No Proposal');
    createdRequestIds.push(oneWindowRequest.requestId, threeWindowRequest.requestId, closedRequest.requestId, declinedRequest.requestId);

    const closeResult = await homeowner.client.rpc('servsync_homeowner_update_service_request', {
      p_request_id: closedRequest.requestId,
      p_body: 'Closing this sandbox-only scheduling UI probe request.',
      p_action: 'close',
    });
    expect(closeResult.error, 'homeowner should close UI no-proposal request').toBeNull();

    const declineResult = await owner.client.rpc('servsync_contractor_update_service_request', {
      p_request_id: declinedRequest.requestId,
      p_body: 'Declining this sandbox-only scheduling UI probe request.',
      p_new_status: 'declined',
      p_quote_amount_cents: null,
      p_quote_scope: null,
      p_closing_summary: null,
    });
    expect(declineResult.error, 'contractor should decline UI no-proposal request').toBeNull();

    await loginAs(page, 'contractor');

    const oneWindowCard = await openRequestCard(page, 'contractor-service-request-card', oneWindowRequest.title);
    await expect(oneWindowCard.getByTestId('homeowner-accept-appointment-window')).toHaveCount(0);
    await oneWindowCard.getByTestId('contractor-propose-appointment-windows-toggle').click();
    const oneWindowForm = oneWindowCard.getByTestId('contractor-appointment-window-form');
    await expect(oneWindowForm).toBeVisible();
    await expect(oneWindowForm.getByTestId('contractor-remove-appointment-window-0')).toHaveCount(0);
    await oneWindowForm.getByTestId('contractor-submit-appointment-windows').click();
    await expect(oneWindowForm.getByText('Option 1: choose a start and end time.')).toBeVisible();

    const oneWindow = futureWindowInputValues(1, 31)[0];
    await oneWindowForm.getByTestId('contractor-appointment-window-start-0').fill(oneWindow.startsAt);
    await oneWindowForm.getByTestId('contractor-appointment-window-end-0').fill(oneWindow.endsAt);
    await oneWindowForm.getByTestId('contractor-appointment-window-note').fill('Sandbox UI one-window proposal.');
    await oneWindowForm.getByTestId('contractor-submit-appointment-windows').click();
    await expect(oneWindowCard.getByTestId('service-request-appointment-windows')).toBeVisible({ timeout: 30_000 });
    await expect(oneWindowCard.getByText('Option 1')).toBeVisible();

    const threeWindowCard = await openRequestCard(page, 'contractor-service-request-card', threeWindowRequest.title);
    await threeWindowCard.getByTestId('contractor-propose-appointment-windows-toggle').click();
    const threeWindowForm = threeWindowCard.getByTestId('contractor-appointment-window-form');
    await threeWindowForm.getByTestId('contractor-add-appointment-window').click();
    await threeWindowForm.getByTestId('contractor-add-appointment-window').click();
    await expect(threeWindowForm.getByTestId('contractor-add-appointment-window')).toHaveCount(0);

    const threeWindows = futureWindowInputValues(3, 34);
    for (const [index, window] of threeWindows.entries()) {
      await threeWindowForm.getByTestId(`contractor-appointment-window-start-${index}`).fill(window.startsAt);
      await threeWindowForm.getByTestId(`contractor-appointment-window-end-${index}`).fill(window.endsAt);
    }
    await threeWindowForm.getByTestId('contractor-submit-appointment-windows').click();
    const threeWindowPanel = threeWindowCard.getByTestId('service-request-appointment-windows');
    await expect(threeWindowPanel).toBeVisible({ timeout: 30_000 });
    await expect(threeWindowPanel.getByText('Option 3')).toBeVisible();
    await expect(threeWindowPanel.getByTestId('homeowner-accept-appointment-window')).toHaveCount(0);

    await page.getByRole('button', { name: /Closed/i }).first().click();
    const closedCard = await openRequestCard(page, 'contractor-service-request-card', closedRequest.title);
    await expect(closedCard.getByTestId('contractor-propose-appointment-windows-toggle')).toHaveCount(0);
    const declinedCard = await openRequestCard(page, 'contractor-service-request-card', declinedRequest.title);
    await expect(declinedCard.getByTestId('contractor-propose-appointment-windows-toggle')).toHaveCount(0);
  });

  test('homeowner accepts and declines proposed appointment windows from request cards', async ({ page }) => {
    const acceptRequest = await createServiceRequestRecord(homeowner, contractorId, 'UI Accept Window');
    const declineRequest = await createServiceRequestRecord(homeowner, contractorId, 'UI Decline Window');
    createdRequestIds.push(acceptRequest.requestId, declineRequest.requestId);
    await proposeWindows(owner, acceptRequest.requestId, 2, 37);
    await proposeWindows(owner, declineRequest.requestId, 1, 40);

    await loginAs(page, 'homeowner');

    const acceptCard = await openRequestCard(page, 'homeowner-service-request-card', acceptRequest.title);
    await expect(acceptCard.getByTestId('contractor-appointment-window-proposal')).toHaveCount(0);
    const acceptWindows = acceptCard.getByTestId('service-request-appointment-windows');
    await expect(acceptWindows.getByText('Choose a visit time or decline any time that does not work.')).toBeVisible();
    await expect(acceptWindows.getByTestId('homeowner-accept-appointment-window')).toHaveCount(2);
    await acceptWindows.getByTestId('homeowner-accept-appointment-window').first().click();
    await expect(acceptCard.getByText('Confirmed', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(acceptCard.getByTestId('service-request-appointment-windows')).toHaveCount(0);

    const acceptedSummary = await requestAppointment(homeowner, acceptRequest.requestId);
    expect(acceptedSummary?.status, 'UI accepted window should become confirmed appointment summary').toBe('confirmed');

    const declineCard = await openRequestCard(page, 'homeowner-service-request-card', declineRequest.title);
    const declineWindows = declineCard.getByTestId('service-request-appointment-windows');
    await declineWindows.getByTestId('homeowner-decline-appointment-window-note').fill('That time does not work for this sandbox probe.');
    await declineWindows.getByTestId('homeowner-decline-appointment-window').click();
    await expect(declineCard.getByTestId('service-request-appointment-windows')).toHaveCount(0, { timeout: 30_000 });
    const declinedWindows = await requestWindows(homeowner, declineRequest.requestId);
    expect(declinedWindows.filter(window => window.status === 'declined')).toHaveLength(1);
  });

  test('homeowner cannot accept a proposed window after the request is closed', async () => {
    const requestId = await createServiceRequest(homeowner, contractorId, 'Closed Accept');
    createdRequestIds.push(requestId);
    const proposed = await proposeWindows(owner, requestId, 1, 24);

    const closeResult = await homeowner.client.rpc('servsync_homeowner_update_service_request', {
      p_request_id: requestId,
      p_body: 'Closing this sandbox-only scheduling probe request.',
      p_action: 'close',
    });
    expect(closeResult.error, 'homeowner should close own service request').toBeNull();

    const acceptClosedResult = await homeowner.client.rpc('servsync_accept_service_request_appointment_window', {
      p_window_id: proposed.window_ids[0],
    });
    await expectRpcDenied(acceptClosedResult, 'closed request appointment window should not be accepted');

    const windows = await requestWindows(homeowner, requestId);
    expect(windows.filter(window => window.status === 'accepted')).toHaveLength(0);
  });

  test('decline/cancel/reschedule lifecycle keeps current appointment until replacement is accepted', async () => {
    const declineRequestId = await createServiceRequest(homeowner, contractorId, 'Decline');
    createdRequestIds.push(declineRequestId);
    const declineBatch = await proposeWindows(owner, declineRequestId, 1, 12);
    const declineResult = await homeowner.client.rpc('servsync_decline_service_request_appointment_window', {
      p_window_id: declineBatch.window_ids[0],
      p_note: 'Not available then.',
    });
    expect(declineResult.error, 'homeowner should decline own proposed window').toBeNull();

    const declinedAccept = await homeowner.client.rpc('servsync_accept_service_request_appointment_window', {
      p_window_id: declineBatch.window_ids[0],
    });
    await expectRpcDenied(declinedAccept, 'declined appointment window should not be accepted');

    const requestId = await createServiceRequest(homeowner, contractorId, 'Reschedule');
    createdRequestIds.push(requestId);
    const initial = await proposeWindows(owner, requestId, 2, 13);
    await homeowner.client.rpc('servsync_accept_service_request_appointment_window', {
      p_window_id: initial.window_ids[0],
    });
    const originalSummary = await requestAppointment(homeowner, requestId);
    expect(originalSummary?.status).toBe('confirmed');

    const rescheduleResult = await owner.client.rpc('servsync_reschedule_service_request_appointment', {
      p_request_id: requestId,
      p_windows: futureWindows(2, 14),
      p_reason: 'Need to move this visit.',
    });
    expect(rescheduleResult.error, 'owner should propose replacement windows').toBeNull();

    const summaryDuringReschedule = await requestAppointment(homeowner, requestId);
    expect(summaryDuringReschedule?.id, 'reschedule should keep existing confirmed appointment active').toBe(originalSummary?.id);
    expect(new Date(summaryDuringReschedule!.proposed_at).toISOString()).toBe(new Date(originalSummary!.proposed_at).toISOString());

    const proposedReplacement = (await requestWindows(homeowner, requestId)).find(window => window.status === 'proposed');
    expect(proposedReplacement?.id, 'replacement proposal should exist').toBeTruthy();
    const replacementAccept = await homeowner.client.rpc('servsync_accept_service_request_appointment_window', {
      p_window_id: proposedReplacement!.id,
    });
    expect(replacementAccept.error, 'homeowner should accept replacement appointment window').toBeNull();
    const replacedSummary = await requestAppointment(homeowner, requestId);
    expect(new Date(replacedSummary!.proposed_at).toISOString()).toBe(new Date(proposedReplacement!.starts_at).toISOString());

    if (fieldTech) {
      const result = await fieldTech.client.rpc('servsync_cancel_service_request_appointment', {
        p_request_id: requestId,
        p_reason: 'field tech denied',
      });
      await expectRpcDenied(result, 'field tech should not cancel appointment');
    }

    if (viewer) {
      const result = await viewer.client.rpc('servsync_cancel_service_request_appointment', {
        p_request_id: requestId,
        p_reason: 'viewer denied',
      });
      await expectRpcDenied(result, 'viewer should not cancel appointment');
    }

    const cancelResult = await owner.client.rpc('servsync_cancel_service_request_appointment', {
      p_request_id: requestId,
      p_reason: 'Cancelled from sandbox probe.',
    });
    expect(cancelResult.error, 'owner should cancel appointment').toBeNull();
    const cancelledSummary = await requestAppointment(homeowner, requestId);
    expect(cancelledSummary?.status).toBe('cancelled');

    for (const actor of [
      { label: 'admin', account: admin },
      { label: 'office', account: office },
    ]) {
      if (!actor.account) {
        console.log(`[FB-021 scheduling probe] ${actor.label} fixture is not configured; skipping positive ${actor.label} reschedule/cancel coverage.`);
        continue;
      }

      const actorRequestId = await createServiceRequest(homeowner, contractorId, `${actor.label} Reschedule Cancel`);
      createdRequestIds.push(actorRequestId);
      const actorInitial = await proposeWindows(owner, actorRequestId, 1, actor.label === 'admin' ? 25 : 28);
      const actorAccept = await homeowner.client.rpc('servsync_accept_service_request_appointment_window', {
        p_window_id: actorInitial.window_ids[0],
      });
      expect(actorAccept.error, `${actor.label} fixture setup appointment should be accepted`).toBeNull();

      const actorReschedule = await actor.account.client.rpc('servsync_reschedule_service_request_appointment', {
        p_request_id: actorRequestId,
        p_windows: futureWindows(2, actor.label === 'admin' ? 26 : 29),
        p_reason: `${actor.label} reschedule probe`,
      });
      expect(actorReschedule.error, `${actor.label} should reschedule appointment`).toBeNull();

      const actorCancel = await actor.account.client.rpc('servsync_cancel_service_request_appointment', {
        p_request_id: actorRequestId,
        p_reason: `${actor.label} cancel probe`,
      });
      expect(actorCancel.error, `${actor.label} should cancel appointment`).toBeNull();
      const actorSummary = await requestAppointment(homeowner, actorRequestId);
      expect(actorSummary?.status, `${actor.label} cancel should update appointment summary`).toBe('cancelled');
    }
  });

  test('direct table mutation is denied while connected parties can read window and event history', async () => {
    const requestId = await createServiceRequest(homeowner, contractorId, 'Direct Denial');
    createdRequestIds.push(requestId);
    const proposed = await proposeWindows(owner, requestId, 1, 15);

    const directInsert = await owner.client
      .from('service_request_appointment_windows')
      .insert({
        request_id: requestId,
        contractor_id: contractorId,
        starts_at: futureWindows(1, 16)[0].starts_at,
        ends_at: futureWindows(1, 16)[0].ends_at,
        status: 'proposed',
        proposal_batch_id: randomUUID(),
      })
      .select('id')
      .single();
    expect(directInsert.error, 'direct appointment window insert should be denied').toBeTruthy();

    const directUpdate = await owner.client
      .from('service_request_appointment_windows')
      .update({ status: 'cancelled' })
      .eq('id', proposed.window_ids[0]);
    expect(directUpdate.error, 'direct appointment window update should be denied').toBeTruthy();

    const directDelete = await owner.client
      .from('service_request_appointment_windows')
      .delete()
      .eq('id', proposed.window_ids[0]);
    expect(directDelete.error, 'direct appointment window delete should be denied').toBeTruthy();

    const directEventInsert = await owner.client
      .from('service_request_appointment_events')
      .insert({
        request_id: requestId,
        contractor_id: contractorId,
        event_type: 'windows_proposed',
      })
      .select('id')
      .single();
    expect(directEventInsert.error, 'direct appointment event insert should be denied').toBeTruthy();

    const windows = await requestWindows(homeowner, requestId);
    expect(windows).toHaveLength(1);

    const events = await requestEvents(homeowner, requestId);
    expect(events.some(event => event.event_type === 'windows_proposed')).toBe(true);

    const proposedEvent = events.find(event => event.event_type === 'windows_proposed');
    expect(proposedEvent?.id, 'windows_proposed event should exist for direct-delete denial probe').toBeTruthy();
    const directEventDelete = await owner.client
      .from('service_request_appointment_events')
      .delete()
      .eq('id', proposedEvent!.id);
    expect(directEventDelete.error, 'direct appointment event delete should be denied').toBeTruthy();
  });
});
