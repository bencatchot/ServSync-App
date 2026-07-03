import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-contractor-referral-foundation.sql');
const sql = readFileSync(sqlPath, 'utf8');
const compactSql = sql.replace(/\s+/g, ' ').toLowerCase();

test.describe('contractor-to-contractor referral foundation source guardrails', () => {
  test('creates a dedicated typed referral invite table and does not reuse existing invite/referral storage', () => {
    expect(sql).toContain('create table if not exists public.servsync_referral_invites');
    expect(sql).toContain("default 'contractor_refers_contractor'");
    expect(sql).toContain("check (referral_type = 'contractor_refers_contractor')");
    expect(sql).toContain("'homeowner_invites_contractor'");
    expect(sql).toContain("'contractor_invites_homeowner'");
    expect(sql).toContain("'contractor_refers_contractor'");

    for (const existingStorage of [
      'insert into public.homeowner_contractor_invite_leads',
      'insert into public.referrals',
      'insert into public.referral_codes',
      'insert into public.contractor_invites',
      'insert into public.contractor_team_invites',
      'insert into public.home_membership_email_invites',
    ]) {
      expect(compactSql, `foundation should not store contractor referrals in ${existingStorage}`).not.toContain(existingStorage);
    }
  });

  test('keeps table access RPC-mediated with RLS and no browser table grants', () => {
    expect(sql).toContain('alter table public.servsync_referral_invites enable row level security');
    expect(sql).toContain('using (public.current_user_is_platform_admin())');
    expect(sql).toContain('with check (public.current_user_is_platform_admin())');

    for (const role of ['public', 'anon', 'authenticated']) {
      expect(sql).toContain(`revoke all on table public.servsync_referral_invites from ${role}`);
    }

    expect(sql).not.toMatch(/grant\s+select\s+on\s+(table\s+)?public\.servsync_referral_invites\s+to\s+authenticated/i);
    expect(sql).not.toMatch(/grant\s+insert\s+on\s+(table\s+)?public\.servsync_referral_invites\s+to\s+authenticated/i);
    expect(sql).not.toMatch(/grant\s+update\s+on\s+(table\s+)?public\.servsync_referral_invites\s+to\s+authenticated/i);
    expect(sql).not.toMatch(/grant\s+delete\s+on\s+(table\s+)?public\.servsync_referral_invites\s+to\s+authenticated/i);
  });

  test('limits contractor submission to owner, admin, or office users', () => {
    expect(sql).toContain('create or replace function public.current_user_can_submit_contractor_referrals');
    expect(sql).toMatch(/language sql\s+security definer\s+set search_path = public\s+stable/i);
    expect(sql).toContain('cp.owner_user_id = auth.uid()');
    expect(sql).toContain("tm.role in ('admin', 'office')");
    expect(sql).not.toContain("tm.role in ('admin', 'office', 'field_tech')");
    expect(sql).not.toContain("tm.role in ('admin', 'office', 'field_tech', 'viewer')");
  });

  test('defines hardened RPCs for contractor submit and platform-admin tracking', () => {
    const rpcs = [
      'current_user_can_submit_contractor_referrals',
      'servsync_submit_contractor_referral_invite',
      'servsync_admin_referral_invites',
      'servsync_admin_update_referral_invite',
    ];

    for (const rpc of rpcs) {
      expect(sql, `${rpc} should be defined`).toContain(`create or replace function public.${rpc}`);
      expect(sql, `${rpc} should be SECURITY DEFINER with public search_path`).toMatch(
        new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*?security definer[\\s\\S]*?set search_path = public`, 'i'),
      );
      expect(sql, `${rpc} should deny PUBLIC execute`).toMatch(
        new RegExp(`revoke (all on function|execute on function) public\\.${rpc}[\\s\\S]*? from public`, 'i'),
      );
      expect(sql, `${rpc} should deny anon execute`).toMatch(
        new RegExp(`revoke (all on function|execute on function) public\\.${rpc}[\\s\\S]*? from anon`, 'i'),
      );
      expect(sql, `${rpc} should grant authenticated execute behind internal guards`).toMatch(
        new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*? to authenticated`, 'i'),
      );
    }

    expect(sql).toContain('if not public.current_user_is_platform_admin() then');
    expect(sql).toContain('where public.current_user_is_platform_admin()');
  });

  test('enforces required fields, defaults, attribution, and admin-only update fields', () => {
    expect(sql).toContain('p_referrer_contractor_id uuid');
    expect(sql).toContain('p_referred_business_name text');
    expect(sql).toContain('p_referred_email text');
    expect(sql).toContain('Referred contractor business name is required.');
    expect(sql).toContain('Referred contractor email is required.');
    expect(sql).toContain("'contractor_refers_contractor'");
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('p_referrer_contractor_id');
    expect(sql).toContain("'created'");
    expect(sql).toContain("'new'");

    expect(sql).toContain('p_admin_status text default null');
    expect(sql).toContain('p_outreach_attempt_count integer default null');
    expect(sql).toContain('p_matched_contractor_id uuid default null');
    expect(sql).toContain('p_matched_user_id uuid default null');
    expect(sql).not.toContain('p_referred_business_name text default null, p_status');
  });

  test('does not create accounts, team access, connections, homeowner records, or workflow automation', () => {
    const forbidden = [
      /insert into public\.profiles/i,
      /insert into public\.contractor_profiles/i,
      /insert into public\.contractor_team_members/i,
      /insert into public\.contractor_team_invites/i,
      /insert into public\.homeowner_contractor_connections/i,
      /insert into public\.service_requests/i,
      /insert into public\.estimates/i,
      /insert into public\.invoices/i,
      /insert into public\.invoice_line_items/i,
      /insert into public\.inspections/i,
      /insert into public\.workflow_messages/i,
      /insert into public\.workflow_activity_events/i,
      /insert into public\.notifications/i,
      /insert into public\.home_memberships/i,
      /insert into public\.home_membership_email_invites/i,
      /send-notification-email/i,
      /send-home-access-invite-email/i,
      /stripe/i,
      /quickbooks/i,
      /autopay/i,
      /reward_amount/i,
      /reward_status/i,
      /subscription/i,
      /paywall/i,
    ];

    for (const pattern of forbidden) {
      expect(sql, `SQL patch should not match forbidden pattern ${pattern}`).not.toMatch(pattern);
    }
  });
});
