import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { capabilitiesFromCompatibilityChecks } from '../../src/features/drafts/durableDraftCapabilities';
import { isExactMissingEstimateSendRpcError } from '../../src/features/estimates/estimateSendCompatibility';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function resolvedEstimateCapability(canManageEstimates: boolean) {
  return capabilitiesFromCompatibilityChecks({
    contractorId: 'contractor-1',
    currentUserId: 'user-1',
    contractorOwnerUserId: 'owner-1',
    canAccessContractor: true,
    canManageEstimates,
    canManageBilling: false,
    canWriteJobs: false,
  });
}

test.describe('FB-035 Admin/Office normal Estimate authority', () => {
  test('keeps Estimate management distinct from billing and Job authority', () => {
    expect(resolvedEstimateCapability(true)).toMatchObject({
      canLaunchEstimate: true,
      canLaunchInvoice: false,
      canLaunchJob: false,
    });
    expect(resolvedEstimateCapability(false)).toMatchObject({
      canLaunchEstimate: false,
      canLaunchInvoice: false,
      canLaunchJob: false,
    });
  });

  test('loads one public server-resolved Estimate capability without client role strings', () => {
    const source = sourceFile('src/features/drafts/durableDraftCapabilities.ts');
    expect(source).toContain("capabilityRpc(client, 'current_user_can_manage_contractor_estimates'");
    expect(source).toContain('canLaunchEstimate: checks.canManageEstimates');
    expect(source).not.toMatch(/field_tech|office|viewer|\badmin\b|\bowner\b/);
  });

  test('uses server-authoritative connected send with an exact missing-RPC rollout fallback', () => {
    const source = sourceFile('src/App.tsx');
    const start = source.indexOf('const sendEstimateToHomeowner = async');
    const end = source.indexOf('const createJobFromAcceptedEstimate = async', start);
    const send = source.slice(start, end);
    expect(send).toContain("supabase.rpc('servsync_send_estimate'");
    expect(send).toContain('p_estimate_id: estimate.id');
    expect(send).toContain('isExactMissingEstimateSendRpcError(rpcError)');
    expect(send).toContain(".from('estimates')");
    expect(send).toContain("update({ status: 'sent' })");

    expect(isExactMissingEstimateSendRpcError({
      code: 'PGRST202',
      details: 'Searched for the function public.servsync_send_estimate with parameter p_estimate_id, but no matches were found in the schema cache.',
      message: 'Could not find the function public.servsync_send_estimate(p_estimate_id) in the schema cache',
    })).toBe(true);
    expect(isExactMissingEstimateSendRpcError({
      code: '42501',
      details: 'permission denied',
      message: 'permission denied',
    })).toBe(false);
    expect(isExactMissingEstimateSendRpcError({
      code: 'PGRST202',
      details: 'Searched for the function public.some_other_rpc with parameter p_estimate_id, but no matches were found in the schema cache.',
      message: 'Could not find the function public.some_other_rpc(p_estimate_id) in the schema cache',
    })).toBe(false);
  });

  test('migration enforces the role, lifecycle, tenant, audit, and delivery boundaries', () => {
    const sql = sourceFile('servsync-admin-office-estimate-authority.sql');
    const capabilityStart = sql.indexOf('create or replace function public.current_user_can_manage_contractor_estimates');
    const capabilityEnd = sql.indexOf('create table public.estimate_actor_audit', capabilityStart);
    const capability = sql.slice(capabilityStart, capabilityEnd);
    expect(capability).toContain("member.role in ('admin', 'office')");
    expect(capability).toContain("member.status = 'active'");
    expect(capability).toContain("contractor.account_status = 'active'");
    expect(capability).toContain('servsync_current_contractor_profile()');
    expect(capability).not.toContain('field_tech');
    expect(capability).not.toContain('viewer');

    expect(sql).toContain('alter table public.estimate_actor_audit force row level security;');
    expect(sql).toContain('revoke all on table public.estimate_actor_audit from public, anon, authenticated, service_role;');
    expect(sql).toContain("v_estimate.status not in ('draft', 'revised')");
    expect(sql).toContain("connection.status = 'active'");
    expect(sql).toContain("raise exception using message = 'ESTIMATE_UNAVAILABLE'");
    expect(sql).toContain('select public.current_user_can_manage_contractor_estimates(p_contractor_id);');
    expect(sql).toContain("status = 'draft'");
  });

  test('keeps contractor actors private while preserving honest historical unknowns', () => {
    const sql = sourceFile('servsync-admin-office-estimate-authority.sql');
    expect(sql).not.toContain('insert into public.estimate_actor_audit select');
    expect(sql).toContain("p_actor_user_id => null");
    expect(sql).toContain('Historical Estimates are not backfilled');
    expect(sql).toContain('servsync_get_estimate_actor_audit');
    expect(sql).toContain('current_user_can_manage_contractor_estimates(v_estimate.contractor_id)');
    expect(sql).toContain('local_estimate_delivery_links');
  });

  test('does not change billing, Job, Price Book, customer acceptance, or Invoice authority', () => {
    const sql = sourceFile('servsync-admin-office-estimate-authority.sql');
    expect(sql).not.toContain('create or replace function public.current_user_can_manage_contractor_billing');
    expect(sql).not.toContain('create or replace function public.current_user_can_write_contractor_jobs');
    expect(sql).not.toContain('servsync_homeowner_respond_to_estimate');
    expect(sql).not.toContain('servsync_create_invoice_from_estimate');
    expect(sql).not.toContain('price_book');
    expect(sql).not.toContain('stripe');
  });
});
