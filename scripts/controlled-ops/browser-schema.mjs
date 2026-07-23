import { createHash, createHmac, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import {
  GENESIS_HASH,
  EvidenceError,
  assertExactObject,
  canonicalStringify,
  compareStrings,
  sha256,
  validateControlledSlug,
  validateRelativePath,
  validateTimestamp,
} from './internal.mjs';
import { parseStrictJson, scanCustomerContent, scanSensitiveContent } from './sanitize.mjs';

export const BROWSER_JOURNAL_SCHEMA = 'servsync-controlled-ops/browser-journal-v1';
export const BROWSER_SUMMARY_SCHEMA = 'servsync-controlled-ops/browser-summary-v1';
export const BROWSER_TOOL_VERSION = '2b.1.0';
export const BROWSER_PROVENANCE_MODES = Object.freeze(['standalone', 'generated_workspace']);
export const SOURCE_BINDING_MODES = Object.freeze(['current_source_snapshot', 'none']);

export const BROWSER_LIMITS = Object.freeze({
  tests_per_run: 25,
  workers: 1,
  retry_index_max: 0,
  steps_per_test: 50,
  journal_records: 1400,
  line_bytes: 16 * 1024,
  journal_bytes: 512 * 1024,
  summary_bytes: 512 * 1024,
  temporary_output_bytes: 5 * 1024 * 1024,
  retained_summaries: 1,
  run_duration_ms: 120_000,
  test_duration_ms: 30_000,
  label_length: 64,
  path_length: 512,
  console_events_per_attempt: 100,
  page_errors_per_attempt: 20,
  network_requests_per_attempt: 500,
  safe_message_classes_per_attempt: 16,
  route_classes_per_attempt: 32,
  origin_classes_per_run: 10,
  aggregate_attachment_bytes: 64 * 1024,
});

export const RECORD_TYPES = Object.freeze([
  'browser_run_started',
  'browser_test_started',
  'browser_step_completed',
  'browser_console_summary',
  'browser_page_error_summary',
  'browser_network_summary',
  'browser_test_completed',
  'browser_run_completed',
]);

export const RUN_STATUSES = Object.freeze(['passed', 'failed', 'timed_out', 'interrupted', 'incomplete']);
export const TEST_STATUSES = Object.freeze(['passed', 'failed', 'timed_out', 'skipped', 'interrupted', 'incomplete']);
export const STEP_STATUSES = Object.freeze(['passed', 'failed', 'skipped']);
export const ERROR_CLASSIFICATIONS = Object.freeze(['assertion', 'timeout', 'browser', 'fixture', 'reporter', 'unknown', 'none']);
const COMPLETENESS_STATES = Object.freeze(['complete', 'incomplete_over_limit', 'incomplete_collector_error', 'incomplete_late_events', 'incomplete_missing_attachment', 'incomplete_invalid_attachment']);
const COLLECTOR_FAILURE_CLASSES = Object.freeze(['none', 'listener_install', 'listener_callback', 'sanitizer', 'attachment', 'lifecycle', 'teardown', 'unknown']);
const CONSOLE_TYPES = Object.freeze(['log', 'info', 'warning', 'error', 'debug', 'trace', 'other']);
const CONSOLE_SEVERITIES = Object.freeze(['debug', 'info', 'warning', 'error', 'other']);
const SAFE_MESSAGE_CLASSES = Object.freeze(['synthetic_safe', 'unclassified']);
const ERROR_KINDS = Object.freeze(['error', 'dom_exception', 'thrown_primitive', 'thrown_object', 'unknown']);
const PAGE_ERROR_ORIGINS = Object.freeze(['local_page', 'unknown']);
const ORIGIN_CLASSES = Object.freeze(['exact_local_origin', 'rejected_external', 'invalid', 'non_http_special']);
const ROUTE_CLASSES = Object.freeze(['root', 'submit', 'health', 'redirect', 'redirect_target', 'static_asset', 'unknown_static', 'unknown_dynamic']);
const METHOD_CLASSES = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER']);
const STATUS_CLASSES = Object.freeze(['1xx', '2xx', '3xx', '4xx', '5xx', 'no_response']);
const FAILURE_CLASSES = Object.freeze(['blocked_by_policy', 'aborted', 'connection', 'timeout', 'other', 'unknown']);
const RESOURCE_TYPES = Object.freeze(['document', 'stylesheet', 'image', 'media', 'font', 'script', 'texttrack', 'xhr', 'fetch', 'eventsource', 'websocket', 'manifest', 'other']);
const REJECTED_EGRESS_CLASSES = Object.freeze(['invalid', 'rejected_external', 'alternate_port', 'websocket', 'worker', 'other']);
const COMPLETE_ONLY_FIELDS = Object.freeze(['overflow_count', 'late_event_count', 'listener_error_count']);

export const BROWSER_RECORD_FIELDS = [
  'schema_version',
  'sequence',
  'record_type',
  'run_id',
  'provenance_mode',
  'source_binding_mode',
  'source_manifest_digest',
  'timestamp',
  'target_classification',
  'project',
  'worker_index',
  'retry_index',
  'spec_path',
  'test_id',
  'attempt_id',
  'safe_label',
  'status',
  'duration_ms',
  'error_classification',
  'console_aggregate',
  'page_error_aggregate',
  'network_aggregate',
  'run_auth_tag',
  'previous_record_hash',
  'current_record_hash',
];

export const BROWSER_SUMMARY_FIELDS = [
  'schema_version',
  'tool_version',
  'generated_utc',
  'source_journal_sha256',
  'run_id',
  'source_binding_mode',
  'source_manifest_digest',
  'target_classification',
  'project',
  'worker_count',
  'retry_limit',
  'started_utc',
  'completed_utc',
  'duration_ms',
  'status',
  'counts',
  'tests',
  'observability',
  'prohibited_artifacts',
];

export function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function decodeUtf8(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new EvidenceError('INVALID_UTF8', 'Browser evidence must be valid UTF-8.');
  }
}

export function validateBrowserSafeLabel(value, fieldName = 'browser safe label') {
  return validateControlledSlug(value, fieldName, { maxLength: BROWSER_LIMITS.label_length, allowUnderscore: false });
}

export function validateGeneratedBrowserId(value, fieldName = 'browser generated ID') {
  if (typeof value !== 'string' || value.length > 96 || !/^[a-z][a-z0-9-]{2,95}$/.test(value) || value.normalize('NFC') !== value) {
    throw new EvidenceError('INVALID_BROWSER_ID', `${fieldName} is invalid.`);
  }
  return value;
}

export function validateSourceManifestDigest(value, fieldName = 'browser source manifest digest') {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new EvidenceError('INVALID_BROWSER_SOURCE_BINDING', `${fieldName} is invalid.`);
  }
  return value;
}

export function validateBrowserSourceBinding(mode, digest, { runStart = false } = {}) {
  if (!runStart) {
    if (mode !== null || digest !== null) {
      throw new EvidenceError('INVALID_BROWSER_SOURCE_BINDING', 'Browser source binding is only retained on the run-start record.');
    }
    return { source_binding_mode: null, source_manifest_digest: null };
  }
  if (!SOURCE_BINDING_MODES.includes(mode)) {
    throw new EvidenceError('INVALID_BROWSER_SOURCE_BINDING', 'Browser source binding mode is invalid.');
  }
  if (mode === 'current_source_snapshot') {
    return { source_binding_mode: mode, source_manifest_digest: validateSourceManifestDigest(digest) };
  }
  if (digest !== null) {
    throw new EvidenceError('INVALID_BROWSER_SOURCE_BINDING', 'Standalone browser source binding must not retain a source digest.');
  }
  return { source_binding_mode: mode, source_manifest_digest: null };
}

export function validateProject(value) {
  if (value !== 'chromium') throw new EvidenceError('INVALID_BROWSER_PROJECT', 'Slice 2B supports only the chromium project.');
  return value;
}

export function validateTargetClassification(value) {
  if (value !== 'local') throw new EvidenceError('INVALID_BROWSER_TARGET', 'Slice 2B supports only local browser targets.');
  return value;
}

export function validateBrowserUrl(value) {
  const raw = validateBrowserLoopbackUrl(value, { fieldName: 'browser base URL', allowPath: false });
  return raw.canonical_origin;
}

export function validateBrowserLoopbackUrl(value, { fieldName = 'browser URL', allowPath = true } = {}) {
  if (typeof value !== 'string' || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f-\u009f\u2028\u2029\s\\]/u.test(value)) {
    throw new EvidenceError('INVALID_BROWSER_TARGET', `${fieldName} contains unsafe characters.`);
  }
  const rawPattern = allowPath
    ? /^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})(?:\/[^#]*)?$/
    : /^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})\/?$/;
  const match = rawPattern.exec(value);
  if (!match) {
    throw new EvidenceError('INVALID_BROWSER_TARGET', `${fieldName} must use exact raw http://127.0.0.1:<port> spelling.`);
  }
  const port = Number.parseInt(match[1], 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || String(port) !== match[1]) {
    throw new EvidenceError('INVALID_BROWSER_TARGET', `${fieldName} requires an explicit bounded decimal port.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new EvidenceError('INVALID_BROWSER_TARGET', `${fieldName} is invalid.`);
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.hash || url.port !== String(port)) {
    throw new EvidenceError('INVALID_BROWSER_TARGET', `${fieldName} must be plain exact loopback HTTP without credentials or fragment.`);
  }
  if (!allowPath && (url.pathname !== '/' || url.search)) {
    throw new EvidenceError('INVALID_BROWSER_TARGET', `${fieldName} must not include path, query, or fragment.`);
  }
  return {
    canonical_origin: `http://127.0.0.1:${port}`,
    port,
    raw_host: '127.0.0.1',
  };
}

export function generatedRunId() {
  return `browser-run-${Date.now().toString(36)}-${process.pid.toString(36)}-${randomUUID().slice(0, 8)}`;
}

export function testIdFor({ specPath, project, safeLabel }) {
  const safePath = validateRelativePath(specPath, 'browser spec path');
  validateProject(project);
  validateBrowserSafeLabel(safeLabel, 'browser test label');
  return `test-${sha256(`${safePath}\n${project}\n${safeLabel}`).slice(0, 24)}`;
}

export function attemptIdFor({ testId, retryIndex, workerIndex }) {
  validateGeneratedBrowserId(testId, 'browser test ID');
  validateNullableInteger(retryIndex, 'browser retry index', { min: 0, max: BROWSER_LIMITS.retry_index_max });
  validateNullableInteger(workerIndex, 'browser worker index', { min: 0, max: 0 });
  return `attempt-${sha256(`${testId}\n${retryIndex}\n${workerIndex}`).slice(0, 24)}`;
}

export function validateDuration(value, fieldName = 'browser duration') {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > BROWSER_LIMITS.run_duration_ms) {
    throw new EvidenceError('INVALID_BROWSER_DURATION', `${fieldName} is invalid.`);
  }
  return value;
}

export function validateNullableInteger(value, fieldName, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < min || value > max) throw new EvidenceError('INVALID_BROWSER_RECORD', `${fieldName} is invalid.`);
  return value;
}

function validateCounterMap(value, keys, fieldName, { total = null, max = BROWSER_LIMITS.network_requests_per_attempt } = {}) {
  assertExactObject(value, keys, [], fieldName);
  let sum = 0;
  for (const count of Object.values(value)) {
    if (!Number.isInteger(count) || count < 0 || count > max) throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', `${fieldName} contains an invalid count.`);
    sum += count;
  }
  if (total !== null && sum !== total) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', `${fieldName} does not reconcile.`);
  return sum;
}

function validateAggregateCommon(aggregate, fieldName) {
  for (const key of ['overflow_count', 'late_event_count', 'listener_error_count']) validateNullableInteger(aggregate[key], `${fieldName} ${key}`, { max: BROWSER_LIMITS.network_requests_per_attempt });
  for (const key of ['rejected_sensitive_count', 'rejected_customer_content_count', 'invalid_event_count']) {
    if (Object.hasOwn(aggregate, key)) validateNullableInteger(aggregate[key], `${fieldName} ${key}`, { max: BROWSER_LIMITS.network_requests_per_attempt });
  }
  if (aggregate.first_observed_utc != null) validateTimestamp(aggregate.first_observed_utc, `${fieldName} first observed`);
  if (aggregate.last_observed_utc != null) validateTimestamp(aggregate.last_observed_utc, `${fieldName} last observed`);
  if (aggregate.first_observed_utc != null && aggregate.last_observed_utc != null && Date.parse(aggregate.last_observed_utc) < Date.parse(aggregate.first_observed_utc)) throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', `${fieldName} timestamps regress.`);
  if (!COMPLETENESS_STATES.includes(aggregate.completeness_status) || !COLLECTOR_FAILURE_CLASSES.includes(aggregate.collector_failure_class)) throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', `${fieldName} state is invalid.`);
  if (aggregate.completeness_status === 'complete') {
    for (const key of COMPLETE_ONLY_FIELDS) {
      if (aggregate[key] !== 0) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', `${fieldName} cannot be complete with ${key}.`);
    }
    if (aggregate.collector_failure_class !== 'none') throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', `${fieldName} cannot be complete with a collector failure.`);
  }
}

function validateSummaryConsoleAggregate(aggregate) {
  assertExactObject(aggregate, ['total_count', 'type_counts', 'severity_counts', 'safe_message_class_counts', 'rejected_event_count', 'rejected_sensitive_count', 'rejected_customer_content_count', 'invalid_event_count', 'overflow_count', 'late_event_count', 'listener_error_count', 'first_observed_utc', 'last_observed_utc', 'completeness_status', 'collector_failure_class'], [], 'browser summary console aggregate');
  validateNullableInteger(aggregate.total_count, 'browser summary console total', { max: BROWSER_LIMITS.console_events_per_attempt });
  validateCounterMap(aggregate.type_counts, CONSOLE_TYPES, 'browser summary console type counts', { total: aggregate.total_count, max: BROWSER_LIMITS.console_events_per_attempt });
  validateCounterMap(aggregate.severity_counts, CONSOLE_SEVERITIES, 'browser summary console severity counts', { total: aggregate.total_count, max: BROWSER_LIMITS.console_events_per_attempt });
  const safeTotal = validateCounterMap(aggregate.safe_message_class_counts, SAFE_MESSAGE_CLASSES, 'browser summary console safe message counts', { max: BROWSER_LIMITS.console_events_per_attempt });
  validateNullableInteger(aggregate.rejected_event_count, 'browser summary console rejected event count', { max: BROWSER_LIMITS.console_events_per_attempt });
  if (safeTotal + aggregate.rejected_event_count + aggregate.invalid_event_count !== aggregate.total_count) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary console disposition counts do not reconcile.');
  if (aggregate.rejected_sensitive_count > aggregate.rejected_event_count || aggregate.rejected_customer_content_count > aggregate.rejected_event_count || Math.max(aggregate.rejected_sensitive_count, aggregate.rejected_customer_content_count) > aggregate.rejected_event_count || aggregate.rejected_event_count > aggregate.rejected_sensitive_count + aggregate.rejected_customer_content_count) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary console rejected counts do not reconcile.');
  validateAggregateCommon(aggregate, 'browser summary console aggregate');
}

function validateSummaryPageErrorAggregate(aggregate) {
  assertExactObject(aggregate, ['total_count', 'error_kind_counts', 'safe_message_class_counts', 'stack_present_count', 'origin_class_counts', 'duplicate_count', 'rejected_event_count', 'rejected_sensitive_count', 'rejected_customer_content_count', 'invalid_event_count', 'overflow_count', 'late_event_count', 'listener_error_count', 'first_observed_utc', 'last_observed_utc', 'completeness_status', 'collector_failure_class'], [], 'browser summary page-error aggregate');
  validateNullableInteger(aggregate.total_count, 'browser summary page error total', { max: BROWSER_LIMITS.page_errors_per_attempt });
  validateCounterMap(aggregate.error_kind_counts, ERROR_KINDS, 'browser summary page error kind counts', { total: aggregate.total_count, max: BROWSER_LIMITS.page_errors_per_attempt });
  const safeTotal = validateCounterMap(aggregate.safe_message_class_counts, SAFE_MESSAGE_CLASSES, 'browser summary page error safe message counts', { max: BROWSER_LIMITS.page_errors_per_attempt });
  validateCounterMap(aggregate.origin_class_counts, PAGE_ERROR_ORIGINS, 'browser summary page error origin counts', { total: aggregate.total_count, max: BROWSER_LIMITS.page_errors_per_attempt });
  validateNullableInteger(aggregate.stack_present_count, 'browser summary page error stack count', { max: BROWSER_LIMITS.page_errors_per_attempt });
  validateNullableInteger(aggregate.duplicate_count, 'browser summary page error duplicate count', { max: BROWSER_LIMITS.page_errors_per_attempt });
  validateNullableInteger(aggregate.rejected_event_count, 'browser summary page error rejected event count', { max: BROWSER_LIMITS.page_errors_per_attempt });
  if (safeTotal + aggregate.rejected_event_count + aggregate.invalid_event_count !== aggregate.total_count) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary page-error disposition counts do not reconcile.');
  if (aggregate.stack_present_count > aggregate.total_count || aggregate.duplicate_count > Math.max(aggregate.total_count - 1, 0)) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary page-error impossible counts were rejected.');
  if (aggregate.rejected_sensitive_count > aggregate.rejected_event_count || aggregate.rejected_customer_content_count > aggregate.rejected_event_count || Math.max(aggregate.rejected_sensitive_count, aggregate.rejected_customer_content_count) > aggregate.rejected_event_count || aggregate.rejected_event_count > aggregate.rejected_sensitive_count + aggregate.rejected_customer_content_count) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary page-error rejected counts do not reconcile.');
  validateAggregateCommon(aggregate, 'browser summary page-error aggregate');
}

function validateSummaryNetworkAggregate(aggregate) {
  assertExactObject(aggregate, ['total_requests', 'method_class_counts', 'origin_class_counts', 'route_class_counts', 'resource_type_counts', 'navigation_count', 'subresource_count', 'status_class_counts', 'failure_class_counts', 'redirect_count', 'rejected_egress_class_counts', 'terminal_response_count', 'terminal_failure_count', 'unresolved_request_count', 'duplicate_terminal_count', 'unexpected_page_count', 'websocket_attempt_count', 'worker_attempt_count', 'overflow_count', 'late_event_count', 'listener_error_count', 'completeness_status', 'collector_failure_class'], [], 'browser summary network aggregate');
  validateNullableInteger(aggregate.total_requests, 'browser summary network total', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.method_class_counts, METHOD_CLASSES, 'browser summary network method counts', { total: aggregate.total_requests, max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.origin_class_counts, ORIGIN_CLASSES, 'browser summary network origin counts', { total: aggregate.total_requests, max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.route_class_counts, ROUTE_CLASSES, 'browser summary network route counts', { total: aggregate.total_requests, max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.resource_type_counts, RESOURCE_TYPES, 'browser summary network resource counts', { total: aggregate.total_requests, max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.navigation_count, 'browser summary network navigation count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.subresource_count, 'browser summary network subresource count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  if (aggregate.navigation_count + aggregate.subresource_count !== aggregate.total_requests) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary network navigation counts do not reconcile.');
  validateCounterMap(aggregate.status_class_counts, STATUS_CLASSES, 'browser summary network status counts', { total: aggregate.total_requests, max: BROWSER_LIMITS.network_requests_per_attempt });
  const failureTotal = validateCounterMap(aggregate.failure_class_counts, FAILURE_CLASSES, 'browser summary network failure counts', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.rejected_egress_class_counts, REJECTED_EGRESS_CLASSES, 'browser summary rejected egress counts', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.redirect_count, 'browser summary network redirect count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.terminal_response_count, 'browser summary network terminal response count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.terminal_failure_count, 'browser summary network terminal failure count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.unresolved_request_count, 'browser summary network unresolved count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.duplicate_terminal_count, 'browser summary network duplicate terminal count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.unexpected_page_count, 'browser summary network unexpected page count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.websocket_attempt_count, 'browser summary network websocket count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.worker_attempt_count, 'browser summary network worker count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  if (aggregate.redirect_count > aggregate.total_requests) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary network redirect count is impossible.');
  if (aggregate.terminal_response_count + aggregate.terminal_failure_count + aggregate.unresolved_request_count !== aggregate.total_requests) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary network terminal counts do not reconcile.');
  if (aggregate.status_class_counts.no_response !== aggregate.terminal_failure_count + aggregate.unresolved_request_count) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary network no-response counts do not reconcile.');
  if (failureTotal !== aggregate.terminal_failure_count) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary network failure counts do not reconcile.');
  if (aggregate.completeness_status === 'complete' && (aggregate.unresolved_request_count !== 0 || aggregate.duplicate_terminal_count !== 0 || aggregate.unexpected_page_count !== 0 || aggregate.worker_attempt_count !== 0 || aggregate.websocket_attempt_count !== 0)) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser summary network unsupported activity cannot be complete.');
  validateAggregateCommon(aggregate, 'browser summary network aggregate');
}

function validateNullableStatus(value, allowed, fieldName) {
  if (value === null) return null;
  if (!allowed.includes(value)) throw new EvidenceError('INVALID_BROWSER_STATUS', `${fieldName} is invalid.`);
  return value;
}

export function scanBrowserString(value, fieldName) {
  if (typeof value !== 'string') throw new EvidenceError('INVALID_BROWSER_RECORD', `${fieldName} must be a string.`);
  const findings = [...scanSensitiveContent(value), ...scanCustomerContent(value)]
    .filter((finding, index, all) => all.findIndex((candidate) => candidate.classification === finding.classification) === index)
    .sort((left, right) => compareStrings(left.classification, right.classification));
  if (findings.length > 0) throw new EvidenceError('BROWSER_CONTENT_REJECTED', `${fieldName} failed browser evidence scanning.`);
}

export function validateBrowserRecord(record) {
  assertExactObject(record, BROWSER_RECORD_FIELDS, [], 'browser journal record');
  if (record.schema_version !== BROWSER_JOURNAL_SCHEMA) throw new EvidenceError('INVALID_BROWSER_SCHEMA', 'Browser journal schema is invalid.');
  if (!Number.isInteger(record.sequence) || record.sequence < 1 || record.sequence > BROWSER_LIMITS.journal_records) {
    throw new EvidenceError('INVALID_BROWSER_SEQUENCE', 'Browser journal sequence is invalid.');
  }
  if (!RECORD_TYPES.includes(record.record_type)) throw new EvidenceError('INVALID_BROWSER_RECORD_TYPE', 'Browser journal record type is invalid.');
  validateGeneratedBrowserId(record.run_id, 'browser run ID');
  if (!BROWSER_PROVENANCE_MODES.includes(record.provenance_mode)) throw new EvidenceError('INVALID_BROWSER_PROVENANCE_MODE', 'Browser journal provenance mode is invalid.');
  validateBrowserSourceBinding(record.source_binding_mode, record.source_manifest_digest, { runStart: record.record_type === 'browser_run_started' });
  validateTimestamp(record.timestamp, 'browser journal timestamp');
  validateTargetClassification(record.target_classification);
  validateProject(record.project);
  validateNullableInteger(record.worker_index, 'browser worker index', { min: 0, max: 0 });
  validateNullableInteger(record.retry_index, 'browser retry index', { min: 0, max: BROWSER_LIMITS.retry_index_max });
  if (record.spec_path !== null) validateRelativePath(record.spec_path, 'browser spec path');
  if (record.test_id !== null) validateGeneratedBrowserId(record.test_id, 'browser test ID');
  if (record.attempt_id !== null) validateGeneratedBrowserId(record.attempt_id, 'browser attempt ID');
  if (record.safe_label !== null) validateBrowserSafeLabel(record.safe_label, 'browser safe label');
  if (!ERROR_CLASSIFICATIONS.includes(record.error_classification)) throw new EvidenceError('INVALID_BROWSER_ERROR_CLASS', 'Browser error classification is invalid.');
  validateDuration(record.duration_ms);
  if (![record.previous_record_hash, record.current_record_hash].every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) {
    throw new EvidenceError('INVALID_BROWSER_HASH', 'Browser journal hash is invalid.');
  }
  if (record.run_auth_tag !== null && (typeof record.run_auth_tag !== 'string' || !/^[a-f0-9]{64}$/.test(record.run_auth_tag))) {
    throw new EvidenceError('INVALID_BROWSER_AUTH_TAG', 'Browser journal auth tag is invalid.');
  }

  if (record.record_type === 'browser_run_started') {
    if (record.provenance_mode === 'generated_workspace' && record.source_binding_mode !== 'current_source_snapshot') {
      throw new EvidenceError('INVALID_BROWSER_SOURCE_BINDING', 'Generated browser journals require a current-source snapshot binding.');
    }
    if (record.provenance_mode === 'standalone' && record.source_binding_mode !== 'none') {
      throw new EvidenceError('INVALID_BROWSER_SOURCE_BINDING', 'Standalone browser journals require no source snapshot binding.');
    }
    if (record.worker_index !== null || record.retry_index !== null || record.spec_path !== null || record.test_id !== null || record.attempt_id !== null || record.safe_label !== null || record.status !== null || record.duration_ms !== null || record.error_classification !== 'none' || record.console_aggregate !== null || record.page_error_aggregate !== null || record.network_aggregate !== null || record.run_auth_tag !== null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser run-start record contains invalid fields.');
    }
  } else if (record.record_type === 'browser_run_completed') {
    validateNullableStatus(record.status, RUN_STATUSES, 'browser run status');
    if (record.worker_index !== null || record.retry_index !== null || record.spec_path !== null || record.test_id !== null || record.attempt_id !== null || record.safe_label !== null || record.duration_ms === null || record.console_aggregate !== null || record.page_error_aggregate !== null || record.network_aggregate !== null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser run-complete record contains invalid fields.');
    }
    if (record.run_auth_tag === null) {
      throw new EvidenceError('INVALID_BROWSER_AUTH_TAG', 'Browser journals require an authenticated terminal record.');
    }
  } else if (record.record_type === 'browser_test_started') {
    if (record.worker_index !== 0 || record.retry_index === null || record.spec_path === null || record.test_id === null || record.attempt_id === null || record.safe_label === null || record.status !== null || record.duration_ms !== null || record.error_classification !== 'none' || record.console_aggregate !== null || record.page_error_aggregate !== null || record.network_aggregate !== null || record.run_auth_tag !== null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser test-start record contains invalid fields.');
    }
  } else if (record.record_type === 'browser_step_completed') {
    validateNullableStatus(record.status, STEP_STATUSES, 'browser step status');
    if (record.worker_index !== 0 || record.retry_index === null || record.spec_path === null || record.test_id === null || record.attempt_id === null || record.safe_label === null || record.duration_ms === null || record.console_aggregate !== null || record.page_error_aggregate !== null || record.network_aggregate !== null || record.run_auth_tag !== null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser step record contains invalid fields.');
    }
  } else if (record.record_type === 'browser_console_summary') {
    if (record.worker_index !== 0 || record.retry_index === null || record.spec_path === null || record.test_id === null || record.attempt_id === null || record.safe_label === null || record.status !== null || record.duration_ms !== null || record.error_classification !== 'none' || record.run_auth_tag !== null || record.console_aggregate === null || record.page_error_aggregate !== null || record.network_aggregate !== null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser console summary record contains invalid fields.');
    }
  } else if (record.record_type === 'browser_page_error_summary') {
    if (record.worker_index !== 0 || record.retry_index === null || record.spec_path === null || record.test_id === null || record.attempt_id === null || record.safe_label === null || record.status !== null || record.duration_ms !== null || record.error_classification !== 'none' || record.run_auth_tag !== null || record.console_aggregate !== null || record.page_error_aggregate === null || record.network_aggregate !== null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser page-error summary record contains invalid fields.');
    }
  } else if (record.record_type === 'browser_network_summary') {
    if (record.worker_index !== 0 || record.retry_index === null || record.spec_path === null || record.test_id === null || record.attempt_id === null || record.safe_label === null || record.status !== null || record.duration_ms !== null || record.error_classification !== 'none' || record.run_auth_tag !== null || record.console_aggregate !== null || record.page_error_aggregate !== null || record.network_aggregate === null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser network summary record contains invalid fields.');
    }
  } else if (record.record_type === 'browser_test_completed') {
    validateNullableStatus(record.status, TEST_STATUSES, 'browser test status');
    if (record.worker_index !== 0 || record.retry_index === null || record.spec_path === null || record.test_id === null || record.attempt_id === null || record.safe_label === null || record.duration_ms === null || record.console_aggregate !== null || record.page_error_aggregate !== null || record.network_aggregate !== null || record.run_auth_tag !== null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser test-complete record contains invalid fields.');
    }
  }
  for (const [name, aggregate] of [['console', record.console_aggregate], ['page_error', record.page_error_aggregate], ['network', record.network_aggregate]]) {
    if (aggregate !== null && (typeof aggregate !== 'object' || Array.isArray(aggregate))) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', `Browser ${name} aggregate is invalid.`);
    }
  }
  for (const value of [record.spec_path, record.safe_label, record.status, record.error_classification].filter(Boolean)) scanBrowserString(value, 'browser retained string');
  return record;
}

export function hashBrowserRecord(previousHash, withoutCurrentHash) {
  return sha256(`${previousHash}\n${canonicalStringify(withoutCurrentHash)}`);
}

export function browserRunAuthPayload(recordWithoutHash) {
  return canonicalStringify({ ...recordWithoutHash, run_auth_tag: null });
}

export function computeBrowserRunAuthTag(secret, recordWithoutHash) {
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) {
    throw new EvidenceError('INVALID_BROWSER_AUTH_SECRET', 'Browser run auth secret is invalid.');
  }
  return createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(browserRunAuthPayload(recordWithoutHash))
    .digest('hex');
}

export function buildBrowserRecord(previousHash, input) {
  const provenanceMode = input.provenance_mode ?? 'standalone';
  const recordWithoutHash = {
    schema_version: BROWSER_JOURNAL_SCHEMA,
    sequence: input.sequence,
    record_type: input.record_type,
    run_id: input.run_id,
    provenance_mode: provenanceMode,
    source_binding_mode: input.source_binding_mode ?? (input.record_type === 'browser_run_started' && provenanceMode === 'standalone' ? 'none' : null),
    source_manifest_digest: input.source_manifest_digest ?? null,
    timestamp: input.timestamp,
    target_classification: 'local',
    project: 'chromium',
    worker_index: input.worker_index ?? null,
    retry_index: input.retry_index ?? null,
    spec_path: input.spec_path ?? null,
    test_id: input.test_id ?? null,
    attempt_id: input.attempt_id ?? null,
    safe_label: input.safe_label ?? null,
    status: input.status ?? null,
    duration_ms: input.duration_ms ?? null,
    error_classification: input.error_classification ?? 'none',
    console_aggregate: input.console_aggregate ?? null,
    page_error_aggregate: input.page_error_aggregate ?? null,
    network_aggregate: input.network_aggregate ?? null,
    run_auth_tag: input.run_auth_tag ?? null,
    previous_record_hash: previousHash,
  };
  const record = { ...recordWithoutHash, current_record_hash: hashBrowserRecord(previousHash, recordWithoutHash) };
  return validateBrowserRecord(record);
}

export function parseBrowserJournal(content) {
  if (Buffer.byteLength(content) > BROWSER_LIMITS.journal_bytes) throw new EvidenceError('BROWSER_JOURNAL_LIMIT', 'Browser journal exceeds its byte limit.');
  if (content === '' || !content.endsWith('\n')) throw new EvidenceError('BROWSER_JOURNAL_TRUNCATED', 'Browser journal must end on a record boundary.');
  const lines = content.slice(0, -1).split('\n');
  if (lines.length > BROWSER_LIMITS.journal_records) throw new EvidenceError('BROWSER_RECORD_LIMIT', 'Browser journal contains too many records.');
  const records = [];
  let previousHash = GENESIS_HASH;
  let previousTimestamp = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (Buffer.byteLength(line) > BROWSER_LIMITS.line_bytes) throw new EvidenceError('BROWSER_LINE_LIMIT', 'Browser journal line exceeds its byte limit.');
    const parsed = parseStrictJson(line);
    const record = validateBrowserRecord(parsed);
    if (line !== canonicalStringify(record)) throw new EvidenceError('BROWSER_NONCANONICAL_RECORD', 'Browser journal record is noncanonical.');
    if (record.sequence !== index + 1) throw new EvidenceError('INVALID_BROWSER_SEQUENCE', 'Browser journal sequence has a gap or duplicate.');
    if (record.previous_record_hash !== previousHash) throw new EvidenceError('BROWSER_HASH_CHAIN_MISMATCH', 'Browser journal previous hash is invalid.');
    const { current_record_hash: currentHash, ...withoutCurrentHash } = record;
    if (currentHash !== hashBrowserRecord(previousHash, withoutCurrentHash)) throw new EvidenceError('BROWSER_HASH_CHAIN_MISMATCH', 'Browser journal current hash is invalid.');
    const timestamp = validateTimestamp(record.timestamp, 'browser journal timestamp');
    if (previousTimestamp !== null && timestamp < previousTimestamp) throw new EvidenceError('BROWSER_TIMESTAMP_REGRESSION', 'Browser journal timestamps regress.');
    previousTimestamp = timestamp;
    previousHash = currentHash;
    records.push(record);
  }
  return { records, head: previousHash };
}

export function validateSummary(summary) {
  assertExactObject(summary, BROWSER_SUMMARY_FIELDS, [], 'browser summary');
  if (summary.schema_version !== BROWSER_SUMMARY_SCHEMA || summary.tool_version !== BROWSER_TOOL_VERSION) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser summary version is invalid.');
  validateTimestamp(summary.generated_utc, 'browser summary timestamp');
  if (!/^[a-f0-9]{64}$/.test(summary.source_journal_sha256)) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser source digest is invalid.');
  validateGeneratedBrowserId(summary.run_id, 'browser summary run ID');
  validateBrowserSourceBinding(summary.source_binding_mode, summary.source_manifest_digest, { runStart: true });
  validateTargetClassification(summary.target_classification);
  validateProject(summary.project);
  if (summary.worker_count !== 1 || summary.retry_limit !== BROWSER_LIMITS.retry_index_max) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser summary worker or retry limit is invalid.');
  validateTimestamp(summary.started_utc, 'browser summary start timestamp');
  validateTimestamp(summary.completed_utc, 'browser summary completion timestamp');
  if (Date.parse(summary.completed_utc) < Date.parse(summary.started_utc)) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser summary timestamps regress.');
  validateDuration(summary.duration_ms);
  if (!RUN_STATUSES.includes(summary.status)) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser summary status is invalid.');
  assertExactObject(summary.counts, ['started', 'passed', 'failed', 'timed_out', 'skipped', 'interrupted', 'incomplete', 'steps'], [], 'browser summary counts');
  for (const [key, value] of Object.entries(summary.counts)) {
    if (!Number.isInteger(value) || value < 0 || value > BROWSER_LIMITS.journal_records) throw new EvidenceError('INVALID_BROWSER_SUMMARY', `Browser summary count ${key} is invalid.`);
  }
  if (summary.counts.started !== summary.counts.passed + summary.counts.failed + summary.counts.timed_out + summary.counts.skipped + summary.counts.interrupted + summary.counts.incomplete) {
    throw new EvidenceError('BROWSER_COUNT_MISMATCH', 'Browser summary counts do not reconcile.');
  }
  if (!Array.isArray(summary.tests) || summary.tests.length !== summary.counts.started || summary.tests.length > BROWSER_LIMITS.tests_per_run) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser summary tests are invalid.');
  const testIds = new Set();
  const attemptIds = new Set();
  for (const test of summary.tests) {
    assertExactObject(test, ['test_id', 'attempt_id', 'spec_path', 'safe_label', 'project', 'worker_index', 'retry_index', 'status', 'duration_ms', 'error_classification', 'step_count', 'observability'], [], 'browser summary test');
    validateGeneratedBrowserId(test.test_id, 'browser summary test ID');
    validateGeneratedBrowserId(test.attempt_id, 'browser summary attempt ID');
    if (testIds.has(test.test_id) || attemptIds.has(test.attempt_id)) throw new EvidenceError('BROWSER_DUPLICATE_ID', 'Browser summary contains duplicate IDs.');
    testIds.add(test.test_id);
    attemptIds.add(test.attempt_id);
    validateRelativePath(test.spec_path, 'browser summary spec path');
    validateBrowserSafeLabel(test.safe_label, 'browser summary safe label');
    validateProject(test.project);
    if (test.worker_index !== 0 || !Number.isInteger(test.retry_index) || test.retry_index < 0 || test.retry_index > BROWSER_LIMITS.retry_index_max) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser summary worker/retry is invalid.');
    if (test.test_id !== testIdFor({ specPath: test.spec_path, project: test.project, safeLabel: test.safe_label })) throw new EvidenceError('BROWSER_ID_MISMATCH', 'Browser summary test ID does not match retained safe inputs.');
    if (test.attempt_id !== attemptIdFor({ testId: test.test_id, retryIndex: test.retry_index, workerIndex: test.worker_index })) throw new EvidenceError('BROWSER_ID_MISMATCH', 'Browser summary attempt ID does not match retained safe inputs.');
    if (!TEST_STATUSES.includes(test.status) || !ERROR_CLASSIFICATIONS.includes(test.error_classification)) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser summary test status is invalid.');
    validateDuration(test.duration_ms, 'browser summary test duration');
    if (!Number.isInteger(test.step_count) || test.step_count < 0 || test.step_count > BROWSER_LIMITS.steps_per_test) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser summary step count is invalid.');
    assertExactObject(test.observability, ['console', 'page_error', 'network'], [], 'browser summary test observability');
    validateSummaryConsoleAggregate(test.observability.console);
    validateSummaryPageErrorAggregate(test.observability.page_error);
    validateSummaryNetworkAggregate(test.observability.network);
    scanBrowserString(test.spec_path, 'browser summary spec path');
    scanBrowserString(test.safe_label, 'browser summary safe label');
  }
  assertExactObject(summary.observability, ['completeness_status', 'totals'], [], 'browser summary observability');
  if (!COMPLETENESS_STATES.includes(summary.observability.completeness_status)) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser summary observability completeness is invalid.');
  assertExactObject(summary.observability.totals, ['console_total', 'page_error_total', 'network_total', 'overflow_total', 'rejected_sensitive_total', 'rejected_customer_content_total', 'collector_failure_total'], [], 'browser summary observability totals');
  for (const value of Object.values(summary.observability.totals)) {
    if (!Number.isInteger(value) || value < 0 || value > BROWSER_LIMITS.journal_records) throw new EvidenceError('INVALID_BROWSER_SUMMARY', 'Browser summary observability total is invalid.');
  }
  assertExactObject(summary.prohibited_artifacts, ['screenshots', 'traces', 'videos', 'hars', 'html_reports', 'storage_states'], [], 'browser prohibited artifact summary');
  for (const value of Object.values(summary.prohibited_artifacts)) {
    if (value !== 0) throw new EvidenceError('PROHIBITED_BROWSER_ARTIFACT', 'Browser summary reports prohibited artifacts.');
  }
  return summary;
}
