import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const PROBE_ENABLED = process.env.FB025_WORKFLOW_COMMUNICATION_FOUNDATION === 'true';

type ContractorProbeRole = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | 'contractorB';

type AuthenticatedClient = {
  client: SupabaseClient;
  role: ContractorProbeRole | 'homeowner' | 'homeownerB';
  userId: string;
};

type WorkflowMessageRow = {
  id: string;
  context_type: string;
  service_request_id: string | null;
  inspection_id: string | null;
  contractor_id: string;
  homeowner_user_id: string;
  sender_user_id: string;
  sender_role: string;
  body: string;
};

type WorkflowActivityRow = {
  id: string;
  context_type: string;
  event_type: string;
  service_request_id: string | null;
  inspection_id: string | null;
  contractor_id: string;
  homeowner_user_id: string | null;
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
    throw new Error('Refusing to run FB-025 workflow communication probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`FB-025 workflow communication probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
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
  expect(process.env[env.email]?.trim(), `${env.email} must be configured for ${role} FB-025 probe`).toBeTruthy();
  expect(process.env[env.password]?.trim(), `${env.password} must be configured for ${role} FB-025 probe`).toBeTruthy();
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

async function createServiceRequest(homeowner: AuthenticatedClient, contractorId: string, label: string) {
  const connectionId = await activeConnectionId(homeowner, contractorId);
  const homeId = await primaryHomeId(homeowner);
  const title = `Codex FB-025 Workflow ${label} ${Date.now().toString(36)}`;
  const result = await homeowner.client.rpc('servsync_create_service_request', {
    p_connection_id: connectionId,
    p_category: 'General Maintenance',
    p_urgency: 'normal',
    p_title: title,
    p_description: 'Sandbox-only FB-025 workflow communication foundation probe request.',
    p_home_id: homeId,
  });

  expect(result.error, 'homeowner should create FB-025 probe service request').toBeNull();
  const requestId = (result.data as { request_id?: string } | null)?.request_id;
  expect(requestId, 'created service request id should be returned').toBeTruthy();
  return { requestId: requestId!, title };
}

async function createJob(owner: AuthenticatedClient, homeowner: AuthenticatedClient, contractorId: string, requestId: string, label: string) {
  const title = `Codex FB-025 Workflow Job ${label} ${Date.now().toString(36)}`;
  const result = await owner.client
    .from('inspections')
    .insert({
      contractor_id: contractorId,
      homeowner_user_id: homeowner.userId,
      service_request_id: requestId,
      name: title,
      summary: 'Sandbox-only FB-025 workflow communication probe job.',
      status: 'draft',
      job_status: 'draft',
      rooms_with_findings: [],
    })
    .select('id')
    .single();

  expect(result.error, 'contractor owner should create draft inspection-backed job probe').toBeNull();
  expect(result.data?.id, 'created job id should be returned').toBeTruthy();
  return { inspectionId: result.data!.id as string, title };
}

async function sendWorkflowMessage(
  account: AuthenticatedClient,
  context: { type: 'service_request'; serviceRequestId: string } | { type: 'job'; inspectionId: string },
  body: string,
) {
  const result = await account.client.rpc('servsync_send_workflow_message', {
    p_context_type: context.type,
    p_body: body,
    p_service_request_id: context.type === 'service_request' ? context.serviceRequestId : null,
    p_inspection_id: context.type === 'job' ? context.inspectionId : null,
  });

  expect(result.error, `${account.role} should send ${context.type} workflow message`).toBeNull();
  const message = result.data as WorkflowMessageRow | null;
  expect(message?.id, `${account.role} inserted workflow message should be returned`).toBeTruthy();
  return message!;
}

async function expectWorkflowMessageVisible(account: AuthenticatedClient, messageId: string, label: string) {
  const result = await account.client
    .from('workflow_messages')
    .select('*')
    .eq('id', messageId)
    .maybeSingle();

  expect(result.error, `${label} lookup should not error`).toBeNull();
  expect(result.data?.id, label).toBe(messageId);
  return result.data as WorkflowMessageRow;
}

async function expectWorkflowMessageHidden(account: AuthenticatedClient, messageId: string, label: string) {
  const result = await account.client
    .from('workflow_messages')
    .select('id')
    .eq('id', messageId)
    .maybeSingle();

  expect(result.error, `${label} lookup should not error`).toBeNull();
  expect(result.data, label).toBeNull();
}

async function expectWorkflowActivityVisible(account: AuthenticatedClient, messageId: string, label: string) {
  const result = await account.client
    .from('workflow_activity_events')
    .select('*')
    .contains('metadata', { workflow_message_id: messageId })
    .maybeSingle();

  expect(result.error, `${label} activity lookup should not error`).toBeNull();
  expect(result.data?.id, label).toBeTruthy();
  return result.data as WorkflowActivityRow;
}

async function expectWorkflowActivityHidden(account: AuthenticatedClient, messageId: string, label: string) {
  const result = await account.client
    .from('workflow_activity_events')
    .select('id')
    .contains('metadata', { workflow_message_id: messageId })
    .maybeSingle();

  expect(result.error, `${label} activity lookup should not error`).toBeNull();
  expect(result.data, label).toBeNull();
}

async function expectRpcDenied(result: { error: { message?: string } | null }, label: string) {
  expect(result.error, label).toBeTruthy();
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

function cleanupSandboxRecords(requestIds: string[], inspectionIds: string[]) {
  const linkedProjectRef = projectRefForSandboxSql();
  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing FB-025 sandbox cleanup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }

  const requestList = quoteUuidList(requestIds);
  const inspectionList = quoteUuidList(inspectionIds);
  const requestClause = requestList || 'null::uuid';
  const inspectionClause = inspectionList || 'null::uuid';

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
delete from public.notifications where request_id in (${requestClause});
delete from public.service_request_appointment_events where request_id in (${requestClause});
delete from public.service_request_appointment_windows where request_id in (${requestClause});
delete from public.service_request_appointments where request_id in (${requestClause});
delete from public.service_request_media where request_id in (${requestClause});
delete from public.service_request_messages where request_id in (${requestClause});
delete from public.inspections where id in (${inspectionClause});
delete from public.service_requests where id in (${requestClause});
commit;
      `.trim(),
    ],
    { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
  );
}

test.describe('FB-025 sandbox workflow communication foundation probes', () => {
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
  const createdInspectionIds: string[] = [];

  test.beforeAll(async () => {
    test.skip(
      !PROBE_ENABLED,
      'Set FB025_WORKFLOW_COMMUNICATION_FOUNDATION=true to run these sandbox-mutating workflow communication foundation probes.',
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
    if (!PROBE_ENABLED) return;
    cleanupSandboxRecords(createdRequestIds, createdInspectionIds);
    await signOutAll([owner, homeowner, homeownerB, contractorB, admin, office, fieldTech, viewer]);
  });

  test('eligible homeowners and contractor billing-office roles can send request and job workflow messages', async () => {
    const request = await createServiceRequest(homeowner, contractorId, 'Allowed Messages');
    createdRequestIds.push(request.requestId);
    const job = await createJob(owner, homeowner, contractorId, request.requestId, 'Allowed Messages');
    createdInspectionIds.push(job.inspectionId);

    const homeownerRequestMessage = await sendWorkflowMessage(homeowner, { type: 'service_request', serviceRequestId: request.requestId }, 'Homeowner request-thread message.');
    expect(homeownerRequestMessage.sender_role).toBe('homeowner');
    await expectWorkflowMessageVisible(owner, homeownerRequestMessage.id, 'contractor owner should read homeowner request message');

    const ownerRequestMessage = await sendWorkflowMessage(owner, { type: 'service_request', serviceRequestId: request.requestId }, 'Contractor owner request-thread reply.');
    expect(ownerRequestMessage.sender_role).toBe('contractor');
    await expectWorkflowMessageVisible(homeowner, ownerRequestMessage.id, 'homeowner should read contractor request reply');

    const homeownerJobMessage = await sendWorkflowMessage(homeowner, { type: 'job', inspectionId: job.inspectionId }, 'Homeowner job-thread message.');
    expect(homeownerJobMessage.sender_role).toBe('homeowner');
    await expectWorkflowMessageVisible(owner, homeownerJobMessage.id, 'contractor owner should read homeowner job message');

    const ownerJobMessage = await sendWorkflowMessage(owner, { type: 'job', inspectionId: job.inspectionId }, 'Contractor owner job-thread reply.');
    expect(ownerJobMessage.sender_role).toBe('contractor');
    await expectWorkflowMessageVisible(homeowner, ownerJobMessage.id, 'homeowner should read contractor job reply');

    for (const actor of [
      { label: 'admin', account: admin },
      { label: 'office', account: office },
    ]) {
      if (!actor.account) {
        console.log(`[FB-025 workflow probe] ${actor.label} fixture is not configured; skipping positive ${actor.label} send coverage.`);
        continue;
      }

      const requestMessage = await sendWorkflowMessage(actor.account, { type: 'service_request', serviceRequestId: request.requestId }, `${actor.label} request-thread reply.`);
      expect(requestMessage.sender_role).toBe('contractor');
      const jobMessage = await sendWorkflowMessage(actor.account, { type: 'job', inspectionId: job.inspectionId }, `${actor.label} job-thread reply.`);
      expect(jobMessage.sender_role).toBe('contractor');
    }
  });

  test('unrelated users and read-only contractor roles cannot send or read workflow messages', async () => {
    const request = await createServiceRequest(homeowner, contractorId, 'Denied Messages');
    createdRequestIds.push(request.requestId);
    const job = await createJob(owner, homeowner, contractorId, request.requestId, 'Denied Messages');
    createdInspectionIds.push(job.inspectionId);
    const visibleMessage = await sendWorkflowMessage(homeowner, { type: 'service_request', serviceRequestId: request.requestId }, 'Private workflow message.');

    const otherHomeownerSend = await homeownerB.client.rpc('servsync_send_workflow_message', {
      p_context_type: 'service_request',
      p_body: 'Other homeowner should not send.',
      p_service_request_id: request.requestId,
      p_inspection_id: null,
    });
    await expectRpcDenied(otherHomeownerSend, 'unrelated homeowner should not send request workflow message');

    const otherContractorSend = await contractorB.client.rpc('servsync_send_workflow_message', {
      p_context_type: 'service_request',
      p_body: 'Other contractor should not send.',
      p_service_request_id: request.requestId,
      p_inspection_id: null,
    });
    await expectRpcDenied(otherContractorSend, 'unrelated contractor should not send request workflow message');

    const otherContractorJobSend = await contractorB.client.rpc('servsync_send_workflow_message', {
      p_context_type: 'job',
      p_body: 'Other contractor should not send job message.',
      p_service_request_id: null,
      p_inspection_id: job.inspectionId,
    });
    await expectRpcDenied(otherContractorJobSend, 'unrelated contractor should not send job workflow message');

    if (fieldTech) {
      const fieldTechSend = await fieldTech.client.rpc('servsync_send_workflow_message', {
        p_context_type: 'service_request',
        p_body: 'Field tech should be read-only for homeowner-visible workflow messages.',
        p_service_request_id: request.requestId,
        p_inspection_id: null,
      });
      await expectRpcDenied(fieldTechSend, 'field tech should not send homeowner-visible workflow messages in v1');
      await expectWorkflowMessageVisible(fieldTech, visibleMessage.id, 'field tech should still read eligible workflow message');
    }

    if (viewer) {
      const viewerSend = await viewer.client.rpc('servsync_send_workflow_message', {
        p_context_type: 'job',
        p_body: 'Viewer should be read-only for workflow messages.',
        p_service_request_id: null,
        p_inspection_id: job.inspectionId,
      });
      await expectRpcDenied(viewerSend, 'viewer should not send homeowner-visible workflow messages in v1');
      await expectWorkflowMessageVisible(viewer, visibleMessage.id, 'viewer should still read eligible workflow message');
    }

    await expectWorkflowMessageHidden(homeownerB, visibleMessage.id, 'unrelated homeowner should not read workflow message');
    await expectWorkflowMessageHidden(contractorB, visibleMessage.id, 'unrelated contractor should not read workflow message');
  });

  test('direct spoofing, cold messaging, and cross-user read markers are denied', async () => {
    const request = await createServiceRequest(homeowner, contractorId, 'Spoof Denial');
    createdRequestIds.push(request.requestId);
    const message = await sendWorkflowMessage(homeowner, { type: 'service_request', serviceRequestId: request.requestId }, 'Read marker probe message.');

    const directSpoof = await homeowner.client
      .from('workflow_messages')
      .insert({
        context_type: 'service_request',
        service_request_id: request.requestId,
        contractor_id: contractorId,
        homeowner_user_id: homeowner.userId,
        sender_user_id: owner.userId,
        sender_role: 'contractor',
        body: 'Spoofed direct insert should be denied.',
      })
      .select('id')
      .single();
    expect(directSpoof.error, 'direct workflow message insert should be denied').toBeTruthy();

    const coldMessage = await owner.client.rpc('servsync_send_workflow_message', {
      p_context_type: 'service_request',
      p_body: 'Cold message without a workflow context should be denied.',
      p_service_request_id: null,
      p_inspection_id: null,
    });
    await expectRpcDenied(coldMessage, 'contractor cold message without service request/job context should be denied');

    const ownRead = await homeowner.client.rpc('servsync_mark_workflow_thread_read', {
      p_context_type: 'service_request',
      p_service_request_id: request.requestId,
      p_inspection_id: null,
    });
    expect(ownRead.error, 'homeowner should mark own eligible request thread read').toBeNull();
    expect((ownRead.data as { user_id?: string } | null)?.user_id).toBe(homeowner.userId);

    const otherRead = await homeownerB.client.rpc('servsync_mark_workflow_thread_read', {
      p_context_type: 'service_request',
      p_service_request_id: request.requestId,
      p_inspection_id: null,
    });
    await expectRpcDenied(otherRead, 'unrelated homeowner should not mark another request thread read');

    const directReadUpdate = await owner.client
      .from('workflow_thread_reads')
      .update({ user_id: owner.userId })
      .eq('user_id', homeowner.userId)
      .eq('service_request_id', request.requestId);
    expect(directReadUpdate.error, 'direct workflow thread read update should be denied').toBeTruthy();

    await expectWorkflowMessageVisible(owner, message.id, 'owner should still read original message after denied spoof probes');
  });

  test('activity events are append-only and visible only to eligible workflow parties', async () => {
    const request = await createServiceRequest(homeowner, contractorId, 'Activity Events');
    createdRequestIds.push(request.requestId);
    const message = await sendWorkflowMessage(owner, { type: 'service_request', serviceRequestId: request.requestId }, 'Contractor activity event message.');
    const event = await expectWorkflowActivityVisible(homeowner, message.id, 'homeowner should read contractor message activity event');

    expect(event.context_type).toBe('service_request');
    expect(event.event_type).toBe('contractor_message_sent');
    await expectWorkflowActivityVisible(owner, message.id, 'contractor owner should read own message activity event');
    await expectWorkflowActivityHidden(homeownerB, message.id, 'unrelated homeowner should not read workflow activity event');
    await expectWorkflowActivityHidden(contractorB, message.id, 'unrelated contractor should not read workflow activity event');

    const directEventInsert = await owner.client
      .from('workflow_activity_events')
      .insert({
        context_type: 'service_request',
        service_request_id: request.requestId,
        contractor_id: contractorId,
        homeowner_user_id: homeowner.userId,
        event_type: 'service_request_submitted',
        metadata: {},
      })
      .select('id')
      .single();
    expect(directEventInsert.error, 'direct workflow activity insert should be denied').toBeTruthy();

    const directEventUpdate = await owner.client
      .from('workflow_activity_events')
      .update({ event_type: 'invoice_paid' })
      .eq('id', event.id);
    expect(directEventUpdate.error, 'direct workflow activity update should be denied').toBeTruthy();

    const directEventDelete = await owner.client
      .from('workflow_activity_events')
      .delete()
      .eq('id', event.id);
    expect(directEventDelete.error, 'direct workflow activity delete should be denied').toBeTruthy();
  });
});
