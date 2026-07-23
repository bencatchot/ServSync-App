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
import { join } from 'node:path';
import test from 'node:test';
import { createEmptyBrowserObservabilityAggregates } from '../../scripts/controlled-ops/browser-collectors.mjs';
import {
  cleanupBrowserEvidence,
  createBrowserEvidenceWorkspace,
  createStandaloneBrowserEvidenceSession,
  createStandaloneBrowserJournalWriter,
  discardStandaloneBrowserEvidenceSession,
  importStandaloneBrowserJournal,
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
  updateExecutionToken,
  verifyEventChain,
} from '../../scripts/controlled-ops/evidence.mjs';
import { readCanonicalJsonFile } from '../../scripts/controlled-ops/manifest.mjs';
import { GENESIS_HASH, canonicalStringify } from '../../scripts/controlled-ops/internal.mjs';
import { makePacket } from './helpers.mjs';

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
      importedAt: '2026-07-23T12:00:03.000Z',
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
      importedAt: '2026-07-23T12:00:03.000Z',
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
      importedAt: '2026-07-23T12:00:03.000Z',
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
