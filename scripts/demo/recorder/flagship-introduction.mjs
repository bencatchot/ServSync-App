import { chromium } from '@playwright/test';
import { mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runDemoCommand } from '../seed-demo-scenario.mjs';
import {
  assertRecordingDuration,
  assertSafeRecorderEnvironment,
  addDemoPresentationOptIn,
  buildArtifactMetadata,
  scanVisibleTextForSensitiveData,
} from './lib.mjs';
import { promoteValidatedRecording } from './output-library.mjs';

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Demo recorder requires ${name}.`);
  return value;
}

function pageUrl(appUrl, role, bypassSecret = '') {
  const url = addDemoPresentationOptIn(appUrl);
  url.hash = role === 'contractor' ? '#/contractor' : '#/home';
  if (bypassSecret) {
    url.searchParams.set('x-vercel-protection-bypass', bypassSecret);
    url.searchParams.set('x-vercel-set-bypass-cookie', 'true');
  }
  return url.toString();
}

async function login(page, appUrl, role, credentials, bypassSecret = '') {
  await page.goto(pageUrl(appUrl, role, bypassSecret), { waitUntil: 'domcontentloaded' });
  const main = page.getByRole('main');
  if (!await main.getByRole('heading', { name: /^Sign in$/i }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^Sign in$/i }).first().click();
  }
  await main.getByRole('heading', { name: /^Sign in$/i }).waitFor({ state: 'visible', timeout: 30_000 });
  await main.getByLabel(/^Email$/i).fill(credentials.email);
  await main.getByLabel(/^Password$/i).fill(credentials.password);
  await main.getByRole('button', { name: /^Sign in$/i }).click();
  if (role === 'contractor') await page.getByTitle(/^Sign out$/i).waitFor({ state: 'visible', timeout: 30_000 });
  else await page.getByRole('button', { name: /^Properties$/i }).waitFor({ state: 'visible', timeout: 30_000 });
}

async function openSidebar(page, name) {
  await page.getByRole('button', { name }).first().click();
  await page.getByRole('main').waitFor({ state: 'visible' });
}

function sourceCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Unable to resolve recorder source commit.');
  return result.stdout.trim();
}

function probeVideoDuration(videoPath) {
  const result = spawnSync('/opt/homebrew/bin/ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Unable to probe flagship WebM: ${result.stderr.trim()}`);
  return Number(result.stdout.trim());
}

async function renderFirstPdfPage(pdfPath, outputBasePath) {
  const result = spawnSync('pdftoppm', ['-png', '-f', '1', '-singlefile', '-r', '110', pdfPath, outputBasePath], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Unable to render finalized report: ${result.stderr.trim() || 'pdftoppm failed'}`);
  return `${outputBasePath}.png`;
}

async function screenshot(page, path, credentials, visibleText) {
  const text = await page.locator('body').innerText();
  const issues = scanVisibleTextForSensitiveData(text, credentials);
  if (issues.length > 0) throw new Error(issues.join(' '));
  visibleText.push(text);
  await page.screenshot({ path, type: 'png' });
  return path;
}

async function newAuthenticatedPage(browser, target, role, credentials, viewport, bypassSecret) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  await login(page, target.appUrl, role, credentials, bypassSecret);
  return { context, page };
}

async function captureProductFrames({ browser, scenario, env, target, stagingDir, errors }) {
  const homeowner = { email: required(env, 'DEMO_HOMEOWNER_EMAIL'), password: required(env, 'DEMO_HOMEOWNER_PASSWORD') };
  const contractor = { email: required(env, 'DEMO_CONTRACTOR_EMAIL'), password: required(env, 'DEMO_CONTRACTOR_PASSWORD') };
  const credentials = {
    'homeowner email': homeowner.email,
    'homeowner password': homeowner.password,
    'contractor email': contractor.email,
    'contractor password': contractor.password,
  };
  const bypass = env.DEMO_VERCEL_AUTOMATION_BYPASS_SECRET || '';
  const visibleText = [];
  const frame = (name) => resolve(stagingDir, `${name}.png`);
  const frames = {};

  const trackErrors = (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error' && !/favicon|ResizeObserver loop/i.test(message.text())) errors.push(`console.error: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 500) errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    });
  };

  const discoverySeed = await runDemoCommand(['seed', scenario.fixtureScenarioKey, '--checkpoint=contractor_discovery_ready'], env);
  if (discoverySeed.verification?.ok !== true) throw new Error('Flagship Discover seed did not verify.');
  const discover = await runDemoCommand(['prepare-flagship-discover', scenario.fixtureScenarioKey], env);
  if (discover.records?.postCount !== 5) throw new Error('Flagship Discover requires exactly five registered contractor-created posts.');
  {
    const { context, page } = await newAuthenticatedPage(browser, target, 'homeowner', homeowner, scenario.viewport, bypass);
    trackErrors(page);
    await openSidebar(page, /^Discover$/i);
    await page.getByRole('heading', { level: 1, name: /^Discover$/i }).waitFor({ state: 'visible', timeout: 30_000 });
    const focalCard = page.getByText('A quick water-heater check between service visits', { exact: true }).locator('xpath=ancestor::div[@role="button"][1]');
    await focalCard.waitFor({ state: 'visible', timeout: 30_000 });
    frames.discover = await screenshot(page, frame('discover'), credentials, visibleText);
    await focalCard.getByRole('button', { name: /^View Profile$/i }).click();
    await page.getByText('Gulf Coast Home Services', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
    frames.profile = await screenshot(page, frame('profile'), credentials, visibleText);
    const requestConnection = page.getByRole('button', { name: /Request connection/i }).first();
    await requestConnection.click();
    await page.getByRole('heading', { name: /Share property access with Gulf Coast Home Services/i }).waitFor({ state: 'visible', timeout: 20_000 });
    frames.connection = await screenshot(page, frame('connection'), credentials, visibleText);
    await context.close();
  }

  const requestSeed = await runDemoCommand(['seed', scenario.fixtureScenarioKey, '--checkpoint=request_ready'], env);
  if (requestSeed.verification?.ok !== true) throw new Error('Flagship Service Request seed did not verify.');
  {
    const { context, page } = await newAuthenticatedPage(browser, target, 'homeowner', homeowner, scenario.viewport, bypass);
    trackErrors(page);
    await openSidebar(page, /^Service Requests/i);
    const card = page.getByTestId('homeowner-service-request-card').filter({ hasText: scenario.request.title }).first();
    await card.waitFor({ state: 'visible', timeout: 30_000 });
    await card.scrollIntoViewIfNeeded();
    frames.request = await screenshot(page, frame('service-request'), credentials, visibleText);
    await context.close();
  }

  const estimateSeed = await runDemoCommand(['seed', scenario.fixtureScenarioKey, '--checkpoint=estimate_accepted'], env);
  if (estimateSeed.verification?.ok !== true) throw new Error('Flagship accepted Estimate seed did not verify.');
  {
    const { context, page } = await newAuthenticatedPage(browser, target, 'homeowner', homeowner, scenario.viewport, bypass);
    trackErrors(page);
    await openSidebar(page, /Estimates \/ Invoices/i);
    const accepted = page.getByRole('button').filter({ hasText: /^Accepted Estimates/i }).first();
    if (await accepted.isVisible().catch(() => false)) await accepted.click();
    const card = page.getByTestId('homeowner-estimate-card').filter({ hasText: scenario.estimate.title }).first();
    await card.waitFor({ state: 'visible', timeout: 30_000 });
    const review = card.getByRole('button', { name: /^Review Estimate$/i });
    if (await review.isVisible().catch(() => false)) await review.click();
    await card.scrollIntoViewIfNeeded();
    frames.estimate = await screenshot(page, frame('estimate'), credentials, visibleText);
    await context.close();
  }

  const jobSeed = await runDemoCommand(['seed', scenario.fixtureScenarioKey, '--checkpoint=job_completed'], env);
  if (jobSeed.verification?.ok !== true || !jobSeed.records?.jobId) throw new Error('Flagship completed Job seed did not verify.');
  const jobId = jobSeed.records.jobId;
  let reportAdopted = false;
  let invoiceAdopted = false;
  {
    const { context, page } = await newAuthenticatedPage(browser, target, 'contractor', contractor, scenario.viewport, bypass);
    trackErrors(page);
    await openSidebar(page, /^Work$/i);
    await page.getByRole('button', { name: /Completed \/ Closed Jobs/i }).click();
    const row = page.locator(`[data-testid="contractor-job-row"][data-record-id="${jobId}"]`);
    await row.waitFor({ state: 'visible', timeout: 30_000 });
    await row.getByRole('button', { name: /^View Job$/i }).click();
    await page.getByTestId('simple-job-report-panel').waitFor({ state: 'visible', timeout: 30_000 });
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('simple-job-finalize-report').click();
    await page.getByTestId('contractor-report-finalize-feedback').waitFor({ state: 'visible', timeout: 30_000 });
    frames.job = await screenshot(page, frame('job'), credentials, visibleText);

    const adoption = await runDemoCommand(['create-flagship-invoice', scenario.fixtureScenarioKey], env);
    if (!adoption.records?.invoiceId) throw new Error('Canonical Invoice adoption did not return an Invoice id.');
    invoiceAdopted = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTitle(/^Sign out$/i).waitFor({ state: 'visible', timeout: 30_000 });
    await openSidebar(page, /^Work$/i);
    await page.getByText('Loading contractor workspace...').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    const main = page.getByRole('main');
    const openFinancials = main.getByRole('button').filter({ hasText: /Open Estimates \/ Invoices/i }).first();
    if (await openFinancials.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await openFinancials.click();
    } else {
      await main.getByRole('button', { name: /^Invoices:/i }).click();
    }
    const invoicesTab = main.getByRole('tab', { name: /^Invoices\b/i }).first();
    await invoicesTab.waitFor({ state: 'visible', timeout: 30_000 });
    await invoicesTab.click();
    const invoiceCard = main.locator(`[data-testid="contractor-invoice-card"][data-record-id="${adoption.records.invoiceId}"]`);
    await invoiceCard.waitFor({ state: 'visible', timeout: 30_000 });
    await invoiceCard.scrollIntoViewIfNeeded();
    frames.invoice = await screenshot(page, frame('invoice'), credentials, visibleText);

    const report = await runDemoCommand(['adopt-report', scenario.fixtureScenarioKey], env);
    if (report.verification?.ok !== true || !report.records?.homeHistoryId) throw new Error('Canonical report adoption did not verify.');
    reportAdopted = true;
    frames.homeHistoryId = report.records.homeHistoryId;
    frames.reportFileName = report.records.reportFileName;
    await context.close();
  }

  if (!invoiceAdopted || !reportAdopted) throw new Error('Flagship canonical Invoice/report setup was incomplete.');

  {
    const { context, page } = await newAuthenticatedPage(browser, target, 'homeowner', homeowner, scenario.viewport, bypass);
    trackErrors(page);
    await openSidebar(page, /^Properties$/i);
    const homeCard = page.getByRole('button').filter({ hasText: scenario.property.nickname }).first();
    await homeCard.click();
    await page.getByRole('button', { name: /^Home History$/i }).first().click();
    await page.getByRole('heading', { level: 1, name: /^Home History$/i }).waitFor({ state: 'visible', timeout: 30_000 });
    const historyCard = page.locator(`[data-testid="home-history-entry-card"][data-record-id="${frames.homeHistoryId}"]`);
    await historyCard.waitFor({ state: 'visible', timeout: 30_000 });
    await historyCard.scrollIntoViewIfNeeded();
    frames.history = await screenshot(page, frame('home-history'), credentials, visibleText);
    const reportPath = resolve(stagingDir, 'finalized-report.pdf');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      historyCard.getByRole('button', { name: /^View report$/i }).click(),
    ]);
    await download.saveAs(reportPath);
    const bytes = await readFile(reportPath);
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-' || bytes.byteLength < 1_000 || !frames.reportFileName) {
      throw new Error('Flagship finalized report is not the canonical registered ServSync PDF for the Demo home.');
    }
    frames.report = await renderFirstPdfPage(reportPath, resolve(stagingDir, 'finalized-report'));
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: scenario.viewport });
    const page = await context.newPage();
    trackErrors(page);
    await page.goto(pageUrl(target.appUrl, 'homeowner', bypass), { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /One place for the work around your home/i }).waitFor({ state: 'visible', timeout: 30_000 }).catch(async () => {
      await page.getByRole('main').waitFor({ state: 'visible', timeout: 30_000 });
    });
    frames.signup = await screenshot(page, frame('signup'), credentials, visibleText);
    await context.close();
  }

  return { frames, visibleText: visibleText.join('\n'), credentials };
}

function narrativeSlides(frameData) {
  return [
    { key: 'homeowner-need', type: 'need', duration: 5000, caption: 'Finding the right help can start with a simple question' },
    { key: 'recommendation-list', type: 'recommendations', duration: 6000, caption: 'Then comes a list of names with limited context' },
    { key: 'contractor-side', type: 'contractor', duration: 6000, caption: 'Small contractors are trying to be seen, too' },
    { key: 'servsync-intro', type: 'brand', duration: 4000, caption: 'ServSync is being built for both sides' },
    { key: 'discover', image: frameData.discover, duration: 7000, caption: 'Browse what local contractors are sharing', cursor: [1115, 425] },
    { key: 'profile-connection', image: frameData.profile, duration: 5000, caption: 'Open a real contractor profile', cursor: [1110, 515] },
    { key: 'connection', image: frameData.connection, duration: 3000, caption: 'Choose whether to connect', cursor: [1000, 760] },
    { key: 'service-request', image: frameData.request, duration: 5000, caption: 'A service request ties the need to the home' },
    { key: 'estimate', image: frameData.estimate, duration: 6000, caption: 'Review the scope and approve the estimate' },
    { key: 'job', image: frameData.job, duration: 5000, caption: 'Agreed work moves into the job' },
    { key: 'invoice', image: frameData.invoice, duration: 5000, caption: 'Billing stays with the same customer and work' },
    { key: 'home-history', image: frameData.history, duration: 4000, caption: 'Completed records stay with the home' },
    { key: 'report', image: frameData.report, duration: 5000, caption: 'Reopen the finalized work report later' },
    { key: 'beta', image: frameData.signup, duration: 4000, caption: 'Create a free account and test ServSync during beta' },
  ];
}

async function slideshowHtml(slides) {
  const prepared = [];
  for (const slide of slides) {
    prepared.push({ ...slide, src: slide.image ? `data:image/png;base64,${(await readFile(slide.image)).toString('base64')}` : null });
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#eef2f6;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#111827;letter-spacing:0}
    #stage{position:fixed;inset:0;background:#eef2f6}.slide{position:absolute;inset:0;opacity:0;transition:opacity .32s ease;background:#eef2f6}.slide.active{opacity:1}
    .product{width:100%;height:100%;object-fit:cover}.caption{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);max-width:760px;padding:11px 18px;border-radius:8px;background:rgba(15,23,42,.91);color:white;font-size:20px;font-weight:650;line-height:1.35;text-align:center;box-shadow:0 8px 28px rgba(15,23,42,.24)}
    .cursor{position:absolute;width:18px;height:24px;z-index:3;filter:drop-shadow(0 2px 2px rgba(15,23,42,.35));transition:left 1.1s cubic-bezier(.65,0,.35,1),top 1.1s cubic-bezier(.65,0,.35,1)}.cursor:before{content:'';position:absolute;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:20px solid #0f172a;transform:rotate(-42deg)}.cursor:after{content:'';position:absolute;left:2px;top:2px;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:15px solid white;transform:rotate(-42deg)}
    .story{height:100%;display:flex;align-items:center;justify-content:center;padding:72px 120px 100px;background:#f4f7fa}.story-inner{width:min(1080px,100%)}.eyebrow{font-size:16px;font-weight:750;color:#2563eb;text-transform:uppercase}.headline{font-size:58px;line-height:1.05;margin:14px 0 28px;font-weight:800}.needs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.need{border:1px solid #dbe3ec;background:white;padding:25px;border-radius:7px;font-size:24px;font-weight:700}.question{background:white;border:1px solid #dbe3ec;border-radius:7px;padding:24px;font-size:24px;font-weight:700}.answers{margin-top:15px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.answer{background:white;border:1px solid #dbe3ec;border-radius:7px;padding:16px 20px;font-size:20px}.split{display:grid;grid-template-columns:1fr 1fr;gap:42px;align-items:center}.stack{display:grid;gap:10px}.business{background:white;border:1px solid #dbe3ec;border-radius:7px;padding:14px 18px;font-size:18px;font-weight:700}.brand{height:100%;display:flex;align-items:center;justify-content:center;background:#f8fafc}.brand-name{font-size:92px;font-weight:850;color:#0f172a}.brand-name span{color:#2563eb}.brand-sub{margin-top:12px;font-size:27px;color:#475569;text-align:center}
  </style></head><body><div id="stage"></div><script>
    const slides=${JSON.stringify(prepared)};const stage=document.getElementById('stage');
    function story(type){if(type==='need')return '<div class="story"><div class="story-inner"><div class="eyebrow">A familiar home-service moment</div><div class="headline">Need a contractor?</div><div class="needs"><div class="need">Build a new deck</div><div class="need">Repair an outlet</div><div class="need">Replace a water heater</div></div></div></div>';
      if(type==='recommendations')return '<div class="story"><div class="story-inner"><div class="eyebrow">A generic social-media conversation</div><div class="question">Looking for someone to build a new deck. Any recommendations?</div><div class="answers"><div class="answer">Try Gulf Coast Deck & Fence</div><div class="answer">Call this person</div><div class="answer">Someone gave me this number</div><div class="answer">A neighbor used another company</div></div></div></div>';
      if(type==='contractor')return '<div class="story"><div class="story-inner split"><div><div class="eyebrow">The other side</div><div class="headline" style="font-size:48px">Good work still has to get noticed.</div><p style="font-size:24px;line-height:1.5;color:#475569">Then requests, estimates, jobs, invoices, and records still have to stay organized.</p></div><div class="stack"><div class="business">Deck contractor</div><div class="business">Electrician</div><div class="business">Plumber</div><div class="business">Exterior cleaning</div><div class="business">Landscaping</div></div></div></div>';
      return '<div class="brand"><div><div class="brand-name">Serv<span>Sync</span></div><div class="brand-sub">Home service, connected from the first conversation onward.</div></div></div>';}
    function show(index){const s=slides[index];const el=document.createElement('section');el.className='slide';el.dataset.key=s.key;el.innerHTML=s.src?'<img class="product" src="'+s.src+'">':story(s.type);const cap=document.createElement('div');cap.className='caption';cap.textContent=s.caption;el.append(cap);if(s.cursor){const c=document.createElement('div');c.className='cursor';c.style.left='76%';c.style.top='72%';el.append(c);requestAnimationFrame(()=>requestAnimationFrame(()=>{c.style.left=s.cursor[0]+'px';c.style.top=s.cursor[1]+'px'}));}stage.append(el);requestAnimationFrame(()=>el.classList.add('active'));setTimeout(()=>{el.classList.remove('active');setTimeout(()=>el.remove(),350)},s.duration-330);return s.duration;}
    window.playSlides=async()=>{for(let i=0;i<slides.length;i++){const ms=show(i);await new Promise(r=>setTimeout(r,ms));}window.__servsyncDone=true;};
  </script></body></html>`;
}

export async function recordServsyncPlatformIntroduction({ scenario, env, outputDir, pacingName, headed }) {
  const target = assertSafeRecorderEnvironment(env, scenario);
  required(env, 'DEMO_SUPABASE_ANON_KEY');
  required(env, 'DEMO_SUPABASE_SERVICE_ROLE_KEY');
  env.DEMO_MODE_ENABLED = 'true';
  env.DEMO_SUPABASE_PROJECT_REF = target.projectRef;
  env.DEMO_SUPABASE_URL = target.supabaseUrl;
  const browser = await chromium.launch({ headless: !headed });
  const stagingDir = resolve(outputDir, '.staging', crypto.randomUUID());
  const errors = [];
  let recordedContext;
  let finalPath = null;
  let completed = false;
  try {
    await mkdir(outputDir, { recursive: true });
    await mkdir(stagingDir, { recursive: true });
    const capture = await captureProductFrames({ browser, scenario, env, target, stagingDir, errors });
    const slides = narrativeSlides(capture.frames);
    const html = await slideshowHtml(slides);
    recordedContext = await browser.newContext({ viewport: scenario.viewport, recordVideo: { dir: stagingDir, size: scenario.viewport } });
    const page = await recordedContext.newPage();
    page.on('pageerror', (error) => errors.push(`slideshow pageerror: ${error.message}`));
    await page.setContent(html, { waitUntil: 'load' });
    const video = page.video();
    if (!video) throw new Error('Playwright did not initialize flagship WebM recording.');
    await page.evaluate(() => window.playSlides());
    await page.waitForFunction(() => window.__servsyncDone === true, null, { timeout: 100_000 });
    if (errors.length > 0) throw new Error(`Flagship capture encountered browser errors:\n${errors.join('\n')}`);
    await recordedContext.close();
    recordedContext = null;
    const sourcePath = await video.path();
    const createdAt = new Date().toISOString();
    const timestamp = createdAt.replace(/[:.]/g, '-');
    finalPath = resolve(outputDir, `${scenario.outputBaseName}-${timestamp}.webm`);
    await rename(sourcePath, finalPath);
    if ((await stat(finalPath)).size <= 0) throw new Error('Flagship WebM artifact is empty.');
    const durationSeconds = probeVideoDuration(finalPath);
    assertRecordingDuration(durationSeconds, scenario.expectedDurationSeconds);
    const metadata = {
      ...buildArtifactMetadata({ scenario, sourceCommit: sourceCommit(), pacing: pacingName, durationSeconds, fileName: basename(finalPath), createdAt }),
      edit_model: 'real_demo_ui_checkpoint_captures_with_brand_neutral_narrative_graphics',
      discover_post_count: 5,
      fictional_data_used: true,
      fictional_product_capability_used: false,
      canonical_outputs: ['Discover', 'contractor_profile', 'connection_request', 'service_request', 'estimate', 'job', 'invoice', 'home_history', 'finalized_report', 'signup'],
      scene_timing_ms: slides.map(({ key, duration }) => ({ key, duration })),
    };
    const metadataPath = finalPath.replace(/\.webm$/i, '.json');
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
    const durable = await promoteValidatedRecording({ scenarioKey: scenario.key, sourceWebmPath: finalPath, sourceMetadataPath: metadataPath });
    completed = true;
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
    await browser.close();
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    if (!completed && finalPath) await unlink(finalPath).catch(() => {});
  }
}
