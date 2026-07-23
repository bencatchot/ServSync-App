import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  BROWSER_OBSERVABILITY_ATTACHMENT_NAME,
  BROWSER_OBSERVABILITY_MIME_TYPE,
  BROWSER_OBSERVABILITY_SCHEMA,
  createEmptyBrowserObservabilityAggregates,
} from '../../scripts/controlled-ops/browser-collectors.mjs';
import { createBrowserLaunchContract } from '../../scripts/controlled-ops/browser-launch-policy.mjs';
import ControlledOpsBrowserReporter from '../../scripts/controlled-ops/playwright-reporter.mjs';
import { readJournal } from '../../scripts/controlled-ops/browser-journal.mjs';
import { attemptIdFor, testIdFor } from '../../scripts/controlled-ops/browser-schema.mjs';
import { canonicalStringify } from '../../scripts/controlled-ops/internal.mjs';

function tempRoot() {
  const root = mkdtempSync(join('/private/tmp', 'servsync-browser-reporter-'));
  chmodSync(root, 0o700);
  return root;
}

function hasCode(code) {
  return (error) => error?.code === code;
}

function attachmentFor({ runId, specPath, safeLabel, sourceManifestDigest }) {
  const testId = testIdFor({ specPath, project: 'chromium', safeLabel });
  const attemptId = attemptIdFor({ testId, retryIndex: 0, workerIndex: 0 });
  const envelope = {
    schema_version: BROWSER_OBSERVABILITY_SCHEMA,
    run_id: runId,
    source_manifest_digest: sourceManifestDigest,
    test_id: testId,
    attempt_id: attemptId,
    worker_index: 0,
    retry_index: 0,
    safe_label: safeLabel,
    spec_path: specPath,
    collection_started_utc: '2026-07-22T15:00:00.000Z',
    collection_completed_utc: '2026-07-22T15:00:01.000Z',
    ...createEmptyBrowserObservabilityAggregates(),
  };
  return {
    name: BROWSER_OBSERVABILITY_ATTACHMENT_NAME,
    contentType: BROWSER_OBSERVABILITY_MIME_TYPE,
    body: Buffer.from(`${canonicalStringify(envelope)}\n`),
  };
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
    const testCase = { id: 'test-case-1', title: 'synthetic-form-submit', location: { file: join(process.cwd(), 'tests/controlled-ops/browser-pilot/pilot.spec.ts') } };
    const suite = { allTests: () => [testCase] };
    reporter.onBegin(config, suite);
    reporter.onTestBegin(testCase, { workerIndex: 0, retry: 0 });
    reporter.onStepEnd(testCase, {}, { category: 'test.step', title: 'open-local-page', duration: 5 });
    reporter.onStepEnd(testCase, {}, { category: 'test.step', title: 'confirm-success-state', duration: 5, error: new Error('assertion failed') });
    const specPath = 'tests/controlled-ops/browser-pilot/pilot.spec.ts';
    reporter.onTestEnd(testCase, {
      status: 'passed',
      duration: 25,
      attachments: [attachmentFor({ runId: launch.descriptor.run_id, sourceManifestDigest: launch.descriptor.source_manifest_digest, specPath, safeLabel: 'synthetic-form-submit' })],
    });
    reporter.onEnd({ status: 'passed' });
    const journal = readJournal(join(journalRoot, 'browser-journal.ndjson'));
    assert.equal(journal.records[0].record_type, 'browser_run_started');
    assert.equal(journal.records[0].source_binding_mode, 'current_source_snapshot');
    assert.equal(journal.records[0].source_manifest_digest, launch.descriptor.source_manifest_digest);
    assert.equal(journal.records.at(-1).record_type, 'browser_run_completed');
    assert.equal(journal.records.filter((record) => record.record_type === 'browser_step_completed').length, 2);
    assert.deepEqual(journal.records.slice(4, 8).map((record) => record.record_type), [
      'browser_console_summary',
      'browser_page_error_summary',
      'browser_network_summary',
      'browser_test_completed',
    ]);
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

test('controlled-ops reporter rejects missing duplicate or path-backed observability attachments', () => {
  const parent = tempRoot();
  try {
    const makeReporter = (suffix) => {
      const launch = createBrowserLaunchContract({
        root: join(parent, `launch-${suffix}`),
        baseURL: 'http://127.0.0.1:43210',
        runLabel: 'synthetic-form-submit',
      });
      const reporter = new ControlledOpsBrowserReporter({
        descriptorPath: launch.descriptorPath,
        journalAuthSecret: launch.journalAuthSecret,
        journalRoot: join(parent, `journal-${suffix}`),
        nonce: launch.nonce,
        baseURL: 'http://127.0.0.1:43210',
        runLabel: 'synthetic-form-submit',
      });
      const testCase = { id: `test-case-${suffix}`, title: 'synthetic-form-submit', location: { file: join(process.cwd(), 'tests/controlled-ops/browser-pilot/pilot.spec.ts') } };
      const config = { projects: [{ name: 'chromium', retries: 0 }], workers: 1, fullyParallel: false };
      const suite = { allTests: () => [testCase] };
      reporter.onBegin(config, suite);
      reporter.onTestBegin(testCase, { workerIndex: 0, retry: 0 });
      return { reporter, testCase, attachment: attachmentFor({ runId: launch.descriptor.run_id, sourceManifestDigest: launch.descriptor.source_manifest_digest, specPath: 'tests/controlled-ops/browser-pilot/pilot.spec.ts', safeLabel: 'synthetic-form-submit' }) };
    };
    const missing = makeReporter('missing');
    missing.reporter.onTestEnd(missing.testCase, { status: 'passed', duration: 1, attachments: [] });
    missing.reporter.onEnd({ status: 'failed' });
    const missingJournal = readJournal(join(parent, 'journal-missing', 'browser-journal.ndjson'));
    assert.equal(missingJournal.records.find((record) => record.record_type === 'browser_console_summary').console_aggregate.completeness_status, 'incomplete_missing_attachment');
    const duplicate = makeReporter('duplicate');
    duplicate.reporter.onTestEnd(duplicate.testCase, { status: 'passed', duration: 1, attachments: [duplicate.attachment, duplicate.attachment] });
    const pathBacked = makeReporter('path-backed');
    pathBacked.reporter.onTestEnd(pathBacked.testCase, { status: 'passed', duration: 1, attachments: [{ ...pathBacked.attachment, body: undefined, path: join(parent, 'unsafe.json') }] });
    const extraBody = makeReporter('extra-body');
    extraBody.reporter.onTestEnd(extraBody.testCase, { status: 'passed', duration: 1, attachments: [extraBody.attachment, { name: 'uncontrolled-extra', contentType: 'text/plain', body: Buffer.from('ignored') }] });
    const wrongDigest = makeReporter('wrong-digest');
    const forged = attachmentFor({ runId: wrongDigest.attachment ? JSON.parse(wrongDigest.attachment.body.toString('utf8')).run_id : 'browser-run-local', sourceManifestDigest: 'f'.repeat(64), specPath: 'tests/controlled-ops/browser-pilot/pilot.spec.ts', safeLabel: 'synthetic-form-submit' });
    wrongDigest.reporter.onTestEnd(wrongDigest.testCase, { status: 'passed', duration: 1, attachments: [forged] });
    wrongDigest.reporter.onEnd({ status: 'failed' });
    const wrongDigestJournal = readJournal(join(parent, 'journal-wrong-digest', 'browser-journal.ndjson'));
    assert.equal(wrongDigestJournal.records[0].source_binding_mode, 'current_source_snapshot');
    assert.notEqual(wrongDigestJournal.records[0].source_manifest_digest, 'f'.repeat(64));
    assert.equal(wrongDigestJournal.records.find((record) => record.record_type === 'browser_console_summary').console_aggregate.completeness_status, 'incomplete_invalid_attachment');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('controlled-ops reporter rejects non-allowlisted or expanded source suites before journaling', () => {
  const parent = tempRoot();
  try {
    const makeReporter = (suffix) => {
      const launch = createBrowserLaunchContract({
        root: join(parent, `launch-source-${suffix}`),
        baseURL: 'http://127.0.0.1:43210',
        runLabel: 'synthetic-form-submit',
      });
      return new ControlledOpsBrowserReporter({
        descriptorPath: launch.descriptorPath,
        journalAuthSecret: launch.journalAuthSecret,
        journalRoot: join(parent, `journal-source-${suffix}`),
        nonce: launch.nonce,
        baseURL: 'http://127.0.0.1:43210',
        runLabel: 'synthetic-form-submit',
      });
    };
    const config = { projects: [{ name: 'chromium', retries: 0 }], workers: 1, fullyParallel: false };
    const snapshotBound = { id: 'snapshot-bound', title: 'synthetic-form-submit', location: { file: join(process.cwd(), 'tests/controlled-ops/browser-pilot/pilot.spec.ts') } };
    const uncontrolled = { id: 'uncontrolled', title: 'synthetic-form-submit', location: { file: join(process.cwd(), 'tests/controlled-ops/browser-pilot/uncontrolled.spec.ts') } };
    assert.throws(() => makeReporter('direct').onBegin(config, { allTests: () => [uncontrolled] }), hasCode('BROWSER_SOURCE_MANIFEST_MISMATCH'));
    assert.throws(() => makeReporter('extra').onBegin(config, { allTests: () => [snapshotBound, uncontrolled] }), hasCode('BROWSER_SOURCE_MANIFEST_MISMATCH'));
    assert.throws(() => makeReporter('retry').onBegin({ projects: [{ name: 'chromium', retries: 1 }], workers: 1, fullyParallel: false }, { allTests: () => [snapshotBound] }), hasCode('BROWSER_REPORTER_CONFIG'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
