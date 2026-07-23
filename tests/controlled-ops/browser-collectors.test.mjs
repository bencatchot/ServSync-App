import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import {
  BROWSER_OBSERVABILITY_SCHEMA,
  classifySafeBrowserUrl,
  createBrowserObservabilityState,
  createEmptyBrowserObservabilityAggregates,
  finalizeBrowserObservability,
  observeConsoleEvent,
  observePageErrorEvent,
  observeRequestEvent,
  observeRequestFailedEvent,
  observeResponseEvent,
  parseBrowserObservabilityAttachment,
  validateBrowserObservabilityEnvelope,
} from '../../scripts/controlled-ops/browser-collectors.mjs';
import { BROWSER_LIMITS, attemptIdFor, testIdFor } from '../../scripts/controlled-ops/browser-schema.mjs';
import { canonicalStringify } from '../../scripts/controlled-ops/internal.mjs';

function hasCode(code) {
  return (error) => error?.code === code;
}

function testInfo(overrides = {}) {
  return {
    file: join(process.cwd(), 'tests/controlled-ops/browser-pilot/pilot.spec.ts'),
    title: 'synthetic-form-submit',
    workerIndex: 0,
    retry: 0,
    ...overrides,
  };
}

function state() {
  return createBrowserObservabilityState({
    runId: 'browser-run-local',
    testInfo: testInfo(),
    baseURL: 'http://127.0.0.1:41234',
  });
}

test('console collector never serializes argument objects and retains only fixed classes', () => {
  const current = state();
  let argsCalled = false;
  observeConsoleEvent(current, {
    type: () => 'log',
    text: () => 'controlled-ops-synthetic-console',
    args: () => { argsCalled = true; throw new Error('must-not-inspect'); },
  });
  const body = finalizeBrowserObservability(current);
  const envelope = parseBrowserObservabilityAttachment(body);
  assert.equal(argsCalled, false);
  assert.equal(envelope.console_aggregate.total_count, 1);
  assert.equal(envelope.console_aggregate.safe_message_class_counts.synthetic_safe, 1);
  assert.equal(body.includes('controlled-ops-synthetic-console'), false);
});

test('console collector rejects secret-like and customer-like text without retaining raw text', () => {
  const current = state();
  observeConsoleEvent(current, { type: () => 'error', text: () => 'Bearer abcdefghijklmnopqrstuvwxyz' });
  observeConsoleEvent(current, { type: () => 'warn', text: () => 'customer@example.invalid' });
  const body = finalizeBrowserObservability(current);
  const envelope = parseBrowserObservabilityAttachment(body);
  assert.ok(envelope.console_aggregate.rejected_sensitive_count >= 1);
  assert.equal(envelope.console_aggregate.rejected_customer_content_count, 1);
  assert.equal(body.includes('Bearer'), false);
  assert.equal(body.includes('customer@example'), false);
});

test('page-error collector classifies values without retaining messages or stacks', () => {
  const current = state();
  const error = new Error('controlled-ops-synthetic-page-error');
  error.stack = 'Error: controlled-ops-synthetic-page-error\n    at local';
  observePageErrorEvent(current, error);
  observePageErrorEvent(current, 'primitive-value');
  const body = finalizeBrowserObservability(current);
  const envelope = parseBrowserObservabilityAttachment(body);
  assert.equal(envelope.page_error_aggregate.total_count, 2);
  assert.equal(envelope.page_error_aggregate.error_kind_counts.error, 1);
  assert.equal(envelope.page_error_aggregate.error_kind_counts.thrown_primitive, 1);
  assert.equal(envelope.page_error_aggregate.stack_present_count, 1);
  assert.equal(body.includes('controlled-ops-synthetic-page-error'), false);
  assert.equal(body.includes('primitive-value'), false);
});

test('page-error collector rejects sensitive and customer content without retaining raw fields', () => {
  const current = state();
  observePageErrorEvent(current, new Error('Bearer abcdefghijklmnopqrstuvwxyz'));
  observePageErrorEvent(current, new Error('customer@example.invalid'));
  const body = finalizeBrowserObservability(current);
  const envelope = parseBrowserObservabilityAttachment(body);
  assert.ok(envelope.page_error_aggregate.rejected_sensitive_count >= 1);
  assert.equal(envelope.page_error_aggregate.rejected_customer_content_count, 1);
  assert.equal(body.includes('Bearer'), false);
  assert.equal(body.includes('customer@example'), false);
});


test('network collector keeps URL, header, and body material out of the envelope', () => {
  const current = state();
  const request = {
    url: () => 'http://127.0.0.1:41234/submit?token=discarded',
    method: () => 'POST',
    resourceType: () => 'fetch',
    isNavigationRequest: () => false,
    redirectedFrom: () => null,
    headers: () => { throw new Error('must-not-read-headers'); },
    postData: () => { throw new Error('must-not-read-body'); },
  };
  observeRequestEvent(current, request);
  observeResponseEvent(current, { status: () => 200, headers: () => { throw new Error('must-not-read-response-headers'); } });
  observeRequestFailedEvent(current, { failure: () => ({ errorText: 'blockedbyclient' }) });
  const body = finalizeBrowserObservability(current);
  const envelope = parseBrowserObservabilityAttachment(body);
  assert.equal(envelope.network_aggregate.total_requests, 1);
  assert.equal(envelope.network_aggregate.method_class_counts.POST, 1);
  assert.equal(envelope.network_aggregate.route_class_counts.submit, 1);
  assert.equal(envelope.network_aggregate.status_class_counts['2xx'], 1);
  assert.equal(envelope.network_aggregate.failure_class_counts.blocked_by_policy, 1);
  assert.equal(body.includes('token'), false);
  assert.equal(body.includes('fragment'), false);
  assert.equal(body.includes('discarded'), false);
});

test('URL classifier discards raw dynamic paths and rejects nonlocal spellings', () => {
  assert.deepEqual(classifySafeBrowserUrl('http://127.0.0.1:41234/static/pilot.css', 'http://127.0.0.1:41234'), {
    origin_class: 'exact_local_origin',
    route_class: 'static_asset',
  });
  assert.deepEqual(classifySafeBrowserUrl('http://127.0.0.1:41234/jobs/123456789', 'http://127.0.0.1:41234'), {
    origin_class: 'exact_local_origin',
    route_class: 'unknown_dynamic',
  });
  assert.deepEqual(classifySafeBrowserUrl('http://localhost:41234/', 'http://127.0.0.1:41234'), {
    origin_class: 'invalid',
    route_class: 'unknown_dynamic',
  });
});

test('attachment envelope is canonical, exact, bounded, and identity-bound', () => {
  const specPath = 'tests/controlled-ops/browser-pilot/pilot.spec.ts';
  const safeLabel = 'synthetic-form-submit';
  const testId = testIdFor({ specPath, project: 'chromium', safeLabel });
  const envelope = {
    schema_version: BROWSER_OBSERVABILITY_SCHEMA,
    run_id: 'browser-run-local',
    test_id: testId,
    attempt_id: attemptIdFor({ testId, retryIndex: 0, workerIndex: 0 }),
    worker_index: 0,
    retry_index: 0,
    safe_label: safeLabel,
    spec_path: specPath,
    collection_started_utc: '2026-07-22T15:00:00.000Z',
    collection_completed_utc: '2026-07-22T15:00:01.000Z',
    ...createEmptyBrowserObservabilityAggregates(),
  };
  const body = Buffer.from(`${canonicalStringify(envelope)}\n`);
  assert.deepEqual(parseBrowserObservabilityAttachment(body), validateBrowserObservabilityEnvelope(envelope));
  assert.throws(() => parseBrowserObservabilityAttachment(Buffer.from(`${JSON.stringify(envelope)}\n`)), hasCode('BROWSER_OBSERVABILITY_NONCANONICAL'));
  assert.throws(() => validateBrowserObservabilityEnvelope({ ...envelope, extra: true }), /unknown field/);
});

test('collector overflow marks evidence incomplete without retaining triggering values', () => {
  const current = state();
  for (let index = 0; index <= BROWSER_LIMITS.console_events_per_attempt; index += 1) {
    observeConsoleEvent(current, { type: () => 'log', text: () => 'ordinary-message' });
  }
  const envelope = parseBrowserObservabilityAttachment(finalizeBrowserObservability(current));
  assert.equal(envelope.console_aggregate.total_count, BROWSER_LIMITS.console_events_per_attempt);
  assert.equal(envelope.console_aggregate.overflow_count, 1);
  assert.equal(envelope.console_aggregate.completeness_status, 'incomplete_over_limit');
});
