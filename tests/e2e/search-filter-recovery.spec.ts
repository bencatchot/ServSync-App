import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appPath = resolve(process.cwd(), 'src/App.tsx');
const filterSummaryPath = resolve(process.cwd(), 'src/features/search/FilterSummary.tsx');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function changedFiles() {
  const branchDiff = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const workingTreeDiff = execFileSync('git', ['diff', '--name-only'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  return Array.from(new Set(`${branchDiff}\n${workingTreeDiff}\n${untracked}`
    .split('\n')
    .map(file => file.trim())
    .filter(Boolean)));
}

test.describe('Bundle 4B-1 search and filter recovery', () => {
  test('FilterSummary is presentation-only and caller-driven', () => {
    const source = read(filterSummaryPath);

    expect(source).toContain('resultCount: number');
    expect(source).toContain('totalCount?: number');
    expect(source).toContain('activeLabels?: ReactNode[]');
    expect(source).toContain('searchTerm?: string');
    expect(source).toContain('onClear?: () => void');
    expect(source).toContain('clearLabel?: string');
    expect(source).toContain('compact?: boolean');
    expect(source).toContain('data-testid={testId}');
    expect(source).toContain('aria-label={clearLabel}');
    expect(source).toContain('flex flex-col gap-2');
    expect(source).toContain('flex flex-wrap items-center gap-1.5');
    expect(source).not.toMatch(/supabase|rpc\(|from\(|insert|update|delete|localStorage|sessionStorage|useEffect|useState|useNavigate|appRoute/);
  });

  test('Discover shows accessible filters, active summaries, and recoverable no-result state without new search behavior', () => {
    const app = read(appPath);
    const discoverSource = sourceBetween(app, 'function DiscoverFeed({', 'function SetupNotice()');

    expect(discoverSource).toContain("aria-label=\"Search Discover posts\"");
    expect(discoverSource).toContain("aria-label=\"Search by ZIP or city\"");
    expect(discoverSource).toContain('const discoverFiltersActive = Boolean(');
    expect(discoverSource).toContain('const discoverFilterLabels = [');
    expect(discoverSource).toContain('Category: ${filterCategory}');
    expect(discoverSource).toContain('Location: ${filterLocation.trim()}');
    expect(discoverSource).toContain('Within ${filterRadiusMiles} miles');
    expect(discoverSource).toContain('View: Saved posts');
    expect(discoverSource).toContain('clearDiscoverFilters');
    expect(discoverSource).toContain('testId="discover-filter-summary"');
    expect(discoverSource).toContain('No matching contractor posts');
    expect(discoverSource).toContain('Clear Discover filters');
    expect(discoverSource).toContain("supabase.rpc('servsync_discover_feed'");
    expect(discoverSource).toContain('p_category: categoryFilter || null');
    expect(discoverSource).toContain('p_location: locationFilter || null');
    expect(discoverSource).toContain('const keywordTerms = normalizeText(filterKeyword).split');
    expect(discoverSource).not.toMatch(/fullText|pagination|CREATE INDEX|new URLSearchParams|localStorage\.setItem\([^)]*discover/i);
  });

  test('homeowner Records separates filtered no-results from true empty records', () => {
    const app = read(appPath);
    const recordSource = sourceBetween(app, 'const homeownerRecordContractors = Array.from(', "{homeownerTab === 'estimates' && renderHomeownerEstimatesInvoicesPage()}");

    expect(recordSource).toContain('const homeownerRecordFilterLabels = [');
    expect(recordSource).toContain('Contractor: ${homeownerRecordContractorName(homeownerRecordContractorFilter)}');
    expect(recordSource).toContain('Sort: Oldest first');
    expect(recordSource).toContain('const clearHomeownerRecordControls = () =>');
    expect(recordSource).toContain('testId="homeowner-record-filter-summary"');
    expect(recordSource).toContain('No matching records');
    expect(recordSource).toContain('Clear search and filters');
    expect(recordSource).toContain('homeownerEstimateMatchesFilters');
    expect(recordSource).toContain('homeownerInvoiceMatchesFilters');
    expect(recordSource).toContain('sortHomeownerEstimates');
    expect(recordSource).toContain('sortHomeownerInvoices');
  });

  test('Home History reminder room filter uses compact recovery without changing reminder semantics', () => {
    const app = read(appPath);
    const reminderDerivationSource = sourceBetween(app, 'const propertyScopedHomeReminders = homeReminders.filter(reminder => {', 'const homeownerMaintenanceScopeLabel');
    const reminderSource = sourceBetween(app, '{propertyScopedHomeReminders.length > 0 && (', '{/* Log list */}');

    expect(reminderDerivationSource).toContain('selectedHomeReminderRoomLabel');
    expect(reminderDerivationSource).toContain('roomFilteredHomeReminders');
    expect(reminderSource).toContain('selectedHomeReminderRoomLabel');
    expect(reminderSource).toContain('testId="home-reminder-room-filter-summary"');
    expect(reminderSource).toContain('Room: ${selectedHomeReminderRoomLabel');
    expect(reminderSource).toContain('No reminders in this room');
    expect(reminderSource).toContain('Show all rooms');
    expect(reminderSource).toContain('setHomeownerReminderRoomFilter');
    expect(reminderSource).toContain('roomFilteredHomeReminders');
    expect(reminderSource).toContain('StatusBadge {...reminderPresentation}');
    expect(reminderSource).toContain('formatDateOnly(reminder.due_on)');
    expect(reminderSource).not.toMatch(/snooze|recurrence/i);
  });

  test('contractor customer, financial, and job filters show accurate recovery without changing formulas', () => {
    const app = read(appPath);
    const contractorSource = sourceBetween(app, 'function ContractorDashboard({ profile, onSignOut }', 'function PlatformAdminDashboard({ onSignOut }');
    const customerSource = contractorSource;
    const financialSource = sourceBetween(contractorSource, "{(contractorJobsView === 'open_financial' || contractorJobsView === 'closed_financial') && (", "{(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (");
    const jobsSource = sourceBetween(contractorSource, "<Card title={contractorJobsView === 'open_jobs' ? 'Open jobs' : 'Closed jobs'}", "{contractorJobsView === 'custom_pricing' && (");

    expect(customerSource).toContain('Customers and contacts');
    expect(customerSource).toContain('aria-label="Search customers and contacts"');
    expect(customerSource).toContain('placeholder="Search customers, contacts, city, or address"');
    expect(customerSource).toContain('testId="contractor-customer-filter-summary"');
    expect(customerSource).toContain('No matching customers or contacts');
    expect(customerSource).toContain('Clear search and show active');
    expect(customerSource).toContain('subjectMatchesSearch');
    expect(customerSource).not.toContain('placeholder="Search homeowner, city, address..."');

    expect(financialSource).toContain('const estimateFilterLabels = [');
    expect(financialSource).toContain('const invoiceFilterLabels = [');
    expect(financialSource).toContain('testId={showingEstimates ? \'contractor-estimate-filter-summary\' : \'contractor-invoice-filter-summary\'}');
    expect(financialSource).toContain('No matching estimates');
    expect(financialSource).toContain('No matching invoices');
    expect(financialSource).toContain('estimateMatchesSearch');
    expect(financialSource).toContain('invoiceMatchesSearch');
    expect(financialSource).toContain('sortEstimateRecords');
    expect(financialSource).toContain('sortInvoiceRecords');

    expect(jobsSource).toContain('const jobFilterLabels = [');
    expect(jobsSource).toContain('Customer: ${selectedJobsCustomerName');
    expect(jobsSource).toContain('Clear job filters');
    expect(jobsSource).toContain('testId="contractor-job-filter-summary"');
    expect(jobsSource).toContain('resultCount={records.length}');
    expect(jobsSource).toContain('totalCount={baseRecords.length}');
    expect(jobsSource).not.toContain("totalCount={contractorJobsView === 'open_jobs' ? openJobs.length : closedJobs.length}");
    expect(jobsSource).toContain('No matching open jobs');
    expect(jobsSource).toContain('No matching closed jobs');
    expect(jobsSource).toContain('const filteredRecords = baseRecords.filter');
    expect(jobsSource).toContain('inspectionJobStatus(insp)');
  });

  test('request queues only receive user-facing terminology cleanup', () => {
    const app = read(appPath);
    const homeownerRequestSource = sourceBetween(app, 'const selectedSection = homeownerRequestSections.find', "{homeownerTab === 'estimates' && renderHomeownerEstimatesInvoicesPage()}");
    const contractorRequestSource = sourceBetween(app, 'const filteredRequests = selectedSection?.requests.filter(request => serviceRequestMatchesSearch(request, contractorRequestSearch)) ?? [];', 'const homeownerSearchTerms = normalizeText(homeownerWorkspaceSearch)');

    expect(homeownerRequestSource).toContain('<Field label="Search requests">');
    expect(homeownerRequestSource).toContain('serviceRequestMatchesSearch(request, homeownerRequestSearch)');
    expect(homeownerRequestSource).toContain('{filteredRequests.length} shown of {selectedSection.requests.length}');
    expect(homeownerRequestSource).toContain('<EmptyState text="No requests match that search." compact />');
    expect(contractorRequestSource).toContain('<Field label="Search requests">');
    expect(contractorRequestSource).toContain('serviceRequestMatchesSearch(request, contractorRequestSearch)');
    expect(contractorRequestSource).toContain('{filteredRequests.length} shown of {selectedSection.requests.length}');
    expect(contractorRequestSource).toContain('<EmptyState text="No requests match that search." compact />');
    expect(app).not.toContain('Search this bucket');
    expect(app).not.toContain('Search this queue');
  });

  test('scope stays frontend presentation only and excludes future slices', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'src/App.tsx',
      'src/features/search/FilterSummary.tsx',
      'tests/e2e/search-filter-recovery.spec.ts',
      'tests/e2e/action-feedback-confirmation.spec.ts',
      'tests/e2e/empty-state-foundation.spec.ts',
      'tests/e2e/home-reminder-room-ui.spec.ts',
      'tests/e2e/service-report-homemap-notices.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
    ]);
    const app = read(appPath);

    expect(files.length, 'Bundle 4B-1 should have changed files').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be approved for Bundle 4B-1`).toBe(true);
    }

    expect(files.some(file => file.endsWith('.sql'))).toBe(false);
    expect(files.some(file => file.includes('supabase/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => file.includes('pdfDocuments'))).toBe(false);
    expect(app).not.toMatch(/Quick Duplicate Job|Project Activity Feed|Bundle 5|CREATE POLICY|ALTER TABLE|CREATE FUNCTION|SECURITY DEFINER/i);
    expect(app).not.toMatch(/Price Book[\s\S]{0,300}FilterSummary|Templates[\s\S]{0,300}FilterSummary|AdminSupportInbox[\s\S]{0,300}FilterSummary/);
  });
});
