#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
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
  importBrowserJournal,
  recordBrowserBookkeeping,
  recordBrowserReporterReady,
  verifyBrowserSummary,
} from '../../../scripts/controlled-ops/browser-importer.mjs';
import { JOURNAL_FILENAME } from '../../../scripts/controlled-ops/browser-journal.mjs';
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
  recordBrowserBookkeeping({ cleanupHandle: workspace.cleanupHandle });
  recordBrowserReporterReady({ cleanupHandle: workspace.cleanupHandle });
  assertReporterReady({ descriptorPath: launch.descriptorPath, journalAuthSecret: launch.journalAuthSecret, nonce: launch.nonce });

  const journalPath = join(workspace.journalRoot, JOURNAL_FILENAME);
  const summaryPath = workspace.summaryPath;
  const { summary } = importBrowserJournal({ journalPath, summaryPath, outputRoot: workspace.outputRoot });
  verifyBrowserSummary(summaryPath, { sourceJournalPath: journalPath });
  if (summary.status !== 'passed' || summary.counts.started !== 1 || summary.counts.passed !== 1 || summary.counts.steps !== 3) {
    throw new Error('Controlled-ops browser pilot summary did not reconcile.');
  }
  assertNoNativeArtifacts(workspace.outputRoot);
  process.stdout.write('controlled-ops browser pilot passed\n');
} catch (error) {
  runError = error;
} finally {
  if (fixture) await fixture.close();
  try {
    recordBrowserBookkeeping({ cleanupHandle: workspace.cleanupHandle });
  } catch (bookkeepingError) {
    if (!runError && bookkeepingError?.code !== 'BROWSER_PROVENANCE_STATE') runError = bookkeepingError;
  }
  try {
    cleanupBrowserEvidence(workspace.cleanupHandle);
  } catch (cleanupError) {
    if (!runError) runError = cleanupError;
  }
}
if (runError) throw runError;
