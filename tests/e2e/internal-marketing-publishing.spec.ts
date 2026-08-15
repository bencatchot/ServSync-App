import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMarketingPublishingAdapter } from '../../src/features/marketing/marketingPublishing';

const approved = {
  id: '62000000-0000-4000-8000-000000000001', workspaceKey: 'servsync_internal', workspaceKind: 'internal',
  title: 'Approved social post', contentType: 'social_post', body: 'One exact approved message.', channelCategory: 'social',
  status: 'approved', revisionNumber: 8, createdAt: '2026-08-15T10:00:00.000Z', updatedAt: '2026-08-15T11:00:00.000Z',
  createdBy: null, createdByName: null, submittedAt: '2026-08-15T10:30:00.000Z', submittedBy: '62000000-0000-4000-8000-000000000002', submittedByName: 'Owner',
  reviewedAt: '2026-08-15T11:00:00.000Z', reviewedBy: '62000000-0000-4000-8000-000000000002', reviewedByName: 'Owner', reviewNote: null,
  preparationSource: 'manual', preparationRequestId: null, preparationRecipeKey: null, truthPackVersion: null, preparedAt: null, preparationSequence: null,
  intendedAudience: null, contentRole: null, strategicSource: null, sourcePlanId: null, sourcePlanRevision: null, sourcePlanItemIndex: null,
  sourceDirectionId: null, sourceDirectionRevision: null, sourceDirectionTopic: null, sourceDirectionStatus: null,
};

const publishingState = {
  providers: [
    { connection_id: '00000000-0000-4000-8000-000000000061', provider: 'facebook', priority: 1, connection_status: 'setup_required', destination_label: null, capabilities: { text: true, media: false }, readiness_note: 'Setup required: no approved ServSync Facebook Page connection is configured.', connected_at: null },
    { connection_id: '00000000-0000-4000-8000-000000000062', provider: 'instagram', priority: 2, connection_status: 'setup_required', destination_label: null, capabilities: { text: false, media: true }, readiness_note: 'Setup required: Instagram media publishing is not connected or enabled.', connected_at: null },
    { connection_id: '00000000-0000-4000-8000-000000000063', provider: 'tiktok', priority: 3, connection_status: 'setup_required', destination_label: null, capabilities: { text: false, media: true }, readiness_note: 'Setup required: TikTok Content Posting access is not connected or enabled.', connected_at: null },
  ], publications: [],
};

test('publishing adapter preserves capability differences and rejects malformed browser payloads', async () => {
  const adapter = createMarketingPublishingAdapter({ rpc: async () => ({ data: publishingState, error: null }) });
  const state = await adapter.get();
  expect(state.providers.map(provider => [provider.provider, provider.capabilities])).toEqual([
    ['facebook', { text: true, media: false, publishingEnabled: false }],
    ['instagram', { text: false, media: true, publishingEnabled: false }],
    ['tiktok', { text: false, media: true, publishingEnabled: false }],
  ]);
  const malformed = createMarketingPublishingAdapter({ rpc: async () => ({ data: { ...publishingState, providers: [{ ...publishingState.providers[0], destination_label: '/Users/owner/video.mp4' }] }, error: null }) });
  await expect(malformed.get()).rejects.toMatchObject({ kind: 'malformed' });
});

async function install(page: Page, stateOverride: Record<string, unknown> = publishingState, path = '/') {
  await page.goto(path);
  await page.evaluate(async ({ approved, publishingState }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const Workspace = (await dynamicImport('/src/features/marketing/MarketingWorkspace.tsx')).InternalMarketingWorkspace as (...args: unknown[]) => unknown;
    const overview = (await dynamicImport('/src/features/marketing/marketingDomain.ts')).buildInternalMarketingOverview as (value: unknown) => unknown;
    const client = { rpc: async (name: string) => {
      if (name === 'servsync_list_internal_marketing_content') return { data: [{ ...approved, content_id: approved.id, workspace_key: approved.workspaceKey, workspace_kind: approved.workspaceKind, content_type: approved.contentType, channel_category: approved.channelCategory, revision_number: approved.revisionNumber, created_at: approved.createdAt, updated_at: approved.updatedAt, created_by: approved.createdBy, created_by_name: approved.createdByName, submitted_at: approved.submittedAt, submitted_by: approved.submittedBy, submitted_by_name: approved.submittedByName, reviewed_at: approved.reviewedAt, reviewed_by: approved.reviewedBy, reviewed_by_name: approved.reviewedByName, review_note: approved.reviewNote, preparation_source: approved.preparationSource, preparation_request_id: null, preparation_recipe_key: null, truth_pack_version: null, prepared_at: null, preparation_sequence: null, intended_audience: null, content_role: null, strategic_source: null, source_plan_id: null, source_plan_revision: null, source_plan_item_index: null, source_direction_id: null, source_direction_revision: null, source_direction_topic: null, source_direction_status: null }], error: null };
      if (name === 'servsync_get_internal_marketing_publishing') return { data: publishingState, error: null };
      if (name === 'servsync_get_internal_marketing_planning') return { data: { profile: null, plan: null, recent_content: { window_limit: 20, item_count: 0, items: [] } }, error: null };
      if (name === 'servsync_get_internal_marketing_directions') return { data: { accepted_plan: null, directions: [] }, error: null };
      return { data: [], error: null };
    } };
    document.body.innerHTML = '<main class="p-4"><div id="root"></div></main>';
    createRoot(document.getElementById('root')!).render(React.createElement(Workspace, { role: 'platform_admin', overview: overview({ contractors: 1, homeowners: 1, activeInvites: 0 }), client }));
  }, { approved, publishingState: stateOverride });
}

test('approved content has a separate fail-closed publication decision and Publishing history view', async ({ page }) => {
  await install(page);
  await page.getByTestId('marketing-nav-content').click();
  await page.getByRole('tab', { name: 'Approved' }).click();
  await page.getByRole('button', { name: /Approved social post/ }).click();
  await page.getByRole('button', { name: 'Publish / Schedule' }).click();
  await expect(page.getByTestId('marketing-publication-composer')).toContainText('Approved revision 8');
  await expect(page.getByTestId('marketing-publication-composer')).toContainText('One exact approved message.');
  await expect(page.getByRole('button', { name: 'Confirm publication' })).toBeDisabled();
  await expect(page.getByTestId('marketing-publication-composer')).toContainText('Media required');
  await page.getByTestId('marketing-nav-campaigns').click();
  await expect(page.getByTestId('marketing-publishing-workspace')).toContainText('No publication history yet');
  await expect(page.getByTestId('marketing-publishing-workspace')).toContainText('Setup required');
});

test('publishing remains server-side and no browser provider token or local media path exists', () => {
  const files = [
    'src/features/marketing/marketingPublishing.ts', 'src/features/marketing/MarketingPublishingWorkspace.tsx',
    'src/features/marketing/MarketingWorkspace.tsx', 'src/features/marketing/MarketingContentWorkspace.tsx',
  ].map(file => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n');
  expect(files).not.toMatch(/access[_-]?token|client[_-]?secret|\/Users\/|file:\/\//i);
  expect(files).not.toContain('fetch(');
});

test('Facebook setup requires an explicit eligible Page selection', async ({ page }) => {
  await install(page, {
    ...publishingState,
    providers: publishingState.providers.map(provider => provider.provider === 'facebook' ? {
      ...provider,
      readiness_status: 'page_selection_required',
      readiness_note: 'Authorization complete. Choose the ServSync Facebook Page.',
    } : provider),
    facebook_setup: {
      session_id: '71000000-0000-4000-8000-000000000001',
      status: 'page_selection_required',
      expires_at: '2026-08-15T22:00:00.000Z',
      candidate_pages: [
        { page_id: '1122334455667788', page_name: 'ServSync Page', tasks: ['CREATE_CONTENT'], eligible: true },
        { page_id: '8877665544332211', page_name: 'Read Only Page', tasks: ['MODERATE'], eligible: false },
      ],
    },
  });
  await page.getByTestId('marketing-nav-campaigns').click();
  const connection = page.getByTestId('marketing-facebook-connection');
  await expect(connection).toContainText('Choose the ServSync Page');
  await expect(connection.getByText('ServSync Page', { exact: true })).toBeVisible();
  await expect(connection.getByText('Read Only Page')).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Connect this Page' }).first()).toBeEnabled();
  await expect(connection.getByRole('button', { name: 'Connect this Page' }).last()).toBeDisabled();
  await expect(connection).not.toContainText(/token|secret/i);
});

test('an abandoned Facebook authorization can be deliberately restarted', async ({ page }) => {
  await install(page, {
    ...publishingState,
    providers: publishingState.providers.map(provider => provider.provider === 'facebook' ? {
      ...provider,
      readiness_status: 'authorization_pending',
      readiness_note: 'Facebook authorization is waiting for owner consent.',
    } : provider),
  });
  await page.getByTestId('marketing-nav-campaigns').click();
  const connection = page.getByTestId('marketing-facebook-connection');
  await expect(connection).toContainText('Facebook authorization is waiting for owner consent.');
  await expect(connection.getByRole('button', { name: 'Restart authorization' })).toBeEnabled();
  await expect(connection.getByRole('button', { name: 'Connect Facebook' })).toHaveCount(0);
});

test('safe OAuth callback return opens the Publishing Page-selection destination', async ({ page }) => {
  await install(page, {
    ...publishingState,
    providers: publishingState.providers.map(provider => provider.provider === 'facebook' ? {
      ...provider,
      readiness_status: 'page_selection_required',
      readiness_note: 'Authorization complete. Choose the ServSync Facebook Page.',
    } : provider),
    facebook_setup: {
      session_id: '71000000-0000-4000-8000-000000000001',
      status: 'page_selection_required',
      expires_at: '2026-08-15T22:00:00.000Z',
      candidate_pages: [{ page_id: '1122334455667788', page_name: 'ServSync Page', tasks: ['CREATE_CONTENT'], eligible: true }],
    },
  }, '/?marketing_facebook=page_selection_required');
  await expect(page.getByTestId('marketing-publishing-workspace')).toBeVisible();
  await expect(page.getByTestId('marketing-facebook-connection')).toContainText('ServSync Page');
});
