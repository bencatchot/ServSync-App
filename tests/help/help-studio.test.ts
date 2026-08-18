import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  emptyHelpWalkthroughDraft,
  findHelp,
  helpPayload,
  parseHelpSearchResult,
  parseHelpWalkthrough,
} from '../../src/features/help/helpStudio.ts';
import { createHelpWalkthroughMediaHandler } from '../../server/helpWalkthroughMedia.ts';

const walkthroughId = '10000000-0000-4000-8000-000000000001';
const assetId = '20000000-0000-4000-8000-000000000001';

test('walkthrough payload normalizes manual metadata without provider dependencies', () => {
  const draft = {
    ...emptyHelpWalkthroughDraft(),
    title: 'How to create an estimate',
    summary: 'Start a draft and create an estimate for customer review.',
    steps: 'Open Drafts.\nChoose Estimate.\nReview the total.',
    keywords: 'Create Estimate, quote, quote, draft pricing',
    featureArea: 'Estimates',
    routeContexts: 'contractor.drafts, contractor.drafts',
    audienceRoles: ['owner', 'admin'],
    purpose: 'both' as const,
    sourceCommit: '5058d65043eb4d14fe29e84c7262fec1267e9e19',
  };
  assert.deepEqual(helpPayload(draft), {
    title: draft.title,
    summary: draft.summary,
    steps: ['Open Drafts.', 'Choose Estimate.', 'Review the total.'],
    keywords: ['create estimate', 'quote', 'draft pricing'],
    feature_area: 'Estimates',
    route_contexts: ['contractor.drafts'],
    audience_roles: ['owner', 'admin'],
    purpose: 'both',
    source_commit: draft.sourceCommit,
    source_version: null,
    video_asset_id: null,
    poster_asset_id: null,
    human_paced_review: 'pending',
    sensitive_data_review: 'pending',
    canonical_output_review: 'pending',
    validation_status: 'draft',
    narration_provider: null,
    narration_voice: null,
    narration_disclosure: null,
    transcript: null,
  });
});

test('walkthrough parser keeps durable revision and quality metadata', () => {
  const parsed = parseHelpWalkthrough({
    walkthrough_id: walkthroughId, slug: 'how-to-create-an-estimate', state: 'published', purpose: 'both',
    current_revision: 2, published_revision: 2, title: 'How to create an estimate',
    summary: 'Create an estimate from a private contractor draft.', steps: ['Open Drafts.'],
    keywords: ['quote'], feature_area: 'Estimates', route_contexts: ['contractor.drafts'],
    audience_roles: ['owner'], source_commit: null, source_version: null, video_asset_id: assetId,
    poster_asset_id: null, human_paced_review: 'passed', sensitive_data_review: 'passed',
    canonical_output_review: 'passed', validation_status: 'passed', narration_provider: null,
    narration_voice: null, narration_disclosure: null, transcript: null,
    video_file_name: 'walkthrough.mp4', video_bytes: 1234, video_duration: 23,
    video_width: 1440, video_height: 900, poster_file_name: null,
    created_at: '2026-08-18T00:00:00Z', updated_at: '2026-08-18T01:00:00Z', published_at: '2026-08-18T01:00:00Z',
  });
  assert.equal(parsed.currentRevision, 2);
  assert.equal(parsed.videoAssetId, assetId);
  assert.equal(parsed.videoBytes, 1234);
  assert.deepEqual(parsed.routeContexts, ['contractor.drafts']);
});

test('deterministic search adapter sends query, context, role context, and bounded limit', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args: args ?? {} });
      return { data: [{
        walkthrough_id: walkthroughId, slug: 'how-to-create-an-estimate', revision: 1,
        title: 'How to create an estimate', summary: 'Create a customer estimate.', steps: ['Open Drafts.'],
        keywords: ['quote'], feature_area: 'Estimates', purpose: 'support', route_contexts: ['contractor.drafts'],
        video_asset_id: assetId, poster_asset_id: null, duration_seconds: 23, width: 1440, height: 900,
        narration_disclosure: null, rank: 5,
      }], error: null };
    },
  };
  const results = await findHelp(client as never, {
    query: 'quote', routeContext: 'contractor.drafts',
    contractorId: '30000000-0000-4000-8000-000000000001', limit: 3,
  });
  assert.equal(results.length, 1);
  assert.deepEqual(calls, [{ name: 'servsync_find_help', args: {
    p_query: 'quote', p_route_context: 'contractor.drafts',
    p_contractor_id: '30000000-0000-4000-8000-000000000001', p_limit: 3,
  } }]);
});

test('search parser rejects untrusted media identities', () => {
  assert.throws(() => parseHelpSearchResult({ walkthrough_id: walkthroughId, video_asset_id: '../private' }), /invalid walkthrough/);
});

test('Marketing reuse keeps Help canonical and links only an exact ephemeral derivative', async () => {
  const migration = await readFile(new URL('../../servsync-help-studio-foundation.sql', import.meta.url), 'utf8');
  assert.match(migration, /create table public\.help_marketing_derivatives/);
  assert.match(migration, /asset\.source = 'marketing_upload' and asset\.ephemeral/);
  assert.match(migration, /asset\.sha256 = v_help_asset\.sha256 and asset\.file_size_bytes = v_help_asset\.file_size_bytes/);
  assert.doesNotMatch(migration, /insert into public\.marketing_publications/);
  assert.doesNotMatch(migration, /update public\.marketing_publishing_controls/);
});

test('playback endpoint rejects non-POST, missing auth, and missing server configuration without exposing paths', async () => {
  const handler = createHelpWalkthroughMediaHandler({});
  assert.equal((await handler(new Request('https://servsync.app/api/help-walkthrough-media'))).status, 405);
  assert.equal((await handler(new Request('https://servsync.app/api/help-walkthrough-media', { method: 'POST' }))).status, 401);
  const response = await handler(new Request('https://servsync.app/api/help-walkthrough-media', {
    method: 'POST', headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ walkthroughId, contractorId: null }),
  }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: 'Help playback is unavailable.' });
});
