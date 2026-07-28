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

test.describe('local customer claim invite delivery source checks', () => {
  test('SQL limits token preparation to owner/admin/office and keeps token generation private', () => {
    const sql = source('servsync-local-customer-claim-invites.sql');
    const helper = sourceBetween(
      sql,
      'create or replace function public.servsync_private_can_prepare_local_customer_claim_invites',
      'drop policy if exists "Local claim invites: contractor reads own"',
    );

    expect(helper).toContain('cp.owner_user_id = auth.uid()');
    expect(helper).toContain("tm.role in ('admin', 'office')");
    expect(helper).not.toContain('field_tech');
    expect(helper).not.toContain('viewer');
    expect(sql).toContain('revoke execute on function public.servsync_generate_local_customer_claim_token() from authenticated;');
    expect(sql).toContain('revoke execute on function public.servsync_private_can_prepare_local_customer_claim_invites(uuid) from authenticated;');
  });

  test('SQL adds a guarded prepare RPC that validates state before returning the raw token', () => {
    const sql = source('servsync-local-customer-claim-invites.sql');
    const prepareRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_prepare_local_customer_claim_invite_delivery',
      'create or replace function public.servsync_accept_local_customer_claim',
    );

    expect(prepareRpc).toContain('security definer');
    expect(prepareRpc).toContain('set search_path = public');
    expect(prepareRpc).toContain('auth.uid() is null');
    expect(prepareRpc).toContain('for update');
    expect(prepareRpc).toContain('servsync_private_can_prepare_local_customer_claim_invites(v_invite.contractor_id)');
    expect(prepareRpc).toContain("v_invite.status <> 'pending'");
    expect(prepareRpc).toContain('v_invite.expires_at <= now()');
    expect(prepareRpc).toContain('v_contact.homeowner_user_id is not null');
    expect(prepareRpc).toContain('v_contact.claimed_at is not null');
    expect(prepareRpc).toContain('v_home.home_id is not null');
    expect(prepareRpc).toContain('v_home.claimed_at is not null');
    expect(prepareRpc).toContain("'invite_token', v_invite.invite_token");
    expect(prepareRpc).toContain('revoke execute on function public.servsync_prepare_local_customer_claim_invite_delivery(uuid) from public;');
    expect(prepareRpc).toContain('revoke execute on function public.servsync_prepare_local_customer_claim_invite_delivery(uuid) from anon;');
    expect(prepareRpc).toContain('grant execute on function public.servsync_prepare_local_customer_claim_invite_delivery(uuid) to authenticated;');
  });

  test('SQL create and lookup paths reject stale or claimed local customer targets', () => {
    const sql = source('servsync-local-customer-claim-invites.sql');
    const createRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_create_local_customer_claim_invite',
      'grant execute on function public.servsync_create_local_customer_claim_invite',
    );
    const lookupRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_lookup_local_customer_claim',
      'grant execute on function public.servsync_lookup_local_customer_claim',
    );

    expect(sql).toContain('create unique index if not exists local_customer_claim_invites_one_pending_target_idx');
    expect(sql).toContain("set status = 'expired'");
    expect(createRpc).toContain('from public.contractor_local_contacts');
    expect(createRpc).toContain('for update');
    expect(createRpc).toContain('v_contact.homeowner_user_id is not null');
    expect(createRpc).toContain('v_contact.claimed_at is not null');
    expect(createRpc).toContain('home.home_id is not null or home.claimed_at is not null');
    expect(createRpc).toContain('v_existing_invite');
    expect(createRpc).toContain('reused_existing');
    expect(createRpc).not.toContain("'invite_token', v_invite.invite_token");
    expect(lookupRpc).toContain('v_contact.homeowner_user_id is not null');
    expect(lookupRpc).toContain('v_contact.claimed_at is not null');
    expect(lookupRpc).toContain('v_home.home_id is not null');
    expect(lookupRpc).toContain('v_home.claimed_at is not null');
    expect(lookupRpc).not.toContain("'invite_token'");
  });

  test('app reads token-free invite metadata and prepares Copy/QR tokens just in time', () => {
    const app = source('src/App.tsx');
    const loadSection = sourceBetween(
      app,
      'const [tplRes, inspRes, jobWorkItemsRes',
      'if (!tplRes.error) setInspectionTemplates',
    );
    const createSection = sourceBetween(
      app,
      'const createLocalCustomerClaimInvite = async',
      'const prepareLocalCustomerClaimInviteDelivery = async',
    );
    const prepareSection = sourceBetween(
      app,
      'const prepareLocalCustomerClaimInviteDelivery = async',
      'const revokeLocalCustomerClaimInvite = async',
    );
    const claimInviteUi = sourceBetween(
      app,
      '<p className="text-sm font-bold text-slate-950">Homeowner claim invite</p>',
      '{localCustomer.notes && (',
    );

    expect(loadSection).toContain("supabase.rpc('servsync_list_local_customer_claim_invites'");
    expect(loadSection).not.toContain(".from('contractor_local_customer_claim_invites')");
    expect(createSection).not.toContain('invite_token');
    expect(prepareSection).toContain("supabase.rpc('servsync_prepare_local_customer_claim_invite_delivery'");
    expect(prepareSection).toContain('navigator.clipboard?.writeText(localCustomerClaimInviteUrl(token))');
    expect(prepareSection).toContain('setPreparedLocalClaimInviteQr({ inviteId: invite.id, token })');
    expect(claimInviteUi).not.toContain('localClaimInviteLink');
    expect(claimInviteUi).toContain('ServSync does not email or text this invite');
    expect(claimInviteUi).toContain('Only the contractor owner, admin, or office role');
  });

  test('final containment SQL removes broad direct claim-invite table reads', () => {
    const containment = source('servsync-local-customer-claim-invite-token-containment.sql');

    expect(containment).toContain('revoke select on public.contractor_local_customer_claim_invites from public;');
    expect(containment).toContain('revoke select on public.contractor_local_customer_claim_invites from anon;');
    expect(containment).toContain('revoke select on public.contractor_local_customer_claim_invites from authenticated;');
    expect(containment).toContain("notify pgrst, 'reload schema'");
  });
});
