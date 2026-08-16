import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { probeMedia, resolveMediaTools } from './recorder/output-library.mjs';

const CONFIRMATION = '--confirm=human-paced-1x-review-passed';
const SHA256 = /^[a-f0-9]{64}$/;

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

function assertReviewable(metadata) {
  if (metadata?.schema_version !== 2 || metadata?.environment !== 'Demo') throw new Error('Only a durable ServSync Demo package can be reviewed.');
  if (metadata.validation_status !== 'passed' || metadata.sensitive_data_check !== 'passed') throw new Error('Recording validation and sensitive-data checks must pass first.');
  if (metadata.pacing !== 'marketing' || metadata.pacing_review !== 'pending') throw new Error('Recording is not awaiting a Marketing pacing review.');
  if (!SHA256.test(metadata.webm_sha256 || '') || !SHA256.test(metadata.mp4_sha256 || '')) throw new Error('Recording checksums are missing or invalid.');
  if (!basename(metadata.webm_filename || '').endsWith('.webm') || !basename(metadata.mp4_filename || '').endsWith('.mp4')) throw new Error('Recording filenames are invalid.');
}

export async function approveMarketingRecording(metadataPath, { mediaTools, probe = probeMedia, reviewedAt = new Date().toISOString() } = {}) {
  const resolvedMetadata = resolve(metadataPath);
  const metadata = JSON.parse(await readFile(resolvedMetadata, 'utf8'));
  assertReviewable(metadata);
  const directory = dirname(resolvedMetadata);
  const webmPath = join(directory, metadata.webm_filename);
  const mp4Path = join(directory, metadata.mp4_filename);
  const [webmInfo, mp4Info, webmSha256, mp4Sha256] = await Promise.all([
    stat(webmPath),
    stat(mp4Path),
    sha256File(webmPath),
    sha256File(mp4Path),
  ]);
  if (!webmInfo.isFile() || !mp4Info.isFile() || mp4Info.size !== metadata.mp4_size_bytes) throw new Error('Recording package files do not match durable metadata.');
  if (webmSha256 !== metadata.webm_sha256 || mp4Sha256 !== metadata.mp4_sha256) throw new Error('Recording checksum changed after validation.');
  const tools = mediaTools || await resolveMediaTools();
  const webmProbe = probe(webmPath, tools.ffprobe);
  const mp4Probe = probe(mp4Path, tools.ffprobe);
  if (mp4Probe.codec !== 'h264' || mp4Probe.width !== metadata.width || mp4Probe.height !== metadata.height) throw new Error('Distribution MP4 no longer matches the validated H.264 contract.');
  if (Math.abs(webmProbe.durationSeconds - mp4Probe.durationSeconds) > 0.75 || Math.abs(mp4Probe.durationSeconds - metadata.duration_seconds) > 0.75) throw new Error('Recording duration changed after validation.');

  const approved = {
    ...metadata,
    pacing_review: 'passed',
    pacing_reviewed_at: reviewedAt,
    marketing_candidate_status: 'passed',
    pacing_review_criteria: {
      cursor_followable: true,
      click_intent_visible: true,
      ui_changes_readable: true,
      cursor_speed_acceptable: true,
      cursor_motion_natural: true,
      text_readable: true,
      important_holds_sufficient: true,
      final_result_obvious: true,
    },
  };
  const temporaryPath = `${resolvedMetadata}.reviewing`;
  await writeFile(temporaryPath, `${JSON.stringify(approved, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, resolvedMetadata);
  return { metadataPath: resolvedMetadata, scenario: approved.scenario, pacingReview: approved.pacing_review };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const metadataPath = process.argv[2];
  if (!metadataPath || !process.argv.includes(CONFIRMATION)) {
    console.error(`Usage: npm run demo:approve-marketing -- /absolute/path/recording.json ${CONFIRMATION}`);
    process.exitCode = 1;
  } else {
    approveMarketingRecording(metadataPath)
      .then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(error => {
        console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
        process.exitCode = 1;
      });
  }
}
