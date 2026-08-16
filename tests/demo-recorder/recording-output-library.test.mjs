import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import {
  buildDurableRecordingMetadata,
  promoteValidatedRecording,
  recordingLibraryRoot,
  recordingLibraryScenarioDir,
} from '../../scripts/demo/recorder/output-library.mjs';
import { approveMarketingRecording } from '../../scripts/demo/approve-marketing-recording.mjs';

const scenarioKey = 'homeowner-service-request';
const recordingBase = 'servsync-homeowner-service-request-v1-2026-08-15T14-22-11-123Z';

function sourceMetadata(overrides = {}) {
  return {
    schema_version: 1,
    scenario: scenarioKey,
    scenario_version: 1,
    created_at: '2026-08-15T14:22:11.123Z',
    environment: 'ServSync Demo',
    viewport: { width: 1440, height: 900 },
    duration_seconds: 15.25,
    pacing: 'marketing',
    source_commit: '0123456789abcdef0123456789abcdef01234567',
    artifact: `${recordingBase}.webm`,
    contains_credentials: false,
    ...overrides,
  };
}

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'servsync-recording-library-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scratch = join(root, 'scratch');
  const library = join(root, 'library');
  await mkdir(scratch);
  const webm = join(scratch, `${recordingBase}.webm`);
  const metadata = join(scratch, `${recordingBase}.json`);
  await writeFile(webm, 'validated-webm');
  await writeFile(metadata, `${JSON.stringify(sourceMetadata(overrides))}\n`);
  return { root, scratch, library, webm, metadata };
}

const fakeTools = { ffmpeg: '/test/ffmpeg', ffprobe: '/test/ffprobe' };
const fakeProbe = (path) => ({
  codec: path.endsWith('.mp4') ? 'h264' : 'vp9',
  width: 1440,
  height: 900,
  durationSeconds: 15.25,
});
const fakeConvert = (_source, destination) => writeFileSync(destination, 'converted-mp4');

test('durable library paths are deterministic and scenario-safe', () => {
  const root = recordingLibraryRoot({ SERVSYNC_DEMO_RECORDING_LIBRARY_ROOT: '/tmp/servsync-owner-recordings' });
  assert.equal(root, '/tmp/servsync-owner-recordings');
  assert.equal(recordingLibraryScenarioDir(scenarioKey, root), '/tmp/servsync-owner-recordings/homeowner-service-request');
  assert.throws(() => recordingLibraryScenarioDir('../Production', root), /unsafe recording scenario/i);
});

test('validated WebM, H.264 MP4, and sanitized metadata promote together', async (t) => {
  const paths = await fixture(t);
  const result = await promoteValidatedRecording({
    scenarioKey,
    sourceWebmPath: paths.webm,
    sourceMetadataPath: paths.metadata,
    libraryRoot: paths.library,
    mediaTools: fakeTools,
    probe: fakeProbe,
    convert: fakeConvert,
  });

  assert.equal(await readFile(paths.webm, 'utf8'), 'validated-webm', 'source WebM remains preserved');
  await rm(paths.scratch, { recursive: true, force: true });
  assert.equal(await readFile(result.webmPath, 'utf8'), 'validated-webm');
  assert.equal(await readFile(result.mp4Path, 'utf8'), 'converted-mp4');
  const metadata = JSON.parse(await readFile(result.metadataPath, 'utf8'));
  assert.deepEqual({
    ...metadata,
    webm_sha256: '<sha>',
    mp4_sha256: '<sha>',
  }, {
    schema_version: 2,
    scenario: scenarioKey,
    recording_version: 1,
    timestamp: '2026-08-15T14:22:11.123Z',
    source_git_commit: '0123456789abcdef0123456789abcdef01234567',
    environment: 'Demo',
    viewport: { width: 1440, height: 900 },
    duration_seconds: 15.25,
    pacing: 'marketing',
    webm_filename: `${recordingBase}.webm`,
    mp4_filename: `${recordingBase}.mp4`,
    width: 1440,
    height: 900,
    mime_type: 'video/mp4',
    mp4_size_bytes: 13,
    webm_sha256: '<sha>',
    mp4_sha256: '<sha>',
    validation_status: 'passed',
    sensitive_data_check: 'passed',
    pacing_review: 'pending',
    pacing_reviewed_at: null,
    marketing_candidate_status: 'not_approved',
  });
  assert.match(metadata.webm_sha256, /^[a-f0-9]{64}$/);
  assert.match(metadata.mp4_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.scenarioDir, join(paths.library, scenarioKey));
});

test('failed conversion leaves the validated scratch WebM and promotes nothing', async (t) => {
  const paths = await fixture(t);
  await assert.rejects(() => promoteValidatedRecording({
    scenarioKey,
    sourceWebmPath: paths.webm,
    sourceMetadataPath: paths.metadata,
    libraryRoot: paths.library,
    mediaTools: fakeTools,
    probe: fakeProbe,
    convert: () => { throw new Error('conversion unavailable'); },
  }), /conversion unavailable/);

  assert.equal(await readFile(paths.webm, 'utf8'), 'validated-webm');
  assert.equal(existsSync(join(paths.library, scenarioKey, `${recordingBase}.webm`)), false);
  assert.equal(existsSync(join(paths.library, scenarioKey, `${recordingBase}.mp4`)), false);
  assert.equal(existsSync(join(paths.library, scenarioKey, `${recordingBase}.json`)), false);
});

test('unvalidated or mismatched source metadata fails before conversion', async (t) => {
  const paths = await fixture(t, { environment: 'Production' });
  let converted = false;
  await assert.rejects(() => promoteValidatedRecording({
    scenarioKey,
    sourceWebmPath: paths.webm,
    sourceMetadataPath: paths.metadata,
    libraryRoot: paths.library,
    mediaTools: fakeTools,
    probe: fakeProbe,
    convert: () => { converted = true; },
  }), /only validated.*Demo recordings/i);
  assert.equal(converted, false);
});

test('dimension and H.264 verification fail closed without a durable package', async (t) => {
  const paths = await fixture(t);
  await assert.rejects(() => promoteValidatedRecording({
    scenarioKey,
    sourceWebmPath: paths.webm,
    sourceMetadataPath: paths.metadata,
    libraryRoot: paths.library,
    mediaTools: fakeTools,
    probe: (path) => ({ ...fakeProbe(path), width: 1280 }),
    convert: fakeConvert,
  }), /dimensions do not match/i);

  assert.equal(existsSync(join(paths.library, scenarioKey)), false);
});

test('repeated promotion never overwrites a previous version', async (t) => {
  const paths = await fixture(t);
  const options = {
    scenarioKey,
    sourceWebmPath: paths.webm,
    sourceMetadataPath: paths.metadata,
    libraryRoot: paths.library,
    mediaTools: fakeTools,
    probe: fakeProbe,
    convert: fakeConvert,
  };
  const first = await promoteValidatedRecording(options);
  await assert.rejects(() => promoteValidatedRecording(options), /already exists/i);
  assert.equal(await readFile(first.webmPath, 'utf8'), 'validated-webm');
  assert.equal(await readFile(first.mp4Path, 'utf8'), 'converted-mp4');
});

test('durable metadata uses an allowlist and excludes secret-bearing source fields', () => {
  const metadata = buildDurableRecordingMetadata({
    metadata: sourceMetadata({ password: 'do-not-copy', access_token: 'do-not-copy' }),
    webmFilename: `${recordingBase}.webm`,
    mp4Filename: `${recordingBase}.mp4`,
  });
  const serialized = JSON.stringify(metadata);
  assert.equal(serialized.includes('do-not-copy'), false);
  assert.equal(serialized.includes('password'), false);
  assert.equal(serialized.includes('access_token'), false);
  assert.equal(basename(metadata.webm_filename), metadata.webm_filename);
});

test('explicit full-speed review is required before a durable package becomes Marketing-ready', async (t) => {
  const paths = await fixture(t);
  const promoted = await promoteValidatedRecording({
    scenarioKey,
    sourceWebmPath: paths.webm,
    sourceMetadataPath: paths.metadata,
    libraryRoot: paths.library,
    mediaTools: fakeTools,
    probe: fakeProbe,
    convert: fakeConvert,
  });
  const pending = JSON.parse(await readFile(promoted.metadataPath, 'utf8'));
  assert.equal(pending.pacing_review, 'pending');
  const reviewed = await approveMarketingRecording(promoted.metadataPath, {
    mediaTools: fakeTools,
    probe: fakeProbe,
    reviewedAt: '2026-08-15T18:00:00.000Z',
  });
  assert.equal(reviewed.pacingReview, 'passed');
  const approved = JSON.parse(await readFile(promoted.metadataPath, 'utf8'));
  assert.equal(approved.marketing_candidate_status, 'passed');
  assert.equal(approved.pacing_reviewed_at, '2026-08-15T18:00:00.000Z');
  assert.deepEqual(Object.values(approved.pacing_review_criteria), Array(8).fill(true));
  await assert.rejects(() => approveMarketingRecording(promoted.metadataPath, { mediaTools: fakeTools, probe: fakeProbe }), /not awaiting/i);
});
