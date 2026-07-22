import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { importBrowserJournal, verifyBrowserSummary } from '../../scripts/controlled-ops/browser-importer.mjs';
import { createJournalWriter } from '../../scripts/controlled-ops/browser-journal.mjs';
import { attemptIdFor, testIdFor } from '../../scripts/controlled-ops/browser-schema.mjs';

function makeDir(prefix) {
  const root = mkdtempSync(join('/private/tmp', prefix));
  chmodSync(root, 0o700);
  return root;
}

function hasCode(code) {
  return (error) => error?.code === code;
}

function writeValidJournal(root) {
  const writer = createJournalWriter(root);
  const runId = 'browser-run-local';
  const specPath = 'tests/controlled-ops/browser-pilot/pilot.spec.ts';
  const safeLabel = 'synthetic-form-submit';
  const testId = testIdFor({ specPath, project: 'chromium', safeLabel });
  const attemptId = attemptIdFor({ testId, retryIndex: 0, workerIndex: 0 });
  writer.append({ record_type: 'browser_run_started', run_id: runId, timestamp: '2026-07-22T15:00:00.000Z' });
  writer.append({ record_type: 'browser_test_started', run_id: runId, timestamp: '2026-07-22T15:00:00.100Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel });
  writer.append({ record_type: 'browser_step_completed', run_id: runId, timestamp: '2026-07-22T15:00:00.200Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: 'open-local-page', status: 'passed', duration_ms: 10 });
  writer.append({ record_type: 'browser_test_completed', run_id: runId, timestamp: '2026-07-22T15:00:00.800Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, status: 'passed', duration_ms: 700, error_classification: 'none' });
  writer.append({ record_type: 'browser_run_completed', run_id: runId, timestamp: '2026-07-22T15:00:01.000Z', status: 'passed', duration_ms: 1000, error_classification: 'none' });
  writer.close();
  return writer.journalPath;
}

test('browser importer creates one canonical sanitized summary', () => {
  const parent = makeDir('servsync-browser-importer-');
  try {
    const journalRoot = join(parent, 'journal');
    const summaryRoot = join(parent, 'summary');
    const outputRoot = join(parent, 'output');
    for (const path of [journalRoot, summaryRoot, outputRoot]) {
      mkdirSync(path, { mode: 0o700 });
      chmodSync(path, 0o700);
    }
    const journalPath = writeValidJournal(journalRoot);
    const summaryPath = join(summaryRoot, 'browser-summary.json');
    const result = importBrowserJournal({ journalPath, summaryPath, outputRoot, generatedAt: '2026-07-22T15:00:02.000Z' });
    assert.equal(result.summary.status, 'passed');
    assert.equal(result.summary.counts.started, 1);
    assert.deepEqual(verifyBrowserSummary(summaryPath, { sourceJournalPath: journalPath }), result.summary);
    assert.equal(readFileSync(summaryPath, 'utf8').endsWith('\n'), true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('browser importer rejects incomplete journals and prohibited artifacts', () => {
  const parent = makeDir('servsync-browser-importer-bad-');
  try {
    const journalRoot = join(parent, 'journal');
    const summaryRoot = join(parent, 'summary');
    const outputRoot = join(parent, 'output');
    for (const path of [journalRoot, summaryRoot, outputRoot]) {
      mkdirSync(path, { mode: 0o700 });
      chmodSync(path, 0o700);
    }
    const journalPath = writeValidJournal(journalRoot);
    writeFileSync(join(outputRoot, 'screenshot.png'), 'not-image', { mode: 0o600 });
    assert.throws(() => importBrowserJournal({ journalPath, summaryPath: join(summaryRoot, 'browser-summary.json'), outputRoot }), hasCode('PROHIBITED_BROWSER_ARTIFACT'));
    rmSync(join(outputRoot, 'screenshot.png'));
    const journalContent = readFileSync(journalPath, 'utf8').split('\n').slice(0, -2).join('\n') + '\n';
    writeFileSync(journalPath, journalContent, { mode: 0o600 });
    assert.throws(() => importBrowserJournal({ journalPath, summaryPath: join(summaryRoot, 'browser-summary.json'), outputRoot }), hasCode('BROWSER_INCOMPLETE_JOURNAL'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
