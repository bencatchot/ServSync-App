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
    expect(navSource).toContain("setInspectionView('list')");
    expect(sourceBetween(navSource, "id: 'jobs'", "id: 'dashboard'")).not.toContain('badge:');
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

  test('contractor drawer/sidebar suppresses raw Calendar and Jobs badges while preserving content counts', () => {
    const appSource = readRepoFile('src/App.tsx');
    const contractorNavSource = sourceBetween(
      appSource,
      'const contractorMobileNavItems: MobileNavItem[] = [',
      '  return (\n    <SidebarLayout\n      brand={{ name: contractorDraft.business_name',
    );
    const contractorShellSource = sourceBetween(
      appSource,
      'const contractorMobileNavItems: MobileNavItem[] = [',
      '      mobileNavItems={contractorMobileNavItems}',
    );
    const contractorTabsSource = sourceBetween(
      contractorShellSource,
      "tabs={[\n        { id: 'overview',     label: 'Dashboard'",
      '      ]}\n      activeTab={contractorTab}',
    );
    const homeownerNavSource = sourceBetween(
      appSource,
      'const homeownerMobileNavItems: MobileNavItem[] = [',
      '  return (\n    <SidebarLayout\n      brand={{ name: \'ServSync\'',
    );
    const contractorJobsMobileNavSource = sourceBetween(contractorNavSource, "id: 'jobs'", "id: 'dashboard'");
    const contractorCalendarTabSource = sourceBetween(contractorTabsSource, "id: 'calendar'", "id: 'invites'");
    const contractorJobsTabSource = sourceBetween(contractorTabsSource, "id: 'inspections'", "id: 'trust'");

    expect(appSource).toContain('const contractorHomeownersBadgeCount = SERVSYNC_DEMO_PRESENTATION_MODE ? 0 : connectionRequests.length;');
    expect(appSource).toContain('const contractorServiceRequestsBadgeCount = SERVSYNC_DEMO_PRESENTATION_MODE ? 0 : contractorFollowUpCount || openServiceRequestCount;');
    expect(appSource).not.toContain('const contractorJobsAttentionCount =');
    expect(appSource).not.toContain('const contractorCalendarBadgeCount =');
    expect(appSource).not.toContain('badge: contractorJobsAttentionCount');
    expect(appSource).not.toContain('badge: contractorCalendarBadgeCount');
    expect(contractorCalendarTabSource).toContain("label: 'Calendar'");
    expect(contractorCalendarTabSource).not.toContain('badge:');
    expect(contractorJobsTabSource).toContain("label: 'Jobs'");
    expect(contractorJobsTabSource).not.toContain('badge:');
    expect(contractorJobsMobileNavSource).not.toContain('badge:');
    expect(contractorNavSource).not.toContain('badge: contractorJobsAttentionCount');
    expect(contractorNavSource).toContain('badge: contractorHomeownersBadgeCount');
    expect(contractorNavSource).not.toContain('badge: actionReviewCount');

    expect(appSource).toContain('const homeownerRequestsBadgeCount = SERVSYNC_DEMO_PRESENTATION_MODE ? 0 : homeownerActionRequestCount;');
    expect(appSource).toContain('const homeownerEstimatesInvoicesBadgeCount = SERVSYNC_DEMO_PRESENTATION_MODE ? 0 : homeownerFinancialBadgeCount;');
    expect(appSource).toContain("{ id: 'requests',     label: 'Service Requests',  icon: <MessageSquare size={17} />, badge: homeownerRequestsBadgeCount");
    expect(appSource).toContain("{ id: 'estimates',    label: 'Estimates / Invoices', icon: <Receipt size={17} />, badge: homeownerEstimatesInvoicesBadgeCount");
    expect(homeownerNavSource).toContain('badge: homeownerRequestsBadgeCount');
    expect(homeownerNavSource).not.toContain('dashboardAcceptedWorkEstimates.length + openHomeownerInvoiceCount + pendingEstimateCount');
  });

  test('contractor Jobs uses section header tabs while keeping compact mobile overview tiles', () => {
    const appSource = readRepoFile('src/App.tsx');
    const jobsShellSource = sourceBetween(
      appSource,
      "{(contractorTab === 'inspections' || (contractorTab === 'connections' && inspectionView === 'detail' && activeInspection)) && (",
      '          {/* ── LIST VIEW ── */}',
    );
    const jobsListSource = sourceBetween(
      appSource,
      "          {inspectionView === 'list' && (",
      "{contractorJobsView === 'overview' && (",
    );
    const jobsOverviewSource = sourceBetween(
      appSource,
      "{contractorJobsView === 'overview' && (",
      "{contractorJobsView === 'new_financial' && (",
    );
    const financialOverviewSource = sourceBetween(
      jobsOverviewSource,
      '<h3 className="text-sm font-bold text-slate-950">Estimates / Invoices</h3>',
      '<h3 className="text-sm font-bold text-slate-950">Templates & pricing</h3>',
    );
    const toolsOverviewSource = sourceBetween(
      jobsOverviewSource,
      '<h3 className="text-sm font-bold text-slate-950">Templates & pricing</h3>',
      '</section>',
    );

    expect(appSource).toContain('const setContractorJobsViewAndScroll = useCallback((view: ContractorJobsView) => {');
    expect(appSource).toContain("window.matchMedia('(max-width: 767px)').matches");
    expect(appSource).not.toContain('data-testid="contractor-jobs-mobile-fixed-subheader"');
    expect(appSource).not.toContain('data-testid="contractor-jobs-mobile-fixed-subheader-spacer"');
    expect(appSource).not.toContain('data-testid="contractor-jobs-mobile-overview-back"');
    expect(jobsShellSource).not.toContain("contractorTab === 'inspections' && contractorJobsView !== 'overview'");
    expect(jobsShellSource).not.toContain('fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)]');
    expect(jobsShellSource).not.toContain('sticky top-0');
    expect(jobsShellSource).not.toContain('sticky top-[calc(env(safe-area-inset-top)+0.5rem)]');
    expect(jobsShellSource).not.toContain('z-50');
    expect(jobsShellSource).not.toContain('border-y border-slate-200 bg-white/95');
    expect(jobsShellSource).not.toContain('px-3 py-1 shadow-sm');
    expect(jobsShellSource).not.toContain('bg-blue-50/95');
    expect(jobsShellSource).not.toContain('shadow-lg');
    expect(jobsShellSource).not.toContain('className="h-[4rem] md:hidden"');
    expect(appSource).toContain('Back to Jobs Overview');
    expect(appSource).toContain('Back to Jobs');

    expect(appSource).toContain("type ContractorJobsHeaderTab = 'overview' | 'estimates' | 'invoices' | 'jobs_reports' | 'templates';");
    expect(appSource).toContain("type ContractorFinancialRecordKind = 'estimates' | 'invoices';");
    expect(appSource).toContain("const [contractorFinancialRecordKind, setContractorFinancialRecordKind] = useState<ContractorFinancialRecordKind>('estimates');");
    expect(appSource).toContain('const contractorJobsHeaderTabForView = (view: ContractorJobsView): ContractorJobsHeaderTab => {');
    expect(appSource).toContain('const openContractorJobsHeaderTab = (tab: ContractorJobsHeaderTab) => {');
    expect(jobsListSource).toContain('data-testid="contractor-jobs-header-tabs"');
    expect(jobsListSource).toContain('role="tablist"');
    expect(jobsListSource).toContain('aria-label="Contractor Jobs section tabs"');
    expect(jobsListSource).toContain('grid w-full grid-cols-6 gap-1.5 lg:w-auto lg:grid-cols-5 lg:gap-2');
    expect(jobsListSource).not.toContain('overflow-x-auto');
    expect(jobsListSource).toContain("{ id: 'overview', label: 'Overview'");
    expect(jobsListSource).toContain("{ id: 'estimates', label: 'Estimates'");
    expect(jobsListSource).toContain("{ id: 'invoices', label: 'Invoices'");
    expect(jobsListSource).toContain("{ id: 'jobs_reports', label: 'Jobs & Reports'");
    expect(jobsListSource).toContain("{ id: 'templates', label: 'Templates'");
    expect(jobsListSource).toContain("mobileClassName: 'col-span-2'");
    expect(jobsListSource).toContain("mobileClassName: 'col-span-3'");
    expect(jobsListSource).toContain('min-h-[3.25rem]');
    expect(jobsListSource).toContain('lg:col-span-1');
    expect(jobsListSource).toContain('data-testid={`contractor-jobs-header-tab-${tab.id}`}');
    expect(appSource).toContain("if (tab === 'estimates') {");
    expect(appSource).toContain("setContractorFinancialRecordKind('estimates');");
    expect(appSource).toContain("if (tab === 'invoices') {");
    expect(appSource).toContain("setContractorFinancialRecordKind('invoices');");
    expect(appSource).toContain("if (tab === 'jobs_reports') {");
    expect(appSource).toContain("setContractorJobsViewAndScroll('open_jobs');");
    expect(appSource).toContain("setContractorJobsViewAndScroll('templates');");

    expect(jobsOverviewSource).toContain('data-testid="contractor-jobs-overview"');
    expect(jobsOverviewSource).toContain('data-testid="contractor-jobs-overview-tile-grid"');
    expect(jobsOverviewSource).toContain('grid grid-cols-2 gap-2 md:grid-cols-3');
    expect(jobsOverviewSource).toContain("id: 'new_jobs' as const, label: 'New Jobs'");
    expect(jobsOverviewSource).toContain("id: 'open_jobs' as const, label: 'Open Jobs'");
    expect(jobsOverviewSource).toContain("value: String(jobsCustomerFilterSubjectId ? openJobsForSelectedCustomer.length : openJobs.length)");
    expect(jobsOverviewSource).toContain("id: 'closed_jobs' as const, label: 'Completed / Closed Jobs'");
    expect(jobsOverviewSource.indexOf("id: 'new_jobs' as const, label: 'New Jobs'")).toBeLessThan(jobsOverviewSource.indexOf("id: 'open_jobs' as const, label: 'Open Jobs'"));
    expect(jobsOverviewSource.indexOf("id: 'open_jobs' as const, label: 'Open Jobs'")).toBeLessThan(jobsOverviewSource.indexOf("id: 'closed_jobs' as const, label: 'Completed / Closed Jobs'"));
    expect(jobsOverviewSource).toContain("mobileTileClassName: 'order-1 col-span-2 md:order-none md:col-span-1'");
    expect(jobsOverviewSource).toContain("mobileTileClassName: 'order-2 md:order-none'");
    expect(jobsOverviewSource).toContain("mobileTileClassName: 'order-3 md:order-none'");
    expect(jobsOverviewSource).toContain('${item.mobileTileClassName} rounded-xl border p-2.5 text-left transition sm:p-3');
    expect(jobsOverviewSource).toContain('line-clamp-2');
    expect(jobsOverviewSource).toContain('setContractorJobsViewAndScroll(item.id)');
    expect(jobsOverviewSource).toContain("if (item.id === 'new_jobs') setInspectionView(DRAFT_JOB_UI_ENABLED ? 'draft_job' : 'new')");
    expect(jobsOverviewSource).toContain("if (item.id !== 'new_jobs') setInspectionView('list')");
    expect(jobsOverviewSource).not.toContain('overflow-x-auto');

    expect(financialOverviewSource).toContain("id: 'new_financial' as const, label: 'New Estimate/Invoice'");
    expect(financialOverviewSource).toContain("id: 'open_financial' as const, label: 'Open Estimates / Invoices'");
    expect(financialOverviewSource).toContain("id: 'closed_financial' as const, label: 'Closed / Billed Records'");
    expect(financialOverviewSource).toContain("mobileTileClassName: 'order-1 col-span-2 md:order-none md:col-span-1'");
    expect(financialOverviewSource).toContain("index === 0 ? 'order-2 md:order-none' : 'order-3 md:order-none'");
    expect(financialOverviewSource).toContain('setContractorJobsViewAndScroll(item.id)');
    expect(financialOverviewSource).toContain("setInspectionView('list')");

    expect(toolsOverviewSource).toContain('data-testid="contractor-jobs-overview-tools-list"');
    expect(toolsOverviewSource).toContain('space-y-2 md:grid md:grid-cols-3 md:gap-2 md:space-y-0');
    expect(toolsOverviewSource).toContain("id: 'templates'");
    expect(toolsOverviewSource).toContain("id: 'custom_pricing'");
    expect(toolsOverviewSource).toContain("id: 'service_agreements'");
    expect(toolsOverviewSource).toContain("setContractorJobsViewAndScroll('templates')");
    expect(toolsOverviewSource).toContain("setContractorJobsViewAndScroll('custom_pricing')");
    expect(toolsOverviewSource).toContain("setContractorJobsViewAndScroll('service_agreements')");
    expect(toolsOverviewSource).not.toContain('col-span-2');
    expect(toolsOverviewSource).not.toContain('order-1');
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
    expect(shellSource).toContain('item.onSelect?.();');
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
