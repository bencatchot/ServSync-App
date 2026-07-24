#!/usr/bin/env node

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  appendEvent,
  claimExecutionToken,
  createManifest,
  createStage,
  freezeStage,
  initializeOperation,
  registerArtifact,
  sealOperation,
  updateExecutionToken,
  verifyEventChain,
  verifyPacket,
} from '../../../scripts/controlled-ops/evidence.mjs';
import {
  submitSealDigestToLocalCustody,
  verifyPacketWithLocalCustody,
} from '../../../scripts/controlled-ops/external-anchor-custody.mjs';
import {
  executeFakeProviderPlan,
  prepareFakeProviderPlan,
} from '../../../scripts/controlled-ops/fake-provider-adapter.mjs';
import {
  PROVIDER_COMMAND_CATEGORY,
  providerResultEvidenceLines,
} from '../../../scripts/controlled-ops/provider-adapter.mjs';
import { GENESIS_HASH, canonicalStringify } from '../../../scripts/controlled-ops/internal.mjs';
import { createSanitizationSummary, sanitizeContent } from '../../../scripts/controlled-ops/sanitize.mjs';

function retainProviderResult(root, result, token) {
  const artifactName = `${token}.provider-result.txt`;
  const summaryName = `${token}.provider-result.sanitization.json`;
  const output = sanitizeContent(providerResultEvidenceLines(result), { mode: 'lines' }).output;
  const summary = createSanitizationSummary({ mode: 'lines', artifactPath: artifactName, output });
  writeFileSync(join(root, 'stages', 'stage-1', 'artifacts', artifactName), output, { mode: 0o600 });
  writeFileSync(join(root, 'stages', 'stage-1', 'artifacts', summaryName), `${canonicalStringify(summary)}\n`, { mode: 0o600 });
  registerArtifact(root, 'stage-1', artifactName, 'provider_result', join(root, 'stages', 'stage-1', 'artifacts', summaryName));
  registerArtifact(root, 'stage-1', summaryName, 'sanitization_summary');
  return { artifactName, summaryName };
}

function makeWritable(path) {
  if (!existsSync(path)) return;
  const info = lstatSync(path);
  if (info.isDirectory() && !info.isSymbolicLink()) {
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) makeWritable(join(path, name));
  } else if (!info.isSymbolicLink()) {
    chmodSync(path, 0o600);
  }
}

function main() {
  const parent = mkdtempSync('/private/tmp/servsync-provider-anchor-pilot-');
  chmodSync(parent, 0o700);
  const packetRoot = join(parent, 'packet');
  const custodyRoot = join(parent, 'custody');
  const operationId = 'op-provider-pilot';
  const token = 'provider-token';
  try {
    initializeOperation(packetRoot, {
      operationId,
      operationClassification: 'local-test',
      targetClassification: 'local-fixture',
      authorizationReference: 'task:local',
      createdAt: new Date(Date.now() - 5_000).toISOString(),
    });
    createStage(packetRoot, 'stage-1');
    const plan = prepareFakeProviderPlan({
      operationId,
      stageId: 'stage-1',
      executionTokenId: token,
      approvalReference: 'task:local',
      credentialReference: 'fake:local-ref',
      requestedAction: 'simulate_success',
      executionMode: 'simulated_mutation',
    });
    claimExecutionToken(packetRoot, { stageId: 'stage-1', token, commandCategory: PROVIDER_COMMAND_CATEGORY, expectedResult: 'completed' });
    appendEvent(packetRoot, GENESIS_HASH, {
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
    updateExecutionToken(packetRoot, token, 'started');
    const result = executeFakeProviderPlan(plan);
    const { artifactName, summaryName } = retainProviderResult(packetRoot, result, token);
    updateExecutionToken(packetRoot, token, 'completed', {
      commandResult: { exit_kind: 'normal', exit_code: 0, signal_name: null, signal_number: null },
      harnessResult: { classification: 'evidence_complete', detail: 'evidence_complete', wrapper_signal: null, forwarded_signal: null },
    });
    appendEvent(packetRoot, verifyEventChain(packetRoot).head, {
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
    freezeStage(packetRoot, 'stage-1');
    createManifest(packetRoot);
    const sealed = sealOperation(packetRoot);
    submitSealDigestToLocalCustody({ custodyRoot, operationRoot: packetRoot, sealDigest: sealed.seal_sha256 });
    if (verifyPacketWithLocalCustody({ operationRoot: packetRoot, custodyRoot }).status !== 'verified') {
      throw new Error('Provider anchor pilot custody verification failed.');
    }
    const sealPath = join(packetRoot, 'seal.json');
    writeFileSync(sealPath, readFileSync(sealPath, 'utf8').replace('retain-seal-sha256-outside-packet', 'retain-seal-sha256-outside-packet-tampered'), { mode: 0o600 });
    try {
      verifyPacket(packetRoot, sealed.seal_sha256);
      throw new Error('Provider anchor pilot failed to detect tampering.');
    } catch (error) {
      if (!['INVALID_SEAL', 'EXTERNAL_ANCHOR_MISMATCH', 'SEAL_MISMATCH'].includes(error?.code)) throw error;
    }
    process.stdout.write('controlled-ops provider-anchor pilot passed\n');
  } finally {
    makeWritable(parent);
    rmSync(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
  }
}

main();
