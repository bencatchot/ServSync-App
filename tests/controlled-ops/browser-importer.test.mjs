import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  createEmptyBrowserObservabilityAggregates,
} from '../../scripts/controlled-ops/browser-collectors.mjs';
import {
  createStandaloneBrowserEvidenceSession,
  createStandaloneBrowserJournalWriter,
  discardStandaloneBrowserEvidenceSession,
  finalizeStandaloneBrowserEvidenceSession,
  importBrowserJournal,
  importStandaloneBrowserJournal,
  verifyBrowserSummary,
} from '../../scripts/controlled-ops/browser-importer.mjs';
import { createJournalWriter } from '../../scripts/controlled-ops/browser-journal.mjs';
import { attemptIdFor, testIdFor } from '../../scripts/controlled-ops/browser-schema.mjs';
import { canonicalStringify } from '../../scripts/controlled-ops/internal.mjs';

function makeDir(prefix) {
  const root = mkdtempSync(join('/private/tmp', prefix));
  chmodSync(root, 0o700);
  return root;
}

function hasCode(code) {
  return (error) => error?.code === code;
}

function modeOf(path) {
  return lstatSync(path).mode & 0o777;
}

function writeValidJournal(writer, runId) {
  const specPath = 'tests/controlled-ops/browser-pilot/pilot.spec.ts';
  const safeLabel = 'synthetic-form-submit';
  const testId = testIdFor({ specPath, project: 'chromium', safeLabel });
  const attemptId = attemptIdFor({ testId, retryIndex: 0, workerIndex: 0 });
  const observability = createEmptyBrowserObservabilityAggregates();
  writer.append({ record_type: 'browser_run_started', run_id: runId, timestamp: '2026-07-22T15:00:00.000Z' });
  writer.append({ record_type: 'browser_test_started', run_id: runId, timestamp: '2026-07-22T15:00:00.100Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel });
  writer.append({ record_type: 'browser_step_completed', run_id: runId, timestamp: '2026-07-22T15:00:00.200Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: 'open-local-page', status: 'passed', duration_ms: 10 });
  writer.append({ record_type: 'browser_console_summary', run_id: runId, timestamp: '2026-07-22T15:00:00.500Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, console_aggregate: observability.console_aggregate });
  writer.append({ record_type: 'browser_page_error_summary', run_id: runId, timestamp: '2026-07-22T15:00:00.600Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, page_error_aggregate: observability.page_error_aggregate });
  writer.append({ record_type: 'browser_network_summary', run_id: runId, timestamp: '2026-07-22T15:00:00.700Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, network_aggregate: observability.network_aggregate });
  writer.append({ record_type: 'browser_test_completed', run_id: runId, timestamp: '2026-07-22T15:00:00.800Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, status: 'passed', duration_ms: 700, error_classification: 'none' });
  writer.append({ record_type: 'browser_run_completed', run_id: runId, timestamp: '2026-07-22T15:00:01.000Z', status: 'passed', duration_ms: 1000, error_classification: 'none' });
  writer.close();
  return writer.journalPath;
}

test('standalone browser importer creates one canonical sanitized summary through an authenticated session', () => {
  const parent = makeDir('servsync-browser-importer-');
  try {
    const session = createStandaloneBrowserEvidenceSession({ parentRoot: parent });
    assert.equal(existsSync(session.outputRoot), true);
    assert.equal(modeOf(session.root), 0o700);
    for (const path of [session.journalRoot, session.summaryRoot, session.launchRoot, session.outputRoot]) {
      assert.equal(existsSync(path), true);
      assert.equal(modeOf(path), 0o700);
    }
    const writer = createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle });
    const journalPath = writeValidJournal(writer, session.runId);
    const result = importStandaloneBrowserJournal({ standaloneHandle: session.standaloneHandle, generatedAt: '2026-07-22T15:00:02.000Z' });
    assert.equal(result.summary.status, 'passed');
    assert.equal(result.summary.counts.started, 1);
    assert.deepEqual(verifyBrowserSummary(session.summaryPath, { sourceJournalPath: journalPath }), result.summary);
    assert.equal(readFileSync(session.summaryPath, 'utf8').endsWith('\n'), true);
    assert.throws(() => importStandaloneBrowserJournal({ standaloneHandle: session.standaloneHandle }), hasCode('BROWSER_PROVENANCE_STATE'));
    const finalized = finalizeStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle });
    assert.equal(finalized.status, 'finalized');
    assert.equal(finalized.summaryPath, session.summaryPath);
    assert.deepEqual(verifyBrowserSummary(session.summaryPath), result.summary);
    assert.deepEqual(readdirSync(session.root), ['summary']);
    assert.deepEqual(readdirSync(session.summaryRoot), ['browser-summary.json']);
    for (const path of [session.journalRoot, session.launchRoot, session.outputRoot, join(session.root, 'browser-workspace.json')]) {
      assert.equal(existsSync(path), false);
    }
    assert.equal(readFileSync(session.summaryPath, 'utf8').includes('a'.repeat(64)), false);
    assert.equal(finalizeStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }).status, 'already_finalized');
    assert.equal(discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }).status, 'already_finalized');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('standalone browser verifier recomputes summary from journal and rejects tampered aggregates', () => {
  const parent = makeDir('servsync-browser-verify-recompute-');
  try {
    const session = createStandaloneBrowserEvidenceSession({ parentRoot: parent });
    const writer = createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle });
    const journalPath = writeValidJournal(writer, session.runId);
    const result = importStandaloneBrowserJournal({ standaloneHandle: session.standaloneHandle, generatedAt: '2026-07-22T15:00:02.000Z' });
    assert.deepEqual(verifyBrowserSummary(session.summaryPath, { sourceJournalPath: journalPath }), result.summary);
    const tampered = structuredClone(result.summary);
    tampered.observability.totals.network_total = 1;
    writeFileSync(session.summaryPath, `${canonicalStringify(tampered)}\n`, { mode: 0o600 });
    assert.throws(() => verifyBrowserSummary(session.summaryPath, { sourceJournalPath: journalPath }), hasCode('BROWSER_SOURCE_MISMATCH'));
    tampered.observability.totals.network_total = 0;
    tampered.prohibited_artifacts.screenshots = 1;
    writeFileSync(session.summaryPath, `${canonicalStringify(tampered)}\n`, { mode: 0o600 });
    assert.throws(() => verifyBrowserSummary(session.summaryPath, { sourceJournalPath: journalPath }), hasCode('PROHIBITED_BROWSER_ARTIFACT'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('standalone discard removes owned session roots across incomplete and failed lifecycles', () => {
  const parent = makeDir('servsync-browser-discard-');
  const make = () => createStandaloneBrowserEvidenceSession({ parentRoot: parent });
  try {
    let session = make();
    assert.equal(discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }).status, 'discarded');
    assert.equal(existsSync(session.root), false);
    assert.equal(discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }).status, 'already_discarded');

    session = make();
    createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle });
    assert.equal(discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }).status, 'discarded');
    assert.equal(existsSync(session.root), false);

    session = make();
    const openWriter = createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle });
    openWriter.append({ record_type: 'browser_run_started', run_id: session.runId, timestamp: '2026-07-22T15:00:00.000Z' });
    assert.equal(discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }).status, 'discarded');
    assert.equal(existsSync(session.root), false);
    assert.throws(() => openWriter.append({ record_type: 'browser_run_completed', run_id: session.runId, timestamp: '2026-07-22T15:00:01.000Z', status: 'passed', duration_ms: 1 }), hasCode('BROWSER_PROVENANCE_STATE'));

    session = make();
    const incompleteWriter = createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle });
    incompleteWriter.append({ record_type: 'browser_run_started', run_id: session.runId, timestamp: '2026-07-22T15:00:00.000Z' });
    incompleteWriter.close();
    assert.throws(() => importStandaloneBrowserJournal({ standaloneHandle: session.standaloneHandle }), hasCode('BROWSER_INCOMPLETE_JOURNAL'));
    assert.equal(discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }).status, 'discarded');
    assert.equal(existsSync(session.root), false);

    session = make();
    const terminalWriter = createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle });
    writeValidJournal(terminalWriter, session.runId);
    assert.equal(discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }).status, 'discarded');
    assert.equal(existsSync(session.root), false);

    session = make();
    writeFileSync(session.journalPath, 'occupied\n');
    assert.throws(() => createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle }), hasCode('PREEXISTING_BROWSER_JOURNAL'));
    assert.equal(discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }).status, 'discarded');
    assert.equal(existsSync(session.root), false);

    session = make();
    const importedWriter = createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle });
    writeValidJournal(importedWriter, session.runId);
    importStandaloneBrowserJournal({ standaloneHandle: session.standaloneHandle, generatedAt: '2026-07-22T15:00:02.000Z' });
    assert.equal(discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }).status, 'discarded');
    assert.equal(existsSync(session.root), false);

    const roots = [make(), make(), make()];
    for (const abandoned of roots) discardStandaloneBrowserEvidenceSession({ standaloneHandle: abandoned.standaloneHandle });
    assert.equal(roots.every((abandoned) => !existsSync(abandoned.root)), true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('standalone lifecycle handles are capability-bound', async () => {
  const parent = makeDir('servsync-browser-capability-');
  try {
    const session = createStandaloneBrowserEvidenceSession({ parentRoot: parent });
    for (const handle of [{}, { ...session.standaloneHandle }, JSON.parse(JSON.stringify(session.standaloneHandle)), new Proxy(session.standaloneHandle, {})]) {
      assert.throws(() => discardStandaloneBrowserEvidenceSession({ standaloneHandle: handle }), hasCode('INVALID_BROWSER_STANDALONE_HANDLE'));
      assert.throws(() => finalizeStandaloneBrowserEvidenceSession({ standaloneHandle: handle }), hasCode('INVALID_BROWSER_STANDALONE_HANDLE'));
    }
    const cacheBusted = await import(`../../scripts/controlled-ops/browser-importer.mjs?standalone-lifecycle=${Date.now()}`);
    assert.throws(() => cacheBusted.discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }), hasCode('INVALID_BROWSER_STANDALONE_HANDLE'));
    assert.throws(() => finalizeStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle }), hasCode('BROWSER_PROVENANCE_STATE'));
    discardStandaloneBrowserEvidenceSession({ standaloneHandle: session.standaloneHandle });
    assert.throws(() => createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle }), hasCode('BROWSER_PROVENANCE_STATE'));
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

test('browser journal failed append does not consume the next sequence number', () => {
  const parent = makeDir('servsync-browser-sequence-');
  try {
    const journalRoot = join(parent, 'journal');
    mkdirSync(journalRoot, { mode: 0o700 });
    chmodSync(journalRoot, 0o700);
    const writer = createJournalWriter(journalRoot, { journalAuthSecret: 'a'.repeat(64), provenanceMode: 'standalone' });
    assert.throws(() => writer.append({ record_type: 'browser_run_started', timestamp: '2026-07-22T15:00:00.000Z' }), (error) => ['INVALID_BROWSER_ID', 'INVALID_CANONICAL_VALUE'].includes(error?.code));
    writer.append({ record_type: 'browser_run_started', run_id: 'browser-run-local', timestamp: '2026-07-22T15:00:00.000Z' });
    writer.append({ record_type: 'browser_run_completed', run_id: 'browser-run-local', timestamp: '2026-07-22T15:00:01.000Z', status: 'passed', duration_ms: 1000 });
    writer.close();
    const content = readFileSync(writer.journalPath, 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(content.map((record) => record.sequence), [1, 2]);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('trusted browser import rejects attempts missing Slice 2B aggregate summaries', () => {
  const parent = makeDir('servsync-browser-missing-aggregate-');
  try {
    const session = createStandaloneBrowserEvidenceSession({ parentRoot: parent });
    const writer = createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle });
    const specPath = 'tests/controlled-ops/browser-pilot/pilot.spec.ts';
    const safeLabel = 'synthetic-form-submit';
    const testId = testIdFor({ specPath, project: 'chromium', safeLabel });
    const attemptId = attemptIdFor({ testId, retryIndex: 0, workerIndex: 0 });
    writer.append({ record_type: 'browser_run_started', run_id: session.runId, timestamp: '2026-07-22T15:00:00.000Z' });
    writer.append({ record_type: 'browser_test_started', run_id: session.runId, timestamp: '2026-07-22T15:00:00.100Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel });
    writer.append({ record_type: 'browser_test_completed', run_id: session.runId, timestamp: '2026-07-22T15:00:00.800Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, status: 'passed', duration_ms: 700, error_classification: 'none' });
    writer.append({ record_type: 'browser_run_completed', run_id: session.runId, timestamp: '2026-07-22T15:00:01.000Z', status: 'passed', duration_ms: 1000, error_classification: 'none' });
    writer.close();
    assert.throws(() => importStandaloneBrowserJournal({ standaloneHandle: session.standaloneHandle }), hasCode('BROWSER_INCOMPLETE_JOURNAL'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('trusted browser import rejects any unexpected retained output-root file', () => {
  const parent = makeDir('servsync-browser-output-root-');
  try {
    const session = createStandaloneBrowserEvidenceSession({ parentRoot: parent });
    const writer = createStandaloneBrowserJournalWriter({ standaloneHandle: session.standaloneHandle });
    writeValidJournal(writer, session.runId);
    writeFileSync(join(session.outputRoot, 'unexpected.txt'), 'synthetic', { mode: 0o600 });
    assert.throws(() => importStandaloneBrowserJournal({ standaloneHandle: session.standaloneHandle }), hasCode('PROHIBITED_BROWSER_ARTIFACT'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
