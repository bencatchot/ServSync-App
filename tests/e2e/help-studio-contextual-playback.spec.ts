import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const walkthrough = {
  walkthrough_id: '10000000-0000-4000-8000-000000000001',
  slug: 'how-to-create-an-estimate', state: 'published', purpose: 'both', current_revision: 1,
  published_revision: 1, title: 'How to create an estimate',
  summary: 'Start a draft, add the agreed work, and create an estimate for review.',
  steps: ['Open Drafts and start a new draft.', 'Choose Estimate and add the work.', 'Review the total and create the estimate.'],
  keywords: ['create estimate', 'quote', 'draft pricing'], feature_area: 'Estimates',
  route_contexts: ['contractor.drafts'], audience_roles: ['owner', 'admin', 'office'],
  source_commit: '5058d65043eb4d14fe29e84c7262fec1267e9e19', source_version: 'Demo recorder v1',
  video_asset_id: '20000000-0000-4000-8000-000000000001', poster_asset_id: null,
  human_paced_review: 'passed', sensitive_data_review: 'passed', canonical_output_review: 'passed',
  validation_status: 'passed', narration_provider: null, narration_voice: null, narration_disclosure: null,
  transcript: 'Create an Estimate Draft and add the agreed work.', video_file_name: 'estimate.mp4',
  video_bytes: 1401657, video_duration: 23, video_width: 1440, video_height: 900,
  poster_file_name: null, created_at: '2026-08-18T00:00:00Z', updated_at: '2026-08-18T00:00:00Z',
  published_at: '2026-08-18T00:00:00Z',
};

async function installAdminHarness(page: Page, item = walkthrough) {
  await page.goto('/');
  await page.evaluate(async ({ item }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const module = await dynamicImport('/src/features/help/HelpStudioWorkspace.tsx');
    const Workspace = module.HelpStudioWorkspace as (...args: unknown[]) => unknown;
    const client = {
      rpc: async (name: string) => {
        if (name === 'servsync_list_help_walkthroughs') return { data: [item], error: null };
        if (name === 'servsync_get_help_media_usage') return { data: { total_assets: 1, total_bytes: 1401657, video_assets: 1, poster_assets: 0, published_walkthroughs: 1, unpublished_walkthroughs: 0 }, error: null };
        return { data: null, error: { message: 'Unexpected RPC' } };
      },
      storage: { from: () => ({ upload: async () => ({ data: null, error: null }) }) },
      auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } }, error: null }) },
    };
    document.body.innerHTML = '<main class="mx-auto max-w-6xl bg-slate-50 p-4"><div id="root"></div></main>';
    createRoot(document.getElementById('root') as HTMLElement).render(React.createElement(Workspace, { client }));
  }, { item: walkthrough });
}

async function installContextHarness(page: Page) {
  await page.route('**/api/help-walkthrough-media', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'data:video/mp4;base64,AAAA' }) }));
  await page.goto('/');
  await page.evaluate(async ({ item }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const module = await dynamicImport('/src/features/help/ContextualHelp.tsx');
    const Component = module.ContextualHelp as (...args: unknown[]) => unknown;
    const searchRow = { ...item, walkthrough_id: item.walkthrough_id, revision: 1, duration_seconds: 23, width: 1440, height: 900, rank: 5 };
    const client = {
      rpc: async (name: string) => name === 'servsync_find_help' ? { data: [searchRow], error: null } : { data: null, error: { message: 'Unexpected RPC' } },
      auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } }, error: null }) },
      storage: { from: () => ({ upload: async () => ({ data: null, error: null }) }) },
    };
    document.body.innerHTML = '<main class="mx-auto max-w-4xl p-4"><div id="root"></div></main>';
    createRoot(document.getElementById('root') as HTMLElement).render(React.createElement(Component, {
      client, contextKey: 'contractor.drafts', contractorId: '30000000-0000-4000-8000-000000000001', label: 'How to create an estimate',
    }));
  }, { item: walkthrough });
}

test('Help Studio is mounted only in the platform-admin shell', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  expect(source).toContain("{ id: 'help_studio',  label: 'Help Studio'");
  expect(source).toContain("{adminTab === 'help_studio' && supabase && (");
  expect(source.match(/<HelpStudioWorkspace/g)).toHaveLength(1);
});

test('admin sees searchable usage, durable metadata, preview, editing, and creation controls', async ({ page }) => {
  await installAdminHarness(page);
  await expect(page.getByRole('heading', { name: 'Help Studio' })).toBeVisible();
  await expect(page.getByLabel('Help media usage').getByText('1.3 MB')).toBeVisible();
  await expect(page.getByText('How to create an estimate')).toBeVisible();
  await expect(page.getByText('Support + Marketing')).toBeVisible();
  await page.getByLabel('Search walkthroughs').fill('quote');
  await expect(page.getByText('How to create an estimate')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('help-studio-editor')).toBeVisible();
  await expect(page.getByLabel('Finished MP4')).toHaveCount(1);
});

test('needs-review walkthrough keeps both publish and unpublish decisions available', async ({ page }) => {
  await installAdminHarness(page, { ...walkthrough, state: 'needs_review', current_revision: 2, published_revision: 1 });
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toBeVisible();
});

test('published contextual help opens without admin controls and keeps text steps alongside video', async ({ page }) => {
  await installContextHarness(page);
  await page.getByRole('button', { name: 'How to create an estimate' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to create an estimate' })).toBeVisible();
  await expect(page.getByText('Open Drafts and start a new draft.')).toBeVisible();
  await expect(page.getByRole('button', { name: /publish|edit|archive/i })).toHaveCount(0);
  await expect(page.locator('video')).toHaveAttribute('controls', '');
});

test('mobile contextual playback remains readable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installContextHarness(page);
  await page.getByRole('button', { name: 'How to create an estimate' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
