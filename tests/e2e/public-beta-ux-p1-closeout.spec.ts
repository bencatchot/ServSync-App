import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loginAs, openSidebarTab } from './helpers/auth';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

async function installScheduleHarness(page: Page, itemCounts: number[]) {
  await page.goto('/');
  await page.evaluate(async counts => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const scheduleModule = await dynamicImport('/src/features/dashboard/ContractorScheduleSnapshot.tsx');
    const React = reactModule.default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const Component = scheduleModule.ContractorScheduleSnapshot as (...args: unknown[]) => unknown;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, index) => ({
      key: `day-${index}`,
      label,
      dateLabel: `Aug ${10 + index}`,
      isToday: index === 2,
    }));
    const tones = ['amber', 'emerald', 'sky', 'violet'] as const;
    const itemsByDay = Object.fromEntries(days.map((day, dayIndex) => [
      day.key,
      Array.from({ length: counts[dayIndex] ?? 0 }, (_, itemIndex) => ({
        id: `${day.key}-${itemIndex}`,
        title: `Scheduled work ${dayIndex}-${itemIndex}`,
        meta: `Customer ${dayIndex}`,
        timeLabel: `${9 + itemIndex}:00 AM`,
        statusLabel: 'Scheduled',
        tone: tones[(dayIndex + itemIndex) % tones.length],
        onOpen: () => undefined,
      })),
    ]));

    document.body.innerHTML = '<main id="schedule-root" class="mx-auto max-w-4xl p-4"></main>';
    createRoot(document.getElementById('schedule-root') as HTMLElement).render(React.createElement(Component, {
      days,
      itemsByDay,
      weekLabel: 'Aug 10 - Aug 16',
      isCurrentWeek: true,
      onPreviousWeek: () => undefined,
      onNextWeek: () => undefined,
      onThisWeek: () => undefined,
      onOpenCalendar: () => undefined,
    }));
  }, itemCounts);
}

test.describe('public beta UX P1 closeout', () => {
  test('Jobs is first-class Customer Work navigation on desktop and mobile', () => {
    const app = read('src/App.tsx');
    const tabs = app.slice(app.indexOf('tabs={['), app.indexOf('activeTab={contractorTab}'));
    expect(tabs).toContain("{ id: 'inspections',  label: 'Jobs',               icon: <ClipboardCheck size={17} />, group: 'Customer Work' }");
    expect(tabs.indexOf("label: 'Jobs'")).toBeLessThan(tabs.indexOf("label: 'Customers'"));
    expect(tabs).not.toContain("group: 'Add-ons'");
    expect(app).toContain("id: 'jobs',\n      label: 'Jobs'");
  });

  for (const viewport of [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`empty schedule stays compact and useful on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await installScheduleHarness(page, []);
      const snapshot = page.getByTestId('contractor-schedule-snapshot');
      await expect(snapshot).toHaveAttribute('data-schedule-count', '0');
      await expect(page.getByTestId('contractor-schedule-empty')).toBeVisible();
      await expect(page.getByText('Nothing scheduled this week.')).toBeVisible();
      await expect(page.getByTestId('contractor-schedule-days')).toHaveCount(0);
      expect((await snapshot.boundingBox())?.height ?? 999).toBeLessThan(viewport.name === 'mobile' ? 330 : 230);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    });
  }

  test('light schedule renders only populated days and summarizes the rest', async ({ page }) => {
    await installScheduleHarness(page, [0, 1, 0, 0, 0, 0, 0]);
    await expect(page.getByTestId('contractor-schedule-snapshot')).toHaveAttribute('data-schedule-count', '1');
    await expect(page.getByTestId('contractor-schedule-days').locator(':scope > div')).toHaveCount(1);
    await expect(page.getByText('6 other days have no scheduled items.')).toBeVisible();
  });

  test('realistically populated schedule keeps all events and week navigation usable', async ({ page }) => {
    await installScheduleHarness(page, [1, 2, 1, 1, 2, 1, 1]);
    await expect(page.getByTestId('contractor-schedule-snapshot')).toHaveAttribute('data-schedule-count', '9');
    await expect(page.getByTestId('contractor-schedule-days').locator(':scope > div')).toHaveCount(7);
    await expect(page.getByRole('button', { name: 'Previous week' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next week' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open full calendar' })).toBeVisible();
  });
});

test.describe('public beta UX P1 exact-head Sandbox', () => {
  test.skip(process.env.SERVSYNC_VALIDATION_TARGET !== 'sandbox', 'Sandbox credentials and target are required.');

  test('opens the first-class Jobs workspace and selects an authorized Customer without persistence', async ({ page }) => {
    const main = page.getByRole('main');
    await loginAs(page, 'contractor');
    await openSidebarTab(page, /^Jobs\b/i);
    await expect(main.getByTestId('contractor-work-dashboard')).toBeVisible();
    await main.getByTestId('contractor-work-start-draft').click();

    const customer = main.getByTestId('durable-draft-customer');
    await expect(customer).toBeVisible();
    await customer.click();
    const results = main.getByRole('listbox', { name: 'Customer search results' });
    await expect(results.getByRole('option').first()).toBeVisible();
    await customer.press('Enter');
    await expect(customer).not.toHaveValue('');
    await expect(main.getByTestId('durable-draft-property')).toBeVisible();
  });
});
