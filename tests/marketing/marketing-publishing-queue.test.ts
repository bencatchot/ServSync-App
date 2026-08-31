import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canRetireUnattachedMedia, createMarketingPublishingAdapter } from '../../src/features/marketing/marketingPublishing.ts';
import { publicationStatusLabel } from '../../src/features/marketing/MarketingPublishingWorkspace.tsx';

const contractorId = '20000000-0000-4000-8000-000000000001';
const workspaceId = '30000000-0000-4000-8000-000000000001';
const connectionId = '40000000-0000-4000-8000-000000000001';
const contentId = '50000000-0000-4000-8000-000000000001';
const packageId = '60000000-0000-4000-8000-000000000001';
const pairingId = '70000000-0000-4000-8000-000000000001';
const assetId = '80000000-0000-4000-8000-000000000001';
const publicationId = '90000000-0000-4000-8000-000000000001';
const fingerprint = 'a'.repeat(64);
const now = '2026-08-17T20:00:00.000Z';

const state = {
  workspace: { workspace_id: workspaceId, workspace_kind: 'contractor', display_name: 'Contractor A Marketing' },
  operation_available: false,
  prepared_limit: 5,
  prepared_count: 1,
  providers: [{
    connection_id: connectionId,
    provider: 'facebook',
    priority: 1,
    connection_status: 'connected',
    readiness_status: 'ready',
    destination_label: 'Contractor A Page',
    capabilities: { text: true, media: true, publishing_enabled: true },
    readiness_note: 'Connected and ready for an explicitly authorized publication.',
    connected_at: now,
    last_validated_at: now,
    token_expires_at: null,
    identity_revision: 2,
  }],
  facebook_setup: null,
  packages: [{
    package_id: packageId,
    package_fingerprint: fingerprint,
    content_id: contentId,
    content_revision: 4,
    content_snapshot: { title: 'Exact post', body: 'Exact public body.', content_type: 'social_post', content_revision: 4 },
    media_pairing_id: pairingId,
    media_snapshot: { asset_id: assetId },
    provider: 'facebook',
    connection_id: connectionId,
    connection_revision: 2,
    destination_label: 'Contractor A Page',
    status: 'ready',
    previewed_at: now,
    approved_at: now,
    required_disclosures: [],
    retired_reason: null,
    created_at: now,
    updated_at: now,
  }],
  publications: [{
    publication_id: publicationId,
    package_id: packageId,
    package_fingerprint: fingerprint,
    content_id: contentId,
    content_revision: 4,
    content_snapshot: { title: 'Exact post', body: 'Exact public body.', content_type: 'social_post', content_revision: 4 },
    media_pairing_id: pairingId,
    media_snapshot: { asset_id: assetId },
    provider: 'facebook',
    destination_label: 'Contractor A Page',
    publication_mode: 'scheduled',
    scheduled_at: '2026-08-18T20:00:00.000Z',
    authorization_timezone: 'America/Chicago',
    status: 'scheduled',
    attempt_count: 0,
    max_attempts: 3,
    retry_eligible: false,
    replacement_eligible: true,
    provider_publication_id: null,
    provider_permalink: null,
    failure_category: null,
    failure_message: null,
    created_at: now,
    publishing_started_at: null,
    published_at: null,
    cancelled_at: null,
  }],
};

const catalog = {
  workspace_id: workspaceId,
  assets: [{
    asset_id: assetId,
    asset_type: 'image',
    source: 'marketing_upload',
    mime_type: 'image/jpeg',
    file_size_bytes: 24,
    width: 1200,
    height: 800,
    duration_seconds: null,
    sha256: 'b'.repeat(64),
    media_variant: 'uploaded_marketing_media',
    lifecycle_state: 'protected',
    retirement_eligible: false,
    storage_bucket: 'marketing-assets',
    storage_path: `${workspaceId}/${assetId}/photo.jpg`,
    poster_bucket: 'marketing-assets',
    poster_path: `${workspaceId}/${assetId}/poster.jpg`,
    purged_at: null,
    ai_narration_disclosure_required: false,
    ai_narration_disclosure_text: null,
    created_at: now,
  }],
  pairings: [{
    pairing_id: pairingId,
    content_id: contentId,
    content_revision: 4,
    asset_id: assetId,
    claim_demonstrated: 'Exact selected image.',
    status: 'approved',
    created_at: now,
    reviewed_at: now,
  }],
};

test('shared queue adapter scopes reads and exact-package mutations to contractor context', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'servsync_get_marketing_publishing') return { data: state, error: null };
      if (name === 'servsync_get_marketing_media_catalog') return { data: catalog, error: null };
      if (name === 'servsync_abandon_marketing_media') return { data: {
        asset_id: assetId, state: 'abandoned', retired_package_count: 1, replayed: false,
      }, error: null };
      return { data: {
        package_id: packageId,
        publication_id: publicationId,
        package_fingerprint: fingerprint,
        status: 'ready',
        replayed: false,
      }, error: null };
    },
    storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.invalid/${path}` }, error: null }) }) },
  };
  const adapter = createMarketingPublishingAdapter(client, contractorId);
  const loaded = await adapter.get();
  assert.equal(loaded.workspace.kind, 'contractor');
  assert.equal(loaded.operationAvailable, false);
  assert.equal(loaded.preparedCount, 1);
  assert.equal(loaded.providers[0]?.readinessStatus, 'ready');
  assert.match(loaded.assets[0]?.posterUrl ?? '', /^https:\/\/signed\.invalid\//);

  await adapter.preparePackage({
    requestId: 'a0000000-0000-4000-8000-000000000001', contentId, contentRevision: 4,
    pairingId, provider: 'facebook', connectionId,
  });
  await adapter.recordPreview(packageId, fingerprint);
  await adapter.approvePackage(packageId, fingerprint);
  await adapter.authorize({
    requestId: 'a0000000-0000-4000-8000-000000000002', packageId, fingerprint,
    mode: 'scheduled', scheduledAt: '2026-08-18T20:00:00.000Z', timezone: 'America/Chicago',
  });
  await adapter.cancel(publicationId);
  await adapter.prepareReplacement(publicationId);
  const retirement = await adapter.retireMedia(assetId);

  assert.equal(calls.every(call => call.args.p_contractor_id === contractorId), true);
  assert.deepEqual(calls.slice(0, 2).map(call => call.name), [
    'servsync_get_marketing_publishing', 'servsync_get_marketing_media_catalog',
  ]);
  assert.equal(calls.find(call => call.name === 'servsync_authorize_marketing_publication')?.args.p_expected_fingerprint, fingerprint);
  assert.equal(calls.find(call => call.name === 'servsync_prepare_marketing_pre_provider_replacement')?.args.p_publication_id, publicationId);
  assert.deepEqual(retirement, { assetId, retiredPackageCount: 1, replayed: false });
  assert.equal(calls.find(call => call.name === 'servsync_abandon_marketing_media')?.args.p_asset_id, assetId);
});

test('queue presentation requires explicit selection, preview, confirmation, and truthful provider links', async () => {
  const source = await readFile(new URL('../../src/features/marketing/MarketingPublishingWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /selectedContentId: string \| null/);
  assert.match(source, /Exact publication preview/);
  assert.match(source, /publication-authorization-confirmation/);
  assert.match(source, /pendingPreviewId/);
  assert.match(source, /setPendingPreviewId\(packageId\)/);
  assert.match(source, /Remove media/);
  assert.match(source, /Approve &amp; Ready/);
  assert.match(source, /Ready - not published/);
  assert.match(source, /Publishing requires a separate action/);
  assert.match(source, /no Facebook request will be sent/);
  assert.match(source, /Publish Now/);
  assert.match(source, /Review Schedule/);
  assert.match(source, /Prepare replacement/);
  assert.match(source, /Facebook was not contacted/);
  assert.match(source, /exact approved package is Ready again/);
  assert.match(source, /Retire the unpublished media package for/);
  assert.match(source, /Publication history is preserved/);
  assert.match(source, /Processing on Facebook/);
  assert.match(source, /window\.setInterval\(\(\) => \{ void props\.onReload\(\); \}, 15000\)/);
  assert.match(source, /publication\.status === 'scheduled' && publication\.mode === 'scheduled'/);
  assert.match(source, /providerPermalink \?/);
  assert.doesNotMatch(source, /packages\[0\]/);
  assert.doesNotMatch(source, /Content \{selectedContent\.id\}/);
  assert.doesNotMatch(source, /fingerprint\.slice/);
  assert.doesNotMatch(source, /window\.open\([^)]*providerPublicationId/);
});

test('owner queue distinguishes publishing, provider processing, schedules, and uncertain failures', async () => {
  const adapter = createMarketingPublishingAdapter({
    rpc: async name => ({ data: name === 'servsync_get_marketing_publishing' ? state : catalog, error: null }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.invalid/asset' }, error: null }) }) },
  }, contractorId);
  const loaded = await adapter.get();
  const publication = loaded.publications[0]!;
  assert.equal(publicationStatusLabel({ ...publication, mode: 'publish_now' }), 'Publishing...');
  assert.equal(publicationStatusLabel({ ...publication, status: 'publishing', providerPublicationId: null }), 'Publishing...');
  assert.equal(publicationStatusLabel({ ...publication, status: 'publishing', providerPublicationId: '123456789' }), 'Processing on Facebook');
  assert.equal(publicationStatusLabel({ ...publication, status: 'failed', retryEligible: false }), 'Needs Attention');
  assert.equal(publication.replacementEligible, true);
  assert.match(publicationStatusLabel(publication), /^Scheduled /);
});

test('retirement adapter explains concurrent publishing and lifecycle changes', async () => {
  const messages = [
    'Marketing media has a publishing dependency and cannot be retired.',
    'Marketing media is no longer eligible for retirement; reload and try again.',
  ];
  const adapter = createMarketingPublishingAdapter({
    rpc: async () => ({ data: null, error: { code: '40001', message: messages.shift() } }),
  }, contractorId);
  await assert.rejects(adapter.retireMedia(assetId), /scheduled, publishing, or otherwise tied to a publishing result/);
  await assert.rejects(adapter.retireMedia(assetId), /changed and is no longer eligible to retire/);
});

test('unattached retirement candidate requires server eligibility and no live pairing or package dependency', async () => {
  const adapter = createMarketingPublishingAdapter({
    rpc: async name => ({ data: name === 'servsync_get_marketing_publishing' ? state : catalog, error: null }),
  }, contractorId);
  const loaded = await adapter.get();
  const asset = { ...loaded.assets[0]!, source: 'marketing_upload', mediaVariant: 'uploaded_marketing_source', lifecycleState: 'uploaded', retirementEligible: true };
  const clean = { ...loaded, assets: [asset], pairings: [], packages: [] };
  assert.equal(canRetireUnattachedMedia(asset, clean), true);

  for (const lifecycleState of ['protected', 'retention', 'scheduled', 'publishing', 'provider_processing', 'purging', 'purged', 'abandoned']) {
    assert.equal(canRetireUnattachedMedia({ ...asset, lifecycleState }, clean), false, lifecycleState);
  }
  assert.equal(canRetireUnattachedMedia({ ...asset, retirementEligible: false }, clean), false);
  assert.equal(canRetireUnattachedMedia({ ...asset, source: 'demo_recorder' }, clean), false);
  assert.equal(canRetireUnattachedMedia({ ...asset, mediaVariant: 'marketing_composition' }, clean), false);
  assert.equal(canRetireUnattachedMedia(asset, {
    ...clean, pairings: [{ ...loaded.pairings[0]!, id: pairingId, assetId, status: 'candidate' }],
  }), false);
  assert.equal(canRetireUnattachedMedia(asset, {
    ...clean, packages: [{ ...loaded.packages[0]!, mediaPairingId: null, mediaSnapshot: { asset_id: assetId }, status: 'needs_attention' }],
  }), false);
  assert.equal(canRetireUnattachedMedia(asset, {
    ...clean, packages: [{ ...loaded.packages[0]!, mediaPairingId: null, mediaSnapshot: { asset_id: assetId }, status: 'retired' }],
  }), true);
});

test('queue SQL keeps the global kill switch default-off and claims reconciliation without reopening submission', async () => {
  const source = await readFile(new URL('../../servsync-marketing-publishing-queue-authorization.sql', import.meta.url), 'utf8');
  assert.match(source, /provider_submissions_enabled boolean not null default false/);
  assert.match(source, /or \(publication\.status='publishing' and publication\.provider_request_started_at is not null\s+and publication\.provider_publication_id is not null\)/);
  assert.match(source, /marketing_publications_authorization_request_unique/);
  assert.match(source, /Marketing package identity is immutable/);
  assert.match(source, /status in \('ready','scheduled','publishing','needs_attention'\)/);
});
