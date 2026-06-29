import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';

type CatalogResponse<T> = {
  rows?: T[];
};

type RlsRow = {
  table_name: string;
  exists: boolean;
  rls_enabled: boolean | null;
};

type RpcRow = {
  proname: string;
  function_count: number;
  exists: boolean;
  security_definer: boolean | null;
  search_path_public: boolean | null;
  public_execute: boolean | null;
  anon_execute: boolean | null;
  authenticated_execute: boolean | null;
};

type BucketRow = {
  bucket_id: string;
  exists: boolean;
  is_public: boolean | null;
  expected_public: boolean;
};

type StoragePolicyRow = {
  policy_name: string;
  exists: boolean;
};

const CORE_PRIVATE_TABLES = [
  'profiles',
  'homeowner_profiles',
  'homes',
  'contractor_profiles',
  'homeowner_contractor_connections',
  'connection_permissions',
  'service_requests',
  'service_request_messages',
  'service_request_appointment_windows',
  'service_request_appointment_events',
  'estimates',
  'estimate_line_items',
  'invoices',
  'invoice_line_items',
  'inspections',
  'home_maintenance_log',
  'home_reminders',
  'home_documents',
  'contractor_team_members',
  'job_work_items',
  'invoice_backlog_items',
  'support_inquiries',
  'support_inquiry_messages',
  'notifications',
  'contractor_price_book_items',
  'workflow_messages',
  'workflow_activity_events',
  'workflow_thread_reads',
  'homeowner_contractor_invite_leads',
  'service_request_media',
  'service_request_appointments',
  'connection_shared_properties',
  'connection_request_contexts',
  'contractor_local_contacts',
  'contractor_local_homes',
  'contractor_calendar_events',
  'contractor_visit_events',
  'contractor_team_invites',
  'contractor_saved_estimate_charges',
  'estimate_templates',
  'home_document_upload_reservations',
  'home_document_upload_events',
];

const BROWSER_CALLABLE_SECURITY_DEFINER_RPCS = [
  'current_user_can_manage_contractor_billing',
  'current_user_can_manage_contractor_schedule',
  'current_user_can_send_contractor_workflow_messages',
  'servsync_contractor_pending_connection_requests',
  'servsync_accept_service_request_appointment_window',
  'servsync_cancel_service_request_appointment',
  'servsync_create_invoice_from_job',
  'servsync_create_local_home',
  'servsync_create_job_from_estimate',
  'servsync_create_job_work_item',
  'servsync_create_partial_invoice_from_job',
  'servsync_decline_service_request_appointment_window',
  'servsync_prepare_manual_home_document_upload',
  'servsync_propose_service_request_appointment_windows',
  'servsync_reschedule_service_request_appointment',
  'servsync_register_manual_home_document_upload',
  'servsync_remove_job_work_item',
  'servsync_homeowner_respond_to_estimate',
  'servsync_homeowner_view_invoice',
  'servsync_mark_invoice_paid',
  'servsync_mark_workflow_thread_read',
  'servsync_respond_to_connection_request',
  'servsync_send_invoice',
  'servsync_send_workflow_message',
  'servsync_submit_contextual_connection_request',
  'servsync_sync_simple_job_work_items',
  'servsync_update_local_home',
  'servsync_update_connection_shared_properties',
  'servsync_update_job_work_item',
  'servsync_validate_manual_home_document_upload',
  'servsync_void_invoice',
];

const INTERNAL_ONLY_SECURITY_DEFINER_RPCS = ['servsync_append_workflow_activity_event'];

const STORAGE_BUCKETS = [
  { bucket_id: 'contractor-assets', expected_public: true },
  { bucket_id: 'discover-media', expected_public: true },
  { bucket_id: 'home-documents', expected_public: false },
  { bucket_id: 'inspection-media', expected_public: false },
  { bucket_id: 'service-request-media', expected_public: false },
  { bucket_id: 'support-attachments', expected_public: false },
];

const STORAGE_OBJECT_POLICIES = [
  'home_docs_upload',
  'home_docs_read',
  'home_docs_delete',
  'homeowner_upload_media',
  'contractor_upload_media',
  'service_request_media_read_parties',
  'insp_media_upload',
  'inspection_media_read_parties',
  'insp_media_delete',
  'support_attachments_read_inquiry_participants',
  'support_attachments_upload_inquiry_participants',
  'contractor_assets_insert_public_logo_bucket',
  'discover_media_upload_contractor',
];

function requireLinkedSandbox() {
  const projectRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const linkedProjectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim() : '';

  if (linkedProjectRef !== SANDBOX_SUPABASE_REF) {
    throw new Error(
      `Refusing catalog checks because Supabase CLI is linked to "${linkedProjectRef || 'unknown'}", not sandbox ${SANDBOX_SUPABASE_REF}.`,
    );
  }
}

function sqlValues(values: string[]) {
  return values.map(value => `('${value.replace(/'/g, "''")}')`).join(',');
}

function securityDefinerRpcCatalogQuery(values: string[]) {
  return `
with expected(proname) as (
  values ${sqlValues(values)}
)
select
  e.proname,
  count(p.oid)::int as function_count,
  count(p.oid) > 0 as exists,
  coalesce(bool_and(p.prosecdef) filter (where p.oid is not null), false) as security_definer,
  coalesce(bool_and('search_path=public' = any(p.proconfig)) filter (where p.oid is not null), false) as search_path_public,
  coalesce(bool_or(exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )) filter (where p.oid is not null), false) as public_execute,
  coalesce(bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) filter (where p.oid is not null), false) as anon_execute,
  coalesce(bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) filter (where p.oid is not null), false) as authenticated_execute
from expected e
left join pg_proc p
  on p.proname = e.proname
 and p.pronamespace = 'public'::regnamespace
group by e.proname
order by e.proname;
  `;
}

function runCatalogQuery<T>(sql: string): T[] {
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

test.describe('sandbox security catalog checks', () => {
  test('core private tables have RLS enabled in the linked sandbox', () => {
    const rows = runCatalogQuery<RlsRow>(`
with expected(table_name) as (
  values ${sqlValues(CORE_PRIVATE_TABLES)}
)
select
  e.table_name,
  c.oid is not null as exists,
  c.relrowsecurity as rls_enabled
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind in ('r', 'p')
order by e.table_name;
    `);

    expect(rows, 'RLS catalog rows should match expected table count').toHaveLength(CORE_PRIVATE_TABLES.length);
    for (const row of rows) {
      expect(row.exists, `${row.table_name} should exist`).toBe(true);
      expect(row.rls_enabled, `${row.table_name} should have RLS enabled`).toBe(true);
    }
  });

  test('selected browser-callable RPCs are hardened for sandbox browser access', () => {
    const rows = runCatalogQuery<RpcRow>(
      securityDefinerRpcCatalogQuery(BROWSER_CALLABLE_SECURITY_DEFINER_RPCS),
    );

    expect(rows, 'RPC catalog rows should match expected function count').toHaveLength(
      BROWSER_CALLABLE_SECURITY_DEFINER_RPCS.length,
    );
    for (const row of rows) {
      expect(row.exists, `${row.proname} should exist`).toBe(true);
      expect(row.function_count, `${row.proname} should have at least one overload`).toBeGreaterThan(0);
      expect(row.security_definer, `${row.proname} should be SECURITY DEFINER`).toBe(true);
      expect(row.search_path_public, `${row.proname} should set search_path=public`).toBe(true);
      expect(row.public_execute, `${row.proname} should not grant EXECUTE to PUBLIC`).toBe(false);
      expect(row.anon_execute, `${row.proname} should not grant EXECUTE to anon`).toBe(false);
      expect(row.authenticated_execute, `${row.proname} should grant EXECUTE to authenticated`).toBe(true);
    }
  });

  test('selected internal-only RPCs remain unavailable to browser roles', () => {
    const rows = runCatalogQuery<RpcRow>(
      securityDefinerRpcCatalogQuery(INTERNAL_ONLY_SECURITY_DEFINER_RPCS),
    );

    expect(rows, 'Internal RPC catalog rows should match expected function count').toHaveLength(
      INTERNAL_ONLY_SECURITY_DEFINER_RPCS.length,
    );
    for (const row of rows) {
      expect(row.exists, `${row.proname} should exist`).toBe(true);
      expect(row.function_count, `${row.proname} should have at least one overload`).toBeGreaterThan(0);
      expect(row.security_definer, `${row.proname} should be SECURITY DEFINER`).toBe(true);
      expect(row.search_path_public, `${row.proname} should set search_path=public`).toBe(true);
      expect(row.public_execute, `${row.proname} should not grant EXECUTE to PUBLIC`).toBe(false);
      expect(row.anon_execute, `${row.proname} should not grant EXECUTE to anon`).toBe(false);
      expect(row.authenticated_execute, `${row.proname} should not grant EXECUTE to authenticated`).toBe(false);
    }
  });

  test('core storage buckets exist with expected public/private flags in the linked sandbox', () => {
    const bucketValues = STORAGE_BUCKETS.map(
      bucket => `('${bucket.bucket_id.replace(/'/g, "''")}', ${bucket.expected_public ? 'true' : 'false'})`,
    ).join(',');

    const rows = runCatalogQuery<BucketRow>(`
with expected(bucket_id, expected_public) as (
  values ${bucketValues}
)
select
  e.bucket_id,
  b.id is not null as exists,
  b.public as is_public,
  e.expected_public
from expected e
left join storage.buckets b
  on b.id = e.bucket_id
order by e.bucket_id;
    `);

    expect(rows, 'Storage bucket rows should match expected bucket count').toHaveLength(STORAGE_BUCKETS.length);
    for (const row of rows) {
      expect(row.exists, `${row.bucket_id} should exist`).toBe(true);
      expect(row.is_public, `${row.bucket_id} public/private flag should match expected state`).toBe(row.expected_public);
    }
  });

  test('selected storage object policies exist in the linked sandbox', () => {
    const rows = runCatalogQuery<StoragePolicyRow>(`
with expected(policy_name) as (
  values ${sqlValues(STORAGE_OBJECT_POLICIES)}
)
select
  e.policy_name,
  p.policyname is not null as exists
from expected e
left join pg_policies p
  on p.schemaname = 'storage'
 and p.tablename = 'objects'
 and p.policyname = e.policy_name
order by e.policy_name;
    `);

    expect(rows, 'Storage policy catalog rows should match expected policy count').toHaveLength(
      STORAGE_OBJECT_POLICIES.length,
    );
    for (const row of rows) {
      expect(row.exists, `${row.policy_name} storage.objects policy should exist`).toBe(true);
    }
  });
});
