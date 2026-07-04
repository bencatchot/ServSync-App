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

    expect(labelsFrom(navSource)).toEqual(['Dashboard', 'Jobs', 'Money', 'Messages', 'More']);
    expect(navSource).toContain("id: 'dashboard'");
    expect(navSource).toContain("onSelect: () => setContractorTab('overview')");
    expect(navSource).toContain("id: 'jobs'");
    expect(navSource).toContain("setContractorJobsView('open_jobs')");
    expect(navSource).toContain("id: 'money'");
    expect(navSource).toContain("setContractorJobsView('open_financial')");
    expect(navSource).toContain("id: 'messages'");
    expect(navSource).toContain("onSelect: () => setContractorTab('requests')");
    expect(navSource).toContain("id: 'more'");
    expect(navSource).toContain('opensMenu: true');
    expect(navSource.toLowerCase()).not.toContain('general chat');
    expect(navSource.toLowerCase()).not.toContain('broad chat');
  });

  test('homeowner mobile nav has exactly the approved five items and keeps Projects on existing records', () => {
    const appSource = readRepoFile('src/App.tsx');
    const navSource = sourceBetween(
      appSource,
      'const homeownerMobileNavItems: MobileNavItem[] = [',
      '  return (\n    <SidebarLayout\n      brand={{ name: \'ServSync\'',
    );

    expect(labelsFrom(navSource)).toEqual(['Home', 'Requests', 'Projects', 'Contractors', 'More']);
    expect(navSource).toContain("onSelect: () => setHomeownerTab('overview')");
    expect(navSource).toContain("onSelect: () => setHomeownerTab('requests')");
    expect(navSource).toContain("setHomeownerTab('estimates')");
    expect(navSource).toContain('setHomeownerRecordSection(homeownerProjectSection)');
    expect(navSource).toContain("onSelect: () => setHomeownerTab('contractors')");
    expect(navSource).toContain('opensMenu: true');
    expect(appSource).not.toContain("type HomeownerTab = 'overview' | 'home' | 'contractors' | 'requests' | 'projects'");
    expect(appSource).not.toContain("homeownerTab === 'projects'");
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
    expect(shellSource).toContain('min-h-[52px]');
    expect(shellSource).toContain('setMobileOpen(true)');
    expect(shellSource).toContain('{visibleMobileNavItems.map(renderMobileNavButton)}');
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
