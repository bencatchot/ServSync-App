import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = () => readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const typeSource = () => readFileSync(resolve(process.cwd(), 'src/types.ts'), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('contractor entitlement loading foundation', () => {
  test('frontend has typed contractor entitlement state matching the RPC contract', () => {
    const source = typeSource();

    expect(source).toContain('export interface ContractorEntitlements');
    for (const field of [
      'contractor_id',
      'billing_status',
      'current_plan',
      'access_mode',
      'subscription_required_after',
      'grace_period_ends_at',
      'can_use_workspace',
      'can_create_service_requests_for_local_customers',
      'can_create_estimates',
      'can_send_estimates',
      'can_create_jobs',
      'can_create_invoices',
      'can_send_invoices',
      'can_use_discover_profile',
      'can_accept_new_connections',
      'can_use_ai_features',
      'can_invite_team_members',
      'max_team_seats',
      'max_storage_mb',
      'read_only_reason',
    ]) {
      expect(source).toContain(field);
    }
  });

  test('contractor dashboard loads entitlements without using them as action gates', () => {
    const source = appSource();
    const dashboardSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');

    expect(source).toContain("rpc('servsync_current_contractor_entitlements', { p_contractor_id: activeContractorId })");
    expect(dashboardSource).toContain('useContractorEntitlements(contractor?.id ?? null);');
    expect(dashboardSource).not.toMatch(/disabled=\{[^}]*can_(?:use|create|send|accept|invite)/);
    expect(dashboardSource).not.toMatch(/if\s*\([^)]*can_(?:use|create|send|accept|invite)[^)]*\)\s*return/);
  });

  test('fallback preserves current beta contractor behavior while loading or on RPC failure', () => {
    const source = appSource();
    const fallbackSource = sourceBetween(source, 'function betaContractorEntitlementFallback', 'function normalizeContractorEntitlements');
    const hookSource = sourceBetween(source, 'function useContractorEntitlements', 'function EmailNotificationsToggle');

    expect(fallbackSource).toContain("billing_status: 'beta_free'");
    expect(fallbackSource).toContain("current_plan: 'beta_free'");
    expect(fallbackSource).toContain("access_mode: 'full_beta'");
    for (const capability of [
      'can_use_workspace',
      'can_create_service_requests_for_local_customers',
      'can_create_estimates',
      'can_send_estimates',
      'can_create_jobs',
      'can_create_invoices',
      'can_send_invoices',
      'can_use_discover_profile',
      'can_accept_new_connections',
      'can_use_ai_features',
      'can_invite_team_members',
    ]) {
      expect(fallbackSource).toContain(`${capability}: true`);
    }
    expect(fallbackSource).toContain('max_team_seats: 999');
    expect(fallbackSource).toContain('max_storage_mb: 1024');
    expect(hookSource).toContain('Current beta access is preserved.');
  });

  test('homeowner dashboard and legacy subscription fields are not made canonical enforcement inputs', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const hookSource = sourceBetween(source, 'function useContractorEntitlements', 'function EmailNotificationsToggle');

    expect(homeownerSource).not.toContain('useContractorEntitlements');
    expect(homeownerSource).not.toContain('servsync_current_contractor_entitlements');
    expect(hookSource).not.toContain('subscription_status');
    expect(hookSource).not.toContain('monthly_price_cents');
    expect(hookSource).not.toContain('subscription_notes');
  });
});
