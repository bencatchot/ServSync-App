import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

async function mountTodayWorkHarness(page: import('@playwright/test').Page, empty = false) {
  await page.goto('/');
  await page.evaluate(async emptyState => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const todayModule = await dynamicImport('/src/features/dashboard/ContractorScheduleSnapshot.tsx');
    const React = reactModule.default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const ContractorTodayWork = todayModule.ContractorTodayWork as (...args: unknown[]) => unknown;
    const mark = (value: string) => { document.body.dataset.opened = value; };
    const items = emptyState ? [] : [
      { id: 'next', title: 'Replace leaking water heater', meta: 'Sarah Homeowner', timeLabel: '9:00 AM', statusLabel: 'Scheduled', tone: 'sky', onOpen: () => mark('next') },
      { id: 'later', title: 'Review kitchen outlet request with a deliberately long customer-facing title', meta: 'Alex Customer', timeLabel: '1:30 PM', statusLabel: 'Needs response', tone: 'amber', onOpen: () => mark('later') },
    ];
    document.body.innerHTML = '<main id="phase-05-mobile-root" class="p-3"></main>';
    createRoot(document.getElementById('phase-05-mobile-root')!).render(React.createElement(ContractorTodayWork, {
      items,
      onOpenCalendar: () => mark('calendar'),
    }));
  }, empty);
}

test.describe('Phase 0.5 field-critical mobile acceptance', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Today’s Work exposes one dominant next action without mobile overflow', async ({ page }) => {
    await mountTodayWorkHarness(page);

    const today = page.getByTestId('contractor-todays-work');
    await expect(today.getByRole('heading', { name: /^Today’s Work$|^Today's Work$/i })).toBeVisible();
    await expect(today.getByTestId('contractor-todays-work-primary')).toContainText('Next');
    await expect(today.getByTestId('contractor-todays-work-primary')).toContainText('Replace leaking water heater');
    await expect(today.getByTestId('contractor-todays-work-later').getByRole('button')).toHaveCount(1);
    await today.getByTestId('contractor-todays-work-primary').click();
    await expect(page.locator('body')).toHaveAttribute('data-opened', 'next');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('Today’s Work empty state keeps a useful touch-sized return path', async ({ page }) => {
    await mountTodayWorkHarness(page, true);
    const empty = page.getByTestId('contractor-todays-work-empty');
    await expect(empty).toContainText('Nothing is scheduled today');
    const calendar = empty.getByRole('button', { name: /^Open calendar$/i });
    expect((await calendar.evaluate(element => element.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);
    await calendar.click();
    await expect(page.locator('body')).toHaveAttribute('data-opened', 'calendar');
  });

  test('dashboard hierarchy keeps setup off active work and places Today before the week', () => {
    const app = sourceFile('src/App.tsx');
    const contractorDashboard = sourceBetween(app, 'function ContractorDashboard({', 'function SidebarLayout({');
    const overview = sourceBetween(contractorDashboard, "{contractorTab === 'overview' && (", "{contractorTab === 'profile' && (");

    expect(contractorDashboard).toContain("showInitialContractorProfileSetupPrompt && contractorTab === 'overview'");
    expect(contractorDashboard).not.toContain("showInitialContractorProfileSetupPrompt && contractorTab === 'work'");
    expect(overview.indexOf('<ContractorTodayWork')).toBeGreaterThanOrEqual(0);
    expect(overview.indexOf('<ContractorScheduleSnapshot')).toBeGreaterThan(overview.indexOf('<ContractorTodayWork'));
    expect(overview).toContain('items={scheduleSnapshotItems.filter(item => item.dayKey === todayScheduleKey)}');
    expect(contractorDashboard).toContain('const scheduleDataStart = new Date(Math.min(scheduleSnapshotStart.getTime(), dashboardCurrentWeekStart.getTime()))');
    expect(contractorDashboard).toContain('recurringCalendarEventOccurrences(event, scheduleDataStart, scheduleDataEnd)');
  });

  test('public contractor entry actions preserve phone touch targets', () => {
    const app = sourceFile('src/App.tsx');
    const topBar = sourceBetween(app, 'function TopBar({', 'function NavButton({');
    const landing = sourceBetween(app, 'function LandingPage()', 'function PasswordResetUpdatePage');

    expect(topBar).toMatch(/updateRoute\('contractor'\)[\s\S]*?min-h-11[\s\S]*?Sign in/);
    expect(landing).toMatch(/updateRoute\('contractor', 'mode=signup'\)[\s\S]*?min-h-11/);
    expect(landing).toMatch(/updateRoute\('homeowner', 'mode=signup'\)[\s\S]*?min-h-11/);
    expect(landing).toMatch(/updateRoute\('trust-safety'\)[\s\S]*?min-h-11/);
  });

  test('homeowner Estimate handoffs stack primary and secondary actions on phones', () => {
    const app = sourceFile('src/App.tsx');
    const estimateCard = sourceBetween(app, 'const renderHomeownerEstimateCard =', 'const renderHomeownerRecordsSection =');

    expect(estimateCard).toContain('className={`mt-3 ${mobileActionRowClass()}`}');
    expect(estimateCard).toContain("mobileButtonClass(options.needsReview && !isOpen ? 'primary' : 'secondary')");
    expect(estimateCard).toContain("className={mobileButtonClass('primary')}");
    expect(estimateCard).toContain("className={mobileButtonClass('secondary')}");
    expect(estimateCard).toContain('data-testid="homeowner-accept-estimate"');
    expect(estimateCard).toContain('View Home History');
  });

  test('Job checklist save prompt remains reachable above the mobile keyboard', () => {
    const app = sourceFile('src/App.tsx');
    const prompt = sourceBetween(app, '{homeTemplatePrompt && (', "{contractorTab === 'overview' && (");

    expect(prompt).toContain('role="dialog"');
    expect(prompt).toContain('aria-modal="true"');
    expect(prompt).toContain('overflow-y-auto overscroll-contain');
    expect(prompt).toContain('max-h-[calc(100dvh-1.5rem)]');
    expect(prompt).toContain('mobileActionRowClass()');
    expect(prompt).toContain("mobileButtonClass('primary')");
  });
});
