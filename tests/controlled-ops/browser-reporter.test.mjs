import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createBrowserLaunchContract } from '../../scripts/controlled-ops/browser-launch-policy.mjs';
import ControlledOpsBrowserReporter from '../../scripts/controlled-ops/playwright-reporter.mjs';
import { readJournal } from '../../scripts/controlled-ops/browser-journal.mjs';

function tempRoot() {
  const root = mkdtempSync(join('/private/tmp', 'servsync-browser-reporter-'));
  chmodSync(root, 0o700);
  return root;
}

function hasCode(code) {
  return (error) => error?.code === code;
}

test('controlled-ops reporter writes a strict local lifecycle journal', async () => {
    const parent = tempRoot();
    try {
      const journalRoot = join(parent, 'journal');
      const launchRoot = join(parent, 'launch');
      const launch = createBrowserLaunchContract({
        root: launchRoot,
        baseURL: 'http://127.0.0.1:43210',
        runLabel: 'synthetic-form-submit',
      });
      const reporter = new ControlledOpsBrowserReporter({
        descriptorPath: launch.descriptorPath,
        journalAuthSecret: launch.journalAuthSecret,
        journalRoot,
        nonce: launch.nonce,
        baseURL: 'http://127.0.0.1:43210',
        runLabel: 'synthetic-form-submit',
      });
    const config = { projects: [{ name: 'chromium', retries: 0 }], workers: 1, fullyParallel: false };
    const suite = { allTests: () => [{ title: 'synthetic-form-submit' }] };
    const testCase = { id: 'test-case-1', title: 'synthetic-form-submit', location: { file: join(process.cwd(), 'tests/controlled-ops/browser-pilot/pilot.spec.ts') } };
    reporter.onBegin(config, suite);
    reporter.onTestBegin(testCase, { workerIndex: 0, retry: 0 });
    reporter.onStepEnd(testCase, {}, { category: 'test.step', title: 'open-local-page', duration: 5 });
    reporter.onStepEnd(testCase, {}, { category: 'test.step', title: 'confirm-success-state', duration: 5, error: new Error('assertion failed') });
    reporter.onTestEnd(testCase, { status: 'passed', duration: 25 });
    reporter.onEnd({ status: 'passed' });
    const journal = readJournal(join(journalRoot, 'browser-journal.ndjson'));
    assert.equal(journal.records[0].record_type, 'browser_run_started');
    assert.equal(journal.records.at(-1).record_type, 'browser_run_completed');
    assert.equal(journal.records.filter((record) => record.record_type === 'browser_step_completed').length, 2);
    assert.equal(journal.records.find((record) => record.safe_label === 'confirm-success-state').status, 'failed');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('controlled-ops reporter rejects nonlocal or parallel Playwright configuration', () => {
  const parent = tempRoot();
  try {
    const launch = createBrowserLaunchContract({
      root: join(parent, 'launch'),
      baseURL: 'http://127.0.0.1:43210',
      runLabel: 'synthetic-form-submit',
    });
    assert.throws(() => new ControlledOpsBrowserReporter({ descriptorPath: launch.descriptorPath, journalRoot: join(parent, 'journal'), nonce: launch.nonce, baseURL: 'https://example.com:443' }).onBegin({ projects: [{ name: 'chromium', retries: 0 }], workers: 1, fullyParallel: false }, { allTests: () => [] }), hasCode('INVALID_BROWSER_TARGET'));
    assert.throws(() => new ControlledOpsBrowserReporter({ descriptorPath: launch.descriptorPath, journalRoot: join(parent, 'journal-two'), nonce: launch.nonce, baseURL: 'http://127.0.0.1:43210' }).onBegin({ projects: [{ name: 'chromium', retries: 0 }], workers: 2, fullyParallel: true }, { allTests: () => [] }), hasCode('BROWSER_REPORTER_CONFIG'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
