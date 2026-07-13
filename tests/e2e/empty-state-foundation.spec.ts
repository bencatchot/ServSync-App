import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appPath = resolve(process.cwd(), 'src/App.tsx');
const emptyStatePath = resolve(process.cwd(), 'src/features/emptyStates/EmptyState.tsx');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Missing source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Missing source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Bundle 3A empty-state foundation', () => {
  test('shared component supports standard, compact, action, and decorative-icon presentation', () => {
    const source = read(emptyStatePath);

    expect(source).toContain("type EmptyStateTone = 'neutral' | 'info' | 'success'");
    expect(source).toContain("type EmptyStateVariant = 'standard' | 'compact'");
    expect(source).toContain('title?: ReactNode');
    expect(source).toContain('body?: ReactNode');
    expect(source).toContain('text?: ReactNode');
    expect(source).toContain('action?: ReactNode');
    expect(source).toContain('secondaryAction?: ReactNode');
    expect(source).toContain('icon?: ReactNode');
    expect(source).toContain('isCompact ?');
    expect(source).toContain('<h3');
    expect(source).toContain('aria-hidden="true"');
    expect(source).not.toMatch(/onClick|tabIndex|role="button"|useNavigate|supabase|rpc\(/);
  });

  test('App imports the shared component and removes the competing local EmptyState', () => {
    const app = read(appPath);

    expect(app).toContain("import { EmptyState } from './features/emptyStates/EmptyState';");
    expect(app).not.toMatch(/function EmptyState\(\{ text \}/);
  });

  test('homeowner primary true-empty states use contextual foundation copy', () => {
    const app = read(appPath);

    expect(app).toContain('title="No active work yet"');
    expect(app).toContain('title="No contractor connections yet"');
    expect(app).toContain('title="No Home History yet"');
    expect(app).toContain('title="No open reminders yet"');
    expect(app).toContain('title="No documents yet"');
    expect(app).toContain(`title={homeownerRequestPropertyScope === 'selected' && selectedHomeId ? 'No service requests for this property yet' : 'No service requests yet'}`);
    expect(app).toContain('Service requests help organize contractor outreach, issue details, estimates, jobs, and invoices in one place.');
    expect(app).toContain('Estimates from your contractors will appear here when they are sent for your review.');
    expect(app).toContain('Invoices sent by your contractors will appear here when payment or review is needed.');
    expect(app).toContain('Accepted estimates can become jobs when the contractor creates or schedules the work.');
  });

  test('shared-home empty states preserve privacy and read-only shell copy', () => {
    const sharedHomeSource = sourceBetween(read(appPath), 'const renderSharedHomeShellsPanel = () => (', 'const renderHomeAccessPanel = () => {');

    expect(sharedHomeSource).toContain('title="No shared homes yet"');
    expect(sharedHomeSource).toContain('only the safe details they have granted');
    expect(sharedHomeSource).toContain('title="No shared reminders for this home"');
    expect(sharedHomeSource).toContain('Notes and linked records stay private.');
    expect(sharedHomeSource).toContain('Read-only reminders shared with this home.');
    expect(sharedHomeSource).not.toMatch(/Complete|Dismiss|Edit reminder|Add reminder/);
  });

  test('contractor primary true-empty states use contextual foundation copy', () => {
    const app = read(appPath);

    expect(app).toContain('title="No connected homeowners yet"');
    expect(app).toContain('title="No requests need follow-up"');
    expect(app).toContain('title="No new service requests yet"');
    expect(app).toContain('title="No service requests yet"');
    expect(app).toContain('title="No estimates yet"');
    expect(app).toContain('title="No invoices yet"');
    expect(app).toContain(`title={contractorJobsView === 'open_jobs' ? 'No open jobs yet' : 'No completed jobs yet'}`);
    expect(app).toContain('title="No jobs yet"');
  });

  test('filter/search no-results remain distinct from true no-data states', () => {
    const app = read(appPath);

    expect(app).toContain('<EmptyState text="No requests match that search." compact />');
    expect(app).toContain('<EmptyState text="No records match your filters." />');
    expect(app).toContain("text={showingEstimates ? 'No estimate records match these filters.' : 'No invoice records match these filters.'}");
    expect(app).toContain("text={contractorJobsView === 'open_jobs' ? 'No open jobs match this view.' : 'No recently closed jobs match this view.'} compact");
  });

  test('scope remains frontend presentation only', () => {
    const app = read(appPath);
    const source = read(emptyStatePath);

    expect(source).not.toMatch(/supabase|from\(|rpc\(|insert|update|delete|localStorage|sessionStorage/);
    expect(app).not.toMatch(/Quick Duplicate Job|Project Activity Feed/);
    expect(app).not.toMatch(/draft clarity|Draft Clarity|search\/filter empty|permission empty/i);
  });
});
