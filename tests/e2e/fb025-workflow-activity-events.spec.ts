import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const PROBE_ENABLED = process.env.FB025_WORKFLOW_ACTIVITY_EVENTS === 'true';

type AuthenticatedClient = {
  client: SupabaseClient;
  role: 'owner' | 'homeowner' | 'homeownerB' | 'contractorB';
  userId: string;
};

type WorkflowActivityEvent = {
  id: string;
  context_type: string;
  event_type: string;
  service_request_id: string | null;
  inspection_id: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
  appointment_id: string | null;
  contractor_id: string;
  homeowner_user_id: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run FB-025 workflow activity event probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`FB-025 workflow activity event probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
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

async function signInAs(role: AuthenticatedClient['role']): Promise<AuthenticatedClient> {
  if (role === 'owner') return signInWithCredentials(role, credentialsFor('contractor'));
  if (role === 'homeowner') return signInWithCredentials(role, credentialsFor('homeowner'));
  if (role === 'homeownerB') return signInWithCredentials(role, credentialsFor('homeownerB'));
  return signInWithCredentials(role, credentialsFor('contractorB'));
}

async function signOutAll(accounts: Array<AuthenticatedClient | null | undefined>) {
  await Promise.all(accounts.filter(Boolean).map(account => account!.client.auth.signOut().catch(() => undefined)));
}

async function contractorProfileId(account: AuthenticatedClient): Promise<string> {
  const own = await account.client
    .from('contractor_profiles')
    .select('id')
    .eq('owner_user_id', account.userId)
    .maybeSingle();

  expect(own.error, 'Contractor profile owner lookup should not error').toBeNull();
  if (own.data?.id) return own.data.id as string;

  const { data, error } = await account.client.rpc('servsync_current_contractor_profile');
  expect(error, 'Current contractor profile RPC should not error').toBeNull();
  const profile = Array.isArray(data) ? data[0] : data;
  expect(profile?.id, 'Contractor profile should exist in sandbox').toBeTruthy();
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

async function createServiceRequest(homeowner: AuthenticatedClient, contractorId: string, label: string) {
  const connectionId = await activeConnectionId(homeowner, contractorId);
  const homeId = await primaryHomeId(homeowner);
  const title = `Codex FB-025 Activity ${label} ${Date.now().toString(36)}`;
  const result = await homeowner.client.rpc('servsync_create_service_request', {
    p_connection_id: connectionId,
    p_category: 'General Maintenance',
    p_urgency: 'normal',
    p_title: title,
    p_description: 'Sandbox-only FB-025 workflow activity event writer probe request.',
    p_home_id: homeId,
  });

  expect(result.error, 'homeowner should create FB-025 activity probe service request').toBeNull();
  const requestId = (result.data as { request_id?: string } | null)?.request_id;
  expect(requestId, 'created service request id should be returned').toBeTruthy();
  return { requestId: requestId!, title };
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

async function createSentEstimate(owner: AuthenticatedClient, contractorId: string, homeownerId: string, requestId: string, label: string) {
  const result = await owner.client
    .from('estimates')
    .insert({
      contractor_id: contractorId,
      homeowner_user_id: homeownerId,
      service_request_id: requestId,
      title: `Codex FB-025 Activity Estimate ${label} ${Date.now().toString(36)}`,
      scope: 'Sandbox-only FB-025 workflow activity estimate.',
      status: 'sent',
      subtotal_cents: 10000,
      total_cents: 10000,
    })
    .select('id')
    .single();

  expect(result.error, `${label} sent estimate insert should succeed`).toBeNull();
  expect(result.data?.id, `${label} estimate id should be returned`).toBeTruthy();
  return result.data!.id as string;
}

async function createDraftInvoice(
  owner: AuthenticatedClient,
  contractorId: string,
  homeownerId: string,
  requestId: string,
  jobId: string | null,
  estimateId: string | null,
  label: string,
) {
  const result = await owner.client
    .from('invoices')
    .insert({
      contractor_id: contractorId,
      homeowner_user_id: homeownerId,
      service_request_id: requestId,
      job_id: jobId,
      estimate_id: estimateId,
      invoice_number: `FB025-${label}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      title: `Codex FB-025 Activity Invoice ${label}`,
      scope: 'Sandbox-only FB-025 workflow activity invoice.',
      status: 'draft',
      subtotal_cents: 10000,
      total_cents: 10000,
    })
    .select('id')
    .single();

  expect(result.error, `${label} draft invoice insert should succeed`).toBeNull();
  expect(result.data?.id, `${label} invoice id should be returned`).toBeTruthy();
  return result.data!.id as string;
}

async function fetchEvents(
  account: AuthenticatedClient,
  filter: {
    eventType: string;
    sourceRpc?: string;
    serviceRequestId?: string;
    inspectionId?: string;
    estimateId?: string;
    invoiceId?: string;
    appointmentId?: string;
  },
) {
  let query = account.client
    .from('workflow_activity_events')
    .select('*')
    .eq('event_type', filter.eventType);

  if (filter.sourceRpc) query = query.contains('metadata', { source_rpc: filter.sourceRpc });
  if (filter.serviceRequestId) query = query.eq('service_request_id', filter.serviceRequestId);
  if (filter.inspectionId) query = query.eq('inspection_id', filter.inspectionId);
  if (filter.estimateId) query = query.eq('estimate_id', filter.estimateId);
  if (filter.invoiceId) query = query.eq('invoice_id', filter.invoiceId);
  if (filter.appointmentId) query = query.eq('appointment_id', filter.appointmentId);

  const result = await query.order('created_at', { ascending: true });
  expect(result.error, `${filter.eventType} activity lookup should not error`).toBeNull();
  return (result.data ?? []) as WorkflowActivityEvent[];
}

async function expectSingleEvent(account: AuthenticatedClient, filter: Parameters<typeof fetchEvents>[1], label: string) {
  const events = await fetchEvents(account, filter);
  expect(events, label).toHaveLength(1);
  return events[0];
}

async function expectNoEvent(account: AuthenticatedClient, eventId: string, label: string) {
  const result = await account.client
    .from('workflow_activity_events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle();

  expect(result.error, `${label} lookup should not error`).toBeNull();
  expect(result.data, label).toBeNull();
}

function projectRefForSandboxSql() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  return existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';
}

function sourceFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
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

function cleanupSandboxRecords(ids: {
  requestIds: string[];
  inspectionIds: string[];
  estimateIds: string[];
  invoiceIds: string[];
}) {
  const linkedProjectRef = projectRefForSandboxSql();
  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing FB-025 activity sandbox cleanup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }

  const requestClause = quoteUuidList(ids.requestIds) || 'null::uuid';
  const inspectionClause = quoteUuidList(ids.inspectionIds) || 'null::uuid';
  const estimateClause = quoteUuidList(ids.estimateIds) || 'null::uuid';
  const invoiceClause = quoteUuidList(ids.invoiceIds) || 'null::uuid';

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
    or inspection_id in (${inspectionClause})
    or estimate_id in (${estimateClause})
    or invoice_id in (${invoiceClause});
delete from public.workflow_messages
 where service_request_id in (${requestClause})
    or inspection_id in (${inspectionClause});
delete from public.notifications
 where request_id in (${requestClause})
    or estimate_id in (${estimateClause})
    or invoice_id in (${invoiceClause});
delete from public.service_request_appointment_events where request_id in (${requestClause});
delete from public.service_request_appointment_windows where request_id in (${requestClause});
delete from public.service_request_appointments where request_id in (${requestClause});
delete from public.invoice_backlog_items where invoice_id in (${invoiceClause});
delete from public.invoice_line_items where invoice_id in (${invoiceClause});
delete from public.invoices where id in (${invoiceClause});
delete from public.job_work_items where inspection_id in (${inspectionClause});
delete from public.estimate_line_items where estimate_id in (${estimateClause});
delete from public.estimates where id in (${estimateClause});
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

test.describe('FB-021 durable appointment Activity source-static coverage', () => {
  test('SQL patch extends only the workflow Activity event type allowlist and preserves existing event types', () => {
    const sql = sourceFile('servsync-fb021-reschedule-cancel-activity-events.sql');
    const existingWriterSql = sourceFile('servsync-fb025-workflow-activity-event-writers.sql');
    const expectedEventTypes = [
      'service_request_submitted',
      'homeowner_message_sent',
      'contractor_message_sent',
      'appointment_proposed',
      'appointment_confirmed',
      'appointment_reschedule_proposed',
      'appointment_cancelled',
      'estimate_sent',
      'estimate_approved',
      'estimate_declined',
      'job_created',
      'job_completed',
      'invoice_sent',
      'invoice_paid',
      'invoice_voided',
      'report_shared',
      'photo_shared',
    ];

    expect(sql).toContain('workflow_activity_events_event_type_check');
    expect(sql).toContain('drop constraint if exists workflow_activity_events_event_type_check');
    for (const eventType of expectedEventTypes) {
      expect(sql, `workflow Activity event type ${eventType} should remain allowed`).toContain(`'${eventType}'`);
    }
    expect(sql.match(/appointment_reschedule_proposed/g)?.length || 0).toBeGreaterThanOrEqual(3);
    expect(sql.match(/appointment_cancelled/g)?.length || 0).toBeGreaterThanOrEqual(3);
    expect(existingWriterSql, 'existing proposal writer should remain the source pattern').toContain('appointment_proposed');
    expect(existingWriterSql, 'existing confirmation writer should remain the source pattern').toContain('appointment_confirmed');
  });

  test('SQL patch writes reschedule and cancel Activity rows only from trusted RPCs with duplicate prevention', () => {
    const sql = sourceFile('servsync-fb021-reschedule-cancel-activity-events.sql');

    expect(sql).toContain("'public.servsync_reschedule_service_request_appointment(uuid, jsonb, text)'::regprocedure");
    expect(sql).toContain("'public.servsync_cancel_service_request_appointment(uuid, text)'::regprocedure");
    expect(sql).toContain("where wae.event_type = ''appointment_reschedule_proposed''");
    expect(sql).toContain("and wae.service_request_id = v_request.id");
    expect(sql).toContain("and wae.metadata @> jsonb_build_object(''proposal_batch_id'', v_batch_id)");
    expect(sql).toContain("where wae.event_type = ''appointment_cancelled''");
    expect(sql).toContain("and wae.appointment_id = v_appointment.id");
    expect(sql).toContain('if v_appointment.id is not null and not exists');
    expect(sql).toContain("p_actor_user_id => auth.uid()");
    expect(sql).toContain("p_event_type => ''appointment_reschedule_proposed''");
    expect(sql).toContain("p_event_type => ''appointment_cancelled''");
  });

  test('SQL patch keeps metadata minimal and avoids notification, calendar, reminder, and private note behavior', () => {
    const sql = sourceFile('servsync-fb021-reschedule-cancel-activity-events.sql');
    const appendBlocks = sql
      .split('perform public.servsync_append_workflow_activity_event')
      .slice(1)
      .map(block => block.split(');')[0]);
    expect(appendBlocks, 'patch should add exactly two durable Activity appends').toHaveLength(2);

    const serializedBlocks = appendBlocks.join('\n');
    for (const expectedMetadataKey of [
      'source_rpc',
      'proposal_batch_id',
      'window_count',
      'existing_confirmed_appointment_preserved',
      'cancelled_window_count',
    ]) {
      expect(serializedBlocks).toContain(expectedMetadataKey);
    }
    for (const forbidden of [
      'p_reason',
      'event_note',
      'window_ids',
      'contractor_note',
      'homeowner_response_note',
      'notification_id',
      'calendar_event_id',
      'reminder_id',
    ]) {
      expect(serializedBlocks).not.toContain(forbidden);
    }
    expect(sql).not.toContain('insert into public.notifications');
    expect(sql).not.toContain('contractor_calendar_events');
    expect(sql).not.toContain('home_reminders');
  });

  test('Activity timeline maps reschedule/cancel events with conservative copy and no broad scheduling claims', () => {
    const timelineSource = sourceFile('src/features/workflow/WorkflowActivityTimelineWithDurableEvents.tsx');

    expect(timelineSource).toContain("| 'appointment_reschedule_proposed'");
    expect(timelineSource).toContain("| 'appointment_cancelled'");
    expect(timelineSource).toContain("'appointment_reschedule_proposed',");
    expect(timelineSource).toContain("'appointment_cancelled',");
    expect(timelineSource).toContain('Replacement visit times proposed');
    expect(timelineSource).toContain('The contractor proposed new visit options. The current appointment stays scheduled until a new time is accepted.');
    expect(timelineSource).toContain('Appointment canceled');
    expect(timelineSource).toContain('The appointment was canceled. The service request may still remain open.');
    expect(timelineSource).toContain('appointment_reschedule_proposed:${event.service_request_id}:${metadataString');
    expect(timelineSource).toContain('appointment_cancelled:${event.appointment_id}');

    for (const forbiddenCopy of [
      'notification',
      'reminder',
      'calendar sync',
      'dispatch',
      'routing',
      'GPS',
      'self-booking',
      'request was closed',
    ]) {
      expect(timelineSource).not.toContain(forbiddenCopy);
    }
  });

  test('source-static guardrails preserve existing Activity RLS posture and avoid lifecycle broadening', () => {
    const sql = sourceFile('servsync-fb021-reschedule-cancel-activity-events.sql');
    const schedulingSql = sourceFile('servsync-fb021-scheduling-foundation.sql');

    expect(sql).toContain('revoke all on function public.servsync_append_workflow_activity_event');
    expect(sql).not.toContain('grant insert on table public.workflow_activity_events');
    expect(sql).not.toContain('grant update on table public.workflow_activity_events');
    expect(sql).not.toContain('grant delete on table public.workflow_activity_events');
    expect(sql).not.toContain('create policy');
    expect(sql).not.toContain('alter table public.service_request_appointment_windows');
    expect(sql).not.toContain('alter table public.service_request_appointments');
    expect(schedulingSql).toContain('servsync_reschedule_service_request_appointment');
    expect(schedulingSql).toContain('servsync_cancel_service_request_appointment');
  });
});

test.describe('FB-025 sandbox workflow activity event writer probes', () => {
  let owner: AuthenticatedClient;
  let homeowner: AuthenticatedClient;
  let homeownerB: AuthenticatedClient;
  let contractorB: AuthenticatedClient;
  let contractorId = '';
  const requestIds: string[] = [];
  const inspectionIds: string[] = [];
  const estimateIds: string[] = [];
  const invoiceIds: string[] = [];

  test.beforeAll(async () => {
    test.skip(
      !PROBE_ENABLED,
      'Set FB025_WORKFLOW_ACTIVITY_EVENTS=true to run these sandbox-mutating workflow activity event writer probes.',
    );
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();

    owner = await signInAs('owner');
    homeowner = await signInAs('homeowner');
    homeownerB = await signInAs('homeownerB');
    contractorB = await signInAs('contractorB');
    contractorId = await contractorProfileId(owner);
  });

  test.afterAll(async () => {
    if (!PROBE_ENABLED) return;
    cleanupSandboxRecords({ requestIds, inspectionIds, estimateIds, invoiceIds });
    await signOutAll([owner, homeowner, homeownerB, contractorB]);
  });

  test('trusted lifecycle RPCs append durable activity events once and preserve RLS boundaries', async () => {
    const request = await createServiceRequest(homeowner, contractorId, 'Writers');
    requestIds.push(request.requestId);

    const proposal = await owner.client.rpc('servsync_propose_service_request_appointment_windows', {
      p_request_id: request.requestId,
      p_windows: futureWindows(2),
      p_note: 'Sandbox-only FB-025 activity proposal.',
    });
    expect(proposal.error, 'contractor should propose appointment windows').toBeNull();
    const windowIds = (proposal.data as { window_ids?: string[] } | null)?.window_ids ?? [];
    expect(windowIds.length, 'proposal should return window ids').toBe(2);
    const proposedEvent = await expectSingleEvent(owner, {
      eventType: 'appointment_proposed',
      sourceRpc: 'servsync_propose_service_request_appointment_windows',
      serviceRequestId: request.requestId,
    }, 'appointment proposal should append one durable activity event');
    expect(proposedEvent.metadata.window_count).toBe(2);
    await expectSingleEvent(homeowner, {
      eventType: 'appointment_proposed',
      sourceRpc: 'servsync_propose_service_request_appointment_windows',
      serviceRequestId: request.requestId,
    }, 'homeowner should read appointment proposal activity');
    await expectNoEvent(homeownerB, proposedEvent.id, 'unrelated homeowner should not read appointment proposal activity');
    await expectNoEvent(contractorB, proposedEvent.id, 'unrelated contractor should not read appointment proposal activity');

    const accept = await homeowner.client.rpc('servsync_accept_service_request_appointment_window', {
      p_window_id: windowIds[0],
    });
    expect(accept.error, 'homeowner should accept appointment window').toBeNull();
    const appointmentId = (accept.data as { appointment_id?: string } | null)?.appointment_id;
    expect(appointmentId, 'appointment id should be returned').toBeTruthy();
    const confirmedEvent = await expectSingleEvent(owner, {
      eventType: 'appointment_confirmed',
      sourceRpc: 'servsync_accept_service_request_appointment_window',
      serviceRequestId: request.requestId,
      appointmentId,
    }, 'appointment acceptance should append one durable activity event');
    await expectNoEvent(homeownerB, confirmedEvent.id, 'unrelated homeowner should not read appointment confirmed activity');

    const acceptAgain = await homeowner.client.rpc('servsync_accept_service_request_appointment_window', {
      p_window_id: windowIds[0],
    });
    expect(acceptAgain.error, 'second appointment acceptance should be denied').toBeTruthy();
    await expectSingleEvent(owner, {
      eventType: 'appointment_confirmed',
      sourceRpc: 'servsync_accept_service_request_appointment_window',
      serviceRequestId: request.requestId,
      appointmentId,
    }, 'second failed appointment acceptance should not duplicate activity');

    const acceptedEstimateId = await createSentEstimate(owner, contractorId, homeowner.userId, request.requestId, 'Accepted');
    estimateIds.push(acceptedEstimateId);
    const acceptEstimate = await homeowner.client.rpc('servsync_homeowner_respond_to_estimate', {
      p_estimate_id: acceptedEstimateId,
      p_action: 'accept',
    });
    expect(acceptEstimate.error, 'homeowner should accept sent estimate').toBeNull();
    const approvedEvent = await expectSingleEvent(owner, {
      eventType: 'estimate_approved',
      sourceRpc: 'servsync_homeowner_respond_to_estimate',
      estimateId: acceptedEstimateId,
    }, 'estimate acceptance should append one approved activity event');
    await expectNoEvent(contractorB, approvedEvent.id, 'unrelated contractor should not read estimate approved activity');
    const acceptEstimateAgain = await homeowner.client.rpc('servsync_homeowner_respond_to_estimate', {
      p_estimate_id: acceptedEstimateId,
      p_action: 'accept',
    });
    expect(acceptEstimateAgain.error, 'second estimate acceptance should be denied').toBeTruthy();
    await expectSingleEvent(owner, {
      eventType: 'estimate_approved',
      sourceRpc: 'servsync_homeowner_respond_to_estimate',
      estimateId: acceptedEstimateId,
    }, 'second failed estimate acceptance should not duplicate activity');

    const declinedEstimateId = await createSentEstimate(owner, contractorId, homeowner.userId, request.requestId, 'Declined');
    estimateIds.push(declinedEstimateId);
    const declineEstimate = await homeowner.client.rpc('servsync_homeowner_respond_to_estimate', {
      p_estimate_id: declinedEstimateId,
      p_action: 'decline',
    });
    expect(declineEstimate.error, 'homeowner should decline sent estimate').toBeNull();
    await expectSingleEvent(homeowner, {
      eventType: 'estimate_declined',
      sourceRpc: 'servsync_homeowner_respond_to_estimate',
      estimateId: declinedEstimateId,
    }, 'estimate decline should append one declined activity event visible to homeowner');

    const createJob = await owner.client.rpc('servsync_create_job_from_estimate', {
      p_estimate_id: acceptedEstimateId,
    });
    expect(createJob.error, 'contractor should create job from accepted estimate').toBeNull();
    const jobId = (createJob.data as { job_id?: string; created?: boolean } | null)?.job_id;
    expect(jobId, 'job id should be returned').toBeTruthy();
    expect((createJob.data as { created?: boolean } | null)?.created, 'first job conversion should create a new job').toBe(true);
    inspectionIds.push(jobId!);
    await expectSingleEvent(owner, {
      eventType: 'job_created',
      sourceRpc: 'servsync_create_job_from_estimate',
      inspectionId: jobId,
    }, 'new job conversion should append one job-created activity event');
    const createJobAgain = await owner.client.rpc('servsync_create_job_from_estimate', {
      p_estimate_id: acceptedEstimateId,
    });
    expect(createJobAgain.error, 'second job conversion should return existing job').toBeNull();
    expect((createJobAgain.data as { created?: boolean } | null)?.created, 'second job conversion should not create a new job').toBe(false);
    await expectSingleEvent(owner, {
      eventType: 'job_created',
      sourceRpc: 'servsync_create_job_from_estimate',
      inspectionId: jobId,
    }, 'existing-job conversion path should not duplicate job-created activity');

    const paidInvoiceId = await createDraftInvoice(owner, contractorId, homeowner.userId, request.requestId, jobId!, acceptedEstimateId, 'Paid');
    invoiceIds.push(paidInvoiceId);
    const sendInvoice = await owner.client.rpc('servsync_send_invoice', { p_invoice_id: paidInvoiceId });
    expect(sendInvoice.error, 'contractor should send draft invoice').toBeNull();
    await expectSingleEvent(owner, {
      eventType: 'invoice_sent',
      sourceRpc: 'servsync_send_invoice',
      invoiceId: paidInvoiceId,
    }, 'invoice send should append one invoice-sent activity event');
    const sendInvoiceAgain = await owner.client.rpc('servsync_send_invoice', { p_invoice_id: paidInvoiceId });
    expect(sendInvoiceAgain.error, 'second invoice send should be denied').toBeTruthy();
    await expectSingleEvent(owner, {
      eventType: 'invoice_sent',
      sourceRpc: 'servsync_send_invoice',
      invoiceId: paidInvoiceId,
    }, 'second failed invoice send should not duplicate activity');

    const markPaid = await owner.client.rpc('servsync_mark_invoice_paid', { p_invoice_id: paidInvoiceId });
    expect(markPaid.error, 'contractor should mark sent invoice paid').toBeNull();
    await expectSingleEvent(homeowner, {
      eventType: 'invoice_paid',
      sourceRpc: 'servsync_mark_invoice_paid',
      invoiceId: paidInvoiceId,
    }, 'invoice paid should append one activity event visible to homeowner');
    const markPaidAgain = await owner.client.rpc('servsync_mark_invoice_paid', { p_invoice_id: paidInvoiceId });
    expect(markPaidAgain.error, 'second mark paid should be denied').toBeTruthy();
    await expectSingleEvent(owner, {
      eventType: 'invoice_paid',
      sourceRpc: 'servsync_mark_invoice_paid',
      invoiceId: paidInvoiceId,
    }, 'second failed mark-paid should not duplicate activity');

    const voidInvoiceId = await createDraftInvoice(owner, contractorId, homeowner.userId, request.requestId, jobId!, acceptedEstimateId, 'Void');
    invoiceIds.push(voidInvoiceId);
    const voidInvoice = await owner.client.rpc('servsync_void_invoice', { p_invoice_id: voidInvoiceId });
    expect(voidInvoice.error, 'contractor should void draft invoice').toBeNull();
    await expectSingleEvent(owner, {
      eventType: 'invoice_voided',
      sourceRpc: 'servsync_void_invoice',
      invoiceId: voidInvoiceId,
    }, 'invoice void should append one invoice-voided activity event');
    const voidInvoiceAgain = await owner.client.rpc('servsync_void_invoice', { p_invoice_id: voidInvoiceId });
    expect(voidInvoiceAgain.error, 'second invoice void should be denied').toBeTruthy();
    await expectSingleEvent(owner, {
      eventType: 'invoice_voided',
      sourceRpc: 'servsync_void_invoice',
      invoiceId: voidInvoiceId,
    }, 'second failed invoice void should not duplicate activity');
  });

  test('activity event direct mutation and direct internal append execution remain denied', async () => {
    const request = await createServiceRequest(homeowner, contractorId, 'Direct Denials');
    requestIds.push(request.requestId);

    const directInsert = await owner.client
      .from('workflow_activity_events')
      .insert({
        context_type: 'service_request',
        service_request_id: request.requestId,
        contractor_id: contractorId,
        homeowner_user_id: homeowner.userId,
        event_type: 'invoice_paid',
        metadata: {},
      })
      .select('id')
      .single();
    expect(directInsert.error, 'direct workflow activity insert should be denied').toBeTruthy();

    const directAppend = await owner.client.rpc('servsync_append_workflow_activity_event', {
      p_context_type: 'service_request',
      p_event_type: 'service_request_submitted',
      p_service_request_id: request.requestId,
      p_inspection_id: null,
      p_estimate_id: null,
      p_invoice_id: null,
      p_appointment_id: null,
      p_actor_user_id: owner.userId,
      p_metadata: { source_rpc: 'direct-client-probe' },
    });
    expect(directAppend.error, 'authenticated users should not directly execute internal activity append RPC').toBeTruthy();

    const proposal = await owner.client.rpc('servsync_propose_service_request_appointment_windows', {
      p_request_id: request.requestId,
      p_windows: futureWindows(1, 8),
      p_note: 'Sandbox-only FB-025 activity denial proposal.',
    });
    expect(proposal.error, 'proposal should create an event for direct update/delete denial checks').toBeNull();
    const event = await expectSingleEvent(owner, {
      eventType: 'appointment_proposed',
      sourceRpc: 'servsync_propose_service_request_appointment_windows',
      serviceRequestId: request.requestId,
    }, 'proposal should append one activity event');

    const directUpdate = await owner.client
      .from('workflow_activity_events')
      .update({ event_type: 'invoice_paid' })
      .eq('id', event.id);
    expect(directUpdate.error, 'direct workflow activity update should be denied').toBeTruthy();

    const directDelete = await owner.client
      .from('workflow_activity_events')
      .delete()
      .eq('id', event.id);
    expect(directDelete.error, 'direct workflow activity delete should be denied').toBeTruthy();
  });
});
