import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function labelsFrom(source: string) {
  return Array.from(source.matchAll(/label: '([^']+)'/g)).map(match => match[1]);
}

test.describe('mobile role shell navigation source guardrails', () => {
  test('contractor mobile nav has exactly the approved five items and maps to existing surfaces', () => {
    const appSource = readRepoFile('src/App.tsx');
    const navSource = sourceBetween(
      appSource,
      'const contractorMobileNavItems: MobileNavItem[] = [',
      '  return (\n    <SidebarLayout\n      brand={{ name: contractorDraft.business_name',
    );

    expect(labelsFrom(navSource)).toEqual(['Discover', 'Jobs', 'Dashboard', 'Homeowners', 'More']);
    expect(labelsFrom(navSource)).not.toContain('Money');
    expect(labelsFrom(navSource)).not.toContain('Messages');
    expect(navSource).toContain("id: 'discover'");
    expect(navSource).toContain("onSelect: () => setContractorTab('discover')");
    expect(navSource).toContain("id: 'dashboard'");
    expect(navSource).toContain("onSelect: () => setContractorTab('overview')");
    expect(navSource).toContain("id: 'jobs'");
    expect(navSource).toContain("setContractorTab('inspections')");
    expect(navSource).toContain("setContractorJobsViewAndScroll('overview')");
    expect(navSource).not.toContain("setContractorJobsView('open_financial')");
    expect(navSource).not.toContain("id: 'money'");
    expect(navSource).not.toContain("id: 'messages'");
    expect(navSource).toContain("id: 'homeowners'");
    expect(navSource).toContain("onSelect: () => setContractorTab('connections')");
    expect(navSource).toContain("id: 'more'");
    expect(navSource).toContain('opensMenu: true');
    expect(navSource.toLowerCase()).not.toContain('general chat');
    expect(navSource.toLowerCase()).not.toContain('broad chat');
  });

  test('homeowner mobile nav has exactly the approved five items and avoids project-hub overpromising', () => {
    const appSource = readRepoFile('src/App.tsx');
    const navSource = sourceBetween(
      appSource,
      'const homeownerMobileNavItems: MobileNavItem[] = [',
      '  return (\n    <SidebarLayout\n      brand={{ name: \'ServSync\'',
    );

    expect(labelsFrom(navSource)).toEqual(['Discover', 'Requests', 'Dashboard', 'Contractors', 'More']);
    expect(labelsFrom(navSource)).not.toContain('Projects');
    expect(navSource).toContain("id: 'discover'");
    expect(navSource).toContain("onSelect: () => setHomeownerTab('discover')");
    expect(navSource).toContain("onSelect: () => setHomeownerTab('overview')");
    expect(navSource).toContain("onSelect: () => setHomeownerTab('requests')");
    expect(navSource).not.toContain("setHomeownerTab('estimates')");
    expect(navSource).not.toContain('homeownerProjectSection');
    expect(navSource).toContain("onSelect: () => setHomeownerTab('contractors')");
    expect(navSource).toContain('opensMenu: true');
    expect(appSource).not.toContain("type HomeownerTab = 'overview' | 'home' | 'contractors' | 'requests' | 'projects'");
    expect(appSource).not.toContain("homeownerTab === 'projects'");
  });

  test('mobile and desktop nav badges use shared workflow counts without Dashboard badges', () => {
    const appSource = readRepoFile('src/App.tsx');
    const contractorNavSource = sourceBetween(
      appSource,
      'const contractorMobileNavItems: MobileNavItem[] = [',
      '  return (\n    <SidebarLayout\n      brand={{ name: contractorDraft.business_name',
    );
    const homeownerNavSource = sourceBetween(
      appSource,
      'const homeownerMobileNavItems: MobileNavItem[] = [',
      '  return (\n    <SidebarLayout\n      brand={{ name: \'ServSync\'',
    );

    expect(appSource).toContain('const contractorJobsAttentionCount = openJobs.length + invoiceAttentionRecords.length + acceptedEstimatesNeedingJobs.length;');
    expect(appSource).toContain('const contractorHomeownersBadgeCount = connectionRequests.length;');
    expect(appSource).toContain('const contractorServiceRequestsBadgeCount = contractorFollowUpCount || openServiceRequestCount;');
    expect(appSource).toContain("badge: contractorJobsAttentionCount");
    expect(appSource).toContain("{ id: 'inspections',  label: 'Jobs',               icon: <ClipboardCheck size={17} />, badge: contractorJobsAttentionCount");
    expect(contractorNavSource).toContain('badge: contractorJobsAttentionCount');
    expect(contractorNavSource).toContain('badge: contractorHomeownersBadgeCount');
    expect(contractorNavSource).not.toContain('badge: actionReviewCount');

    expect(appSource).toContain('const homeownerRequestsBadgeCount = homeownerActionRequestCount;');
    expect(appSource).toContain('const homeownerEstimatesInvoicesBadgeCount = homeownerFinancialBadgeCount;');
    expect(appSource).toContain("{ id: 'requests',     label: 'Service Requests',  icon: <MessageSquare size={17} />, badge: homeownerRequestsBadgeCount");
    expect(appSource).toContain("{ id: 'estimates',    label: 'Estimates / Invoices', icon: <Receipt size={17} />, badge: homeownerEstimatesInvoicesBadgeCount");
    expect(homeownerNavSource).toContain('badge: homeownerRequestsBadgeCount');
    expect(homeownerNavSource).not.toContain('dashboardAcceptedWorkEstimates.length + openHomeownerInvoiceCount + pendingEstimateCount');
  });

  test('contractor Jobs keeps compact mobile overview tiles and a mobile-only nested back control', () => {
    const appSource = readRepoFile('src/App.tsx');
    const jobsShellSource = sourceBetween(
      appSource,
      "{(contractorTab === 'inspections' || (contractorTab === 'connections' && inspectionView === 'detail' && activeInspection)) && (",
      '          {/* ── LIST VIEW ── */}',
    );
    const jobsOverviewSource = sourceBetween(
      appSource,
      "{contractorJobsView === 'overview' && (",
      "{contractorJobsView === 'new_financial' && (",
    );

    expect(appSource).toContain('const setContractorJobsViewAndScroll = useCallback((view: ContractorJobsView) => {');
    expect(appSource).toContain("window.matchMedia('(max-width: 767px)').matches");
    expect(jobsShellSource).toContain('data-testid="contractor-jobs-mobile-sticky-subheader"');
    expect(jobsShellSource).toContain("contractorTab === 'inspections' && contractorJobsView !== 'overview'");
    expect(jobsShellSource).toContain('sticky top-0');
    expect(jobsShellSource).toContain('md:hidden');
    expect(jobsShellSource).toContain('Back to Jobs');
    expect(jobsShellSource).toContain('CONTRACTOR_JOBS_VIEW_LABELS[contractorJobsView]');
    expect(jobsShellSource).toContain("setContractorJobsViewAndScroll('overview')");

    expect(jobsOverviewSource).toContain('data-testid="contractor-jobs-overview"');
    expect(jobsOverviewSource).toContain('data-testid="contractor-jobs-overview-tile-grid"');
    expect(jobsOverviewSource).toContain('grid grid-cols-2 gap-2 md:grid-cols-3');
    expect(jobsOverviewSource).toContain('p-2.5 text-left transition sm:p-3');
    expect(jobsOverviewSource).toContain('line-clamp-2');
    expect(jobsOverviewSource).toContain('setContractorJobsViewAndScroll(item.id)');
    expect(jobsOverviewSource).not.toContain('overflow-x-auto');
  });

  test('shared shell keeps desktop sidebar and adds mobile-only bottom nav with five-item cap', () => {
    const appSource = readRepoFile('src/App.tsx');
    const shellSource = sourceBetween(
      appSource,
      'function SidebarLayout({',
      'function PhotoUploadPanel({',
    );

    expect(shellSource).toContain('mobileNavItems = []');
    expect(shellSource).toContain('mobileNavItems?: MobileNavItem[];');
    expect(shellSource).toContain('const visibleMobileNavItems = mobileNavItems.slice(0, 5);');
    expect(shellSource).toContain('className="hidden md:flex md:w-64 md:shrink-0 md:flex-col"');
    expect(shellSource).toContain('className="fixed inset-x-0 bottom-0');
    expect(shellSource).toContain('md:hidden');
    expect(shellSource).toContain('pt-[calc(env(safe-area-inset-top)+0.75rem)]');
    expect(shellSource).toContain('pb-[calc(env(safe-area-inset-bottom)+0.5rem)]');
    expect(shellSource).toContain('min-h-[52px]');
    expect(shellSource).toContain('setMobileOpen(true)');
    expect(shellSource).toContain('{visibleMobileNavItems.map(renderMobileNavButton)}');
  });

  test('viewport and root CSS support safe mobile chrome without hostile zoom restrictions', () => {
    const htmlSource = readRepoFile('index.html');
    const cssSource = readRepoFile('src/index.css');
    const appSource = readRepoFile('src/App.tsx');

    expect(htmlSource).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />');
    expect(htmlSource).not.toContain('user-scalable=no');
    expect(htmlSource).not.toContain('maximum-scale=1');
    expect(cssSource).toContain('html,\nbody,\n#root');
    expect(cssSource).toContain('width: 100%;');
    expect(cssSource).toContain('overflow-x: hidden;');
    expect(appSource).toContain('text-base text-[#02132D]');
    expect(appSource).toContain('md:text-sm');
  });

  test('slice does not add backend, auth, native, or package scope', () => {
    const appSource = readRepoFile('src/App.tsx');
    const packageSource = readRepoFile('package.json');
    const navRelatedSource = [
      sourceBetween(appSource, 'type MobileNavItem = {', 'type PrivacyRequestKind'),
      sourceBetween(appSource, 'const homeownerMobileNavItems: MobileNavItem[] = [', '  return (\n    <SidebarLayout\n      brand={{ name: \'ServSync\''),
      sourceBetween(appSource, 'const contractorMobileNavItems: MobileNavItem[] = [', '  return (\n    <SidebarLayout\n      brand={{ name: contractorDraft.business_name'),
      sourceBetween(appSource, 'function SidebarLayout({', 'function PhotoUploadPanel({'),
    ].join('\n').toLowerCase();

    expect(navRelatedSource).not.toContain('supabase.rpc');
    expect(navRelatedSource).not.toContain('.from(');
    expect(navRelatedSource).not.toContain('auth.');
    expect(navRelatedSource).not.toContain('entitlement');
    expect(navRelatedSource).not.toContain('serviceworker');
    expect(navRelatedSource).not.toContain('capacitor');
    expect(packageSource.toLowerCase()).not.toContain('capacitor');
  });
});
