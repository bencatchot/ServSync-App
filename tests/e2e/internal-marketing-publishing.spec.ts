import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const contentId = '62000000-0000-4000-8000-000000000001';
const packageId = '63000000-0000-4000-8000-000000000001';
const pairingId = '64000000-0000-4000-8000-000000000001';
const assetId = '65000000-0000-4000-8000-000000000001';
const connectionId = '66000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000037';
const contractorId = '20000000-0000-4000-8000-000000000001';
const fingerprint = 'a'.repeat(64);
const now = '2026-08-17T20:00:00.000Z';

const content = {
  content_id: contentId, workspace_key: 'servsync_internal', workspace_kind: 'internal',
  title: 'Approved social post', content_type: 'social_post', body: 'One exact approved message.',
  channel_category: 'social', status: 'approved', revision_number: 4,
  created_at: now, updated_at: now, created_by: null, created_by_name: null,
  submitted_at: now, submitted_by: '62000000-0000-4000-8000-000000000002', submitted_by_name: 'Owner',
  reviewed_at: now, reviewed_by: '62000000-0000-4000-8000-000000000002', reviewed_by_name: 'Owner', review_note: null,
  preparation_source: 'manual', preparation_request_id: null, preparation_recipe_key: null,
  truth_pack_version: null, prepared_at: null, preparation_sequence: null, intended_audience: null,
  content_role: null, strategic_source: null, source_plan_id: null, source_plan_revision: null,
  source_plan_item_index: null, source_direction_id: null, source_direction_revision: null,
  source_direction_topic: null, source_direction_status: null,
};

type PackageStatus = 'needs_review' | 'ready' | 'scheduled' | 'publishing' | 'published' | 'needs_attention' | 'retired';

function publishingState(status: PackageStatus = 'needs_review', facebookSetup = false, operationAvailable = false) {
  return {
    workspace: { workspace_id: workspaceId, workspace_kind: 'internal', display_name: 'ServSync Marketing' },
    operation_available: operationAvailable, prepared_limit: 5,
    prepared_count: ['ready', 'scheduled', 'publishing'].includes(status) ? 1 : 0,
    providers: [{
      connection_id: connectionId, provider: 'facebook', priority: 1,
      connection_status: facebookSetup ? 'setup_required' : 'connected',
      readiness_status: facebookSetup ? 'page_selection_required' : 'ready',
      destination_label: facebookSetup ? null : 'ServSync',
      capabilities: { text: true, media: true, publishing_enabled: true },
      readiness_note: facebookSetup ? 'Choose an eligible Facebook Page.' : 'Connected and ready for an explicitly authorized publication.',
      connected_at: facebookSetup ? null : now, last_validated_at: facebookSetup ? null : now,
      token_expires_at: null, identity_revision: 2,
    }],
    facebook_setup: facebookSetup ? {
      session_id: '67000000-0000-4000-8000-000000000001', status: 'page_selection_required',
      expires_at: '2026-08-18T20:00:00.000Z', candidate_pages: [
        { page_id: '1199023349954773', page_name: 'ServSync', tasks: ['CREATE_CONTENT'], eligible: true },
        { page_id: '1199023349954774', page_name: 'Read only', tasks: [], eligible: false },
      ],
    } : null,
    packages: [{
      package_id: packageId, package_fingerprint: fingerprint, content_id: contentId, content_revision: 4,
      content_snapshot: { title: content.title, body: content.body, content_type: 'social_post', content_revision: 4 },
      media_pairing_id: pairingId, media_snapshot: { asset_id: assetId }, provider: 'facebook',
      connection_id: connectionId, connection_revision: 2, destination_label: 'ServSync', status,
      previewed_at: status === 'needs_review' ? null : now,
      approved_at: ['ready', 'scheduled', 'publishing', 'published', 'needs_attention'].includes(status) ? now : null,
      required_disclosures: [], retired_reason: status === 'retired' ? 'Managed media retired before publication.' : null,
      created_at: now, updated_at: now,
    }],
    publications: [],
  };
}

const catalog = {
  workspace_id: workspaceId,
  assets: [{
    asset_id: assetId, asset_type: 'video', source: 'demo_recorder',
    storage_bucket: 'marketing-assets', storage_path: `${workspaceId}/${assetId}/approved.mp4`,
    poster_bucket: 'marketing-assets', poster_path: `${workspaceId}/${assetId}/poster.jpg`,
    mime_type: 'video/mp4', file_size_bytes: 4096, width: 1440, height: 900, duration_seconds: 29.24,
    sha256: 'b'.repeat(64), media_variant: 'silent_product_demo_master', lifecycle_state: 'protected',
    retirement_eligible: false,
    purged_at: null, ai_narration_disclosure_required: false, ai_narration_disclosure_text: null, created_at: now,
  }],
  pairings: [{
    pairing_id: pairingId, content_id: contentId, content_revision: 4, asset_id: assetId,
    claim_demonstrated: 'Exact approved product demonstration.', status: 'approved', created_at: now, reviewed_at: now,
  }],
};

async function install(page: Page, options: {
  status?: PackageStatus;
  contractor?: boolean;
  facebookSetup?: boolean;
  stalePairingUntilRefresh?: boolean;
  operationAvailable?: boolean;
  contentStatus?: 'draft' | 'approved';
  assetLifecycleState?: string;
  retirementEligible?: boolean;
} = {}) {
  await page.goto('/');
  await page.evaluate(async ({ content, state, catalog, options, contractorId }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
      createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
    }).createRoot;
    const module = await dynamicImport('/src/features/marketing/MarketingWorkspace.tsx');
    const domain = await dynamicImport('/src/features/marketing/marketingDomain.ts');
    const preparedPackage = (state as { packages: Array<{ package_id: string; package_fingerprint: string }> }).packages[0];
    const selectedAsset = (catalog as { assets: Array<{ storage_bucket: string; storage_path: string }> }).assets[0];
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const currentState = structuredClone(state) as {
      prepared_count: number;
      packages: Array<Record<string, unknown>>;
    } & Record<string, unknown>;
    const currentCatalog = structuredClone(catalog) as {
      assets: Array<Record<string, unknown>>;
      pairings: Array<Record<string, unknown>>;
    } & Record<string, unknown>;
    let mediaCatalogReads = 0;
    (window as unknown as { __marketingRpcCalls: typeof calls }).__marketingRpcCalls = calls;
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (name === 'servsync_list_marketing_content') return { data: [content], error: null };
        if (name === 'servsync_get_marketing_publishing') return { data: currentState, error: null };
        if (name === 'servsync_get_marketing_media_catalog') {
          mediaCatalogReads += 1;
          if (options.stalePairingUntilRefresh && mediaCatalogReads === 1) {
            return { data: { ...(catalog as Record<string, unknown>), pairings: [] }, error: null };
          }
          if (options.stalePairingUntilRefresh) {
            const pairings = (catalog as { pairings: Array<Record<string, unknown>> }).pairings.map(pairing => ({
              ...pairing,
              status: 'candidate',
              reviewed_at: null,
            }));
            return { data: { ...(catalog as Record<string, unknown>), pairings }, error: null };
          }
          return { data: currentCatalog, error: null };
        }
        if (name === 'servsync_abandon_marketing_media') {
          const target = currentCatalog.assets.find(asset => asset.asset_id === args.p_asset_id);
          if (!target?.retirement_eligible) return { data: null, error: { code: '40001', message: 'Marketing media is no longer eligible for retirement; reload and try again.' } };
          target.lifecycle_state = 'abandoned';
          target.retirement_eligible = false;
          currentCatalog.pairings = currentCatalog.pairings.map(pairing => pairing.asset_id === args.p_asset_id
            ? { ...pairing, status: 'rejected', reviewed_at: '2026-08-17T20:00:00.000Z' }
            : pairing);
          currentState.packages = currentState.packages.map(item => item.media_snapshot && (item.media_snapshot as Record<string, unknown>).asset_id === args.p_asset_id
            ? { ...item, status: 'retired', retired_reason: 'Managed media retired before publication.' }
            : item);
          currentState.prepared_count = 0;
          return { data: { asset_id: args.p_asset_id, state: 'abandoned', retired_package_count: 1, replayed: false }, error: null };
        }
        if (name === 'servsync_get_marketing_media_access') return { data: {
          state: 'protected', storage_bucket: selectedAsset.storage_bucket,
          storage_path: selectedAsset.storage_path,
        }, error: null };
        if (name === 'servsync_get_internal_marketing_planning') return { data: { profile: null, plan: null, recent_content: { window_limit: 20, item_count: 0, items: [] } }, error: null };
        if (name === 'servsync_get_internal_marketing_directions') return { data: { accepted_plan: null, directions: [] }, error: null };
        return { data: { package_id: preparedPackage.package_id, package_fingerprint: preparedPackage.package_fingerprint, status: 'ready' }, error: null };
      },
      storage: { from: () => ({
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://media.example.test/${encodeURIComponent(path)}` }, error: null }),
      }) },
    };
    document.body.innerHTML = '<main class="p-4"><div id="root"></div></main>';
    const component = contractorId
      ? React.createElement(module.ContractorMarketingWorkspace as (...args: unknown[]) => unknown, {
          contractorId, overview: (domain.buildContractorMarketingOverview as () => unknown)(), client,
        })
      : React.createElement(module.InternalMarketingWorkspace as (...args: unknown[]) => unknown, {
          role: 'platform_admin',
          overview: (domain.buildInternalMarketingOverview as (value: unknown) => unknown)({ contractors: 1, homeowners: 1, activeInvites: 0 }),
          client,
        });
    createRoot(document.getElementById('root')!).render(component);
  }, {
    content: options.contentStatus === 'draft' ? {
      ...content, status: 'draft', revision_number: 3,
      submitted_at: null, submitted_by: null, submitted_by_name: null,
      reviewed_at: null, reviewed_by: null, reviewed_by_name: null,
    } : content,
    state: options.stalePairingUntilRefresh
      ? { ...publishingState(options.status, options.facebookSetup, options.operationAvailable), packages: [] }
      : publishingState(options.status, options.facebookSetup, options.operationAvailable),
    catalog: {
      ...catalog,
      assets: catalog.assets.map(asset => ({
        ...asset,
        lifecycle_state: options.assetLifecycleState ?? asset.lifecycle_state,
        retirement_eligible: options.retirementEligible ?? asset.retirement_eligible,
      })),
    }, options,
    contractorId: options.contractor ? contractorId : null,
  });
  await expect(page.getByTestId('marketing-workspace')).toBeVisible();
}

test('Preview for Facebook refreshes a newly created media pairing without a manual queue reload', async ({ page }) => {
  await install(page, { stalePairingUntilRefresh: true });
  await page.getByTestId('marketing-nav-content').click();
  await page.getByRole('button', { name: /Approved social post/ }).click();
  await page.getByRole('button', { name: 'Preview for Facebook' }).click();
  await expect(page.getByText('Review the selected media before preparing the exact post.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve media' })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as {
    __marketingRpcCalls: Array<{ name: string }>;
  }).__marketingRpcCalls);
  expect(calls.filter(call => call.name === 'servsync_get_marketing_publishing')).toHaveLength(2);
  expect(calls.filter(call => call.name === 'servsync_get_marketing_media_catalog')).toHaveLength(2);
});

test('shared queue requires explicit selection and exact preview before package approval', async ({ page }) => {
  await install(page);
  await page.getByTestId('marketing-nav-campaigns').click();
  await expect(page.getByTestId('selected-publishing-package')).toHaveCount(0);
  await page.getByRole('button', { name: /Approved social post/ }).click();
  await expect(page.getByTestId('selected-publishing-package')).toContainText('Current approved copy');
  await expect(page.getByTestId('selected-publishing-package')).not.toContainText(contentId);
  await page.getByRole('button', { name: 'Open exact preview' }).click();
  await expect(page.getByTestId('exact-publication-preview')).toContainText(content.body);
  await expect(page.getByTestId('exact-publication-preview').locator('video')).toBeVisible();
  await page.getByRole('button', { name: 'Approve & Ready' }).click();
  const calls = await page.evaluate(() => (window as unknown as { __marketingRpcCalls: Array<{ name: string }> }).__marketingRpcCalls);
  expect(calls.map(call => call.name)).toContain('servsync_record_marketing_package_preview');
  expect(calls.map(call => call.name)).toContain('servsync_approve_marketing_publication_package');
  expect(calls.map(call => call.name)).not.toContain('servsync_authorize_marketing_publication');
});

test('ready exact package cannot authorize while provider operation is paused', async ({ page }) => {
  await install(page, { status: 'ready' });
  await page.getByTestId('marketing-nav-campaigns').click();
  const card = page.getByTestId(`publishing-queue-card-${contentId}`);
  await expect(card).toContainText('Ready - not published');
  await expect(card).toContainText('Publishing requires a separate action.');
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText('This post is ready, but it has not been published. Public provider submissions are paused, and no Facebook request will be sent.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish Now' })).toBeDisabled();
  const calls = await page.evaluate(() => (window as unknown as { __marketingRpcCalls: Array<{ name: string }> }).__marketingRpcCalls);
  expect(calls.map(call => call.name)).not.toContain('servsync_authorize_marketing_publication');
});

test('eligible Ready media requires exact retirement confirmation and refreshes the stale package away', async ({ page }) => {
  await install(page, { status: 'ready', assetLifecycleState: 'ready', retirementEligible: true, operationAvailable: true });
  await page.getByTestId('marketing-nav-campaigns').click();
  const card = page.getByTestId(`publishing-queue-card-${contentId}`);
  await expect(card).toContainText('Ready - not published');
  await card.getByRole('button', { name: 'Retire media' }).click();
  const dialog = page.getByRole('dialog', { name: 'Retire media for Approved social post' });
  await expect(dialog).toContainText('Retire the unpublished media package for “Approved social post”?');
  await expect(dialog).toContainText('active media slot will be released');
  await expect(dialog).toContainText('Publication history is preserved');
  await expect(dialog).toContainText('may later be purged under the retention policy');
  await dialog.getByRole('button', { name: 'Retire media' }).click();
  await expect(page.getByRole('status')).toContainText('media retired. Its active media slot is now available.');
  await expect(card).not.toContainText('Ready - not published');
  await expect(card.getByRole('button', { name: 'Retire media' })).toHaveCount(0);
  const calls = await page.evaluate(() => (window as unknown as { __marketingRpcCalls: Array<{ name: string; args: Record<string, unknown> }> }).__marketingRpcCalls);
  expect(calls.filter(call => call.name === 'servsync_abandon_marketing_media')).toEqual([{
    name: 'servsync_abandon_marketing_media',
    args: { p_contractor_id: null, p_asset_id: assetId },
  }]);
  expect(calls.filter(call => call.name === 'servsync_get_marketing_publishing')).toHaveLength(2);
  expect(calls.filter(call => call.name === 'servsync_get_marketing_media_catalog')).toHaveLength(2);
});

test('retirement control is absent for protected, published, scheduled, publishing, and abandoned media', async ({ page }) => {
  for (const scenario of [
    { status: 'ready' as const, lifecycle: 'protected', eligible: false },
    { status: 'published' as const, lifecycle: 'retention', eligible: false },
    { status: 'scheduled' as const, lifecycle: 'scheduled', eligible: false },
    { status: 'publishing' as const, lifecycle: 'provider_processing', eligible: false },
    { status: 'retired' as const, lifecycle: 'abandoned', eligible: false },
  ]) {
    await install(page, { status: scenario.status, assetLifecycleState: scenario.lifecycle, retirementEligible: scenario.eligible });
    await page.getByTestId('marketing-nav-campaigns').click();
    await expect(page.getByRole('button', { name: 'Retire media' })).toHaveCount(0);
  }
});

test('ready package confirmation names the exact post, Page, and media before one authorization', async ({ page }) => {
  await install(page, { status: 'ready', operationAvailable: true });
  await page.getByTestId('marketing-nav-campaigns').click();
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByRole('button', { name: 'Publish Now' }).click();
  const confirmation = page.getByTestId('publication-authorization-confirmation');
  await expect(confirmation).toContainText('Publish "Approved social post" to ServSync on Facebook now?');
  await expect(confirmation).toContainText('Media post');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Publishing authorized for "Approved social post"');
  const calls = await page.evaluate(() => (window as unknown as { __marketingRpcCalls: Array<{ name: string }> }).__marketingRpcCalls);
  expect(calls.filter(call => call.name === 'servsync_authorize_marketing_publication')).toHaveLength(1);
  expect(calls.filter(call => call.name.includes('facebook') && call.name.includes('post'))).toHaveLength(0);
});

test('contractor workspace propagates contractor context through shared RPCs', async ({ page }) => {
  await install(page, { contractor: true, status: 'ready' });
  await page.getByTestId('marketing-nav-campaigns').click();
  const calls = await page.evaluate(() => (window as unknown as { __marketingRpcCalls: Array<{ name: string; args: Record<string, unknown> }> }).__marketingRpcCalls);
  const shared = calls.filter(call => ['servsync_list_marketing_content', 'servsync_get_marketing_publishing', 'servsync_get_marketing_media_catalog'].includes(call.name));
  expect(shared.length).toBe(3);
  expect(shared.every(call => call.args.p_contractor_id === contractorId)).toBe(true);
});

test('contractor workspace preserves the team submission policy', async ({ page }) => {
  await install(page, { contractor: true, contentStatus: 'draft' });
  await page.getByTestId('marketing-nav-content').click();
  await page.getByRole('button', { name: /Approved social post/ }).click();
  await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview for approval' })).toHaveCount(0);
});

test('Facebook setup requires explicit eligible Page selection', async ({ page }) => {
  await install(page, { facebookSetup: true });
  await page.getByTestId('marketing-nav-campaigns').click();
  const buttons = page.getByRole('button', { name: 'Connect this Page' });
  await expect(buttons.first()).toBeEnabled();
  await expect(buttons.last()).toBeDisabled();
});

test('shared queue has no horizontal overflow at 390x844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, { contractor: true, status: 'ready' });
  await page.getByTestId('marketing-nav-campaigns').click();
  await expect(page.getByTestId('marketing-publishing-workspace')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('browser publishing code contains no provider credential or local media path', () => {
  const files = [
    'src/features/marketing/marketingPublishing.ts',
    'src/features/marketing/MarketingPublishingWorkspace.tsx',
    'src/features/marketing/MarketingWorkspace.tsx',
  ].map(file => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n');
  expect(files).not.toMatch(/access[_-]?token|client[_-]?secret|\/Users\/|file:\/\//i);
  expect(files).not.toContain('fetch(');
});
