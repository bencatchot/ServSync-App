import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  PROHIBITED_BROWSER_ENV_NAMES,
  BROWSER_REPORTER_READY_SCHEMA,
  BROWSER_LAUNCH_TOOL_VERSION,
  createBrowserLaunchContract,
} from '../../scripts/controlled-ops/browser-launch-policy.mjs';
import { canonicalStringify, sha256, utcNow } from '../../scripts/controlled-ops/internal.mjs';
import { cleanupBrowserEvidence, importBrowserJournal } from '../../scripts/controlled-ops/browser-importer.mjs';
import { createJournalWriter } from '../../scripts/controlled-ops/browser-journal.mjs';
import { startBrowserLocalServer } from './fixtures/browser-local-server.mjs';

const repoRoot = resolve('.');

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

function writeCompleteJournal(root) {
  const writer = createJournalWriter(root);
  writer.append({ record_type: 'browser_run_started', run_id: 'browser-run-local', timestamp: '2026-07-22T16:00:00.000Z' });
  writer.append({ record_type: 'browser_run_completed', run_id: 'browser-run-local', timestamp: '2026-07-22T16:00:01.000Z', status: 'passed', duration_ms: 1000 });
  writer.close();
  return writer.journalPath;
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
    const journalRoot = join(root, 'journal');
    const summaryRoot = join(root, 'summary');
    const outputRoot = join(root, 'output');
    for (const path of [journalRoot, summaryRoot, outputRoot]) mkdir700(path);
    const journalPath = writeCompleteJournal(journalRoot);
    const summaryPath = join(summaryRoot, 'browser-summary.json');
    importBrowserJournal({ journalPath, summaryPath, outputRoot });
    const sentinel = join(root, 'sentinel');
    writeFileSync(sentinel, 'keep', { mode: 0o600 });
    cleanupBrowserEvidence({ journalPath, summaryPath, journalRoot, outputRoot });
    cleanupBrowserEvidence({ journalPath, summaryPath, journalRoot, outputRoot });
    assert.equal(readFileSync(sentinel, 'utf8'), 'keep');
    assert.throws(() => cleanupBrowserEvidence({ journalRoot: '/' }), /Refusing to clean/);
    assert.throws(() => cleanupBrowserEvidence({ journalRoot: '/tmp' }), /Refusing to clean/);
    const unsafeRoot = join(root, 'unsafe');
    const external = join(root, 'external');
    mkdir700(external);
    symlinkSync(external, unsafeRoot);
    assert.throws(() => cleanupBrowserEvidence({ journalRoot: unsafeRoot }), /Symlinked|unsafe/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
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
});
