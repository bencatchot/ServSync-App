import { expect, test, type Page } from '@playwright/test';

const summary = {
  workspace: { workspace_id: '20000000-0000-4000-8000-000000000001', workspace_kind: 'contractor', display_name: 'Contractor A' },
  entitlements: {
    plan_key: 'free_beta', active_media_slots: 3, monthly_video_generations: 4,
    ready_scheduled_post_limit: 5, max_generated_video_seconds: 75,
    published_media_retention_hours: 72, abandoned_media_expiration_days: 30,
    generation_enabled: true, usage_period: 'rolling_30_days',
  },
  usage: { video_generations_rolling_30_days: 2, ai_text_drafts_rolling_30_days: 3, active_media_slots: 1, active_media_bytes: 2048, ready_scheduled_posts: 3 },
  generation: { enabled: true, global_budget_configured: true, global_warning: false, global_hard_stop: false,
    recent_text_draft: { provider: 'openai', model: 'gpt-4o-mini', cost_status: 'unavailable', known_cost_microusd: null,
      estimated_cost_microusd: null, outcome: 'succeeded', input_tokens: 120, output_tokens: 38, occurred_at: '2026-08-18T12:00:00.000Z' } },
  recent_media: [],
};

async function installHarness(page: Page, platformControls: boolean) {
  await page.goto('/');
  await page.evaluate(async ({ summaryValue, platform }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
      createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
    }).createRoot;
    const module = await dynamicImport('/src/features/marketing/MarketingUsagePanel.tsx');
    const Panel = module.MarketingUsagePanel as (...args: unknown[]) => unknown;
    const client = {
      rpc: async (name: string) => {
        if (name === 'servsync_ensure_contractor_marketing_workspace') return { data: {}, error: null };
        if (name === 'servsync_get_marketing_usage_summary') return { data: summaryValue, error: null };
        if (name === 'servsync_get_marketing_cost_controls') return { data: {
          generation_enabled: true, monthly_budget_microusd: 10000000,
          warning_percent: 80, hard_stop_percent: 100, current_spend_microusd: 1500000,
          stop_reason: null, updated_at: '2026-08-17T12:00:00.000Z',
        }, error: null };
        return { data: null, error: { message: 'Unexpected RPC' } };
      },
      storage: { from: () => ({ upload: async () => ({ data: null, error: null }), remove: async () => ({ data: null, error: null }) }) },
    };
    document.body.innerHTML = '<main class="mx-auto max-w-5xl bg-slate-50 p-4"><div id="root"></div></main>';
    createRoot(document.getElementById('root') as HTMLElement).render(React.createElement(Panel, {
      client,
      contractorId: platform ? null : '30000000-0000-4000-8000-000000000001',
      platformControls: platform,
    }));
  }, { summaryValue: { ...summary, workspace: { ...summary.workspace, workspace_kind: platformControls ? 'internal' : 'contractor' } }, platform: platformControls });
}

test('contractor sees simple quota state and rights-gated media upload without platform cost controls', async ({ page }) => {
  await installHarness(page, false);
  await expect(page.getByTestId('marketing-usage-video-generations')).toContainText('2 of 4');
  await expect(page.getByTestId('marketing-usage-ai-drafts')).toContainText('3');
  await expect(page.getByTestId('marketing-usage-active-media')).toContainText('1 of 3');
  await expect(page.getByTestId('marketing-usage-prepared-posts')).toContainText('3 of 5');
  await expect(page.getByText('I have the right to use this media publicly')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add media' })).toBeDisabled();
  await expect(page.getByText('Platform generation controls')).toHaveCount(0);
  await expect(page.getByTestId('marketing-usage-panel')).not.toContainText('$1.50');
});

test('platform admin sees platform controls separately and no contractor upload', async ({ page }) => {
  await installHarness(page, true);
  await expect(page.getByText('Platform generation controls')).toBeHidden();
  await page.getByText('Platform operations').click();
  await expect(page.getByText('Platform generation controls')).toBeVisible();
  await expect(page.getByText('Current recorded or estimated Marketing spend: $1.50')).toBeVisible();
  await expect(page.getByText('Add Marketing media')).toHaveCount(0);
});

test('mobile quota view has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installHarness(page, false);
  await expect(page.getByTestId('marketing-usage-panel')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
