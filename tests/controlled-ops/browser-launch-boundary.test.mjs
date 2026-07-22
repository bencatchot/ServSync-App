import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  PROHIBITED_BROWSER_ENV_NAMES,
  BROWSER_REPORTER_READY_SCHEMA,
  BROWSER_LAUNCH_TOOL_VERSION,
  createBrowserLaunchContract,
  createBrowserEgressGuard,
  writeReporterReady,
} from '../../scripts/controlled-ops/browser-launch-policy.mjs';
import { canonicalStringify, sha256, utcNow } from '../../scripts/controlled-ops/internal.mjs';
import {
  cleanupBrowserEvidence,
  createBrowserEvidenceWorkspace,
  createBrowserWorkspaceLaunchContract,
  importBrowserJournal,
  recordBrowserBookkeeping,
  recordBrowserReporterReady,
} from '../../scripts/controlled-ops/browser-importer.mjs';
import { createJournalWriter } from '../../scripts/controlled-ops/browser-journal.mjs';
import { startBrowserLocalServer } from './fixtures/browser-local-server.mjs';

const repoRoot = resolve('.');
const importerModuleUrl = new URL('../../scripts/controlled-ops/browser-importer.mjs', import.meta.url);

function tempRoot(prefix = 'servsync-browser-boundary-') {
  const root = mkdtempSync(join('/private/tmp', prefix));
  chmodSync(root, 0o700);
  return root;
}

function mkdir700(path) {
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function run(command, args, options) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code, signal) => resolveRun({ code, signal, stdout, stderr }));
  });
}

function writeCompleteJournal(root, { runId = 'browser-run-local', journalAuthSecret = null, allowPrepared = false, status = 'passed' } = {}) {
  const writer = createJournalWriter(root, { allowPrepared, journalAuthSecret });
  writer.append({ record_type: 'browser_run_started', run_id: runId, timestamp: '2026-07-22T16:00:00.000Z' });
  writer.append({ record_type: 'browser_run_completed', run_id: runId, timestamp: '2026-07-22T16:00:01.000Z', status, duration_ms: 1000 });
  writer.close();
  return writer.journalPath;
}

function createSupportedLaunch(workspace) {
  return createBrowserWorkspaceLaunchContract({
    cleanupHandle: workspace.cleanupHandle,
    baseURL: 'http://127.0.0.1:4100',
    runLabel: 'synthetic-form-submit',
  });
}

function writeSupportedJournal(workspace, options = {}) {
  const launch = options.launch ?? createSupportedLaunch(workspace);
  const journalPath = writeCompleteJournal(workspace.journalRoot, {
    allowPrepared: true,
    journalAuthSecret: launch.journalAuthSecret,
    runId: launch.descriptor.run_id,
    status: options.status ?? 'passed',
  });
  return { journalPath, launch };
}

function copyMode600(source, destination) {
  copyFileSync(source, destination);
  chmodSync(destination, 0o600);
  return readFileSync(destination, 'utf8');
}

function assertCleanupProvenanceRejects(handle) {
  assert.throws(() => cleanupBrowserEvidence(handle), (error) => error?.code === 'BROWSER_CLEANUP_PROVENANCE_MISMATCH');
}

function replaceWithNewInode(path, content, mode = 0o600) {
  rmSync(path);
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
}

function httpGet(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolveRequest) => {
    const request = httpRequest(url, { method, headers }, (response) => {
      response.resume();
      response.on('end', () => resolveRequest(response.statusCode));
    });
    request.on('error', () => resolveRequest(0));
    if (body) request.write(body);
    request.end();
  });
}

function httpRaw(baseURL, { method = 'GET', path = '/', headers = {}, body = null } = {}) {
  const parsed = new URL(baseURL);
  return new Promise((resolveRequest) => {
    const request = httpRequest({
      hostname: parsed.hostname,
      port: parsed.port,
      method,
      path,
      headers: { host: parsed.host, ...headers },
    }, (response) => {
      response.resume();
      response.on('end', () => resolveRequest(response.statusCode));
    });
    request.on('error', () => resolveRequest(0));
    if (body) request.write(body);
    request.end();
  });
}

function httpConnect(baseURL) {
  const parsed = new URL(baseURL);
  return new Promise((resolveRequest) => {
    const socket = connect(Number(parsed.port), parsed.hostname, () => {
      socket.write(`CONNECT 127.0.0.1:9 HTTP/1.1\r\nHost: ${parsed.host}\r\n\r\n`);
    });
    let data = '';
    socket.on('data', (chunk) => { data += chunk.toString('utf8'); });
    socket.on('error', () => resolveRequest(0));
    socket.on('end', () => resolveRequest(data.startsWith('HTTP/1.1 405') ? 405 : 0));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolveRequest(0);
    });
  });
}

function openHoldingSocket(baseURL) {
  const parsed = new URL(baseURL);
  return new Promise((resolveSocket, reject) => {
    const socket = connect(Number(parsed.port), parsed.hostname);
    socket.once('connect', () => resolveSocket(socket));
    socket.once('error', reject);
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new Error('socket did not connect before timeout'));
    });
  });
}

function connectionLimitCloses(baseURL) {
  const parsed = new URL(baseURL);
  return new Promise((resolveClosed) => {
    const socket = connect(Number(parsed.port), parsed.hostname);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveClosed(value);
    };
    socket.on('close', () => finish(true));
    socket.on('error', () => finish(true));
    socket.setTimeout(1000, () => finish(false));
  });
}

async function startSentinel() {
  let count = 0;
  const server = createServer((request, response) => {
    count += 1;
    response.writeHead(204);
    response.end();
  });
  server.on('upgrade', (request, socket) => {
    count += 1;
    socket.destroy();
  });
  await new Promise((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveStart());
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/sentinel`,
    count: () => count,
    close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
  };
}

async function runPlaywrightAgainstPage(pageHtml, { extraArgs = [], beforeRun = null } = {}) {
  const root = tempRoot();
  let fixture;
  try {
    const journalRoot = join(root, 'journal');
    const launchRoot = join(root, 'launch');
    const outputRoot = join(root, 'output');
    for (const path of [journalRoot, launchRoot, outputRoot]) mkdir700(path);
    fixture = await startBrowserLocalServer({ page: pageHtml });
    const launch = createBrowserLaunchContract({ root: launchRoot, baseURL: fixture.baseURL, runLabel: 'synthetic-form-submit' });
    const env = {
      ...process.env,
      CONTROLLED_OPS_BROWSER_BASE_URL: fixture.baseURL,
      CONTROLLED_OPS_BROWSER_JOURNAL_ROOT: journalRoot,
      CONTROLLED_OPS_BROWSER_LAUNCH_DESCRIPTOR: launch.descriptorPath,
      CONTROLLED_OPS_BROWSER_LAUNCH_NONCE: launch.nonce,
      CONTROLLED_OPS_BROWSER_OUTPUT_ROOT: outputRoot,
      CONTROLLED_OPS_BROWSER_RUN_LABEL: 'synthetic-form-submit',
    };
    for (const name of PROHIBITED_BROWSER_ENV_NAMES) delete env[name];
    if (beforeRun) beforeRun({ launch, launchRoot, journalRoot, outputRoot });
    const result = await run(join(repoRoot, 'node_modules/.bin/playwright'), ['test', '--config', 'playwright.controlled-ops.config.ts', ...extraArgs], { cwd: repoRoot, env });
    return { ...result, journalExists: existsSync(join(journalRoot, 'browser-journal.ndjson')) };
  } finally {
    if (fixture) await fixture.close();
    rmSync(root, { recursive: true, force: true });
  }
}

test('supported launcher rejects prohibited environment before browser evidence is created', async () => {
  const secretValue = 'synthetic-prohibited-value';
  for (const name of ['TEST_APP_URL', 'VERCEL_AUTOMATION_BYPASS_SECRET', 'SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'BROWSER_CREDENTIAL', 'PLAYWRIGHT_STORAGE_STATE']) {
    const env = { ...process.env, [name]: secretValue };
    const result = await run(process.execPath, ['tests/controlled-ops/browser-pilot/run-pilot.mjs'], { cwd: repoRoot, env });
    assert.notEqual(result.code, 0);
    assert.equal(result.stdout.includes(secretValue), false);
    assert.equal(result.stderr.includes(secretValue), false);
    assert.match(`${result.stdout}\n${result.stderr}`, /PROHIBITED_BROWSER_ENVIRONMENT|prohibited environment/i);
  }
});

test('reporter override cannot produce a successful controlled-ops browser run', async () => {
  const page = '<!doctype html><h1>controlled ops local pilot</h1><form><label for="safe-input">Safe input</label><input id="safe-input"><button>Submit</button></form><output id="result">idle</output><script>document.querySelector("form").addEventListener("submit",(event)=>{event.preventDefault();document.querySelector("#result").textContent="synthetic-success";});</script>';
  const result = await runPlaywrightAgainstPage(page, { extraArgs: ['--reporter=line'] });
  assert.notEqual(result.code, 0);
  assert.equal(result.journalExists, false);
});

test('forged reporter-ready marker cannot unlock page interaction', async () => {
  const page = '<!doctype html><h1>controlled ops local pilot</h1><form><label for="safe-input">Safe input</label><input id="safe-input"><button>Submit</button></form><output id="result">idle</output><script>document.querySelector("form").addEventListener("submit",(event)=>{event.preventDefault();document.querySelector("#result").textContent="synthetic-success";});</script>';
  const result = await runPlaywrightAgainstPage(page, {
    extraArgs: ['--reporter=line'],
    beforeRun: ({ launch }) => {
      writeFileSync(launch.reporterReadyPath, `${canonicalStringify({
        schema_version: BROWSER_REPORTER_READY_SCHEMA,
        tool_version: BROWSER_LAUNCH_TOOL_VERSION,
        created_utc: utcNow(),
        run_id: launch.descriptor.run_id,
        nonce_digest: sha256(launch.nonce),
        pid: 1,
      })}\n`, { mode: 0o600 });
    },
  });
  assert.notEqual(result.code, 0);
  assert.equal(result.journalExists, false);
});

test('browser egress guard blocks browser-controlled channels before disallowed sentinels receive traffic', async () => {
  const cases = [
    ['meta-redirect', (url) => `<meta http-equiv="refresh" content="0; url=${url}">`],
    ['js-navigation', (url) => `<script>setTimeout(() => { location.href = "${url}"; }, 25);</script>`],
    ['image', (url) => `<img src="${url}">`],
    ['script', (url) => `<script src="${url}"></script>`],
    ['iframe', (url) => `<iframe src="${url}"></iframe>`],
    ['fetch', (url) => `<script>fetch("${url}").catch(()=>{});</script>`],
    ['form', (url) => `<form id="external-form" action="${url}" method="post"></form><script>document.querySelector("#external-form").submit();</script>`],
    ['websocket', (url) => `<script>setTimeout(() => { try { new WebSocket("${url.replace('http:', 'ws:')}"); } catch {} }, 50);</script>`],
    ['worker', (url) => `<script>const worker = new Worker(URL.createObjectURL(new Blob(['fetch("${url}").catch(()=>{})'], { type: 'text/javascript' }))); setTimeout(()=>worker.terminate(), 250);</script>`],
  ];
  for (const [name, makeAttack] of cases) {
    const sentinel = await startSentinel();
    try {
      const attack = makeAttack(sentinel.url);
      const page = `<!doctype html><h1>controlled ops local pilot</h1><form><label for="safe-input">Safe input</label><input id="safe-input"><button>Submit</button></form><output id="result">idle</output><script>document.querySelector("form").addEventListener("submit",(event)=>{event.preventDefault();document.querySelector("#result").textContent="synthetic-success";});</script>${attack}`;
      const result = await runPlaywrightAgainstPage(page);
      assert.notEqual(result.code, 0, name);
      assert.equal(sentinel.count(), 0, name);
    } finally {
      await sentinel.close();
    }
  }
});

test('browser cleanup is exact, idempotent, and refuses unsafe paths', () => {
  const root = tempRoot();
  try {
    const workspace = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-cleanup-' });
    const { journalPath } = writeSupportedJournal(workspace);
    importBrowserJournal({ journalPath, summaryPath: workspace.summaryPath, outputRoot: workspace.outputRoot });
    const sentinel = join(root, 'sentinel');
    writeFileSync(sentinel, 'keep', { mode: 0o600 });
    const first = cleanupBrowserEvidence(workspace.cleanupHandle);
    const second = cleanupBrowserEvidence(workspace.cleanupHandle);
    assert.equal(first.status, 'cleaned');
    assert.equal(second.status, 'already_cleaned');
    assert.equal(readFileSync(sentinel, 'utf8'), 'keep');
    assert.throws(() => cleanupBrowserEvidence({ journalRoot: '/' }), /authentic workspace cleanup handle/i);
    assert.throws(() => cleanupBrowserEvidence({ ...workspace.cleanupHandle }), /authentic workspace cleanup handle/i);
    assert.throws(() => cleanupBrowserEvidence(JSON.parse(JSON.stringify(workspace.cleanupHandle))), /authentic workspace cleanup handle/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser cleanup rejects forged handles and preserves arbitrary external targets', () => {
  const root = tempRoot();
  try {
    const externalFile = join(root, 'external-owned-file.txt');
    writeFileSync(externalFile, 'external sentinel', { mode: 0o600 });
    const fileBefore = lstatSync(externalFile);
    assert.throws(() => cleanupBrowserEvidence({ journalPath: externalFile }), /authentic workspace cleanup handle/i);
    const fileAfter = lstatSync(externalFile);
    assert.equal(readFileSync(externalFile, 'utf8'), 'external sentinel');
    assert.equal(fileAfter.ino, fileBefore.ino);
    assert.equal(fileAfter.mode & 0o777, fileBefore.mode & 0o777);
    assert.equal(fileAfter.nlink, fileBefore.nlink);

    const externalDirectory = join(root, 'external-owned-dir');
    mkdir700(externalDirectory);
    const dirBefore = lstatSync(externalDirectory);
    assert.throws(() => cleanupBrowserEvidence({ journalRoot: externalDirectory }), /authentic workspace cleanup handle/i);
    const dirAfter = lstatSync(externalDirectory);
    assert.equal(dirAfter.ino, dirBefore.ino);
    assert.equal(dirAfter.mode & 0o777, dirBefore.mode & 0o777);

    const workspace = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-cross-run-' });
    const otherWorkspace = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-cross-run-' });
    const copied = Object.assign({}, workspace.cleanupHandle);
    assert.throws(() => cleanupBrowserEvidence(copied), /authentic workspace cleanup handle/i);
    assert.equal(existsSync(workspace.root), true);
    cleanupBrowserEvidence(otherWorkspace.cleanupHandle);
    assert.equal(existsSync(workspace.root), true);
    cleanupBrowserEvidence(workspace.cleanupHandle);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser cleanup blocks unknown entries and root replacement before deletion', () => {
  const root = tempRoot();
  try {
    const workspace = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-unknown-' });
    mkdirSync(workspace.outputRoot, { mode: 0o755 });
    chmodSync(workspace.outputRoot, 0o755);
    writeFileSync(join(workspace.outputRoot, '.controlled-ops-forged'), 'unexpected', { mode: 0o600 });
    assert.throws(() => cleanupBrowserEvidence(workspace.cleanupHandle), /unexpected workspace entry/i);

    const replaced = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-replaced-' });
    rmSync(replaced.root, { recursive: true, force: true });
    mkdir700(replaced.root);
    assert.throws(() => cleanupBrowserEvidence(replaced.cleanupHandle), /identity changed|workspace root/i);

    const replacedFile = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-file-replaced-' });
    const journalPath = writeCompleteJournal(replacedFile.journalRoot);
    rmSync(journalPath);
    writeFileSync(journalPath, 'replacement', { mode: 0o600 });
    assert.throws(() => cleanupBrowserEvidence(replacedFile.cleanupHandle), /recognized browser evidence|canonical|invalid|record boundary/i);

    const openJournal = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-open-journal-' });
    const writer = createJournalWriter(openJournal.journalRoot);
    writer.append({ record_type: 'browser_run_started', run_id: 'browser-run-local', timestamp: '2026-07-22T16:00:00.000Z' });
    assert.throws(() => cleanupBrowserEvidence(openJournal.cleanupHandle), /terminal|incomplete|recognized/i);
    writer.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser cleanup rejects foreign valid journal artifacts copied into an authenticated workspace', () => {
  const root = tempRoot();
  try {
    const source = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-source-' });
    const targetJournalOnly = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-target-' });
    const { journalPath: sourceJournal } = writeSupportedJournal(source);
    const sourceJournalContent = readFileSync(sourceJournal, 'utf8');
    const copiedJournalContent = copyMode600(source.journalPath, targetJournalOnly.journalPath);
    assertCleanupProvenanceRejects(targetJournalOnly.cleanupHandle);
    assert.equal(readFileSync(source.journalPath, 'utf8'), sourceJournalContent);
    assert.equal(readFileSync(targetJournalOnly.journalPath, 'utf8'), copiedJournalContent);
    assert.equal(existsSync(source.root), true);
    assert.equal(existsSync(targetJournalOnly.root), true);

    const sourceWithSummary = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-source-' });
    const targetWithSummary = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-target-' });
    const { journalPath } = writeSupportedJournal(sourceWithSummary);
    importBrowserJournal({ journalPath, summaryPath: sourceWithSummary.summaryPath, outputRoot: sourceWithSummary.outputRoot });
    const sourceSummaryContent = readFileSync(sourceWithSummary.summaryPath, 'utf8');
    const copiedJournal = copyMode600(sourceWithSummary.journalPath, targetWithSummary.journalPath);
    const copiedSummary = copyMode600(sourceWithSummary.summaryPath, targetWithSummary.summaryPath);
    assertCleanupProvenanceRejects(targetWithSummary.cleanupHandle);
    assert.equal(readFileSync(sourceWithSummary.summaryPath, 'utf8'), sourceSummaryContent);
    assert.equal(readFileSync(targetWithSummary.journalPath, 'utf8'), copiedJournal);
    assert.equal(readFileSync(targetWithSummary.summaryPath, 'utf8'), copiedSummary);
    assert.equal(existsSync(sourceWithSummary.root), true);
    assert.equal(existsSync(targetWithSummary.root), true);

    cleanupBrowserEvidence(sourceWithSummary.cleanupHandle);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser provenance is module-private and duplicate importers cannot launder workspace artifacts', async () => {
  const root = tempRoot();
  try {
    assert.equal(globalThis[Symbol.for('servsync-controlled-ops/browser-workspaces')], undefined);
    const duplicateImporter = await import(`${importerModuleUrl.href}?cache-bust=${Date.now()}-${Math.random()}`);
    assert.equal(duplicateImporter.registerBrowserLaunchProvenance, undefined);

    const workspace = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-module-private-' });
    const launch = createSupportedLaunch(workspace);
    writeCompleteJournal(workspace.journalRoot, {
      allowPrepared: true,
      journalAuthSecret: launch.journalAuthSecret,
      runId: launch.descriptor.run_id,
    });

    assert.throws(
      () => duplicateImporter.importBrowserJournal({
        journalPath: workspace.journalPath,
        summaryPath: workspace.summaryPath,
        outputRoot: workspace.outputRoot,
      }),
      /authenticated generated workspace|provenance/i,
    );
    assert.equal(existsSync(workspace.summaryPath), false);
    assert.throws(
      () => duplicateImporter.recordBrowserReporterReady({ cleanupHandle: workspace.cleanupHandle }),
      /authentic workspace cleanup handle/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser import rejects unauthenticated journals even when the run ID matches the launch', () => {
  const root = tempRoot();
  try {
    const publicRoot = join(root, 'public-journal');
    mkdir700(publicRoot);
    const target = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-target-' });
    const launch = createSupportedLaunch(target);
    const publicJournal = writeCompleteJournal(publicRoot, { runId: launch.descriptor.run_id });
    copyMode600(publicJournal, target.journalPath);
    assert.throws(
      () => importBrowserJournal({ journalPath: target.journalPath, summaryPath: target.summaryPath, outputRoot: target.outputRoot }),
      /provenance|auth/i,
    );
    assert.equal(existsSync(target.summaryPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser import rejects copied foreign journals before creating a trusted summary', () => {
  const root = tempRoot();
  try {
    const source = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-source-' });
    const target = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-target-' });
    const { journalPath } = writeSupportedJournal(source);
    createSupportedLaunch(target);
    copyMode600(journalPath, target.journalPath);
    assert.throws(
      () => importBrowserJournal({ journalPath: target.journalPath, summaryPath: target.summaryPath, outputRoot: target.outputRoot }),
      /provenance|auth/i,
    );
    assert.equal(existsSync(target.summaryPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser cleanup rejects reporter-ready replay after authenticated recording', () => {
  const root = tempRoot();
  try {
    const workspace = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-ready-replay-' });
    const launch = createSupportedLaunch(workspace);
    writeReporterReady({ descriptorPath: launch.descriptorPath, journalAuthSecret: launch.journalAuthSecret, nonce: launch.nonce });
    recordBrowserReporterReady({ cleanupHandle: workspace.cleanupHandle });
    const content = readFileSync(launch.reporterReadyPath, 'utf8');
    replaceWithNewInode(launch.reporterReadyPath, content);
    assertCleanupProvenanceRejects(workspace.cleanupHandle);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser cleanup binds Playwright last-run bookkeeping to recorded file identity', () => {
  const lastRun = canonicalStringify({ failedTests: [], status: 'passed' });
  const prepareOutput = (workspace) => {
    mkdirSync(workspace.outputRoot, { mode: 0o755 });
    chmodSync(workspace.outputRoot, 0o755);
  };
  const root = tempRoot();
  try {
    const unrecorded = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-last-run-' });
    prepareOutput(unrecorded);
    writeFileSync(join(unrecorded.outputRoot, '.last-run.json'), lastRun, { mode: 0o644 });
    assertCleanupProvenanceRejects(unrecorded.cleanupHandle);

    const genuine = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-last-run-' });
    prepareOutput(genuine);
    writeFileSync(join(genuine.outputRoot, '.last-run.json'), lastRun, { mode: 0o644 });
    recordBrowserBookkeeping({ cleanupHandle: genuine.cleanupHandle });
    assert.equal(cleanupBrowserEvidence(genuine.cleanupHandle).status, 'cleaned');

    const replayed = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-last-run-' });
    prepareOutput(replayed);
    const replayedPath = join(replayed.outputRoot, '.last-run.json');
    writeFileSync(replayedPath, lastRun, { mode: 0o644 });
    recordBrowserBookkeeping({ cleanupHandle: replayed.cleanupHandle });
    replaceWithNewInode(replayedPath, lastRun, 0o644);
    assertCleanupProvenanceRejects(replayed.cleanupHandle);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser cleanup rejects foreign valid launch artifacts copied into an authenticated workspace', () => {
  const root = tempRoot();
  try {
    const source = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-source-' });
    const targetDescriptorOnly = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-target-' });
    const launch = createSupportedLaunch(source);
    const sourceDescriptorContent = readFileSync(launch.descriptorPath, 'utf8');
    const copiedDescriptorContent = copyMode600(launch.descriptorPath, join(targetDescriptorOnly.launchRoot, 'browser-launch.json'));
    assertCleanupProvenanceRejects(targetDescriptorOnly.cleanupHandle);
    assert.equal(readFileSync(launch.descriptorPath, 'utf8'), sourceDescriptorContent);
    assert.equal(readFileSync(join(targetDescriptorOnly.launchRoot, 'browser-launch.json'), 'utf8'), copiedDescriptorContent);
    assert.equal(existsSync(source.root), true);
    assert.equal(existsSync(targetDescriptorOnly.root), true);
    cleanupBrowserEvidence(source.cleanupHandle);

    const sourceWithReady = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-source-' });
    const targetWithReady = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-target-' });
    const readyLaunch = createSupportedLaunch(sourceWithReady);
    writeReporterReady({ descriptorPath: readyLaunch.descriptorPath, journalAuthSecret: readyLaunch.journalAuthSecret, nonce: readyLaunch.nonce });
    recordBrowserReporterReady({ cleanupHandle: sourceWithReady.cleanupHandle });
    const sourceReadyContent = readFileSync(readyLaunch.reporterReadyPath, 'utf8');
    const copiedDescriptor = copyMode600(readyLaunch.descriptorPath, join(targetWithReady.launchRoot, 'browser-launch.json'));
    const copiedReady = copyMode600(readyLaunch.reporterReadyPath, join(targetWithReady.launchRoot, 'browser-reporter-ready.json'));
    assertCleanupProvenanceRejects(targetWithReady.cleanupHandle);
    assert.equal(readFileSync(readyLaunch.reporterReadyPath, 'utf8'), sourceReadyContent);
    assert.equal(readFileSync(join(targetWithReady.launchRoot, 'browser-launch.json'), 'utf8'), copiedDescriptor);
    assert.equal(readFileSync(join(targetWithReady.launchRoot, 'browser-reporter-ready.json'), 'utf8'), copiedReady);
    assert.equal(existsSync(sourceWithReady.root), true);
    assert.equal(existsSync(targetWithReady.root), true);
    cleanupBrowserEvidence(sourceWithReady.cleanupHandle);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser cleanup still accepts genuine artifacts bound to their own workspace provenance', () => {
  const root = tempRoot();
  try {
    const imported = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-imported-' });
    const { journalPath } = writeSupportedJournal(imported);
    importBrowserJournal({ journalPath, summaryPath: imported.summaryPath, outputRoot: imported.outputRoot });
    assert.equal(cleanupBrowserEvidence(imported.cleanupHandle).status, 'cleaned');

    const launched = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-launched-' });
    const launch = createSupportedLaunch(launched);
    writeReporterReady({ descriptorPath: launch.descriptorPath, journalAuthSecret: launch.journalAuthSecret, nonce: launch.nonce });
    recordBrowserReporterReady({ cleanupHandle: launched.cleanupHandle });
    assert.equal(cleanupBrowserEvidence(launched.cleanupHandle).status, 'cleaned');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser cleanup rejects replayed artifacts after current workspace provenance is established', () => {
  const root = tempRoot();
  try {
    const sourceImported = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-source-' });
    const targetImported = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-target-' });
    const { journalPath: sourceJournal } = writeSupportedJournal(sourceImported);
    importBrowserJournal({ journalPath: sourceJournal, summaryPath: sourceImported.summaryPath, outputRoot: sourceImported.outputRoot });
    const { journalPath: targetJournal } = writeSupportedJournal(targetImported);
    importBrowserJournal({ journalPath: targetJournal, summaryPath: targetImported.summaryPath, outputRoot: targetImported.outputRoot });
    copyMode600(sourceImported.journalPath, targetImported.journalPath);
    copyMode600(sourceImported.summaryPath, targetImported.summaryPath);
    assertCleanupProvenanceRejects(targetImported.cleanupHandle);
    assert.equal(existsSync(targetImported.root), true);
    cleanupBrowserEvidence(sourceImported.cleanupHandle);

    const sourceLaunch = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-source-' });
    const targetLaunch = createBrowserEvidenceWorkspace({ parentRoot: root, prefix: 'servsync-browser-target-' });
    const sourceContract = createSupportedLaunch(sourceLaunch);
    writeReporterReady({ descriptorPath: sourceContract.descriptorPath, journalAuthSecret: sourceContract.journalAuthSecret, nonce: sourceContract.nonce });
    recordBrowserReporterReady({ cleanupHandle: sourceLaunch.cleanupHandle });
    const targetContract = createSupportedLaunch(targetLaunch);
    writeReporterReady({ descriptorPath: targetContract.descriptorPath, journalAuthSecret: targetContract.journalAuthSecret, nonce: targetContract.nonce });
    recordBrowserReporterReady({ cleanupHandle: targetLaunch.cleanupHandle });
    copyMode600(sourceContract.descriptorPath, targetContract.descriptorPath);
    copyMode600(sourceContract.reporterReadyPath, targetContract.reporterReadyPath);
    assertCleanupProvenanceRejects(targetLaunch.cleanupHandle);
    assert.equal(existsSync(targetLaunch.root), true);
    cleanupBrowserEvidence(sourceLaunch.cleanupHandle);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser egress guard enforces exact raw host spelling and port', () => {
  const guard = createBrowserEgressGuard('http://127.0.0.1:4100');
  assert.equal(guard.shouldAllow('http://127.0.0.1:4100/'), true);
  for (const url of [
    'http://2130706433:4100/',
    'http://0x7f000001:4100/',
    'http://017700000001:4100/',
    'http://127.1:4100/',
    'http://127.0.1:4100/',
    'http://0x7f.0.0.1:4100/',
    'http://[::1]:4100/',
    'http://[::ffff:127.0.0.1]:4100/',
    'http://localhost:4100/',
    'http://127.0.0.1.:4100/',
    'http://127.0.0.1:4100@other-host/',
    'http://127.0.0.1%3A4100/',
    'http://127.0.0.1:4101/',
    'http://127.0.0.1/',
    'http://127.0.0.1:99999/',
  ]) {
    assert.equal(guard.shouldAllow(url), false, url);
  }
});

test('synthetic server enforces method, host, route, body, and request bounds', async () => {
  const fixture = await startBrowserLocalServer({ limits: { requests: 20, max_connections: 2 } });
  try {
    assert.equal(await httpGet(fixture.baseURL), 200);
    assert.equal(await httpGet(`${fixture.baseURL}/submit`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'safe=1' }), 200);
    assert.equal(await httpGet(fixture.baseURL, { method: 'PUT' }), 405);
    assert.equal(await httpConnect(fixture.baseURL), 405);
    assert.equal(await httpRaw(fixture.baseURL, { headers: { host: '127.0.0.1:1' } }), 400);
    assert.equal(await httpRaw(fixture.baseURL, { path: '/unknown' }), 404);
    assert.equal(await httpRaw(fixture.baseURL, { path: '/%2e%2e/x' }), 400);
    assert.equal(await httpGet(`${fixture.baseURL}/submit`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'safe=1' }), 415);
    assert.equal(await httpGet(`${fixture.baseURL}/submit`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'x'.repeat(256) }), 413);
  } finally {
    await fixture.close();
  }
  const bounded = await startBrowserLocalServer({ limits: { requests: 1 } });
  try {
    assert.equal(await httpGet(bounded.baseURL), 200);
    assert.equal(await httpGet(bounded.baseURL), 429);
  } finally {
    await bounded.close();
  }
  const connectionLimited = await startBrowserLocalServer({ limits: { max_connections: 1 } });
  let heldSocket = null;
  try {
    heldSocket = await openHoldingSocket(connectionLimited.baseURL);
    assert.equal(await connectionLimitCloses(connectionLimited.baseURL), true);
  } finally {
    heldSocket?.destroy();
    await connectionLimited.close();
  }
});
