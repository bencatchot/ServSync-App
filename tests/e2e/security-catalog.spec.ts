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
];

const HIGH_RISK_RPCS = [
  'current_user_can_manage_contractor_billing',
  'current_user_can_manage_contractor_schedule',
  'servsync_contractor_pending_connection_requests',
  'servsync_accept_service_request_appointment_window',
  'servsync_cancel_service_request_appointment',
  'servsync_create_invoice_from_job',
  'servsync_create_job_from_estimate',
  'servsync_create_job_work_item',
  'servsync_create_partial_invoice_from_job',
  'servsync_decline_service_request_appointment_window',
  'servsync_prepare_manual_home_document_upload',
  'servsync_propose_service_request_appointment_windows',
  'servsync_reschedule_service_request_appointment',
  'servsync_register_manual_home_document_upload',
  'servsync_remove_job_work_item',
  'servsync_respond_to_connection_request',
  'servsync_send_invoice',
  'servsync_submit_contextual_connection_request',
  'servsync_sync_simple_job_work_items',
  'servsync_update_connection_shared_properties',
  'servsync_update_job_work_item',
  'servsync_validate_manual_home_document_upload',
  'servsync_void_invoice',
];

const STORAGE_BUCKETS = [
  { bucket_id: 'contractor-assets', expected_public: true },
  { bucket_id: 'discover-media', expected_public: true },
  { bucket_id: 'home-documents', expected_public: false },
  { bucket_id: 'inspection-media', expected_public: false },
  { bucket_id: 'service-request-media', expected_public: false },
  { bucket_id: 'support-attachments', expected_public: false },
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

  test('selected high-risk RPCs are hardened for sandbox browser access', () => {
    const rows = runCatalogQuery<RpcRow>(`
with expected(proname) as (
  values ${sqlValues(HIGH_RISK_RPCS)}
)
select
  e.proname,
  p.oid is not null as exists,
  p.prosecdef as security_definer,
  coalesce('search_path=public' = any(p.proconfig), false) as search_path_public,
  exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) as public_execute,
  case when p.oid is null then null else has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_execute,
  case when p.oid is null then null else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute
from expected e
left join pg_proc p
  on p.proname = e.proname
 and p.pronamespace = 'public'::regnamespace
order by e.proname;
    `);

    expect(rows, 'RPC catalog rows should match expected function count').toHaveLength(HIGH_RISK_RPCS.length);
    for (const row of rows) {
      expect(row.exists, `${row.proname} should exist`).toBe(true);
      expect(row.security_definer, `${row.proname} should be SECURITY DEFINER`).toBe(true);
      expect(row.search_path_public, `${row.proname} should set search_path=public`).toBe(true);
      expect(row.public_execute, `${row.proname} should not grant EXECUTE to PUBLIC`).toBe(false);
      expect(row.anon_execute, `${row.proname} should not grant EXECUTE to anon`).toBe(false);
      expect(row.authenticated_execute, `${row.proname} should grant EXECUTE to authenticated`).toBe(true);
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
});
