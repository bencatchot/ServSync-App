import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canCreateContractorLocalCustomersUi,
  canManageContractorCustomersUi,
} from '../../src/features/customers/customerManagementPermissions';
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

test.describe('customer management edit boundary', () => {
  test('UI capability helper allows owner/admin/office and denies field tech, viewer, inactive, and unrelated users', () => {
    expect(canManageContractorCustomersUi(contractor, null, 'owner-user')).toBe(true);
    expect(canManageContractorCustomersUi(contractor, teamAccess('admin-user', 'admin'), 'admin-user')).toBe(true);
    expect(canManageContractorCustomersUi(contractor, teamAccess('office-user', 'office'), 'office-user')).toBe(true);
    expect(canManageContractorCustomersUi(contractor, teamAccess('field-user', 'field_tech'), 'field-user')).toBe(false);
    expect(canManageContractorCustomersUi(contractor, teamAccess('viewer-user', 'viewer'), 'viewer-user')).toBe(false);
    expect(canManageContractorCustomersUi(contractor, teamAccess('disabled-admin', 'admin', 'disabled'), 'disabled-admin')).toBe(false);
    expect(canManageContractorCustomersUi(contractor, teamAccess('admin-user', 'admin'), 'unrelated-user')).toBe(false);
    expect(canManageContractorCustomersUi(contractor, null, '')).toBe(false);

    expect(canCreateContractorLocalCustomersUi(contractor, 'owner-user')).toBe(true);
    expect(canCreateContractorLocalCustomersUi(contractor, 'admin-user')).toBe(false);
    expect(canCreateContractorLocalCustomersUi(contractor, 'office-user')).toBe(false);
    expect(canCreateContractorLocalCustomersUi(contractor, 'field-user')).toBe(false);
    expect(canCreateContractorLocalCustomersUi(contractor, 'viewer-user')).toBe(false);
  });

  test('SQL helper derives owner/admin/office authority and fails closed for every other caller', () => {
    const sql = source('servsync-customer-management-edit-boundary.sql');
    const helper = sourceBetween(
      sql,
      'create or replace function public.current_user_can_manage_contractor_customers',
      'comment on function public.current_user_can_manage_contractor_customers',
    );

    expect(helper).toContain('security definer');
    expect(helper).toContain('set search_path = public');
    expect(helper).toContain('auth.uid() is not null');
    expect(helper).toContain('contractor.owner_user_id = auth.uid()');
    expect(helper).toContain("member.status = 'active'");
    expect(helper).toContain("member.role in ('admin', 'office')");
    expect(helper).not.toMatch(/field_tech|viewer|current_user_can_write_contractor_jobs|current_user_is_platform_admin/);

    expect(sql).toContain('revoke all on function public.current_user_can_manage_contractor_customers(uuid) from public;');
    expect(sql).toContain('revoke all on function public.current_user_can_manage_contractor_customers(uuid) from anon;');
    expect(sql).toContain('revoke all on function public.current_user_can_manage_contractor_customers(uuid) from authenticated;');
    expect(sql).toContain('grant execute on function public.current_user_can_manage_contractor_customers(uuid) to authenticated;');
  });

  test('customer edit scopes authorization before locking and preserves claim protections', () => {
    const sql = source('servsync-customer-management-edit-boundary.sql');
    const rpc = sourceBetween(
      sql,
      'create or replace function public.servsync_update_local_contact_profile',
      'create or replace function public.servsync_create_local_home',
    );
    const authIndex = rpc.indexOf('current_user_can_manage_contractor_customers(contact.contractor_id)');
    const lockIndex = rpc.indexOf('for update of contact');

    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(authIndex);
    expect(rpc).toContain("raise exception 'Local customer is unavailable.'");
    expect(rpc).not.toContain('Local customer not found.');
    expect(rpc).not.toContain('current_user_can_write_contractor_jobs');
    expect(rpc).toContain('v_contact.homeowner_user_id is not null');
    expect(rpc).toContain('v_contact.claimed_at is not null');
    expect(rpc).toContain('home.home_id is not null or home.claimed_at is not null');
    expect(rpc).toContain('update public.contractor_local_customer_claim_invites');
    expect(rpc).toContain("and status = 'pending'");
    expect(rpc).not.toMatch(/claim_token|token_hash|raw_token/);
  });

  test('property creation and edit tenant-scope parent and property before locking or mutation', () => {
    const sql = source('servsync-customer-management-edit-boundary.sql');
    const createRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_create_local_home',
      'create or replace function public.servsync_update_local_home',
    );
    const updateRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_update_local_home',
      'revoke all on function public.servsync_update_local_contact_profile',
    );

    expect(createRpc.indexOf('current_user_can_manage_contractor_customers(contact.contractor_id)'))
      .toBeLessThan(createRpc.indexOf('for share of contact'));
    expect(createRpc).toContain("raise exception 'Local customer is unavailable.'");
    expect(createRpc).not.toContain('current_user_can_write_contractor_jobs');
    expect(createRpc).toContain('v_contact.contractor_id');
    expect(createRpc).toContain('v_contact.id');

    expect(updateRpc).toContain('join public.contractor_local_contacts contact');
    expect(updateRpc).toContain('contact.contractor_id = home.contractor_id');
    expect(updateRpc.indexOf('current_user_can_manage_contractor_customers(home.contractor_id)'))
      .toBeLessThan(updateRpc.indexOf('for update of home'));
    expect(updateRpc).toContain("raise exception 'Local property is unavailable.'");
    expect(updateRpc).not.toContain('current_user_can_write_contractor_jobs');
    expect(updateRpc).toContain('v_home.home_id is not null or v_home.claimed_at is not null');
    expect(updateRpc).not.toMatch(/\bhome_id\s*=|\bclaimed_at\s*=/);
  });

  test('migration changes no direct-table, Draft, Job, connected-property, or invitation authority', () => {
    const sql = source('servsync-customer-management-edit-boundary.sql');

    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete).*on\s+(?:table\s+)?public\.contractor_local_/i);
    expect(sql).not.toMatch(/create\s+policy|alter\s+table|contractor_work_drafts|servsync_create_home_property_proposal/);
    expect(sql).not.toMatch(/servsync_(?:create|prepare|revoke)_local_customer_claim_invite/);
    expect(sql).toContain("notify pgrst, 'reload schema'");
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
  });

  test('App hides local identity/property controls outside management roles and keeps creation owner-only', () => {
    const app = source('src/App.tsx');
    const customerWorkspace = sourceBetween(
      app,
      "{contractorTab === 'connections' && !(inspectionView === 'detail' && activeInspection) && (() => {",
      "{(contractorTab === 'inspections' || (contractorTab === 'connections' && inspectionView === 'detail' && activeInspection)) && (",
    );
    const mutationHandlers = sourceBetween(
      app,
      'const createLocalContact = async',
      'const selectedClaimInviteHomeIdsForContact =',
    );

    expect(app).toContain('canManageContractorCustomersUi(contractorDraft, teamAccess, profile.id)');
    expect(app).toContain('canCreateContractorLocalCustomersUi(contractorDraft, profile.id)');
    expect(customerWorkspace).toContain('!SERVSYNC_DEMO_PRESENTATION_MODE && canCreateContractorLocalCustomers');
    expect(customerWorkspace).toContain('localCustomer && !localCustomerIsClaimed && localCustomerManagementDetailReady');
    expect(customerWorkspace).toContain('isAdding && localCustomerManagementDetailReady');
    expect(customerWorkspace).toContain('editingLocalHome && localCustomerManagementDetailReady');
    expect(customerWorkspace).toContain('canManageContractorCustomers');
    expect(customerWorkspace).toContain("localCustomerManagementDetailState === 'ready'");
    expect(mutationHandlers).toContain('if (!canCreateContractorLocalCustomers)');
    expect(mutationHandlers).toContain('if (!canManageContractorCustomers)');
    expect(app).toContain("currentContractorTeamRole === 'field_tech'");
    expect(app).toContain('Field techs cannot create contractor Draft Jobs in this workflow yet.');
  });
});
