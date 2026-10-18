import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CAPTURE_APP, CAPTURE_API, CAPTURE_VIEWPORT, parseCaptureArgs, installCaptureGuard, assertCaptureRecord,
} from './recorder/capture-only-policy.mjs';

const exec = promisify(execFile);
const hold = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contextOptions = { viewport: CAPTURE_VIEWPORT, deviceScaleFactor: 1, serviceWorkers: 'block', permissions: [], acceptDownloads: false };

function failClosedOnAccessDenial(context) {
  let denied = false;
  context.on('response', response => { if ([401, 403].includes(response.status())) denied = true; });
  return () => { if (denied) throw new Error('Server denied access. Capture stopped; no retry or alternate access route is permitted.'); };
}

async function readyForRole(page, role, timeout) {
  await page.getByRole('main').getByText(role === 'contractor' ? /Contractor command center/i : /Home command center/i).waitFor({ state: 'visible', timeout });
  if (await page.locator('input[type=password]').isVisible()) throw new Error('Sign-in is not complete.');
}

async function waitForLogin(page, role, timeout, assertAccess) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    assertAccess();
    if (page.isClosed()) throw new Error('Sign-in window was closed.');
    if (await page.getByRole('main').getByText(role === 'contractor' ? /Contractor command center/i : /Home command center/i).isVisible()) return;
    await hold(500);
  }
  throw new Error('Secure sign-in handoff expired. No recording was started.');
}

export async function loadSelectedRecord(context, options) {
  const page = await context.newPage();
  const rpcPath = `/rest/v1/rpc/servsync_${options.role}_service_requests`;
  const responsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === CAPTURE_API && url.pathname === rpcPath;
  }, { timeout: 45000 });
  await page.goto(`${CAPTURE_APP}/#/${options.role}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const response = await responsePromise;
  if (!response.ok()) throw new Error('The request query failed. No capture was approved.');
  const record = assertCaptureRecord(await response.json(), options);
  await readyForRole(page, options.role, 45000);
  return { page, record };
}

async function deliberateClick(page, target) {
  await target.waitFor({ state: 'visible', timeout: 15000 });
  await target.scrollIntoViewIfNeeded();
  const rect = await target.boundingBox();
  if (!rect) throw new Error('Expected navigation control is not visible.');
  await page.mouse.move(rect.x + Math.min(rect.width / 2, 180), rect.y + rect.height / 2, { steps: 35 });
  await hold(1000);
  await target.click();
  await hold(1800);
}

export async function navigateToRequest(page, options, { paced = true } = {}) {
  const click = target => paced ? deliberateClick(page, target) : target.click();
  const requestsTab = page.getByRole('button', { name: /^Service Requests(?: \d+)?$/i }).filter({ visible: true }).first();
  if (await requestsTab.isVisible()) await click(requestsTab);
  else {
    // Current contractor dashboard exposes a read-only Requests navigation action.
    const requestsAction = page.getByRole('button', { name: /^Requests(?: \d+)?$/i }).filter({ visible: true }).first();
    if (!await requestsAction.isVisible()) throw new Error('The reviewed Requests navigation was not found; no guessed action was clicked.');
    await click(requestsAction);
  }
  const card = page.locator(`[data-testid="${options.role}-service-request-card"][data-record-id="${options.requestId}"]`);
  if (!await card.isVisible() && options.role === 'contractor') {
    const newRequests = page.getByRole('button', { name: /^New requests\b/i }).filter({ visible: true }).first();
    if (await newRequests.isVisible()) await click(newRequests);
  }
  await card.waitFor({ state: 'visible', timeout: 15000 });
  return card;
}

async function recordMotion(page, options, assertAccess) {
  const card = await navigateToRequest(page, options);
  await hold(3500); assertAccess();
  await deliberateClick(page, card.locator(':scope > button').first());
  const confirmation = card.getByText('Confirmed for both parties.', { exact: true });
  await confirmation.waitFor({ state: 'visible', timeout: 15000 });
  await hold(3500); assertAccess();
  // Actual browser scroll input, recorded continuously by Playwright. No image pans or synthesized frames.
  const bounds = await card.boundingBox();
  await page.mouse.move(Math.min((bounds?.x || 700) + 250, 1300), 650, { steps: 30 });
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 18); await hold(70); }
  await confirmation.scrollIntoViewIfNeeded();
  await hold(7000); assertAccess();
  await page.screenshot({ path: options.posterPath });
}

export async function inspectMotionFile(file, { ffmpeg = 'ffmpeg', ffprobe = 'ffprobe' } = {}) {
  const { stdout } = await exec(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size', '-show_entries', 'stream=codec_type,width,height,r_frame_rate', '-of', 'json', file]);
  const probe = JSON.parse(stdout);
  if (probe.streams.some(s => s.codec_type === 'audio')) throw new Error('Unexpected audio stream.');
  const duration = Number(probe.format.duration);
  if (!Number.isFinite(duration) || duration < 5 || duration > 180) throw new Error('Capture duration is outside the expected range.');
  await exec(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-']);
  const frames = await exec(ffmpeg, ['-v', 'error', '-i', file, '-vf', 'fps=4,scale=180:125,format=gray', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', maxBuffer: 30 * 1024 * 1024 });
  const pixels = frames.stdout, size = 180 * 125;
  let changes = 0, maxMeanDifference = 0;
  for (let offset = size; offset + size <= pixels.length; offset += size) {
    let difference = 0;
    for (let p = 0; p < size; p++) difference += Math.abs(pixels[offset + p] - pixels[offset - size + p]);
    const mean = difference / size;
    maxMeanDifference = Math.max(maxMeanDifference, mean);
    if (mean > 0.4) changes++;
  }
  if (changes < 3) throw new Error('Insufficient changing frames; this is not a proven motion capture.');
  return { durationSeconds: duration, bytes: Number(probe.format.size), streams: probe.streams, sampledFrames: Math.floor(pixels.length / size), changedFramePairs: changes, maxMeanDifference, fullDecode: 'passed' };
}

export async function runCapture(options, { onStatus = status => console.log(JSON.stringify(status)) } = {}) {
  // This separate entrypoint deliberately never loads .env, fixture runners, service keys or Safari storage.
  await mkdir(options.outputDir, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(options.outputDir, '.capture-'));
  let browser, loginContext, recordedContext, preflightContext, verifyContext, succeeded = false, stage = 'starting';
  const guards = [];
  const output = join(staging, 'capture.mp4');
  try {
    await exec('ffmpeg', ['-version']); await exec('ffprobe', ['-version']);
    browser = await chromium.launch({ headless: false, timeout: 30000 });
    loginContext = await browser.newContext(contextOptions);
    guards.push(await installCaptureGuard(loginContext, 'login'));
    const assertLoginAccess = failClosedOnAccessDenial(loginContext);
    const loginPage = await loginContext.newPage();
    await loginPage.goto(`${CAPTURE_APP}/#/${options.role}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    stage = 'login';
    onStatus({ status: 'awaiting_user_sign_in', origin: CAPTURE_APP, role: options.role, recording: false, credentialsPersisted: false, timeoutSeconds: options.loginTimeoutMs / 1000 });
    await waitForLogin(loginPage, options.role, options.loginTimeoutMs, assertLoginAccess);
    assertLoginAccess();
    // Only this newly authenticated ephemeral context is transferred in memory. Nothing is written to disk.
    let storageState = await loginContext.storageState();
    await loginContext.close(); loginContext = null;
    stage = 'preflight';
    preflightContext = await browser.newContext({ ...contextOptions, storageState });
    guards.push(await installCaptureGuard(preflightContext));
    const assertPreflightAccess = failClosedOnAccessDenial(preflightContext);
    const before = await loadSelectedRecord(preflightContext, options);
    await navigateToRequest(before.page, options, { paced: false });
    assertPreflightAccess();
    const beforeHash = hash(before.record);
    await preflightContext.close(); preflightContext = null;
    recordedContext = await browser.newContext({ ...contextOptions, storageState, recordVideo: { dir: staging, size: CAPTURE_VIEWPORT } });
    stage = 'recording';
    guards.push(await installCaptureGuard(recordedContext));
    const assertRecordedAccess = failClosedOnAccessDenial(recordedContext);
    const begun = Date.now();
    const active = await loadSelectedRecord(recordedContext, options);
    const trimStart = (Date.now() - begun) / 1000;
    assertRecordedAccess();
    onStatus({ status: 'recording', role: options.role, audio: false, fixtureChanges: false });
    const video = active.page.video();
    await recordMotion(active.page, { ...options, posterPath: join(staging, 'confirmation.png') }, assertRecordedAccess);
    await recordedContext.close(); recordedContext = null;
    const rawPath = await video.path();
    stage = 'verify-record-unchanged';
    verifyContext = await browser.newContext({ ...contextOptions, storageState });
    storageState = null;
    guards.push(await installCaptureGuard(verifyContext));
    const assertVerifyAccess = failClosedOnAccessDenial(verifyContext);
    const after = await loadSelectedRecord(verifyContext, options);
    assertVerifyAccess();
    if (hash(after.record) !== beforeHash) throw new Error('The selected request changed during capture. Candidate withheld.');
    await verifyContext.close(); verifyContext = null;
    stage = 'verify-video';
    await exec('ffmpeg', ['-y', '-v', 'error', '-ss', String(trimStart), '-i', rawPath, '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]);
    const inspection = await inspectMotionFile(output);
    const manifest = {
      version: 1, status: 'captured_for_review', origin: CAPTURE_APP, role: options.role,
      requestId: options.requestId, appointmentId: options.appointmentId,
      requestUnchanged: true, requestSnapshotHash: beforeHash, ...inspection,
      sha256: createHash('sha256').update(await readFile(output)).digest('hex'),
      network: guards, audio: false, persistentSession: false, fixtureOperations: 0,
      playbackReview: 'not performed; file protocol policy restrictions remain in force',
    };
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    await rm(rawPath, { force: true });
    succeeded = true;
    onStatus({ status: 'complete', video: output, manifest: join(staging, 'manifest.json'), inspection });
    return manifest;
  } catch (error) {
    onStatus({ status: 'stopped', stage, timeout: error?.name === 'TimeoutError', accessDenied: guards.some(g => g.serverDenials > 0), network: guards, candidateRetained: false });
    throw error;
  } finally {
    for (const context of [loginContext, preflightContext, recordedContext, verifyContext]) await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (!succeeded) await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCapture(parseCaptureArgs(process.argv.slice(2))).catch(() => {
    // Browser errors can contain headers, URLs or DOM values. Keep raw errors out of operator logs.
    console.error(JSON.stringify({ status: 'stopped', reason: 'Capture did not complete. No successful candidate was retained; no automatic retry. Check the visible sign-in state or reviewed selectors and network policy.', credentialsLogged: false }));
    process.exitCode = 1;
  });
}
