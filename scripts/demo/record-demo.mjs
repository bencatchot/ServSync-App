#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runDemoCommand } from './seed-demo-scenario.mjs';
import { contractorCreateEstimateScenario } from './recorder/scenarios/contractor-create-estimate.mjs';
import { homeownerHomeHistoryScenario } from './recorder/scenarios/homeowner-home-history.mjs';
import { homeownerServiceRequestScenario } from './recorder/scenarios/homeowner-service-request.mjs';
import { servsyncPlatformIntroductionScenario } from './recorder/scenarios/servsync-platform-introduction.mjs';
import { recordServsyncPlatformIntroduction } from './recorder/flagship-introduction.mjs';
import {
  assertRecordingDuration,
  assertSafeRecorderEnvironment,
  buildArtifactMetadata,
  cursorInterpolation,
  addDemoPresentationOptIn,
  loadKnownLocalEnv,
  pacingFor,
  parseRecorderArgs,
  scanVisibleTextForSensitiveData,
  validateScenarioDefinition,
} from './recorder/lib.mjs';
import { promoteValidatedRecording } from './recorder/output-library.mjs';

const scenarios = new Map([
  [homeownerServiceRequestScenario.key, homeownerServiceRequestScenario],
  [contractorCreateEstimateScenario.key, contractorCreateEstimateScenario],
  [homeownerHomeHistoryScenario.key, homeownerHomeHistoryScenario],
  [servsyncPlatformIntroductionScenario.key, servsyncPlatformIntroductionScenario],
]);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Demo recorder requires ${name}.`);
  return value;
}

function pageUrl(appUrl, role, bypassSecret = '') {
  const url = addDemoPresentationOptIn(appUrl);
  if (bypassSecret) {
    url.searchParams.set('x-vercel-protection-bypass', bypassSecret);
    url.searchParams.set('x-vercel-set-bypass-cookie', 'true');
  }
  url.hash = `/${role}`;
  return url.toString();
}

async function login(page, appUrl, role, credentials, bypassSecret = '') {
  await page.goto(pageUrl(appUrl, role, bypassSecret), { waitUntil: 'domcontentloaded' });
  const main = page.getByRole('main');
  await main.getByRole('heading', { name: /^Sign in$/i }).waitFor({ state: 'visible', timeout: 30_000 });
  await main.getByLabel(/^Email$/i).fill(credentials.email);
  await main.getByLabel(/^Password$/i).fill(credentials.password);
  await main.getByRole('button', { name: /^Sign in$/i }).click();
  if (role === 'contractor') {
    await page.getByTitle(/^Sign out$/i).waitFor({ state: 'visible', timeout: 30_000 });
  } else {
    await page.getByRole('button', { name: /^Properties$/i }).waitFor({ state: 'visible', timeout: 30_000 });
  }
}

async function openSidebar(page, name) {
  await page.getByRole('button', { name }).first().click();
  await page.getByRole('main').waitFor({ state: 'visible' });
}

function fieldControl(page, label, selector) {
  return page.getByRole('main').locator('label').filter({ hasText: label }).locator(selector).first();
}

async function installRecorderOverlays(page) {
  await page.addStyleTag({ content: `
    #servsync-recorder-caption { position: fixed; left: 50%; bottom: 28px; z-index: 2147483646; transform: translateX(-50%); max-width: min(720px, calc(100vw - 48px)); padding: 11px 18px; border-radius: 8px; background: rgba(15, 23, 42, .9); color: #fff; font: 600 20px/1.35 ui-sans-serif, system-ui, sans-serif; text-align: center; box-shadow: 0 8px 28px rgba(15, 23, 42, .24); }
    #servsync-recorder-cursor { position: fixed; z-index: 2147483647; width: 17px; height: 17px; pointer-events: none; transform: translate(-2px, -2px) rotate(-18deg); filter: drop-shadow(0 2px 2px rgba(15,23,42,.35)); }
    #servsync-recorder-cursor::before { content: ''; position: absolute; width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 18px solid #fff; transform: rotate(-42deg); transform-origin: 50% 70%; }
    #servsync-recorder-cursor::after { content: ''; position: absolute; left: 2px; top: 2px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 14px solid #0f172a; transform: rotate(-42deg); transform-origin: 50% 70%; }
    #servsync-recorder-freeze { position: fixed; inset: 0; z-index: 2147483645; width: 100vw; height: 100vh; object-fit: cover; pointer-events: none; }
  ` });
  await page.evaluate(() => {
    const caption = document.createElement('div');
    caption.id = 'servsync-recorder-caption';
    caption.hidden = true;
    const cursor = document.createElement('div');
    cursor.id = 'servsync-recorder-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.style.left = `${window.innerWidth * 0.76}px`;
    cursor.style.top = `${window.innerHeight * 0.7}px`;
    document.body.append(caption, cursor);
    document.addEventListener('mousemove', (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    }, true);
  });
}

async function setCaption(page, text) {
  await page.evaluate((captionText) => {
    const caption = document.getElementById('servsync-recorder-caption');
    if (!caption) return;
    caption.textContent = captionText;
    caption.hidden = !captionText;
  }, text);
}

const pointerPositions = new WeakMap();

async function moveCursorHuman(page, x, y, pacing) {
  const viewport = page.viewportSize();
  const start = pointerPositions.get(page) || {
    x: (viewport?.width || 1440) * 0.76,
    y: (viewport?.height || 900) * 0.7,
  };
  const interpolation = cursorInterpolation(start, { x, y }, pacing);
  for (const point of interpolation.points) {
    await page.mouse.move(point.x, point.y);
    await wait(interpolation.stepDelay);
  }
  pointerPositions.set(page, { x, y });
}

async function moveAndClick(page, locator, pacing) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Recorder action target has no visible bounding box.');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await moveCursorHuman(page, x, y, pacing);
  await wait(pacing.settleBeforeClick);
  await page.mouse.click(x, y);
  await wait(pacing.postClick);
}

async function moveAndType(page, locator, value, pacing) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Recorder text target has no visible bounding box.');
  const x = box.x + Math.min(box.width * 0.35, 220);
  const y = box.y + box.height / 2;
  await moveCursorHuman(page, x, y, pacing);
  await wait(pacing.settleBeforeClick);
  await page.mouse.click(x, y);
  await locator.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await locator.press('Backspace');
  await locator.pressSequentially(value, { delay: pacing.typing });
  await wait(pacing.postClick);
}

async function moveCursorToRest(page, pacing) {
  const viewport = page.viewportSize() || { width: 1440, height: 900 };
  await moveCursorHuman(page, viewport.width * 0.88, viewport.height * 0.86, pacing);
}

async function addFreezeFrame(page) {
  const image = await page.screenshot({ type: 'png' });
  await page.evaluate((src) => {
    document.getElementById('servsync-recorder-freeze')?.remove();
    const freeze = document.createElement('img');
    freeze.id = 'servsync-recorder-freeze';
    freeze.alt = '';
    freeze.src = src;
    document.body.append(freeze);
  }, `data:image/png;base64,${image.toString('base64')}`);
}

async function removeFreezeFrame(page) {
  await page.evaluate(() => document.getElementById('servsync-recorder-freeze')?.remove());
}

async function switchToContractorBehindCut(page, credentials, pacing, destination) {
  await addFreezeFrame(page);
  await page.getByTitle(/^Sign out$/i).click();
  await page.waitForFunction(() => window.location.hash === '#/home');
  await page.evaluate(() => {
    window.location.hash = '#/contractor';
  });
  const main = page.getByRole('main');
  await main.getByRole('heading', { name: /^Sign in$/i }).waitFor({ state: 'visible', timeout: 30_000 });
  await main.getByLabel(/^Email$/i).fill(credentials.email);
  await main.getByLabel(/^Password$/i).fill(credentials.password);
  await main.getByRole('button', { name: /^Sign in$/i }).click();
  await page.getByTitle(/^Sign out$/i).waitFor({ state: 'visible', timeout: 30_000 });
  await openSidebar(page, destination);
  await wait(pacing.postClick);
}

async function probeVideoDuration(browser, videoPath) {
  const bytes = await readFile(videoPath);
  const server = createServer((request, response) => {
    if (request.url === '/video.webm') {
      response.writeHead(200, { 'content-type': 'video/webm', 'content-length': bytes.length });
      response.end(bytes);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<video id="video" src="/video.webm" muted></video>');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const address = server.address();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${address.port}`);
    const duration = await page.locator('#video').evaluate((video) => new Promise((resolveDuration, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Video metadata timed out.')), 10_000);
      const resolve = () => { window.clearTimeout(timeout); resolveDuration(video.duration); };
      if (video.readyState >= 1) resolve();
      else video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('Browser could not decode the WebM artifact.')), { once: true });
    }));
    await context.close();
    return Number(duration);
  } finally {
    await new Promise((done) => server.close(done));
  }
}

async function renderFirstPdfPage(pdfPath, outputBasePath) {
  const result = spawnSync('pdftoppm', ['-png', '-f', '1', '-singlefile', '-r', '110', pdfPath, outputBasePath], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Unable to render the downloaded finalized report: ${result.stderr.trim() || 'pdftoppm failed'}`);
  }
  return `${outputBasePath}.png`;
}

function extractPdfText(pdfPath) {
  const result = spawnSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Unable to inspect the downloaded finalized report: ${result.stderr.trim() || 'pdftotext failed'}`);
  }
  return result.stdout;
}

function sourceCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Unable to resolve recorder source commit.');
  return result.stdout.trim();
}

async function recordHomeownerServiceRequest({ scenario, env, outputDir, pacingName, headed }) {
  const pacing = pacingFor(pacingName);
  const target = assertSafeRecorderEnvironment(env, scenario);
  const homeowner = {
    email: required(env, 'DEMO_HOMEOWNER_EMAIL'),
    password: required(env, 'DEMO_HOMEOWNER_PASSWORD'),
  };
  const contractor = {
    email: required(env, 'DEMO_CONTRACTOR_EMAIL'),
    password: required(env, 'DEMO_CONTRACTOR_PASSWORD'),
  };
  required(env, 'DEMO_SUPABASE_ANON_KEY');
  required(env, 'DEMO_SUPABASE_SERVICE_ROLE_KEY');
  env.DEMO_MODE_ENABLED = 'true';
  env.DEMO_SUPABASE_PROJECT_REF = target.projectRef;
  env.DEMO_SUPABASE_URL = target.supabaseUrl;

  const seed = await runDemoCommand(
    ['seed', scenario.fixtureScenarioKey, `--checkpoint=${scenario.initialCheckpoint}`],
    env,
  );
  if (seed.verification?.ok !== true) throw new Error('Demo recorder setup did not reach its verified initial checkpoint.');

  const browser = await chromium.launch({ headless: !headed });
  const errors = [];
  let recordedContext;
  let finalPath = null;
  let completed = false;
  let requestSubmissionStarted = false;
  let requestAdopted = false;
  const stagingDir = resolve(outputDir, '.staging', crypto.randomUUID());
  try {
    const authContext = await browser.newContext({ viewport: scenario.viewport });
    const authPage = await authContext.newPage();
    await login(authPage, target.appUrl, 'homeowner', homeowner, env.DEMO_VERCEL_AUTOMATION_BYPASS_SECRET || '');
    await openSidebar(authPage, /^Service Requests/);
    await authPage.getByRole('heading', { level: 1, name: /^Service Requests$/i }).waitFor({ state: 'visible' });
    await wait(500);
    const initialFrame = await authPage.screenshot({ type: 'png' });
    const storageState = await authContext.storageState();
    await authContext.close();

    await mkdir(outputDir, { recursive: true });
    await mkdir(stagingDir, { recursive: true });
    recordedContext = await browser.newContext({
      viewport: scenario.viewport,
      storageState,
      recordVideo: { dir: stagingDir, size: scenario.viewport },
    });
    await recordedContext.addInitScript((src) => {
      const install = () => {
        document.getElementById('servsync-recorder-freeze')?.remove();
        const freeze = document.createElement('img');
        freeze.id = 'servsync-recorder-freeze';
        freeze.alt = '';
        freeze.src = src;
        freeze.style.cssText = 'position:fixed;inset:0;z-index:2147483645;width:100vw;height:100vh;object-fit:cover;pointer-events:none';
        document.body.append(freeze);
      };
      if (document.body) install();
      else document.addEventListener('DOMContentLoaded', install, { once: true });
    }, `data:image/png;base64,${initialFrame.toString('base64')}`);
    const page = await recordedContext.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error' && !/favicon|ResizeObserver loop/i.test(message.text())) errors.push(`console.error: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 500) errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    });

    await page.goto(pageUrl(target.appUrl, 'homeowner', env.DEMO_VERCEL_AUTOMATION_BYPASS_SECRET || ''), { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Properties$/i }).waitFor({ state: 'visible', timeout: 30_000 });
    await openSidebar(page, /^Service Requests/);
    await installRecorderOverlays(page);
    await setCaption(page, scenario.scenes[0].caption);
    await removeFreezeFrame(page);
    await wait(pacing.initialHold);

    await moveAndClick(page, page.getByRole('button', { name: /^New request$/i }), pacing);
    const propertySelect = fieldControl(page, 'Request for', 'select');
    if (await propertySelect.isVisible().catch(() => false)) {
      const propertyOption = propertySelect.locator('option').filter({ hasText: scenario.property.nickname });
      const propertyValue = await propertyOption.getAttribute('value');
      if (!propertyValue) throw new Error('Recorder could not resolve the exact Demo property in the request composer.');
      await propertySelect.selectOption(propertyValue);
      await moveAndClick(page, page.getByRole('button', { name: /^Continue$/i }).last(), pacing);
    }
    const description = fieldControl(page, 'What do you need help with?', 'textarea');
    await description.waitFor({ state: 'visible' });
    await description.fill(scenario.request.description);
    const categorySelect = page
      .getByRole('main')
      .locator('label')
      .filter({ hasText: 'Who should this go to?' })
      .locator('select');
    await categorySelect.selectOption({ label: scenario.request.category });
    await wait(pacing.typing * 10);
    await moveAndClick(page, page.getByRole('button', { name: /^Continue$/i }).last(), pacing);
    const contractorCard = page
      .getByText(scenario.identities.contractor.label, { exact: true })
      .locator('xpath=ancestor::div[.//button[normalize-space()="Select contractor"]][1]');
    await moveAndClick(page, contractorCard.getByRole('button', { name: /^Select contractor$/i }), pacing);
    await moveAndClick(page, page.getByRole('button', { name: /^Continue$/i }).last(), pacing);
    await fieldControl(page, 'Request title', 'input').fill(scenario.request.title);
    await fieldControl(page, 'Message to contractor', 'textarea').fill(scenario.request.description);
    requestSubmissionStarted = true;
    await moveAndClick(page, page.getByRole('button', { name: /^Send Request$/i }), pacing);
    await page.getByTestId('homeowner-service-request-feedback').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByTestId('homeowner-service-request-card').filter({ hasText: scenario.request.title }).first().waitFor({ state: 'visible' });
    await wait(900);

    const adoption = await runDemoCommand(['adopt-request', scenario.fixtureScenarioKey], env);
    if (adoption.verification?.ok !== true) throw new Error('Recorder-created request did not reach the verified final fixture checkpoint.');
    requestAdopted = true;

    await switchToContractorBehindCut(page, contractor, pacing, scenario.finalState.contractorTab);
    const finalCard = page.getByTestId('contractor-service-request-card').filter({ hasText: scenario.request.title });
    await finalCard.first().waitFor({ state: 'visible', timeout: 30_000 });
    await finalCard.first().scrollIntoViewIfNeeded();
    await setCaption(page, scenario.scenes[1].caption);
    await removeFreezeFrame(page);
    await moveCursorToRest(page, pacing);
    await wait(pacing.finalHold);

    const mainText = await page.getByRole('main').innerText();
    const sensitiveIssues = scanVisibleTextForSensitiveData(mainText, {
      'homeowner email': homeowner.email,
      'contractor email': contractor.email,
      'homeowner password': homeowner.password,
      'contractor password': contractor.password,
    });
    if (sensitiveIssues.length > 0) throw new Error(sensitiveIssues.join(' '));
    const expectedFinalText = [
      scenario.finalState.requestTitle,
      scenario.finalState.homeownerLabel,
      scenario.property.nickname,
      scenario.property.addressLine1,
      scenario.property.city,
      scenario.property.state,
      scenario.property.zipCode,
    ];
    if (expectedFinalText.some((value) => !mainText.includes(value))) {
      throw new Error('Final contractor scene did not show the expected request, homeowner, and Demo home.');
    }
    if (errors.length > 0) throw new Error(`Recording encountered browser errors:\n${errors.join('\n')}`);

    const video = page.video();
    if (!video) throw new Error('Playwright did not initialize WebM recording.');
    await recordedContext.close();
    recordedContext = null;
    const sourcePath = await video.path();
    const createdAt = new Date().toISOString();
    const timestamp = createdAt.replace(/[:.]/g, '-');
    finalPath = resolve(outputDir, `${scenario.outputBaseName}-${timestamp}.webm`);
    await rename(sourcePath, finalPath);
    const fileStat = await stat(finalPath);
    if (fileStat.size <= 0) throw new Error('Recorded WebM artifact is empty.');
    const durationSeconds = await probeVideoDuration(browser, finalPath);
    assertRecordingDuration(durationSeconds, scenario.expectedDurationSeconds);
    const metadata = buildArtifactMetadata({
      scenario,
      sourceCommit: sourceCommit(),
      pacing: pacingName,
      durationSeconds,
      fileName: basename(finalPath),
      createdAt,
    });
    const metadataPath = finalPath.replace(/\.webm$/i, '.json');
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
    completed = true;
    const durable = await promoteValidatedRecording({
      scenarioKey: scenario.key,
      sourceWebmPath: finalPath,
      sourceMetadataPath: metadataPath,
    });

    return {
      success: true,
      scenario: scenario.key,
      environment: scenario.environment.name,
      projectRef: scenario.environment.projectRef,
      artifact: finalPath,
      metadata: metadataPath,
      durableLibrary: durable.libraryRoot,
      durableWebm: durable.webmPath,
      durableMp4: durable.mp4Path,
      durableMetadata: durable.metadataPath,
      durablePromotion: durable.validationStatus,
      durationSeconds: metadata.duration_seconds,
      viewport: scenario.viewport,
      finalCheckpoint: scenario.finalCheckpoint,
      fixturePolicy: metadata.fixture_policy,
      sensitiveData: 'none detected',
    };
  } finally {
    if (recordedContext) await recordedContext.close().catch(() => {});
    if (requestSubmissionStarted && !requestAdopted) {
      await runDemoCommand(['adopt-request', scenario.fixtureScenarioKey], env).catch(() => {});
    }
    await browser.close();
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    if (!completed && finalPath) await unlink(finalPath).catch(() => {});
  }
}

async function recordContractorCreateEstimate({ scenario, env, outputDir, pacingName, headed }) {
  const pacing = pacingFor(pacingName);
  const target = assertSafeRecorderEnvironment(env, scenario);
  const contractor = {
    email: required(env, 'DEMO_CONTRACTOR_EMAIL'),
    password: required(env, 'DEMO_CONTRACTOR_PASSWORD'),
  };
  required(env, 'DEMO_SUPABASE_ANON_KEY');
  required(env, 'DEMO_SUPABASE_SERVICE_ROLE_KEY');
  env.DEMO_MODE_ENABLED = 'true';
  env.DEMO_SUPABASE_PROJECT_REF = target.projectRef;
  env.DEMO_SUPABASE_URL = target.supabaseUrl;

  const seed = await runDemoCommand(
    ['seed', scenario.fixtureScenarioKey, `--checkpoint=${scenario.initialCheckpoint}`],
    env,
  );
  if (seed.verification?.ok !== true) throw new Error('Demo recorder setup did not reach its verified request_ready checkpoint.');

  const browser = await chromium.launch({ headless: !headed });
  const errors = [];
  let recordedContext;
  let finalPath = null;
  let completed = false;
  let estimateSubmissionStarted = false;
  let estimateAdopted = false;
  const stagingDir = resolve(outputDir, '.staging', crypto.randomUUID());
  try {
    const authContext = await browser.newContext({ viewport: scenario.viewport });
    const authPage = await authContext.newPage();
    await login(authPage, target.appUrl, 'contractor', contractor, env.DEMO_VERCEL_AUTOMATION_BYPASS_SECRET || '');
    await openSidebar(authPage, /^Service Requests/);
    const authCard = authPage.getByTestId('contractor-service-request-card').filter({ hasText: scenario.request.title }).first();
    await authCard.waitFor({ state: 'visible', timeout: 30_000 });
    await authCard.scrollIntoViewIfNeeded();
    await wait(500);
    const initialFrame = await authPage.screenshot({ type: 'png' });
    const storageState = await authContext.storageState();
    await authContext.close();

    await mkdir(outputDir, { recursive: true });
    await mkdir(stagingDir, { recursive: true });
    recordedContext = await browser.newContext({
      viewport: scenario.viewport,
      storageState,
      recordVideo: { dir: stagingDir, size: scenario.viewport },
    });
    await recordedContext.addInitScript((src) => {
      const install = () => {
        document.getElementById('servsync-recorder-freeze')?.remove();
        const freeze = document.createElement('img');
        freeze.id = 'servsync-recorder-freeze';
        freeze.alt = '';
        freeze.src = src;
        freeze.style.cssText = 'position:fixed;inset:0;z-index:2147483645;width:100vw;height:100vh;object-fit:cover;pointer-events:none';
        document.body.append(freeze);
      };
      if (document.body) install();
      else document.addEventListener('DOMContentLoaded', install, { once: true });
    }, `data:image/png;base64,${initialFrame.toString('base64')}`);
    const page = await recordedContext.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error' && !/favicon|ResizeObserver loop/i.test(message.text())) errors.push(`console.error: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 500) errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    });

    await page.goto(pageUrl(target.appUrl, 'contractor', env.DEMO_VERCEL_AUTOMATION_BYPASS_SECRET || ''), { waitUntil: 'domcontentloaded' });
    await page.getByTitle(/^Sign out$/i).waitFor({ state: 'visible', timeout: 30_000 });
    await openSidebar(page, /^Service Requests/);
    const requestCard = page.getByTestId('contractor-service-request-card').filter({ hasText: scenario.request.title }).first();
    await requestCard.waitFor({ state: 'visible', timeout: 30_000 });
    await requestCard.scrollIntoViewIfNeeded();
    await installRecorderOverlays(page);
    await setCaption(page, scenario.scenes[0].caption);
    await removeFreezeFrame(page);
    await wait(pacing.initialHold);

    await moveAndClick(page, requestCard.getByTestId('contractor-create-estimate-from-request'), pacing);
    await page.getByTestId('estimate-start-choice').waitFor({ state: 'visible', timeout: 20_000 });
    await setCaption(page, scenario.scenes[1].caption);
    await wait(650);
    await moveAndClick(
      page,
      page.getByTestId('estimate-start-choice').getByRole('button', { name: /^Build blank estimate/i }),
      pacing,
    );
    await moveAndType(page, page.getByLabel(/^Estimate title$/i), scenario.estimate.title, pacing);
    await moveAndType(page, page.getByLabel(/^Scope of work$/i), scenario.estimate.scope, pacing);
    await moveAndClick(page, page.getByRole('button', { name: /^Add blank line$/i }), pacing);
    await moveAndType(page, page.getByLabel(/^Estimate line item 1 description$/i), scenario.estimate.line.line_title, pacing);
    await moveAndType(page, page.getByLabel(/^Estimate line item 1 unit price$/i), scenario.estimate.unitPrice, pacing);

    estimateSubmissionStarted = true;
    await moveAndClick(page, page.getByRole('button', { name: /^Save estimate draft$/i }), pacing);
    await page.getByTestId('contractor-estimate-save-feedback').waitFor({ state: 'visible', timeout: 30_000 });
    const estimateCard = page.getByTestId('contractor-estimate-card').filter({ hasText: scenario.estimate.title }).first();
    await estimateCard.waitFor({ state: 'visible', timeout: 30_000 });
    await estimateCard.scrollIntoViewIfNeeded();

    const adoption = await runDemoCommand(['adopt-estimate', scenario.fixtureScenarioKey], env);
    if (adoption.verification?.ok !== true) throw new Error('Recorder-created Estimate did not reach the verified estimate_draft checkpoint.');
    estimateAdopted = true;

    await setCaption(page, scenario.scenes[2].caption);
    await moveCursorToRest(page, pacing);
    await wait(pacing.finalHold);
    const mainText = await page.getByRole('main').innerText();
    const sensitiveIssues = scanVisibleTextForSensitiveData(mainText, {
      'contractor email': contractor.email,
      'contractor password': contractor.password,
      'homeowner email': env.DEMO_HOMEOWNER_EMAIL,
      'homeowner password': env.DEMO_HOMEOWNER_PASSWORD,
    });
    if (sensitiveIssues.length > 0) throw new Error(sensitiveIssues.join(' '));
    const expectedFinalText = [
      scenario.finalState.estimateTitle,
      scenario.finalState.homeownerLabel,
      scenario.property.addressLine1,
      scenario.estimate.scope,
      '$1895.00',
    ];
    if (expectedFinalText.some((value) => !mainText.includes(value))) {
      throw new Error('Final contractor scene did not show the expected draft Estimate, customer, property, scope, and total.');
    }
    if (errors.length > 0) throw new Error(`Recording encountered browser errors:\n${errors.join('\n')}`);

    const video = page.video();
    if (!video) throw new Error('Playwright did not initialize WebM recording.');
    await recordedContext.close();
    recordedContext = null;
    const sourcePath = await video.path();
    const createdAt = new Date().toISOString();
    const timestamp = createdAt.replace(/[:.]/g, '-');
    finalPath = resolve(outputDir, `${scenario.outputBaseName}-${timestamp}.webm`);
    await rename(sourcePath, finalPath);
    const fileStat = await stat(finalPath);
    if (fileStat.size <= 0) throw new Error('Recorded WebM artifact is empty.');
    const durationSeconds = await probeVideoDuration(browser, finalPath);
    assertRecordingDuration(durationSeconds, scenario.expectedDurationSeconds);
    const metadata = buildArtifactMetadata({
      scenario,
      sourceCommit: sourceCommit(),
      pacing: pacingName,
      durationSeconds,
      fileName: basename(finalPath),
      createdAt,
    });
    const metadataPath = finalPath.replace(/\.webm$/i, '.json');
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
    completed = true;
    const durable = await promoteValidatedRecording({
      scenarioKey: scenario.key,
      sourceWebmPath: finalPath,
      sourceMetadataPath: metadataPath,
    });

    return {
      success: true,
      scenario: scenario.key,
      environment: scenario.environment.name,
      projectRef: scenario.environment.projectRef,
      artifact: finalPath,
      metadata: metadataPath,
      durableLibrary: durable.libraryRoot,
      durableWebm: durable.webmPath,
      durableMp4: durable.mp4Path,
      durableMetadata: durable.metadataPath,
      durablePromotion: durable.validationStatus,
      durationSeconds: metadata.duration_seconds,
      viewport: scenario.viewport,
      finalCheckpoint: scenario.finalCheckpoint,
      fixturePolicy: metadata.fixture_policy,
      sensitiveData: 'none detected',
    };
  } finally {
    if (recordedContext) await recordedContext.close().catch(() => {});
    if (estimateSubmissionStarted && !estimateAdopted) {
      await runDemoCommand(['adopt-estimate', scenario.fixtureScenarioKey], env).catch(() => {});
    }
    await browser.close();
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    if (!completed && finalPath) await unlink(finalPath).catch(() => {});
  }
}

async function recordHomeownerHomeHistory({ scenario, env, outputDir, pacingName, headed }) {
  const pacing = pacingFor(pacingName);
  const scenePacing = pacing;
  const target = assertSafeRecorderEnvironment(env, scenario);
  const homeowner = {
    email: required(env, 'DEMO_HOMEOWNER_EMAIL'),
    password: required(env, 'DEMO_HOMEOWNER_PASSWORD'),
  };
  const contractor = {
    email: required(env, 'DEMO_CONTRACTOR_EMAIL'),
    password: required(env, 'DEMO_CONTRACTOR_PASSWORD'),
  };
  required(env, 'DEMO_SUPABASE_ANON_KEY');
  required(env, 'DEMO_SUPABASE_SERVICE_ROLE_KEY');
  env.DEMO_MODE_ENABLED = 'true';
  env.DEMO_SUPABASE_PROJECT_REF = target.projectRef;
  env.DEMO_SUPABASE_URL = target.supabaseUrl;

  const seed = await runDemoCommand(
    ['seed', scenario.fixtureScenarioKey, `--checkpoint=${scenario.initialCheckpoint}`],
    env,
  );
  if (seed.verification?.ok !== true) {
    throw new Error('Demo recorder setup did not reach its verified completed-Job checkpoint.');
  }
  const canonicalJobId = seed.records?.jobId;
  if (!canonicalJobId) {
    throw new Error('Demo recorder setup did not return the exact registry-owned Job identity.');
  }

  const browser = await chromium.launch({ headless: !headed });
  const errors = [];
  let recordedContext;
  let finalPath = null;
  let completed = false;
  let reportFinalizationStarted = false;
  let reportAdopted = false;
  const stagingDir = resolve(outputDir, '.staging', crypto.randomUUID());
  try {
    const contractorContext = await browser.newContext({ viewport: scenario.viewport, acceptDownloads: true });
    const contractorPage = await contractorContext.newPage();
    await login(contractorPage, target.appUrl, 'contractor', contractor, env.DEMO_VERCEL_AUTOMATION_BYPASS_SECRET || '');
    await openSidebar(contractorPage, /^Work$/i);
    await contractorPage.getByRole('heading', { level: 1, name: /^Work$/i }).waitFor({ state: 'visible', timeout: 30_000 });
    await contractorPage.getByRole('button', { name: /Completed \/ Closed Jobs/i }).click();
    const completedJobRow = contractorPage.locator(
      `[data-testid="contractor-job-row"][data-record-id="${canonicalJobId}"]`,
    );
    await completedJobRow.waitFor({ state: 'visible', timeout: 30_000 });
    const canonicalJobTitle = await completedJobRow.getAttribute('data-record-title');
    if (!canonicalJobTitle) {
      throw new Error('The exact registry-owned Demo Job is missing its canonical display title.');
    }
    await completedJobRow.getByRole('button', { name: /^View Job$/i }).click();
    await contractorPage.getByTestId('simple-job-report-panel').waitFor({ state: 'visible', timeout: 30_000 });
    contractorPage.once('dialog', (dialog) => dialog.accept());
    reportFinalizationStarted = true;
    await contractorPage.getByTestId('simple-job-finalize-report').click();
    await contractorPage.getByTestId('contractor-report-finalize-feedback').waitFor({ state: 'visible', timeout: 30_000 });
    const adoption = await runDemoCommand(['adopt-report', scenario.fixtureScenarioKey], env);
    if (adoption.verification?.ok !== true) {
      throw new Error('Canonical product report did not reach the verified Home History checkpoint.');
    }
    const canonicalHomeHistoryId = adoption.records?.homeHistoryId;
    if (!canonicalHomeHistoryId) {
      throw new Error('Canonical report adoption did not return the exact Home History row identity.');
    }
    reportAdopted = true;
    await contractorContext.close();

    const authContext = await browser.newContext({ viewport: scenario.viewport });
    const authPage = await authContext.newPage();
    await login(authPage, target.appUrl, 'homeowner', homeowner, env.DEMO_VERCEL_AUTOMATION_BYPASS_SECRET || '');
    await authPage.getByRole('heading', { level: 1, name: /^Dashboard$/i }).waitFor({ state: 'visible', timeout: 30_000 });
    await wait(500);
    const initialFrame = await authPage.screenshot({ type: 'png' });
    const storageState = await authContext.storageState();
    await authContext.close();

    await mkdir(outputDir, { recursive: true });
    await mkdir(stagingDir, { recursive: true });
    recordedContext = await browser.newContext({
      viewport: scenario.viewport,
      storageState,
      acceptDownloads: true,
      recordVideo: { dir: stagingDir, size: scenario.viewport },
    });
    await recordedContext.addInitScript((src) => {
      const install = () => {
        document.getElementById('servsync-recorder-freeze')?.remove();
        const freeze = document.createElement('img');
        freeze.id = 'servsync-recorder-freeze';
        freeze.alt = '';
        freeze.src = src;
        freeze.style.cssText = 'position:fixed;inset:0;z-index:2147483645;width:100vw;height:100vh;object-fit:cover;pointer-events:none';
        document.body.append(freeze);
      };
      if (document.body) install();
      else document.addEventListener('DOMContentLoaded', install, { once: true });
    }, `data:image/png;base64,${initialFrame.toString('base64')}`);
    const warmupPage = await recordedContext.newPage();
    await warmupPage.goto(pageUrl(target.appUrl, 'homeowner', env.DEMO_VERCEL_AUTOMATION_BYPASS_SECRET || ''), {
      waitUntil: 'domcontentloaded',
    });
    await warmupPage.getByRole('button', { name: /^Properties$/i }).waitFor({ state: 'visible', timeout: 30_000 });
    await warmupPage.getByRole('heading', { level: 1, name: /^Dashboard$/i }).waitFor({ state: 'visible', timeout: 30_000 });
    await warmupPage.close();
    const page = await recordedContext.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error' && !/favicon|ResizeObserver loop/i.test(message.text())) {
        errors.push(`console.error: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 500) errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    });

    await page.goto(pageUrl(target.appUrl, 'homeowner', env.DEMO_VERCEL_AUTOMATION_BYPASS_SECRET || ''), {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: /^Properties$/i }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('heading', { level: 1, name: /^Dashboard$/i }).waitFor({ state: 'visible', timeout: 30_000 });
    await installRecorderOverlays(page);
    await setCaption(page, scenario.scenes[0].caption);
    await removeFreezeFrame(page);
    await wait(scenePacing.initialHold);

    await moveAndClick(page, page.getByRole('button', { name: /^Properties$/i }).first(), scenePacing);
    await page.getByRole('heading', { level: 2, name: /^Home \/ Properties$/i }).waitFor({ state: 'visible' });
    const homeCard = page.getByRole('button').filter({ hasText: scenario.property.nickname }).first();
    await moveAndClick(page, homeCard, scenePacing);
    await wait(1400);

    await setCaption(page, scenario.scenes[1].caption);
    await moveAndClick(page, page.getByRole('button', { name: /^Home History$/i }).first(), scenePacing);
    await page.getByRole('heading', { level: 1, name: /^Home History$/i }).waitFor({ state: 'visible' });
    const historyCard = page.locator(
      `[data-testid="home-history-entry-card"][data-record-id="${canonicalHomeHistoryId}"]`,
    );
    await historyCard.waitFor({ state: 'visible', timeout: 30_000 });
    await historyCard.scrollIntoViewIfNeeded();
    const historyText = await historyCard.innerText();
    if (!historyText.includes(scenario.finalState.contractorLabel)) {
      throw new Error('Home History scene did not show the expected fictional contractor lineage.');
    }
    await moveCursorToRest(page, scenePacing);
    await wait(1900);

    await setCaption(page, scenario.scenes[2].caption);
    const reportPath = resolve(stagingDir, 'finalized-report.pdf');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      moveAndClick(page, historyCard.getByRole('button', { name: /^View report$/i }), scenePacing),
    ]);
    await download.saveAs(reportPath);
    const suggestedFileName = download.suggestedFilename();
    const isFriendlyReportName = scenario.finalState.reportFileNamePattern.test(suggestedFileName);
    const isCanonicalStorageName = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i.test(
      suggestedFileName,
    );
    if (!isFriendlyReportName && !isCanonicalStorageName) {
      throw new Error('Downloaded report file name does not match the finalized fixture contract.');
    }
    const reportBytes = await readFile(reportPath);
    if (reportBytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('Downloaded finalized report is not a readable PDF artifact.');
    }
    const reportText = extractPdfText(reportPath);
    const expectedCanonicalText = [
      'Job Report',
      scenario.identities.contractor.label,
      scenario.identities.homeowner.label,
      canonicalJobTitle,
      scenario.property.addressLine1,
    ];
    if (expectedCanonicalText.some((value) => !reportText.includes(value))) {
      throw new Error('Downloaded finalized report does not match the canonical ServSync product-report contract.');
    }
    if (/Fictional demo record|Completed Water Heater Work Report/i.test(reportText)) {
      throw new Error('Downloaded finalized report contains retired fixture-only report content.');
    }
    const reportPngPath = await renderFirstPdfPage(reportPath, resolve(stagingDir, 'finalized-report'));
    const reportPng = await readFile(reportPngPath);
    await page.evaluate((src) => {
      const viewer = document.createElement('main');
      viewer.setAttribute('aria-label', 'Finalized work report preview');
      viewer.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#e2e8f0;padding:24px 24px 86px;overflow:hidden';
      const pageImage = document.createElement('img');
      pageImage.alt = 'ServSync Job Report';
      pageImage.src = src;
      pageImage.style.cssText = 'display:block;max-width:100%;max-height:100%;object-fit:contain;background:white;box-shadow:0 16px 44px rgba(15,23,42,.22)';
      viewer.append(pageImage);
      document.body.replaceChildren(viewer);
      document.body.style.margin = '0';
    }, `data:image/png;base64,${reportPng.toString('base64')}`);
    await installRecorderOverlays(page);
    await setCaption(page, scenario.scenes[2].caption);
    await moveCursorToRest(page, scenePacing);
    await wait(Math.max(scenePacing.finalHold, 5500));

    const visibleText = `${historyText}\n${await page.locator('body').innerText()}\n${reportText}`;
    const sensitiveIssues = scanVisibleTextForSensitiveData(visibleText, {
      'homeowner email': homeowner.email,
      'homeowner password': homeowner.password,
      'contractor email': env.DEMO_CONTRACTOR_EMAIL,
      'contractor password': env.DEMO_CONTRACTOR_PASSWORD,
    });
    if (sensitiveIssues.length > 0) throw new Error(sensitiveIssues.join(' '));
    if (errors.length > 0) throw new Error(`Recording encountered browser errors:\n${errors.join('\n')}`);

    const verification = await runDemoCommand(
      ['verify', scenario.fixtureScenarioKey, `--checkpoint=${scenario.finalCheckpoint}`],
      env,
    );
    if (verification.verification?.ok !== true) {
      throw new Error('Home History fixture changed during the read-only recording.');
    }

    const video = page.video();
    if (!video) throw new Error('Playwright did not initialize WebM recording.');
    await recordedContext.close();
    recordedContext = null;
    const sourcePath = await video.path();
    const createdAt = new Date().toISOString();
    const timestamp = createdAt.replace(/[:.]/g, '-');
    finalPath = resolve(outputDir, `${scenario.outputBaseName}-${timestamp}.webm`);
    await rename(sourcePath, finalPath);
    const fileStat = await stat(finalPath);
    if (fileStat.size <= 0) throw new Error('Recorded WebM artifact is empty.');
    const durationSeconds = await probeVideoDuration(browser, finalPath);
    assertRecordingDuration(durationSeconds, scenario.expectedDurationSeconds);
    const metadata = buildArtifactMetadata({
      scenario,
      sourceCommit: sourceCommit(),
      pacing: pacingName,
      durationSeconds,
      fileName: basename(finalPath),
      createdAt,
    });
    const metadataPath = finalPath.replace(/\.webm$/i, '.json');
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
    completed = true;
    const durable = await promoteValidatedRecording({
      scenarioKey: scenario.key,
      sourceWebmPath: finalPath,
      sourceMetadataPath: metadataPath,
    });

    return {
      success: true,
      scenario: scenario.key,
      environment: scenario.environment.name,
      projectRef: scenario.environment.projectRef,
      artifact: finalPath,
      metadata: metadataPath,
      durableLibrary: durable.libraryRoot,
      durableWebm: durable.webmPath,
      durableMp4: durable.mp4Path,
      durableMetadata: durable.metadataPath,
      durablePromotion: durable.validationStatus,
      durationSeconds: metadata.duration_seconds,
      viewport: scenario.viewport,
      finalCheckpoint: scenario.finalCheckpoint,
      fixturePolicy: metadata.fixture_policy,
      sensitiveData: 'none detected',
    };
  } finally {
    if (recordedContext) await recordedContext.close().catch(() => {});
    if (reportFinalizationStarted && !reportAdopted) {
      await runDemoCommand(['adopt-report', scenario.fixtureScenarioKey], env).catch(() => {});
    }
    await browser.close();
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    if (!completed && finalPath) await unlink(finalPath).catch(() => {});
  }
}

export async function runRecorder(argv = process.argv.slice(2), processEnv = process.env) {
  const env = loadKnownLocalEnv({ ...processEnv });
  const args = parseRecorderArgs(argv);
  const scenario = scenarios.get(args.scenarioKey);
  if (!scenario) throw new Error(`Unsupported Demo recording scenario: ${args.scenarioKey}`);
  validateScenarioDefinition(scenario);
  const outputDir = resolve(args.outputDir || env.DEMO_RECORDING_OUTPUT_DIR || 'demo-recordings');
  if (scenario.key === homeownerServiceRequestScenario.key) {
    return recordHomeownerServiceRequest({ scenario, env, outputDir, pacingName: args.pacing, headed: args.headed });
  }
  if (scenario.key === homeownerHomeHistoryScenario.key) {
    return recordHomeownerHomeHistory({ scenario, env, outputDir, pacingName: args.pacing, headed: args.headed });
  }
  if (scenario.key === servsyncPlatformIntroductionScenario.key) {
    return recordServsyncPlatformIntroduction({ scenario, env, outputDir, pacingName: args.pacing, headed: args.headed });
  }
  return recordContractorCreateEstimate({ scenario, env, outputDir, pacingName: args.pacing, headed: args.headed });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRecorder()
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error(JSON.stringify({
        success: false,
        error: error.message,
        note: 'No credential values were logged. A failed run is not a successful recording artifact.',
      }, null, 2));
      process.exitCode = 1;
    });
}
