import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMarketingPublishingAdapter } from '../../src/features/marketing/marketingPublishing';
import type { MarketingContentItem } from '../../src/features/marketing/marketingContent';
import {
  eligibleFacebookPreviewContent,
  marketingProviderPreview,
  marketingPublicationSnapshotForContent,
} from '../../src/features/marketing/marketingPublicationPreview';
import { parseDurableDemoRecordingMetadata } from '../../src/features/marketing/marketingMedia';

const approved: MarketingContentItem = {
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

const connectedState = {
  ...publishingState,
  providers: publishingState.providers.map(provider => provider.provider === 'facebook' ? {
    ...provider,
    connection_status: 'connected',
    destination_label: 'ServSync',
    readiness_status: 'ready_except_live_post_verification',
    readiness_note: 'Facebook Page connection is ready for owner preview.',
    capabilities: { text: true, media: false, publishing_enabled: false },
    connected_at: '2026-08-15T20:00:00.000Z',
    last_validated_at: '2026-08-15T21:00:00.000Z',
    token_expires_at: null,
  } : provider),
};

const candidateTitles = [
  'Months later, the service report is still with the home',
  'Give homeowners useful context before they connect',
  'When a customer asks what the job included',
  'An invoice should still tell the service story',
  'Make the deposit request a deliberate step',
  'Let the estimate move forward before account setup',
  'What should stay connected after a customer calls?',
];

const approvedCandidates = candidateTitles.map<MarketingContentItem>((title, index) => ({
  ...approved,
  id: `62000000-0000-4000-8000-00000000000${index + 1}`,
  title,
  body: index === 0 ? 'One exact public Facebook message.' : `Exact public message ${index + 1}.`,
  revisionNumber: index + 2,
  ...(index === 0 ? {
    preparationSource: 'codex_assisted',
    preparationRequestId: '62000000-0000-4000-8000-000000000090',
    preparationRecipeKey: 'approved_direction_plan_v1',
    truthPackVersion: 'servsync-marketing-truth-v3',
    preparedAt: '2026-08-15T09:00:00.000Z',
    preparationSequence: 1,
    intendedAudience: 'homeowners',
    contentRole: 'homeowner_benefit',
    strategicSource: 'approved_direction',
    sourcePlanId: '62000000-0000-4000-8000-000000000091',
    sourcePlanRevision: 2,
    sourcePlanItemIndex: 4,
    sourceDirectionId: '62000000-0000-4000-8000-000000000092',
    sourceDirectionRevision: 3,
    sourceDirectionTopic: 'Home History',
    sourceDirectionStatus: 'approved',
  } : {}),
}));

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

test('Facebook preview and provider publication use the same approved snapshot message', () => {
  const draft: MarketingContentItem = { ...approved, id: '62000000-0000-4000-8000-000000000099', status: 'draft' };
  expect(eligibleFacebookPreviewContent([...approvedCandidates, draft])).toHaveLength(7);
  const snapshot = marketingPublicationSnapshotForContent(approvedCandidates[0]);
  const preview = marketingProviderPreview('facebook', snapshot);
  expect(preview.publicMessage).toBe(approvedCandidates[0].body);
  expect(preview.publicMessage).not.toContain(approvedCandidates[0].title);
  expect(snapshot.content_revision).toBe(2);
  expect(marketingPublicationSnapshotForContent(approved)).not.toHaveProperty('source_plan_id');
});

const emptyMediaState = { workspace_id: '00000000-0000-4000-8000-000000000037', assets: [], pairings: [] };
const pairedMediaStateFor = (content: MarketingContentItem) => {
  const assetId = '64000000-0000-4000-8000-000000000001';
  return {
    workspace_id: emptyMediaState.workspace_id,
    assets: [{
      asset_id: assetId, asset_type: 'video', source: 'demo_recorder', recorder_scenario: 'homeowner-home-history',
      source_commit: 'a'.repeat(40), storage_bucket: 'marketing-assets',
      storage_path: `${emptyMediaState.workspace_id}/${assetId}/servsync-homeowner-home-history-v1-2026-08-15T18-00-00-000Z.mp4`,
      mime_type: 'video/mp4', file_size_bytes: 4096, width: 1440, height: 900, duration_seconds: 23.4,
      sha256: 'b'.repeat(64), validation_status: 'passed', sensitive_data_check: 'passed', pacing_review: 'passed',
      pacing_reviewed_at: '2026-08-15T18:30:00.000Z', created_at: '2026-08-15T18:31:00.000Z',
    }],
    pairings: [{
      pairing_id: '64000000-0000-4000-8000-000000000002', content_id: content.id,
      content_revision: content.revisionNumber, source_direction_id: content.sourceDirectionId,
      source_direction_revision: content.sourceDirectionRevision, asset_id: assetId,
      recorder_scenario: 'homeowner-home-history',
      claim_demonstrated: 'Open one home, enter Home History, and reopen its finalized report.',
      status: 'candidate', created_at: '2026-08-15T18:32:00.000Z', reviewed_at: null,
    }],
  };
};

async function install(page: Page, stateOverride: Record<string, unknown> = publishingState, path = '/', contentItems: MarketingContentItem[] = [approved], mediaStateOverride: Record<string, unknown> = emptyMediaState) {
  await page.goto(path);
  await page.evaluate(async ({ contentItems, publishingState, mediaState }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const Workspace = (await dynamicImport('/src/features/marketing/MarketingWorkspace.tsx')).InternalMarketingWorkspace as (...args: unknown[]) => unknown;
    const overview = (await dynamicImport('/src/features/marketing/marketingDomain.ts')).buildInternalMarketingOverview as (value: unknown) => unknown;
    const calls: string[] = [];
    (window as unknown as { __marketingRpcCalls: string[] }).__marketingRpcCalls = calls;
    const client = { rpc: async (name: string) => {
      calls.push(name);
      if (name === 'servsync_list_internal_marketing_content') return { data: contentItems.map(item => ({ ...item, content_id: item.id, workspace_key: item.workspaceKey, workspace_kind: item.workspaceKind, content_type: item.contentType, channel_category: item.channelCategory, revision_number: item.revisionNumber, created_at: item.createdAt, updated_at: item.updatedAt, created_by: item.createdBy, created_by_name: item.createdByName, submitted_at: item.submittedAt, submitted_by: item.submittedBy, submitted_by_name: item.submittedByName, reviewed_at: item.reviewedAt, reviewed_by: item.reviewedBy, reviewed_by_name: item.reviewedByName, review_note: item.reviewNote, preparation_source: item.preparationSource, preparation_request_id: item.preparationRequestId, preparation_recipe_key: item.preparationRecipeKey, truth_pack_version: item.truthPackVersion, prepared_at: item.preparedAt, preparation_sequence: item.preparationSequence, intended_audience: item.intendedAudience, content_role: item.contentRole, strategic_source: item.strategicSource, source_plan_id: item.sourcePlanId, source_plan_revision: item.sourcePlanRevision, source_plan_item_index: item.sourcePlanItemIndex, source_direction_id: item.sourceDirectionId, source_direction_revision: item.sourceDirectionRevision, source_direction_topic: item.sourceDirectionTopic, source_direction_status: item.sourceDirectionStatus })), error: null };
      if (name === 'servsync_get_internal_marketing_publishing') return { data: publishingState, error: null };
      if (name === 'servsync_get_internal_marketing_media') return { data: mediaState, error: null };
      if (name === 'servsync_get_internal_marketing_planning') return { data: { profile: null, plan: null, recent_content: { window_limit: 20, item_count: 0, items: [] } }, error: null };
      if (name === 'servsync_get_internal_marketing_directions') return { data: { accepted_plan: null, directions: [] }, error: null };
      return { data: [], error: null };
    }, storage: { from: () => ({
      createSignedUrl: async (storagePath: string) => ({ data: { signedUrl: `https://media.example.test/${encodeURIComponent(storagePath)}` }, error: null }),
      upload: async () => ({ data: {}, error: null }),
      remove: async () => ({ data: {}, error: null }),
    }) } };
    document.body.innerHTML = '<main class="p-4"><div id="root"></div></main>';
    createRoot(document.getElementById('root')!).render(React.createElement(Workspace, { role: 'platform_admin', overview: overview({ contractors: 1, homeowners: 1, activeInvites: 0 }), client }));
  }, { contentItems, publishingState: stateOverride, mediaState: mediaStateOverride });
}

test('Marketing upload metadata requires exact Demo provenance and completed pacing review', () => {
  const valid = {
    schema_version: 2, scenario: 'homeowner-home-history', recording_version: 1,
    timestamp: '2026-08-15T18:00:00.000Z', source_git_commit: 'a'.repeat(40), environment: 'Demo',
    viewport: { width: 1440, height: 900 }, duration_seconds: 23.4, pacing: 'marketing',
    webm_filename: 'servsync-homeowner-home-history-v1-2026-08-15T18-00-00-000Z.webm',
    mp4_filename: 'servsync-homeowner-home-history-v1-2026-08-15T18-00-00-000Z.mp4',
    width: 1440, height: 900, mime_type: 'video/mp4', mp4_size_bytes: 4096,
    webm_sha256: 'b'.repeat(64), mp4_sha256: 'c'.repeat(64), validation_status: 'passed',
    sensitive_data_check: 'passed', pacing_review: 'passed', pacing_reviewed_at: '2026-08-15T18:30:00.000Z',
    marketing_candidate_status: 'passed', pacing_review_criteria: {
      cursor_followable: true, click_intent_visible: true, ui_changes_readable: true, cursor_speed_acceptable: true,
      cursor_motion_natural: true, text_readable: true, important_holds_sufficient: true, final_result_obvious: true,
    },
  } as const;
  expect(parseDurableDemoRecordingMetadata(valid).scenario).toBe('homeowner-home-history');
  expect(() => parseDurableDemoRecordingMetadata({ ...valid, pacing_review: 'pending' })).toThrow(/completed 1x pacing review/i);
  expect(() => parseDurableDemoRecordingMetadata({ ...valid, environment: 'Production' })).toThrow(/validated Demo recording/i);
});

test('approved content has a separate fail-closed publication decision and Publishing history view', async ({ page }) => {
  await install(page);
  await page.getByTestId('marketing-nav-content').click();
  await page.getByRole('tab', { name: 'Approved' }).click();
  await page.getByRole('button', { name: /Approved social post/ }).click();
  await page.getByRole('button', { name: 'Preview for Facebook' }).click();
  await expect(page.getByTestId('marketing-publication-composer')).toContainText('Approved revision 8');
  await expect(page.getByTestId('marketing-publication-composer')).toContainText('One exact approved message.');
  await expect(page.getByRole('button', { name: 'Review publication' })).toBeDisabled();
  await expect(page.getByTestId('marketing-publishing-workspace')).toContainText('No publication history yet');
  await expect(page.getByTestId('marketing-publishing-workspace')).toContainText('Setup required');
});

test('owner can review every eligible Facebook candidate without creating a publication', async ({ page }) => {
  const draft: MarketingContentItem = { ...approved, id: '62000000-0000-4000-8000-000000000099', title: 'Unapproved draft', status: 'draft' };
  await install(page, connectedState, '/', [...approvedCandidates, draft]);
  await page.getByTestId('marketing-nav-campaigns').click();

  const composer = page.getByTestId('marketing-publication-composer');
  const publicPreview = page.getByTestId('facebook-public-preview');
  await expect(composer).toContainText('1 of 7');
  await expect(composer.getByText('Unapproved draft')).toHaveCount(0);
  await expect(publicPreview).toContainText('One exact public Facebook message.');
  await expect(publicPreview).not.toContainText('Months later, the service report is still with the home');
  await expect(composer.getByTestId('marketing-preview-internal-metadata')).toContainText('Home History');
  await expect(composer.getByTestId('marketing-preview-internal-metadata')).toContainText('First-class approved Direction lineage');
  await expect(publicPreview).not.toContainText(/reactions|comments|shares|views|reach/i);

  await composer.getByRole('button', { name: 'Next approved post' }).click();
  await expect(composer).toContainText('2 of 7');
  await expect(publicPreview).toContainText('Exact public message 2.');
  await expect(composer.getByTestId('marketing-preview-internal-metadata')).toContainText('Historical approved content');

  await composer.getByLabel('Timing').selectOption('scheduled');
  await composer.getByLabel('Scheduled time').fill('2026-08-20T10:30');
  const timezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  await expect(composer).toContainText(timezone);
  await composer.getByRole('button', { name: 'Review publication' }).click();
  const confirmation = page.getByTestId('marketing-publication-confirmation');
  await expect(confirmation).toContainText('Schedule Facebook Post');
  await expect(confirmation).toContainText('Exact public message 2.');
  await expect(confirmation).toContainText('Text only');
  await expect(confirmation.getByRole('button', { name: 'Schedule Facebook Post' })).toBeDisabled();

  const rpcCalls = await page.evaluate(() => (window as unknown as { __marketingRpcCalls: string[] }).__marketingRpcCalls);
  expect(rpcCalls).not.toContain('servsync_create_internal_marketing_publication');
});

test('owner preview binds exact approved text revision to one playable reviewed Demo asset', async ({ page }) => {
  const homeHistory = approvedCandidates[0];
  await install(page, connectedState, '/', approvedCandidates, pairedMediaStateFor(homeHistory));
  await page.getByTestId('marketing-nav-campaigns').click();
  await expect(page.getByTestId('facebook-public-preview')).toContainText(homeHistory.body);
  await expect(page.getByTestId('facebook-public-preview-video')).toBeVisible();
  await expect(page.getByTestId('marketing-media-review')).toContainText('Awaiting media approval');
  await expect(page.getByTestId('marketing-media-review')).toContainText('Passed at normal speed');
  await expect(page.getByRole('button', { name: 'Approve video pairing' })).toBeVisible();
  await page.getByRole('button', { name: 'Review publication' }).click();
  await expect(page.getByTestId('marketing-publication-confirmation')).toContainText('Candidate product demo video');
  await expect(page.getByTestId('marketing-publication-confirmation')).toContainText(/Provider media publishing is not enabled/i);
  await expect(page.getByRole('button', { name: 'Publish to Facebook' })).toBeDisabled();
});

test('approved pairing identity and review history are immutable in the migration contract', () => {
  const sql = readFileSync(resolve(process.cwd(), 'servsync-marketing-media-assets.sql'), 'utf8');
  expect(sql).toContain('marketing_content_media_one_approved_idx');
  expect(sql).toMatch(/content_id is distinct from old\.content_id/);
  expect(sql).toMatch(/content_revision is distinct from old\.content_revision/);
  expect(sql).toMatch(/asset_id is distinct from old\.asset_id/);
  expect(sql).toMatch(/Marketing media review history is append-only/);
  expect(sql).toMatch(/old\.status = 'approved' and new\.status <> 'rejected'/);
  expect(sql).not.toMatch(/facebook\.com\/.+feed|graph\.facebook/i);
});

test('return for revision exits preview through the normal Content workspace without editing approval', async ({ page }) => {
  await install(page, connectedState, '/', approvedCandidates);
  await page.getByTestId('marketing-nav-campaigns').click();
  await page.getByRole('button', { name: 'Return for revision' }).click();
  await expect(page.getByTestId('marketing-content-workspace')).toBeVisible();
  await expect(page.getByTestId('marketing-content-detail')).toContainText('Months later, the service report is still with the home');
  await expect(page.getByTestId('marketing-content-detail')).toContainText('Approved');
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
});

test('Facebook owner preview remains readable without horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, connectedState, '/', approvedCandidates, pairedMediaStateFor(approvedCandidates[0]));
  await page.getByTestId('marketing-nav-campaigns').click();
  await expect(page.getByTestId('facebook-public-preview')).toBeVisible();
  await expect(page.getByTestId('facebook-public-preview-video')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
