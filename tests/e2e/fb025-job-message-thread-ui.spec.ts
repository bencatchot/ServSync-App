import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { escapeRegExp } from './helpers/customers';
import { credentialsFor, requiredEnv, type TestCredentials } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const PROBE_ENABLED = process.env.FB025_JOB_MESSAGE_THREAD_UI === 'true';
const CONTRACTOR_ROLE_ENV = {
  admin: {
    email: 'TEST_CONTRACTOR_ADMIN_EMAIL',
    password: 'TEST_CONTRACTOR_ADMIN_PASSWORD',
  },
  office: {
    email: 'TEST_CONTRACTOR_OFFICE_EMAIL',
    password: 'TEST_CONTRACTOR_OFFICE_PASSWORD',
  },
  field_tech: {
    email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL',
    password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD',
  },
  viewer: {
    email: 'TEST_CONTRACTOR_VIEWER_EMAIL',
    password: 'TEST_CONTRACTOR_VIEWER_PASSWORD',
  },
} as const;

type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
};

type CreatedContext = {
  requestId: string;
  requestTitle: string;
  estimateId: string;
  estimateTitle: string;
  inspectionId: string;
};

function appContextOptions() {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  return {
    baseURL: process.env.TEST_APP_URL,
    extraHTTPHeaders: bypass
      ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' }
      : undefined,
    viewport: { width: 1440, height: 1000 },
  };
}

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run FB-025 job message UI probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`FB-025 job message UI probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

async function signInWithCredentials(credentials: { email: string; password: string }): Promise<AuthenticatedClient> {
  const { url, anonKey } = requireSandboxSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword(credentials);
  expect(error, 'sandbox API login should succeed').toBeNull();
  expect(data.user?.id, 'sandbox API user should be present').toBeTruthy();

  return { client, userId: data.user!.id };
}

function contractorRoleCredentials(role: keyof typeof CONTRACTOR_ROLE_ENV): TestCredentials {
  const env = CONTRACTOR_ROLE_ENV[role];
  return {
    email: requiredEnv(env.email),
    password: requiredEnv(env.password),
  };
}

async function loginAsContractorWithCredentials(page: Page, credentials: TestCredentials) {
  await page.goto('/#/contractor');
  const authMain = page.getByRole('main');
  await expect(authMain.getByRole('heading', { name: /^Sign in$/i })).toBeVisible();
  await authMain.getByLabel(/^Email$/i).fill(credentials.email);
  await authMain.getByLabel(/^Password$/i).fill(credentials.password);
  await authMain.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
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

async function createEligibleJobThreadContext(homeowner: AuthenticatedClient, owner: AuthenticatedClient, contractorId: string): Promise<CreatedContext> {
  const suffix = Date.now().toString(36);
  const connectionId = await activeConnectionId(homeowner, contractorId);
  const homeId = await primaryHomeId(homeowner);
  const requestTitle = `Codex FB-025 Job Thread UI Request ${suffix}`;
  const estimateTitle = `Codex FB-025 Job Thread UI Estimate ${suffix}`;

  const requestResult = await homeowner.client.rpc('servsync_create_service_request', {
    p_connection_id: connectionId,
    p_category: 'General Maintenance',
    p_urgency: 'normal',
    p_title: requestTitle,
    p_description: 'Sandbox-only FB-025 job message UI probe request.',
    p_home_id: homeId,
  });
  expect(requestResult.error, 'homeowner should create service request for job thread UI probe').toBeNull();
  const requestId = (requestResult.data as { request_id?: string } | null)?.request_id;
  expect(requestId, 'created service request id should be returned').toBeTruthy();

  const estimateResult = await owner.client
    .from('estimates')
    .insert({
      contractor_id: contractorId,
      homeowner_user_id: homeowner.userId,
      service_request_id: requestId,
      home_id: homeId,
      title: estimateTitle,
      scope: 'Sandbox-only accepted estimate for FB-025 job thread UI.',
      status: 'accepted',
      subtotal_cents: 10000,
      total_cents: 10000,
    })
    .select('id')
    .single();
  expect(estimateResult.error, 'contractor owner should create accepted estimate fixture').toBeNull();
  const estimateId = estimateResult.data!.id as string;

  const lineResult = await owner.client
    .from('estimate_line_items')
    .insert({
      estimate_id: estimateId,
      line_type: 'labor',
      description: 'FB-025 job thread UI probe line',
      quantity: 1,
      unit: 'job',
      unit_price_cents: 10000,
      sort_order: 0,
    });
  expect(lineResult.error, 'contractor owner should create estimate line fixture').toBeNull();

  const jobResult = await owner.client.rpc('servsync_create_job_from_estimate', {
    p_estimate_id: estimateId,
  });
  expect(jobResult.error, 'contractor owner should create job from accepted estimate fixture').toBeNull();
  const inspectionId = (jobResult.data as { job_id?: string } | null)?.job_id;
  expect(inspectionId, 'created job id should be returned').toBeTruthy();

  const seededMessage = await owner.client.rpc('servsync_send_workflow_message', {
    p_context_type: 'job',
    p_body: 'Contractor seeded job message for UI probe.',
    p_service_request_id: null,
    p_inspection_id: inspectionId,
  });
  expect(seededMessage.error, 'contractor owner should seed a job workflow message').toBeNull();

  return { requestId: requestId!, requestTitle, estimateId, estimateTitle, inspectionId: inspectionId! };
}

async function freshRolePage(browser: Browser, role: 'contractor' | 'homeowner') {
  const context = await browser.newContext(appContextOptions());
  const page = await context.newPage();
  if (role === 'contractor') {
    await page.addInitScript(() => {
      window.localStorage.setItem('servsync.contractor.jobsView', 'open_jobs');
    });
  }
  const consoleErrors = captureMajorConsoleErrors(page);
  await loginAs(page, role);
  await dismissTourIfVisible(page);
  return { context, page, consoleErrors };
}

async function freshContractorPage(browser: Browser, credentials: TestCredentials) {
  const context = await browser.newContext(appContextOptions());
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.localStorage.setItem('servsync.contractor.jobsView', 'open_jobs');
  });
  const consoleErrors = captureMajorConsoleErrors(page);
  await loginAsContractorWithCredentials(page, credentials);
  await dismissTourIfVisible(page);
  return { context, page, consoleErrors };
}

async function dismissTourIfVisible(page: Page) {
  const skipTour = page.getByRole('button', { name: /^Skip Tour$/i });
  for (let attempts = 0; attempts < 3; attempts += 1) {
    if (!(await skipTour.first().isVisible({ timeout: 500 }).catch(() => false))) return;
    await skipTour.first().click({ force: true });
  }
}

async function openHomeownerJobThread(page: Page, requestTitle: string) {
  const main = page.getByRole('main');
  await openSidebarTab(page, /Service Requests/i);
  await expectActiveTabHeading(page, /^Service Requests$/i);
  const requestButton = main.getByRole('button').filter({ hasText: requestTitle }).first();
  await expect(requestButton).toBeVisible({ timeout: 30_000 });
  await requestButton.click();
  await expect(main.getByText(/Thread · \d+ messages?/i)).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId('workflow-activity-timeline').first()).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId('workflow-message-thread').first()).toBeVisible({ timeout: 30_000 });
}

async function openContractorJobThread(page: Page, estimateTitle: string) {
  const main = page.getByRole('main');
  await openSidebarTab(page, /^Jobs\b/i);
  await expectActiveTabHeading(page, /^Jobs$/i);
  await dismissTourIfVisible(page);
  const openJobsTile = main.getByRole('button', { name: /Open Jobs/i }).first();
  if (await openJobsTile.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await openJobsTile.click();
  }
  const jobRow = main.getByTestId('contractor-job-row').filter({ hasText: estimateTitle }).first();
  await expect(jobRow).toBeVisible({ timeout: 30_000 });
  await jobRow.getByRole('button', { name: /Continue Job|View Job/i }).click();
  await expect(main.getByRole('heading', { level: 2, name: new RegExp(escapeRegExp(estimateTitle), 'i') })).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId('workflow-activity-timeline').first()).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId('workflow-message-thread').first()).toBeVisible({ timeout: 30_000 });
}

async function expectActivityTimelineBasics(page: Page, labels: string[]) {
  const timeline = page.getByRole('main').getByTestId('workflow-activity-timeline').first();
  await expect(timeline).toBeVisible({ timeout: 30_000 });
  await expect(timeline.getByText('System updates', { exact: true })).toBeVisible();
  for (const label of labels) {
    await expect(timeline.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(timeline.getByText(/email|sms|push|unread/i)).toHaveCount(0);
}

async function sendUiMessage(page: Page, body: string) {
  const main = page.getByRole('main');
  const thread = main.getByTestId('workflow-message-thread').first();
  await thread.getByTestId('workflow-message-input').fill(body);
  const response = page.waitForResponse(
    candidate => candidate.url().includes('/rpc/servsync_send_workflow_message'),
    { timeout: 30_000 },
  );
  await thread.getByTestId('workflow-message-send').click();
  expect((await response).ok()).toBeTruthy();
  await expect(thread.getByText(body)).toBeVisible({ timeout: 30_000 });
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

function cleanupSandboxRecords(contexts: CreatedContext[]) {
  const linkedProjectRef = projectRefForSandboxSql();
  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing FB-025 job message UI cleanup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }

  const requestClause = quoteUuidList(contexts.map(context => context.requestId)) || 'null::uuid';
  const estimateClause = quoteUuidList(contexts.map(context => context.estimateId)) || 'null::uuid';
  const inspectionClause = quoteUuidList(contexts.map(context => context.inspectionId)) || 'null::uuid';

  execFileSync(
    'supabase',
    [
      'db',
      'query',
      '--linked',
      `
begin;
delete from public.workflow_thread_reads
 where service_request_id in (${requestClause})
    or inspection_id in (${inspectionClause});
delete from public.workflow_activity_events
 where service_request_id in (${requestClause})
    or inspection_id in (${inspectionClause});
delete from public.workflow_messages
 where service_request_id in (${requestClause})
    or inspection_id in (${inspectionClause});
delete from public.job_work_items where inspection_id in (${inspectionClause});
delete from public.estimate_line_items where estimate_id in (${estimateClause});
update public.estimates set inspection_id = null where id in (${estimateClause});
delete from public.inspections where id in (${inspectionClause});
delete from public.estimates where id in (${estimateClause});
delete from public.notifications where request_id in (${requestClause});
delete from public.service_request_appointment_events where request_id in (${requestClause});
delete from public.service_request_appointment_windows where request_id in (${requestClause});
delete from public.service_request_appointments where request_id in (${requestClause});
delete from public.service_request_media where request_id in (${requestClause});
delete from public.service_request_messages where request_id in (${requestClause});
delete from public.service_requests where id in (${requestClause});
commit;
      `.trim(),
    ],
    { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
  );
}

test.describe('FB-025 sandbox job message thread UI probes', () => {
  const createdContexts: CreatedContext[] = [];

  test.beforeAll(() => {
    test.skip(
      !PROBE_ENABLED,
      'Set FB025_JOB_MESSAGE_THREAD_UI=true to run these sandbox-mutating job message thread UI probes.',
    );
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();
  });

  test.afterAll(() => {
    if (!PROBE_ENABLED || createdContexts.length === 0) return;
    cleanupSandboxRecords(createdContexts);
  });

  test('homeowner and contractor share the same eligible job thread UI', async ({ browser }, testInfo: TestInfo) => {
    test.setTimeout(90_000);
    const homeowner = await signInWithCredentials(credentialsFor('homeowner'));
    const owner = await signInWithCredentials(credentialsFor('contractor'));
    const contractorId = await contractorProfileId(owner);
    const context = await createEligibleJobThreadContext(homeowner, owner, contractorId);
    createdContexts.push(context);

    const homeownerPage = await freshRolePage(browser, 'homeowner');
    await openHomeownerJobThread(homeownerPage.page, context.requestTitle);
    await expectActivityTimelineBasics(homeownerPage.page, ['Request submitted', 'Estimate approved']);
    await expect(homeownerPage.page.getByText('Contractor seeded job message for UI probe.')).toBeVisible();
    await sendUiMessage(homeownerPage.page, 'Homeowner job-thread UI reply.');
    await homeownerPage.consoleErrors.assertClean(testInfo);
    await homeownerPage.context.close();

    const contractorPage = await freshContractorPage(browser, credentialsFor('contractor'));
    await openContractorJobThread(contractorPage.page, context.estimateTitle);
    await expectActivityTimelineBasics(contractorPage.page, ['Request submitted', 'Estimate approved', 'Job created']);
    await expect(contractorPage.page.getByText('Homeowner job-thread UI reply.')).toBeVisible({ timeout: 30_000 });
    await sendUiMessage(contractorPage.page, 'Contractor job-thread UI reply.');
    await expect(contractorPage.page.getByTestId('workflow-message-readonly-notice')).toHaveCount(0);
    await contractorPage.consoleErrors.assertClean(testInfo);
    await contractorPage.context.close();

    for (const role of ['admin', 'office'] as const) {
      const rolePage = await freshContractorPage(browser, contractorRoleCredentials(role));
      await openContractorJobThread(rolePage.page, context.estimateTitle);
      await expectActivityTimelineBasics(rolePage.page, ['Request submitted', 'Estimate approved', 'Job created']);
      await expect(rolePage.page.getByText('Homeowner job-thread UI reply.')).toBeVisible({ timeout: 30_000 });
      await sendUiMessage(rolePage.page, `${role} job-thread UI reply.`);
      await expect(rolePage.page.getByTestId('workflow-message-readonly-notice')).toHaveCount(0);
      await rolePage.consoleErrors.assertClean(testInfo);
      await rolePage.context.close();
    }

    for (const role of ['field_tech', 'viewer'] as const) {
      const rolePage = await freshContractorPage(browser, contractorRoleCredentials(role));
      await openContractorJobThread(rolePage.page, context.estimateTitle);
      await expectActivityTimelineBasics(rolePage.page, ['Request submitted', 'Estimate approved', 'Job created']);
      await expect(rolePage.page.getByText('Homeowner job-thread UI reply.')).toBeVisible({ timeout: 30_000 });
      await expect(rolePage.page.getByTestId('workflow-message-readonly-notice')).toBeVisible();
      await expect(rolePage.page.getByTestId('workflow-message-composer')).toHaveCount(0);
      await rolePage.consoleErrors.assertClean(testInfo);
      await rolePage.context.close();
    }

    await homeowner.client.auth.signOut();
    await owner.client.auth.signOut();
  });
});
