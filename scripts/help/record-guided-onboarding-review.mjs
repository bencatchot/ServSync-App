#!/usr/bin/env node
// Local review only. This deliberately cannot create an ingestible Help Studio job.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HUMAN_PACED_RECORDING_PRESET as pacing, cursorInterpolation } from '../demo/recorder/lib.mjs';
import { resolveMediaTools, probeMedia } from '../demo/recorder/output-library.mjs';

export const approvedOrigin = 'https://servsync-demo-1it47qh03-bencatchots-projects.vercel.app';
export const localOrigin = 'http://127.0.0.1:5180';
const demoOrigin = 'https://bdytwgejqnlblhrnqxkp.supabase.co';
const applicationCommit = '877a74c8d649cfb732483de38eb3367da249bb52';
const readRpcs = new Set([
  'servsync_current_contractor_profile', 'servsync_contractor_connected_homeowners', 'servsync_contractor_service_requests',
  'servsync_contractor_pending_connection_requests', 'servsync_contractor_team', 'servsync_list_local_customer_summaries',
  'servsync_list_local_customer_historical_context', 'servsync_list_archived_local_customers', 'servsync_list_local_customer_claim_invites_v2',
  'servsync_list_price_book_internal_costs', 'servsync_current_contractor_entitlements', 'servsync_current_contractor_durable_draft_entitlement',
  'current_user_can_access_contractor', 'current_user_can_manage_contractor_estimates', 'current_user_can_manage_contractor_billing',
  'current_user_can_write_contractor_jobs', 'servsync_find_help', 'servsync_get_work_draft',
]);

export function requestDecision(rawUrl, method) {
  const url = new URL(rawUrl);
  if (url.hostname === 'vercel.live') return 'toolbar-block';
  if (url.hostname.endsWith('.supabase.co') && url.origin !== demoOrigin) return 'deny';
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return 'read';
  if (method === 'POST' && url.origin === demoOrigin && url.pathname === '/auth/v1/token') return 'login';
  if (method === 'POST' && url.origin === demoOrigin && readRpcs.has(url.pathname.split('/rest/v1/rpc/')[1])) return 'read';
  return 'deny';
}

export function assertReviewEnvironment(env) {
  if (![approvedOrigin, localOrigin].includes(env.ONBOARDING_REVIEW_ORIGIN) || env.ONBOARDING_REVIEW_READONLY !== 'true') throw new Error('Exact approved Demo Preview or local frontend and read-only opt-in required.');
  if (env.VERCEL_AUTOMATION_BYPASS_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.DEMO_SUPABASE_SERVICE_ROLE_KEY) throw new Error('Global bypass or service-role credentials are prohibited.');
  for (const key of ['DEMO_CONTRACTOR_EMAIL', 'DEMO_CONTRACTOR_PASSWORD']) if (!env[key]) throw new Error(`Missing ${key}`);
  if (env.ONBOARDING_REVIEW_ORIGIN === approvedOrigin && !env.ONBOARDING_DEMO_BYPASS) throw new Error('Missing exact-origin Demo bypass');
  if (env.ONBOARDING_REVIEW_ORIGIN === localOrigin && env.ONBOARDING_DEMO_BYPASS) throw new Error('Local recording must not load a bypass credential');
}

function vttTime(seconds) {
  return new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
}

export async function recordReview(outputDirectory, env = process.env) {
  assertReviewEnvironment(env);
  if (!outputDirectory) throw new Error('Provide a new local review output directory.');
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: false, mode: 0o700 });
  const tools = await resolveMediaTools();
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'src', 'server', 'api', 'package.json', 'package-lock.json'], { stdio: 'pipe' });
  const sourceOrigin = env.ONBOARDING_REVIEW_ORIGIN;
  const scenes = [];
  const blocked = [];
  // Full Chromium's new headless mode includes the PDF viewer; headless-shell does not.
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  const installGuard = async context => context.route('**/*', async route => {
    const request = route.request();
    const decision = requestDecision(request.url(), request.method());
    if (decision === 'toolbar-block') return route.abort();
    if (decision === 'deny') { blocked.push(new URL(request.url()).pathname); return route.abort(); }
    return route.continue(env.ONBOARDING_DEMO_BYPASS && new URL(request.url()).origin === approvedOrigin
      ? { headers: { ...request.headers(), 'x-vercel-protection-bypass': env.ONBOARDING_DEMO_BYPASS } }
      : undefined);
  });
  let recordingContext;
  let rawPath;
  let trimStart;
  try {
    // Authentication is excluded from recording; storage state stays in memory.
    const auth = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await installGuard(auth);
    const login = await auth.newPage();
    const identityResponse = login.waitForResponse(response => response.url().startsWith(`${demoOrigin}/auth/v1/token`) && response.request().method() === 'POST');
    await login.goto(`${sourceOrigin}/#/contractor`);
    await login.getByLabel('Email', { exact: true }).fill(env.DEMO_CONTRACTOR_EMAIL);
    await login.getByLabel('Password', { exact: true }).fill(env.DEMO_CONTRACTOR_PASSWORD);
    await login.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const identity = (await (await identityResponse).json()).user;
    if (identity?.email?.toLowerCase() !== env.DEMO_CONTRACTOR_EMAIL.toLowerCase() || identity?.user_metadata?.servsync_demo_owned !== true
      || identity.user_metadata.servsync_demo_scenario !== 'water_heater_core_loop'
      || identity.user_metadata.servsync_demo_role !== 'contractor_owner') throw new Error('Existing dedicated Demo contractor identity was not verified.');
    await expect(login.getByText('Contractor command center', { exact: true })).toBeVisible({ timeout: 30_000 });
    const reopen = login.getByRole('button', { name: 'Open first-estimate guide' });
    if (await reopen.isVisible()) await reopen.click();
    await expect(login.getByRole('heading', { name: 'Build your first estimate' })).toBeVisible();
    recordingContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: await auth.storageState(), recordVideo: { dir: join(output, 'source'), size: { width: 1440, height: 900 } } });
    await installGuard(recordingContext);
    await auth.close();
    const started = Date.now();
    const page = await recordingContext.newPage();
    await page.goto(`${sourceOrigin}/#/contractor`);
    const guide = page.getByRole('region', { name: 'First estimate guide' });
    await expect(guide).toBeVisible();
    await guide.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const cursor = document.createElement('div');
      cursor.id = 'review-cursor';
      cursor.style.cssText = 'position:fixed;z-index:2147483647;width:14px;height:14px;border:2px solid white;border-radius:50%;background:#2563eb;pointer-events:none;box-shadow:0 1px 4px #334155';
      document.body.append(cursor);
      document.addEventListener('mousemove', e => { cursor.style.left = `${e.clientX - 7}px`; cursor.style.top = `${e.clientY - 7}px`; });
    });
    trimStart = (Date.now() - started) / 1000;
    const now = () => (Date.now() - started) / 1000 - trimStart;
    const hold = ms => page.waitForTimeout(ms);
    let pointer = { x: 1100, y: 630 };
    const click = async locator => {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (!box) throw new Error('Recorder target missing');
      const next = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const travel = cursorInterpolation(pointer, next, pacing);
      for (const point of travel.points) { await page.mouse.move(point.x, point.y); await hold(travel.stepDelay); }
      pointer = next;
      await hold(pacing.settleBeforeClick); await locator.click(); await hold(pacing.postClick);
    };
    const scene = (key, text) => { scenes.push({ key, start: now(), text }); console.log(`Recording: ${key}`); };
    scene('entry', 'Start with a sample or your own estimate. Review the business details customers will see. Optional branding can wait.');
    await hold(6500);
    scene('sample', 'Try an isolated sample. These fictional details and example rates cannot contact customers or save business records.');
    await click(page.getByRole('button', { name: 'Try sample estimate' }));
    await page.getByTestId('shared-draft-composer').scrollIntoViewIfNeeded();
    await hold(5500);
    scene('scope', 'Describe the work, then review each quantity and price. The sample uses the same Draft editor as real work.');
    await page.getByLabel('What needs doing?').scrollIntoViewIfNeeded();
    await hold(5500);
    const quantity = page.getByLabel('Draft estimate line item 1 quantity', { exact: true });
    await click(quantity); await quantity.fill('3'); await hold(4500);
    scene('preview', 'Preview the customer estimate. Check the scope and total. Review final tax and terms before separately sending a real Estimate.');
    await click(page.getByRole('button', { name: 'Preview customer estimate' }));
    const preview = page.getByTestId('onboarding-estimate-preview');
    await expect(preview).toContainText('$270.00');
    const pdfBytes = await page.getByRole('link', { name: 'Open customer PDF preview' }).evaluate(async link => Array.from(new Uint8Array(await (await fetch(link.href)).arrayBuffer())));
    const pdf = Buffer.from(pdfBytes);
    expect(pdf.toString()).not.toContain('Invalid Date');
    await writeFile(join(output, 'sample-preview.pdf'), pdf);
    await preview.scrollIntoViewIfNeeded();
    await hold(8500);
    await page.screenshot({ path: join(output, 'sample-preview.png') });
    scene('resume', 'Practice edits survive refresh in this tab. Guide choices stay in this browser. Save Draft is required for real work.');
    await page.reload();
    await expect(quantity).toHaveValue('3');
    await quantity.scrollIntoViewIfNeeded();
    await hold(6500);
    scene('optional', 'Service prices, contacts and teammates can wait. Skip optional setup and reopen the guide whenever you need it.');
    await click(page.getByRole('button', { name: 'Skip optional setup' }));
    await hold(2000);
    await click(page.getByRole('button', { name: 'Open first-estimate guide' }));
    await hold(3000);
    scene('real', 'Start a real estimate opens a fresh Draft. Select the real customer and property when ready. Save before leaving. Sending remains separate.');
    await click(page.getByRole('button', { name: 'Start a real estimate' }));
    await expect(page.getByLabel('What needs doing?')).toHaveValue('');
    await expect(page.getByRole('combobox', { name: 'Customer', exact: true })).toHaveValue('');
    await page.getByLabel('What needs doing?').scrollIntoViewIfNeeded();
    await hold(8500);
    await page.screenshot({ path: join(output, 'fresh-real-draft.png') });
    expect(blocked).toEqual([]);
    scenes.push({ key: 'end', start: now(), text: '' });
    const video = page.video();
    await recordingContext.close(); recordingContext = undefined;
    rawPath = await video.path();
  } finally {
    if (recordingContext) await recordingContext.close();
    await browser.close();
  }
  const mp4 = join(output, 'guided-first-estimate-review.mp4');
  execFileSync(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-ss', String(trimStart), '-i', rawPath, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  const media = probeMedia(mp4, tools.ffprobe);
  const cues = [];
  for (let index = 0; index < scenes.length - 1; index++) {
    const current = scenes[index];
    const words = current.text.split(' ');
    const count = Math.ceil(words.length / 10);
    const span = (scenes[index + 1].start - current.start) / count;
    for (let part = 0; part < count; part++) cues.push(`${vttTime(current.start + span * part)} --> ${vttTime(current.start + span * (part + 1) - 0.1)} line:8% position:50% align:center size:90%\n${words.slice(part * 10, part * 10 + 10).join(' ')}`);
  }
  const captions = `WEBVTT\n\n${cues.join('\n\n')}\n`;
  await writeFile(join(output, 'captions.vtt'), captions);
  await writeFile(join(output, 'narration-script.txt'), scenes.filter(scene => scene.text).map(scene => scene.text).join('\n\n'));
  const hash = value => createHash('sha256').update(value).digest('hex');
  const manifest = {
    schema: 'servsync-local-help-review-v1', local_review_only: true, ingestible_help_package: false,
    source_commit: sourceCommit, application_commit: sourceOrigin === approvedOrigin ? applicationCommit : sourceCommit, recorded_origin: sourceOrigin,
    recorder_sha256: hash(await readFile(new URL(import.meta.url))),
    tutorial: 'TUT-002 addendum candidate', environment: 'Demo', business_mutation_attempts: blocked.length,
    fixture_policy: 'Browser-local synthetic practice; real Draft remains unsaved; no seed/reset/delete.',
    pacing_profile: pacing.profile, narration: 'Silent review; script prepared; no provider request.',
    duration_seconds: media.durationSeconds, width: media.width, height: media.height,
    mp4_sha256: hash(await readFile(mp4)), captions_sha256: hash(captions), pdf_sha256: hash(await readFile(join(output, 'sample-preview.pdf'))), scenes,
    publication: 'Not uploaded or published; no Help recording job created.',
  };
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(output, 'preview.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ServSync guided first estimate — review</title><style>body{font:16px/1.5 system-ui;background:#eef2f6;color:#172334;max-width:1152px;margin:32px auto;padding:16px}video{width:100%;background:#111;border-radius:12px}h1{font-size:26px}a{color:#1459a8}</style><h1>Guided first estimate — TUT-002 review</h1><p>Silent, captioned review draft. Recorded from the verified branch frontend against the Demo backend using fictional practice data. No business records were saved or sent. Not published.</p><video controls preload="metadata" src="data:video/mp4;base64,${(await readFile(mp4)).toString('base64')}"><track default kind="captions" src="data:text/vtt;base64,${Buffer.from(captions).toString('base64')}" srclang="en" label="English"></video><p><a href="narration-script.txt">Narration script</a> · <a href="manifest.json">Recording evidence</a></p><p>Review the sample, customer preview, refresh/resume, optional setup and fresh real Draft. Existing TUT-002 remains published; this package is not a Help Studio ingestion package.</p></html>`);
  console.log(JSON.stringify({ output, duration: media.durationSeconds, businessMutationAttempts: blocked.length, localReviewOnly: true }));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  recordReview(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
