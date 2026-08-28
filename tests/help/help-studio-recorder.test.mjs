import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertSafeHelpRecordingSpec } from '../../scripts/help/run-help-studio-recording.mjs';
import {
  HELP_NARRATION_DISCLOSURE,
  HELP_NARRATION_MODEL,
  HELP_NARRATION_VOICE,
  assertSilentManifest,
  buildWebVtt,
  narrationScriptFromSpec,
} from '../../scripts/help/prepare-narrated-help-recording.mjs';

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
  assert.equal(assertSafeHelpRecordingSpec({
    ...validSpec,
    scenario: 'contractor-complete-work',
    route_contexts: ['contractor.work'],
  }).scenario, 'contractor-complete-work');
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

test('narrated Help packaging preserves the exact Cedar product decision and transcript', () => {
  const aiSpec = {
    ...validSpec,
    narration_mode: 'ai',
    talking_points: ['Open the request.', 'Choose Create Estimate on the request.'],
  };
  assert.deepEqual(narrationScriptFromSpec(aiSpec), {
    script: 'Open the request. Choose Create Estimate on the request.',
    sentences: ['Open the request.', 'Choose Create Estimate on the request.'],
  });
  assert.equal(HELP_NARRATION_MODEL, 'gpt-4o-mini-tts');
  assert.equal(HELP_NARRATION_VOICE, 'cedar');
  assert.equal(HELP_NARRATION_DISCLOSURE, "AI-generated voiceover using OpenAI's Cedar voice.");
});

test('narrated Help packaging creates ordered English WebVTT cues at the approved audio offset', () => {
  const vtt = buildWebVtt(['Open the request.', 'Review the details.'], 6, 0.75);
  assert.match(vtt, /^WEBVTT\n\n00:00:00\.750 --> /);
  assert.match(vtt, /Open the request\.\n\n00:00:03\./);
  assert.match(vtt, /Review the details\.\n$/);
});

test('narrated Help packaging only accepts the matching validated Demo silent source', () => {
  const aiSpec = { ...validSpec, narration_mode: 'ai', talking_points: ['Open the request.'] };
  const manifest = {
    schema_version: 1,
    recording_job_id: aiSpec.recording_job_id,
    scenario: aiSpec.scenario,
    pacing_profile: aiSpec.pacing_profile,
    environment: 'Demo',
    validation_status: 'passed',
    sensitive_data_check: 'passed',
    canonical_output_provenance: 'validated_servsync_demo_recorder',
    source_git_commit: 'a'.repeat(40),
    mp4_sha256: 'b'.repeat(64),
    poster_sha256: 'c'.repeat(64),
  };
  assert.equal(assertSilentManifest(manifest, aiSpec), manifest);
  assert.throws(() => assertSilentManifest({ ...manifest, environment: 'Production' }, aiSpec), /validated Demo/);
  assert.throws(() => assertSilentManifest({ ...manifest, recording_job_id: '40000000-0000-4000-8000-000000000002' }, aiSpec), /validated Demo/);
});

test('narration provider integration makes one Cedar speech request and never persists the API key', async () => {
  const source = await readFile(new URL('../../scripts/help/prepare-narrated-help-recording.mjs', import.meta.url), 'utf8');
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/audio\/speech/);
  assert.match(source, /narration_provider_request_count: 1/);
  assert.match(source, /source_silent_sha256/);
  assert.match(source, /captions_vtt/);
  assert.doesNotMatch(source, /["'](?:openai_)?api_key["']\s*:|writeFile\([^\n]*OPENAI_API_KEY/i);
});
