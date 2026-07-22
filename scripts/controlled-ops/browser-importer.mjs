#!/usr/bin/env node

import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EvidenceError,
  assertCanonicalParents,
  assertOutsideGit,
  canonicalStringify,
  fsyncDirectory,
  safeError,
  validateRawOperationRootInput,
  validateTimestamp,
} from './internal.mjs';
import {
  BROWSER_LIMITS,
  BROWSER_SUMMARY_SCHEMA,
  BROWSER_TOOL_VERSION,
  attemptIdFor,
  decodeUtf8,
  testIdFor,
  validateDuration,
  validateSummary,
} from './browser-schema.mjs';
import { readJournal } from './browser-journal.mjs';
import { parseStrictJson } from './sanitize.mjs';

function modeOf(info) {
  return info.mode & 0o777;
}

function parseOptions(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new EvidenceError('INVALID_ARGUMENTS', 'Browser importer arguments are invalid.');
    options[key.slice(2)] = value;
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (!value) throw new EvidenceError('INVALID_ARGUMENTS', `--${name} is required.`);
  return value;
}

function validateOutputRoot(root) {
  validateRawOperationRootInput(root, 'browser summary root');
  const rootPath = resolve(root);
  assertCanonicalParents(rootPath);
  assertOutsideGit(dirname(rootPath));
  if (!existsSync(rootPath)) mkdirSync(rootPath, { mode: 0o700 });
  if (realpathSync(rootPath) !== rootPath) throw new EvidenceError('SYMLINK_REJECTED', 'Browser summary root must not use symlinked path components.');
  const info = lstatSync(rootPath);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || modeOf(info) !== 0o700) {
    throw new EvidenceError('UNSAFE_BROWSER_SUMMARY_ROOT', 'Browser summary root ownership, type, or mode is unsafe.');
  }
  return rootPath;
}

function createExclusiveSummary(path, content) {
  const root = validateOutputRoot(dirname(resolve(path)));
  const destination = resolve(path);
  if (dirname(destination) !== root || basename(destination) !== 'browser-summary.json') {
    throw new EvidenceError('UNSAFE_BROWSER_SUMMARY_PATH', 'Browser summary path must be an exact browser-summary.json leaf in the summary root.');
  }
  if (existsSync(destination)) throw new EvidenceError('PREEXISTING_BROWSER_SUMMARY', 'Browser summary destination already exists.');
  const descriptor = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || modeOf(info) !== 0o600) {
      throw new EvidenceError('UNSAFE_BROWSER_SUMMARY', 'Created browser summary failed ownership checks.');
    }
    if (Buffer.byteLength(content) > BROWSER_LIMITS.summary_bytes) throw new EvidenceError('BROWSER_SUMMARY_LIMIT', 'Browser summary exceeds its byte limit.');
    writeFileSync(descriptor, content, 'utf8');
    fsyncSync(descriptor);
  } catch (error) {
    try { closeSync(descriptor); } catch {}
    try { unlinkSync(destination); } catch {}
    throw error;
  }
  closeSync(descriptor);
  fsyncDirectory(root);
  return destination;
}

function classifyError(status, rawError) {
  if (!rawError) return 'none';
  if (status === 'timed_out') return 'timeout';
  const name = String(rawError.name ?? '').toLowerCase();
  if (name.includes('assert')) return 'assertion';
  if (name.includes('timeout')) return 'timeout';
  return 'unknown';
}

function countProhibitedArtifacts(outputRoot) {
  if (!outputRoot) return { screenshots: 0, traces: 0, videos: 0, hars: 0, html_reports: 0, storage_states: 0 };
  const root = resolve(outputRoot);
  if (!existsSync(root)) return { screenshots: 0, traces: 0, videos: 0, hars: 0, html_reports: 0, storage_states: 0 };
  if (!isAbsolute(root)) throw new EvidenceError('UNSAFE_BROWSER_OUTPUT_ROOT', 'Browser output root must be absolute.');
  const counts = { screenshots: 0, traces: 0, videos: 0, hars: 0, html_reports: 0, storage_states: 0 };
  const visit = (path, depth = 0) => {
    if (depth > 12) throw new EvidenceError('BROWSER_OUTPUT_LIMIT', 'Browser output traversal exceeded its limit.');
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Browser output contains a symlink.');
    if (info.isDirectory()) {
      for (const name of new Set(readdirSync(path))) visit(join(path, name), depth + 1);
      return;
    }
    if (!info.isFile()) throw new EvidenceError('UNSAFE_BROWSER_OUTPUT', 'Browser output contains a non-regular file.');
    const lower = basename(path).toLowerCase();
    if (/\.(png|jpg|jpeg|webp)$/.test(lower)) counts.screenshots += 1;
    else if (lower.endsWith('.zip')) counts.traces += 1;
    else if (/\.(webm|mp4)$/.test(lower)) counts.videos += 1;
    else if (lower.endsWith('.har')) counts.hars += 1;
    else if (lower.endsWith('.html')) counts.html_reports += 1;
    else if (lower.includes('storage') && lower.endsWith('.json')) counts.storage_states += 1;
  };
  visit(root);
  return counts;
}

function reconcile(records, sourceDigest, { outputRoot = null, generatedAt = new Date().toISOString() } = {}) {
  const runStarted = records.filter((record) => record.record_type === 'browser_run_started');
  const runCompleted = records.filter((record) => record.record_type === 'browser_run_completed');
  if (runStarted.length !== 1) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser journal must contain exactly one run-start record.');
  if (runCompleted.length !== 1) throw new EvidenceError('BROWSER_INCOMPLETE_JOURNAL', 'Browser journal lacks a terminal run-completion record.');
  if (records[0].record_type !== 'browser_run_started') throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Run-start record must be first.');
  if (records.at(-1).record_type !== 'browser_run_completed') throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Run-completion record must be last.');
  const runId = runStarted[0].run_id;
  if (records.some((record) => record.run_id !== runId)) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser journal contains multiple run IDs.');

  const starts = new Map();
  const terminals = new Map();
  const stepCounts = new Map();
  const attemptIds = new Set();
  for (const record of records.slice(1, -1)) {
    if (record.record_type === 'browser_test_started') {
      if (starts.has(record.test_id)) throw new EvidenceError('BROWSER_DUPLICATE_ID', 'Duplicate browser test start.');
      if (attemptIds.has(record.attempt_id)) throw new EvidenceError('BROWSER_DUPLICATE_ID', 'Duplicate browser attempt ID.');
      if (record.test_id !== testIdFor({ specPath: record.spec_path, project: record.project, safeLabel: record.safe_label })) throw new EvidenceError('BROWSER_ID_MISMATCH', 'Browser test ID does not match safe inputs.');
      if (record.attempt_id !== attemptIdFor({ testId: record.test_id, retryIndex: record.retry_index, workerIndex: record.worker_index })) throw new EvidenceError('BROWSER_ID_MISMATCH', 'Browser attempt ID does not match safe inputs.');
      starts.set(record.test_id, record);
      attemptIds.add(record.attempt_id);
    } else if (record.record_type === 'browser_step_completed') {
      if (!starts.has(record.test_id)) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser step references a test that has not started.');
      stepCounts.set(record.test_id, (stepCounts.get(record.test_id) ?? 0) + 1);
      if (stepCounts.get(record.test_id) > BROWSER_LIMITS.steps_per_test) throw new EvidenceError('BROWSER_STEP_LIMIT', 'Browser step limit exceeded.');
    } else if (record.record_type === 'browser_test_completed') {
      if (!starts.has(record.test_id)) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser test completion lacks a start record.');
      if (terminals.has(record.test_id)) throw new EvidenceError('BROWSER_DUPLICATE_TERMINAL', 'Browser test has duplicate terminal records.');
      terminals.set(record.test_id, record);
    } else {
      throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser record appears in an invalid position.');
    }
  }
  if (starts.size > BROWSER_LIMITS.tests_per_run) throw new EvidenceError('BROWSER_TEST_LIMIT', 'Browser test limit exceeded.');
  if (starts.size !== terminals.size) throw new EvidenceError('BROWSER_INCOMPLETE_JOURNAL', 'Every started browser test must have one terminal record.');

  const tests = [...starts.values()].sort((left, right) => left.test_id.localeCompare(right.test_id)).map((start) => {
    const terminal = terminals.get(start.test_id);
    validateDuration(terminal.duration_ms, 'browser test duration');
    return {
      test_id: start.test_id,
      attempt_id: start.attempt_id,
      spec_path: start.spec_path,
      safe_label: start.safe_label,
      project: start.project,
      worker_index: start.worker_index,
      retry_index: start.retry_index,
      status: terminal.status,
      duration_ms: terminal.duration_ms,
      error_classification: terminal.error_classification,
      step_count: stepCounts.get(start.test_id) ?? 0,
    };
  });
  const counts = {
    started: tests.length,
    passed: tests.filter((test) => test.status === 'passed').length,
    failed: tests.filter((test) => test.status === 'failed').length,
    timed_out: tests.filter((test) => test.status === 'timed_out').length,
    skipped: tests.filter((test) => test.status === 'skipped').length,
    interrupted: tests.filter((test) => test.status === 'interrupted').length,
    incomplete: tests.filter((test) => test.status === 'incomplete').length,
    steps: tests.reduce((sum, test) => sum + test.step_count, 0),
  };
  const runStatus = runCompleted[0].status;
  if (runStatus === 'passed' && (counts.failed + counts.timed_out + counts.interrupted + counts.incomplete) > 0) {
    throw new EvidenceError('BROWSER_STATUS_MISMATCH', 'Browser run is marked passed with failing tests.');
  }
  if (runStatus === 'failed' && (counts.failed + counts.timed_out + counts.interrupted + counts.incomplete) === 0) {
    throw new EvidenceError('BROWSER_STATUS_MISMATCH', 'Browser run is marked failed with no failing tests.');
  }
  validateTimestamp(generatedAt, 'browser summary generated timestamp');
  const prohibited = countProhibitedArtifacts(outputRoot);
  const summary = {
    schema_version: BROWSER_SUMMARY_SCHEMA,
    tool_version: BROWSER_TOOL_VERSION,
    generated_utc: generatedAt,
    source_journal_sha256: sourceDigest,
    run_id: runId,
    target_classification: 'local',
    project: 'chromium',
    worker_count: 1,
    retry_limit: 1,
    started_utc: runStarted[0].timestamp,
    completed_utc: runCompleted[0].timestamp,
    duration_ms: runCompleted[0].duration_ms,
    status: runStatus,
    counts,
    tests,
    prohibited_artifacts: prohibited,
  };
  return validateSummary(summary);
}

export function importBrowserJournal({ journalPath, summaryPath, outputRoot = null, generatedAt } = {}) {
  if (!journalPath || !summaryPath) throw new EvidenceError('INVALID_ARGUMENTS', 'Browser import requires journalPath and summaryPath.');
  const { records, sourceDigest } = readJournal(journalPath);
  const summary = reconcile(records, sourceDigest, { outputRoot, generatedAt });
  const content = `${canonicalStringify(summary)}\n`;
  const destination = createExclusiveSummary(summaryPath, content);
  return { summary, summaryPath: destination };
}

export function verifyBrowserSummary(summaryPath, { sourceJournalPath = null } = {}) {
  const path = resolve(summaryPath);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.nlink !== 1 || modeOf(info) !== 0o600 || info.size > BROWSER_LIMITS.summary_bytes) {
    throw new EvidenceError('UNSAFE_BROWSER_SUMMARY', 'Browser summary ownership, type, link count, mode, or size is unsafe.');
  }
  const content = decodeUtf8(readFileSync(path));
  if (!content.endsWith('\n')) throw new EvidenceError('BROWSER_SUMMARY_TRUNCATED', 'Browser summary must end with a newline.');
  const parsed = parseStrictJson(content.slice(0, -1));
  if (content !== `${canonicalStringify(parsed)}\n`) throw new EvidenceError('BROWSER_SUMMARY_NONCANONICAL', 'Browser summary is not canonical JSON.');
  const summary = validateSummary(parsed);
  if (sourceJournalPath) {
    const { sourceDigest } = readJournal(sourceJournalPath);
    if (sourceDigest !== summary.source_journal_sha256) throw new EvidenceError('BROWSER_SOURCE_MISMATCH', 'Browser summary source digest does not match current journal.');
  }
  return summary;
}

export function cleanupBrowserEvidence({ journalPath = null, summaryPath = null, journalRoot = null, outputRoot = null } = {}) {
  const targets = [journalPath, summaryPath].filter(Boolean).map(resolve);
  for (const target of targets) {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.nlink !== 1) throw new EvidenceError('UNSAFE_BROWSER_CLEANUP', 'Refusing to clean unsafe browser evidence file.');
    unlinkSync(target);
  }
  for (const root of [journalRoot, outputRoot].filter(Boolean).map(resolve)) {
    if (!existsSync(root)) continue;
    const info = lstatSync(root);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.()) throw new EvidenceError('UNSAFE_BROWSER_CLEANUP', 'Refusing to clean unsafe browser evidence directory.');
    const entries = readdirSync(root);
    if (entries.length > 0) throw new EvidenceError('BROWSER_CLEANUP_NOT_EMPTY', 'Browser evidence directory is not empty.');
    rmdirSync(root);
  }
}

function runCli() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseOptions(rest);
  if (command === 'import') {
    const result = importBrowserJournal({
      journalPath: required(options, 'journal'),
      summaryPath: required(options, 'summary'),
      outputRoot: options['output-root'] ?? null,
    });
    process.stdout.write(`${canonicalStringify({ status: 'imported', summary_path: result.summaryPath, run_status: result.summary.status })}\n`);
  } else if (command === 'verify') {
    const summary = verifyBrowserSummary(required(options, 'summary'), { sourceJournalPath: options.journal ?? null });
    process.stdout.write(`${canonicalStringify({ status: 'verified', run_status: summary.status, tests: summary.counts.started })}\n`);
  } else {
    throw new EvidenceError('INVALID_COMMAND', 'Unknown browser importer command.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runCli();
  } catch (error) {
    const safe = safeError(error);
    process.stderr.write(`${basename(process.argv[1])}: ${safe.code}: ${safe.message}\n`);
    process.exitCode = 90;
  }
}

export { classifyError, reconcile };
