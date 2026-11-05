import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentialsFor, requiredEnv, type TestCredentialKey } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';

type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
  email: string;
};

type HomeRole = 'owner' | 'admin' | 'member' | 'viewer';
type SharedRole = Exclude<HomeRole, 'owner'>;

type ProbeIds = {
  home_a_id: string;
  home_b_id: string;
  owner_user_id: string;
  connection_id: string;
  connection_created: boolean;
  shared_property_id: string;
  service_request_a_id: string;
  service_request_b_id: string;
  appointment_window_id: string;
  estimate_id: string;
  estimate_line_item_id: string;
  inspection_id: string;
  job_work_item_id: string;
  invoice_id: string;
  invoice_line_item_id: string;
  workflow_message_id: string;
  workflow_activity_event_id: string;
  maintenance_log_id: string;
  home_reminder_id: string;
  home_document_id: string;
  service_request_media_id: string;
};

type ContractorProfile = {
  id: string;
};

type SharedHomeAddressShell = {
  home_id: string;
  role: SharedRole;
  membership_status: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

type SharedReminderShell = {
  reminder_id: string;
  home_id: string;
  title: string;
  due_on: string | null;
  status: string;
  role: SharedRole;
  membership_status: string;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run FB-030 shared-home boundary probes against production Supabase.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`FB-030 shared-home boundary probes require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing FB-030 shared-home boundary fixture setup because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
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

function optionalUuidLiteral(id?: string) {
  return id ? uuidLiteral(id) : 'null::uuid';
}

function textLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
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

  const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as { rows?: T[] };
  return parsed.rows ?? [];
}

async function signInAs(key: TestCredentialKey): Promise<AuthenticatedClient> {
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

async function contractorProfileFor(account: AuthenticatedClient): Promise<ContractorProfile> {
  const result = await account.client
    .from('contractor_profiles')
    .select('id')
    .eq('owner_user_id', account.userId)
    .limit(1)
    .maybeSingle();

  expect(result.error, 'contractor profile lookup should not error').toBeNull();
  expect(result.data?.id, 'sandbox contractor profile should exist').toBeTruthy();
  return result.data as ContractorProfile;
}

function cleanupProbe(ids?: Partial<ProbeIds>) {
  if (!ids?.home_a_id || !ids.home_b_id) return;

  const homeIds = [ids.home_a_id, ids.home_b_id];
  for (const id of homeIds) assertUuid(id);

  const homeIdList = homeIds.map(uuidLiteral).join(',');
  const ownerUserLiteral = optionalUuidLiteral(ids.owner_user_id);
  const optionalConnectionDelete = ids.connection_created && ids.connection_id
    ? `delete from public.homeowner_contractor_connections where id = ${uuidLiteral(ids.connection_id)};`
    : '';

  runLinkedSandboxSql(`
delete from public.workflow_activity_events
 where id = ${optionalUuidLiteral(ids.workflow_activity_event_id)};
delete from public.workflow_messages
 where id = ${optionalUuidLiteral(ids.workflow_message_id)};
delete from public.service_request_media
 where id = ${optionalUuidLiteral(ids.service_request_media_id)};
delete from public.home_documents
 where id = ${optionalUuidLiteral(ids.home_document_id)};
delete from public.home_reminders
 where id = ${optionalUuidLiteral(ids.home_reminder_id)};
delete from public.home_maintenance_log
 where id = ${optionalUuidLiteral(ids.maintenance_log_id)};
delete from public.invoice_line_items
 where invoice_id = ${optionalUuidLiteral(ids.invoice_id)};
delete from public.job_work_items
 where inspection_id = ${optionalUuidLiteral(ids.inspection_id)};
delete from public.invoices
 where id = ${optionalUuidLiteral(ids.invoice_id)};
delete from public.estimate_line_items
 where estimate_id = ${optionalUuidLiteral(ids.estimate_id)};
delete from public.estimates
 where id = ${optionalUuidLiteral(ids.estimate_id)};
delete from public.service_request_appointment_events
 where request_id in (${optionalUuidLiteral(ids.service_request_a_id)}, ${optionalUuidLiteral(ids.service_request_b_id)});
delete from public.service_request_appointment_windows
 where id = ${optionalUuidLiteral(ids.appointment_window_id)};
delete from public.inspections
 where id = ${optionalUuidLiteral(ids.inspection_id)};
delete from public.service_requests
 where id in (${optionalUuidLiteral(ids.service_request_a_id)}, ${optionalUuidLiteral(ids.service_request_b_id)});
delete from public.connection_shared_properties
 where home_id = any(array[${homeIdList}]::uuid[]);
delete from public.home_membership_email_invites
 where home_id = any(array[${homeIdList}]::uuid[]);
delete from public.home_membership_audit_events
 where home_id = any(array[${homeIdList}]::uuid[]);
delete from public.home_memberships
 where home_id = any(array[${homeIdList}]::uuid[])
   and user_id <> ${ownerUserLiteral};
delete from public.homes
 where id = any(array[${homeIdList}]::uuid[]);
${optionalConnectionDelete}
`);
}

function createProbe(owner: AuthenticatedClient, contractor: AuthenticatedClient, contractorId: string): ProbeIds {
  const prefix = `FB030 boundary ${Date.now().toString(36)}`;
  const rows = runLinkedSandboxJson<ProbeIds>(`
with
home_a as (
  insert into public.homes (
    homeowner_user_id,
    nickname,
    address_line1,
    city,
    state,
    zip_code,
    notes
  ) values (
    ${uuidLiteral(owner.userId)},
    ${textLiteral(`${prefix} Home A`)},
    '123 Boundary A St',
    'Austin',
    'TX',
    '78701',
    ${textLiteral(`${prefix} private home A notes`)}
  )
  returning id
),
home_b as (
  insert into public.homes (
    homeowner_user_id,
    nickname,
    address_line1,
    city,
    state,
    zip_code,
    notes
  ) values (
    ${uuidLiteral(owner.userId)},
    ${textLiteral(`${prefix} Home B`)},
    '456 Boundary B St',
    'Dallas',
    'TX',
    '75201',
    ${textLiteral(`${prefix} private home B notes`)}
  )
  returning id
),
existing_connection as (
  select id, false as created
    from public.homeowner_contractor_connections
   where homeowner_user_id = ${uuidLiteral(owner.userId)}
     and contractor_id = ${uuidLiteral(contractorId)}
   limit 1
),
inserted_connection as (
  insert into public.homeowner_contractor_connections (
    homeowner_user_id,
    contractor_id,
    status,
    source
  )
  select ${uuidLiteral(owner.userId)}, ${uuidLiteral(contractorId)}, 'active', 'fb030_boundary_probe'
   where not exists (select 1 from existing_connection)
  returning id, true as created
),
chosen_connection as (
  select * from existing_connection
  union all
  select * from inserted_connection
  limit 1
),
shared_property as (
  insert into public.connection_shared_properties (
    connection_id,
    home_id,
    share_home_overview,
    share_address,
    share_preferred_vendors,
    share_photos,
    sharing_source
  )
  select cc.id, ha.id, true, true, true, true, 'contextual'
    from chosen_connection cc, home_a ha
  returning id
),
service_request_a as (
  insert into public.service_requests (
    connection_id,
    homeowner_user_id,
    contractor_id,
    home_id,
    category,
    title,
    description,
    status
  )
  select cc.id, ${uuidLiteral(owner.userId)}, ${uuidLiteral(contractorId)}, ha.id, 'General Maintenance', ${textLiteral(`${prefix} private request A`)}, 'Private request details A', 'open'
    from chosen_connection cc, home_a ha
  returning id
),
service_request_b as (
  insert into public.service_requests (
    connection_id,
    homeowner_user_id,
    contractor_id,
    home_id,
    category,
    title,
    description,
    status
  )
  select cc.id, ${uuidLiteral(owner.userId)}, ${uuidLiteral(contractorId)}, hb.id, 'General Maintenance', ${textLiteral(`${prefix} private request B`)}, 'Private request details B', 'open'
    from chosen_connection cc, home_b hb
  returning id
),
appointment_window as (
  insert into public.service_request_appointment_windows (
    request_id,
    contractor_id,
    starts_at,
    ends_at,
    proposal_batch_id,
    proposed_by_user_id
  )
  select id, ${uuidLiteral(contractorId)}, now() + interval '2 days', now() + interval '2 days 2 hours', gen_random_uuid(), ${uuidLiteral(contractor.userId)}
    from service_request_a
  returning id
),
estimate_row as (
  insert into public.estimates (
    contractor_id,
    homeowner_user_id,
    service_request_id,
    home_id,
    title,
    scope,
    notes,
    terms,
    status,
    subtotal_cents,
    total_cents
  )
  select ${uuidLiteral(contractorId)}, ${uuidLiteral(owner.userId)}, sr.id, ha.id, ${textLiteral(`${prefix} private estimate`)}, 'Private estimate scope', 'Private contractor notes', 'Due on completion', 'sent', 12500, 12500
    from service_request_a sr, home_a ha
  returning id
),
estimate_line as (
  insert into public.estimate_line_items (
    estimate_id,
    line_type,
    description,
    line_title,
    customer_description,
    quantity,
    unit,
    unit_price_cents,
    sort_order
  )
  select id, 'labor', 'Private estimate line', 'Private estimate line', 'Customer-safe line', 1, 'each', 12500, 1
    from estimate_row
  returning id
),
inspection_row as (
  insert into public.inspections (
    contractor_id,
    homeowner_user_id,
    service_request_id,
    home_id,
    name,
    summary,
    status,
    rooms_with_findings
  )
  select ${uuidLiteral(contractorId)}, ${uuidLiteral(owner.userId)}, sr.id, ha.id, ${textLiteral(`${prefix} private job`)}, 'Private job summary', 'finalized', '[]'::jsonb
    from service_request_a sr, home_a ha
  returning id
),
job_work_item as (
  insert into public.job_work_items (
    inspection_id,
    contractor_id,
    title,
    description,
    customer_description,
    internal_notes,
    line_type,
    quantity,
    unit,
    unit_price_cents,
    completion_status,
    billing_status
  )
  select id, ${uuidLiteral(contractorId)}, 'Private work item', 'Private work description', 'Customer-safe work description', 'Private internal work notes', 'labor', 1, 'each', 12500, 'completed', 'unbilled'
    from inspection_row
  returning id
),
invoice_row as (
  insert into public.invoices (
    contractor_id,
    homeowner_user_id,
    service_request_id,
    job_id,
    estimate_id,
    home_id,
    invoice_number,
    title,
    scope,
    notes,
    terms,
    status,
    subtotal_cents,
    total_cents,
    issued_at,
    due_at
  )
  select ${uuidLiteral(contractorId)}, ${uuidLiteral(owner.userId)}, sr.id, i.id, e.id, ha.id, ${textLiteral(`FB030-${Date.now()}`)}, ${textLiteral(`${prefix} private invoice`)}, 'Private invoice scope', 'Private invoice notes', 'Manual payment only', 'draft', 12500, 12500, now(), now() + interval '14 days'
    from service_request_a sr, inspection_row i, estimate_row e, home_a ha
  returning id
),
invoice_line as (
  insert into public.invoice_line_items (
    invoice_id,
    job_work_item_id,
    line_type,
    description,
    line_title,
    customer_description,
    quantity,
    unit,
    unit_price_cents,
    sort_order
  )
  select inv.id, jwi.id, 'labor', 'Private invoice line', 'Private invoice line', 'Customer-safe invoice line', 1, 'each', 12500, 1
    from invoice_row inv, job_work_item jwi
  returning id
),
workflow_message as (
  insert into public.workflow_messages (
    context_type,
    service_request_id,
    contractor_id,
    homeowner_user_id,
    sender_user_id,
    sender_role,
    body
  )
  select 'service_request', id, ${uuidLiteral(contractorId)}, ${uuidLiteral(owner.userId)}, ${uuidLiteral(owner.userId)}, 'homeowner', 'Private workflow message'
    from service_request_a
  returning id
),
workflow_activity as (
  insert into public.workflow_activity_events (
    context_type,
    service_request_id,
    contractor_id,
    homeowner_user_id,
    event_type,
    actor_user_id,
    metadata
  )
  select 'service_request', id, ${uuidLiteral(contractorId)}, ${uuidLiteral(owner.userId)}, 'service_request_submitted', ${uuidLiteral(owner.userId)}, jsonb_build_object('probe', ${textLiteral(prefix)})
    from service_request_a
  returning id
),
maintenance_log as (
  insert into public.home_maintenance_log (
    homeowner_user_id,
    home_id,
    service_request_id,
    category,
    title,
    description,
    performed_at,
    contractor_name,
    cost_cents,
    notes
  )
  select ${uuidLiteral(owner.userId)}, ha.id, sr.id, 'Maintenance', ${textLiteral(`${prefix} private history`)}, 'Private history description', current_date, 'Sandbox Contractor', 12500, 'Private history notes'
    from home_a ha, service_request_a sr
  returning id
),
home_reminder as (
  insert into public.home_reminders (
    homeowner_user_id,
    home_id,
    title,
    notes,
    due_on,
    status
  )
  select ${uuidLiteral(owner.userId)}, id, ${textLiteral(`${prefix} shared reminder shell`)}, 'Private reminder notes should not be shared', current_date + 7, 'open'
    from home_a
  returning id
),
home_document as (
  insert into public.home_documents (
    homeowner_user_id,
    home_id,
    storage_path,
    file_name,
    content_type,
    file_size_bytes,
    document_type,
    notes
  )
  select ${uuidLiteral(owner.userId)}, id, ${textLiteral(`${owner.userId}/documents/${prefix.replace(/\s/g, '-')}.pdf`)}, 'private-boundary.pdf', 'application/pdf', 1200, 'other', 'Private document notes'
    from home_a
  returning id
),
service_media as (
  insert into public.service_request_media (
    request_id,
    uploader_user_id,
    storage_path,
    file_name,
    content_type,
    file_size_bytes
  )
  select id, ${uuidLiteral(owner.userId)}, ${textLiteral(`${owner.userId}/fb030-boundary-media.txt`)}, 'private-media.txt', 'text/plain', 100
    from service_request_a
  returning id
)
select
  (select id::text from home_a) as home_a_id,
  (select id::text from home_b) as home_b_id,
  ${uuidLiteral(owner.userId)}::text as owner_user_id,
  (select id::text from chosen_connection) as connection_id,
  (select created from chosen_connection) as connection_created,
  (select id::text from shared_property) as shared_property_id,
  (select id::text from service_request_a) as service_request_a_id,
  (select id::text from service_request_b) as service_request_b_id,
  (select id::text from appointment_window) as appointment_window_id,
  (select id::text from estimate_row) as estimate_id,
  (select id::text from estimate_line) as estimate_line_item_id,
  (select id::text from inspection_row) as inspection_id,
  (select id::text from job_work_item) as job_work_item_id,
  (select id::text from invoice_row) as invoice_id,
  (select id::text from invoice_line) as invoice_line_item_id,
  (select id::text from workflow_message) as workflow_message_id,
  (select id::text from workflow_activity) as workflow_activity_event_id,
  (select id::text from maintenance_log) as maintenance_log_id,
  (select id::text from home_reminder) as home_reminder_id,
  (select id::text from home_document) as home_document_id,
  (select id::text from service_media) as service_request_media_id;
`);

  expect(rows, 'probe fixture should return ids').toHaveLength(1);
  return rows[0];
}

function setSharedMembership(homeId: string, userId: string, role: SharedRole) {
  runLinkedSandboxSql(`
delete from public.home_membership_audit_events
 where home_id = ${uuidLiteral(homeId)}
   and (
     target_user_id = ${uuidLiteral(userId)}
     or actor_user_id = ${uuidLiteral(userId)}
     or membership_id in (
       select id from public.home_memberships
        where home_id = ${uuidLiteral(homeId)}
          and user_id = ${uuidLiteral(userId)}
     )
   );

delete from public.home_memberships
 where home_id = ${uuidLiteral(homeId)}
   and user_id = ${uuidLiteral(userId)};

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

async function helperValue(account: AuthenticatedClient, functionName: string, homeId: string) {
  const result = await account.client.rpc(functionName, { p_home_id: homeId });
  expect(result.error, `${functionName} should not error`).toBeNull();
  return result.data as boolean | string | null;
}

async function membershipIdFor(account: AuthenticatedClient, homeId: string, userId: string) {
  const result = await account.client
    .from('home_memberships')
    .select('id')
    .eq('home_id', homeId)
    .eq('user_id', userId)
    .maybeSingle();

  expect(result.error, 'home membership lookup should not error').toBeNull();
  expect(result.data?.id, 'accepted shared membership should be readable by the member').toBeTruthy();
  return result.data!.id as string;
}

async function expectNoDirectRows(account: AuthenticatedClient, table: string, id: string, label: string) {
  const result = await account.client.from(table).select('id', { count: 'exact' }).eq('id', id);
  if (result.error) {
    expect(result.error.message, `${label} should not fail because the relation is missing`).not.toMatch(/does not exist|schema cache/i);
    return;
  }

  expect(result.data ?? [], label).toHaveLength(0);
  expect(result.count ?? 0, label).toBe(0);
}

async function expectNoDirectMutation(
  account: AuthenticatedClient,
  table: string,
  id: string,
  values: Record<string, unknown>,
  label: string,
) {
  const result = await account.client.from(table).update(values, { count: 'exact' }).eq('id', id);
  if (result.error) {
    expect(result.error.message, `${label} should not fail because the relation is missing`).not.toMatch(/does not exist|schema cache/i);
    return;
  }

  expect(result.count ?? 0, label).toBe(0);
}

async function expectRpcRejected(account: AuthenticatedClient, functionName: string, args: Record<string, unknown>, label: string) {
  const result = await account.client.rpc(functionName, args);
  expect(result.error, label).not.toBeNull();
}

test.describe('FB-030 shared-home security boundary', () => {
  test.beforeEach(() => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();
    requireLinkedSandbox();
  });

  test('accepted shared roles see only approved shells and cannot directly access unapproved owner records', async () => {
    const owner = await signInAs('homeowner');
    const sharedHomeowner = await signInAs('homeownerB');
    const contractor = await signInAs('contractor');
    const accounts = [owner, sharedHomeowner, contractor];
    const contractorProfile = await contractorProfileFor(contractor);
    let ids: ProbeIds | undefined;

    try {
      ids = createProbe(owner, contractor, contractorProfile.id);

      await expect(helperValue(owner, 'current_user_home_role', ids.home_a_id)).resolves.toBe('owner');
      await expect(helperValue(owner, 'current_user_can_access_home', ids.home_a_id)).resolves.toBe(true);
      await expect(helperValue(owner, 'current_user_can_manage_home', ids.home_a_id)).resolves.toBe(true);
      await expect(helperValue(owner, 'current_user_can_approve_home_work', ids.home_a_id)).resolves.toBe(true);
      await expect(helperValue(owner, 'current_user_can_manage_home_connections', ids.home_a_id)).resolves.toBe(true);

      for (const role of ['admin', 'member', 'viewer'] as const) {
        setSharedMembership(ids.home_a_id, sharedHomeowner.userId, role);

        await expect(helperValue(sharedHomeowner, 'current_user_home_role', ids.home_a_id)).resolves.toBe(role);
        await expect(helperValue(sharedHomeowner, 'current_user_can_access_home', ids.home_a_id)).resolves.toBe(true);
        await expect(helperValue(sharedHomeowner, 'current_user_can_manage_home', ids.home_a_id)).resolves.toBe(role === 'admin');
        await expect(helperValue(sharedHomeowner, 'current_user_can_approve_home_work', ids.home_a_id)).resolves.toBe(role === 'admin');
        await expect(helperValue(sharedHomeowner, 'current_user_can_manage_home_connections', ids.home_a_id)).resolves.toBe(role === 'admin');
        await expect(helperValue(sharedHomeowner, 'current_user_can_access_home', ids.home_b_id)).resolves.toBe(false);

        const addressShells = await sharedHomeowner.client.rpc('servsync_list_my_shared_home_address_shells');
        expect(addressShells.error, `${role} shared-home address shell should not error`).toBeNull();
        const shells = (addressShells.data || []) as SharedHomeAddressShell[];
        const homeAShell = shells.find(shell => shell.home_id === ids!.home_a_id);
        expect(homeAShell, `${role} should see the shared Home A shell`).toBeTruthy();
        expect(shells.some(shell => shell.home_id === ids!.home_b_id), `${role} should not see owner-only Home B`).toBe(false);
        expect(homeAShell!.role).toBe(role);
        expect(homeAShell!.membership_status).toBe('active');
        expect(homeAShell!.city).toBe('Austin');
        expect(homeAShell!.state).toBe('TX');
        if (role === 'viewer') {
          expect(homeAShell!.address_line1).toBeNull();
          expect(homeAShell!.address_line2).toBeNull();
          expect(homeAShell!.zip_code).toBeNull();
        } else {
          expect(homeAShell!.address_line1).toBe('123 Boundary A St');
          expect(homeAShell!.zip_code).toBe('78701');
        }

        const reminderShellsResult = await sharedHomeowner.client.rpc('servsync_list_my_shared_home_reminder_shells');
        expect(reminderShellsResult.error, `${role} shared reminder shell should not error`).toBeNull();
        const reminderShells = (reminderShellsResult.data || []) as SharedReminderShell[];
        const reminderShell = reminderShells.find(reminder => reminder.reminder_id === ids!.home_reminder_id);
        expect(reminderShell, `${role} should see the approved read-only reminder shell`).toBeTruthy();
        expect(reminderShell!.title).toContain('shared reminder shell');
        expect(JSON.stringify(reminderShell)).not.toContain('Private reminder notes');

        for (const [table, id] of [
          ['service_requests', ids.service_request_a_id],
          ['service_requests', ids.service_request_b_id],
          ['estimates', ids.estimate_id],
          ['estimate_line_items', ids.estimate_line_item_id],
          ['inspections', ids.inspection_id],
          ['job_work_items', ids.job_work_item_id],
          ['invoices', ids.invoice_id],
          ['invoice_line_items', ids.invoice_line_item_id],
          ['workflow_messages', ids.workflow_message_id],
          ['workflow_activity_events', ids.workflow_activity_event_id],
          ['home_maintenance_log', ids.maintenance_log_id],
          ['home_reminders', ids.home_reminder_id],
          ['home_documents', ids.home_document_id],
          ['service_request_media', ids.service_request_media_id],
          ['homeowner_contractor_connections', ids.connection_id],
          ['connection_shared_properties', ids.shared_property_id],
        ] as const) {
          await expectNoDirectRows(sharedHomeowner, table, id, `${role} should not directly read ${table}`);
        }

        await expectNoDirectMutation(
          sharedHomeowner,
          'service_requests',
          ids.service_request_a_id,
          { title: `FB030 forbidden ${role}` },
          `${role} should not directly mutate service requests`,
        );
        await expectNoDirectMutation(
          sharedHomeowner,
          'home_documents',
          ids.home_document_id,
          { notes: `FB030 forbidden ${role}` },
          `${role} should not directly mutate home documents`,
        );
      }
    } finally {
      cleanupProbe(ids);
      await signOutAll(accounts);
    }
  });

  test('viewer and contractor accounts cannot perform owner-only household, approval, or workflow actions', async () => {
    const owner = await signInAs('homeowner');
    const sharedHomeowner = await signInAs('homeownerB');
    const contractor = await signInAs('contractor');
    const accounts = [owner, sharedHomeowner, contractor];
    const contractorProfile = await contractorProfileFor(contractor);
    let ids: ProbeIds | undefined;

    try {
      ids = createProbe(owner, contractor, contractorProfile.id);
      setSharedMembership(ids.home_a_id, sharedHomeowner.userId, 'viewer');
      const viewerMembershipId = await membershipIdFor(sharedHomeowner, ids.home_a_id, sharedHomeowner.userId);

      await expectRpcRejected(
        sharedHomeowner,
        'servsync_homeowner_respond_to_estimate',
        { p_estimate_id: ids.estimate_id, p_action: 'accept' },
        'viewer shared member should not approve an owner-scoped estimate',
      );
      await expectRpcRejected(
        sharedHomeowner,
        'servsync_accept_service_request_appointment_window',
        { p_window_id: ids.appointment_window_id },
        'viewer shared member should not accept owner-scoped appointment windows',
      );
      await expectRpcRejected(
        sharedHomeowner,
        'servsync_decline_service_request_appointment_window',
        { p_window_id: ids.appointment_window_id, p_note: 'not allowed' },
        'viewer shared member should not decline owner-scoped appointment windows',
      );
      await expectRpcRejected(
        sharedHomeowner,
        'servsync_mark_invoice_paid',
        { p_invoice_id: ids.invoice_id },
        'viewer shared member should not run invoice/payment actions',
      );
      await expectRpcRejected(
        sharedHomeowner,
        'servsync_update_connection_shared_properties',
        {
          p_connection_id: ids.connection_id,
          p_share_contact: true,
          p_property_permissions: [{
            home_id: ids.home_a_id,
            share_home_overview: true,
            share_address: true,
            share_preferred_vendors: true,
            share_photos: true,
          }],
        },
        'viewer shared member should not manage contractor sharing',
      );
      await expectRpcRejected(
        sharedHomeowner,
        'servsync_create_home_membership_email_invite',
        { p_home_id: ids.home_a_id, p_invited_email: `fb030-viewer-${Date.now()}@example.invalid`, p_role: 'viewer' },
        'viewer shared member should not invite household members',
      );
      await expectRpcRejected(
        sharedHomeowner,
        'servsync_revoke_home_membership',
        { p_membership_id: viewerMembershipId },
        'viewer shared member should not revoke household members',
      );

      const contractorInvite = await owner.client.rpc('servsync_create_home_membership_email_invite', {
        p_home_id: ids.home_a_id,
        p_invited_email: contractor.email,
        p_role: 'viewer',
      });
      expect(contractorInvite.error, 'owner should create contractor-addressed invite for denial probe').toBeNull();
      const contractorInviteId = (contractorInvite.data as { id: string }).id;

      const contractorInviteList = await contractor.client.rpc('servsync_list_my_home_membership_email_invites');
      expect(contractorInviteList.error, 'contractor invite list should not error').toBeNull();
      expect(contractorInviteList.data || [], 'contractor account should not list household email invites').toHaveLength(0);
      await expectRpcRejected(
        contractor,
        'servsync_accept_home_membership_email_invite',
        { p_invite_id: contractorInviteId },
        'contractor account should not accept household invite',
      );
      await expectRpcRejected(
        contractor,
        'servsync_create_home_membership_email_invite',
        { p_home_id: ids.home_a_id, p_invited_email: `fb030-contractor-${Date.now()}@example.invalid`, p_role: 'viewer' },
        'contractor account should not manage household invites',
      );
      await expectRpcRejected(
        contractor,
        'servsync_revoke_home_membership',
        { p_membership_id: viewerMembershipId },
        'contractor account should not manage household memberships',
      );

      const contractorShells = await contractor.client.rpc('servsync_list_my_shared_home_address_shells');
      expect(contractorShells.error, 'contractor shared-home shell call should not error').toBeNull();
      expect(contractorShells.data || [], 'contractor relationship should not create household shared-home shell access').toHaveLength(0);
    } finally {
      cleanupProbe(ids);
      await signOutAll(accounts);
    }
  });
});
