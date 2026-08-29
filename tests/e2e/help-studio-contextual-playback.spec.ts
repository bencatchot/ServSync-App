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

const recordingJob = {
  job_id: '40000000-0000-4000-8000-000000000001', target_walkthrough_id: walkthrough.walkthrough_id,
  status: 'ready_for_review', slug: walkthrough.slug, title: walkthrough.title,
  summary: 'Create an estimate from a service request at a readable pace.', purpose: 'both',
  feature_area: 'Estimates', route_contexts: ['contractor.drafts'], audience_roles: ['owner', 'admin', 'office'],
  keywords: ['estimate', 'quote'], requested_goal: 'Show the estimate workflow with calm cursor motion.',
  target_screen: 'Drafts', required_starting_state: 'One Demo request is ready.',
  scenario_key: 'contractor-create-estimate', action_steps: ['Open request.', 'Save estimate.'],
  expected_final_state: 'The saved estimate remains visible.', desired_duration_seconds: 30,
  narration_mode: 'ai', talking_points: [], pacing_profile: 'servsync-human-paced-v1',
  source_kind: 'recorder_generated', source_commit: 'a'.repeat(40), source_version: 'Demo Recorder',
  video_asset_id: '20000000-0000-4000-8000-000000000003', poster_asset_id: '20000000-0000-4000-8000-000000000004',
  recorder_metadata: {
    validation_status: 'passed', narration_script: 'Open the request, review the details, and start the estimate.',
    narration_disclosure: "AI-generated voiceover using OpenAI's Cedar voice.",
    captions_vtt: 'WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nOpen the request and review the details.\n',
  }, failure_category: null, failure_message: null,
  review_notes: null, approved_walkthrough_id: null, approved_revision: null,
  requested_at: '2026-08-18T00:00:00Z', ready_for_review_at: '2026-08-18T00:01:00Z',
  reviewed_at: null, updated_at: '2026-08-18T00:01:00Z',
};

async function installAdminHarness(page: Page, item = walkthrough, jobs: Array<typeof recordingJob> = []) {
  await page.route('**/api/help-walkthrough-media', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'data:video/mp4;base64,AAAA' }) }));
  await page.goto('/');
  await page.evaluate(async ({ item, jobs }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const module = await dynamicImport('/src/features/help/HelpStudioWorkspace.tsx');
    const Workspace = module.HelpStudioWorkspace as (...args: unknown[]) => unknown;
    const client = {
      rpc: async (name: string) => {
        if (name === 'servsync_list_help_walkthroughs') return { data: [item], error: null };
        if (name === 'servsync_list_help_recording_jobs') return { data: jobs, error: null };
        if (name === 'servsync_get_help_media_usage') return { data: { total_assets: 1, total_bytes: 1401657, video_assets: 1, poster_assets: 0, published_walkthroughs: 1, unpublished_walkthroughs: 0 }, error: null };
        return { data: null, error: { message: 'Unexpected RPC' } };
      },
      storage: { from: () => ({ upload: async () => ({ data: null, error: null }) }) },
      auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } }, error: null }) },
    };
    document.body.innerHTML = '<main class="mx-auto max-w-6xl bg-slate-50 p-4"><div id="root"></div></main>';
    createRoot(document.getElementById('root') as HTMLElement).render(React.createElement(Workspace, { client }));
  }, { item, jobs });
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
      rpc: async (name: string) => {
        if (name === 'servsync_find_help') return { data: [searchRow], error: null };
        if (name === 'servsync_get_help_caption_track') return { data: {
          walkthrough_id: item.walkthrough_id, revision: 1, tutorial_media_standard: 'narrated_captioned_v1',
          captions_vtt: 'WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nOpen Drafts and start a new draft.\n',
          captions_sha256: 'a'.repeat(64), caption_language: 'en',
          transcript: 'Open Drafts and start a new draft.', narration_provider: 'OpenAI',
          narration_model: 'gpt-4o-mini-tts', narration_voice: 'cedar',
          narration_disclosure: "AI-generated voiceover using OpenAI's Cedar voice.",
        }, error: null };
        return { data: null, error: { message: 'Unexpected RPC' } };
      },
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
  await expect(page.getByRole('button', { name: 'New recording' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import finished video' })).toBeVisible();
  await page.getByLabel('Search walkthroughs').fill('quote');
  await expect(page.getByText('How to create an estimate')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('help-studio-editor')).toBeVisible();
  await expect(page.getByLabel('Finished MP4')).toHaveCount(1);
});

test('admin can define a recorder request without engineering identifiers in the ordinary form', async ({ page }) => {
  await installAdminHarness(page);
  await page.getByRole('button', { name: 'New recording' }).click();
  await expect(page.getByTestId('help-recording-request-editor')).toBeVisible();
  await expect(page.getByLabel('What should this recording demonstrate?')).toBeVisible();
  await expect(page.getByLabel('Required starting state')).toBeVisible();
  await expect(page.getByLabel('Expected final state')).toBeVisible();
  await expect(page.getByLabel('Narration')).toHaveValue('ai');
  await expect(page.getByLabel('Narration')).toContainText('OpenAI Cedar voice + English captions');
  await expect(page.getByLabel('Recorder scenario')).toHaveValue('contractor-create-estimate');
  await expect(page.getByLabel('Recorder scenario').locator('option')).toContainText([
    'Contractor creates an estimate',
    'Contractor reviews a service request',
    'Contractor completes work',
    'Homeowner sends a service request',
  ]);
  await expect(page.getByText(/uuid|asset id|commit sha/i)).toHaveCount(0);
});

test('ready narrated recording exposes caption-aware review, approve, and return-for-rerecord actions', async ({ page }) => {
  await installAdminHarness(page, walkthrough, [recordingJob]);
  await expect(page.getByText('Ready for review')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review at normal speed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve narration + captions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Return for rerecord' })).toBeVisible();
  await page.getByRole('button', { name: 'Review at normal speed' }).click();
  await expect(page.getByTestId('help-recording-review-video')).toHaveClass(/help-caption-video/);
});

test('recording review controls remain usable at contractor phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAdminHarness(page, walkthrough, [recordingJob]);
  await expect(page.getByRole('button', { name: 'Review at normal speed' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
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
  await expect(page.getByLabel('Steps').getByText('Open Drafts and start a new draft.')).toBeVisible();
  await expect(page.getByRole('button', { name: /publish|edit|archive/i })).toHaveCount(0);
  await expect(page.locator('video')).toHaveAttribute('controls', '');
  await expect(page.locator('video track[kind="captions"]')).toHaveCount(1);
  await expect(page.locator('video.help-caption-video')).toHaveCount(1);
  await expect(page.getByText('Read transcript')).toBeVisible();
  await expect(page.getByText("AI-generated voiceover using OpenAI's Cedar voice.")).toBeVisible();
});

test('mobile contextual playback remains readable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installContextHarness(page);
  await page.getByRole('button', { name: 'How to create an estimate' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
