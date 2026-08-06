import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(haystack: string, start: string, end: string) {
  const startIndex = haystack.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = haystack.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return haystack.slice(startIndex, endIndex);
}

test.describe('Draft-optional contractor-customer migration compatibility', () => {
  test('keeps the checksum-recorded migrations immutable', () => {
    expect(createHash('sha256').update(source('servsync-contractor-local-customer-read-list-parity.sql')).digest('hex'))
      .toBe('0b90e4548ceec24e7bdd96a12ad9951f74b7ffc064f222a2f41b0e2ce109f41f');
    expect(createHash('sha256').update(source('servsync-contractor-local-customer-property-archive-restore.sql')).digest('hex'))
      .toBe('762c6fdd8b1dacabb70730c7257691f959ebfd07cf67d2688b97756015a46c17');
  });

  test('read boundary distinguishes absent, complete, and incompatible Draft foundations', () => {
    const sql = source('servsync-contractor-local-customer-read-list-parity-draft-optional.sql');
    const preflight = sourceBetween(sql, 'do $$\nbegin', 'create or replace function public.servsync_private_assert_canonical_customer_draft_foundation');
    const canonicalAssertion = sourceBetween(
      sql,
      'create or replace function public.servsync_private_assert_canonical_customer_draft_foundation',
      'create or replace function public.servsync_private_customer_draft_foundation_available',
    );
    const availability = sourceBetween(
      sql,
      'create or replace function public.servsync_private_customer_draft_foundation_available',
      'create or replace function public.servsync_private_local_customer_has_readable_work',
    );

    expect(preflight).toContain("raise exception 'Missing required local-customer or contractor-work tables.'");
    expect(preflight).not.toContain('v_draft_relation_count');
    expect(preflight).not.toMatch(/or to_regclass\('public\.contractor_work_drafts'\) is null/);
    expect(canonicalAssertion).toContain('if v_relation_count not in (0, 3) then');
    expect(canonicalAssertion).toContain('perform public.servsync_private_assert_canonical_customer_draft_foundation();');
    expect(availability).toContain('if v_relation_count = 0 then\n    return false;');
    expect(availability).toContain('perform public.servsync_private_assert_canonical_customer_draft_foundation();');
    expect(availability).toContain('return true;');
    expect(canonicalAssertion).toContain("owner_role.rolname <> 'postgres'");
    expect(canonicalAssertion).toContain("v_catalog_count <> 66");
    expect(canonicalAssertion).toContain("v_catalog_count <> 47");
    expect(canonicalAssertion).toContain("v_catalog_count <> 18");
    expect(canonicalAssertion).toContain("v_catalog_count <> 3");
    expect(canonicalAssertion).toContain("md5(procedure_row.prosrc) <> expected_function.body_fingerprint");
    expect(canonicalAssertion).toContain('pg_get_function_arguments(procedure_row.oid)');
    expect(canonicalAssertion).toContain('not relation.relrowsecurity');
    expect(canonicalAssertion).toContain('relation.relforcerowsecurity');
    expect(canonicalAssertion).toContain("'FOREIGN KEY (draft_id, contractor_id) REFERENCES contractor_work_drafts(id, contractor_id) ON DELETE CASCADE'");
    expect(canonicalAssertion).toContain("'FOREIGN KEY (local_home_id) REFERENCES contractor_local_homes(id) ON DELETE SET NULL'");
    expect(canonicalAssertion).toContain('not constraint_row.convalidated');
    expect(canonicalAssertion).toContain('count(*)');
    expect(canonicalAssertion).toContain("overload.proname = expected_function.function_name");
    expect(canonicalAssertion).toContain("coalesce(procedure_row.proconfig, '{}'::text[]) <> array['search_path=public']::text[]");
    expect(canonicalAssertion).toContain("has_function_privilege('public', procedure_row.oid, 'EXECUTE')");
    expect(canonicalAssertion).toContain("has_function_privilege('anon', procedure_row.oid, 'EXECUTE')");
    expect(canonicalAssertion).toContain("not has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')");
    expect(canonicalAssertion).toContain("has_table_privilege('authenticated', relation.oid, 'UPDATE')");
    expect(canonicalAssertion).toContain('attribute.attacl is not null');
    expect(canonicalAssertion).toContain('function_acl.is_grantable');
    expect(canonicalAssertion).toContain('table_acl.is_grantable');
    expect(canonicalAssertion).toContain('policy_row.polroles');
    expect(canonicalAssertion).toContain('policy_row.polwithcheck is not null');
  });

  test('complete fixture installs the real canonical Durable Draft chain', () => {
    const fixture = source('tests/sql/draft-optional-complete-foundation.sql');

    expect(fixture).toContain('\\ir ../../servsync-durable-draft-launch-foundation.sql');
    expect(fixture).toContain('\\ir ../../servsync-durable-draft-inspection-checklist-path.sql');
    expect(fixture).toContain('\\ir ../../servsync-durable-draft-cohort-entitlement.sql');
    expect(fixture).toContain('\\ir ../../servsync-durable-draft-invoice-launch-foundation.sql');
    expect(fixture).not.toMatch(/create\s+table\s+public\.contractor_work_draft/i);
    expect(fixture).not.toMatch(/create\s+function\s+public\.servsync_(get|save|launch)_work_draft/i);
    expect(fixture).not.toContain("return '{}'::jsonb");
  });

  test('PostgreSQL harness covers catalog drift and Draft-free roles transactionally', () => {
    const harness = source('scripts/validation/validate-draft-optional-customer-migrations.sh');

    for (const database of [
      'draft_partial',
      'draft_incompatible',
      'drift_missing_column',
      'drift_column_type',
      'drift_nullability',
      'drift_default',
      'drift_check',
      'drift_weak_fk',
      'drift_wrong_reference',
      'drift_fk_action',
      'drift_unvalidated_fk',
      'drift_unexpected_overload',
      'drift_return_type',
      'drift_argument_type',
      'drift_rpc_body',
      'drift_public_rpc',
      'drift_anon_rpc',
      'drift_missing_authenticated_rpc',
      'drift_authenticated_rpc_grant_option',
      'drift_service_rpc_grant_option',
      'drift_table_acl',
      'drift_table_grant_option',
      'drift_column_acl',
      'drift_column_grant_option',
      'drift_wrong_owner',
      'drift_security_invoker',
      'drift_search_path',
      'drift_rls',
      'drift_missing_policy',
      'drift_policy_command',
      'drift_policy_expression',
      'archive_drift',
    ]) {
      expect(harness).toContain(database);
    }
    for (const roleUserSuffix of ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008']) {
      expect(harness).toContain(`10000000-0000-0000-0000-00000000${roleUserSuffix}`);
    }
    expect(harness).toContain('assert_no_compatibility_state');
    expect(harness).toContain("to_regprocedure('public.servsync_archive_local_customer(uuid)') is not null");
    expect(harness).toContain('Historical role/redaction contract failed');
    expect(harness).toContain('Cross-tenant directory isolation failed');
    expect(harness).toContain('Direct-table privilege cleanup did not hold');
  });

  test('Draft-backed reads are dynamically gated and private', () => {
    const sql = source('servsync-contractor-local-customer-read-list-parity-draft-optional.sql');
    const readableWork = sourceBetween(
      sql,
      'create or replace function public.servsync_private_local_customer_has_readable_work',
      'create or replace function public.servsync_private_local_customer_read_context',
    );
    const directory = sourceBetween(
      sql,
      'create or replace function public.servsync_list_local_customer_summaries()',
      'create or replace function public.servsync_get_local_customer_management_detail',
    );

    expect(readableWork).toContain('not public.servsync_private_customer_draft_foundation_available()');
    expect(readableWork).toContain('execute $draft_work$');
    expect(readableWork).toContain('from public.contractor_work_drafts draft');
    expect(readableWork).toContain('revoke all on function public.servsync_private_local_customer_has_readable_work');
    expect(directory).toContain('servsync_private_local_customer_has_readable_work');
    expect(directory).not.toContain('public.contractor_work_drafts');
  });

  test('archive lifecycle omits Draft integration safely while preserving response shape', () => {
    const sql = source('servsync-contractor-local-customer-property-archive-restore-draft-optional.sql');
    const preflight = sourceBetween(sql, 'do $$\ndeclare', 'alter table public.contractor_local_contacts');
    const draftTrigger = sourceBetween(sql, 'do $draft_assignment$', 'drop trigger if exists servsync_guard_local_inspection_template_assignment');
    const impact = sourceBetween(
      sql,
      'create or replace function public.servsync_get_local_customer_archive_impact',
      'create or replace function public.servsync_archive_local_customer',
    );
    const historical = sourceBetween(
      sql,
      'create or replace function public.servsync_list_local_customer_historical_context()',
      '-- Keep ordinary directory results active-only.',
    );

    expect(preflight).not.toMatch(/or to_regclass\('public\.contractor_work_drafts'\) is null/);
    expect(preflight).toContain("to_regprocedure('public.servsync_private_assert_canonical_customer_draft_foundation()')");
    expect(preflight).toContain('v_draft_relation_count not in (0, 3)');
    expect(preflight).toContain('perform public.servsync_private_assert_canonical_customer_draft_foundation();');
    expect(preflight).toContain('if not public.servsync_private_customer_draft_foundation_available() then');
    expect(draftTrigger).toContain('if public.servsync_private_customer_draft_foundation_available() then');
    expect(draftTrigger).toContain('execute $draft_trigger$');
    expect(impact).toContain('v_draft_count bigint := 0;');
    expect(impact).toContain('if public.servsync_private_customer_draft_foundation_available() then');
    expect(impact).toContain("'draft_count', v_draft_count");
    expect(historical).toContain("v_draft_work jsonb := '[]'::jsonb;");
    expect(historical).toContain('jsonb_to_recordset(v_draft_work)');
  });

  test('non-Draft guards and manager authorization remain mandatory', () => {
    const sql = source('servsync-contractor-local-customer-property-archive-restore-draft-optional.sql');
    for (const table of [
      'inspection_templates',
      'contractor_calendar_events',
      'contractor_visit_events',
      'inspections',
      'estimates',
      'invoices',
      'contractor_local_customer_claim_invites',
      'contractor_local_customer_claim_invite_homes',
    ]) {
      expect(sql).toContain(`on public.${table}`);
    }
    expect(sql).toContain("v_access_role not in ('owner', 'admin', 'office')");
    expect(sql).toContain('current_user_can_manage_contractor_customers(v_contractor_id)');
    expect(sql).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.contractor_work_drafts/i);
    expect(sql).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.projects/i);
    expect(sql).not.toMatch(/create\s+policy|drop\s+policy/i);
  });
});
