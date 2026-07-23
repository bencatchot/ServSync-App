import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  createStandaloneBrowserEvidenceSession,
  createStandaloneBrowserJournalWriter,
  importBrowserJournal,
  importStandaloneBrowserJournal,
  verifyBrowserSummary,
} from '../../scripts/controlled-ops/browser-importer.mjs';
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

function writeValidJournal(writer, runId) {
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

test('standalone browser importer creates one canonical sanitized summary through an authenticated session', () => {
  const parent = makeDir('servsync-browser-importer-');
  try {
    const session = createStandaloneBrowserEvidenceSession({ parentRoot: parent });
    const writer = createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle });
    const journalPath = writeValidJournal(writer, session.runId);
    const result = importStandaloneBrowserJournal({ standaloneHandle: session.standaloneHandle, generatedAt: '2026-07-22T15:00:02.000Z' });
    assert.equal(result.summary.status, 'passed');
    assert.equal(result.summary.counts.started, 1);
    assert.deepEqual(verifyBrowserSummary(session.summaryPath, { sourceJournalPath: journalPath }), result.summary);
    assert.equal(readFileSync(session.summaryPath, 'utf8').endsWith('\n'), true);
    assert.throws(() => importStandaloneBrowserJournal({ standaloneHandle: session.standaloneHandle }), /already exists|provenance/i);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('path-based browser import is verification-only and never creates a summary', () => {
  const parent = makeDir('servsync-browser-importer-bad-');
  try {
    const journalRoot = join(parent, 'journal');
    const summaryRoot = join(parent, 'summary');
    const outputRoot = join(parent, 'output');
    for (const path of [journalRoot, summaryRoot, outputRoot]) {
      mkdirSync(path, { mode: 0o700 });
      chmodSync(path, 0o700);
    }
    const writer = createJournalWriter(journalRoot, { journalAuthSecret: 'a'.repeat(64), provenanceMode: 'standalone' });
    const journalPath = writeValidJournal(writer, 'browser-run-local');
    const summaryPath = join(summaryRoot, 'browser-summary.json');
    writeFileSync(join(outputRoot, 'screenshot.png'), 'not-image', { mode: 0o600 });
    assert.throws(() => importBrowserJournal({ journalPath, summaryPath, outputRoot }), hasCode('BROWSER_PATH_IMPORT_DISABLED'));
    assert.equal(existsSync(summaryPath), false);
    rmSync(join(outputRoot, 'screenshot.png'));
    const journalContent = readFileSync(journalPath, 'utf8').split('\n').slice(0, -2).join('\n') + '\n';
    writeFileSync(journalPath, journalContent, { mode: 0o600 });
    assert.throws(() => importBrowserJournal({ journalPath, summaryPath, outputRoot }), hasCode('BROWSER_PATH_IMPORT_DISABLED'));
    assert.equal(existsSync(summaryPath), false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
