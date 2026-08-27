import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertSafeHelpRecordingSpec } from '../../scripts/help/run-help-studio-recording.mjs';

const validSpec = {
  schema_version: 1,
  recording_job_id: '40000000-0000-4000-8000-000000000001',
  title: 'How to create an estimate',
  purpose: 'both',
  feature_area: 'Estimates',
  target_screen: 'Drafts',
  route_contexts: ['contractor.drafts'],
  audience_roles: ['owner'],
  requested_goal: 'Show one clear estimate workflow.',
  required_starting_state: 'One Demo request is ready.',
  scenario: 'contractor-create-estimate',
  actions: ['Open the request.', 'Save the estimate.'],
  expected_final_state: 'The saved estimate remains visible.',
  desired_duration_seconds: 30,
  narration_mode: 'none',
  talking_points: [],
  pacing_profile: 'servsync-human-paced-v1',
};

test('Help Studio recorder accepts only a durable job identity, known Demo scenario, and shared pacing preset', () => {
  assert.equal(assertSafeHelpRecordingSpec(validSpec), validSpec);
  assert.equal(assertSafeHelpRecordingSpec({
    ...validSpec,
    scenario: 'contractor-service-request-intake',
    route_contexts: ['contractor.service_requests'],
  }).scenario, 'contractor-service-request-intake');
  assert.throws(() => assertSafeHelpRecordingSpec({ ...validSpec, scenario: 'production-walkthrough' }), /Unsupported/);
  assert.throws(() => assertSafeHelpRecordingSpec({ ...validSpec, pacing_profile: 'fast' }), /human-paced/);
  assert.throws(() => assertSafeHelpRecordingSpec({ ...validSpec, recording_job_id: '../job' }), /identity/);
});

test('Help Studio recorder refuses secret-bearing specs and has no paid or public provider path', async () => {
  assert.throws(() => assertSafeHelpRecordingSpec({ ...validSpec, password: 'fixture' }), /credential-bearing/);
  const source = await readFile(new URL('../../scripts/help/run-help-studio-recording.mjs', import.meta.url), 'utf8');
  assert.match(source, /--pacing=human-paced/);
  assert.match(source, /runRecorder/);
  assert.match(source, /validated_servsync_demo_recorder/);
  assert.doesNotMatch(source, /openai|audio\/speech|facebook|instagram|tiktok|marketing_publications/i);
});

test('Help Studio package keeps WebM provenance and prepares MP4, poster, and sanitized metadata for managed ingestion', async () => {
  const source = await readFile(new URL('../../scripts/help/run-help-studio-recording.mjs', import.meta.url), 'utf8');
  assert.match(source, /copyFile\(result\.durableWebm, webmPath\)/);
  assert.match(source, /copyFile\(result\.durableMp4, mp4Path\)/);
  assert.match(source, /createPoster\(mp4Path, posterPath/);
  assert.match(source, /mp4_sha256/);
  assert.match(source, /poster_sha256/);
  assert.doesNotMatch(source, /createClient|supabase\.co|\/v1\/audio|\/videos/i);
});
