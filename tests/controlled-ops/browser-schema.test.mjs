import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_LIMITS,
  BROWSER_JOURNAL_SCHEMA,
  BROWSER_SUMMARY_SCHEMA,
  BROWSER_TOOL_VERSION,
  attemptIdFor,
  buildBrowserRecord,
  computeBrowserRunAuthTag,
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

function zero(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function emptyObservability() {
  return {
    console: {
      total_count: 0,
      type_counts: zero(['log', 'info', 'warning', 'error', 'debug', 'trace', 'other']),
      severity_counts: zero(['debug', 'info', 'warning', 'error', 'other']),
      safe_message_class_counts: zero(['synthetic_safe', 'unclassified']),
      rejected_event_count: 0,
      rejected_sensitive_count: 0,
      rejected_customer_content_count: 0,
      invalid_event_count: 0,
      overflow_count: 0,
      late_event_count: 0,
      listener_error_count: 0,
      first_observed_utc: null,
      last_observed_utc: null,
      completeness_status: 'complete',
      collector_failure_class: 'none',
    },
    page_error: {
      total_count: 0,
      error_kind_counts: zero(['error', 'dom_exception', 'thrown_primitive', 'thrown_object', 'unknown']),
      safe_message_class_counts: zero(['synthetic_safe', 'unclassified']),
      stack_present_count: 0,
      origin_class_counts: zero(['local_page', 'unknown']),
      duplicate_count: 0,
      rejected_event_count: 0,
      rejected_sensitive_count: 0,
      rejected_customer_content_count: 0,
      invalid_event_count: 0,
      overflow_count: 0,
      late_event_count: 0,
      listener_error_count: 0,
      first_observed_utc: null,
      last_observed_utc: null,
      completeness_status: 'complete',
      collector_failure_class: 'none',
    },
    network: {
      total_requests: 0,
      method_class_counts: zero(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER']),
      origin_class_counts: zero(['exact_local_origin', 'rejected_external', 'invalid', 'non_http_special']),
      route_class_counts: zero(['root', 'submit', 'health', 'redirect', 'redirect_target', 'static_asset', 'unknown_static', 'unknown_dynamic']),
      resource_type_counts: zero(['document', 'stylesheet', 'image', 'media', 'font', 'script', 'texttrack', 'xhr', 'fetch', 'eventsource', 'websocket', 'manifest', 'other']),
      navigation_count: 0,
      subresource_count: 0,
      status_class_counts: zero(['1xx', '2xx', '3xx', '4xx', '5xx', 'no_response']),
      failure_class_counts: zero(['blocked_by_policy', 'aborted', 'connection', 'timeout', 'other', 'unknown']),
      redirect_count: 0,
      rejected_egress_class_counts: zero(['invalid', 'rejected_external', 'alternate_port', 'websocket', 'worker', 'other']),
      terminal_response_count: 0,
      terminal_failure_count: 0,
      unresolved_request_count: 0,
      duplicate_terminal_count: 0,
      unexpected_page_count: 0,
      websocket_attempt_count: 0,
      worker_attempt_count: 0,
      overflow_count: 0,
      late_event_count: 0,
      listener_error_count: 0,
      completeness_status: 'complete',
      collector_failure_class: 'none',
    },
  };
}

function makeJournal() {
  const started = buildBrowserRecord(GENESIS_HASH, {
    sequence: 1,
    record_type: 'browser_run_started',
    run_id: 'browser-run-local',
    timestamp: '2026-07-22T15:00:00.000Z',
  });
  const completedInput = {
    sequence: 2,
    record_type: 'browser_run_completed',
    run_id: 'browser-run-local',
    timestamp: '2026-07-22T15:00:01.000Z',
    status: 'passed',
    duration_ms: 1000,
  };
  const completed = buildBrowserRecord(started.current_record_hash, {
    ...completedInput,
    run_auth_tag: computeBrowserRunAuthTag('f'.repeat(64), {
      schema_version: BROWSER_JOURNAL_SCHEMA,
      sequence: completedInput.sequence,
      record_type: completedInput.record_type,
      run_id: completedInput.run_id,
      provenance_mode: 'standalone',
      source_binding_mode: null,
      source_manifest_digest: null,
      timestamp: completedInput.timestamp,
      target_classification: 'local',
      project: 'chromium',
      worker_index: null,
      retry_index: null,
      spec_path: null,
      test_id: null,
      attempt_id: null,
      safe_label: null,
      status: completedInput.status,
      duration_ms: completedInput.duration_ms,
      error_classification: 'none',
      console_aggregate: null,
      page_error_aggregate: null,
      network_aggregate: null,
      run_auth_tag: null,
      previous_record_hash: started.current_record_hash,
    }),
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

test('browser schema rejects retries beyond Slice 2B and impossible observability aggregates', () => {
  const testId = testIdFor({
    specPath: 'tests/controlled-ops/browser-pilot/pilot.spec.ts',
    project: 'chromium',
    safeLabel: 'synthetic-form-submit',
  });
  assert.throws(() => attemptIdFor({ testId, retryIndex: 1, workerIndex: 0 }), hasCode('INVALID_BROWSER_RECORD'));

  const base = emptyObservability();
  base.console.total_count = 1;
  base.console.type_counts.log = 1;
  base.console.severity_counts.info = 1;
  assert.throws(() => validateSummary({
    schema_version: BROWSER_SUMMARY_SCHEMA,
    tool_version: BROWSER_TOOL_VERSION,
    generated_utc: '2026-07-22T15:00:02.000Z',
    source_journal_sha256: 'a'.repeat(64),
    run_id: 'browser-run-local',
    source_binding_mode: 'none',
    source_manifest_digest: null,
    packet_binding_mode: 'none',
    operation_id: null,
    stage_id: null,
    execution_token_id: null,
    command_category: null,
    binding_digest: null,
    target_classification: 'local',
    project: 'chromium',
    worker_count: 1,
    retry_limit: BROWSER_LIMITS.retry_index_max,
    started_utc: '2026-07-22T15:00:00.000Z',
    completed_utc: '2026-07-22T15:00:01.000Z',
    duration_ms: 1000,
    status: 'passed',
    counts: { started: 1, passed: 1, failed: 0, timed_out: 0, skipped: 0, interrupted: 0, incomplete: 0, steps: 0 },
    tests: [{
      test_id: testId,
      attempt_id: attemptIdFor({ testId, retryIndex: 0, workerIndex: 0 }),
      spec_path: 'tests/controlled-ops/browser-pilot/pilot.spec.ts',
      safe_label: 'synthetic-form-submit',
      project: 'chromium',
      worker_index: 0,
      retry_index: 0,
      status: 'passed',
      duration_ms: 900,
      error_classification: 'none',
      step_count: 0,
      observability: base,
    }],
    observability: { completeness_status: 'complete', totals: { console_total: 1, page_error_total: 0, network_total: 0, overflow_total: 0, rejected_sensitive_total: 0, rejected_customer_content_total: 0, collector_failure_total: 0 } },
    prohibited_artifacts: { screenshots: 0, traces: 0, videos: 0, hars: 0, html_reports: 0, storage_states: 0 },
  }), hasCode('BROWSER_OBSERVABILITY_COUNT_MISMATCH'));
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
    source_binding_mode: 'none',
    source_manifest_digest: null,
    packet_binding_mode: 'none',
    operation_id: null,
    stage_id: null,
    execution_token_id: null,
    command_category: null,
    binding_digest: null,
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
      observability: emptyObservability(),
    }],
    observability: {
      completeness_status: 'complete',
      totals: {
        console_total: 0,
        page_error_total: 0,
        network_total: 0,
        overflow_total: 0,
        rejected_sensitive_total: 0,
        rejected_customer_content_total: 0,
        collector_failure_total: 0,
      },
    },
    prohibited_artifacts: { screenshots: 0, traces: 0, videos: 0, hars: 0, html_reports: 0, storage_states: 0 },
  };
  summary.tests[0].attempt_id = attemptIdFor({ testId, retryIndex: 0, workerIndex: 0 });
  assert.equal(validateSummary(summary).status, 'passed');
  summary.counts.failed = 1;
  assert.throws(() => validateSummary(summary), hasCode('BROWSER_COUNT_MISMATCH'));
});

test('browser source binding schema distinguishes generated snapshots from standalone evidence', () => {
  const digest = 'b'.repeat(64);
  const generatedStart = buildBrowserRecord(GENESIS_HASH, {
    sequence: 1,
    record_type: 'browser_run_started',
    run_id: 'browser-run-local',
    provenance_mode: 'generated_workspace',
    source_binding_mode: 'current_source_snapshot',
    source_manifest_digest: digest,
    timestamp: '2026-07-22T15:00:00.000Z',
  });
  assert.equal(generatedStart.source_manifest_digest, digest);
  assert.throws(() => buildBrowserRecord(GENESIS_HASH, {
    sequence: 1,
    record_type: 'browser_run_started',
    run_id: 'browser-run-local',
    provenance_mode: 'generated_workspace',
    source_binding_mode: 'current_source_snapshot',
    timestamp: '2026-07-22T15:00:00.000Z',
  }), hasCode('INVALID_BROWSER_SOURCE_BINDING'));
  assert.throws(() => buildBrowserRecord(GENESIS_HASH, {
    sequence: 1,
    record_type: 'browser_run_started',
    run_id: 'browser-run-local',
    provenance_mode: 'generated_workspace',
    source_binding_mode: 'none',
    source_manifest_digest: null,
    timestamp: '2026-07-22T15:00:00.000Z',
  }), hasCode('INVALID_BROWSER_SOURCE_BINDING'));
  assert.throws(() => buildBrowserRecord(GENESIS_HASH, {
    sequence: 1,
    record_type: 'browser_run_started',
    run_id: 'browser-run-local',
    provenance_mode: 'standalone',
    source_binding_mode: 'current_source_snapshot',
    source_manifest_digest: digest,
    timestamp: '2026-07-22T15:00:00.000Z',
  }), hasCode('INVALID_BROWSER_SOURCE_BINDING'));
  assert.throws(() => buildBrowserRecord(GENESIS_HASH, {
    sequence: 1,
    record_type: 'browser_test_started',
    run_id: 'browser-run-local',
    source_binding_mode: 'none',
    timestamp: '2026-07-22T15:00:00.000Z',
    worker_index: 0,
    retry_index: 0,
    spec_path: 'tests/controlled-ops/browser-pilot/pilot.spec.ts',
    test_id: testIdFor({ specPath: 'tests/controlled-ops/browser-pilot/pilot.spec.ts', project: 'chromium', safeLabel: 'synthetic-form-submit' }),
    attempt_id: 'attempt-2f6f18aca72856912b5fac01',
    safe_label: 'synthetic-form-submit',
  }), hasCode('INVALID_BROWSER_SOURCE_BINDING'));
  assert.throws(() => validateSummary({
    schema_version: BROWSER_SUMMARY_SCHEMA,
    tool_version: BROWSER_TOOL_VERSION,
    generated_utc: '2026-07-22T15:00:02.000Z',
    source_journal_sha256: 'a'.repeat(64),
    run_id: 'browser-run-local',
    source_binding_mode: 'current_source_snapshot',
    source_manifest_digest: null,
    packet_binding_mode: 'none',
    operation_id: null,
    stage_id: null,
    execution_token_id: null,
    command_category: null,
    binding_digest: null,
    target_classification: 'local',
    project: 'chromium',
    worker_count: 1,
    retry_limit: BROWSER_LIMITS.retry_index_max,
    started_utc: '2026-07-22T15:00:00.000Z',
    completed_utc: '2026-07-22T15:00:01.000Z',
    duration_ms: 1000,
    status: 'passed',
    counts: { started: 0, passed: 0, failed: 0, timed_out: 0, skipped: 0, interrupted: 0, incomplete: 0, steps: 0 },
    tests: [],
    observability: { completeness_status: 'complete', totals: { console_total: 0, page_error_total: 0, network_total: 0, overflow_total: 0, rejected_sensitive_total: 0, rejected_customer_content_total: 0, collector_failure_total: 0 } },
    prohibited_artifacts: { screenshots: 0, traces: 0, videos: 0, hars: 0, html_reports: 0, storage_states: 0 },
  }), hasCode('INVALID_BROWSER_SOURCE_BINDING'));
});
