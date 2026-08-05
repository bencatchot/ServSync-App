import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canCreateContractorLocalCustomersUi,
} from '../../src/features/customers/customerManagementPermissions';
import { normalizeCreatedLocalCustomer } from '../../src/features/customers/localCustomerDirectory';
import type { ContractorProfile, ContractorTeamAccess, ContractorTeamRole, ContractorTeamStatus } from '../../src/types';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(haystack: string, start: string, end: string) {
  const startIndex = haystack.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = haystack.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return haystack.slice(startIndex, endIndex);
}

function teamAccess(userId: string, role: ContractorTeamRole, status: ContractorTeamStatus = 'active') {
  return {
    contractor_id: 'contractor-a',
    can_manage: role === 'admin',
    included_seats: 1,
    active_seat_count: status === 'active' ? 1 : 0,
    extra_seat_count: 0,
    invites: [],
    members: [{
      id: `member-${userId}`,
      contractor_id: 'contractor-a',
      user_id: userId,
      email: `${userId}@example.test`,
      display_name: userId,
      role,
      status,
      accepted_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }],
  } satisfies ContractorTeamAccess;
}

const contractor = { owner_user_id: 'owner-user' } as Pick<ContractorProfile, 'owner_user_id'>;

test.describe('Admin/Office customer creation parity v1', () => {
  test('creation UI policy exactly matches the established customer-management roles', () => {
    expect(canCreateContractorLocalCustomersUi(contractor, null, 'owner-user')).toBe(true);
    expect(canCreateContractorLocalCustomersUi(contractor, teamAccess('admin-user', 'admin'), 'admin-user')).toBe(true);
    expect(canCreateContractorLocalCustomersUi(contractor, teamAccess('office-user', 'office'), 'office-user')).toBe(true);
    expect(canCreateContractorLocalCustomersUi(contractor, teamAccess('field-user', 'field_tech'), 'field-user')).toBe(false);
    expect(canCreateContractorLocalCustomersUi(contractor, teamAccess('viewer-user', 'viewer'), 'viewer-user')).toBe(false);
    expect(canCreateContractorLocalCustomersUi(contractor, teamAccess('inactive-user', 'admin', 'disabled'), 'inactive-user')).toBe(false);
    expect(canCreateContractorLocalCustomersUi(contractor, null, 'removed-user')).toBe(false);
    expect(canCreateContractorLocalCustomersUi(contractor, teamAccess('admin-user', 'admin'), 'other-user')).toBe(false);
    expect(canCreateContractorLocalCustomersUi(null, null, 'homeowner-user')).toBe(false);
  });

  test('created response validation enforces tenant and parent bindings and drops unknown fields', () => {
    const created = normalizeCreatedLocalCustomer({
      contact: {
        id: 'contact-a', contractor_id: 'contractor-a', display_name: 'Customer A', phone: '5551234567',
        email: 'customer@example.test', notes: 'Private note', created_at: 'created', updated_at: 'updated',
        claim_token: 'must-not-survive',
      },
      home: {
        id: 'home-a', contractor_id: 'contractor-a', local_contact_id: 'contact-a', nickname: 'Main home',
        address_line1: '1 Main St', address_line2: '', city: 'Mobile', state: 'AL', zip_code: '36602',
        home_type: 'house', year_built: '2001', square_feet: '1800', notes: 'Gate note',
        created_at: 'created', updated_at: 'updated', invitation_secret: 'must-not-survive',
      },
    }, 'contractor-a');

    expect(created.contact.contractor_id).toBe('contractor-a');
    expect(created.home.local_contact_id).toBe(created.contact.id);
    expect(JSON.stringify(created)).not.toMatch(/must-not-survive|claim_token|invitation_secret/);
    expect(() => normalizeCreatedLocalCustomer({
      contact: { id: 'contact-a', contractor_id: 'contractor-b' },
      home: { id: 'home-a', contractor_id: 'contractor-a', local_contact_id: 'contact-a' },
    }, 'contractor-a')).toThrow('Created local customer response was invalid.');
    expect(() => normalizeCreatedLocalCustomer({
      contact: { id: 'contact-a', contractor_id: 'contractor-a' },
      home: { id: 'home-a', contractor_id: 'contractor-a', local_contact_id: 'contact-b' },
    }, 'contractor-a')).toThrow('Created local customer response was invalid.');
  });

  test('migration derives tenant and management authority before the atomic inserts', () => {
    const sql = source('servsync-admin-office-customer-creation-parity.sql');
    const rpc = sourceBetween(
      sql,
      'create or replace function public.servsync_create_local_contact',
      'alter function public.servsync_create_local_contact',
    );
    const identityIndex = rpc.indexOf('from public.servsync_current_contractor_profile() contractor');
    const authorityIndex = rpc.indexOf('current_user_can_manage_contractor_customers(contractor.id)');
    const contactInsertIndex = rpc.indexOf('insert into public.contractor_local_contacts');
    const homeInsertIndex = rpc.indexOf('insert into public.contractor_local_homes');

    expect(rpc).toContain('security definer');
    expect(rpc).toContain('set search_path = public');
    expect(rpc).toContain('auth.uid() is null');
    expect(identityIndex).toBeGreaterThanOrEqual(0);
    expect(authorityIndex).toBeGreaterThan(identityIndex);
    expect(contactInsertIndex).toBeGreaterThan(authorityIndex);
    expect(homeInsertIndex).toBeGreaterThan(contactInsertIndex);
    expect(rpc).not.toMatch(/p_contractor_id|current_user_can_write_contractor_jobs|current_user_is_platform_admin/);
    expect(rpc).toContain("raise insufficient_privilege using message = 'Customer creation is unavailable.'");
  });

  test('migration returns an explicit bounded DTO and preserves normalization behavior', () => {
    const sql = source('servsync-admin-office-customer-creation-parity.sql');
    const rpc = sourceBetween(
      sql,
      'create or replace function public.servsync_create_local_contact',
      'alter function public.servsync_create_local_contact',
    );

    expect(rpc).not.toMatch(/to_jsonb\s*\(\s*v_(?:contact|home)/);
    expect(rpc).not.toMatch(/claim_token|invite_token|token_hash|homeowner_user_id|home_id|claimed_at/);
    for (const key of [
      'id', 'contractor_id', 'local_contact_id', 'display_name', 'phone', 'email', 'notes',
      'nickname', 'address_line1', 'address_line2', 'city', 'state', 'zip_code', 'home_type',
      'year_built', 'square_feet', 'created_at', 'updated_at',
    ]) {
      expect(rpc).toContain(`'${key}'`);
    }
    expect(rpc).toContain("coalesce(nullif(trim(coalesce(p_home_nickname, '')), ''), 'Home')");
    expect(rpc).toContain("trim(coalesce(p_phone, ''))");
    expect(rpc).toContain("trim(coalesce(p_email, ''))");
  });

  test('migration narrows RPC grants without changing tables, RLS, claims, Drafts, or work authority', () => {
    const sql = source('servsync-admin-office-customer-creation-parity.sql');
    const signature = 'public.servsync_create_local_contact(\n  text, text, text, text, text, text, text, text, text, text, text, text, text, text\n)';

    expect(sql).toContain(`alter function ${signature} owner to postgres;`);
    expect(sql).toContain(`revoke all on function ${signature} from public;`);
    expect(sql).toContain(`revoke all on function ${signature} from anon;`);
    expect(sql).toContain(`revoke all on function ${signature} from authenticated;`);
    expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
    expect(sql).not.toMatch(/create\s+policy|drop\s+policy|alter\s+table|grant\s+(?:select|insert|update|delete)\s+on/i);
    expect(sql).not.toMatch(/contractor_work_drafts|inspections|estimates|invoices|claim_invite|connection_shared|home_property_proposal/);
  });

  test('every customer-creation entry point uses the shared role policy and guarded RPC', () => {
    const app = source('src/App.tsx');
    const createHandler = sourceBetween(app, 'const createLocalContact = async', 'const openEstimateCustomerCreate =');

    expect(app).toContain('canCreateContractorLocalCustomersUi(contractorDraft, teamAccess, profile.id)');
    expect(createHandler).toContain('if (!canCreateContractorLocalCustomers)');
    expect(createHandler).toContain("supabase.rpc('servsync_create_local_contact'");
    expect(createHandler).not.toMatch(/p_contractor_id|\.from\('contractor_local_contacts'\)/);
    expect(app.match(/showLocalContactForm && canCreateContractorLocalCustomers/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(app).toContain('estimateCustomerCreateOpen && canCreateContractorLocalCustomers');
    expect(app).toContain('!SERVSYNC_DEMO_PRESENTATION_MODE && canCreateContractorLocalCustomers');
    expect(app).toContain('Only the contractor owner, admin, or office role can add a customer in this workflow.');
    expect(app).toContain("currentContractorTeamRole === 'field_tech'");
    expect(app).toContain('Field techs cannot create contractor Draft Jobs in this workflow yet.');
  });
});
