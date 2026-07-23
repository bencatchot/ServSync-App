import { relative } from 'node:path';
import {
  BROWSER_OBSERVABILITY_ATTACHMENT_NAME,
  BROWSER_OBSERVABILITY_MIME_TYPE,
  createEmptyBrowserObservabilityAggregates,
  parseBrowserObservabilityAttachment,
  validateConsoleAggregate,
  validateNetworkAggregate,
  validatePageErrorAggregate,
} from './browser-collectors.mjs';
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
import { ALLOWLISTED_BROWSER_SOURCE_PATHS, assertBrowserLaunchContract, validateBrowserSourceManifest, writeReporterReady } from './browser-launch-policy.mjs';
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
    if (config.projects.length !== 1 || config.projects[0].name !== 'chromium') throw new EvidenceError('BROWSER_REPORTER_CONFIG', 'Slice 2B requires exactly one chromium project.');
    if (config.workers !== 1 || config.fullyParallel) throw new EvidenceError('BROWSER_REPORTER_CONFIG', 'Slice 2B requires one serial worker.');
    if (config.projects[0].retries !== 0) throw new EvidenceError('BROWSER_REPORTER_CONFIG', 'Slice 2B requires retries to be disabled.');
    if (suite.allTests().length > BROWSER_LIMITS.tests_per_run) throw new EvidenceError('BROWSER_TEST_LIMIT', 'Slice 2B test count limit exceeded.');
    this.#verifySnapshotBoundSourceSuite(suite, launch.descriptor);

    const journalAuthSecret = this.options.journalAuthSecret || process.env.CONTROLLED_OPS_BROWSER_JOURNAL_AUTH_SECRET;
    this.writer = createJournalWriter(journalRoot, { allowPrepared: true, journalAuthSecret });
    this.startedAt = utcNow();
    this.writer.append({
      record_type: 'browser_run_started',
      run_id: this.runId,
      source_binding_mode: 'current_source_snapshot',
      source_manifest_digest: launch.descriptor.source_manifest_digest,
      timestamp: this.startedAt,
    });
    writeReporterReady({
      descriptorPath: this.options.descriptorPath || process.env.CONTROLLED_OPS_BROWSER_LAUNCH_DESCRIPTOR,
      journalAuthSecret,
      nonce: this.options.nonce || process.env.CONTROLLED_OPS_BROWSER_LAUNCH_NONCE,
    });
  }

  #verifySnapshotBoundSourceSuite(suite, descriptor) {
    const snapshot = validateBrowserSourceManifest(descriptor.source_manifest, descriptor.source_manifest_digest);
    this.sourceManifestDigest = descriptor.source_manifest_digest;
    if (snapshot.digest !== descriptor.source_manifest_digest) {
      throw new EvidenceError('BROWSER_SOURCE_MANIFEST_MISMATCH', 'Browser source manifest digest does not match the launch descriptor snapshot.');
    }
    const tests = suite.allTests();
    const expectedSpec = ALLOWLISTED_BROWSER_SOURCE_PATHS.pilot_spec;
    if (tests.length !== 1) throw new EvidenceError('BROWSER_SOURCE_MANIFEST_MISMATCH', 'Slice 2B supports exactly one snapshot-bound synthetic test.');
    const relativeSpec = validateRelativePath(relative(process.cwd(), tests[0].location.file).split('\\').join('/'), 'browser spec path');
    if (relativeSpec !== expectedSpec || descriptor.source_manifest.roles.pilot_spec.path !== expectedSpec) {
      throw new EvidenceError('BROWSER_SOURCE_MANIFEST_MISMATCH', 'Browser test suite does not match the allowlisted source manifest.');
    }
    validateBrowserSafeLabel(tests[0].title, 'browser snapshot-bound test title');
  }

  onTestBegin(test, result) {
    const safeLabel = validateBrowserSafeLabel(test.title, 'browser test title');
    const specPath = validateRelativePath(relative(process.cwd(), test.location.file).split('\\').join('/'), 'browser spec path');
    validateProject('chromium');
    const testId = testIdFor({ specPath, project: 'chromium', safeLabel });
    const workerIndex = result.workerIndex ?? 0;
    const retryIndex = result.retry ?? 0;
    if (workerIndex !== 0) throw new EvidenceError('BROWSER_WORKER_LIMIT', 'Slice 2B requires worker index zero.');
    if (retryIndex !== 0) throw new EvidenceError('BROWSER_RETRY_LIMIT', 'Slice 2B does not support retries.');
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
    const { observability } = this.#observabilityOrIncomplete(result, start);
    this.writer.append({
      record_type: 'browser_console_summary',
      run_id: this.runId,
      timestamp: utcNow(),
      worker_index: start.workerIndex,
      retry_index: start.retryIndex,
      spec_path: start.specPath,
      test_id: start.testId,
      attempt_id: start.attemptId,
      safe_label: start.safeLabel,
      console_aggregate: observability.console_aggregate,
    });
    this.writer.append({
      record_type: 'browser_page_error_summary',
      run_id: this.runId,
      timestamp: utcNow(),
      worker_index: start.workerIndex,
      retry_index: start.retryIndex,
      spec_path: start.specPath,
      test_id: start.testId,
      attempt_id: start.attemptId,
      safe_label: start.safeLabel,
      page_error_aggregate: observability.page_error_aggregate,
    });
    this.writer.append({
      record_type: 'browser_network_summary',
      run_id: this.runId,
      timestamp: utcNow(),
      worker_index: start.workerIndex,
      retry_index: start.retryIndex,
      spec_path: start.specPath,
      test_id: start.testId,
      attempt_id: start.attemptId,
      safe_label: start.safeLabel,
      network_aggregate: observability.network_aggregate,
    });
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

  #observabilityOrIncomplete(result, start) {
    try {
      return { observability: this.#validatedObservabilityAttachment(result, start), attachmentErrorClass: null };
    } catch (error) {
      const observability = createEmptyBrowserObservabilityAggregates();
      const classification = error?.code === 'BROWSER_OBSERVABILITY_ATTACHMENT_MISSING'
        ? 'incomplete_missing_attachment'
        : 'incomplete_invalid_attachment';
      for (const aggregate of [observability.console_aggregate, observability.page_error_aggregate, observability.network_aggregate]) {
        aggregate.completeness_status = classification;
        aggregate.collector_failure_class = 'attachment';
      }
      return { observability, attachmentErrorClass: classification };
    }
  }

  #validatedObservabilityAttachment(result, start) {
    const attachments = result.attachments ?? [];
    if (attachments.length !== 1) {
      throw new EvidenceError(attachments.length === 0 ? 'BROWSER_OBSERVABILITY_ATTACHMENT_MISSING' : 'BROWSER_OBSERVABILITY_ATTACHMENT', 'Browser test requires exactly one controlled observability attachment.');
    }
    const attachment = attachments[0];
    if (attachment.name !== BROWSER_OBSERVABILITY_ATTACHMENT_NAME || attachment.contentType !== BROWSER_OBSERVABILITY_MIME_TYPE || attachment.path || !Buffer.isBuffer(attachment.body)) {
      throw new EvidenceError('BROWSER_OBSERVABILITY_ATTACHMENT', 'Browser observability attachment must be body-backed with the expected media type.');
    }
    const envelope = parseBrowserObservabilityAttachment(attachment.body);
    if (envelope.run_id !== this.runId
      || envelope.source_manifest_digest !== this.sourceManifestDigest
      || envelope.test_id !== start.testId
      || envelope.attempt_id !== start.attemptId
      || envelope.worker_index !== start.workerIndex
      || envelope.retry_index !== start.retryIndex
      || envelope.spec_path !== start.specPath
      || envelope.safe_label !== start.safeLabel) {
      throw new EvidenceError('BROWSER_OBSERVABILITY_ATTACHMENT', 'Browser observability attachment identity does not match the test attempt.');
    }
    validateConsoleAggregate(envelope.console_aggregate);
    validatePageErrorAggregate(envelope.page_error_aggregate);
    validateNetworkAggregate(envelope.network_aggregate);
    return envelope;
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
