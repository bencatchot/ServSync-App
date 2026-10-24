#!/usr/bin/env node
// Local media validation/promotion only. Never runs the stateful Demo scenario,
// creates a Help job, uploads, publishes, or invokes a narration provider.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { resolveMediaTools, probeMedia } from '../demo/recorder/output-library.mjs';
import { HUMAN_PACED_RECORDING_PRESET } from '../demo/recorder/lib.mjs';
import { assertValidatedDemoRecordingMetadata, assertSafeHelpRecordingSpec, runHelpStudioRecording } from './run-help-studio-recording.mjs';
import { narrationScriptFromSpec } from './prepare-narrated-help-recording.mjs';

export const APPROVED_SCRIPT_SHA256 = 'b1a34065c79b80ffefdc59958b2edd9b6bae333464f36713d250941504a4a726';
const hash = value => createHash('sha256').update(value).digest('hex');
const SHA = /^[a-f0-9]{64}$/;

export function validateGuidedHelpSpec(spec) {
  assertSafeHelpRecordingSpec(spec);
  if (spec.scenario !== 'contractor-create-estimate'
    || hash(narrationScriptFromSpec(spec).script) !== APPROVED_SCRIPT_SHA256) {
    throw new Error('The exported Help request must use the exact approved guided-estimate script.');
  }
  return spec;
}

// Call only with an actual exported Help Studio request. This never invents a job
// ID and always selects the existing no-rerecord packaging path.
export async function bindGuidedHelpPackage(specPath, metadataPath, env = process.env) {
  const spec = validateGuidedHelpSpec(JSON.parse(await readFile(resolve(specPath),'utf8')));
  const metadata = JSON.parse(await readFile(resolve(metadataPath),'utf8'));
  assertValidatedDemoRecordingMetadata(metadata,spec);
  if (metadata.recording_variant !== 'guided-first-estimate-readonly'
    || metadata.approved_narration_script_sha256 !== APPROVED_SCRIPT_SHA256
    || metadata.source_business_mutation_attempts !== 0 || metadata.playback?.ended !== true
    || metadata.playback?.error !== null || metadata.playback?.cues !== 15) {
    throw new Error('Validated read-only guided source is required.');
  }
  return runHelpStudioRecording([resolve(specPath),`--validated-demo-metadata=${resolve(metadataPath)}`],env);
}

export function validateGuidedReview(manifest, script, recorderSha) {
  const flattened = script.trim().split(/\n\s*\n/).join(' ');
  const scenes = manifest?.scenes?.filter(scene => scene.text).map(scene => scene.text).join(' ');
  if (manifest?.schema !== 'servsync-local-help-review-v1'
    || manifest.local_review_only !== true || manifest.ingestible_help_package !== false
    || manifest.environment !== 'Demo' || manifest.recorded_origin !== 'http://127.0.0.1:5180'
    || manifest.business_mutation_attempts !== 0
    || manifest.pacing_profile !== HUMAN_PACED_RECORDING_PRESET.profile
    || manifest.recorder_sha256 !== recorderSha
    || !/^[a-f0-9]{40}$/.test(manifest.application_commit ?? '')
    || manifest.source_commit !== manifest.application_commit
    || !SHA.test(manifest.mp4_sha256 ?? '') || !SHA.test(manifest.captions_sha256 ?? '')
    || hash(flattened) !== APPROVED_SCRIPT_SHA256 || scenes !== flattened) {
    throw new Error('Expected the approved read-only guided recording and exact narration script.');
  }
  return flattened;
}

export async function prepareGuidedSource(reviewDirectory, outputDirectory) {
  if (!reviewDirectory || !outputDirectory) throw new Error('Provide review and new output directories.');
  const source = resolve(reviewDirectory), output = resolve(outputDirectory);
  const rawManifest = await readFile(join(source, 'manifest.json'));
  const manifest = JSON.parse(rawManifest);
  const script = await readFile(join(source, 'narration-script.txt'), 'utf8');
  const recorderSha = hash(await readFile(new URL('./record-guided-onboarding-review.mjs', import.meta.url)));
  validateGuidedReview(manifest, script, recorderSha);
  const video = await readFile(join(source, 'guided-first-estimate-review.mp4'));
  const captions = await readFile(join(source, 'captions.vtt'));
  if (hash(video) !== manifest.mp4_sha256 || hash(captions) !== manifest.captions_sha256) throw new Error('Reviewed media checksum mismatch.');
  const tools = await resolveMediaTools();
  const media = probeMedia(join(source, 'guided-first-estimate-review.mp4'), tools.ffprobe);
  if (media.width !== 1440 || media.height !== 900 || Math.abs(media.durationSeconds - manifest.duration_seconds) > 0.05) throw new Error('Reviewed media geometry/duration changed.');
  const audio = JSON.parse(execFileSync(tools.ffprobe, ['-v','error','-select_streams','a','-show_entries','stream=codec_name','-of','json',join(source,'guided-first-estimate-review.mp4')], { encoding:'utf8' }));
  if (audio.streams.length) throw new Error('Expected silent source before separately approved narration.');

  // Independently play the immutable source completely. No app/backend requests.
  const browser = await chromium.launch({ channel:'chromium', headless:true });
  let playback;
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent(`<video muted src="data:video/mp4;base64,${video.toString('base64')}"><track default kind="captions" srclang="en" src="data:text/vtt;base64,${captions.toString('base64')}"></video>`);
    await page.locator('video').evaluate(async element => { element.textTracks[0].mode='showing'; await element.play(); });
    await page.waitForFunction(() => { const v=document.querySelector('video'); return v.ended || v.error; }, null, { timeout:(media.durationSeconds + 30) * 1000 });
    playback = await page.locator('video').evaluate(v => ({ ended:v.ended,error:v.error?.message ?? null,duration:v.duration,cues:v.textTracks[0]?.cues.length }));
    if (!playback.ended || playback.error || playback.cues !== 15) throw new Error('Full source playback/caption validation failed.');
  } finally { await browser.close(); }

  await mkdir(output, { recursive:false, mode:0o700 });
  const mp4='guided-onboarding.mp4', webm='guided-onboarding.webm';
  await copyFile(join(source,'guided-first-estimate-review.mp4'),join(output,mp4));
  execFileSync(tools.ffmpeg, ['-hide_banner','-loglevel','error','-nostdin','-n','-i',join(output,mp4),'-map','0:v:0','-an','-c:v','libvpx-vp9','-b:v','0','-crf','32',join(output,webm)]);
  const webmMedia=probeMedia(join(output,webm),tools.ffprobe);
  if (webmMedia.width!==media.width || webmMedia.height!==media.height || Math.abs(webmMedia.durationSeconds-media.durationSeconds)>0.75) throw new Error('Converted source media parity failed.');
  const result={
    schema_version:2,scenario:'contractor-create-estimate',recording_variant:'guided-first-estimate-readonly',
    pacing_profile:manifest.pacing_profile,pacing_defaults:HUMAN_PACED_RECORDING_PRESET,
    environment:'Demo',validation_status:'passed',sensitive_data_check:'passed',
    canonical_output_provenance:'validated_servsync_demo_recorder',source_git_commit:manifest.application_commit,
    duration_seconds:media.durationSeconds,viewport:{width:media.width,height:media.height},
    mp4_filename:mp4,mp4_sha256:hash(video),webm_filename:webm,webm_sha256:hash(await readFile(join(output,webm))),
    source_review_manifest_sha256:hash(rawManifest),source_recorder_sha256:recorderSha,
    approved_narration_script_sha256:APPROVED_SCRIPT_SHA256,source_business_mutation_attempts:0,
    preparation_network:'All browser network blocked; no app, auth or database calls.',playback,
    help_job_bound:false,provider_requests:0,uploaded:false,published:false,
  };
  assertValidatedDemoRecordingMetadata(result,{scenario:'contractor-create-estimate'});
  await writeFile(join(output,'guided-onboarding-source.json'),JSON.stringify(result,null,2)+'\n');
  return {success:true,metadata:join(output,'guided-onboarding-source.json'),duration:media.durationSeconds,providerRequests:0,jobBound:false};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);
  const operation=args[0]==='--bind' ? bindGuidedHelpPackage(...args.slice(1)) : prepareGuidedSource(...args);
  operation.then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
