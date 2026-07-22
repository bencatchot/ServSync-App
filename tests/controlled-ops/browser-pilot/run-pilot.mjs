#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importBrowserJournal, verifyBrowserSummary } from '../../../scripts/controlled-ops/browser-importer.mjs';
import { JOURNAL_FILENAME } from '../../../scripts/controlled-ops/browser-journal.mjs';
import { startBrowserLocalServer } from '../fixtures/browser-local-server.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function mkdir700(path) {
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
}

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

const tmpRoot = mkdtempSync(join('/private/tmp', 'servsync-browser-pilot-'));
chmodSync(tmpRoot, 0o700);
const journalRoot = join(tmpRoot, 'journal');
const summaryRoot = join(tmpRoot, 'summary');
const outputRoot = join(tmpRoot, 'playwright-output');
mkdir700(journalRoot);
mkdir700(summaryRoot);
mkdir700(outputRoot);

let fixture;
try {
  fixture = await startBrowserLocalServer();
  const env = { ...process.env };
  delete env.TEST_APP_URL;
  delete env.VERCEL_AUTOMATION_BYPASS_SECRET;
  delete env.SUPABASE_URL;
  delete env.SUPABASE_ANON_KEY;
  delete env.VITE_SUPABASE_URL;
  delete env.VITE_SUPABASE_ANON_KEY;
  env.CONTROLLED_OPS_BROWSER_BASE_URL = fixture.baseURL;
  env.CONTROLLED_OPS_BROWSER_JOURNAL_ROOT = journalRoot;
  env.CONTROLLED_OPS_BROWSER_OUTPUT_ROOT = outputRoot;
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

  const journalPath = join(journalRoot, JOURNAL_FILENAME);
  const summaryPath = join(summaryRoot, 'browser-summary.json');
  const { summary } = importBrowserJournal({ journalPath, summaryPath, outputRoot });
  verifyBrowserSummary(summaryPath, { sourceJournalPath: journalPath });
  if (summary.status !== 'passed' || summary.counts.started !== 1 || summary.counts.passed !== 1 || summary.counts.steps !== 3) {
    throw new Error('Controlled-ops browser pilot summary did not reconcile.');
  }
  assertNoNativeArtifacts(outputRoot);
  process.stdout.write('controlled-ops browser pilot passed\n');
} finally {
  if (fixture) await fixture.close();
  rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
}
