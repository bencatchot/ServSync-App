import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = () => readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('contractor entitlement labels', () => {
  test('contractor dashboard renders non-blocking beta entitlement labels from loaded entitlement state', () => {
    const source = appSource();
    const dashboardSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');
    const panelSource = sourceBetween(source, 'function ContractorEntitlementStatusPanel', 'function EmailNotificationsToggle');

    expect(dashboardSource).toContain('const contractorEntitlementState = useContractorEntitlements(contractor?.id ?? null);');
    expect(dashboardSource).toContain('<ContractorEntitlementStatusPanel state={contractorEntitlementState} />');
    expect(panelSource).toContain('data-testid="contractor-entitlement-status-panel"');
    expect(panelSource).toContain('Informational during beta.');
    expect(panelSource).toContain('Stripe billing is not active');
    expect(panelSource).toContain('beta contractors remain free');
    expect(panelSource).toContain('this status does not block contractor actions');
    expect(panelSource).toContain('Billing status');
    expect(panelSource).toContain('Current plan');
    expect(panelSource).toContain('Access mode');
    expect(panelSource).toContain('Subscription required after');
    expect(panelSource).toContain('Grace period ends');
    expect(panelSource).toContain('Current beta access available');
  });

  test('entitlement labels are not payment prompts or action gates', () => {
    const source = appSource();
    const dashboardSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');
    const panelSource = sourceBetween(source, 'function ContractorEntitlementStatusPanel', 'function EmailNotificationsToggle');

    for (const forbiddenCopy of [
      'Payment required',
      'Upgrade now',
      'Subscription expired',
      'Your access will be blocked',
      'Billing required',
      'checkout',
      'billing portal',
      'payment collection',
      'Manage billing',
    ]) {
      expect(panelSource).not.toContain(forbiddenCopy);
    }

    expect(dashboardSource).not.toMatch(/disabled=\{[^}]*contractorEntitlementState/);
    expect(dashboardSource).not.toMatch(/disabled=\{[^}]*entitlements\.[^}]*can_/);
    expect(dashboardSource).not.toMatch(/if\s*\([^)]*contractorEntitlementState[^)]*\)\s*return/);
    expect(dashboardSource).not.toMatch(/if\s*\([^)]*entitlements\.[^)]*can_[^)]*\)\s*return/);
  });

  test('RPC failure copy preserves access and homeowners remain unaffected', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const panelSource = sourceBetween(source, 'function ContractorEntitlementStatusPanel', 'function EmailNotificationsToggle');
    const hookSource = sourceBetween(source, 'function useContractorEntitlements', 'function EmailNotificationsToggle');

    expect(panelSource).toContain('Unable to refresh entitlement labels. Current beta access remains available.');
    expect(hookSource).toContain('Current beta access is preserved.');
    expect(homeownerSource).not.toContain('ContractorEntitlementStatusPanel');
    expect(homeownerSource).not.toContain('useContractorEntitlements');
    expect(homeownerSource).not.toContain('servsync_current_contractor_entitlements');
  });

  test('contractor-facing labels do not use legacy subscription profile fields as canonical state', () => {
    const source = appSource();
    const panelSource = sourceBetween(source, 'function ContractorEntitlementStatusPanel', 'function EmailNotificationsToggle');

    expect(panelSource).not.toContain('subscription_status');
    expect(panelSource).not.toContain('monthly_price_cents');
    expect(panelSource).not.toContain('subscription_notes');
  });
});
