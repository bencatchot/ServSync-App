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

    expect(labelsFrom(navSource)).toEqual(['Discover', 'Work', 'Dashboard', 'Customers', 'More']);
    expect(labelsFrom(navSource)).not.toContain('Money');
    expect(labelsFrom(navSource)).not.toContain('Messages');
    expect(navSource).toContain("id: 'discover'");
    expect(navSource).toContain("onSelect: () => setContractorTab('discover')");
    expect(navSource).toContain("id: 'dashboard'");
    expect(navSource).toContain("onSelect: () => setContractorTab('overview')");
    expect(navSource).toContain("id: 'work'");
    expect(navSource).toContain("setContractorTab('work')");
    expect(navSource).toContain("setContractorWorkViewAndScroll('overview')");
    expect(navSource).toContain("setInspectionView('list')");
    expect(sourceBetween(navSource, "id: 'work'", "id: 'dashboard'")).not.toContain('badge:');
    expect(navSource).not.toContain("setContractorFinancialsView('open_invoices')");
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

  test('contractor drawer/sidebar suppresses raw Calendar and Work badges while preserving content counts', () => {
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
    const contractorWorkMobileNavSource = sourceBetween(contractorNavSource, "id: 'work'", "id: 'dashboard'");
    const contractorCalendarTabSource = sourceBetween(contractorTabsSource, "id: 'calendar'", "id: 'invites'");
    const contractorWorkTabSource = sourceBetween(contractorTabsSource, "id: 'work'", "id: 'connections'");

    expect(appSource).toContain('const contractorHomeownersBadgeCount = SERVSYNC_DEMO_PRESENTATION_MODE ? 0 : connectionRequests.length;');
    expect(appSource).toContain('const contractorServiceRequestsBadgeCount = SERVSYNC_DEMO_PRESENTATION_MODE ? 0 : contractorFollowUpCount || openServiceRequestCount;');
    expect(appSource).not.toContain('const contractorJobsAttentionCount =');
    expect(appSource).not.toContain('const contractorCalendarBadgeCount =');
    expect(appSource).not.toContain('badge: contractorJobsAttentionCount');
    expect(appSource).not.toContain('badge: contractorCalendarBadgeCount');
    expect(contractorCalendarTabSource).toContain("label: 'Calendar'");
    expect(contractorCalendarTabSource).not.toContain('badge:');
    expect(contractorWorkTabSource).toContain("label: 'Work'");
    expect(contractorWorkTabSource).not.toContain('badge:');
    expect(contractorWorkMobileNavSource).not.toContain('badge:');
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

  test('contractor Work and Financials keep separate mobile ownership', () => {
    const appSource = readRepoFile('src/App.tsx');
    const navigationSource = readRepoFile('src/features/navigation/contractorWorkspaceNavigation.ts');
    const navigationHook = readRepoFile('src/features/navigation/useContractorWorkspaceNavigation.ts');
    const workDashboard = readRepoFile('src/features/work/ContractorWorkDashboard.tsx');
    const financialsDashboard = readRepoFile('src/features/financials/ContractorFinancialsDashboard.tsx');

    expect(appSource).toContain("data-testid={financialsWorkspace ? 'contractor-financials-header-tabs' : 'contractor-work-header-tabs'}");
    expect(appSource).toContain("aria-label={financialsWorkspace ? 'Contractor Financials section tabs' : 'Contractor Work section tabs'}");
    expect(appSource).toContain("setContractorWorkViewAndScroll('open_jobs')");
    expect(appSource).toContain("setContractorFinancialsViewAndScroll('open_invoices')");
    expect(appSource).toContain("...(canManageFinancialActions ? [{ id: 'financials', label: 'Financials'");
    expect(navigationSource).toContain("export type ContractorWorkView");
    expect(navigationSource).toContain("export type ContractorFinancialsView");
    expect(workDashboard).toContain('data-testid="contractor-work-dashboard"');
    expect(workDashboard).not.toContain('label="Invoices"');
    expect(financialsDashboard).toContain('data-testid="contractor-financials-dashboard"');
    expect(financialsDashboard).toContain('Invoice Drafts');
    expect(appSource).not.toContain('data-testid="contractor-jobs-mobile-fixed-subheader"');
    expect(navigationHook).toContain("window.matchMedia('(max-width: 767px)').matches");
  });

  test('shared shell keeps desktop sidebar and adds mobile-only bottom nav with five-item cap', () => {
    const appSource = readRepoFile('src/App.tsx');
    const shellSource = sourceBetween(
      appSource,
      'function SidebarLayout({',
      'function AutocompleteInput({',
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
      sourceBetween(appSource, 'function SidebarLayout({', 'function AutocompleteInput({'),
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
