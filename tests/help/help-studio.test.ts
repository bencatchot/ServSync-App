import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  emptyHelpWalkthroughDraft,
  emptyHelpRecordingSpecDraft,
  findHelp,
  helpRecordingSpecPayload,
  helpPayload,
  parseHelpSearchResult,
  parseHelpRecordingJob,
  parseHelpWalkthrough,
  validateHelpRecordingPackage,
} from '../../src/features/help/helpStudio.ts';
import { createHelpWalkthroughMediaHandler } from '../../server/helpWalkthroughMedia.ts';
import { contextualHelpLookupReady } from '../../src/features/help/contextualHelpPolicy.ts';

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

test('recording request payload preserves a future-ready spec without engineering-only fields', () => {
  const draft = {
    ...emptyHelpRecordingSpecDraft(),
    targetWalkthroughId: walkthroughId,
    title: 'How to create an estimate',
    summary: 'Create an estimate from a service request at a readable pace.',
    featureArea: 'Estimates',
    routeContexts: 'contractor.drafts',
    keywords: 'estimate, quote, draft pricing',
    requestedGoal: 'Show a contractor creating and saving one estimate draft.',
    targetScreen: 'Drafts',
    requiredStartingState: 'One fictional Demo service request is ready for review.',
    actionSteps: 'Open the service request.\nCreate the estimate.\nSave the draft.',
    expectedFinalState: 'The saved estimate draft remains visible.',
    talkingPoints: 'Start from the customer request.\nReview scope and pricing.',
    desiredDurationSeconds: '30',
  };
  assert.deepEqual(helpRecordingSpecPayload(draft), {
    target_walkthrough_id: walkthroughId,
    slug: 'how-to-create-an-estimate',
    title: draft.title,
    summary: draft.summary,
    purpose: 'both',
    feature_area: 'Estimates',
    route_contexts: ['contractor.drafts'],
    audience_roles: ['owner', 'admin', 'office'],
    keywords: ['estimate', 'quote', 'draft pricing'],
    requested_goal: draft.requestedGoal,
    target_screen: 'Drafts',
    required_starting_state: draft.requiredStartingState,
    scenario_key: 'contractor-create-estimate',
    action_steps: ['Open the service request.', 'Create the estimate.', 'Save the draft.'],
    expected_final_state: draft.expectedFinalState,
    desired_duration_seconds: 30,
    narration_mode: 'none',
    talking_points: ['Start from the customer request.', 'Review scope and pricing.'],
  });
});

test('recording job parser keeps lifecycle, managed media, and review evidence', () => {
  const parsed = parseHelpRecordingJob({
    job_id: '40000000-0000-4000-8000-000000000001', target_walkthrough_id: walkthroughId,
    status: 'ready_for_review', slug: 'how-to-create-an-estimate', title: 'How to create an estimate',
    summary: 'Create an estimate from a service request at a readable pace.', purpose: 'both',
    feature_area: 'Estimates', route_contexts: ['contractor.drafts'], audience_roles: ['owner'],
    keywords: ['estimate'], requested_goal: 'Show one human-paced estimate workflow.', target_screen: 'Drafts',
    required_starting_state: 'One request is ready.', scenario_key: 'contractor-create-estimate',
    action_steps: ['Open request.', 'Save estimate.'], expected_final_state: 'Draft remains visible.',
    desired_duration_seconds: 30, narration_mode: 'none', talking_points: [],
    pacing_profile: 'servsync-human-paced-v1', source_kind: 'recorder_generated', source_commit: 'a'.repeat(40),
    source_version: 'Demo Recorder', video_asset_id: assetId,
    poster_asset_id: '20000000-0000-4000-8000-000000000002',
    recorder_metadata: { validation_status: 'passed' }, failure_category: null, failure_message: null,
    review_notes: null, approved_walkthrough_id: null, approved_revision: null,
    requested_at: '2026-08-18T00:00:00Z', ready_for_review_at: '2026-08-18T00:01:00Z',
    reviewed_at: null, updated_at: '2026-08-18T00:01:00Z',
  });
  assert.equal(parsed.status, 'ready_for_review');
  assert.equal(parsed.pacingProfile, 'servsync-human-paced-v1');
  assert.equal(parsed.videoAssetId, assetId);
});

test('recording package is bound to the exact job and selected media checksums before upload', () => {
  const job = {
    id: '40000000-0000-4000-8000-000000000001',
    scenarioKey: 'contractor-create-estimate',
    pacingProfile: 'servsync-human-paced-v1' as const,
  };
  const video = new File(['video'], 'estimate.mp4', { type: 'video/mp4' });
  const poster = new File(['poster'], 'estimate.png', { type: 'image/png' });
  const manifest = {
    recording_job_id: job.id, scenario: job.scenarioKey, pacing_profile: job.pacingProfile,
    validation_status: 'passed', sensitive_data_check: 'passed',
    canonical_output_provenance: 'validated_servsync_demo_recorder',
    source_git_commit: 'a'.repeat(40), mp4_filename: video.name, mp4_sha256: 'b'.repeat(64),
    poster_filename: poster.name, poster_sha256: 'c'.repeat(64),
    viewport: { width: 1440, height: 900 }, duration_seconds: 31.25,
  };
  assert.equal(validateHelpRecordingPackage(manifest, job, { video, poster }).recordingJobId, job.id);
  assert.throws(() => validateHelpRecordingPackage({ ...manifest, recording_job_id: crypto.randomUUID() }, job, { video, poster }), /exactly match/);
  assert.throws(() => validateHelpRecordingPackage({ ...manifest, mp4_sha256: 'd'.repeat(64) }, job, {
    video: new File(['video'], 'other.mp4', { type: 'video/mp4' }), poster,
  }), /exactly match/);
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

test('contractor contextual Help waits for tenant context before calling its protected search', () => {
  assert.equal(contextualHelpLookupReady('contractor.service_requests', undefined), false);
  assert.equal(contextualHelpLookupReady('contractor.drafts', null), false);
  assert.equal(
    contextualHelpLookupReady('contractor.service_requests', '30000000-0000-4000-8000-000000000001'),
    true,
  );
  assert.equal(contextualHelpLookupReady('homeowner.records', undefined), true);
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

test('recording-review playback uses the admin-only recording grant and rejects mixed identities', async () => {
  const calls: string[] = [];
  const fakeClient = {
    rpc: async (name: string) => {
      calls.push(name);
      if (name === 'servsync_get_help_recording_playback_grant') return { data: {
        recording_job_id: '40000000-0000-4000-8000-000000000001', video_asset_id: assetId, title: 'Review',
      }, error: null };
      return { data: [{
        asset_id: assetId, storage_bucket: 'help-walkthroughs', storage_path: 'private/review.mp4',
        mime_type: 'video/mp4', sha256: 'a'.repeat(64), file_size_bytes: 100,
        duration_seconds: 30, width: 1440, height: 900,
      }], error: null };
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/review' }, error: null }) }) },
  };
  const handler = createHelpWalkthroughMediaHandler({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' }, () => fakeClient as never);
  const response = await handler(new Request('https://servsync.app/api/help-walkthrough-media', {
    method: 'POST', headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordingJobId: '40000000-0000-4000-8000-000000000001' }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).recordingJobId, '40000000-0000-4000-8000-000000000001');
  assert.deepEqual(calls, ['servsync_get_help_recording_playback_grant', 'servsync_get_help_media_for_service']);
  const mixed = await handler(new Request('https://servsync.app/api/help-walkthrough-media', {
    method: 'POST', headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordingJobId: '40000000-0000-4000-8000-000000000001', walkthroughId }),
  }));
  assert.equal(mixed.status, 400);
});
