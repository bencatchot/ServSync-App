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
    const preflight = sourceBetween(sql, 'do $$\ndeclare', 'create or replace function public.servsync_private_customer_draft_foundation_available');
    const availability = sourceBetween(
      sql,
      'create or replace function public.servsync_private_customer_draft_foundation_available',
      'create or replace function public.servsync_private_local_customer_has_readable_work',
    );

    expect(preflight).toContain('v_draft_relation_count not in (0, 3)');
    expect(preflight).toContain('if v_draft_relation_count = 3 then');
    expect(preflight).toContain("raise exception 'Durable Draft foundation is incomplete or incompatible.'");
    expect(preflight).not.toMatch(/or to_regclass\('public\.contractor_work_drafts'\) is null/);
    expect(availability).toContain('if v_relation_count = 0 then\n    return false;');
    expect(availability).toContain("owner_role.rolname <> 'postgres'");
    expect(availability).toContain('not relation.relrowsecurity');
    expect(availability).toContain("to_regprocedure('public.servsync_get_work_draft(uuid)')");
    expect(availability).toContain('return true;');
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
    expect(preflight).toContain('perform public.servsync_private_customer_draft_foundation_available();');
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
