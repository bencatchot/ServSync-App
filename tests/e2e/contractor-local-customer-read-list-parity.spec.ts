import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  localCustomerDirectoryFailureState,
  normalizeLocalCustomerManagementDetail,
  normalizeLocalCustomerSummaries,
} from '../../src/features/customers/localCustomerDirectory';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(haystack: string, start: string, end: string) {
  const startIndex = haystack.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = haystack.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return haystack.slice(startIndex, endIndex);
}

test.describe('contractor local customer read/list parity', () => {
  test('summary normalization keeps only workflow-safe customer and property fields', () => {
    const [summary] = normalizeLocalCustomerSummaries([{
      id: 'contact-a',
      display_name: 'Customer A',
      phone: 'must-not-survive',
      email: 'must-not-survive',
      notes: 'must-not-survive',
      claim_token: 'must-not-survive',
      homes: [{
        id: 'home-a',
        nickname: 'Main home',
        address_line1: '1 Main St',
        address_line2: '',
        city: 'Mobile',
        state: 'AL',
        zip_code: '36602',
        notes: 'must-not-survive',
        home_type: 'must-not-survive',
      }],
    }], 'contractor-a');

    expect(summary).toMatchObject({
      id: 'contact-a',
      contractor_id: 'contractor-a',
      display_name: 'Customer A',
      phone: '',
      email: '',
      notes: '',
      homeowner_user_id: null,
      claimed_at: null,
    });
    expect(summary.homes).toEqual([expect.objectContaining({
      id: 'home-a',
      address_line1: '1 Main St',
      notes: '',
      home_type: '',
      year_built: '',
      square_feet: '',
    })]);
    expect(JSON.stringify(summary)).not.toMatch(/must-not-survive|claim_token/);
  });

  test('management detail validates tenant binding and retains manager fields only in detail state', () => {
    const detail = normalizeLocalCustomerManagementDetail({
      id: 'contact-a',
      contractor_id: 'contractor-a',
      homeowner_user_id: null,
      display_name: 'Customer A',
      phone: '5551234567',
      email: 'customer@example.test',
      notes: 'Manager note',
      claimed_at: null,
      created_at: '2026-08-05T00:00:00.000Z',
      updated_at: '2026-08-05T00:00:00.000Z',
      homes: [{
        id: 'home-a', contractor_id: 'contractor-a', local_contact_id: 'contact-a',
        home_id: null, claimed_at: null, nickname: 'Main home', address_line1: '1 Main St',
        address_line2: '', city: 'Mobile', state: 'AL', zip_code: '36602', home_type: 'house',
        year_built: '2001', square_feet: '1800', notes: 'Gate note', created_at: '', updated_at: '',
      }],
    }, 'contractor-a');
    expect(detail.phone).toBe('5551234567');
    expect(detail.notes).toBe('Manager note');
    expect(detail.homes?.[0].notes).toBe('Gate note');
    expect(() => normalizeLocalCustomerManagementDetail({ ...detail, contractor_id: 'contractor-b' }, 'contractor-a'))
      .toThrow('Local customer detail response was invalid.');
    expect(() => normalizeLocalCustomerManagementDetail({
      ...detail,
      homes: [{ ...detail.homes?.[0], contractor_id: 'contractor-b' }],
    }, 'contractor-a')).toThrow('Local customer detail response was invalid.');
  });

  test('failure classification separates authority failures from temporary load failures', () => {
    expect(localCustomerDirectoryFailureState({ code: '42501' })).toBe('unauthorized');
    expect(localCustomerDirectoryFailureState({ status: 403 })).toBe('unauthorized');
    expect(localCustomerDirectoryFailureState({ code: 'P0001' })).toBe('error');
  });

  test('SQL derives role and tenant, redacts summaries, and limits viewer rows to readable work', () => {
    const sql = source('servsync-contractor-local-customer-read-list-parity.sql');
    const context = sourceBetween(
      sql,
      'create or replace function public.servsync_private_local_customer_read_context()',
      'comment on function public.servsync_private_local_customer_read_context()',
    );
    const list = sourceBetween(
      sql,
      'create or replace function public.servsync_list_local_customer_summaries()',
      'comment on function public.servsync_list_local_customer_summaries()',
    );

    expect(context).toContain('from public.servsync_current_contractor_profile()');
    expect(context).toContain('auth.uid()');
    expect(context).toContain("member.status = 'active'");
    expect(context).toContain("member.role in ('admin', 'office', 'field_tech', 'viewer')");
    expect(list).toContain("v_access_role <> 'viewer'");
    for (const table of ['contractor_work_drafts', 'inspections', 'estimates', 'invoices']) {
      expect(list).toContain(`public.${table}`);
    }
    expect(list).toContain('draft.local_home_id = home.id');
    expect(list).toContain('job.local_home_id = home.id');
    expect(list).toContain('estimate.local_home_id = home.id');
    expect(list).toContain('invoice.local_home_id = home.id');
    expect(list).not.toMatch(/'phone'|'email'|'notes'|'home_type'|'year_built'|'square_feet'|claim_token|invite_token/);
  });

  test('SQL excludes claimed snapshots and keeps manager detail tenant-scoped', () => {
    const sql = source('servsync-contractor-local-customer-read-list-parity.sql');
    const list = sourceBetween(
      sql,
      'create or replace function public.servsync_list_local_customer_summaries()',
      'comment on function public.servsync_list_local_customer_summaries()',
    );
    const detail = sourceBetween(
      sql,
      'create or replace function public.servsync_get_local_customer_management_detail',
      'comment on function public.servsync_get_local_customer_management_detail',
    );

    for (const body of [list, detail]) {
      expect(body).toContain('contact.homeowner_user_id is null');
      expect(body).toContain('contact.claimed_at is null');
      expect(body).toContain('claimed_home.home_id is not null or claimed_home.claimed_at is not null');
    }
    expect(detail).toContain("v_access_role not in ('owner', 'admin', 'office')");
    expect(detail).toContain('public.current_user_can_manage_contractor_customers(v_contractor_id)');
    expect(detail).toContain('contact.contractor_id = v_contractor_id');
    expect(detail).toContain("message = 'Local customer is unavailable.'");
    expect(detail).not.toContain('to_jsonb(contact)');
    expect(detail).not.toContain('to_jsonb(home)');
    for (const allowedKey of [
      'display_name', 'phone', 'email', 'notes', 'home_type', 'year_built', 'square_feet',
    ]) {
      expect(detail).toContain(`'${allowedKey}'`);
    }
    expect(detail).not.toMatch(/claim_token|invite_token|token_hash/);
  });

  test('function grants are narrow and the migration leaves table policy cleanup for a later slice', () => {
    const sql = source('servsync-contractor-local-customer-read-list-parity.sql');
    for (const signature of [
      'public.servsync_list_local_customer_summaries()',
      'public.servsync_get_local_customer_management_detail(uuid)',
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public;`);
      expect(sql).toContain(`revoke all on function ${signature} from anon;`);
      expect(sql).toContain(`revoke all on function ${signature} from authenticated;`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
    }
    expect(sql).not.toMatch(/create\s+policy|drop\s+policy|alter\s+table|grant\s+(?:select|insert|update|delete)\s+on/i);
    expect(sql).not.toMatch(/servsync_(?:create|update)_local_(?:contact|home)/);
  });

  test('App uses the controlled boundary and distinguishes loading, empty, unavailable, retry, and stale responses', () => {
    const app = source('src/App.tsx');
    const load = sourceBetween(app, 'const loadContractor = useCallback', 'useEffect(() => {\n    void loadContractor();');

    expect(app).toContain("supabase.rpc('servsync_list_local_customer_summaries')");
    expect(app).toContain("supabase.rpc('servsync_get_local_customer_management_detail'");
    expect(app).not.toContain(".from('contractor_local_contacts')");
    expect(load.indexOf('setLocalContacts([])')).toBeLessThan(load.indexOf("supabase.rpc('servsync_list_local_customer_summaries')"));
    expect(load).toContain('localCustomerDirectoryRequestId === localCustomerDirectoryRequestIdRef.current');
    expect(app).toContain('local-customer-directory-loading');
    expect(app).toContain('local-customer-directory-error');
    expect(app).toContain("localCustomerDirectoryLoadState === 'ready'");
    expect(app).toContain('Try again');
    expect(app).toContain('localCustomerManagementDetailReady');
    expect(app).toContain('Contact details and private notes are limited to the contractor owner, admin, and office roles.');
  });

  test('customer detail contains long local names within the mobile layout', () => {
    const app = source('src/App.tsx');

    expect(app).toContain('<div className="flex min-w-0 flex-wrap items-center gap-2">');
    expect(app).toContain('<h2 className="min-w-0 break-words font-bold text-slate-950 text-xl">{headerName}</h2>');
    expect(app).toContain('<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">');
    expect(app).toContain('<p className="break-words text-sm text-slate-800 font-medium">{localCustomer.display_name');
    expect(app).toContain('<div className="grid grid-cols-1 gap-3">');
    expect(app).toContain('<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">');
    expect(app).toContain('<span className="block break-words font-semibold">{home.nickname');
    expect(app).toContain('<p className="mt-1 break-words text-sm font-bold text-slate-950">');
  });
});
