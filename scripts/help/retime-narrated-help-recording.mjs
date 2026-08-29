#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveMediaTools, probeMedia } from '../demo/recorder/output-library.mjs';
import {
  HELP_NARRATION_DISCLOSURE,
  HELP_NARRATION_MODEL,
  HELP_NARRATION_PROVIDER,
  HELP_NARRATION_VOICE,
  HELP_TUTORIAL_MEDIA_STANDARD,
} from './prepare-narrated-help-recording.mjs';

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const ALIGNMENT_VERSION = 'scene_anchored_v1';

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

function formatVttTime(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(remainder).padStart(3, '0')}`;
}

function secondsFromVtt(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!match) throw new Error(`Invalid WebVTT timestamp: ${value}`);
  return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]) + (Number(match[4]) / 1000);
}

export function parseWebVttCues(value) {
  if (typeof value !== 'string' || !value.startsWith('WEBVTT')) throw new Error('The source narration has no valid WebVTT transcript.');
  const cues = [...value.matchAll(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\n([^\n]+)(?:\n|$)/g)]
    .map(match => ({ start: secondsFromVtt(match[1]), end: secondsFromVtt(match[2]), text: match[3].trim() }));
  if (cues.length < 1 || cues.some(cue => !cue.text || cue.end <= cue.start)) throw new Error('The source narration WebVTT cues are invalid.');
  return cues;
}

export function parseSecondsOption(value, expectedLength, label) {
  const values = String(value || '').split(',').map(item => Number(item.trim()));
  if (values.length !== expectedLength || values.some(item => !Number.isFinite(item) || item < 0)) {
    throw new Error(`${label} requires exactly ${expectedLength} non-negative seconds values.`);
  }
  if (values.some((item, index) => index > 0 && item <= values[index - 1])) {
    throw new Error(`${label} values must be strictly increasing.`);
  }
  return values;
}

export function buildAlignedWebVtt(cues) {
  if (!Array.isArray(cues) || cues.length < 1 || cues.some(cue => !cue.text || cue.end <= cue.start)) {
    throw new Error('Aligned captions require ordered text cues with positive durations.');
  }
  return `WEBVTT\n\n${cues.map(cue => `${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}\n${cue.text}`).join('\n\n')}\n`;
}

function runFfmpeg(ffmpegPath, args, label) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr.trim() || 'ffmpeg failed'}`);
}

function probeAudio(filePath, ffprobePath) {
  const result = spawnSync(ffprobePath, [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name:format=duration', '-of', 'json', filePath,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffprobe could not validate ${basename(filePath)}.`);
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { throw new Error('ffprobe returned invalid narration metadata.'); }
  const durationSeconds = Number(payload.format?.duration);
  if (!payload.streams?.[0] || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('The narration audio has no playable stream.');
  }
  return { codec: payload.streams[0].codec_name, durationSeconds };
}

function detectSilence(filePath, ffmpegPath) {
  const result = spawnSync(ffmpegPath, [
    '-hide_banner', '-nostdin', '-i', filePath,
    '-af', 'silencedetect=noise=-35dB:d=0.18', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Unable to analyze narration pauses.');
  const starts = [...result.stderr.matchAll(/silence_start: ([0-9.]+)/g)].map(match => Number(match[1]));
  const ends = [...result.stderr.matchAll(/silence_end: ([0-9.]+)/g)].map(match => Number(match[1]));
  if (starts.length !== ends.length) throw new Error('Narration pause analysis returned incomplete results.');
  return starts.map((start, index) => ({ start, end: ends[index] }));
}

export function buildSceneAlignment({ cues, sourceBoundaries, cueStarts, silences, audioDurationSeconds, videoDurationSeconds }) {
  if (sourceBoundaries.length !== cues.length - 1 || cueStarts.length !== cues.length) {
    throw new Error('Scene alignment must provide one start per cue and one fewer source boundary.');
  }
  const matchedSilences = sourceBoundaries.map(boundary => {
    const silence = silences.find(item => boundary >= item.start && boundary <= item.end);
    if (!silence) throw new Error(`Source boundary ${boundary.toFixed(3)} does not fall inside a detected narration pause.`);
    return silence;
  });
  const segmentStarts = [0, ...sourceBoundaries];
  const segmentEnds = [...sourceBoundaries, audioDurationSeconds];
  const speechStarts = [
    silences.find(item => item.start <= 0.01)?.end ?? 0,
    ...matchedSilences.map(item => item.end),
  ];
  const trailingSilence = [...silences].reverse().find(item => Math.abs(item.end - audioDurationSeconds) <= 0.05);
  const speechEnds = [
    ...matchedSilences.map(item => item.start),
    trailingSilence?.start ?? audioDurationSeconds,
  ];
  const segments = cues.map((cue, index) => {
    const speechDuration = speechEnds[index] - speechStarts[index];
    const delay = cueStarts[index] - (speechStarts[index] - segmentStarts[index]);
    if (speechDuration < 0.25 || delay < 0) throw new Error(`Cue ${index + 1} cannot be aligned safely.`);
    return {
      text: cue.text,
      sourceStart: segmentStarts[index],
      sourceEnd: segmentEnds[index],
      speechStart: speechStarts[index],
      speechEnd: speechEnds[index],
      outputSegmentStart: delay,
      outputSegmentEnd: delay + (segmentEnds[index] - segmentStarts[index]),
      cueStart: cueStarts[index],
      cueEnd: cueStarts[index] + speechDuration,
    };
  });
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index].outputSegmentStart < segments[index - 1].outputSegmentEnd) {
      throw new Error(`Cue ${index + 1} overlaps the previous aligned narration segment.`);
    }
  }
  const narrationEnd = segments.at(-1).cueEnd;
  if (segments.at(-1).outputSegmentEnd > videoDurationSeconds || videoDurationSeconds - narrationEnd < 1) {
    throw new Error('Aligned narration must preserve at least one second of final visual review.');
  }
  return segments;
}

function requireNarratedSource(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.schema_version !== 2
    || manifest.tutorial_media_standard !== HELP_TUTORIAL_MEDIA_STANDARD
    || manifest.narration_provider !== HELP_NARRATION_PROVIDER
    || manifest.narration_model !== HELP_NARRATION_MODEL
    || manifest.narration_voice !== HELP_NARRATION_VOICE
    || manifest.narration_disclosure !== HELP_NARRATION_DISCLOSURE
    || manifest.narration_provider_request_count !== 1
    || !COMMIT.test(String(manifest.source_git_commit || ''))
    || !SHA256.test(String(manifest.mp4_sha256 || ''))
    || !SHA256.test(String(manifest.poster_sha256 || ''))
    || !SHA256.test(String(manifest.narration_audio_sha256 || ''))
    || !SHA256.test(String(manifest.source_silent_sha256 || ''))) {
    throw new Error('The source is not an approved one-request Cedar Help package.');
  }
  return manifest;
}

function requireSilentSource(manifest, narrated) {
  if (!manifest || manifest.schema_version !== 1
    || manifest.recording_job_id !== narrated.recording_job_id
    || manifest.scenario !== narrated.scenario
    || manifest.source_git_commit !== narrated.source_git_commit
    || manifest.mp4_sha256 !== narrated.source_silent_sha256
    || manifest.validation_status !== 'passed'
    || manifest.sensitive_data_check !== 'passed'
    || manifest.environment !== 'Demo') {
    throw new Error('The silent source does not match the narrated package provenance.');
  }
  return manifest;
}

function parseArgs(argv) {
  const positional = argv.filter(value => !value.startsWith('--'));
  const option = name => argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
  if (positional.length !== 2 || argv.some(value => value.startsWith('--') && !value.startsWith('--source-boundaries=') && !value.startsWith('--cue-starts='))) {
    throw new Error('Usage: npm run help:retime -- <narrated-metadata.json> <silent-metadata.json> --source-boundaries=<seconds,...> --cue-starts=<seconds,...>');
  }
  return { narratedManifestPath: resolve(positional[0]), silentManifestPath: resolve(positional[1]), sourceBoundaries: option('--source-boundaries'), cueStarts: option('--cue-starts') };
}

export async function retimeNarratedHelpRecording(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const narrated = requireNarratedSource(JSON.parse(await readFile(args.narratedManifestPath, 'utf8')));
  const silent = requireSilentSource(JSON.parse(await readFile(args.silentManifestPath, 'utf8')), narrated);
  const sourceCues = parseWebVttCues(narrated.captions_vtt);
  if (sourceCues.map(cue => cue.text).join(' ') !== narrated.narration_script) {
    throw new Error('The source captions no longer match the immutable narration script.');
  }
  const sourceBoundaries = parseSecondsOption(args.sourceBoundaries, sourceCues.length - 1, '--source-boundaries');
  const cueStarts = parseSecondsOption(args.cueStarts, sourceCues.length, '--cue-starts');
  const narratedDir = dirname(args.narratedManifestPath);
  const silentDir = dirname(args.silentManifestPath);
  const sourceAudioPath = join(narratedDir, narrated.narration_audio_filename);
  const silentVideoPath = join(silentDir, silent.mp4_filename);
  const silentPosterPath = join(silentDir, silent.poster_filename);
  const [sourceAudioSha, silentVideoSha, silentPosterSha, sourceManifestSha] = await Promise.all([
    sha256File(sourceAudioPath), sha256File(silentVideoPath), sha256File(silentPosterPath), sha256File(args.narratedManifestPath),
  ]);
  if (sourceAudioSha !== narrated.narration_audio_sha256 || silentVideoSha !== silent.mp4_sha256 || silentPosterSha !== silent.poster_sha256) {
    throw new Error('One or more immutable source files no longer match their checksums.');
  }

  const tools = await resolveMediaTools(env);
  const audioProbe = probeAudio(sourceAudioPath, tools.ffprobe);
  const videoProbe = probeMedia(silentVideoPath, tools.ffprobe);
  const silences = detectSilence(sourceAudioPath, tools.ffmpeg);
  const segments = buildSceneAlignment({
    cues: sourceCues, sourceBoundaries, cueStarts, silences,
    audioDurationSeconds: audioProbe.durationSeconds,
    videoDurationSeconds: videoProbe.durationSeconds,
  });
  const alignedCues = segments.map(segment => ({ text: segment.text, start: segment.cueStart, end: segment.cueEnd }));
  const captionsVtt = buildAlignedWebVtt(alignedCues);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scenarioDir = dirname(narratedDir);
  const destinationDir = join(scenarioDir, timestamp);
  const stagingDir = await mkdtemp(join(scenarioDir, '.retime-'));
  const stem = `servsync-help-${narrated.scenario}-${timestamp}-cedar-scene-synced`;
  const audioFilename = `${stem}.mp3`;
  const mp4Filename = `${stem}.mp4`;
  const posterFilename = `${stem}.png`;
  const captionsFilename = `${stem}.vtt`;
  const metadataFilename = `${stem}.json`;
  const audioPath = join(stagingDir, audioFilename);
  const mp4Path = join(stagingDir, mp4Filename);
  const posterPath = join(stagingDir, posterFilename);
  const captionsPath = join(stagingDir, captionsFilename);
  const metadataPath = join(stagingDir, metadataFilename);

  try {
    const filters = segments.map((segment, index) => (
      `[0:a]atrim=start=${segment.sourceStart.toFixed(6)}:end=${segment.sourceEnd.toFixed(6)},asetpts=PTS-STARTPTS,adelay=${Math.round(segment.outputSegmentStart * 1000)}|${Math.round(segment.outputSegmentStart * 1000)}[s${index}]`
    ));
    filters.push(`${segments.map((_, index) => `[s${index}]`).join('')}amix=inputs=${segments.length}:duration=longest:dropout_transition=0[a]`);
    runFfmpeg(tools.ffmpeg, [
      '-i', sourceAudioPath, '-filter_complex', filters.join(';'), '-map', '[a]', '-c:a', 'libmp3lame', '-b:a', '192k', audioPath,
    ], 'Scene-aligned narration creation');
    runFfmpeg(tools.ffmpeg, [
      '-i', silentVideoPath, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-af', 'apad', '-t', videoProbe.durationSeconds.toFixed(3),
      '-movflags', '+faststart', mp4Path,
    ], 'Scene-aligned narrated MP4 creation');
    await Promise.all([
      copyFile(silentPosterPath, posterPath),
      writeFile(captionsPath, captionsVtt, { mode: 0o600 }),
    ]);
    const alignedAudioProbe = probeAudio(audioPath, tools.ffprobe);
    const narratedProbe = probeMedia(mp4Path, tools.ffprobe);
    const [mp4Sha256, posterSha256, captionsSha256, audioSha256, mp4Info] = await Promise.all([
      sha256File(mp4Path), sha256File(posterPath), sha256File(captionsPath), sha256File(audioPath), stat(mp4Path),
    ]);
    const narrationEndSeconds = alignedCues.at(-1).end;
    const manifest = {
      ...narrated,
      mp4_filename: mp4Filename,
      mp4_size_bytes: mp4Info.size,
      mp4_sha256: mp4Sha256,
      poster_filename: posterFilename,
      poster_sha256: posterSha256,
      duration_seconds: Number(narratedProbe.durationSeconds.toFixed(3)),
      narration_audio_filename: audioFilename,
      narration_audio_sha256: audioSha256,
      narration_audio_duration_seconds: Number(alignedAudioProbe.durationSeconds.toFixed(3)),
      narration_start_seconds: Number(alignedCues[0].start.toFixed(3)),
      narration_end_seconds: Number(narrationEndSeconds.toFixed(3)),
      final_quiet_hold_seconds: Number((videoProbe.durationSeconds - narrationEndSeconds).toFixed(3)),
      narration_provider_request_count: 1,
      narration_alignment_version: ALIGNMENT_VERSION,
      narration_source_boundaries_seconds: sourceBoundaries,
      narration_cue_start_seconds: alignedCues.map(cue => Number(cue.start.toFixed(3))),
      narration_cue_end_seconds: alignedCues.map(cue => Number(cue.end.toFixed(3))),
      narration_source_audio_sha256: sourceAudioSha,
      narration_source_manifest_filename: basename(args.narratedManifestPath),
      narration_source_manifest_sha256: sourceManifestSha,
      captions_filename: captionsFilename,
      captions_sha256: captionsSha256,
      captions_vtt: captionsVtt,
      generated_at: new Date().toISOString(),
    };
    await writeFile(metadataPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await mkdir(dirname(destinationDir), { recursive: true, mode: 0o700 });
    await rename(stagingDir, destinationDir);
    return {
      success: true,
      scenario: narrated.scenario,
      durationSeconds: manifest.duration_seconds,
      narrationStartSeconds: manifest.narration_start_seconds,
      narrationEndSeconds: manifest.narration_end_seconds,
      finalQuietHoldSeconds: manifest.final_quiet_hold_seconds,
      providerRequestCount: 1,
      providerRequestMadeByThisCommand: false,
      alignmentVersion: ALIGNMENT_VERSION,
      mp4: join(destinationDir, mp4Filename),
      audio: join(destinationDir, audioFilename),
      poster: join(destinationDir, posterFilename),
      captions: join(destinationDir, captionsFilename),
      metadata: join(destinationDir, metadataFilename),
      note: 'Review the full scene-aligned MP4 at normal speed and with sound off before any Help Studio attachment or approval.',
    };
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  retimeNarratedHelpRecording()
    .then(summary => console.log(JSON.stringify(summary, null, 2)))
    .catch(error => {
      console.error(JSON.stringify({ success: false, error: error.message, note: 'No provider request was made and no credential was required.' }, null, 2));
      process.exitCode = 1;
    });
}
