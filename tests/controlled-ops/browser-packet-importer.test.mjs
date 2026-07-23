import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { createEmptyBrowserObservabilityAggregates } from '../../scripts/controlled-ops/browser-collectors.mjs';
import {
  cleanupBrowserEvidence,
  createBrowserEvidenceWorkspace,
  createStandaloneBrowserEvidenceSession,
  createStandaloneBrowserJournalWriter,
  discardStandaloneBrowserEvidenceSession,
  hasActiveGeneratedBrowserWorkspace,
  importGeneratedBrowserWorkspaceJournal,
  importStandaloneBrowserJournal,
  verifyBrowserSummary,
} from '../../scripts/controlled-ops/browser-importer.mjs';
import { createJournalWriter } from '../../scripts/controlled-ops/browser-journal.mjs';
import {
  BROWSER_WORKFLOW_COMMAND_CATEGORY,
  attemptIdFor,
  testIdFor,
} from '../../scripts/controlled-ops/browser-schema.mjs';
import {
  BROWSER_IMPORT_SUMMARY_ARTIFACT,
  BROWSER_PACKET_IMPORT_STATUS,
  BROWSER_SUMMARY_ARTIFACT,
  createPacketBoundBrowserLaunchContract,
  promoteGeneratedBrowserEvidenceToPacket,
  validateBrowserImportSummary,
} from '../../scripts/controlled-ops/browser-packet-importer.mjs';
import {
  appendEvent,
  claimExecutionToken,
  createManifest,
  freezeStage,
  sealOperation,
  updateExecutionToken,
  verifyPacket,
  verifyEventChain,
} from '../../scripts/controlled-ops/evidence.mjs';
import { readCanonicalJsonFile } from '../../scripts/controlled-ops/manifest.mjs';
import { GENESIS_HASH, canonicalStringify, compareStrings, sha256 } from '../../scripts/controlled-ops/internal.mjs';
import { evidenceCli, makePacket } from './helpers.mjs';

function tempRoot(prefix = 'servsync-browser-packet-') {
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

function appendTokenEvent(root, stageId, token, idSuffix, observed, exitCode = null, artifacts = []) {
  const head = verifyEventChain(root).head;
  return appendEvent(root, head, {
    stage_id: stageId,
    event_id: `${token}-${idSuffix}`,
    event_type: idSuffix === 'started' ? 'command_started' : 'command_completed',
    action_timestamp: new Date().toISOString(),
    archive_timestamp: null,
    command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    expected_result: 'completed',
    observed_result: observed,
    result_classification: observed,
    exit_code: exitCode,
    sanitized_artifact_paths: artifacts,
  });
}

function claimBrowserToken(packet, { stageId = 'stage-1', token = 'browser-token' } = {}) {
  claimExecutionToken(packet.root, {
    stageId,
    token,
    commandCategory: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    expectedResult: 'completed',
  });
}

function completeBrowserToken(packet, { stageId = 'stage-1', token = 'browser-token' } = {}) {
  updateExecutionToken(packet.root, token, 'started');
  appendTokenEvent(packet.root, stageId, token, 'started', 'started');
  updateExecutionToken(packet.root, token, 'completed', {
    commandResult: { exit_kind: 'normal', exit_code: 0, signal_name: null, signal_number: null },
    harnessResult: { classification: 'completed', detail: 'evidence_retained', wrapper_signal: null, forwarded_signal: null },
  });
  appendTokenEvent(packet.root, stageId, token, 'completed', 'passed', 0, [`stages/${stageId}/artifacts/command-output.txt`]);
}

function failBrowserToken(packet, { token = 'browser-token' } = {}) {
  updateExecutionToken(packet.root, token, 'started');
  updateExecutionToken(packet.root, token, 'command_failed', {
    commandResult: { exit_kind: 'normal', exit_code: 7, signal_name: null, signal_number: null },
    harnessResult: { classification: 'command_failed', detail: 'command_nonzero', wrapper_signal: null, forwarded_signal: null },
  });
}

function writeCompletePacketBoundJournal(workspace, launch, { status = 'passed', mutateRunStart = null, networkMutator = null } = {}) {
  const writer = createJournalWriter(workspace.journalRoot, {
    allowPrepared: true,
    journalAuthSecret: launch.journalAuthSecret,
  });
  const runId = launch.descriptor.run_id;
  const specPath = 'tests/controlled-ops/browser-pilot/pilot.spec.ts';
  const safeLabel = 'synthetic-form-submit';
  const testId = testIdFor({ specPath, project: 'chromium', safeLabel });
  const attemptId = attemptIdFor({ testId, retryIndex: 0, workerIndex: 0 });
  const observability = createEmptyBrowserObservabilityAggregates();
  if (networkMutator) networkMutator(observability.network_aggregate);
  writer.append({
    record_type: 'browser_run_started',
    run_id: runId,
    source_binding_mode: 'current_source_snapshot',
    source_manifest_digest: launch.descriptor.source_manifest_digest,
    packet_binding_mode: launch.descriptor.packet_binding_mode,
    operation_id: launch.descriptor.operation_id,
    stage_id: launch.descriptor.stage_id,
    execution_token_id: launch.descriptor.execution_token_id,
    command_category: launch.descriptor.command_category,
    binding_digest: launch.descriptor.binding_digest,
    timestamp: '2026-07-23T12:00:00.000Z',
    ...(mutateRunStart ?? {}),
  });
  writer.append({ record_type: 'browser_test_started', run_id: runId, timestamp: '2026-07-23T12:00:00.100Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel });
  writer.append({ record_type: 'browser_step_completed', run_id: runId, timestamp: '2026-07-23T12:00:00.200Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: 'open-local-page', status: status === 'passed' ? 'passed' : 'failed', duration_ms: 10 });
  writer.append({ record_type: 'browser_console_summary', run_id: runId, timestamp: '2026-07-23T12:00:00.300Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, console_aggregate: observability.console_aggregate });
  writer.append({ record_type: 'browser_page_error_summary', run_id: runId, timestamp: '2026-07-23T12:00:00.400Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, page_error_aggregate: observability.page_error_aggregate });
  writer.append({ record_type: 'browser_network_summary', run_id: runId, timestamp: '2026-07-23T12:00:00.500Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, network_aggregate: observability.network_aggregate });
  writer.append({ record_type: 'browser_test_completed', run_id: runId, timestamp: '2026-07-23T12:00:00.600Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, status, duration_ms: 500, error_classification: status === 'passed' ? 'none' : 'assertion' });
  writer.append({ record_type: 'browser_run_completed', run_id: runId, timestamp: '2026-07-23T12:00:01.000Z', status, duration_ms: 1000, error_classification: status === 'passed' ? 'none' : 'assertion' });
  writer.close();
}

function prepareBoundRun({ stageId = 'stage-1', token = 'browser-token', status = 'passed', mutateRunStart = null, networkMutator = null } = {}) {
  const parent = tempRoot();
  const packet = makePacket(stageId, `operation-packet-${Math.random().toString(36).slice(2, 8)}`);
  const workspace = createBrowserEvidenceWorkspace({ parentRoot: parent });
  claimBrowserToken(packet, { stageId, token });
  const launch = createPacketBoundBrowserLaunchContract({
    operationRoot: packet.root,
    stageId,
    executionTokenId: token,
    browserWorkspace: workspace,
    baseURL: 'http://127.0.0.1:4200',
    runLabel: 'synthetic-form-submit',
  });
  writeCompletePacketBoundJournal(workspace, launch, { status, mutateRunStart, networkMutator });
  completeBrowserToken(packet, { stageId, token });
  return {
    packet,
    parent,
    workspace,
    launch,
    cleanup() {
      try { cleanupBrowserEvidence(workspace.cleanupHandle); } catch {}
      try { packet.cleanup(); } catch {}
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

function writeCanonical(path, value) {
  writeFileSync(path, `${canonicalStringify(value)}\n`, { mode: 0o600 });
}

function transactionPath(root) {
  return join(root, 'quarantine', 'browser-import-transaction.json');
}

function summaryCandidatePath(root) {
  return join(root, 'quarantine', 'browser-summary-candidate.json');
}

function importSummaryCandidatePath(root) {
  return join(root, 'quarantine', 'browser-import-summary-candidate.json');
}

function browserEvent(root, token = 'browser-token') {
  return readFileSync(join(root, 'events.ndjson'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((event) => event.event_id === `${token}-browser-evidence`);
}

function transactionStatuses(state) {
  const states = {
    prepared: ['pending', 'absent', 'absent', 'absent', 'absent', null],
    summary_written: ['pending', 'written', 'absent', 'absent', 'absent', null],
    workspace_cleaned: ['cleaned', 'written', 'absent', 'absent', 'absent', null],
    artifacts_written: ['cleaned', 'written', 'written', 'absent', 'absent', null],
    index_registered: ['cleaned', 'written', 'written', 'registered', 'absent', null],
    event_recorded: ['cleaned', 'written', 'written', 'registered', 'recorded', 'event'],
    completed: ['cleaned', 'written', 'written', 'registered', 'recorded', 'event'],
  };
  return states[state];
}

function transactionFromPromoted(run, { state = 'event_recorded', token = 'browser-token' } = {}) {
  const metadata = readCanonicalJsonFile(join(run.packet.root, 'operation.json'));
  const summaryPath = join(run.packet.root, 'stages', 'stage-1', 'artifacts', BROWSER_SUMMARY_ARTIFACT);
  const importSummaryPath = join(run.packet.root, 'stages', 'stage-1', 'artifacts', BROWSER_IMPORT_SUMMARY_ARTIFACT);
  const summaryContent = readFileSync(summaryPath, 'utf8');
  const importSummaryContent = readFileSync(importSummaryPath, 'utf8');
  const importSummary = validateBrowserImportSummary(readCanonicalJsonFile(importSummaryPath));
  const event = browserEvent(run.packet.root, token);
  const [cleanup, summaryArtifact, importArtifact, index, promotionEvent, eventUtc] = transactionStatuses(state);
  return {
    schema_version: 'servsync-controlled-ops/browser-import-transaction-v1',
    operation_id: metadata.operation_id,
    stage_id: 'stage-1',
    execution_token_id: token,
    command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    binding_digest: importSummary.binding_digest,
    browser_run_id: importSummary.browser_run_id,
    source_binding_mode: importSummary.source_binding_mode,
    source_manifest_digest: importSummary.source_manifest_digest,
    browser_summary_sha256: sha256(summaryContent),
    browser_summary_bytes: Buffer.byteLength(summaryContent),
    browser_import_summary_sha256: cleanup === 'cleaned' ? sha256(importSummaryContent) : null,
    browser_import_summary_bytes: cleanup === 'cleaned' ? Buffer.byteLength(importSummaryContent) : null,
    transaction_state: state,
    workspace_cleanup_status: cleanup,
    browser_summary_artifact_status: summaryArtifact,
    browser_import_summary_artifact_status: importArtifact,
    artifact_index_status: index,
    promotion_event_status: promotionEvent,
    promotion_event_utc: eventUtc === 'event' ? event.action_timestamp : null,
    prepared_utc: importSummary.imported_utc,
    updated_utc: event?.collection_timestamp ?? importSummary.imported_utc,
  };
}

function promotedRunWithTransaction(state = 'event_recorded') {
  const run = prepareBoundRun();
  promoteGeneratedBrowserEvidenceToPacket({
    operationRoot: run.packet.root,
    stageId: 'stage-1',
    executionTokenId: 'browser-token',
    browserWorkspace: run.workspace,
  });
  writeCanonical(transactionPath(run.packet.root), transactionFromPromoted(run, { state }));
  return run;
}

function browserArtifactIndexEntries() {
  return [
    { path: BROWSER_IMPORT_SUMMARY_ARTIFACT, artifact_class: 'browser_import_summary', sanitization_status: 'internal', summary_path: BROWSER_IMPORT_SUMMARY_ARTIFACT },
    { path: BROWSER_SUMMARY_ARTIFACT, artifact_class: 'browser_summary', sanitization_status: 'internal', summary_path: BROWSER_IMPORT_SUMMARY_ARTIFACT },
  ];
}

function monotonicTestTimestamp(root) {
  const last = Date.parse(verifyEventChain(root).lastActionTimestamp);
  return new Date(Math.max(Date.now(), Number.isFinite(last) ? last + 1 : 0)).toISOString();
}

function writeFinalDurableStateWithLiveWorkspace(run) {
  const imported = importGeneratedBrowserWorkspaceJournal({
    cleanupHandle: run.workspace.cleanupHandle,
    generatedAt: new Date().toISOString(),
  });
  const summary = verifyBrowserSummary(imported.summaryPath);
  const summaryContent = `${canonicalStringify(summary)}\n`;
  const metadata = readCanonicalJsonFile(join(run.packet.root, 'operation.json'));
  const preparedUtc = monotonicTestTimestamp(run.packet.root);
  const importSummary = {
    schema_version: 'servsync-controlled-ops/browser-packet-import-v1',
    operation_id: metadata.operation_id,
    stage_id: 'stage-1',
    execution_token_id: 'browser-token',
    command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    binding_digest: summary.binding_digest,
    browser_run_id: summary.run_id,
    source_binding_mode: summary.source_binding_mode,
    source_manifest_digest: summary.source_manifest_digest,
    browser_status: summary.status,
    browser_summary_relative_path: `stages/stage-1/artifacts/${BROWSER_SUMMARY_ARTIFACT}`,
    browser_summary_sha256: sha256(summaryContent),
    browser_summary_bytes: Buffer.byteLength(summaryContent),
    packet_sanitization_status: 'passed',
    browser_workspace_cleanup_status: 'cleaned',
    imported_utc: preparedUtc,
  };
  const importContent = `${canonicalStringify(importSummary)}\n`;
  const artifactDir = join(run.packet.root, 'stages', 'stage-1', 'artifacts');
  writeFileSync(join(artifactDir, BROWSER_SUMMARY_ARTIFACT), summaryContent, { mode: 0o600 });
  writeFileSync(join(artifactDir, BROWSER_IMPORT_SUMMARY_ARTIFACT), importContent, { mode: 0o600 });
  const indexPath = join(run.packet.root, 'stages', 'stage-1', 'artifact-index.json');
  const index = readCanonicalJsonFile(indexPath);
  index.artifacts.push(...browserArtifactIndexEntries());
  index.artifacts.sort((a, b) => compareStrings(a.path, b.path));
  writeCanonical(indexPath, index);
  appendEvent(run.packet.root, verifyEventChain(run.packet.root).head, {
    stage_id: 'stage-1',
    event_id: 'browser-token-browser-evidence',
    event_type: 'browser-promoted',
    action_timestamp: preparedUtc,
    archive_timestamp: null,
    command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    expected_result: 'completed',
    observed_result: 'browser-promoted',
    result_classification: 'passed',
    exit_code: null,
    sanitized_artifact_paths: [
      `stages/stage-1/artifacts/${BROWSER_SUMMARY_ARTIFACT}`,
      `stages/stage-1/artifacts/${BROWSER_IMPORT_SUMMARY_ARTIFACT}`,
    ],
  });
  const transaction = {
    schema_version: 'servsync-controlled-ops/browser-import-transaction-v1',
    operation_id: metadata.operation_id,
    stage_id: 'stage-1',
    execution_token_id: 'browser-token',
    command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    binding_digest: summary.binding_digest,
    browser_run_id: summary.run_id,
    source_binding_mode: summary.source_binding_mode,
    source_manifest_digest: summary.source_manifest_digest,
    browser_summary_sha256: sha256(summaryContent),
    browser_summary_bytes: Buffer.byteLength(summaryContent),
    browser_import_summary_sha256: sha256(importContent),
    browser_import_summary_bytes: Buffer.byteLength(importContent),
    transaction_state: 'event_recorded',
    workspace_cleanup_status: 'cleaned',
    browser_summary_artifact_status: 'written',
    browser_import_summary_artifact_status: 'written',
    artifact_index_status: 'registered',
    promotion_event_status: 'recorded',
    promotion_event_utc: preparedUtc,
    prepared_utc: preparedUtc,
    updated_utc: preparedUtc,
  };
  writeCanonical(transactionPath(run.packet.root), transaction);
  return { importSummary, summary, transaction };
}

test('packet-bound generated browser run promotes exactly one packet-owned summary and import summary', () => {
  const run = prepareBoundRun();
  try {
    assert.equal(run.launch.descriptor.packet_binding_mode, 'command_token');
    assert.equal(run.launch.descriptor.operation_id, readCanonicalJsonFile(join(run.packet.root, 'operation.json')).operation_id);
    const result = promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: run.workspace,
      generatedAt: '2026-07-23T12:00:02.000Z',
    });
    assert.equal(result.status, BROWSER_PACKET_IMPORT_STATUS);
    assert.equal(result.freeze_state, 'not_frozen');
    assert.equal(result.manifest_state, 'not_created');
    assert.equal(result.seal_state, 'not_created');
    const artifactDir = join(run.packet.root, 'stages', 'stage-1', 'artifacts');
    const summaryPath = join(artifactDir, BROWSER_SUMMARY_ARTIFACT);
    const importSummaryPath = join(artifactDir, BROWSER_IMPORT_SUMMARY_ARTIFACT);
    assert.equal(modeOf(summaryPath), 0o600);
    assert.equal(modeOf(importSummaryPath), 0o600);
    assert.equal(lstatSync(summaryPath).nlink, 1);
    assert.equal(lstatSync(importSummaryPath).nlink, 1);
    const summary = readCanonicalJsonFile(summaryPath);
    assert.equal(summary.packet_binding_mode, 'command_token');
    assert.equal(summary.binding_digest, run.launch.descriptor.binding_digest);
    const importSummary = validateBrowserImportSummary(readCanonicalJsonFile(importSummaryPath));
    assert.equal(importSummary.browser_summary_sha256, result.browser_summary_sha256);
    assert.equal(importSummary.browser_workspace_cleanup_status, 'cleaned');
    assert.equal(existsSync(run.workspace.root), false);
    assert.equal(existsSync(join(run.packet.root, 'manifest.json')), false);
    assert.equal(existsSync(join(run.packet.root, 'seal.json')), false);
    assert.equal(existsSync(join(run.packet.root, 'stages', 'stage-1', 'stage-freeze.json')), false);
    assert.equal(existsSync(join(run.packet.root, 'quarantine', 'browser-token-browser-summary.json')), false);
    const index = readCanonicalJsonFile(join(run.packet.root, 'stages', 'stage-1', 'artifact-index.json'));
    assert.deepEqual(index.artifacts.map((entry) => entry.path).sort(), [BROWSER_IMPORT_SUMMARY_ARTIFACT, BROWSER_SUMMARY_ARTIFACT].sort());
  } finally {
    run.cleanup();
  }
});

test('promotion rejects caller-supplied importedAt and derives current monotonic timestamps', () => {
  const run = prepareBoundRun();
  try {
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: run.workspace,
      generatedAt: '2026-07-23T12:00:02.000Z',
      importedAt: '2026-07-23T01:00:03.000Z',
    }), hasCode('INVALID_SCHEMA'));
    const result = promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: run.workspace,
    });
    assert.equal(result.status, BROWSER_PACKET_IMPORT_STATUS);
    const importSummary = validateBrowserImportSummary(readCanonicalJsonFile(join(run.packet.root, 'stages', 'stage-1', 'artifacts', BROWSER_IMPORT_SUMMARY_ARTIFACT)));
    const event = readFileSync(join(run.packet.root, 'events.ndjson'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((current) => current.event_id === 'browser-token-browser-evidence');
    assert.ok(Date.parse(importSummary.imported_utc) >= Date.parse('2026-07-23T12:00:01.000Z'));
    assert.ok(Date.parse(event.action_timestamp) >= Date.parse(importSummary.imported_utc));
    assert.throws(() => freezeStage(run.packet.root, 'stage-1'), hasCode('BROWSER_VERIFICATION_DEFERRED'));
  } finally {
    run.cleanup();
  }
});

test('transaction binding fields are recomputed and immutable on resume', () => {
  const mutations = [
    ['binding_digest', 'f'.repeat(64)],
    ['operation_id', 'operation-mutated'],
    ['stage_id', 'stage-mutated'],
    ['execution_token_id', 'token-mutated'],
    ['command_category', 'browser-workflow-mutated'],
    ['browser_run_id', 'browser-run-mutated'],
    ['source_binding_mode', 'standalone'],
    ['source_manifest_digest', 'e'.repeat(64)],
  ];
  for (const [field, value] of mutations) {
    const run = promotedRunWithTransaction('event_recorded');
    try {
      const transaction = readCanonicalJsonFile(transactionPath(run.packet.root));
      writeCanonical(transactionPath(run.packet.root), { ...transaction, [field]: value });
      assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
        operationRoot: run.packet.root,
        stageId: 'stage-1',
        executionTokenId: 'browser-token',
        browserWorkspace: run.workspace,
      }), (error) => ['BROWSER_PACKET_TRANSACTION_INVALID', 'INVALID_BROWSER_PACKET_BINDING', 'INVALID_BROWSER_SOURCE_BINDING'].includes(error?.code));
    } finally {
      run.cleanup();
    }
  }
});

test('transaction phase/status equations reject impossible combinations', () => {
  const invalids = [
    { transaction_state: 'completed', workspace_cleanup_status: 'pending' },
    { transaction_state: 'completed', promotion_event_status: 'absent' },
    { transaction_state: 'event_recorded', artifact_index_status: 'absent' },
    { transaction_state: 'index_registered', browser_import_summary_artifact_status: 'absent' },
    { transaction_state: 'artifacts_written', workspace_cleanup_status: 'pending' },
    { transaction_state: 'workspace_cleaned', browser_summary_artifact_status: 'absent' },
    { transaction_state: 'summary_written', browser_import_summary_sha256: 'a'.repeat(64) },
    { transaction_state: 'event_recorded', promotion_event_utc: null },
  ];
  for (const mutation of invalids) {
    const run = promotedRunWithTransaction('event_recorded');
    try {
      const transaction = readCanonicalJsonFile(transactionPath(run.packet.root));
      writeCanonical(transactionPath(run.packet.root), { ...transaction, ...mutation });
      assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
        operationRoot: run.packet.root,
        stageId: 'stage-1',
        executionTokenId: 'browser-token',
        browserWorkspace: run.workspace,
      }), hasCode('BROWSER_PACKET_TRANSACTION_INVALID'));
    } finally {
      run.cleanup();
    }
  }
});

test('completed files, index, and event recover without deleted candidates', () => {
  for (const state of ['event_recorded', 'completed']) {
    const run = promotedRunWithTransaction(state);
    try {
      assert.equal(existsSync(summaryCandidatePath(run.packet.root)), false);
      assert.equal(existsSync(importSummaryCandidatePath(run.packet.root)), false);
      const beforeEvents = readFileSync(join(run.packet.root, 'events.ndjson'), 'utf8').split('\n').filter((line) => line.includes('browser-promoted')).length;
      const result = promoteGeneratedBrowserEvidenceToPacket({
        operationRoot: run.packet.root,
        stageId: 'stage-1',
        executionTokenId: 'browser-token',
        browserWorkspace: run.workspace,
      });
      assert.equal(result.status, BROWSER_PACKET_IMPORT_STATUS);
      assert.equal(existsSync(transactionPath(run.packet.root)), false);
      assert.equal(existsSync(summaryCandidatePath(run.packet.root)), false);
      assert.equal(existsSync(importSummaryCandidatePath(run.packet.root)), false);
      const afterEvents = readFileSync(join(run.packet.root, 'events.ndjson'), 'utf8').split('\n').filter((line) => line.includes('browser-promoted')).length;
      assert.equal(afterEvents, beforeEvents);
    } finally {
      run.cleanup();
    }
  }
});

test('prepared transaction resumes from authenticated imported workspace summary before candidates exist', () => {
  const run = prepareBoundRun();
  try {
    const imported = importGeneratedBrowserWorkspaceJournal({
      cleanupHandle: run.workspace.cleanupHandle,
      generatedAt: new Date().toISOString(),
    });
    const summary = verifyBrowserSummary(imported.summaryPath);
    const summaryContent = `${canonicalStringify(summary)}\n`;
    const metadata = readCanonicalJsonFile(join(run.packet.root, 'operation.json'));
    const preparedUtc = monotonicTestTimestamp(run.packet.root);
    writeCanonical(transactionPath(run.packet.root), {
      schema_version: 'servsync-controlled-ops/browser-import-transaction-v1',
      operation_id: metadata.operation_id,
      stage_id: 'stage-1',
      execution_token_id: 'browser-token',
      command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
      binding_digest: summary.binding_digest,
      browser_run_id: summary.run_id,
      source_binding_mode: summary.source_binding_mode,
      source_manifest_digest: summary.source_manifest_digest,
      browser_summary_sha256: sha256(summaryContent),
      browser_summary_bytes: Buffer.byteLength(summaryContent),
      browser_import_summary_sha256: null,
      browser_import_summary_bytes: null,
      transaction_state: 'prepared',
      workspace_cleanup_status: 'pending',
      browser_summary_artifact_status: 'absent',
      browser_import_summary_artifact_status: 'absent',
      artifact_index_status: 'absent',
      promotion_event_status: 'absent',
      promotion_event_utc: null,
      prepared_utc: preparedUtc,
      updated_utc: preparedUtc,
    });
    assert.equal(existsSync(summaryCandidatePath(run.packet.root)), false);
    assert.equal(hasActiveGeneratedBrowserWorkspace(summary.run_id), true);
    const result = promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: run.workspace,
    });
    assert.equal(result.status, BROWSER_PACKET_IMPORT_STATUS);
    assert.equal(existsSync(run.workspace.root), false);
    assert.equal(hasActiveGeneratedBrowserWorkspace(summary.run_id), false);
  } finally {
    run.cleanup();
  }
});

test('candidate removal and transaction unlink failures are resumable after event recording', () => {
  for (const candidateToKeep of ['summary', 'import-summary', 'none']) {
    const run = promotedRunWithTransaction('event_recorded');
    try {
      const summaryContent = readFileSync(join(run.packet.root, 'stages', 'stage-1', 'artifacts', BROWSER_SUMMARY_ARTIFACT), 'utf8');
      const importContent = readFileSync(join(run.packet.root, 'stages', 'stage-1', 'artifacts', BROWSER_IMPORT_SUMMARY_ARTIFACT), 'utf8');
      if (candidateToKeep === 'summary') writeCanonical(summaryCandidatePath(run.packet.root), JSON.parse(summaryContent));
      if (candidateToKeep === 'import-summary') writeCanonical(importSummaryCandidatePath(run.packet.root), JSON.parse(importContent));
      const result = promoteGeneratedBrowserEvidenceToPacket({
        operationRoot: run.packet.root,
        stageId: 'stage-1',
        executionTokenId: 'browser-token',
        browserWorkspace: run.workspace,
      });
      assert.equal(result.status, BROWSER_PACKET_IMPORT_STATUS);
      assert.equal(existsSync(transactionPath(run.packet.root)), false);
      assert.equal(existsSync(summaryCandidatePath(run.packet.root)), false);
      assert.equal(existsSync(importSummaryCandidatePath(run.packet.root)), false);
    } finally {
      run.cleanup();
    }
  }
});

test('orphan browser candidates are either safely removed or rejected on conflict', () => {
  const clean = prepareBoundRun();
  try {
    writeCanonical(summaryCandidatePath(clean.packet.root), { orphan: 'summary' });
    writeCanonical(importSummaryCandidatePath(clean.packet.root), { orphan: 'import-summary' });
    const result = promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: clean.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: clean.workspace,
    });
    assert.equal(result.status, BROWSER_PACKET_IMPORT_STATUS);
  } finally {
    clean.cleanup();
  }

  const conflict = prepareBoundRun();
  try {
    writeCanonical(summaryCandidatePath(conflict.packet.root), { orphan: 'summary' });
    writeFileSync(join(conflict.packet.root, 'stages', 'stage-1', 'artifacts', BROWSER_SUMMARY_ARTIFACT), `${canonicalStringify({ status: 'retained' })}\n`, { mode: 0o600 });
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: conflict.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: conflict.workspace,
    }), hasCode('BROWSER_PACKET_STATE_CONFLICT'));
  } finally {
    conflict.cleanup();
  }
});

test('cleanup truth requires retained evidence or an authentic live cleanup handle', () => {
  const run = prepareBoundRun();
  try {
    const imported = importGeneratedBrowserWorkspaceJournal({
      cleanupHandle: run.workspace.cleanupHandle,
      generatedAt: new Date().toISOString(),
    });
    const summary = verifyBrowserSummary(imported.summaryPath);
    const summaryContent = `${canonicalStringify(summary)}\n`;
    const metadata = readCanonicalJsonFile(join(run.packet.root, 'operation.json'));
    const preparedUtc = new Date().toISOString();
    const importSummary = {
      schema_version: 'servsync-controlled-ops/browser-packet-import-v1',
      operation_id: metadata.operation_id,
      stage_id: 'stage-1',
      execution_token_id: 'browser-token',
      command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
      binding_digest: summary.binding_digest,
      browser_run_id: summary.run_id,
      source_binding_mode: summary.source_binding_mode,
      source_manifest_digest: summary.source_manifest_digest,
      browser_status: summary.status,
      browser_summary_relative_path: `stages/stage-1/artifacts/${BROWSER_SUMMARY_ARTIFACT}`,
      browser_summary_sha256: sha256(summaryContent),
      browser_summary_bytes: Buffer.byteLength(summaryContent),
      packet_sanitization_status: 'passed',
      browser_workspace_cleanup_status: 'cleaned',
      imported_utc: preparedUtc,
    };
    const importContent = `${canonicalStringify(importSummary)}\n`;
    writeFileSync(join(run.packet.root, 'stages', 'stage-1', 'artifacts', BROWSER_SUMMARY_ARTIFACT), summaryContent, { mode: 0o600 });
    writeFileSync(importSummaryCandidatePath(run.packet.root), importContent, { mode: 0o600 });
    writeCanonical(transactionPath(run.packet.root), {
      schema_version: 'servsync-controlled-ops/browser-import-transaction-v1',
      operation_id: metadata.operation_id,
      stage_id: 'stage-1',
      execution_token_id: 'browser-token',
      command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
      binding_digest: summary.binding_digest,
      browser_run_id: summary.run_id,
      source_binding_mode: summary.source_binding_mode,
      source_manifest_digest: summary.source_manifest_digest,
      browser_summary_sha256: sha256(summaryContent),
      browser_summary_bytes: Buffer.byteLength(summaryContent),
      browser_import_summary_sha256: sha256(importContent),
      browser_import_summary_bytes: Buffer.byteLength(importContent),
      transaction_state: 'workspace_cleaned',
      workspace_cleanup_status: 'cleaned',
      browser_summary_artifact_status: 'written',
      browser_import_summary_artifact_status: 'absent',
      artifact_index_status: 'absent',
      promotion_event_status: 'absent',
      promotion_event_utc: null,
      prepared_utc: preparedUtc,
      updated_utc: preparedUtc,
    });
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: {},
    }), hasCode('BROWSER_PACKET_CLEANUP_AUTHORITY_REQUIRED'));
    assert.equal(existsSync(run.workspace.root), true);
    const result = promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: run.workspace,
    });
    assert.equal(result.status, BROWSER_PACKET_IMPORT_STATUS);
    assert.equal(existsSync(run.workspace.root), false);
  } finally {
    run.cleanup();
  }
});

test('final-state shortcut rejects known live workspace without cleanup authority', () => {
  const run = prepareBoundRun();
  try {
    const { summary } = writeFinalDurableStateWithLiveWorkspace(run);
    assert.equal(existsSync(run.workspace.root), true);
    assert.equal(hasActiveGeneratedBrowserWorkspace(summary.run_id), true);
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: undefined,
    }), hasCode('BROWSER_PACKET_CLEANUP_AUTHORITY_REQUIRED'));
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: { root: run.workspace.root },
    }), hasCode('BROWSER_PACKET_CLEANUP_AUTHORITY_REQUIRED'));
    assert.equal(existsSync(run.workspace.root), true);
    const result = promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: run.workspace,
    });
    assert.equal(result.status, BROWSER_PACKET_IMPORT_STATUS);
    assert.equal(existsSync(run.workspace.root), false);
    assert.equal(hasActiveGeneratedBrowserWorkspace(summary.run_id), false);
    assert.equal(existsSync(transactionPath(run.packet.root)), false);
  } finally {
    run.cleanup();
  }
});

test('event timestamp and import-summary timestamp are validated exactly', () => {
  const run = promotedRunWithTransaction('event_recorded');
  try {
    const transaction = readCanonicalJsonFile(transactionPath(run.packet.root));
    writeCanonical(transactionPath(run.packet.root), {
      ...transaction,
      promotion_event_utc: new Date(Date.parse(transaction.promotion_event_utc) + 1000).toISOString(),
    });
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: run.workspace,
    }), hasCode('BROWSER_PACKET_EVENT_CONFLICT'));
  } finally {
    run.cleanup();
  }

  const invalid = {
    schema_version: 'servsync-controlled-ops/browser-packet-import-v1',
    operation_id: 'operation-timestamp',
    stage_id: 'stage-1',
    execution_token_id: 'browser-token',
    command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    binding_digest: 'a'.repeat(64),
    browser_run_id: 'browser-run-123456789abc',
    source_binding_mode: 'current_source_snapshot',
    source_manifest_digest: 'b'.repeat(64),
    browser_status: 'passed',
    browser_summary_relative_path: `stages/stage-1/artifacts/${BROWSER_SUMMARY_ARTIFACT}`,
    browser_summary_sha256: 'c'.repeat(64),
    browser_summary_bytes: 10,
    packet_sanitization_status: 'passed',
    browser_workspace_cleanup_status: 'cleaned',
    imported_utc: '2026-7-23T00:00:00Z',
  };
  assert.throws(() => validateBrowserImportSummary(invalid), hasCode('INVALID_TIMESTAMP'));
});

test('fixed browser artifact paths and classes cannot bypass deferred finalization', () => {
  const relabeled = prepareBoundRun();
  try {
    promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: relabeled.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: relabeled.workspace,
    });
    const indexPath = join(relabeled.packet.root, 'stages', 'stage-1', 'artifact-index.json');
    const index = readCanonicalJsonFile(indexPath);
    index.artifacts = index.artifacts.map((entry) => (
      entry.path === BROWSER_SUMMARY_ARTIFACT ? { ...entry, artifact_class: 'internal' } : entry
    ));
    writeCanonical(indexPath, index);
    assert.throws(() => freezeStage(relabeled.packet.root, 'stage-1'), hasCode('BROWSER_VERIFICATION_DEFERRED'));
  } finally {
    relabeled.cleanup();
  }

  const wrongPath = prepareBoundRun();
  try {
    const indexPath = join(wrongPath.packet.root, 'stages', 'stage-1', 'artifact-index.json');
    const index = readCanonicalJsonFile(indexPath);
    index.artifacts.push({
      path: 'alternate-browser-summary.json',
      artifact_class: 'browser_summary',
      sanitization_status: 'internal',
      summary_path: 'alternate-browser-summary.json',
    });
    writeCanonical(indexPath, index);
    assert.throws(() => freezeStage(wrongPath.packet.root, 'stage-1'), hasCode('BROWSER_VERIFICATION_DEFERRED'));
  } finally {
    wrongPath.cleanup();
  }
});

test('packet importer rejects wrong token state and linkage before promotion', () => {
  const active = prepareBoundRun();
  try {
    const packet = makePacket('stage-1', 'operation-active-token');
    const parent = tempRoot('servsync-browser-active-token-');
    const workspace = createBrowserEvidenceWorkspace({ parentRoot: parent });
    claimBrowserToken(packet);
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: workspace,
    }), hasCode('BROWSER_PACKET_TOKEN_NOT_SUCCESSFUL'));
    cleanupBrowserEvidence(workspace.cleanupHandle);
    packet.cleanup();
    rmSync(parent, { recursive: true, force: true });

    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: active.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'wrong-token',
      browserWorkspace: active.workspace,
    }), (error) => ['PATH_NOT_FOUND', 'ENOENT', 'UNSAFE_FILE'].includes(error?.code) || /no such file/i.test(error?.message ?? ''));
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: active.packet.root,
      stageId: 'wrong-stage',
      executionTokenId: 'browser-token',
      browserWorkspace: active.workspace,
    }), hasCode('BROWSER_PACKET_STAGE_INVALID'));
  } finally {
    active.cleanup();
  }
});

test('failed terminal tokens, failed browser summaries, unbound generated evidence, and standalone evidence are ineligible', () => {
  const failedToken = prepareBoundRun();
  try {
    const packet = makePacket('stage-1', 'operation-failed-token');
    const parent = tempRoot('servsync-browser-failed-token-');
    const workspace = createBrowserEvidenceWorkspace({ parentRoot: parent });
    claimBrowserToken(packet);
    failBrowserToken(packet);
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: workspace,
    }), hasCode('BROWSER_PACKET_TOKEN_NOT_SUCCESSFUL'));
    cleanupBrowserEvidence(workspace.cleanupHandle);
    packet.cleanup();
    rmSync(parent, { recursive: true, force: true });
  } finally {
    failedToken.cleanup();
  }

  const failedBrowser = prepareBoundRun({ status: 'failed' });
  try {
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: failedBrowser.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: failedBrowser.workspace,
    }), (error) => ['BROWSER_STATUS_MISMATCH', 'BROWSER_PACKET_SUMMARY_NOT_ELIGIBLE'].includes(error?.code));
  } finally {
    failedBrowser.cleanup();
  }

  const unbound = prepareBoundRun({ mutateRunStart: { packet_binding_mode: 'none', operation_id: null, stage_id: null, execution_token_id: null, command_category: null, binding_digest: null } });
  try {
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: unbound.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: unbound.workspace,
    }), (error) => ['BROWSER_CLEANUP_PROVENANCE_MISMATCH', 'BROWSER_PACKET_SUMMARY_NOT_ELIGIBLE', 'INVALID_BROWSER_PACKET_BINDING'].includes(error?.code));
  } finally {
    unbound.cleanup();
  }

  const standaloneParent = tempRoot('servsync-browser-standalone-packet-');
  const standalonePacket = makePacket('stage-1', 'operation-standalone');
  try {
    const standalone = createStandaloneBrowserEvidenceSession({ parentRoot: standaloneParent });
    const writer = createStandaloneBrowserJournalWriter({ standaloneHandle: standalone.standaloneHandle });
    writer.append({ record_type: 'browser_run_started', run_id: standalone.runId, timestamp: '2026-07-23T12:00:00.000Z' });
    writer.append({ record_type: 'browser_run_completed', run_id: standalone.runId, timestamp: '2026-07-23T12:00:01.000Z', status: 'passed', duration_ms: 1000 });
    writer.close();
    importStandaloneBrowserJournal({ standaloneHandle: standalone.standaloneHandle });
    claimBrowserToken(standalonePacket);
    completeBrowserToken(standalonePacket);
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: standalonePacket.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: standalone,
    }), hasCode('INVALID_BROWSER_CLEANUP_HANDLE'));
    discardStandaloneBrowserEvidenceSession({ standaloneHandle: standalone.standaloneHandle });
  } finally {
    standalonePacket.cleanup();
    rmSync(standaloneParent, { recursive: true, force: true });
  }
});

test('packet importer rejects digest drift, unsupported browser activity, duplicates, and destination preexistence', () => {
  assert.throws(() => prepareBoundRun({ mutateRunStart: { binding_digest: 'f'.repeat(64) } }), hasCode('INVALID_BROWSER_PACKET_BINDING'));

  const unsupported = prepareBoundRun({
    networkMutator(network) {
      network.worker_attempt_count = 1;
      network.rejected_egress_class_counts.worker = 1;
    },
  });
  try {
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: unsupported.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: unsupported.workspace,
    }), (error) => ['BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'BROWSER_PACKET_SUMMARY_NOT_ELIGIBLE'].includes(error?.code));
  } finally {
    unsupported.cleanup();
  }

  const duplicate = prepareBoundRun();
  try {
    promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: duplicate.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: duplicate.workspace,
      generatedAt: '2026-07-23T12:00:02.000Z',
    });
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: duplicate.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: duplicate.workspace,
    }), hasCode('BROWSER_PACKET_IMPORT_EXISTS'));
  } finally {
    duplicate.cleanup();
  }

  const preexisting = prepareBoundRun();
  try {
    const artifactDir = join(preexisting.packet.root, 'stages', 'stage-1', 'artifacts');
    writeFileSync(join(artifactDir, BROWSER_SUMMARY_ARTIFACT), `${canonicalStringify({ status: 'ok' })}\n`, { mode: 0o600 });
    assert.throws(() => promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: preexisting.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: preexisting.workspace,
    }), hasCode('BROWSER_PACKET_IMPORT_EXISTS'));
  } finally {
    preexisting.cleanup();
  }
});

test('packet importer does not freeze, manifest, seal, or retain raw browser workspace files', () => {
  const run = prepareBoundRun();
  try {
    const result = promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: run.workspace,
      generatedAt: '2026-07-23T12:00:02.000Z',
    });
    assert.equal(result.freeze_state, 'not_frozen');
    assert.equal(result.manifest_state, 'not_created');
    assert.equal(result.seal_state, 'not_created');
    assert.equal(existsSync(run.workspace.root), false);
    assert.equal(existsSync(join(run.packet.root, 'stages', 'stage-1', 'stage-freeze.json')), false);
    assert.equal(existsSync(join(run.packet.root, 'manifest.json')), false);
    assert.equal(existsSync(join(run.packet.root, 'seal.json')), false);
    const retained = readFileSync(join(run.packet.root, 'stages', 'stage-1', 'artifacts', BROWSER_SUMMARY_ARTIFACT), 'utf8');
    assert.equal(retained.includes('browser-journal.ndjson'), false);
    assert.equal(retained.includes('browser-launch.json'), false);
    assert.equal(retained.includes('browser-reporter-ready.json'), false);
    assert.equal(retained.includes('journal_auth'), false);
    assert.equal(retained.includes('nonce'), false);
  } finally {
    run.cleanup();
  }
});

test('browser packet imports block generic finalization until browser-aware verification exists', () => {
  const run = prepareBoundRun();
  try {
    promoteGeneratedBrowserEvidenceToPacket({
      operationRoot: run.packet.root,
      stageId: 'stage-1',
      executionTokenId: 'browser-token',
      browserWorkspace: run.workspace,
      generatedAt: '2026-07-23T12:00:02.000Z',
    });
    assert.throws(() => freezeStage(run.packet.root, 'stage-1'), hasCode('BROWSER_VERIFICATION_DEFERRED'));
    assert.throws(() => createManifest(run.packet.root), hasCode('BROWSER_VERIFICATION_DEFERRED'));
    assert.throws(() => sealOperation(run.packet.root), hasCode('BROWSER_VERIFICATION_DEFERRED'));
    assert.throws(() => verifyPacket(run.packet.root), hasCode('BROWSER_VERIFICATION_DEFERRED'));
    for (const [command, args] of [
      ['freeze-stage', ['freeze-stage', '--root', run.packet.root, '--stage', 'stage-1']],
      ['create-manifest', ['create-manifest', '--root', run.packet.root]],
      ['seal', ['seal', '--root', run.packet.root]],
      ['verify', ['verify', '--root', run.packet.root]],
    ]) {
      const result = spawnSync(process.execPath, [evidenceCli, ...args], { encoding: 'utf8' });
      assert.notEqual(result.status, 0, command);
      assert.match(result.stderr, /BROWSER_VERIFICATION_DEFERRED/, command);
    }
  } finally {
    run.cleanup();
  }
});
