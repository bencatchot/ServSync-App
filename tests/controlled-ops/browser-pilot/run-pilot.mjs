#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
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
import { canonicalStringify } from '../../../scripts/controlled-ops/internal.mjs';
import { parseStrictJson } from '../../../scripts/controlled-ops/sanitize.mjs';
import { startBrowserLocalServer } from '../fixtures/browser-local-server.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

assertSupportedLauncherArguments(process.argv.slice(2));
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
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o777) !== 0o644) {
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
  const env = { ...process.env };
  env.CONTROLLED_OPS_BROWSER_BASE_URL = fixture.baseURL;
  env.CONTROLLED_OPS_BROWSER_JOURNAL_ROOT = workspace.journalRoot;
  env.CONTROLLED_OPS_BROWSER_LAUNCH_DESCRIPTOR = launch.descriptorPath;
  env.CONTROLLED_OPS_BROWSER_JOURNAL_AUTH_SECRET = launch.journalAuthSecret;
  env.CONTROLLED_OPS_BROWSER_LAUNCH_NONCE = launch.nonce;
  env.CONTROLLED_OPS_BROWSER_OUTPUT_ROOT = workspace.outputRoot;
  env.CONTROLLED_OPS_BROWSER_RUN_LABEL = 'synthetic-form-submit';

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
  finalizePlaywrightBookkeeping(workspace.outputRoot);
  removeEmptyGeneratedOutputDirectories(workspace.outputRoot);
  recordBrowserReporterReady({ cleanupHandle: workspace.cleanupHandle });
  assertReporterReady({ descriptorPath: launch.descriptorPath, journalAuthSecret: launch.journalAuthSecret, nonce: launch.nonce });

  const journalPath = join(workspace.journalRoot, JOURNAL_FILENAME);
  const summaryPath = workspace.summaryPath;
  const { summary } = importGeneratedBrowserWorkspaceJournal({ cleanupHandle: workspace.cleanupHandle });
  verifyBrowserSummary(summaryPath, { sourceJournalPath: journalPath });
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
