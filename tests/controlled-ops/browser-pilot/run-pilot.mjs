#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoProhibitedBrowserEnvironment,
  assertReporterReady,
  assertSupportedLauncherArguments,
} from '../../../scripts/controlled-ops/browser-launch-policy.mjs';
import {
  cleanupBrowserEvidence,
  createBrowserEvidenceWorkspace,
  createBrowserWorkspaceLaunchContract,
  importGeneratedBrowserWorkspaceJournal,
  recordBrowserReporterReady,
  verifyBrowserSummary,
} from '../../../scripts/controlled-ops/browser-importer.mjs';
import { JOURNAL_FILENAME } from '../../../scripts/controlled-ops/browser-journal.mjs';
import { PACKET_LOCK_NAME, canonicalStringify } from '../../../scripts/controlled-ops/internal.mjs';
import {
  createStage,
  freezeStage,
  initializeOperation,
} from '../../../scripts/controlled-ops/evidence.mjs';
import { readCanonicalJsonFile } from '../../../scripts/controlled-ops/manifest.mjs';
import { BROWSER_WORKFLOW_COMMAND_CATEGORY } from '../../../scripts/controlled-ops/browser-schema.mjs';
import {
  createPacketBoundBrowserLaunchContract,
  promoteGeneratedBrowserEvidenceToPacket,
} from '../../../scripts/controlled-ops/browser-packet-importer.mjs';
import { parseStrictJson } from '../../../scripts/controlled-ops/sanitize.mjs';
import { startBrowserLocalServer } from '../fixtures/browser-local-server.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const argv = process.argv.slice(2);
const packetBoundMode = argv.length === 1 && argv[0] === '--packet-bound';
const packetBoundChildMode = argv.length === 1 && argv[0] === '--packet-bound-child';

if (!packetBoundMode && !packetBoundChildMode) assertSupportedLauncherArguments(argv);
else assertSupportedLauncherArguments([]);
assertNoProhibitedBrowserEnvironment(process.env);

function assertNoNativeArtifacts(root) {
  if (!existsSync(root)) return;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const name of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, name.name);
      if (name.isDirectory()) stack.push(path);
      else if (name.isFile()) {
        const lower = name.name.toLowerCase();
        if (/\.(png|jpg|jpeg|webp|zip|webm|mp4|har|html)$/.test(lower) || (lower.includes('storage') && lower.endsWith('.json'))) {
          throw new Error(`Prohibited native artifact produced: ${name.name}`);
        }
      } else {
        throw new Error('Playwright output contains an unsafe non-file entry.');
      }
    }
  }
}

function removeEmptyGeneratedOutputDirectories(root) {
  if (!existsSync(root)) return;
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name);
    if (readdirSync(path).length !== 0) {
      throw new Error('Playwright generated a non-empty output directory.');
    }
    rmdirSync(path);
  }
}

function runPlaywright(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ status: code, signal, stdout, stderr }));
  });
}

function finalizePlaywrightBookkeeping(outputRoot) {
  const lastRunPath = join(outputRoot, '.last-run.json');
  if (!existsSync(lastRunPath)) return { status: 'absent' };
  const info = lstatSync(lastRunPath);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || ![0o600, 0o644].includes(info.mode & 0o777)) {
    throw new Error('Playwright last-run record is not a safe generated file.');
  }
  const content = readFileSync(lastRunPath, 'utf8');
  const parsed = parseStrictJson(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || canonicalStringify(Object.keys(parsed).sort()) !== canonicalStringify(['failedTests', 'status'])
    || !['passed', 'failed'].includes(parsed.status)
    || !Array.isArray(parsed.failedTests)
    || parsed.failedTests.length !== 0) {
    throw new Error('Playwright last-run record is not recognized as supported generated bookkeeping.');
  }
  unlinkSync(lastRunPath);
  return { status: 'removed' };
}

function writeCanonicalFile(path, value) {
  writeFileSync(path, `${canonicalStringify(value)}\n`, { mode: 0o600 });
}

function readCanonicalFile(path) {
  const content = readFileSync(path, 'utf8');
  const parsed = parseStrictJson(content.endsWith('\n') ? content.slice(0, -1) : content);
  if (content !== `${canonicalStringify(parsed)}\n`) {
    throw new Error('Controlled-ops browser pilot handoff is not canonical.');
  }
  return parsed;
}

async function waitForFile(path, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error('Controlled-ops browser pilot timed out waiting for local handoff.');
}

async function waitForToken(root, token, { states = ['claimed', 'started'], timeoutMs = 5_000 } = {}) {
  const tokenPath = join(root, 'tokens', `${token}.json`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(tokenPath)) {
      try {
        const record = readCanonicalJsonFile(tokenPath);
        if (states.includes(record.state)) return record;
      } catch {}
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error('Controlled-ops browser pilot timed out waiting for token claim.');
}

async function waitForPacketUnlock(root, timeoutMs = 5_000) {
  const lockPath = join(root, PACKET_LOCK_NAME);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!existsSync(lockPath)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error('Controlled-ops browser pilot timed out waiting for packet mutation lock release.');
}

async function executeLocalBrowserWorkflow({
  baseURL,
  journalRoot,
  descriptorPath,
  journalAuthSecret,
  nonce,
  outputRoot,
  runLabel,
}) {
  const env = { ...process.env };
  env.CONTROLLED_OPS_BROWSER_BASE_URL = baseURL;
  env.CONTROLLED_OPS_BROWSER_JOURNAL_ROOT = journalRoot;
  env.CONTROLLED_OPS_BROWSER_LAUNCH_DESCRIPTOR = descriptorPath;
  env.CONTROLLED_OPS_BROWSER_JOURNAL_AUTH_SECRET = journalAuthSecret;
  env.CONTROLLED_OPS_BROWSER_LAUNCH_NONCE = nonce;
  env.CONTROLLED_OPS_BROWSER_OUTPUT_ROOT = outputRoot;
  env.CONTROLLED_OPS_BROWSER_RUN_LABEL = runLabel;

  const playwrightBin = join(repoRoot, 'node_modules/.bin/playwright');
  const result = await runPlaywright(playwrightBin, ['test', '--config', 'playwright.controlled-ops.config.ts'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stderr.write(result.stdout);
    throw new Error(`Controlled-ops browser pilot failed with status ${result.status}.`);
  }
  finalizePlaywrightBookkeeping(outputRoot);
  removeEmptyGeneratedOutputDirectories(outputRoot);
}

function assertPilotSummary(summary, launch, workspace) {
  const journalPath = join(workspace.journalRoot, JOURNAL_FILENAME);
  verifyBrowserSummary(workspace.summaryPath, { sourceJournalPath: journalPath });
  if (summary.source_binding_mode !== 'current_source_snapshot' || summary.source_manifest_digest !== launch.descriptor.source_manifest_digest) {
    throw new Error('Controlled-ops browser pilot source snapshot digest did not reconcile.');
  }
  if (summary.status !== 'passed' || summary.counts.started !== 1 || summary.counts.passed !== 1 || summary.counts.steps !== 3) {
    throw new Error('Controlled-ops browser pilot summary did not reconcile.');
  }
  if (summary.observability.completeness_status !== 'complete'
    || summary.observability.totals.console_total !== 1
    || summary.observability.totals.page_error_total !== 1
    || summary.observability.totals.network_total !== 5
    || summary.observability.totals.overflow_total !== 0
    || summary.observability.totals.rejected_sensitive_total !== 0
    || summary.observability.totals.rejected_customer_content_total !== 0
    || summary.observability.totals.collector_failure_total !== 0) {
    throw new Error('Controlled-ops browser pilot observability summary did not reconcile.');
  }
  const [{ observability }] = summary.tests;
  if (observability.console.safe_message_class_counts.synthetic_safe !== 1
    || observability.page_error.safe_message_class_counts.synthetic_safe !== 1
    || observability.network.method_class_counts.GET !== 4
    || observability.network.method_class_counts.POST !== 1
    || observability.network.route_class_counts.root !== 1
    || observability.network.route_class_counts.health !== 1
    || observability.network.route_class_counts.redirect !== 1
    || observability.network.route_class_counts.redirect_target !== 1
    || observability.network.route_class_counts.submit !== 1
    || observability.network.status_class_counts['2xx'] !== 4
    || observability.network.status_class_counts['3xx'] !== 1) {
    throw new Error('Controlled-ops browser pilot aggregate counts were unexpected.');
  }
  assertNoNativeArtifacts(workspace.outputRoot);
  removeEmptyGeneratedOutputDirectories(workspace.outputRoot);
}

async function runUnboundPilot() {
  const workspace = createBrowserEvidenceWorkspace({ prefix: 'servsync-browser-pilot-' });
  let fixture;
  let runError = null;
  try {
    fixture = await startBrowserLocalServer();
    const launch = createBrowserWorkspaceLaunchContract({
      cleanupHandle: workspace.cleanupHandle,
      baseURL: fixture.baseURL,
      runLabel: 'synthetic-form-submit',
    });
    await executeLocalBrowserWorkflow({
      baseURL: fixture.baseURL,
      journalRoot: workspace.journalRoot,
      descriptorPath: launch.descriptorPath,
      journalAuthSecret: launch.journalAuthSecret,
      nonce: launch.nonce,
      outputRoot: workspace.outputRoot,
      runLabel: 'synthetic-form-submit',
    });
    recordBrowserReporterReady({ cleanupHandle: workspace.cleanupHandle });
    assertReporterReady({ descriptorPath: launch.descriptorPath, journalAuthSecret: launch.journalAuthSecret, nonce: launch.nonce });
    const { summary } = importGeneratedBrowserWorkspaceJournal({ cleanupHandle: workspace.cleanupHandle });
    assertPilotSummary(summary, launch, workspace);
    process.stdout.write('controlled-ops browser pilot passed\n');
  } catch (error) {
    runError = error;
  } finally {
    if (fixture) await fixture.close();
    try {
      finalizePlaywrightBookkeeping(workspace.outputRoot);
      removeEmptyGeneratedOutputDirectories(workspace.outputRoot);
    } catch (bookkeepingError) {
      if (!runError) runError = bookkeepingError;
    }
    try {
      cleanupBrowserEvidence(workspace.cleanupHandle);
    } catch (cleanupError) {
      if (!runError) runError = cleanupError;
    }
  }
  if (runError) throw runError;
}

async function runPacketBoundChild() {
  const handoffPath = process.env.CONTROLLED_OPS_BROWSER_PACKET_CHILD_HANDOFF;
  if (!handoffPath) throw new Error('Controlled-ops browser packet child handoff is missing.');
  await waitForFile(handoffPath);
  const handoff = readCanonicalFile(handoffPath);
  await executeLocalBrowserWorkflow({
    baseURL: handoff.base_url,
    journalRoot: handoff.journal_root,
    descriptorPath: handoff.launch_descriptor,
    journalAuthSecret: handoff.journal_auth_secret,
    nonce: handoff.launch_nonce,
    outputRoot: handoff.output_root,
    runLabel: handoff.run_label,
  });
  process.stdout.write('status=passed\n');
}

async function runPacketBoundPilot() {
  const parent = mkdtempSync(join('/private/tmp', 'servsync-browser-packet-pilot-'));
  const packetRoot = join(parent, 'packet');
  const stageId = 'browser-stage';
  const token = 'browser-token';
  const workspace = createBrowserEvidenceWorkspace({ parentRoot: parent });
  const handoffPath = join(parent, 'browser-child-handoff.json');
  let fixture;
  let runError = null;
  try {
    initializeOperation(packetRoot, {
      operationId: 'operation-browser-pilot',
      operationClassification: 'local-test',
      targetClassification: 'local-fixture',
      authorizationReference: 'task:local',
      createdAt: new Date(Date.now() - 5_000).toISOString(),
    });
    createStage(packetRoot, stageId);
    fixture = await startBrowserLocalServer();

    const wrapperPath = join(repoRoot, 'scripts/controlled-ops/run-command.sh');
    const env = { ...process.env, CONTROLLED_OPS_BROWSER_PACKET_CHILD_HANDOFF: handoffPath };
    const wrapper = runPlaywright('bash', [
      wrapperPath,
      '--operation-root', packetRoot,
      '--stage', stageId,
      '--token', token,
      '--category', BROWSER_WORKFLOW_COMMAND_CATEGORY,
      '--expected', 'completed',
      '--',
      process.execPath,
      fileURLToPath(import.meta.url),
      '--packet-bound-child',
    ], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForToken(packetRoot, token, { states: ['started'] });
    await waitForPacketUnlock(packetRoot);
    const launch = createPacketBoundBrowserLaunchContract({
      operationRoot: packetRoot,
      stageId,
      executionTokenId: token,
      browserWorkspace: workspace,
      baseURL: fixture.baseURL,
      runLabel: 'synthetic-form-submit',
    });
    writeCanonicalFile(handoffPath, {
      schema_version: 'servsync-controlled-ops/browser-pilot-handoff-v1',
      base_url: fixture.baseURL,
      journal_root: workspace.journalRoot,
      launch_descriptor: launch.descriptorPath,
      journal_auth_secret: launch.journalAuthSecret,
      launch_nonce: launch.nonce,
      output_root: workspace.outputRoot,
      run_label: 'synthetic-form-submit',
    });

    const wrapperResult = await wrapper;
    try { unlinkSync(handoffPath); } catch {}
    if (wrapperResult.status !== 0) {
      process.stderr.write(wrapperResult.stderr);
      process.stderr.write(wrapperResult.stdout);
      throw new Error(`Controlled-ops packet-bound browser pilot failed with status ${wrapperResult.status}.`);
    }

    recordBrowserReporterReady({ cleanupHandle: workspace.cleanupHandle });
    assertReporterReady({ descriptorPath: launch.descriptorPath, journalAuthSecret: launch.journalAuthSecret, nonce: launch.nonce });
    const result = promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: packetRoot,
      stageId,
      executionTokenId: token,
      browserWorkspace: workspace,
    });
    if (result.freeze_state !== 'not_frozen' || result.manifest_state !== 'not_created' || result.seal_state !== 'not_created') {
      throw new Error('Controlled-ops packet-bound browser pilot created a deferred packet lifecycle artifact.');
    }
    if (existsSync(workspace.root)) {
      throw new Error('Controlled-ops packet-bound browser pilot did not clean the browser workspace.');
    }
    if (existsSync(join(packetRoot, 'manifest.json')) || existsSync(join(packetRoot, 'seal.json')) || existsSync(join(packetRoot, 'stages', stageId, 'stage-freeze.json'))) {
      throw new Error('Controlled-ops packet-bound browser pilot unexpectedly froze, manifested, or sealed the packet.');
    }
    try {
      freezeStage(packetRoot, stageId);
      throw new Error('Controlled-ops packet-bound browser pilot did not block generic freeze.');
    } catch (error) {
      if (error?.code !== 'BROWSER_VERIFICATION_DEFERRED') throw error;
    }
    process.stdout.write('controlled-ops packet-bound browser pilot passed\n');
  } catch (error) {
    runError = error;
  } finally {
    if (fixture) await fixture.close();
    try { unlinkSync(handoffPath); } catch {}
    try {
      finalizePlaywrightBookkeeping(workspace.outputRoot);
      removeEmptyGeneratedOutputDirectories(workspace.outputRoot);
    } catch (bookkeepingError) {
      if (!runError) runError = bookkeepingError;
    }
    try {
      if (existsSync(workspace.root)) cleanupBrowserEvidence(workspace.cleanupHandle);
    } catch (cleanupError) {
      if (!runError) runError = cleanupError;
    }
    rmSync(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
  }
  if (runError) throw runError;
}

if (packetBoundChildMode) {
  await runPacketBoundChild();
} else if (packetBoundMode) {
  await runPacketBoundPilot();
} else {
  await runUnboundPilot();
}
