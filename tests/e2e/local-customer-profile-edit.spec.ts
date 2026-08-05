import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function sourceBetween(haystack: string, start: string, end: string) {
  const startIndex = haystack.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = haystack.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return haystack.slice(startIndex, endIndex);
}

test.describe('local customer profile edit source checks', () => {
  test('SQL edits only unclaimed contractor-owned local customer profile fields', () => {
    const sql = source('servsync-customer-management-edit-boundary.sql');
    const rpc = sourceBetween(
      sql,
      'create or replace function public.servsync_update_local_contact_profile',
      'create or replace function public.servsync_create_local_home',
    );

    expect(rpc).toContain('security definer');
    expect(rpc).toContain('set search_path = public');
    expect(rpc).toContain('where contact.id = p_local_contact_id');
    expect(rpc).toContain('current_user_can_manage_contractor_customers(contact.contractor_id)');
    expect(rpc).toContain('for update of contact');
    expect(rpc).toContain("raise exception 'Local customer is unavailable.'");
    expect(rpc).not.toContain('current_user_can_write_contractor_jobs');
    expect(rpc).toContain('v_contact.homeowner_user_id is not null');
    expect(rpc).toContain('v_contact.claimed_at is not null');
    expect(rpc).toContain('home.home_id is not null or home.claimed_at is not null');
    expect(rpc).toContain('raise exception \'This customer is linked to a homeowner profile.');

    expect(rpc).toContain('display_name = v_next_display_name');
    expect(rpc).toContain('phone = v_next_phone');
    expect(rpc).toContain('email = v_next_email');
    expect(rpc).toContain('notes = v_next_notes');
    expect(rpc).not.toMatch(/\baddress_line1\s*=/);
    expect(rpc).not.toMatch(/\bhome_id\s*=/);
    expect(rpc).not.toMatch(/\bhomeowner_user_id\s*=/);
  });

  test('SQL revokes stale pending claim invites when copied profile fields change', () => {
    const sql = source('servsync-customer-management-edit-boundary.sql');
    const rpc = sourceBetween(
      sql,
      'create or replace function public.servsync_update_local_contact_profile',
      'create or replace function public.servsync_create_local_home',
    );

    expect(rpc).toContain('v_public_claim_fields_changed');
    expect(rpc).toContain('v_next_display_name is distinct from coalesce(v_contact.display_name');
    expect(rpc).toContain('v_next_phone is distinct from coalesce(v_contact.phone');
    expect(rpc).toContain('v_next_email is distinct from coalesce(v_contact.email');
    expect(rpc).toContain('update public.contractor_local_customer_claim_invites');
    expect(rpc).toContain("set status = 'revoked'");
    expect(rpc).toContain("and status = 'pending'");
    expect(rpc).toContain('get diagnostics v_revoked_invite_count = row_count');
    expect(rpc).toContain('revoked_pending_claim_invite_count');

    const notesOnlyUpdateSection = sourceBetween(
      rpc,
      'v_public_claim_fields_changed :=',
      'update public.contractor_local_contacts',
    );
    expect(notesOnlyUpdateSection).not.toContain('v_next_notes');
  });

  test('SQL exposes only the intended authenticated RPC grant', () => {
    const sql = source('servsync-customer-management-edit-boundary.sql');

    expect(sql).toContain('revoke all on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) from public;');
    expect(sql).toContain('revoke all on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) from anon;');
    expect(sql).toContain('revoke all on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) from authenticated;');
    expect(sql).toContain('grant execute on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) to authenticated;');
    expect(sql).toContain("notify pgrst, 'reload schema'");
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
  });

  test('app UI wires Edit customer without changing the property editor', () => {
    const app = source('src/App.tsx');
    const profileSave = sourceBetween(
      app,
      'const saveLocalCustomerProfileEdit = async',
      'const openAddLocalHomeForm =',
    );
    const profileUi = sourceBetween(
      app,
      '<h4 id="edit-local-customer-profile-title"',
      '<div className="sm:col-span-2 rounded-xl border border-blue-100',
    );

    expect(app).toContain('Edit customer');
    expect(profileSave).toContain("supabase.rpc('servsync_update_local_contact_profile'");
    expect(profileSave).toContain('p_display_name');
    expect(profileSave).toContain('p_phone');
    expect(profileSave).toContain('p_email');
    expect(profileSave).toContain('p_notes');
    expect(profileSave).toContain('localCustomerProfileIsClaimed(contact)');
    expect(profileSave).toContain('revoked_pending_claim_invite_count');
    expect(profileSave).not.toContain("servsync_update_local_home'");

    expect(profileUi).toContain('Customer name');
    expect(profileUi).toContain('Phone');
    expect(profileUi).toContain('Email');
    expect(profileUi).toContain('Contractor-private notes');
    expect(profileUi).toContain('not copied into homeowner-facing profile fields');
    expect(profileUi).toContain('revokes any pending claim invite');
    expect(profileUi).not.toContain('Street address');
    expect(profileUi).not.toContain('Property label');
  });
});
