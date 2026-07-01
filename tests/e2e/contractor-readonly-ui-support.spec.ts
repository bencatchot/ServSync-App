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

test.describe('contractor read-only UI support', () => {
  test('helpers only disable representative creation/send capabilities for explicit read-only mode', () => {
    const source = appSource();
    const helperSource = sourceBetween(source, 'type ContractorEntitlementCapability', 'function betaContractorEntitlementFallback');

    expect(helperSource).toContain('function isContractorReadOnly');
    expect(helperSource).toContain("entitlements?.access_mode === 'read_only'");
    expect(helperSource).toContain('function getContractorCapabilityState');
    expect(helperSource).toContain('CONTRACTOR_READ_ONLY_DISABLED_REASON');
    expect(helperSource).toContain('Read-only access is active. Existing records remain available, but new contractor actions are paused.');
    expect(helperSource).toContain('can_create_estimates');
    expect(helperSource).toContain('can_create_invoices');
    expect(helperSource).toContain('can_send_invoices');
    expect(helperSource).toContain('can_invite_team_members');
    expect(helperSource).toContain("return { disabled: false, reason: '' };");
    expect(helperSource).not.toContain('subscription_status');
    expect(helperSource).not.toContain('monthly_price_cents');
    expect(helperSource).not.toContain('subscription_notes');
  });

  test('representative contractor actions show read-only disabled state without hiding existing records', () => {
    const source = appSource();
    const dashboardSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');

    expect(dashboardSource).toContain("getContractorCapabilityState(contractorEntitlementState.entitlements, 'can_create_estimates')");
    expect(dashboardSource).toContain("getContractorCapabilityState(contractorEntitlementState.entitlements, 'can_create_invoices')");
    expect(dashboardSource).toContain("getContractorCapabilityState(contractorEntitlementState.entitlements, 'can_send_invoices')");
    expect(dashboardSource).toContain("getContractorCapabilityState(contractorEntitlementState.entitlements, 'can_invite_team_members')");
    expect(dashboardSource).toContain('disabled={!selectedJobsCustomerName || createEstimateCapability.disabled}');
    expect(dashboardSource).toContain('disabled={!selectedJobsCustomerName || createInvoiceCapability.disabled}');
    expect(dashboardSource).toContain('disabled={inviteTeamCapability.disabled || creatingTeamInvite || !teamInviteDraft.email.trim()}');
    expect(dashboardSource).toContain('disabled={savingInvoice || updatingInvoiceId === editingInvoiceId || !invoiceDraftCanSendToHomeowner || sendInvoiceCapability.disabled}');
    expect(dashboardSource).toContain('{readOnlyContractorActionReason && (');
    expect(dashboardSource).toContain('{sendInvoiceCapability.disabled && (');
    expect(dashboardSource).toContain('visibleInvoiceRecords.map');
    expect(dashboardSource).toContain('visibleEstimateRecords.map');
    expect(dashboardSource).not.toMatch(/contractorTab\s*!==\s*['"]inspections['"].*readOnly/);
  });

  test('disabled handlers avoid mutations while preserving existing invoice viewing', () => {
    const source = appSource();
    const dashboardSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');
    const createInvoiceFromEstimateSource = sourceBetween(source, 'const createInvoiceFromEstimate', 'const createInvoiceFromJob');
    const createInvoiceFromJobSource = sourceBetween(source, 'const createInvoiceFromJob', 'const openPartialInvoiceReview');

    expect(dashboardSource).toContain('if (inviteTeamCapability.disabled)');
    expect(dashboardSource).toContain('if (createEstimateCapability.disabled)');
    expect(dashboardSource).toContain('if (createInvoiceCapability.disabled)');
    expect(dashboardSource).toContain('if (sendInvoiceCapability.disabled)');
    expect(createInvoiceFromEstimateSource.indexOf('if (existingInvoice)')).toBeLessThan(createInvoiceFromEstimateSource.indexOf('if (createInvoiceCapability.disabled)'));
    expect(createInvoiceFromJobSource.indexOf('if (existingInvoice)')).toBeLessThan(createInvoiceFromJobSource.indexOf('if (createInvoiceCapability.disabled)'));
  });

  test('read-only support does not introduce payment, upgrade, or homeowner billing behavior', () => {
    const source = appSource();
    const helperSource = sourceBetween(source, 'type ContractorEntitlementCapability', 'function betaContractorEntitlementFallback');
    const panelSource = sourceBetween(source, 'function ContractorEntitlementStatusPanel', 'function EmailNotificationsToggle');
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');

    for (const forbiddenCopy of [
      'Payment required',
      'Upgrade now',
      'Subscription expired',
      'Your access will be blocked',
      'Billing required',
      'checkout',
      'billing portal',
      'payment collection',
    ]) {
      expect(helperSource).not.toContain(forbiddenCopy);
      expect(panelSource).not.toContain(forbiddenCopy);
    }
    expect(homeownerSource).not.toContain('getContractorCapabilityState');
    expect(homeownerSource).not.toContain('CONTRACTOR_READ_ONLY_DISABLED_REASON');
  });
});
