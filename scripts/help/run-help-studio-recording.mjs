#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runRecorder } from '../demo/record-demo.mjs';
import { resolveMediaTools, probeMedia } from '../demo/recorder/output-library.mjs';
import { HUMAN_PACED_PROFILE_NAME } from '../demo/recorder/lib.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SCENARIOS = new Set([
  'homeowner-service-request',
  'contractor-service-request-intake',
  'contractor-create-estimate',
  'contractor-complete-work',
  'homeowner-home-history',
  'servsync-platform-introduction',
]);

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolveHash, rejectHash) => {
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', resolveHash);
    stream.on('error', rejectHash);
  });
  return hash.digest('hex');
}

export function assertSafeHelpRecordingSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Help Studio recording spec is invalid.');
  if (spec.schema_version !== 1 || !UUID.test(String(spec.recording_job_id || ''))) throw new Error('Help Studio recording identity is invalid.');
  if (!SAFE_SCENARIOS.has(spec.scenario)) throw new Error(`Unsupported Help Studio recorder scenario: ${spec.scenario || '(missing)'}`);
  if (spec.pacing_profile !== HUMAN_PACED_PROFILE_NAME) throw new Error('Help Studio recordings must use the shared human-paced preset.');
  const serialized = JSON.stringify(spec);
  if (/password|access_token|refresh_token|service_role|cookie|authorization|private_key/i.test(serialized)) {
    throw new Error('Help Studio recording spec contains a credential-bearing field or value.');
  }
  return spec;
}

function createPoster(mp4Path, destination, ffmpegPath, durationSeconds) {
  const seek = Math.max(1, Math.min(durationSeconds * 0.72, durationSeconds - 1));
  const result = spawnSync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
    '-ss', seek.toFixed(3), '-i', mp4Path, '-frames:v', '1', '-vf', 'scale=1440:-2', destination,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Poster creation failed: ${result.stderr.trim() || 'ffmpeg failed'}`);
}

export async function runHelpStudioRecording(argv = process.argv.slice(2), env = process.env) {
  const [specPath, ...options] = argv;
  if (!specPath) throw new Error('Usage: npm run help:record -- <recording-spec.json> [--headed]');
  if (options.some(option => option !== '--headed')) throw new Error('Unsupported Help Studio recording option.');
  const spec = assertSafeHelpRecordingSpec(JSON.parse(await readFile(resolve(specPath), 'utf8')));
  const recorderArgs = [spec.scenario, '--pacing=human-paced'];
  if (options.includes('--headed')) recorderArgs.push('--headed');
  const result = await runRecorder(recorderArgs, env);
  if (!result.success || result.durablePromotion !== 'passed') throw new Error('Recorder did not produce a validated canonical package.');

  const durableMetadata = JSON.parse(await readFile(result.durableMetadata, 'utf8'));
  if (durableMetadata.pacing_profile !== HUMAN_PACED_PROFILE_NAME
    || durableMetadata.validation_status !== 'passed'
    || durableMetadata.sensitive_data_check !== 'passed') {
    throw new Error('Validated recorder metadata did not preserve the Help Studio quality contract.');
  }

  const tools = await resolveMediaTools(env);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const packageRoot = resolve(env.SERVSYNC_HELP_RECORDING_LIBRARY_ROOT?.trim()
    || join(homedir(), 'Documents', 'Codex', 'ServSync Help Studio Recordings'));
  const packageDir = join(packageRoot, spec.scenario, timestamp);
  await mkdir(join(packageRoot, spec.scenario), { recursive: true, mode: 0o700 });
  await mkdir(packageDir, { recursive: false, mode: 0o700 });

  const mp4Filename = `servsync-help-${spec.scenario}-${timestamp}.mp4`;
  const webmFilename = `servsync-help-${spec.scenario}-${timestamp}.webm`;
  const posterFilename = `servsync-help-${spec.scenario}-${timestamp}.png`;
  const metadataFilename = `servsync-help-${spec.scenario}-${timestamp}.json`;
  const mp4Path = join(packageDir, mp4Filename);
  const webmPath = join(packageDir, webmFilename);
  const posterPath = join(packageDir, posterFilename);
  const metadataPath = join(packageDir, metadataFilename);
  await copyFile(result.durableMp4, mp4Path);
  await copyFile(result.durableWebm, webmPath);

  const mp4Probe = probeMedia(mp4Path, tools.ffprobe);
  createPoster(mp4Path, posterPath, tools.ffmpeg, mp4Probe.durationSeconds);
  const posterInfo = await stat(posterPath);
  if (!posterInfo.isFile() || posterInfo.size <= 0) throw new Error('Help Studio poster is missing or empty.');
  const [mp4Sha256, webmSha256, posterSha256, mp4Info] = await Promise.all([
    sha256File(mp4Path), sha256File(webmPath), sha256File(posterPath), stat(mp4Path),
  ]);
  const manifest = {
    schema_version: 1,
    recording_job_id: spec.recording_job_id,
    scenario: spec.scenario,
    title: spec.title,
    purpose: spec.purpose,
    pacing_profile: HUMAN_PACED_PROFILE_NAME,
    pacing_defaults: durableMetadata.pacing_defaults,
    validation_status: 'passed',
    sensitive_data_check: 'passed',
    canonical_output_provenance: 'validated_servsync_demo_recorder',
    source_git_commit: durableMetadata.source_git_commit,
    environment: 'Demo',
    viewport: { width: mp4Probe.width, height: mp4Probe.height },
    duration_seconds: Number(mp4Probe.durationSeconds.toFixed(3)),
    mp4_filename: mp4Filename,
    mp4_size_bytes: mp4Info.size,
    mp4_sha256: mp4Sha256,
    webm_filename: webmFilename,
    webm_sha256: webmSha256,
    poster_filename: posterFilename,
    poster_sha256: posterSha256,
    generated_at: new Date().toISOString(),
  };
  await writeFile(metadataPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return {
    success: true,
    scenario: spec.scenario,
    durationSeconds: manifest.duration_seconds,
    mp4: mp4Path,
    webm: webmPath,
    poster: posterPath,
    metadata: metadataPath,
    sourceCommit: manifest.source_git_commit,
    pacingProfile: manifest.pacing_profile,
    note: `Attach ${basename(mp4Path)}, ${basename(posterPath)}, and ${basename(metadataPath)} to the matching Help Studio recording request.`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHelpStudioRecording()
    .then(summary => console.log(JSON.stringify(summary, null, 2)))
    .catch(error => {
      console.error(JSON.stringify({ success: false, error: error.message, note: 'No credential values were logged.' }, null, 2));
      process.exitCode = 1;
    });
}
