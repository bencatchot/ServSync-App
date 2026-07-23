import { relative } from 'node:path';
import {
  BROWSER_LIMITS,
  attemptIdFor,
  testIdFor,
  validateBrowserSafeLabel,
  validateBrowserUrl,
  validateDuration,
  validateProject,
} from './browser-schema.mjs';
import { createJournalWriter } from './browser-journal.mjs';
import { classifyError } from './browser-importer.mjs';
import { assertBrowserLaunchContract, writeReporterReady } from './browser-launch-policy.mjs';
import { EvidenceError, utcNow, validateControlledSlug, validateRelativePath } from './internal.mjs';

function mapStatus(status) {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'timedOut') return 'timed_out';
  if (status === 'skipped') return 'skipped';
  if (status === 'interrupted') return 'interrupted';
  return 'incomplete';
}

function mapRunStatus(status) {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'timedout' || status === 'timedOut') return 'timed_out';
  if (status === 'interrupted') return 'interrupted';
  return 'incomplete';
}

export default class ControlledOpsBrowserReporter {
  constructor(options = {}) {
    this.options = options;
    this.runId = null;
    this.testStarts = new Map();
    this.writer = null;
    this.startedAt = null;
  }

  onBegin(config, suite) {
    const journalRoot = this.options.journalRoot || process.env.CONTROLLED_OPS_BROWSER_JOURNAL_ROOT;
    if (!journalRoot) throw new EvidenceError('BROWSER_REPORTER_CONFIG', 'Controlled-ops browser reporter requires a journal root.');
    const runLabel = this.options.runLabel || process.env.CONTROLLED_OPS_BROWSER_RUN_LABEL || 'synthetic-form-submit';
    validateControlledSlug(runLabel, 'browser run label', { maxLength: BROWSER_LIMITS.label_length });
    const baseUrl = this.options.baseURL || process.env.CONTROLLED_OPS_BROWSER_BASE_URL;
    validateBrowserUrl(baseUrl);
    const launch = assertBrowserLaunchContract({
      descriptorPath: this.options.descriptorPath || process.env.CONTROLLED_OPS_BROWSER_LAUNCH_DESCRIPTOR,
      journalAuthSecret: this.options.journalAuthSecret || process.env.CONTROLLED_OPS_BROWSER_JOURNAL_AUTH_SECRET,
      nonce: this.options.nonce || process.env.CONTROLLED_OPS_BROWSER_LAUNCH_NONCE,
    });
    if (launch.descriptor.base_url !== validateBrowserUrl(baseUrl) || launch.descriptor.run_label !== runLabel) {
      throw new EvidenceError('BROWSER_LAUNCH_CONTRACT_MISMATCH', 'Browser reporter launch contract does not match config.');
    }
    this.runId = launch.descriptor.run_id;
    if (config.projects.length !== 1 || config.projects[0].name !== 'chromium') throw new EvidenceError('BROWSER_REPORTER_CONFIG', 'Slice 2A requires exactly one chromium project.');
    if (config.workers !== 1 || config.fullyParallel) throw new EvidenceError('BROWSER_REPORTER_CONFIG', 'Slice 2A requires one serial worker.');
    if (config.projects[0].retries !== 0 && config.projects[0].retries > BROWSER_LIMITS.retry_index_max) throw new EvidenceError('BROWSER_REPORTER_CONFIG', 'Slice 2A retry config is invalid.');
    if (suite.allTests().length > BROWSER_LIMITS.tests_per_run) throw new EvidenceError('BROWSER_TEST_LIMIT', 'Slice 2A test count limit exceeded.');

    const journalAuthSecret = this.options.journalAuthSecret || process.env.CONTROLLED_OPS_BROWSER_JOURNAL_AUTH_SECRET;
    this.writer = createJournalWriter(journalRoot, { allowPrepared: true, journalAuthSecret });
    this.startedAt = utcNow();
    this.writer.append({
      record_type: 'browser_run_started',
      run_id: this.runId,
      timestamp: this.startedAt,
    });
    writeReporterReady({
      descriptorPath: this.options.descriptorPath || process.env.CONTROLLED_OPS_BROWSER_LAUNCH_DESCRIPTOR,
      journalAuthSecret,
      nonce: this.options.nonce || process.env.CONTROLLED_OPS_BROWSER_LAUNCH_NONCE,
    });
  }

  onTestBegin(test, result) {
    const safeLabel = validateBrowserSafeLabel(test.title, 'browser test title');
    const specPath = validateRelativePath(relative(process.cwd(), test.location.file).split('\\').join('/'), 'browser spec path');
    validateProject('chromium');
    const testId = testIdFor({ specPath, project: 'chromium', safeLabel });
    const workerIndex = result.workerIndex ?? 0;
    const retryIndex = result.retry ?? 0;
    if (workerIndex !== 0) throw new EvidenceError('BROWSER_WORKER_LIMIT', 'Slice 2A requires worker index zero.');
    if (retryIndex > BROWSER_LIMITS.retry_index_max) throw new EvidenceError('BROWSER_RETRY_LIMIT', 'Slice 2A retry limit exceeded.');
    const attemptId = attemptIdFor({ testId, retryIndex, workerIndex });
    this.testStarts.set(test.id, { safeLabel, specPath, testId, attemptId, workerIndex, retryIndex });
    this.writer.append({
      record_type: 'browser_test_started',
      run_id: this.runId,
      timestamp: utcNow(),
      worker_index: workerIndex,
      retry_index: retryIndex,
      spec_path: specPath,
      test_id: testId,
      attempt_id: attemptId,
      safe_label: safeLabel,
    });
  }

  onStepEnd(test, result, step) {
    if (step.category !== 'test.step') return;
    const start = this.testStarts.get(test.id);
    if (!start) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser step ended before test start.');
    const safeLabel = validateBrowserSafeLabel(step.title, 'browser step title');
    validateDuration(step.duration, 'browser step duration');
    const status = step.error ? 'failed' : 'passed';
    this.writer.append({
      record_type: 'browser_step_completed',
      run_id: this.runId,
      timestamp: utcNow(),
      worker_index: start.workerIndex,
      retry_index: start.retryIndex,
      spec_path: start.specPath,
      test_id: start.testId,
      attempt_id: start.attemptId,
      safe_label: safeLabel,
      status,
      duration_ms: step.duration,
      error_classification: classifyError(status, step.error),
    });
  }

  onTestEnd(test, result) {
    const start = this.testStarts.get(test.id);
    if (!start) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser test ended before test start.');
    const status = mapStatus(result.status);
    const errorClass = classifyError(status, result.error);
    validateDuration(result.duration, 'browser test duration');
    this.writer.append({
      record_type: 'browser_test_completed',
      run_id: this.runId,
      timestamp: utcNow(),
      worker_index: start.workerIndex,
      retry_index: start.retryIndex,
      spec_path: start.specPath,
      test_id: start.testId,
      attempt_id: start.attemptId,
      safe_label: start.safeLabel,
      status,
      duration_ms: result.duration,
      error_classification: errorClass,
    });
  }

  onEnd(result) {
    const status = mapRunStatus(result.status);
    const duration = this.startedAt ? Math.max(0, Date.now() - Date.parse(this.startedAt)) : 0;
    validateDuration(duration, 'browser run duration');
    this.writer.append({
      record_type: 'browser_run_completed',
      run_id: this.runId,
      timestamp: utcNow(),
      status,
      duration_ms: duration,
      error_classification: status === 'passed' ? 'none' : 'unknown',
    });
    this.writer.close();
  }
}
