import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  createPacketBoundBrowserLaunchContract,
  promoteGeneratedBrowserEvidenceToPacket,
  retainTerminalBrowserAttemptOutcome,
} from '../../scripts/controlled-ops/browser-packet-importer.mjs';
import {
  freezeStage,
  createManifest,
  sealOperation,
  claimExecutionToken,
  updateExecutionToken,
  appendEvent,
  verifyEventChain,
  readEvents,
  verifyPacket,
} from '../../scripts/controlled-ops/evidence.mjs';
import { readCanonicalJsonFile } from '../../scripts/controlled-ops/manifest.mjs';
import {
  attemptOutcomePath,
  attemptSummaryPath,
  BROWSER_ATTEMPT_LIMIT,
  BROWSER_ATTEMPT_SELECTION_ARTIFACT,
  buildAttemptInventory,
  readAttemptOutcome,
} from '../../scripts/controlled-ops/browser-attempts.mjs';
import { canonicalStringify, sha256 } from '../../scripts/controlled-ops/internal.mjs';
import { makePacket } from './helpers.mjs';

let operationCounter = 0;
const OPERATION_WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa'];

function tempRoot(prefix = 'servsync-browser-attempts-') {
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

function claimBrowserToken(packet, token, retry = null) {
  return claimExecutionToken(packet.root, {
    stageId: 'stage-1',
    token,
    commandCategory: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    expectedResult: 'completed',
    ...(retry ? { retryOf: retry.prior, retryAuthorization: retry.authorization } : {}),
  });
}

function completeToken(packet, token, { state = 'command_failed', exitCode = 7 } = {}) {
  updateExecutionToken(packet.root, token, 'started');
  appendTokenEvent(packet.root, 'stage-1', token, 'started', 'started');
  updateExecutionToken(packet.root, token, state, {
    commandResult: { exit_kind: 'normal', exit_code: exitCode, signal_name: null, signal_number: null },
    harnessResult: { classification: state === 'completed' ? 'completed' : state, detail: state === 'completed' ? 'evidence_retained' : 'local_fixture', wrapper_signal: null, forwarded_signal: null },
  });
  appendTokenEvent(packet.root, 'stage-1', token, 'completed', state === 'completed' ? 'passed' : state, exitCode, [`stages/stage-1/artifacts/${attemptOutcomePath(token)}`]);
}

function writeCanonical(path, value) {
  writeFileSync(path, `${canonicalStringify(value)}\n`, { mode: 0o600 });
}

function mutateOutcome(packet, token, mutator) {
  const path = join(packet.root, 'stages', 'stage-1', 'artifacts', attemptOutcomePath(token));
  const outcome = readCanonicalJsonFile(path);
  writeCanonical(path, mutator(outcome));
  return path;
}

function writePassedJournal(workspace, launch) {
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
  });
  writer.append({ record_type: 'browser_test_started', run_id: runId, timestamp: '2026-07-23T12:00:00.100Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel });
  writer.append({ record_type: 'browser_step_completed', run_id: runId, timestamp: '2026-07-23T12:00:00.200Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: 'open-local-page', status: 'passed', duration_ms: 10 });
  writer.append({ record_type: 'browser_console_summary', run_id: runId, timestamp: '2026-07-23T12:00:00.300Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, console_aggregate: observability.console_aggregate });
  writer.append({ record_type: 'browser_page_error_summary', run_id: runId, timestamp: '2026-07-23T12:00:00.400Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, page_error_aggregate: observability.page_error_aggregate });
  writer.append({ record_type: 'browser_network_summary', run_id: runId, timestamp: '2026-07-23T12:00:00.500Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, network_aggregate: observability.network_aggregate });
  writer.append({ record_type: 'browser_test_completed', run_id: runId, timestamp: '2026-07-23T12:00:00.600Z', worker_index: 0, retry_index: 0, spec_path: specPath, test_id: testId, attempt_id: attemptId, safe_label: safeLabel, status: 'passed', duration_ms: 500, error_classification: 'none' });
  writer.append({ record_type: 'browser_run_completed', run_id: runId, timestamp: '2026-07-23T12:00:01.000Z', status: 'passed', duration_ms: 1000, error_classification: 'none' });
  writer.close();
}

function runSuccessfulAttempt(packet, token, parentRoot) {
  const workspace = createBrowserEvidenceWorkspace({ parentRoot });
  const launch = createPacketBoundBrowserLaunchContract({
    operationRoot: packet.root,
    stageId: 'stage-1',
    executionTokenId: token,
    browserWorkspace: workspace,
    baseURL: 'http://127.0.0.1:4200',
    runLabel: 'synthetic-form-submit',
  });
  writePassedJournal(workspace, launch);
  completeToken(packet, token, { state: 'completed', exitCode: 0 });
  const promoted = promoteGeneratedBrowserEvidenceToPacket({
    operationRoot: packet.root,
    stageId: 'stage-1',
    executionTokenId: token,
    browserWorkspace: workspace,
  });
  return { workspace, promoted };
}

function withPacket(fn) {
  const packet = makePacket('stage-1', `op-${OPERATION_WORDS[operationCounter++]}`);
  const parent = tempRoot();
  try {
    return fn(packet, parent);
  } finally {
    try { packet.cleanup(); } catch {}
    rmSync(parent, { recursive: true, force: true });
  }
}

test('browser attempts reject concurrent active attempts and require linear retry lineage', () => withPacket((packet) => {
  claimBrowserToken(packet, 'attempt-one');
  assert.throws(() => claimBrowserToken(packet, 'attempt-two'), hasCode('BROWSER_ATTEMPT_ACTIVE'));
  completeToken(packet, 'attempt-one', { state: 'command_failed', exitCode: 7 });

  assert.throws(() => claimBrowserToken(packet, 'attempt-two'), hasCode('BROWSER_RETRY_LINEAGE_INVALID'));
  assert.throws(() => claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' }), hasCode('BROWSER_PREDECESSOR_NOT_RECONCILED'));
  retainTerminalBrowserAttemptOutcome({
    operationRoot: packet.root,
    stageId: 'stage-1',
    executionTokenId: 'attempt-one',
    cleanupAssurance: 'no_workspace_created',
  });
  const retry = claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' });
  assert.equal(retry.retry.retry_count, 1);
  completeToken(packet, 'attempt-two', { state: 'command_failed', exitCode: 7 });
  assert.throws(() => claimBrowserToken(packet, 'attempt-branch', { prior: 'attempt-one', authorization: 'review:branch' }), hasCode('BROWSER_RETRY_LINEAGE_INVALID'));
}));

test('retry claim and launch are blocked until the predecessor terminal outcome is retained', () => withPacket((packet, parent) => {
  claimBrowserToken(packet, 'attempt-one');
  completeToken(packet, 'attempt-one', { state: 'command_failed', exitCode: 7 });
  assert.throws(() => claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' }), hasCode('BROWSER_PREDECESSOR_NOT_RECONCILED'));

  const outcome = retainTerminalBrowserAttemptOutcome({
    operationRoot: packet.root,
    stageId: 'stage-1',
    executionTokenId: 'attempt-one',
    cleanupAssurance: 'no_workspace_created',
  });
  assert.equal(outcome.attempt_status, 'command_failed');
  claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' });
  const workspace = createBrowserEvidenceWorkspace({ parentRoot: parent });
  const launch = createPacketBoundBrowserLaunchContract({
    operationRoot: packet.root,
    stageId: 'stage-1',
    executionTokenId: 'attempt-two',
    browserWorkspace: workspace,
    baseURL: 'http://127.0.0.1:4200',
    runLabel: 'synthetic-form-submit',
  });
  assert.equal(launch.descriptor.execution_token_id, 'attempt-two');
  cleanupBrowserEvidence(workspace.cleanupHandle);
}));

test('attempt outcome retention rejects misleading terminal event semantics', () => withPacket((packet) => {
  claimBrowserToken(packet, 'attempt-one');
  updateExecutionToken(packet.root, 'attempt-one', 'started');
  appendTokenEvent(packet.root, 'stage-1', 'attempt-one', 'started', 'started');
  updateExecutionToken(packet.root, 'attempt-one', 'command_failed', {
    commandResult: { exit_kind: 'normal', exit_code: 7, signal_name: null, signal_number: null },
    harnessResult: { classification: 'command_failed', detail: 'local_fixture', wrapper_signal: null, forwarded_signal: null },
  });
  appendTokenEvent(packet.root, 'stage-1', 'attempt-one', 'completed', 'passed', 0, [`stages/stage-1/artifacts/${attemptOutcomePath('attempt-one')}`]);
  assert.throws(() => retainTerminalBrowserAttemptOutcome({
    operationRoot: packet.root,
    stageId: 'stage-1',
    executionTokenId: 'attempt-one',
    cleanupAssurance: 'no_workspace_created',
  }), hasCode('BROWSER_ATTEMPT_OUTCOME_INVALID'));
}));

test('noncontinuable cleanup assurances are retained but block continuation', () => withPacket((packet) => {
  claimBrowserToken(packet, 'attempt-one');
  completeToken(packet, 'attempt-one', { state: 'command_failed', exitCode: 7 });
  const outcome = retainTerminalBrowserAttemptOutcome({
    operationRoot: packet.root,
    stageId: 'stage-1',
    executionTokenId: 'attempt-one',
    cleanupAssurance: 'cleanup_not_completed',
  });
  assert.equal(outcome.cleanup_assurance, 'cleanup_not_completed');
  assert.throws(() => claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' }), hasCode('BROWSER_PREDECESSOR_NOT_RECONCILED'));
}));

test('browser attempt limit is three terminal attempts per stage', () => withPacket((packet) => {
  claimBrowserToken(packet, 'attempt-one');
  completeToken(packet, 'attempt-one', { state: 'command_failed', exitCode: 7 });
  retainTerminalBrowserAttemptOutcome({ operationRoot: packet.root, stageId: 'stage-1', executionTokenId: 'attempt-one', cleanupAssurance: 'no_workspace_created' });
  claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' });
  completeToken(packet, 'attempt-two', { state: 'command_failed', exitCode: 7 });
  retainTerminalBrowserAttemptOutcome({ operationRoot: packet.root, stageId: 'stage-1', executionTokenId: 'attempt-two', cleanupAssurance: 'no_workspace_created' });
  claimBrowserToken(packet, 'attempt-three', { prior: 'attempt-two', authorization: 'review:retry-two' });
  completeToken(packet, 'attempt-three', { state: 'command_failed', exitCode: 7 });
  retainTerminalBrowserAttemptOutcome({ operationRoot: packet.root, stageId: 'stage-1', executionTokenId: 'attempt-three', cleanupAssurance: 'no_workspace_created' });
  assert.throws(() => claimBrowserToken(packet, 'attempt-four', { prior: 'attempt-three', authorization: 'review:retry-three' }), hasCode('BROWSER_ATTEMPT_LIMIT'));
  assert.equal(BROWSER_ATTEMPT_LIMIT, 3);
}));

test('browser-aware freeze selects the latest successful lineage tail', () => withPacket((packet, parent) => {
  claimBrowserToken(packet, 'attempt-one');
  completeToken(packet, 'attempt-one', { state: 'command_failed', exitCode: 7 });
  retainTerminalBrowserAttemptOutcome({ operationRoot: packet.root, stageId: 'stage-1', executionTokenId: 'attempt-one', cleanupAssurance: 'no_workspace_created' });
  claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' });
  runSuccessfulAttempt(packet, 'attempt-two', parent);
  freezeStage(packet.root, 'stage-1');
  const selection = readCanonicalJsonFile(join(packet.root, 'stages', 'stage-1', 'artifacts', BROWSER_ATTEMPT_SELECTION_ARTIFACT));
  assert.equal(selection.selected_execution_token_id, 'attempt-two');
  assert.equal(selection.selected_attempt_sequence, 2);
  assert.equal(selection.attempt_count, 2);
  assert.equal(selection.selection_rule, 'latest_authorized_terminal_attempt');
}));

test('invalid privacy counters cannot be read, retried, frozen, sealed, or verified', () => withPacket((packet) => {
  claimBrowserToken(packet, 'attempt-one');
  completeToken(packet, 'attempt-one', { state: 'command_failed', exitCode: 7 });
  retainTerminalBrowserAttemptOutcome({ operationRoot: packet.root, stageId: 'stage-1', executionTokenId: 'attempt-one', cleanupAssurance: 'no_workspace_created' });
  mutateOutcome(packet, 'attempt-one', (outcome) => ({
    ...outcome,
    privacy_scan: { ...outcome.privacy_scan, files_scanned: -1 },
  }));
  assert.throws(() => readAttemptOutcome(packet.root, 'stage-1', 'attempt-one'), hasCode('BROWSER_ATTEMPT_OUTCOME_INVALID'));
  assert.throws(() => freezeStage(packet.root, 'stage-1'), hasCode('BROWSER_ATTEMPT_OUTCOME_INVALID'));
  assert.throws(() => createManifest(packet.root), (error) => ['BROWSER_ATTEMPT_OUTCOME_INVALID', 'BROWSER_VERIFICATION_DEFERRED', 'STAGE_NOT_FROZEN'].includes(error?.code));
  assert.throws(() => sealOperation(packet.root), (error) => ['BROWSER_ATTEMPT_OUTCOME_INVALID', 'BROWSER_VERIFICATION_DEFERRED', 'MANIFEST_MISSING', 'STAGE_NOT_FROZEN'].includes(error?.code));
  assert.throws(() => verifyPacket(packet.root), (error) => ['BROWSER_ATTEMPT_OUTCOME_INVALID', 'BROWSER_VERIFICATION_DEFERRED', 'MANIFEST_MISSING'].includes(error?.code));
  assert.throws(() => claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' }), hasCode('BROWSER_ATTEMPT_OUTCOME_INVALID'));
}));

test('outcome privacy file-count equations are outcome-specific', () => withPacket((packet, parent) => {
  claimBrowserToken(packet, 'attempt-one');
  completeToken(packet, 'attempt-one', { state: 'command_failed', exitCode: 7 });
  retainTerminalBrowserAttemptOutcome({ operationRoot: packet.root, stageId: 'stage-1', executionTokenId: 'attempt-one', cleanupAssurance: 'no_workspace_created' });
  for (const badCount of [1, 1.5, BROWSER_ATTEMPT_LIMIT + 300]) {
    const original = readCanonicalJsonFile(join(packet.root, 'stages', 'stage-1', 'artifacts', attemptOutcomePath('attempt-one')));
    writeCanonical(join(packet.root, 'stages', 'stage-1', 'artifacts', attemptOutcomePath('attempt-one')), {
      ...original,
      privacy_scan: { ...original.privacy_scan, files_scanned: badCount },
    });
    assert.throws(() => readAttemptOutcome(packet.root, 'stage-1', 'attempt-one'), hasCode('BROWSER_ATTEMPT_OUTCOME_INVALID'));
    writeCanonical(join(packet.root, 'stages', 'stage-1', 'artifacts', attemptOutcomePath('attempt-one')), original);
  }

  claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' });
  runSuccessfulAttempt(packet, 'attempt-two', parent);
  const original = readCanonicalJsonFile(join(packet.root, 'stages', 'stage-1', 'artifacts', attemptOutcomePath('attempt-two')));
  for (const badCount of [0, 1, 3]) {
    writeCanonical(join(packet.root, 'stages', 'stage-1', 'artifacts', attemptOutcomePath('attempt-two')), {
      ...original,
      privacy_scan: { ...original.privacy_scan, files_scanned: badCount },
    });
    assert.throws(() => freezeStage(packet.root, 'stage-1'), hasCode('BROWSER_ATTEMPT_OUTCOME_INVALID'));
  }
}));

test('successful attempt inventory binds promotion events before digesting', () => withPacket((packet, parent) => {
  claimBrowserToken(packet, 'attempt-one');
  runSuccessfulAttempt(packet, 'attempt-one', parent);
  claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' });
  runSuccessfulAttempt(packet, 'attempt-two', parent);
  const inventory = buildAttemptInventory(packet.root, readCanonicalJsonFile(join(packet.root, 'operation.json')), 'stage-1', readEvents(packet.root));
  assert.equal(inventory.attempts.length, 2);
  for (const attempt of inventory.attempts) {
    assert.equal(attempt.promotion_event_id, `${attempt.execution_token_id}-browser-evidence`);
    assert.match(attempt.promotion_event_hash, /^[a-f0-9]{64}$/);
  }
  const canonical = inventory.attempts.map(({ token, outcome, ...entry }) => entry);
  assert.equal(inventory.digest, sha256(canonicalStringify(canonical)));
  const tamperedEvents = readEvents(packet.root).filter((event) => event.event_id !== 'attempt-one-browser-evidence');
  assert.throws(() => buildAttemptInventory(packet.root, readCanonicalJsonFile(join(packet.root, 'operation.json')), 'stage-1', tamperedEvents), hasCode('BROWSER_ATTEMPT_INVENTORY_INVALID'));
}));

test('browser v2 verification remains valid after later nonbrowser events', () => withPacket((packet, parent) => {
  claimBrowserToken(packet, 'attempt-one');
  runSuccessfulAttempt(packet, 'attempt-one', parent);
  appendEvent(packet.root, verifyEventChain(packet.root).head, {
    stage_id: 'stage-1',
    event_id: 'ordinary-after-browser',
    event_type: 'note',
    action_timestamp: new Date().toISOString(),
    archive_timestamp: null,
    command_category: null,
    expected_result: 'completed',
    observed_result: 'completed',
    result_classification: 'passed',
    exit_code: null,
    sanitized_artifact_paths: [],
  });
  freezeStage(packet.root, 'stage-1');
  createManifest(packet.root);
  const sealed = sealOperation(packet.root);
  assert.equal(verifyPacket(packet.root, sealed.seal_sha256).status, 'verified');
}));

test('browser-aware freeze rejects cherry-picked earlier success when lineage tail failed', () => withPacket((packet, parent) => {
  claimBrowserToken(packet, 'attempt-one');
  runSuccessfulAttempt(packet, 'attempt-one', parent);
  claimBrowserToken(packet, 'attempt-two', { prior: 'attempt-one', authorization: 'review:retry-one' });
  completeToken(packet, 'attempt-two', { state: 'command_failed', exitCode: 7 });
  retainTerminalBrowserAttemptOutcome({ operationRoot: packet.root, stageId: 'stage-1', executionTokenId: 'attempt-two', cleanupAssurance: 'no_workspace_created' });
  assert.throws(() => freezeStage(packet.root, 'stage-1'), hasCode('BROWSER_FINAL_ATTEMPT_NOT_SUCCESSFUL'));
  const retained = readFileSync(join(packet.root, 'stages', 'stage-1', 'artifacts', attemptSummaryPath('attempt-one')), 'utf8');
  assert.equal(retained.includes('browser-journal'), false);
  assert.equal(retained.includes('journal_auth'), false);
}));
