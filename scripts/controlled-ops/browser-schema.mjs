import { createHash, randomUUID } from 'node:crypto';
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
export const BROWSER_TOOL_VERSION = '2a.1.0';

export const BROWSER_LIMITS = Object.freeze({
  tests_per_run: 25,
  workers: 1,
  retry_index_max: 1,
  steps_per_test: 50,
  journal_records: 256,
  line_bytes: 16 * 1024,
  journal_bytes: 512 * 1024,
  summary_bytes: 512 * 1024,
  temporary_output_bytes: 5 * 1024 * 1024,
  retained_summaries: 1,
  run_duration_ms: 120_000,
  test_duration_ms: 30_000,
  label_length: 64,
  path_length: 512,
});

export const RECORD_TYPES = Object.freeze([
  'browser_run_started',
  'browser_test_started',
  'browser_step_completed',
  'browser_test_completed',
  'browser_run_completed',
]);

export const RUN_STATUSES = Object.freeze(['passed', 'failed', 'timed_out', 'interrupted', 'incomplete']);
export const TEST_STATUSES = Object.freeze(['passed', 'failed', 'timed_out', 'skipped', 'interrupted', 'incomplete']);
export const STEP_STATUSES = Object.freeze(['passed', 'failed', 'skipped']);
export const ERROR_CLASSIFICATIONS = Object.freeze(['assertion', 'timeout', 'browser', 'fixture', 'reporter', 'unknown', 'none']);

export const BROWSER_RECORD_FIELDS = [
  'schema_version',
  'sequence',
  'record_type',
  'run_id',
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
  'previous_record_hash',
  'current_record_hash',
];

export const BROWSER_SUMMARY_FIELDS = [
  'schema_version',
  'tool_version',
  'generated_utc',
  'source_journal_sha256',
  'run_id',
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

export function validateProject(value) {
  if (value !== 'chromium') throw new EvidenceError('INVALID_BROWSER_PROJECT', 'Slice 2A supports only the chromium project.');
  return value;
}

export function validateTargetClassification(value) {
  if (value !== 'local') throw new EvidenceError('INVALID_BROWSER_TARGET', 'Slice 2A supports only local browser targets.');
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

  if (record.record_type === 'browser_run_started') {
    if (record.worker_index !== null || record.retry_index !== null || record.spec_path !== null || record.test_id !== null || record.attempt_id !== null || record.safe_label !== null || record.status !== null || record.duration_ms !== null || record.error_classification !== 'none') {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser run-start record contains invalid fields.');
    }
  } else if (record.record_type === 'browser_run_completed') {
    validateNullableStatus(record.status, RUN_STATUSES, 'browser run status');
    if (record.worker_index !== null || record.retry_index !== null || record.spec_path !== null || record.test_id !== null || record.attempt_id !== null || record.safe_label !== null || record.duration_ms === null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser run-complete record contains invalid fields.');
    }
  } else if (record.record_type === 'browser_test_started') {
    if (record.worker_index !== 0 || record.retry_index === null || record.spec_path === null || record.test_id === null || record.attempt_id === null || record.safe_label === null || record.status !== null || record.duration_ms !== null || record.error_classification !== 'none') {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser test-start record contains invalid fields.');
    }
  } else if (record.record_type === 'browser_step_completed') {
    validateNullableStatus(record.status, STEP_STATUSES, 'browser step status');
    if (record.worker_index !== 0 || record.retry_index === null || record.spec_path === null || record.test_id === null || record.attempt_id === null || record.safe_label === null || record.duration_ms === null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser step record contains invalid fields.');
    }
  } else if (record.record_type === 'browser_test_completed') {
    validateNullableStatus(record.status, TEST_STATUSES, 'browser test status');
    if (record.worker_index !== 0 || record.retry_index === null || record.spec_path === null || record.test_id === null || record.attempt_id === null || record.safe_label === null || record.duration_ms === null) {
      throw new EvidenceError('INVALID_BROWSER_RECORD', 'Browser test-complete record contains invalid fields.');
    }
  }

  for (const value of [record.spec_path, record.safe_label, record.status, record.error_classification].filter(Boolean)) scanBrowserString(value, 'browser retained string');
  return record;
}

export function hashBrowserRecord(previousHash, withoutCurrentHash) {
  return sha256(`${previousHash}\n${canonicalStringify(withoutCurrentHash)}`);
}

export function buildBrowserRecord(previousHash, input) {
  const recordWithoutHash = {
    schema_version: BROWSER_JOURNAL_SCHEMA,
    sequence: input.sequence,
    record_type: input.record_type,
    run_id: input.run_id,
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
    assertExactObject(test, ['test_id', 'attempt_id', 'spec_path', 'safe_label', 'project', 'worker_index', 'retry_index', 'status', 'duration_ms', 'error_classification', 'step_count'], [], 'browser summary test');
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
    scanBrowserString(test.spec_path, 'browser summary spec path');
    scanBrowserString(test.safe_label, 'browser summary safe label');
  }
  assertExactObject(summary.prohibited_artifacts, ['screenshots', 'traces', 'videos', 'hars', 'html_reports', 'storage_states'], [], 'browser prohibited artifact summary');
  for (const value of Object.values(summary.prohibited_artifacts)) {
    if (value !== 0) throw new EvidenceError('PROHIBITED_BROWSER_ARTIFACT', 'Browser summary reports prohibited artifacts.');
  }
  return summary;
}
