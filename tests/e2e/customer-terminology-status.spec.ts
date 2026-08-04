import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('contractor customer terminology and connection status', () => {
  test('contractor navigation and unified workspace use customer terminology', () => {
    const app = read('src/App.tsx');
    const contractor = sourceBetween(app, 'function ContractorDashboard({', 'function PlatformAdminDashboard({');
    const workspace = sourceBetween(contractor, "{contractorTab === 'connections'", "{(contractorTab === 'inspections'");

    expect(contractor).toContain("label: 'Customers'");
    expect(contractor).toContain("group: 'Customer Work'");
    expect(workspace).toContain('>Customers</h2>');
    expect(workspace).toContain('aria-label="Search customers"');
    expect(workspace).toContain('Connected customers, not-connected customers, and connection requests appear here.');
    expect(workspace).not.toMatch(/Customers and contacts|Connected homeowners|Local customers/);
  });

  test('connection states use shared text-and-icon status badges', () => {
    const app = read('src/App.tsx');
    const status = read('src/features/status/statusPresentation.ts');
    const workspace = sourceBetween(app, "{contractorTab === 'connections'", "{(contractorTab === 'inspections'");

    expect(status).toContain("connected: { label: 'Connected', tone: 'success' }");
    expect(status).toContain("not_connected: { label: 'Not connected', tone: 'neutral' }");
    expect(status).toContain("invitation_pending: { label: 'Invitation pending', tone: 'warning' }");
    expect(status).toContain("connection_request: { label: 'Connection request', tone: 'info' }");
    expect(status).toContain("inactive: { label: 'Inactive', tone: 'muted' }");
    expect(workspace).toContain('customerConnectionStatusIcon(connectionStatus)');
    expect(workspace).toContain('customerConnectionStatusIcon(localConnectionStatus)');
    expect(workspace).toContain('customerConnectionStatusIcon(requestStatus)');
    expect(workspace).toContain('<StatusBadge key={`${badge.label}-${idx}`} {...badge} />');
    expect(workspace).not.toContain('const pills:');
  });

  test('Draft selectors show connection status while preserving internal subjects', () => {
    const app = read('src/App.tsx');
    const durableComposer = read('src/features/drafts/ContractorDraftComposer.tsx');
    const legacyComposer = read('src/features/jobs/DraftJobComposer.tsx');
    const mappings = read('src/features/jobs/draftJobMappings.ts');

    for (const composer of [durableComposer, legacyComposer]) {
      expect(composer).toContain("composerField('Connection status'");
      expect(composer).toContain('<option value="connected">Connected</option>');
      expect(composer).toContain('<option value="local">Not connected</option>');
      expect(composer).toContain('option.helper ? `${option.label} — ${option.helper}` : option.label');
      expect(composer).toContain("draft.subject_type === 'connected'");
      expect(composer).toContain('homeowner_user_id');
      expect(composer).toContain('local_contact_id');
    }

    expect(app).toContain("helper: 'Connected'");
    expect(app).toContain("helper: 'Not connected'");
    expect(mappings).toContain("p_homeowner_user_id: connected ? draft.homeowner_user_id || null : null");
    expect(mappings).toContain("p_local_contact_id: connected ? null : draft.local_contact_id || null");
  });

  test('invoice guest delivery and homeowner role boundaries remain intact', () => {
    const app = read('src/App.tsx');
    const delivery = read('src/features/invoices/LocalInvoiceDeliveryPanel.tsx');

    expect(delivery).toContain('Create a document-specific link for this customer.');
    expect(delivery).toContain('createLocalInvoiceDeliveryLink');
    expect(delivery).toContain('rotateLocalInvoiceDeliveryLink');
    expect(delivery).toContain('revokeLocalInvoiceDeliveryLink');
    expect(app).toContain("brand={{ name: 'ServSync', subtitle: 'Homeowner Portal' }}");
    expect(app).toContain("{profile.role === 'homeowner' && <HomeownerDashboard");
    expect(app).toContain("supabase.rpc('servsync_contractor_connected_homeowners')");
    expect(app).toContain(".from('contractor_local_contacts')");
  });
});
