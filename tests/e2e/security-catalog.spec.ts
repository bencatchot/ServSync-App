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

type TablePrivilegeRow = {
  table_name: string;
  exists: boolean;
  public_select: boolean | null;
  public_insert: boolean | null;
  public_update: boolean | null;
  public_delete: boolean | null;
  anon_select: boolean | null;
  anon_insert: boolean | null;
  anon_update: boolean | null;
  anon_delete: boolean | null;
  authenticated_select: boolean | null;
  authenticated_insert: boolean | null;
  authenticated_update: boolean | null;
  authenticated_delete: boolean | null;
};

type PriceBookGrantRow = TablePrivilegeRow & {
  authenticated_insert_table_grant: boolean | null;
  authenticated_update_table_grant: boolean | null;
  authenticated_insert_columns: string[] | null;
  authenticated_update_columns: string[] | null;
  public_column_grants: number;
  anon_column_grants: number;
};

type ReviewGrantRow = TablePrivilegeRow & {
  public_truncate: boolean | null;
  public_trigger: boolean | null;
  public_references: boolean | null;
  anon_truncate: boolean | null;
  anon_trigger: boolean | null;
  anon_references: boolean | null;
  authenticated_truncate: boolean | null;
  authenticated_trigger: boolean | null;
  authenticated_references: boolean | null;
};

type ReviewRpcGrantRow = RpcRow & {
  authenticated_execute_all: boolean | null;
};

type ReviewModerationColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

type ReviewModerationConstraintRow = {
  constraint_exists: boolean;
  constraint_definition: string | null;
};

const CORE_PRIVATE_TABLES = [
  'profiles',
  'homeowner_profiles',
  'homes',
  'home_rooms',
  'home_room_layouts',
  'home_assets',
  'home_memberships',
  'home_membership_audit_events',
  'home_membership_email_invites',
  'servsync_runtime_settings',
  'contractor_profiles',
  'contractor_billing_accounts',
  'homeowner_contractor_connections',
  'connection_permissions',
  'service_requests',
  'service_request_messages',
  'service_request_reviews',
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
  'service_agreement_templates',
  'service_agreement_offers',
  'service_agreements',
  'workflow_messages',
  'workflow_activity_events',
  'workflow_thread_reads',
  'homeowner_contractor_invite_leads',
  'servsync_referral_invites',
  'service_request_media',
  'service_request_appointments',
  'connection_shared_properties',
  'connection_request_contexts',
  'contractor_home_property_proposals',
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
  'current_user_can_access_home',
  'current_user_has_contractor_entitlement',
  'current_user_can_approve_home_work',
  'current_user_can_manage_contractor_billing',
  'current_user_can_manage_contractor_schedule',
  'current_user_can_manage_service_agreements',
  'current_user_can_submit_contractor_referrals',
  'current_user_can_manage_home',
  'current_user_can_manage_home_connections',
  'current_user_home_role',
  'servsync_accept_home_membership_invite',
  'servsync_accept_home_membership_email_invite',
  'current_user_can_send_contractor_workflow_messages',
  'servsync_contractor_pending_connection_requests',
  'servsync_current_contractor_entitlements',
  'servsync_accept_service_request_appointment_window',
  'servsync_cancel_service_request_appointment',
  'servsync_create_invoice_from_job',
  'servsync_create_local_home',
  'servsync_create_home_property_proposal',
  'servsync_create_service_agreement_template',
  'servsync_create_service_agreement_offer',
  'servsync_create_job_from_estimate',
  'servsync_create_job_work_item',
  'servsync_create_partial_invoice_from_job',
  'servsync_decline_service_request_appointment_window',
  'servsync_create_home_membership_email_invite',
  'servsync_decline_home_membership_invite',
  'servsync_decline_home_membership_email_invite',
  'servsync_invite_home_member',
  'servsync_list_home_membership_email_invites',
  'servsync_list_my_shared_home_address_shells',
  'servsync_list_my_shared_home_reminder_shells',
  'servsync_list_my_shared_home_shells',
  'servsync_list_my_home_membership_email_invites',
  'servsync_prepare_home_access_invite_delivery',
  'servsync_prepare_manual_home_document_upload',
  'servsync_propose_service_request_appointment_windows',
  'servsync_reschedule_service_request_appointment',
  'servsync_register_manual_home_document_upload',
  'servsync_remove_job_work_item',
  'servsync_homeowner_respond_to_estimate',
  'servsync_homeowner_accept_home_property_proposal',
  'servsync_homeowner_reject_home_property_proposal',
  'servsync_homeowner_view_invoice',
  'servsync_mark_invoice_paid',
  'servsync_mark_workflow_thread_read',
  'servsync_respond_to_connection_request',
  'servsync_send_invoice',
  'servsync_send_workflow_message',
  'servsync_submit_contextual_connection_request',
  'servsync_submit_contractor_referral_invite',
  'servsync_sync_simple_job_work_items',
  'servsync_revoke_home_membership',
  'servsync_revoke_home_membership_email_invite',
  'servsync_revoke_home_property_proposal',
  'servsync_homeowner_respond_to_service_agreement_offer',
  'servsync_send_service_agreement_offer',
  'servsync_update_local_home',
  'servsync_update_connection_shared_properties',
  'servsync_update_service_agreement_template',
  'servsync_update_job_work_item',
  'servsync_validate_manual_home_document_upload',
  'servsync_void_invoice',
];

const INTERNAL_ONLY_SECURITY_DEFINER_RPCS = [
  'servsync_append_workflow_activity_event',
  'servsync_record_home_access_invite_delivery_result',
];

const ADMIN_ONLY_SECURITY_DEFINER_RPCS = [
  'servsync_admin_referral_invites',
  'servsync_admin_update_referral_invite',
  'servsync_admin_contractor_billing_readiness',
  'servsync_admin_review_moderation_queue',
  'servsync_admin_update_review_moderation',
];

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

  test('foundation tables stay read-only for browser roles where expected', () => {
    const rows = runCatalogQuery<TablePrivilegeRow>(`
with expected(table_name) as (
  values
    ('contractor_home_property_proposals'),
    ('home_memberships'),
    ('home_membership_audit_events'),
    ('home_membership_email_invites'),
    ('service_agreement_templates'),
    ('service_agreement_offers'),
    ('service_agreements')
)
select
  e.table_name,
  c.oid is not null as exists,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'SELECT') end as public_select,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'INSERT') end as public_insert,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'UPDATE') end as public_update,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'DELETE') end as public_delete,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'SELECT') end as anon_select,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'INSERT') end as anon_insert,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'UPDATE') end as anon_update,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'DELETE') end as anon_delete,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'SELECT') end as authenticated_select,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'INSERT') end as authenticated_insert,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'UPDATE') end as authenticated_update,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'DELETE') end as authenticated_delete
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind in ('r', 'p')
order by e.table_name;
    `);

    expect(rows, 'Foundation privilege rows should match expected table count').toHaveLength(7);
    for (const row of rows) {
      expect(row.exists, `${row.table_name} should exist`).toBe(true);
      expect(row.public_select, `${row.table_name} should not grant SELECT to PUBLIC`).toBe(false);
      expect(row.public_insert, `${row.table_name} should not grant INSERT to PUBLIC`).toBe(false);
      expect(row.public_update, `${row.table_name} should not grant UPDATE to PUBLIC`).toBe(false);
      expect(row.public_delete, `${row.table_name} should not grant DELETE to PUBLIC`).toBe(false);
      expect(row.anon_select, `${row.table_name} should not grant SELECT to anon`).toBe(false);
      expect(row.anon_insert, `${row.table_name} should not grant INSERT to anon`).toBe(false);
      expect(row.anon_update, `${row.table_name} should not grant UPDATE to anon`).toBe(false);
      expect(row.anon_delete, `${row.table_name} should not grant DELETE to anon`).toBe(false);
      expect(row.authenticated_select, `${row.table_name} should grant SELECT to authenticated`).toBe(true);
      expect(row.authenticated_insert, `${row.table_name} should not grant INSERT to authenticated`).toBe(false);
      expect(row.authenticated_update, `${row.table_name} should not grant UPDATE to authenticated`).toBe(false);
      expect(row.authenticated_delete, `${row.table_name} should not grant DELETE to authenticated`).toBe(false);
    }
  });

  test('home rooms grant only scoped browser read/write privileges with no delete', () => {
    const rows = runCatalogQuery<TablePrivilegeRow>(`
with expected(table_name) as (
  values ('home_rooms')
)
select
  e.table_name,
  c.oid is not null as exists,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'SELECT') end as public_select,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'INSERT') end as public_insert,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'UPDATE') end as public_update,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'DELETE') end as public_delete,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'SELECT') end as anon_select,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'INSERT') end as anon_insert,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'UPDATE') end as anon_update,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'DELETE') end as anon_delete,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'SELECT') end as authenticated_select,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'INSERT') end as authenticated_insert,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'UPDATE') end as authenticated_update,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'DELETE') end as authenticated_delete
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind in ('r', 'p')
order by e.table_name;
    `);

    expect(rows, 'Home rooms privilege rows should match expected table count').toHaveLength(1);
    const row = rows[0];
    expect(row.exists, `${row.table_name} should exist`).toBe(true);
    expect(row.public_select, `${row.table_name} should not grant SELECT to PUBLIC`).toBe(false);
    expect(row.public_insert, `${row.table_name} should not grant INSERT to PUBLIC`).toBe(false);
    expect(row.public_update, `${row.table_name} should not grant UPDATE to PUBLIC`).toBe(false);
    expect(row.public_delete, `${row.table_name} should not grant DELETE to PUBLIC`).toBe(false);
    expect(row.anon_select, `${row.table_name} should not grant SELECT to anon`).toBe(false);
    expect(row.anon_insert, `${row.table_name} should not grant INSERT to anon`).toBe(false);
    expect(row.anon_update, `${row.table_name} should not grant UPDATE to anon`).toBe(false);
    expect(row.anon_delete, `${row.table_name} should not grant DELETE to anon`).toBe(false);
    expect(row.authenticated_select, `${row.table_name} should grant SELECT to authenticated behind RLS`).toBe(true);
    expect(row.authenticated_insert, `${row.table_name} should grant INSERT to authenticated behind RLS`).toBe(true);
    expect(row.authenticated_update, `${row.table_name} should grant UPDATE to authenticated behind RLS`).toBe(true);
    expect(row.authenticated_delete, `${row.table_name} should not grant DELETE to authenticated`).toBe(false);
  });

  test('home assets and home room layouts grant scoped browser privileges with no delete', () => {
    const rows = runCatalogQuery<TablePrivilegeRow>(`
with expected(table_name) as (
  values ('home_assets'), ('home_room_layouts')
)
select
  e.table_name,
  c.oid is not null as exists,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'SELECT') end as public_select,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'INSERT') end as public_insert,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'UPDATE') end as public_update,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'DELETE') end as public_delete,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'SELECT') end as anon_select,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'INSERT') end as anon_insert,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'UPDATE') end as anon_update,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'DELETE') end as anon_delete,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'SELECT') end as authenticated_select,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'INSERT') end as authenticated_insert,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'UPDATE') end as authenticated_update,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'DELETE') end as authenticated_delete
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind in ('r', 'p')
order by e.table_name;
    `);

    expect(rows, 'Home assets/layout privilege rows should match expected table count').toHaveLength(2);
    for (const row of rows) {
      expect(row.exists, `${row.table_name} should exist`).toBe(true);
      expect(row.public_select, `${row.table_name} should not grant SELECT to PUBLIC`).toBe(false);
      expect(row.public_insert, `${row.table_name} should not grant INSERT to PUBLIC`).toBe(false);
      expect(row.public_update, `${row.table_name} should not grant UPDATE to PUBLIC`).toBe(false);
      expect(row.public_delete, `${row.table_name} should not grant DELETE to PUBLIC`).toBe(false);
      expect(row.anon_select, `${row.table_name} should not grant SELECT to anon`).toBe(false);
      expect(row.anon_insert, `${row.table_name} should not grant INSERT to anon`).toBe(false);
      expect(row.anon_update, `${row.table_name} should not grant UPDATE to anon`).toBe(false);
      expect(row.anon_delete, `${row.table_name} should not grant DELETE to anon`).toBe(false);
      expect(row.authenticated_select, `${row.table_name} should grant SELECT to authenticated behind home-scoped RLS`).toBe(true);
      expect(row.authenticated_insert, `${row.table_name} should grant INSERT to authenticated behind owner/admin RLS`).toBe(true);
      expect(row.authenticated_update, `${row.table_name} should grant UPDATE to authenticated behind owner/admin RLS`).toBe(true);
      expect(row.authenticated_delete, `${row.table_name} should not grant DELETE to authenticated`).toBe(false);
    }
  });

  test('runtime settings table remains unavailable to browser roles', () => {
    const rows = runCatalogQuery<TablePrivilegeRow>(`
with expected(table_name) as (
  values ('servsync_runtime_settings')
)
select
  e.table_name,
  c.oid is not null as exists,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'SELECT') end as public_select,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'INSERT') end as public_insert,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'UPDATE') end as public_update,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'DELETE') end as public_delete,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'SELECT') end as anon_select,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'INSERT') end as anon_insert,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'UPDATE') end as anon_update,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'DELETE') end as anon_delete,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'SELECT') end as authenticated_select,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'INSERT') end as authenticated_insert,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'UPDATE') end as authenticated_update,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'DELETE') end as authenticated_delete
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind in ('r', 'p')
order by e.table_name;
    `);

    expect(rows, 'Runtime settings privilege rows should match expected table count').toHaveLength(1);
    for (const row of rows) {
      expect(row.exists, `${row.table_name} should exist`).toBe(true);
      expect(row.public_select, `${row.table_name} should not grant SELECT to PUBLIC`).toBe(false);
      expect(row.public_insert, `${row.table_name} should not grant INSERT to PUBLIC`).toBe(false);
      expect(row.public_update, `${row.table_name} should not grant UPDATE to PUBLIC`).toBe(false);
      expect(row.public_delete, `${row.table_name} should not grant DELETE to PUBLIC`).toBe(false);
      expect(row.anon_select, `${row.table_name} should not grant SELECT to anon`).toBe(false);
      expect(row.anon_insert, `${row.table_name} should not grant INSERT to anon`).toBe(false);
      expect(row.anon_update, `${row.table_name} should not grant UPDATE to anon`).toBe(false);
      expect(row.anon_delete, `${row.table_name} should not grant DELETE to anon`).toBe(false);
      expect(row.authenticated_select, `${row.table_name} should not grant SELECT to authenticated`).toBe(false);
      expect(row.authenticated_insert, `${row.table_name} should not grant INSERT to authenticated`).toBe(false);
      expect(row.authenticated_update, `${row.table_name} should not grant UPDATE to authenticated`).toBe(false);
      expect(row.authenticated_delete, `${row.table_name} should not grant DELETE to authenticated`).toBe(false);
    }
  });

  test('contractor referral invite foundation remains RPC-only for browser roles', () => {
    const rows = runCatalogQuery<TablePrivilegeRow>(`
with expected(table_name) as (
  values ('servsync_referral_invites')
)
select
  e.table_name,
  c.oid is not null as exists,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'SELECT') end as public_select,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'INSERT') end as public_insert,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'UPDATE') end as public_update,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'DELETE') end as public_delete,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'SELECT') end as anon_select,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'INSERT') end as anon_insert,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'UPDATE') end as anon_update,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'DELETE') end as anon_delete,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'SELECT') end as authenticated_select,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'INSERT') end as authenticated_insert,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'UPDATE') end as authenticated_update,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'DELETE') end as authenticated_delete
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind in ('r', 'p')
order by e.table_name;
    `);

    expect(rows, 'Contractor referral invite privilege rows should match expected table count').toHaveLength(1);
    const row = rows[0];
    expect(row.exists, `${row.table_name} should exist`).toBe(true);
    expect(row.public_select, `${row.table_name} should not grant SELECT to PUBLIC`).toBe(false);
    expect(row.public_insert, `${row.table_name} should not grant INSERT to PUBLIC`).toBe(false);
    expect(row.public_update, `${row.table_name} should not grant UPDATE to PUBLIC`).toBe(false);
    expect(row.public_delete, `${row.table_name} should not grant DELETE to PUBLIC`).toBe(false);
    expect(row.anon_select, `${row.table_name} should not grant SELECT to anon`).toBe(false);
    expect(row.anon_insert, `${row.table_name} should not grant INSERT to anon`).toBe(false);
    expect(row.anon_update, `${row.table_name} should not grant UPDATE to anon`).toBe(false);
    expect(row.anon_delete, `${row.table_name} should not grant DELETE to anon`).toBe(false);
    expect(row.authenticated_select, `${row.table_name} should not grant SELECT to authenticated`).toBe(false);
    expect(row.authenticated_insert, `${row.table_name} should not grant INSERT to authenticated`).toBe(false);
    expect(row.authenticated_update, `${row.table_name} should not grant UPDATE to authenticated`).toBe(false);
    expect(row.authenticated_delete, `${row.table_name} should not grant DELETE to authenticated`).toBe(false);
  });

  test('contractor billing accounts stay private with platform-admin-only browser updates', () => {
    const rows = runCatalogQuery<TablePrivilegeRow>(`
with expected(table_name) as (
  values ('contractor_billing_accounts')
)
select
  e.table_name,
  c.oid is not null as exists,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'SELECT') end as public_select,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'INSERT') end as public_insert,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'UPDATE') end as public_update,
  case when c.oid is not null then has_table_privilege('public', c.oid, 'DELETE') end as public_delete,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'SELECT') end as anon_select,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'INSERT') end as anon_insert,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'UPDATE') end as anon_update,
  case when c.oid is not null then has_table_privilege('anon', c.oid, 'DELETE') end as anon_delete,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'SELECT') end as authenticated_select,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'INSERT') end as authenticated_insert,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'UPDATE') end as authenticated_update,
  case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'DELETE') end as authenticated_delete
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind in ('r', 'p')
order by e.table_name;
    `);

    expect(rows, 'Contractor billing privilege rows should match expected table count').toHaveLength(1);
    const row = rows[0];
    expect(row.exists, `${row.table_name} should exist`).toBe(true);
    expect(row.public_select, `${row.table_name} should not grant SELECT to PUBLIC`).toBe(false);
    expect(row.public_insert, `${row.table_name} should not grant INSERT to PUBLIC`).toBe(false);
    expect(row.public_update, `${row.table_name} should not grant UPDATE to PUBLIC`).toBe(false);
    expect(row.public_delete, `${row.table_name} should not grant DELETE to PUBLIC`).toBe(false);
    expect(row.anon_select, `${row.table_name} should not grant SELECT to anon`).toBe(false);
    expect(row.anon_insert, `${row.table_name} should not grant INSERT to anon`).toBe(false);
    expect(row.anon_update, `${row.table_name} should not grant UPDATE to anon`).toBe(false);
    expect(row.anon_delete, `${row.table_name} should not grant DELETE to anon`).toBe(false);
    expect(row.authenticated_select, `${row.table_name} should grant SELECT to authenticated behind RLS`).toBe(true);
    expect(row.authenticated_insert, `${row.table_name} should not grant INSERT to authenticated`).toBe(false);
    expect(row.authenticated_update, `${row.table_name} should grant UPDATE only behind platform-admin RLS`).toBe(true);
    expect(row.authenticated_delete, `${row.table_name} should not grant DELETE to authenticated`).toBe(false);
  });

  test('contractor Price Book item grants stay private and column-limited', () => {
    const expectedInsertColumns = [
      'active',
      'archived_at',
      'category',
      'contractor_id',
      'customer_description',
      'default_unit_price_cents',
      'internal_notes',
      'labor_hours',
      'line_type',
      'sku',
      'source',
      'taxable',
      'title',
      'trade',
      'unit',
    ].sort();
    const expectedUpdateColumns = expectedInsertColumns.filter(column => column !== 'contractor_id').sort();

    const rows = runCatalogQuery<PriceBookGrantRow>(`
with target as (
  select c.oid
  from pg_class c
  where c.relname = 'contractor_price_book_items'
    and c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p')
)
select
  'contractor_price_book_items'::text as table_name,
  exists(select 1 from target) as exists,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'SELECT') end as public_select,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'INSERT') end as public_insert,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'UPDATE') end as public_update,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'DELETE') end as public_delete,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'SELECT') end as anon_select,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'INSERT') end as anon_insert,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'UPDATE') end as anon_update,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'DELETE') end as anon_delete,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'SELECT') end as authenticated_select,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'INSERT') end as authenticated_insert,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'UPDATE') end as authenticated_update,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'DELETE') end as authenticated_delete,
  exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'contractor_price_book_items'
      and grantee = 'authenticated'
      and privilege_type = 'INSERT'
  ) as authenticated_insert_table_grant,
  exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'contractor_price_book_items'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
  ) as authenticated_update_table_grant,
  coalesce((
    select array_agg(column_name::text order by column_name)
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'contractor_price_book_items'
      and grantee = 'authenticated'
      and privilege_type = 'INSERT'
  ), '{}'::text[]) as authenticated_insert_columns,
  coalesce((
    select array_agg(column_name::text order by column_name)
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'contractor_price_book_items'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
  ), '{}'::text[]) as authenticated_update_columns,
  (
    select count(*)::int
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'contractor_price_book_items'
      and grantee = 'PUBLIC'
  ) as public_column_grants,
  (
    select count(*)::int
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'contractor_price_book_items'
      and grantee = 'anon'
  ) as anon_column_grants;
    `);

    expect(rows, 'Price Book grant rows should match expected table count').toHaveLength(1);
    const row = rows[0];
    expect(row.exists, `${row.table_name} should exist`).toBe(true);
    expect(row.public_select, `${row.table_name} should not grant SELECT to PUBLIC`).toBe(false);
    expect(row.public_insert, `${row.table_name} should not grant INSERT to PUBLIC`).toBe(false);
    expect(row.public_update, `${row.table_name} should not grant UPDATE to PUBLIC`).toBe(false);
    expect(row.public_delete, `${row.table_name} should not grant DELETE to PUBLIC`).toBe(false);
    expect(row.anon_select, `${row.table_name} should not grant SELECT to anon`).toBe(false);
    expect(row.anon_insert, `${row.table_name} should not grant INSERT to anon`).toBe(false);
    expect(row.anon_update, `${row.table_name} should not grant UPDATE to anon`).toBe(false);
    expect(row.anon_delete, `${row.table_name} should not grant DELETE to anon`).toBe(false);
    expect(row.authenticated_select, `${row.table_name} should grant SELECT to authenticated behind RLS`).toBe(true);
    expect(row.authenticated_delete, `${row.table_name} should not grant DELETE to authenticated`).toBe(false);
    expect(row.authenticated_insert_table_grant, `${row.table_name} should not have broad authenticated INSERT`).toBe(false);
    expect(row.authenticated_update_table_grant, `${row.table_name} should not have broad authenticated UPDATE`).toBe(false);
    expect(row.authenticated_insert_columns?.sort(), `${row.table_name} authenticated INSERT columns should stay limited`).toEqual(expectedInsertColumns);
    expect(row.authenticated_update_columns?.sort(), `${row.table_name} authenticated UPDATE columns should stay limited`).toEqual(expectedUpdateColumns);
    expect(row.public_column_grants, `${row.table_name} should not grant column privileges to PUBLIC`).toBe(0);
    expect(row.anon_column_grants, `${row.table_name} should not grant column privileges to anon`).toBe(0);
  });

  test('service request review table is RPC-mediated for browser roles', () => {
    const rows = runCatalogQuery<ReviewGrantRow>(`
with target as (
  select c.oid
  from pg_class c
  where c.relname = 'service_request_reviews'
    and c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p')
)
select
  'service_request_reviews'::text as table_name,
  exists(select 1 from target) as exists,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'SELECT') end as public_select,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'INSERT') end as public_insert,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'UPDATE') end as public_update,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'DELETE') end as public_delete,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'TRUNCATE') end as public_truncate,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'TRIGGER') end as public_trigger,
  case when exists(select 1 from target) then has_table_privilege('public', (select oid from target), 'REFERENCES') end as public_references,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'SELECT') end as anon_select,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'INSERT') end as anon_insert,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'UPDATE') end as anon_update,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'DELETE') end as anon_delete,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'TRUNCATE') end as anon_truncate,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'TRIGGER') end as anon_trigger,
  case when exists(select 1 from target) then has_table_privilege('anon', (select oid from target), 'REFERENCES') end as anon_references,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'SELECT') end as authenticated_select,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'INSERT') end as authenticated_insert,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'UPDATE') end as authenticated_update,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'DELETE') end as authenticated_delete,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'TRUNCATE') end as authenticated_truncate,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'TRIGGER') end as authenticated_trigger,
  case when exists(select 1 from target) then has_table_privilege('authenticated', (select oid from target), 'REFERENCES') end as authenticated_references;
    `);

    expect(rows, 'Review grant rows should match expected table count').toHaveLength(1);
    const row = rows[0];
    expect(row.exists, `${row.table_name} should exist`).toBe(true);

    for (const [privilege, granted] of Object.entries(row)) {
      if (privilege === 'table_name' || privilege === 'exists') continue;
      expect(granted, `${row.table_name} should not grant ${privilege} to browser roles`).toBe(false);
    }
  });

  test('review write and eligibility helper RPC grants stay non-public', () => {
    const rows = runCatalogQuery<ReviewRpcGrantRow>(`
with expected(proname, authenticated_expected) as (
  values
    ('servsync_homeowner_submit_review', true),
    ('servsync_homeowner_can_review_service_request', true),
    ('servsync_service_request_has_completed_work', false)
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
  coalesce(bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) filter (where p.oid is not null), false) as authenticated_execute,
  coalesce(bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) filter (where p.oid is not null), false) as authenticated_execute_all,
  e.authenticated_expected
from expected e
left join pg_proc p
  on p.proname = e.proname
 and p.pronamespace = 'public'::regnamespace
group by e.proname, e.authenticated_expected
order by e.proname;
    `);

    expect(rows, 'Review RPC catalog rows should match expected function count').toHaveLength(3);
    for (const row of rows) {
      expect(row.exists, `${row.proname} should exist`).toBe(true);
      expect(row.function_count, `${row.proname} should have one current signature`).toBe(1);
      expect(row.security_definer, `${row.proname} should be SECURITY DEFINER`).toBe(true);
      expect(row.search_path_public, `${row.proname} should set search_path=public`).toBe(true);
      expect(row.public_execute, `${row.proname} should not grant EXECUTE to PUBLIC`).toBe(false);
      expect(row.anon_execute, `${row.proname} should not grant EXECUTE to anon`).toBe(false);
      if (row.proname === 'servsync_service_request_has_completed_work') {
        expect(row.authenticated_execute, `${row.proname} should be internal-only`).toBe(false);
      } else {
        expect(row.authenticated_execute_all, `${row.proname} should grant EXECUTE to authenticated`).toBe(true);
      }
    }
  });

  test('review moderation foundation columns and status constraint are present', () => {
    const columns = runCatalogQuery<ReviewModerationColumnRow>(`
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'service_request_reviews'
  and column_name in (
    'moderation_status',
    'moderated_at',
    'moderated_by',
    'moderation_note',
    'updated_at'
  )
order by column_name;
    `);

    expect(columns, 'Review moderation columns should exist').toHaveLength(5);
    const byName = Object.fromEntries(columns.map(column => [column.column_name, column]));
    expect(byName.moderation_status).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(byName.moderation_status.column_default).toContain("'pending'::text");
    expect(byName.moderated_at).toMatchObject({ data_type: 'timestamp with time zone', is_nullable: 'YES' });
    expect(byName.moderated_by).toMatchObject({ data_type: 'uuid', is_nullable: 'YES' });
    expect(byName.moderation_note).toMatchObject({ data_type: 'text', is_nullable: 'NO' });
    expect(byName.moderation_note.column_default).toContain("''::text");
    expect(byName.updated_at).toMatchObject({ data_type: 'timestamp with time zone', is_nullable: 'NO' });
    expect(byName.updated_at.column_default).toContain('now()');

    const constraints = runCatalogQuery<ReviewModerationConstraintRow>(`
select
  exists (
    select 1
    from pg_constraint
    where conname = 'service_request_reviews_moderation_status_check'
      and conrelid = 'public.service_request_reviews'::regclass
  ) as constraint_exists,
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conname = 'service_request_reviews_moderation_status_check'
      and conrelid = 'public.service_request_reviews'::regclass
    limit 1
  ) as constraint_definition;
    `);

    expect(constraints).toHaveLength(1);
    expect(constraints[0].constraint_exists, 'Review moderation status check should exist').toBe(true);
    expect(constraints[0].constraint_definition).toContain('pending');
    expect(constraints[0].constraint_definition).toContain('approved');
    expect(constraints[0].constraint_definition).toContain('hidden');
    expect(constraints[0].constraint_definition).toContain('rejected');
  });

  test('public review display RPCs remain browser-callable', () => {
    const rows = runCatalogQuery<RpcRow>(`
with expected(proname) as (
  values
    ('servsync_get_public_contractor_profile'),
    ('servsync_discover_feed')
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
    `);

    expect(rows, 'Public review display RPC rows should match expected function count').toHaveLength(2);
    for (const row of rows) {
      expect(row.exists, `${row.proname} should exist`).toBe(true);
      expect(row.function_count, `${row.proname} should have a current signature`).toBeGreaterThan(0);
      expect(row.security_definer, `${row.proname} should be SECURITY DEFINER`).toBe(true);
      expect(row.search_path_public, `${row.proname} should set search_path=public`).toBe(true);
      expect(row.public_execute, `${row.proname} should remain public for browser profile/Discover display`).toBe(true);
      expect(row.anon_execute, `${row.proname} should remain callable by anon`).toBe(true);
      expect(row.authenticated_execute, `${row.proname} should remain callable by authenticated users`).toBe(true);
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

  test('selected admin-only RPCs are hardened and callable only through authenticated admin guards', () => {
    const rows = runCatalogQuery<RpcRow>(
      securityDefinerRpcCatalogQuery(ADMIN_ONLY_SECURITY_DEFINER_RPCS),
    );

    expect(rows, 'Admin RPC catalog rows should match expected function count').toHaveLength(
      ADMIN_ONLY_SECURITY_DEFINER_RPCS.length,
    );
    for (const row of rows) {
      expect(row.exists, `${row.proname} should exist`).toBe(true);
      expect(row.function_count, `${row.proname} should have at least one overload`).toBeGreaterThan(0);
      expect(row.security_definer, `${row.proname} should be SECURITY DEFINER`).toBe(true);
      expect(row.search_path_public, `${row.proname} should set search_path=public`).toBe(true);
      expect(row.public_execute, `${row.proname} should not grant EXECUTE to PUBLIC`).toBe(false);
      expect(row.anon_execute, `${row.proname} should not grant EXECUTE to anon`).toBe(false);
      expect(row.authenticated_execute, `${row.proname} should grant EXECUTE to authenticated behind admin guard`).toBe(true);
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
