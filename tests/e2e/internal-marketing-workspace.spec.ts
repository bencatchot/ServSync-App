import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MARKETING_WORKSPACE_SECTIONS,
  buildInternalMarketingOverview,
  canAccessInternalMarketing,
} from '../../src/features/marketing/marketingDomain';
import type { UserRole } from '../../src/types';

const overview = buildInternalMarketingOverview({
  contractors: 4,
  homeowners: 9,
  activeInvites: 2,
});

const planningState = {
  profile: {
    profile_id: '00000000-0000-4000-8000-000000000038',
    workspace_key: 'servsync_internal',
    workspace_kind: 'internal',
    contractor_id: null,
    business_name: 'ServSync',
    business_summary: 'ServSync internal Marketing strategy.',
    audience_segments: ['Small contractors'],
    service_focus: ['Contractor software'],
    primary_goal: 'Increase qualified awareness.',
    secondary_goals: [],
    geographic_focus: null,
    tone_style: 'Practical and approachable.',
    offers: [],
    preferred_channels: ['social'],
    emphasized_topics: ['Estimates and approvals'],
    avoided_topics: ['Unsupported claims'],
    owner_notes: 'Internal only.',
    profile_status: 'ready',
    profile_version: 1,
    updated_at: '2026-08-10T12:00:00.000Z',
  },
  plan: null,
  recent_content: { window_limit: 20, item_count: 0, items: [] },
};

async function installMarketingHarness(page: Page, role: UserRole) {
  await page.goto('/');
  await page.evaluate(async ({ role, overview, planningState }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as {
      createElement: (...args: unknown[]) => unknown;
    };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
      createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
    }).createRoot;
    const module = await dynamicImport('/src/features/marketing/MarketingWorkspace.tsx');
    const Workspace = module.InternalMarketingWorkspace as (...args: unknown[]) => unknown;
    const client = {
      rpc: async (name: string) => {
        if (name === 'servsync_get_internal_marketing_planning') return { data: planningState, error: null };
        if (name === 'servsync_get_internal_marketing_directions') return { data: { accepted_plan: null, directions: [] }, error: null };
        return { data: [], error: null };
      },
    };

    document.body.innerHTML = '<main class="mx-auto max-w-6xl bg-slate-50 p-4"><div id="marketing-test-root"></div></main>';
    createRoot(document.getElementById('marketing-test-root') as HTMLElement).render(
      React.createElement(Workspace, { role, overview, client }),
    );
  }, { role, overview, planningState });
}

test.describe('internal Marketing workspace', () => {
  test('authorization is fail-closed for contractor, homeowner, missing, and unknown roles', async ({ page }) => {
    expect(canAccessInternalMarketing('platform_admin')).toBe(true);
    expect(canAccessInternalMarketing('contractor')).toBe(false);
    expect(canAccessInternalMarketing('homeowner')).toBe(false);
    expect(canAccessInternalMarketing(null)).toBe(false);
    expect(canAccessInternalMarketing(undefined)).toBe(false);
    expect(canAccessInternalMarketing('owner' as UserRole)).toBe(false);

    for (const role of ['contractor', 'homeowner'] as const) {
      await installMarketingHarness(page, role);
      await expect(page.getByTestId('marketing-workspace')).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'Overview' })).toHaveCount(0);
    }
  });

  test('the application mounts Marketing only inside the platform-admin shell', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(source).toContain("profile.role === 'platform_admin' && <PlatformAdminDashboard profile={profile}");
    expect(source).toContain("{ id: 'marketing',    label: 'Marketing'");
    expect(source).toContain('<InternalMarketingWorkspace role={profile.role} overview={marketingOverview} client={supabase!} />');
    expect(source.match(/<InternalMarketingWorkspace/g)).toHaveLength(1);
  });

  test('authorized internal users see honest metrics and empty operating states', async ({ page }) => {
    await installMarketingHarness(page, 'platform_admin');

    await expect(page.getByTestId('marketing-workspace')).toHaveAttribute('data-marketing-audience', 'internal');
    await expect(page.getByTestId('marketing-metric-published')).toContainText('0');
    await expect(page.getByTestId('marketing-metric-published')).toContainText('Published from this workspace.');
    await expect(page.getByTestId('marketing-metric-website_visits')).toContainText('Not connected');
    await expect(page.getByTestId('marketing-metric-signups')).toContainText('Unavailable');
    await expect(page.getByTestId('marketing-metric-contractors')).toContainText('4');
    await expect(page.getByTestId('marketing-metric-homeowners')).toContainText('9');
    await expect(page.getByTestId('marketing-metric-invites')).toContainText('2');
    await expect(page.getByTestId('marketing-needs-approval')).toContainText('Nothing waiting for approval');
    await expect(page.getByTestId('marketing-upcoming')).toContainText('Nothing scheduled');
    await expect(page.getByTestId('marketing-recommended-action')).toContainText('No recommendation available');
    await expect(page.getByTestId('marketing-workspace')).not.toContainText(/\b[1-9][0-9]{2,}\b/);
  });

  test('missing admin overview data remains unavailable instead of becoming a fake zero', () => {
    const unavailable = buildInternalMarketingOverview({
      contractors: null,
      homeowners: null,
      activeInvites: null,
    });

    expect(unavailable.metrics.find(metric => metric.id === 'contractors')).toMatchObject({ value: null, state: 'unavailable' });
    expect(unavailable.metrics.find(metric => metric.id === 'homeowners')).toMatchObject({ value: null, state: 'unavailable' });
    expect(unavailable.metrics.find(metric => metric.id === 'invites')).toMatchObject({ value: null, state: 'unavailable' });
    expect(unavailable.approvals).toEqual([]);
    expect(unavailable.upcoming).toEqual([]);
    expect(unavailable.recommendedNextAction).toBeNull();
  });

  test('all six destinations render intentional foundation states', async ({ page }) => {
    await installMarketingHarness(page, 'platform_admin');

    expect(MARKETING_WORKSPACE_SECTIONS).toEqual(['overview', 'content', 'campaigns', 'prospects', 'growth', 'settings']);
    for (const section of MARKETING_WORKSPACE_SECTIONS) {
      const tab = page.getByTestId(`marketing-nav-${section}`);
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      if (section === 'overview') await expect(page.getByTestId('marketing-overview')).toBeVisible();
      else if (section === 'content') await expect(page.getByTestId('marketing-content-workspace')).toBeVisible();
      else if (section === 'campaigns') await expect(page.getByTestId('marketing-publishing-workspace')).toBeVisible();
      else if (section === 'settings') await expect(page.getByTestId('marketing-planning-workspace')).toBeVisible();
      else await expect(page.getByTestId(`marketing-section-${section}`)).toBeVisible();
    }
  });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`${viewport.name} layout remains usable without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installMarketingHarness(page, 'platform_admin');
      await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
