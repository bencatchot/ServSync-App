import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_LIMITS,
  BROWSER_SUMMARY_SCHEMA,
  BROWSER_TOOL_VERSION,
  attemptIdFor,
  buildBrowserRecord,
  parseBrowserJournal,
  testIdFor,
  validateBrowserSafeLabel,
  validateBrowserUrl,
  validateSummary,
} from '../../scripts/controlled-ops/browser-schema.mjs';
import { GENESIS_HASH, canonicalStringify } from '../../scripts/controlled-ops/internal.mjs';

function hasCode(code) {
  return (error) => error?.code === code;
}

function makeJournal() {
  const started = buildBrowserRecord(GENESIS_HASH, {
    sequence: 1,
    record_type: 'browser_run_started',
    run_id: 'browser-run-local',
    timestamp: '2026-07-22T15:00:00.000Z',
  });
  const completed = buildBrowserRecord(started.current_record_hash, {
    sequence: 2,
    record_type: 'browser_run_completed',
    run_id: 'browser-run-local',
    timestamp: '2026-07-22T15:00:01.000Z',
    status: 'passed',
    duration_ms: 1000,
  });
  return `${canonicalStringify(started)}\n${canonicalStringify(completed)}\n`;
}

test('browser schema accepts only loopback browser targets', () => {
  assert.equal(validateBrowserUrl('http://127.0.0.1:4100/'), 'http://127.0.0.1:4100');
  assert.throws(() => validateBrowserUrl('https://127.0.0.1:4100/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://127.0.0.1/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://127.0.0.1:4100/?token=value'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://localhost:4100/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://2130706433:4100/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://0x7f000001:4100/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://017700000001:4100/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://127.1:4100/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://[::1]:4100/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://127.0.0.1.:4100/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://127.0.0.1:4100@other-host/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://127.0.0.1:04100/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://127.0.0.1:99999/'), hasCode('INVALID_BROWSER_TARGET'));
  assert.throws(() => validateBrowserUrl('http://example.com:4100/'), hasCode('INVALID_BROWSER_TARGET'));
});

test('browser safe labels reject opaque or unsafe content', () => {
  assert.equal(validateBrowserSafeLabel('synthetic-form-submit'), 'synthetic-form-submit');
  assert.throws(() => validateBrowserSafeLabel('test-user@example.com'), (error) => ['INVALID_LABEL', 'UNSAFE_CALLER_METADATA'].includes(error?.code));
  assert.throws(() => validateBrowserSafeLabel('eyJaaaaabbbbb.cccccddddd.eeeeefffff'), (error) => ['INVALID_LABEL', 'UNSAFE_CALLER_METADATA'].includes(error?.code));
});

test('journal parser enforces canonical hash-chained records', () => {
  const parsed = parseBrowserJournal(makeJournal());
  assert.equal(parsed.records.length, 2);
  assert.throws(() => parseBrowserJournal(makeJournal().replace('"sequence":1', '"sequence" : 1')), hasCode('BROWSER_NONCANONICAL_RECORD'));
  assert.throws(() => parseBrowserJournal(makeJournal().replace('2026-07-22T15:00:01.000Z', '2026-07-22T14:59:59.000Z')), (error) => ['BROWSER_TIMESTAMP_REGRESSION', 'BROWSER_HASH_CHAIN_MISMATCH'].includes(error?.code));
});

test('browser summary validates reconciled counts and safe identifiers', () => {
  const testId = testIdFor({
    specPath: 'tests/controlled-ops/browser-pilot/pilot.spec.ts',
    project: 'chromium',
    safeLabel: 'synthetic-form-submit',
  });
  const summary = {
    schema_version: BROWSER_SUMMARY_SCHEMA,
    tool_version: BROWSER_TOOL_VERSION,
    generated_utc: '2026-07-22T15:00:02.000Z',
    source_journal_sha256: 'a'.repeat(64),
    run_id: 'browser-run-local',
    target_classification: 'local',
    project: 'chromium',
    worker_count: 1,
    retry_limit: BROWSER_LIMITS.retry_index_max,
    started_utc: '2026-07-22T15:00:00.000Z',
    completed_utc: '2026-07-22T15:00:01.000Z',
    duration_ms: 1000,
    status: 'passed',
    counts: { started: 1, passed: 1, failed: 0, timed_out: 0, skipped: 0, interrupted: 0, incomplete: 0, steps: 3 },
    tests: [{
      test_id: testId,
      attempt_id: 'attempt-2f6f18aca72856912b5fac01',
      spec_path: 'tests/controlled-ops/browser-pilot/pilot.spec.ts',
      safe_label: 'synthetic-form-submit',
      project: 'chromium',
      worker_index: 0,
      retry_index: 0,
      status: 'passed',
      duration_ms: 900,
      error_classification: 'none',
      step_count: 3,
    }],
    prohibited_artifacts: { screenshots: 0, traces: 0, videos: 0, hars: 0, html_reports: 0, storage_states: 0 },
  };
  summary.tests[0].attempt_id = attemptIdFor({ testId, retryIndex: 0, workerIndex: 0 });
  assert.equal(validateSummary(summary).status, 'passed');
  summary.counts.failed = 1;
  assert.throws(() => validateSummary(summary), hasCode('BROWSER_COUNT_MISMATCH'));
});
