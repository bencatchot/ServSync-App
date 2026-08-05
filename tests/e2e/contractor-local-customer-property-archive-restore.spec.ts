import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  archiveImpactItems,
  mergeLocalCustomerContext,
  normalizeArchivedLocalCustomers,
  normalizeLocalCustomerArchiveImpact,
} from '../../src/features/customers/localCustomerArchive';
import type { ContractorLocalContact } from '../../src/types';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(haystack: string, start: string, end: string) {
  const startIndex = haystack.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = haystack.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return haystack.slice(startIndex, endIndex);
}

function localContact(overrides: Partial<ContractorLocalContact> = {}): ContractorLocalContact {
  return {
    id: 'contact-a',
    contractor_id: 'contractor-a',
    homeowner_user_id: null,
    display_name: 'Customer A',
    phone: '',
    email: '',
    notes: '',
    claimed_at: null,
    archived_at: null,
    created_at: '',
    updated_at: '',
    homes: [],
    ...overrides,
  };
}

test.describe('contractor-local customer and property archive/restore v1', () => {
  test('impact DTO rejects malformed counts and produces explicit operational rows', () => {
    const impact = normalizeLocalCustomerArchiveImpact({
      draft_count: 2,
      job_count: 3,
      estimate_count: 4,
      unpaid_invoice_count: 5,
      inspection_count: 6,
      future_calendar_count: 7,
      project_count: 8,
      pending_invitation_count: 9,
      private_note: 'must-not-survive',
    });

    expect(impact).toEqual({
      draftCount: 2,
      jobCount: 3,
      estimateCount: 4,
      unpaidInvoiceCount: 5,
      inspectionCount: 6,
      futureCalendarCount: 7,
      projectCount: 8,
      pendingInvitationCount: 9,
    });
    expect(archiveImpactItems(impact)).toHaveLength(8);
    expect(() => normalizeLocalCustomerArchiveImpact({ ...impact, draft_count: -1 })).toThrow();
    expect(() => normalizeLocalCustomerArchiveImpact({ ...impact, draft_count: 1.5 })).toThrow();
  });

  test('archived and historical normalization retains safe labels without private fields', () => {
    const archived = normalizeArchivedLocalCustomers([{
      id: 'contact-a',
      display_name: 'Customer A',
      archived_at: '2026-08-05T10:00:00.000Z',
      phone: 'must-not-survive',
      notes: 'must-not-survive',
      claim_token: 'must-not-survive',
      homes: [{
        id: 'home-a', nickname: 'Main', address_line1: '1 Main St', city: 'Mobile', state: 'AL',
        archived_at: null, notes: 'must-not-survive', invitation_token: 'must-not-survive',
      }],
    }], 'contractor-a');

    expect(archived).toHaveLength(1);
    expect(archived[0].archived_at).toBe('2026-08-05T10:00:00.000Z');
    expect(archived[0].homes?.[0].address_line1).toBe('1 Main St');
    expect(JSON.stringify(archived)).not.toMatch(/must-not-survive|claim_token|invitation_token/);
  });

  test('context merge preserves archived property labels alongside active rows', () => {
    const archived = localContact({
      homes: [{
        id: 'home-archived', contractor_id: 'contractor-a', local_contact_id: 'contact-a', home_id: null,
        claimed_at: null, archived_at: '2026-08-05T10:00:00.000Z', nickname: 'Old shop', address_line1: '2 Main St',
        address_line2: '', city: 'Mobile', state: 'AL', zip_code: '36602', home_type: '', year_built: '',
        square_feet: '', notes: '', created_at: '', updated_at: '',
      }],
    });
    const active = localContact({
      homes: [{
        id: 'home-active', contractor_id: 'contractor-a', local_contact_id: 'contact-a', home_id: null,
        claimed_at: null, archived_at: null, nickname: 'Main', address_line1: '1 Main St', address_line2: '',
        city: 'Mobile', state: 'AL', zip_code: '36602', home_type: '', year_built: '', square_feet: '',
        notes: '', created_at: '', updated_at: '',
      }],
    });

    const [merged] = mergeLocalCustomerContext([active], [], [archived]);
    expect(merged.homes?.map(home => home.id).sort()).toEqual(['home-active', 'home-archived']);
    expect(merged.homes?.find(home => home.id === 'home-archived')?.archived_at).toBeTruthy();
  });

  test('migration adds paired metadata and an append-only private lifecycle table', () => {
    const sql = source('servsync-contractor-local-customer-property-archive-restore.sql');
    const events = sourceBetween(
      sql,
      'create table if not exists public.contractor_local_customer_lifecycle_events',
      'create or replace function public.servsync_private_assert_active_local_subject',
    );

    expect(sql).toContain('contractor_local_contacts_archive_pair_check');
    expect(sql).toContain('contractor_local_homes_archive_pair_check');
    expect(sql.match(/check \(archived_at is not null or archived_by is null\)/g)).toHaveLength(2);
    expect(sql.match(/archived_by uuid references auth\.users\(id\) on delete set null/g)).toHaveLength(2);
    expect(events).toContain("action in ('customer_archived', 'customer_restored', 'property_archived', 'property_restored')");
    expect(events).toContain('enable row level security');
    expect(events).toContain('force row level security');
    expect(events).toContain('alter table public.contractor_local_customer_lifecycle_events owner to postgres;');
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(events).toContain(`revoke all on table public.contractor_local_customer_lifecycle_events from ${role};`);
    }
    expect(events).toContain('grant select on table public.contractor_local_customer_lifecycle_events to service_role;');
    expect(events).not.toMatch(/create\s+policy|grant\s+(?:insert|update|delete)/i);
    expect(events).toContain("array['token', 'claim_token', 'invite_token', 'phone', 'email', 'notes']");
  });

  test('lifecycle RPCs derive active manager context before tenant-scoped locks', () => {
    const sql = source('servsync-contractor-local-customer-property-archive-restore.sql');
    for (const [start, end] of [
      ['create or replace function public.servsync_archive_local_customer', 'create or replace function public.servsync_restore_local_customer'],
      ['create or replace function public.servsync_restore_local_customer', 'create or replace function public.servsync_archive_local_property'],
      ['create or replace function public.servsync_archive_local_property', 'create or replace function public.servsync_restore_local_property'],
      ['create or replace function public.servsync_restore_local_property', 'create or replace function public.servsync_list_archived_local_customers'],
    ] as const) {
      const rpc = sourceBetween(sql, start, end);
      const contextIndex = rpc.indexOf('servsync_private_local_customer_read_context()');
      const roleIndex = rpc.indexOf("v_access_role not in ('owner', 'admin', 'office')");
      const lockIndex = rpc.indexOf('for update');
      expect(contextIndex).toBeGreaterThanOrEqual(0);
      expect(roleIndex).toBeGreaterThan(contextIndex);
      expect(lockIndex).toBeGreaterThan(roleIndex);
      expect(rpc).toContain('current_user_can_manage_contractor_customers(v_contractor_id)');
      expect(rpc).not.toMatch(/p_contractor_id|current_user_can_write_contractor_jobs|field_tech|viewer/);
    }
  });

  test('customer archive locks parent then ordered children and revokes invitations transactionally', () => {
    const sql = source('servsync-contractor-local-customer-property-archive-restore.sql');
    const rpc = sourceBetween(
      sql,
      'create or replace function public.servsync_archive_local_customer',
      'create or replace function public.servsync_restore_local_customer',
    );
    const contactLock = rpc.indexOf('for update;');
    const homeLock = rpc.indexOf('order by home.id\n   for update;');
    const archiveUpdate = rpc.indexOf('update public.contractor_local_contacts');
    const inviteUpdate = rpc.indexOf('update public.contractor_local_customer_claim_invites');
    const eventInsert = rpc.indexOf('insert into public.contractor_local_customer_lifecycle_events');

    expect(contactLock).toBeGreaterThanOrEqual(0);
    expect(homeLock).toBeGreaterThan(contactLock);
    expect(archiveUpdate).toBeGreaterThan(homeLock);
    expect(inviteUpdate).toBeGreaterThan(archiveUpdate);
    expect(eventInsert).toBeGreaterThan(inviteUpdate);
    expect(rpc).toContain("set status = 'revoked'");
    expect(rpc).toContain("and status = 'pending'");
    expect(rpc).not.toMatch(/delete\s+from|status\s*=\s*'accepted'/i);
  });

  test('restore keeps child archive state and property restore rejects an archived parent', () => {
    const sql = source('servsync-contractor-local-customer-property-archive-restore.sql');
    const restoreCustomer = sourceBetween(
      sql,
      'create or replace function public.servsync_restore_local_customer',
      'create or replace function public.servsync_archive_local_property',
    );
    const restoreProperty = sourceBetween(
      sql,
      'create or replace function public.servsync_restore_local_property',
      'create or replace function public.servsync_list_archived_local_customers',
    );

    expect(restoreCustomer).toContain('update public.contractor_local_contacts');
    expect(restoreCustomer).not.toContain('update public.contractor_local_homes');
    expect(restoreCustomer).not.toContain('contractor_local_customer_claim_invites');
    expect(restoreProperty).toContain('v_contact.archived_at is not null');
    expect(restoreProperty.indexOf('v_contact.archived_at is not null')).toBeLessThan(restoreProperty.indexOf('update public.contractor_local_homes'));
  });

  test('active and historical reads separate selectors from exact work-linked labels', () => {
    const sql = source('servsync-contractor-local-customer-property-archive-restore.sql');
    const active = sourceBetween(
      sql,
      'create or replace function public.servsync_list_local_customer_summaries()',
      'create or replace function public.servsync_get_local_customer_management_detail',
    );
    const historical = sourceBetween(
      sql,
      'create or replace function public.servsync_list_local_customer_historical_context()',
      '-- Keep ordinary directory results active-only.',
    );

    expect(active).toContain('contact.archived_at is null');
    expect(active).toContain('home.archived_at is null');
    expect(historical).toContain('work.local_home_id = home.id');
    expect(historical).not.toContain('work.local_home_id is null or work.local_home_id = home.id');
    for (const table of ['contractor_work_drafts', 'inspections', 'estimates', 'invoices', 'contractor_calendar_events', 'projects']) {
      expect(historical).toContain(`public.${table}`);
    }
    expect(historical).not.toMatch(/'phone'|'email'|'notes'|'home_type'|'year_built'|'square_feet'|actor_user_id|claim_token|invite_token|token_hash/);
  });

  test('canonical active-subject guard is attached to every new-assignment boundary', () => {
    const sql = source('servsync-contractor-local-customer-property-archive-restore.sql');
    const guard = sourceBetween(
      sql,
      'create or replace function public.servsync_private_assert_active_local_subject',
      'comment on function public.servsync_private_assert_active_local_subject',
    );
    expect(guard.indexOf('select contact.*')).toBeLessThan(guard.indexOf('select home.*'));
    expect(guard).toContain('contact.archived_at is not null');
    expect(guard).toContain('v_home.archived_at is not null');
    expect(guard).toContain("message = 'Customer or property is unavailable.'");

    for (const table of [
      'contractor_local_homes', 'contractor_work_drafts', 'contractor_calendar_events',
      'contractor_local_customer_claim_invites', 'contractor_local_customer_claim_invite_homes',
      'projects', 'inspections', 'estimates', 'invoices',
    ]) {
      expect(sql).toMatch(new RegExp(`(?:on public\\.${table}|on\\s+public\\.${table})`));
    }
    expect(sql).toContain("v_new->>'local_contact_id' is not distinct from v_old->>'local_contact_id'");
  });

  test('pre-archive Draft, estimate, job, and calendar lineage is checked at commit', () => {
    const sql = source('servsync-contractor-local-customer-property-archive-restore.sql');
    const outputGuard = sourceBetween(
      sql,
      'create or replace function public.servsync_private_guard_local_output_assignment()',
      'alter function public.servsync_private_guard_local_output_assignment()',
    );

    expect(outputGuard).toContain('draft.created_at <= v_archived_at');
    expect(outputGuard).toContain('job.created_at <= v_archived_at');
    expect(outputGuard).toContain('estimate.created_at <= v_archived_at');
    expect(outputGuard).toContain('event.created_at <= v_archived_at');
    expect(outputGuard).toContain("launch.status = 'succeeded'");
    expect(sql.match(/deferrable initially deferred/g)).toHaveLength(3);
    expect(outputGuard).toContain("raise insufficient_privilege using message = 'Customer or property is unavailable.'");
  });

  test('UI exposes manager lifecycle controls and keeps ordinary selectors active-only', () => {
    const app = source('src/App.tsx');
    const customerWorkspace = sourceBetween(
      app,
      "{contractorTab === 'connections' && !(inspectionView === 'detail' && activeInspection) && (() => {",
      "{(contractorTab === 'inspections' || (contractorTab === 'connections' && inspectionView === 'detail' && activeInspection)) && (",
    );

    expect(app).toContain("useState<'active' | 'archived' | 'inactive'>");
    expect(customerWorkspace).toContain("['active', 'archived', 'inactive']");
    expect(app).toContain('local-archive-lifecycle-dialog');
    expect(customerWorkspace).toContain('Archive customer');
    expect(customerWorkspace).toContain('Restore customer');
    expect(customerWorkspace).toContain('Archive property');
    expect(customerWorkspace).toContain('Restore property');
    expect(customerWorkspace).toContain('local-archived-properties');
    expect(app).toContain("localCustomers: localContacts.map(contact => ({");
    expect(app).toContain('localContacts={localContacts}');
    expect(app).not.toContain(".from('contractor_local_contacts')");
  });

  test('archive refresh clears stale rows and blocks stale unsaved assignments', () => {
    const app = source('src/App.tsx');
    const load = sourceBetween(app, 'const loadContractor = useCallback', 'useEffect(() => {\n    void loadContractor();');
    const beginLocalWork = sourceBetween(app, 'const beginFieldWorkForLocalContact', 'const fieldWorkSubjectLabel');

    expect(load.indexOf('setLocalContacts([])')).toBeLessThan(load.indexOf("supabase.rpc('servsync_list_local_customer_summaries')"));
    expect(load).toContain("supabase.rpc('servsync_list_local_customer_historical_context')");
    expect(load).toContain("supabase.rpc('servsync_list_archived_local_customers')");
    expect(load).toContain('const requiredContextError = localContactsRes.error');
    expect(app).toContain("localCustomerDirectoryLoadState === 'ready'");
    expect(app).toContain("local_contact_id: ''");
    expect(beginLocalWork).toContain('const currentContact = localContacts.find');
    expect(beginLocalWork).toContain('cannot receive new work');
  });

  test('migration preserves direct-table cleanup and avoids connected or destructive lifecycle changes', () => {
    const sql = source('servsync-contractor-local-customer-property-archive-restore.sql');
    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete).*contractor_local_(?:contacts|homes)/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.contractor_local_(?:contacts|homes)/i);
    expect(sql).not.toMatch(/homeowner_contractor_connections|connection_permissions|connection_shared_properties/);
    expect(sql).not.toMatch(/create\s+policy|drop\s+policy/);
    expect(sql).toContain("notify pgrst, 'reload schema'");
    expect(sql.trim().startsWith('-- ServSync Contractor-Local Customer and Property Archive/Restore v1.')).toBe(true);
    expect(sql.trim().endsWith('commit;')).toBe(true);
  });
});
