import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
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
import {
  EXTERNAL_ANCHOR_CUSTODY_SCHEMA,
  custodyRelativeRecordPath,
  initializeLocalAnchorCustodyStore,
  readLocalAnchorCustodyRecord,
  retrieveSealDigestFromLocalCustody,
  submitSealDigestToLocalCustody,
  validateCustodyRecord,
  verifyPacketWithLocalCustody,
} from '../../scripts/controlled-ops/external-anchor-custody.mjs';
import { executeFakeProviderPlan, prepareFakeProviderPlan } from '../../scripts/controlled-ops/fake-provider-adapter.mjs';
import { PROVIDER_COMMAND_CATEGORY, providerResultEvidenceLines } from '../../scripts/controlled-ops/provider-adapter.mjs';
import { GENESIS_HASH, canonicalStringify } from '../../scripts/controlled-ops/internal.mjs';
import { createSanitizationSummary, sanitizeContent, scanCustomerContent, scanSensitiveContent } from '../../scripts/controlled-ops/sanitize.mjs';
import { makePacket } from './helpers.mjs';

function hasCode(code) {
  return (error) => error?.code === code;
}

function tempRoot(prefix = 'servsync-anchor-custody-') {
  const root = mkdtempSync(join('/private/tmp', prefix));
  chmodSync(root, 0o700);
  return root;
}

function writeProviderArtifact(packet, result, token = 'provider-token') {
  const artifactName = `${token}.provider-result.txt`;
  const summaryName = `${token}.provider-result.sanitization.json`;
  const artifactPath = join(packet.root, 'stages', 'stage-1', 'artifacts', artifactName);
  const summaryPath = join(packet.root, 'stages', 'stage-1', 'artifacts', summaryName);
  const output = sanitizeContent(providerResultEvidenceLines(result), { mode: 'lines' }).output;
  const summary = createSanitizationSummary({ mode: 'lines', artifactPath: artifactName, output });
  writeFileSync(artifactPath, output, { mode: 0o600 });
  writeFileSync(summaryPath, `${canonicalStringify(summary)}\n`, { mode: 0o600 });
  registerArtifact(packet.root, 'stage-1', artifactName, 'provider_result', summaryPath);
  registerArtifact(packet.root, 'stage-1', summaryName, 'sanitization_summary');
  return { artifactName, summaryName };
}

function completeProviderPacket(operationId = 'operation-provider-1') {
  const packet = makePacket('stage-1', operationId);
  const token = 'provider-token';
  const plan = prepareFakeProviderPlan({
    operationId,
    stageId: 'stage-1',
    executionTokenId: token,
    approvalReference: 'task:local',
    credentialReference: 'fake:local-ref',
    requestedAction: 'simulate_success',
    executionMode: 'simulated_mutation',
  });
  claimExecutionToken(packet.root, { stageId: 'stage-1', token, commandCategory: PROVIDER_COMMAND_CATEGORY, expectedResult: 'completed' });
  appendEvent(packet.root, GENESIS_HASH, {
    stage_id: 'stage-1',
    event_id: `${token}-started`,
    event_type: 'command_started',
    action_timestamp: new Date().toISOString(),
    archive_timestamp: null,
    command_category: PROVIDER_COMMAND_CATEGORY,
    expected_result: 'completed',
    observed_result: 'started',
    result_classification: 'started',
    exit_code: null,
    sanitized_artifact_paths: [],
  });
  updateExecutionToken(packet.root, token, 'started');
  const result = executeFakeProviderPlan(plan);
  const { artifactName, summaryName } = writeProviderArtifact(packet, result, token);
  updateExecutionToken(packet.root, token, 'completed', {
    commandResult: { exit_kind: 'normal', exit_code: 0, signal_name: null, signal_number: null },
    harnessResult: { classification: 'evidence_complete', detail: 'evidence_complete', wrapper_signal: null, forwarded_signal: null },
  });
  appendEvent(packet.root, verifyEventChain(packet.root).head, {
    stage_id: 'stage-1',
    event_id: `${token}-completed`,
    event_type: 'command_completed',
    action_timestamp: new Date().toISOString(),
    archive_timestamp: null,
    command_category: PROVIDER_COMMAND_CATEGORY,
    expected_result: 'completed',
    observed_result: 'passed',
    result_classification: 'passed',
    exit_code: 0,
    sanitized_artifact_paths: [`stages/stage-1/artifacts/${artifactName}`, `stages/stage-1/artifacts/${summaryName}`],
  });
  freezeStage(packet.root, 'stage-1');
  createManifest(packet.root);
  const sealed = sealOperation(packet.root);
  return { packet, sealed, result };
}

test('local custody retains a seal digest outside the packet and verifies through retrieval', () => {
  const { packet, sealed } = completeProviderPacket();
  const custodyRoot = join(packet.parent, 'custody');
  try {
    const first = submitSealDigestToLocalCustody({
      custodyRoot,
      operationRoot: packet.root,
      sealDigest: sealed.seal_sha256,
      sourceClassification: 'local_fake_provider',
      retainedUtc: '2026-07-24T00:00:00.000Z',
    });
    assert.equal(first.status, 'retained');
    assert.equal(first.record.schema_version, EXTERNAL_ANCHOR_CUSTODY_SCHEMA);
    assert.equal(lstatSync(custodyRoot).mode & 0o777, 0o700);
    assert.equal(retrieveSealDigestFromLocalCustody({ custodyRoot, operationId: 'operation-provider-1', sourceClassification: 'local_fake_provider' }), sealed.seal_sha256);
    assert.equal(verifyPacketWithLocalCustody({ operationRoot: packet.root, custodyRoot, sourceClassification: 'local_fake_provider' }).status, 'verified');
    const duplicate = submitSealDigestToLocalCustody({
      custodyRoot,
      operationRoot: packet.root,
      sealDigest: sealed.seal_sha256,
      sourceClassification: 'local_fake_provider',
    });
    assert.equal(duplicate.status, 'duplicate');
    assert.equal(canonicalStringify(duplicate.record), canonicalStringify(first.record));
    assert.equal(custodyRelativeRecordPath({ custodyRoot, operationId: 'operation-provider-1' }), 'records/operation-provider-1.json');
  } finally { packet.cleanup(); }
});

test('custody rejects conflicting digests missing anchors and packet overlap before mutation', () => {
  const { packet, sealed } = completeProviderPacket('operation-provider-2');
  const custodyRoot = join(packet.parent, 'custody');
  try {
    assert.throws(() => verifyPacketWithLocalCustody({ operationRoot: packet.root, custodyRoot }), hasCode('INVALID_CUSTODY_STORE'));
    assert.throws(() => submitSealDigestToLocalCustody({
      custodyRoot: join(packet.root, 'custody'),
      operationRoot: packet.root,
      sealDigest: sealed.seal_sha256,
    }), hasCode('CUSTODY_PACKET_OVERLAP'));
    assert.equal(existsSync(join(packet.root, 'custody')), false);
    submitSealDigestToLocalCustody({ custodyRoot, operationRoot: packet.root, sealDigest: sealed.seal_sha256 });
    assert.throws(() => submitSealDigestToLocalCustody({
      custodyRoot,
      operationRoot: packet.root,
      sealDigest: 'f'.repeat(64),
    }), hasCode('EXTERNAL_ANCHOR_MISMATCH'));
    assert.throws(() => verifyPacket(packet.root, 'f'.repeat(64)), hasCode('EXTERNAL_ANCHOR_MISMATCH'));
  } finally { packet.cleanup(); }
});

test('custody records fail closed for malformed hard-linked symlinked or conflicting records', () => {
  const { packet, sealed } = completeProviderPacket('operation-provider-3');
  const custodyRoot = join(packet.parent, 'custody');
  try {
    submitSealDigestToLocalCustody({ custodyRoot, operationRoot: packet.root, sealDigest: sealed.seal_sha256 });
    const recordPath = join(custodyRoot, 'records', 'operation-provider-3.json');
    const original = readFileSync(recordPath, 'utf8');
    const parsed = JSON.parse(original);
    assert.equal(scanSensitiveContent(original).length, 0);
    assert.equal(scanCustomerContent(original).length, 0);
    writeFileSync(recordPath, `${canonicalStringify({ ...parsed, unknown: true })}\n`, { mode: 0o600 });
    assert.throws(() => readLocalAnchorCustodyRecord({ custodyRoot, operationId: 'operation-provider-3' }), hasCode('INVALID_SCHEMA'));
    writeFileSync(recordPath, original, { mode: 0o600 });
    chmodSync(recordPath, 0o644);
    assert.throws(() => readLocalAnchorCustodyRecord({ custodyRoot, operationId: 'operation-provider-3' }), hasCode('UNSAFE_FILE'));
    chmodSync(recordPath, 0o600);
    const hardLink = join(custodyRoot, 'records', 'operation-provider-hardlink.json');
    linkSync(recordPath, hardLink);
    assert.throws(() => readLocalAnchorCustodyRecord({ custodyRoot, operationId: 'operation-provider-3' }), hasCode('UNSAFE_FILE'));
    rmSync(hardLink);
    rmSync(recordPath);
    symlinkSync('/private/tmp/not-a-custody-record', recordPath);
    assert.throws(() => readLocalAnchorCustodyRecord({ custodyRoot, operationId: 'operation-provider-3' }), hasCode('SYMLINK_REJECTED'));
    rmSync(recordPath);
    writeFileSync(join(custodyRoot, 'unexpected.txt'), 'status=ok\n', { mode: 0o600 });
    assert.throws(() => readLocalAnchorCustodyRecord({ custodyRoot, operationId: 'operation-provider-3' }), hasCode('UNKNOWN_CUSTODY_FILE'));
    assert.throws(() => validateCustodyRecord({ ...parsed, packet_schema_version: 'other-schema' }), hasCode('INVALID_CUSTODY_RECORD'));
  } finally { packet.cleanup(); }
});

test('custody-only retry does not rerun fake provider execution', () => {
  const { packet, sealed } = completeProviderPacket('operation-provider-4');
  const custodyRoot = join(packet.parent, 'custody');
  try {
    let executions = 1;
    assert.throws(() => verifyPacketWithLocalCustody({ operationRoot: packet.root, custodyRoot }), hasCode('INVALID_CUSTODY_STORE'));
    submitSealDigestToLocalCustody({ custodyRoot, operationRoot: packet.root, sealDigest: sealed.seal_sha256 });
    assert.equal(verifyPacketWithLocalCustody({ operationRoot: packet.root, custodyRoot }).status, 'verified');
    assert.equal(executions, 1);
    submitSealDigestToLocalCustody({ custodyRoot, operationRoot: packet.root, sealDigest: sealed.seal_sha256 });
    assert.equal(executions, 1);
  } finally { packet.cleanup(); }
});
