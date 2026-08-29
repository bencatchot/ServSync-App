import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertSafeHelpRecordingSpec } from '../../scripts/help/run-help-studio-recording.mjs';
import {
  HELP_CAPTION_CUE_SETTINGS,
  HELP_CAPTION_PLACEMENT_VERSION,
  HELP_NARRATION_DISCLOSURE,
  HELP_NARRATION_MODEL,
  HELP_NARRATION_VOICE,
  assertSilentManifest,
  buildWebVtt,
  narrationScriptFromSpec,
} from '../../scripts/help/prepare-narrated-help-recording.mjs';
import {
  buildAlignedWebVtt,
  buildSceneAlignment,
  parseSecondsOption,
  parseWebVttCues,
} from '../../scripts/help/retime-narrated-help-recording.mjs';

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
  assert.match(vtt, /00:00:00\.750 --> [^\n]+ line:8% position:50% align:center size:90%\n/);
  assert.match(vtt, /Open the request\.\n\n00:00:03\./);
  assert.match(vtt, /Review the details\.\n$/);
  assert.equal(HELP_CAPTION_PLACEMENT_VERSION, 'top_safe_area_v1');
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

test('scene-aligned Help retiming anchors existing narration cues without another provider request', () => {
  const legacyCues = parseWebVttCues('WEBVTT\n\n00:00:00.750 --> 00:00:03.000\nOpen the Estimate.\n');
  assert.equal(legacyCues[0]?.text, 'Open the Estimate.');
  const sourceCues = parseWebVttCues('WEBVTT\n\n00:00:00.750 --> 00:00:03.000 line:8% position:50% align:center size:90%\nOpen the Estimate.\n\n00:00:03.160 --> 00:00:06.000 line:8% position:50% align:center size:90%\nComplete the Job.\n');
  const segments = buildSceneAlignment({
    cues: sourceCues,
    sourceBoundaries: [3.1],
    cueStarts: [2, 10],
    silences: [{ start: 3, end: 3.2 }, { start: 5.9, end: 6 }],
    audioDurationSeconds: 6,
    videoDurationSeconds: 20,
  });
  assert.deepEqual(segments.map(segment => Number(segment.cueStart.toFixed(1))), [2, 10]);
  assert.deepEqual(segments.map(segment => Number(segment.cueEnd.toFixed(1))), [5, 12.7]);
  assert.match(buildAlignedWebVtt(segments.map(segment => ({ text: segment.text, start: segment.cueStart, end: segment.cueEnd }))), /00:00:10\.000 --> 00:00:12\.700 line:8% position:50% align:center size:90%\nComplete the Job\./);
});

test('scene-aligned Help retiming rejects guessed boundaries and overlapping output', () => {
  const cues = [{ text: 'One.', start: 0, end: 2 }, { text: 'Two.', start: 2.2, end: 4 }];
  assert.deepEqual(parseSecondsOption('1.25, 8', 2, '--cue-starts'), [1.25, 8]);
  assert.throws(() => parseSecondsOption('8, 1.25', 2, '--cue-starts'), /strictly increasing/);
  assert.throws(() => buildSceneAlignment({
    cues, sourceBoundaries: [2.1], cueStarts: [1, 5], silences: [{ start: 2.2, end: 2.4 }],
    audioDurationSeconds: 4, videoDurationSeconds: 12,
  }), /detected narration pause/);
  assert.throws(() => buildSceneAlignment({
    cues, sourceBoundaries: [2.3], cueStarts: [1, 2], silences: [{ start: 2.2, end: 2.4 }],
    audioDurationSeconds: 4, videoDurationSeconds: 12,
  }), /overlaps/);
});

test('scene-aligned Help retiming source never calls a provider or reads an API key', async () => {
  const source = await readFile(new URL('../../scripts/help/retime-narrated-help-recording.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /api\.openai\.com|OPENAI_API_KEY|audio\/speech/);
  assert.match(source, /providerRequestMadeByThisCommand: false/);
  assert.match(source, /narration_provider_request_count: 1/);
  assert.match(source, /narration_source_audio_sha256/);
});
