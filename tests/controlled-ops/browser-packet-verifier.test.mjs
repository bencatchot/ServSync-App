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
} from '../../scripts/controlled-ops/browser-importer.mjs';
import { createJournalWriter } from '../../scripts/controlled-ops/browser-journal.mjs';
import {
  BROWSER_WORKFLOW_COMMAND_CATEGORY,
  attemptIdFor,
  testIdFor,
} from '../../scripts/controlled-ops/browser-schema.mjs';
import {
  BROWSER_FREEZE_VERIFICATION_ARTIFACT,
  BROWSER_FREEZE_VERIFICATION_ARTIFACT_CLASS,
} from '../../scripts/controlled-ops/browser-packet-verifier.mjs';
import {
  createPacketBoundBrowserLaunchContract,
  promoteGeneratedBrowserEvidenceToPacket,
} from '../../scripts/controlled-ops/browser-packet-importer.mjs';
import {
  appendEvent,
  claimExecutionToken,
  createManifest,
  freezeStage,
  registerArtifact,
  sealOperation,
  updateExecutionToken,
  verifyEventChain,
  verifyPacket,
} from '../../scripts/controlled-ops/evidence.mjs';
import { readCanonicalJsonFile } from '../../scripts/controlled-ops/manifest.mjs';
import { canonicalStringify, sha256 } from '../../scripts/controlled-ops/internal.mjs';
import { makePacket, writeSafeArtifact } from './helpers.mjs';

let operationCounter = 0;
const OPERATION_WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'];

function tempRoot(prefix = 'servsync-browser-verifier-') {
  const root = mkdtempSync(join('/private/tmp', prefix));
  chmodSync(root, 0o700);
  return root;
}

function hasCode(code) {
  return (error) => error?.code === code;
}

function appendTokenEvent(root, stageId, token, idSuffix, observed, exitCode = null, artifacts = []) {
  return appendEvent(root, verifyEventChain(root).head, {
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

function writeCompletePacketBoundJournal(workspace, launch, { mutator = null } = {}) {
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
  const records = [
    {
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
    },
    { record_type: 'browser_test_started', run_id: runId, timestamp: '2026-07-23T12:00:00.100Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel },
    { record_type: 'browser_step_completed', run_id: runId, timestamp: '2026-07-23T12:00:00.200Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: 'open-local-page', status: 'passed', duration_ms: 10 },
    { record_type: 'browser_console_summary', run_id: runId, timestamp: '2026-07-23T12:00:00.300Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, console_aggregate: observability.console_aggregate },
    { record_type: 'browser_page_error_summary', run_id: runId, timestamp: '2026-07-23T12:00:00.400Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, page_error_aggregate: observability.page_error_aggregate },
    { record_type: 'browser_network_summary', run_id: runId, timestamp: '2026-07-23T12:00:00.500Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, network_aggregate: observability.network_aggregate },
    { record_type: 'browser_test_completed', run_id: runId, timestamp: '2026-07-23T12:00:00.600Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, status: 'passed', duration_ms: 500, error_classification: 'none' },
    { record_type: 'browser_run_completed', run_id: runId, timestamp: '2026-07-23T12:00:01.000Z', status: 'passed', duration_ms: 1000, error_classification: 'none' },
  ];
  for (const record of records.map((entry) => (mutator ? mutator(entry) : entry))) writer.append(record);
  writer.close();
}

function preparePromotedBrowserPacket() {
  const parent = tempRoot();
  const stageId = 'stage-1';
  const token = 'browser-token';
  const packet = makePacket(stageId, `op-${OPERATION_WORDS[operationCounter++]}`);
  const workspace = createBrowserEvidenceWorkspace({ parentRoot: parent });
  claimExecutionToken(packet.root, {
    stageId,
    token,
    commandCategory: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    expectedResult: 'completed',
  });
  const launch = createPacketBoundBrowserLaunchContract({
    operationRoot: packet.root,
    stageId,
    executionTokenId: token,
    browserWorkspace: workspace,
    baseURL: 'http://127.0.0.1:4200',
    runLabel: 'synthetic-form-submit',
  });
  writeCompletePacketBoundJournal(workspace, launch);
  updateExecutionToken(packet.root, token, 'started');
  appendTokenEvent(packet.root, stageId, token, 'started', 'started');
  updateExecutionToken(packet.root, token, 'completed', {
    commandResult: { exit_kind: 'normal', exit_code: 0, signal_name: null, signal_number: null },
    harnessResult: { classification: 'completed', detail: 'evidence_retained', wrapper_signal: null, forwarded_signal: null },
  });
  appendTokenEvent(packet.root, stageId, token, 'completed', 'passed', 0, [`stages/${stageId}/artifacts/command-output.txt`]);
  promoteGeneratedBrowserEvidenceToPacket({
    operationRoot: packet.root,
    stageId,
    executionTokenId: token,
    browserWorkspace: workspace,
  });
  return {
    packet,
    parent,
    stageId,
    token,
    artifactDir: join(packet.root, 'stages', stageId, 'artifacts'),
    cleanup() {
      try { cleanupBrowserEvidence(workspace.cleanupHandle); } catch {}
      try { packet.cleanup(); } catch {}
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

function writeCanonical(path, value, mode = 0o600) {
  writeFileSync(path, `${canonicalStringify(value)}\n`, { mode });
}

function makeMutable(path) {
  chmodSync(path, 0o600);
}

test('browser-aware freeze creates a bound verification artifact and allows manifest, seal, and external-digest verification', () => {
  const run = preparePromotedBrowserPacket();
  try {
    assert.throws(() => createManifest(run.packet.root), hasCode('BROWSER_VERIFICATION_DEFERRED'));
    const freeze = freezeStage(run.packet.root, run.stageId);
    assert.equal(freeze.lifecycle, 'workflow-frozen');
    const verificationPath = join(run.artifactDir, BROWSER_FREEZE_VERIFICATION_ARTIFACT);
    const verification = readCanonicalJsonFile(verificationPath);
    assert.equal(verification.schema_version, 'servsync-controlled-ops/browser-freeze-verification-v1');
    assert.equal(verification.operation_id, readCanonicalJsonFile(join(run.packet.root, 'operation.json')).operation_id);
    assert.equal(verification.stage_id, run.stageId);
    assert.equal(verification.execution_token_id, run.token);
    assert.equal(verification.cleanup_assurance, 'packet_recovery_without_global_workspace_absence_proof');
    assert.equal(verification.privacy_scan.secret_findings, 0);
    assert.equal(verification.privacy_scan.customer_content_findings, 0);
    assert.equal(modeOf(verificationPath), 0o400);
    const index = readCanonicalJsonFile(join(run.packet.root, 'stages', run.stageId, 'artifact-index.json'));
    assert.ok(index.artifacts.some((entry) => entry.path === BROWSER_FREEZE_VERIFICATION_ARTIFACT && entry.artifact_class === BROWSER_FREEZE_VERIFICATION_ARTIFACT_CLASS));
    const manifest = createManifest(run.packet.root);
    assert.ok(manifest.files.some((entry) => entry.path.endsWith(BROWSER_FREEZE_VERIFICATION_ARTIFACT)));
    const sealed = sealOperation(run.packet.root);
    assert.equal(verifyPacket(run.packet.root, sealed.seal_sha256).status, 'verified');
    assert.throws(() => verifyPacket(run.packet.root, 'f'.repeat(64)), hasCode('EXTERNAL_ANCHOR_MISMATCH'));
  } finally {
    run.cleanup();
  }
});

test('browser verifier rejects fixed browser path relabeling and alternate browser class paths', () => {
  for (const mutation of ['relabel-summary', 'wrong-class-path']) {
    const run = preparePromotedBrowserPacket();
    try {
      const indexPath = join(run.packet.root, 'stages', run.stageId, 'artifact-index.json');
      const index = readCanonicalJsonFile(indexPath);
      if (mutation === 'relabel-summary') {
        index.artifacts = index.artifacts.map((entry) => (entry.path === 'browser-summary.json' ? { ...entry, artifact_class: 'internal' } : entry));
      } else {
        index.artifacts.push({ path: 'nested/browser-summary.json', artifact_class: 'browser_summary', sanitization_status: 'internal', summary_path: 'nested/browser-summary.json' });
      }
      writeCanonical(indexPath, index);
      assert.throws(() => freezeStage(run.packet.root, run.stageId), hasCode('BROWSER_VERIFICATION_INVALID'));
    } finally {
      run.cleanup();
    }
  }
});

test('browser verifier rejects tampered retained browser evidence and raw browser artifacts', () => {
  for (const mutation of ['summary-status', 'import-digest', 'raw-journal']) {
    const run = preparePromotedBrowserPacket();
    try {
      if (mutation === 'summary-status') {
        const path = join(run.artifactDir, 'browser-summary.json');
        const summary = readCanonicalJsonFile(path);
        writeCanonical(path, { ...summary, status: 'failed' });
      } else if (mutation === 'import-digest') {
        const path = join(run.artifactDir, 'browser-import-summary.json');
        const summary = readCanonicalJsonFile(path);
        writeCanonical(path, { ...summary, browser_summary_sha256: 'a'.repeat(64) });
      } else {
        writeFileSync(join(run.artifactDir, 'browser-journal.ndjson'), 'status=ok\n', { mode: 0o600 });
      }
      assert.throws(() => freezeStage(run.packet.root, run.stageId), (error) => ['BROWSER_VERIFICATION_INVALID', 'BROWSER_VERIFICATION_PRIVACY_FAILED'].includes(error?.code));
    } finally {
      run.cleanup();
    }
  }
});

test('post-freeze and post-seal browser tampering is detected', () => {
  const run = preparePromotedBrowserPacket();
  try {
    freezeStage(run.packet.root, run.stageId);
    createManifest(run.packet.root);
    const sealed = sealOperation(run.packet.root);
    assert.equal(verifyPacket(run.packet.root, sealed.seal_sha256).status, 'verified');
    const verificationPath = join(run.artifactDir, BROWSER_FREEZE_VERIFICATION_ARTIFACT);
    makeMutable(verificationPath);
    const verification = readCanonicalJsonFile(verificationPath);
    writeCanonical(verificationPath, { ...verification, verification_status: 'failed' });
    assert.throws(() => verifyPacket(run.packet.root, sealed.seal_sha256), (error) => ['UNSAFE_FILE', 'BROWSER_VERIFICATION_INVALID', 'SEAL_MISMATCH'].includes(error?.code));
  } finally {
    run.cleanup();
  }
});

test('ordinary non-browser packets still freeze, manifest, seal, and verify', () => {
  const packet = makePacket('stage-1', `op-${OPERATION_WORDS[operationCounter++]}`);
  try {
    const safe = writeSafeArtifact(packet.root, 'evidence.txt', 'status=ok\ncount=1\n');
    registerArtifact(packet.root, 'stage-1', 'evidence.txt', 'evidence_output', safe.summary);
    registerArtifact(packet.root, 'stage-1', safe.summaryName, 'sanitization_summary', safe.summary);
    freezeStage(packet.root, 'stage-1');
    createManifest(packet.root);
    const sealed = sealOperation(packet.root);
    assert.equal(verifyPacket(packet.root, sealed.seal_sha256).status, 'verified');
  } finally {
    packet.cleanup();
  }
});

function modeOf(path) {
  return lstatSync(path).mode & 0o777;
}
