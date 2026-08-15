import { constants } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SAFE_SCENARIO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_RECORDING_BASENAME = /^servsync-[a-z0-9-]+-v\d+-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

export function recordingLibraryRoot(env = process.env) {
  const configured = env.SERVSYNC_DEMO_RECORDING_LIBRARY_ROOT?.trim();
  return resolve(configured || join(homedir(), 'Documents', 'Codex', 'ServSync Demo Recordings'));
}

export function recordingLibraryScenarioDir(scenarioKey, root = recordingLibraryRoot()) {
  if (!SAFE_SCENARIO.test(scenarioKey)) throw new Error(`Unsafe recording scenario key: ${scenarioKey}`);
  return join(resolve(root), scenarioKey);
}

async function findExecutable(name, env = process.env) {
  const candidates = [
    ...(env.PATH || '').split(delimiter).filter(Boolean).map((directory) => join(directory, name)),
    join('/opt/homebrew/bin', name),
    join('/usr/local/bin', name),
  ];
  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through known executable locations.
    }
  }
  throw new Error(`${name} is required to create the durable recording package.`);
}

export async function resolveMediaTools(env = process.env) {
  return {
    ffmpeg: await findExecutable('ffmpeg', env),
    ffprobe: await findExecutable('ffprobe', env),
  };
}

export function probeMedia(filePath, ffprobePath) {
  const result = spawnSync(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height:format=duration',
    '-of', 'json',
    filePath,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffprobe could not validate ${basename(filePath)}: ${result.stderr.trim() || 'unknown error'}`);
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error(`ffprobe returned invalid metadata for ${basename(filePath)}.`);
  }
  const stream = payload.streams?.[0];
  const durationSeconds = Number(payload.format?.duration);
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  if (!stream || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || width <= 0 || height <= 0) {
    throw new Error(`ffprobe found no playable video stream in ${basename(filePath)}.`);
  }
  return { codec: stream.codec_name, width, height, durationSeconds };
}

export function convertWebmToMp4(sourcePath, destinationPath, ffmpegPath) {
  const result = spawnSync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
    '-i', sourcePath,
    '-map', '0:v:0', '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    destinationPath,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`MP4 conversion failed: ${result.stderr.trim() || 'ffmpeg failed'}`);
  }
}

function assertMetadataSafe(metadata) {
  const serialized = JSON.stringify(metadata);
  if (/password|access_token|refresh_token|service_role|cookie|authorization|private_key/i.test(serialized)) {
    throw new Error('Durable recording metadata contains a credential-bearing field or value.');
  }
}

export function buildDurableRecordingMetadata({ metadata, webmFilename, mp4Filename }) {
  const durable = {
    schema_version: 2,
    scenario: metadata.scenario,
    recording_version: metadata.scenario_version,
    timestamp: metadata.created_at,
    source_git_commit: metadata.source_commit,
    environment: 'Demo',
    viewport: metadata.viewport,
    duration_seconds: metadata.duration_seconds,
    pacing: metadata.pacing,
    webm_filename: webmFilename,
    mp4_filename: mp4Filename,
    validation_status: 'passed',
    sensitive_data_check: 'passed',
  };
  assertMetadataSafe(durable);
  return durable;
}

function assertPromotionContract({ scenarioKey, sourceWebmPath, metadata }) {
  if (!SAFE_SCENARIO.test(scenarioKey)) throw new Error(`Unsafe recording scenario key: ${scenarioKey}`);
  if (metadata?.scenario !== scenarioKey) throw new Error('Recording metadata does not match the requested scenario.');
  if (metadata?.environment !== 'ServSync Demo' || metadata?.contains_credentials !== false) {
    throw new Error('Only validated, credential-free ServSync Demo recordings may be promoted.');
  }
  const sourceName = basename(sourceWebmPath);
  if (!sourceName.toLowerCase().endsWith('.webm')) throw new Error('Recording source must be a WebM file.');
  const recordingBase = sourceName.slice(0, -5);
  if (!SAFE_RECORDING_BASENAME.test(recordingBase) || metadata.artifact !== sourceName) {
    throw new Error('Recording filename or metadata artifact identity is invalid.');
  }
  return { sourceName, recordingBase };
}

export async function promoteValidatedRecording({
  scenarioKey,
  sourceWebmPath,
  sourceMetadataPath,
  libraryRoot = recordingLibraryRoot(),
  mediaTools,
  probe = probeMedia,
  convert = convertWebmToMp4,
}) {
  const metadata = JSON.parse(await readFile(sourceMetadataPath, 'utf8'));
  const { sourceName, recordingBase } = assertPromotionContract({ scenarioKey, sourceWebmPath, metadata });
  const sourceInfo = await stat(sourceWebmPath);
  if (!sourceInfo.isFile() || sourceInfo.size <= 0) throw new Error('Validated WebM source is missing or empty.');

  const tools = mediaTools || await resolveMediaTools();
  const scenarioDir = recordingLibraryScenarioDir(scenarioKey, libraryRoot);
  const stagingParent = resolve(libraryRoot);
  await mkdir(stagingParent, { recursive: true, mode: 0o700 });
  const stagingDir = await mkdtemp(join(stagingParent, '.servsync-recording-promotion-'));
  const stagedWebm = join(stagingDir, sourceName);
  const mp4Filename = `${recordingBase}.mp4`;
  const metadataFilename = `${recordingBase}.json`;
  const stagedMp4 = join(stagingDir, mp4Filename);
  const stagedMetadata = join(stagingDir, metadataFilename);
  const promotedPaths = [];

  try {
    await copyFile(sourceWebmPath, stagedWebm);
    const webmProbe = probe(stagedWebm, tools.ffprobe);
    if (webmProbe.width !== metadata.viewport?.width || webmProbe.height !== metadata.viewport?.height) {
      throw new Error('Validated WebM dimensions do not match recorder metadata.');
    }
    if (Math.abs(webmProbe.durationSeconds - Number(metadata.duration_seconds)) > 0.75) {
      throw new Error('Validated WebM duration does not match recorder metadata.');
    }

    convert(stagedWebm, stagedMp4, tools.ffmpeg);
    const mp4Probe = probe(stagedMp4, tools.ffprobe);
    if (mp4Probe.codec !== 'h264') throw new Error(`Distribution MP4 codec is ${mp4Probe.codec || 'unknown'}, not H.264.`);
    if (mp4Probe.width !== webmProbe.width || mp4Probe.height !== webmProbe.height) {
      throw new Error('Distribution MP4 dimensions differ from the WebM source.');
    }
    if (Math.abs(mp4Probe.durationSeconds - webmProbe.durationSeconds) > 0.75) {
      throw new Error('Distribution MP4 duration differs materially from the WebM source.');
    }

    const durableMetadata = buildDurableRecordingMetadata({ metadata, webmFilename: sourceName, mp4Filename });
    await writeFile(stagedMetadata, `${JSON.stringify(durableMetadata, null, 2)}\n`, { mode: 0o600 });
    await mkdir(scenarioDir, { recursive: true, mode: 0o700 });

    const destinations = [
      [stagedWebm, join(scenarioDir, sourceName)],
      [stagedMp4, join(scenarioDir, mp4Filename)],
      [stagedMetadata, join(scenarioDir, metadataFilename)],
    ];
    for (const [staged, destination] of destinations) {
      try {
        await copyFile(staged, destination, constants.COPYFILE_EXCL);
        promotedPaths.push(destination);
      } catch (error) {
        if (error.code === 'EEXIST') throw new Error(`Durable recording already exists: ${basename(destination)}`);
        throw error;
      }
    }

    return {
      libraryRoot: resolve(libraryRoot),
      scenarioDir,
      webmPath: join(scenarioDir, sourceName),
      mp4Path: join(scenarioDir, mp4Filename),
      metadataPath: join(scenarioDir, metadataFilename),
      durationSeconds: durableMetadata.duration_seconds,
      validationStatus: durableMetadata.validation_status,
    };
  } catch (error) {
    await Promise.all(promotedPaths.map((path) => rm(path, { force: true })));
    throw error;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
    const parent = dirname(stagingDir);
    if (parent !== resolve(libraryRoot)) throw new Error('Unexpected recording staging location.');
  }
}
