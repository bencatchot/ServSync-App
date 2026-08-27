#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveMediaTools, probeMedia } from '../demo/recorder/output-library.mjs';
import { assertSafeHelpRecordingSpec } from './run-help-studio-recording.mjs';

export const HELP_NARRATION_PROVIDER = 'OpenAI';
export const HELP_NARRATION_MODEL = 'gpt-4o-mini-tts';
export const HELP_NARRATION_VOICE = 'cedar';
export const HELP_NARRATION_DISCLOSURE = "AI-generated voiceover using OpenAI's Cedar voice.";
export const HELP_TUTORIAL_MEDIA_STANDARD = 'narrated_captioned_v1';
export const HELP_NARRATION_OFFSET_SECONDS = 0.75;
export const HELP_NARRATION_INSTRUCTIONS = 'Speak naturally, like a knowledgeable small-business owner calmly showing someone how the software works. Conversational and understated. Warm but not promotional. Moderate natural pace with small pauses between ideas. Avoid announcer-style emphasis. Do not sound like an advertisement.';

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

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

export function narrationScriptFromSpec(spec) {
  if (spec.narration_mode !== 'ai' || !Array.isArray(spec.talking_points)) {
    throw new Error('The Help Studio request must require AI narration and provide talking points.');
  }
  const sentences = spec.talking_points.map(value => String(value).trim()).filter(Boolean);
  if (sentences.length < 1) throw new Error('At least one narration talking point is required.');
  const script = sentences.join(' ');
  if (script.length < 10 || script.length > 5000) throw new Error('The narration script length is outside the supported range.');
  return { script, sentences };
}

export function buildWebVtt(sentences, audioDurationSeconds, offsetSeconds = HELP_NARRATION_OFFSET_SECONDS) {
  if (!Array.isArray(sentences) || sentences.length < 1 || !Number.isFinite(audioDurationSeconds) || audioDurationSeconds <= 0) {
    throw new Error('Caption timing requires narration sentences and a positive audio duration.');
  }
  const weights = sentences.map(sentence => Math.max(1, sentence.trim().split(/\s+/).length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const gap = sentences.length > 1 ? Math.min(0.16, audioDurationSeconds * 0.01) : 0;
  const spokenDuration = audioDurationSeconds - (gap * (sentences.length - 1));
  if (spokenDuration <= 0) throw new Error('Narration is too short to caption safely.');
  let cursor = offsetSeconds;
  const cues = sentences.map((sentence, index) => {
    const start = cursor;
    const duration = index === sentences.length - 1
      ? (offsetSeconds + audioDurationSeconds) - start
      : spokenDuration * (weights[index] / totalWeight);
    const end = start + duration;
    cursor = end + gap;
    return `${formatVttTime(start)} --> ${formatVttTime(end)}\n${sentence}`;
  });
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

export function assertSilentManifest(manifest, spec) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.schema_version !== 1
    || manifest.recording_job_id !== spec.recording_job_id
    || manifest.scenario !== spec.scenario
    || manifest.pacing_profile !== spec.pacing_profile
    || manifest.environment !== 'Demo'
    || manifest.validation_status !== 'passed'
    || manifest.sensitive_data_check !== 'passed'
    || manifest.canonical_output_provenance !== 'validated_servsync_demo_recorder'
    || !COMMIT.test(String(manifest.source_git_commit || ''))
    || !SHA256.test(String(manifest.mp4_sha256 || ''))
    || !SHA256.test(String(manifest.poster_sha256 || ''))) {
    throw new Error('The silent source is not the validated Demo package for this Help Studio request.');
  }
  return manifest;
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
    throw new Error('The Cedar narration has no playable audio stream.');
  }
  return { codec: payload.streams[0].codec_name, durationSeconds };
}

async function requestCedarNarration(script, apiKey, fetchImpl = fetch) {
  if (!apiKey?.trim()) throw new Error('OPENAI_API_KEY is required only while generating the Cedar narration.');
  const response = await fetchImpl('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: HELP_NARRATION_MODEL,
      voice: HELP_NARRATION_VOICE,
      input: script,
      instructions: HELP_NARRATION_INSTRUCTIONS,
      response_format: 'mp3',
    }),
  });
  if (!response.ok) throw new Error(`OpenAI Cedar narration request failed with HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1) throw new Error('OpenAI returned an empty narration file.');
  return bytes;
}

export async function prepareNarratedHelpRecording(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const [silentManifestPathArg, specPathArg] = argv;
  if (!silentManifestPathArg || !specPathArg || argv.length !== 2) {
    throw new Error('Usage: npm run help:narrate -- <silent-metadata.json> <recording-spec.json>');
  }
  const silentManifestPath = resolve(silentManifestPathArg);
  const spec = assertSafeHelpRecordingSpec(JSON.parse(await readFile(resolve(specPathArg), 'utf8')));
  const silentManifest = assertSilentManifest(JSON.parse(await readFile(silentManifestPath, 'utf8')), spec);
  const { script, sentences } = narrationScriptFromSpec(spec);
  const silentVideoPath = join(dirname(silentManifestPath), silentManifest.mp4_filename);
  const silentPosterPath = join(dirname(silentManifestPath), silentManifest.poster_filename);
  const [actualSilentSha, actualPosterSha] = await Promise.all([sha256File(silentVideoPath), sha256File(silentPosterPath)]);
  if (actualSilentSha !== silentManifest.mp4_sha256 || actualPosterSha !== silentManifest.poster_sha256) {
    throw new Error('The silent source media no longer matches its immutable recorder checksums.');
  }

  const tools = await resolveMediaTools(env);
  const sourceProbe = probeMedia(silentVideoPath, tools.ffprobe);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scenarioDir = dirname(dirname(silentManifestPath));
  const destinationDir = join(scenarioDir, timestamp);
  const stagingDir = await mkdtemp(join(scenarioDir, '.narration-'));
  const stem = `servsync-help-${spec.scenario}-${timestamp}-cedar`;
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
    const narrationBytes = await requestCedarNarration(script, env.OPENAI_API_KEY, fetchImpl);
    await writeFile(audioPath, narrationBytes, { mode: 0o600 });
    const audioProbe = probeAudio(audioPath, tools.ffprobe);
    const narrationEndSeconds = HELP_NARRATION_OFFSET_SECONDS + audioProbe.durationSeconds;
    const finalQuietHoldSeconds = sourceProbe.durationSeconds - narrationEndSeconds;
    if (finalQuietHoldSeconds < 1) {
      throw new Error(`Narration does not fit the silent source with a one-second final review hold (${finalQuietHoldSeconds.toFixed(2)} seconds remain).`);
    }

    runFfmpeg(tools.ffmpeg, [
      '-i', silentVideoPath,
      '-itsoffset', String(HELP_NARRATION_OFFSET_SECONDS), '-i', audioPath,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-af', 'apad', '-t', sourceProbe.durationSeconds.toFixed(3),
      '-movflags', '+faststart', mp4Path,
    ], 'Narrated MP4 creation');
    await copyFile(silentPosterPath, posterPath);
    const captionsVtt = buildWebVtt(sentences, audioProbe.durationSeconds);
    await writeFile(captionsPath, captionsVtt, { mode: 0o600 });
    const narratedProbe = probeMedia(mp4Path, tools.ffprobe);
    const [mp4Sha256, posterSha256, captionsSha256, audioSha256, mp4Info] = await Promise.all([
      sha256File(mp4Path), sha256File(posterPath), sha256File(captionsPath), sha256File(audioPath), stat(mp4Path),
    ]);
    const manifest = {
      schema_version: 2,
      recording_job_id: spec.recording_job_id,
      scenario: spec.scenario,
      title: spec.title,
      purpose: spec.purpose,
      pacing_profile: spec.pacing_profile,
      pacing_defaults: silentManifest.pacing_defaults,
      validation_status: 'passed',
      sensitive_data_check: 'passed',
      canonical_output_provenance: 'validated_servsync_demo_recorder',
      source_git_commit: silentManifest.source_git_commit,
      environment: 'Demo',
      viewport: { width: narratedProbe.width, height: narratedProbe.height },
      duration_seconds: Number(narratedProbe.durationSeconds.toFixed(3)),
      mp4_filename: mp4Filename,
      mp4_size_bytes: mp4Info.size,
      mp4_sha256: mp4Sha256,
      poster_filename: posterFilename,
      poster_sha256: posterSha256,
      tutorial_media_standard: HELP_TUTORIAL_MEDIA_STANDARD,
      narration_provider: HELP_NARRATION_PROVIDER,
      narration_model: HELP_NARRATION_MODEL,
      narration_voice: HELP_NARRATION_VOICE,
      narration_disclosure: HELP_NARRATION_DISCLOSURE,
      narration_script: script,
      narration_script_sha256: sha256Text(script),
      narration_instructions: HELP_NARRATION_INSTRUCTIONS,
      narration_audio_filename: audioFilename,
      narration_audio_sha256: audioSha256,
      narration_audio_duration_seconds: Number(audioProbe.durationSeconds.toFixed(3)),
      narration_start_seconds: HELP_NARRATION_OFFSET_SECONDS,
      narration_end_seconds: Number(narrationEndSeconds.toFixed(3)),
      final_quiet_hold_seconds: Number(finalQuietHoldSeconds.toFixed(3)),
      narration_provider_request_count: 1,
      source_silent_sha256: actualSilentSha,
      source_silent_manifest_filename: basename(silentManifestPath),
      captions_filename: captionsFilename,
      captions_sha256: captionsSha256,
      caption_language: 'en',
      captions_vtt: captionsVtt,
      generated_at: new Date().toISOString(),
    };
    await writeFile(metadataPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await mkdir(dirname(destinationDir), { recursive: true, mode: 0o700 });
    await rename(stagingDir, destinationDir);
    return {
      success: true,
      scenario: spec.scenario,
      durationSeconds: manifest.duration_seconds,
      narrationDurationSeconds: manifest.narration_audio_duration_seconds,
      finalQuietHoldSeconds: manifest.final_quiet_hold_seconds,
      mp4: join(destinationDir, mp4Filename),
      poster: join(destinationDir, posterFilename),
      captions: join(destinationDir, captionsFilename),
      metadata: join(destinationDir, metadataFilename),
      sourceSilentSha256: actualSilentSha,
      providerRequestCount: 1,
      note: 'Attach the narrated MP4, poster, English WebVTT captions, and metadata to the matching Help Studio request for review. Do not approve or publish without review.',
    };
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareNarratedHelpRecording()
    .then(summary => console.log(JSON.stringify(summary, null, 2)))
    .catch(error => {
      console.error(JSON.stringify({ success: false, error: error.message, note: 'No credential values were logged or persisted.' }, null, 2));
      process.exitCode = 1;
    });
}
