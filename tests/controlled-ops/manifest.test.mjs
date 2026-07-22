import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  appendEvent,
  createManifest,
  createStage,
  freezeStage,
  registerArtifact,
  sealOperation,
  verifyPacket,
  verifyStageFreeze,
} from '../../scripts/controlled-ops/evidence.mjs';
import { GENESIS_HASH, canonicalStringify, compareStrings } from '../../scripts/controlled-ops/internal.mjs';
import { evidenceCli, makePacket, repoRoot, runWrapper, writeSafeArtifact } from './helpers.mjs';

function prepareStage(packet, content = 'status=ok\n') {
  const { output, summary, summaryName } = writeSafeArtifact(packet.root, 'evidence.txt', content);
  registerArtifact(packet.root, 'stage-1', 'evidence.txt', 'test_evidence', summary);
  registerArtifact(packet.root, 'stage-1', summaryName, 'sanitization_summary');
  appendEvent(packet.root, GENESIS_HASH, {
    stage_id: 'stage-1', event_id: 'stage-complete', event_type: 'stage_completed', action_timestamp: new Date().toISOString(),
    archive_timestamp: null, command_category: null, expected_result: 'completed', observed_result: 'completed',
    result_classification: 'passed', exit_code: null, sanitized_artifact_paths: ['stages/stage-1/artifacts/evidence.txt'],
  });
  return output;
}

test('valid stage freezes with deterministic manifest and separated timestamps', () => {
  const packet = makePacket();
  try {
    const output = prepareStage(packet);
    const freeze = freezeStage(packet.root, 'stage-1');
    assert.equal(freeze.security_scan.secret_findings, 0);
    assert.equal((statSync(output).mode & 0o777), 0o400);
    const firstManifest = readFileSync(join(packet.root, 'stages', 'stage-1', 'stage-manifest.json'), 'utf8');
    verifyStageFreeze(packet.root, 'stage-1');
    assert.equal(firstManifest, readFileSync(join(packet.root, 'stages', 'stage-1', 'stage-manifest.json'), 'utf8'));
    assert.throws(() => registerArtifact(packet.root, 'stage-1', 'other.txt', 'test_evidence'), /frozen/i);
    assert.throws(() => appendEvent(packet.root, freeze.event_chain_head, {
      stage_id: 'stage-1', event_id: 'late-event', event_type: 'late_event', action_timestamp: new Date().toISOString(),
      archive_timestamp: null, command_category: null, expected_result: 'completed', observed_result: 'completed',
      result_classification: 'passed', exit_code: null, sanitized_artifact_paths: [],
    }), /unfrozen/i);
  } finally { packet.cleanup(); }
});

test('freeze fails for missing, unsafe, or quarantined evidence', () => {
  const packet = makePacket();
  try {
    assert.throws(() => freezeStage(packet.root, 'stage-1'), /without evidence/i);
    writeFileSync(join(packet.root, 'quarantine', 'unresolved.raw'), 'status=ok\n', { mode: 0o600 });
    prepareStage(packet);
    assert.throws(() => freezeStage(packet.root, 'stage-1'), /quarantine/i);
  } finally { packet.cleanup(); }
});

test('stage freeze independently blocks a registered artifact that fails security scanning', () => {
  const packet = makePacket();
  try {
    const { output, summary, summaryName } = writeSafeArtifact(packet.root, 'unsafe.txt');
    registerArtifact(packet.root, 'stage-1', 'unsafe.txt', 'test_evidence', summary);
    registerArtifact(packet.root, 'stage-1', summaryName, 'sanitization_summary');
    writeFileSync(output, `authorization: Bearer ${['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJmaXh0dXJlIn0', 'signature-value'].join('.')}\n`);
    assert.throws(() => freezeStage(packet.root, 'stage-1'), /summary|secret/i);
  } finally { packet.cleanup(); }
});

test('post-freeze artifact modification is detected and later stage remains separate', () => {
  const packet = makePacket();
  try {
    const output = prepareStage(packet);
    freezeStage(packet.root, 'stage-1');
    createStage(packet.root, 'stage-2');
    chmodSync(output, 0o600);
    writeFileSync(output, 'status=failed\n');
    assert.throws(() => verifyStageFreeze(packet.root, 'stage-1'), /changed|mismatch|unsafe/i);
  } finally { packet.cleanup(); }
});

test('nested stage artifacts freeze recursively and reject unregistered additions', () => {
  const packet = makePacket();
  try {
    const nestedDirectory = join(packet.root, 'stages', 'stage-1', 'artifacts', 'nested');
    const input = join(packet.root, 'quarantine', 'nested.input');
    const summary = join(nestedDirectory, 'evidence.sanitization.json');
    const output = join(nestedDirectory, 'evidence.txt');
    mkdirSync(nestedDirectory, { mode: 0o700 });
    writeFileSync(input, 'status=ok\n', { mode: 0o600 });
    const sanitized = spawnSync(process.execPath, [
      join(repoRoot, 'scripts/controlled-ops/sanitize.mjs'), '--input', input, '--output', output, '--summary', summary, '--artifact-path', 'nested/evidence.txt', '--mode', 'lines',
    ], { encoding: 'utf8' });
    assert.equal(sanitized.status, 0, sanitized.stderr);
    rmSync(input);
    registerArtifact(packet.root, 'stage-1', 'nested/evidence.txt', 'test_evidence', summary);
    registerArtifact(packet.root, 'stage-1', 'nested/evidence.sanitization.json', 'sanitization_summary');
    appendEvent(packet.root, GENESIS_HASH, {
      stage_id: 'stage-1', event_id: 'nested-complete', event_type: 'stage_completed', action_timestamp: new Date().toISOString(),
      archive_timestamp: null, command_category: null, expected_result: 'completed', observed_result: 'completed',
      result_classification: 'passed', exit_code: null, sanitized_artifact_paths: ['stages/stage-1/artifacts/nested/evidence.txt'],
    });
    freezeStage(packet.root, 'stage-1');
    assert.equal(statSync(nestedDirectory).mode & 0o777, 0o500);
    chmodSync(nestedDirectory, 0o700);
    writeFileSync(join(nestedDirectory, 'unregistered.txt'), 'status=ok\n', { mode: 0o600 });
    assert.throws(() => verifyStageFreeze(packet.root, 'stage-1'), /inventory|unclassified/i);
  } finally { packet.cleanup(); }
});

test('manifest is sorted, rejects unclassified files and symlink escapes', () => {
  const packet = makePacket();
  try {
    prepareStage(packet);
    freezeStage(packet.root, 'stage-1');
    const manifest = createManifest(packet.root);
    const paths = manifest.files.map(({ path }) => path);
    assert.deepEqual(paths, [...paths].sort(compareStrings));
    rmSync(join(packet.root, 'manifest.json'));
    writeFileSync(join(packet.root, 'unexpected.txt'), 'status=ok\n', { mode: 0o600 });
    assert.throws(() => createManifest(packet.root), /unclassified/i);
    rmSync(join(packet.root, 'unexpected.txt'));
    symlinkSync('/tmp', join(packet.root, 'stages', 'escape'));
    assert.throws(() => createManifest(packet.root), /symlink/i);
  } finally { packet.cleanup(); }
});

test('final sealing and verification detect post-seal tampering', () => {
  const packet = makePacket();
  try {
    prepareStage(packet);
    freezeStage(packet.root, 'stage-1');
    const first = createManifest(packet.root);
    rmSync(join(packet.root, 'manifest.json'));
    const second = createManifest(packet.root);
    assert.equal(canonicalStringify(first), canonicalStringify(second));
    const seal = sealOperation(packet.root);
    assert.equal(verifyPacket(packet.root, seal.seal_sha256).status, 'verified');
    assert.throws(() => verifyPacket(packet.root, 'f'.repeat(64)), /externally retained digest/i);
    assert.throws(() => createStage(packet.root, 'stage-2'), /sealed/i);
    chmodSync(join(packet.root, 'events.ndjson'), 0o600);
    writeFileSync(join(packet.root, 'events.ndjson'), `${readFileSync(join(packet.root, 'events.ndjson'), 'utf8')}{}\n`);
    assert.throws(() => verifyPacket(packet.root), /event|sequence|hash/i);
    assert.ok(seal.seal.manifest_digest);
    assert.match(seal.seal_sha256, /^[a-f0-9]{64}$/);
  } finally { packet.cleanup(); }
});

test('permission failure and malformed exit evidence fail closed', () => {
  const packet = makePacket();
  try {
    prepareStage(packet);
    freezeStage(packet.root, 'stage-1');
    createManifest(packet.root);
    sealOperation(packet.root);
    chmodSync(join(packet.root, 'operation.json'), 0o644);
    assert.throws(() => verifyPacket(packet.root), /permissions|mode is unsafe/i);
  } finally { packet.cleanup(); }
});

test('completed tokens without exit-code evidence block manifest creation', () => {
  const packet = makePacket();
  try {
    prepareStage(packet);
    freezeStage(packet.root, 'stage-1');
    const tokenPath = join(packet.root, 'tokens', 'broken.json');
    writeFileSync(tokenPath, `${canonicalStringify({
      schema_version: 'servsync-controlled-ops/execution-token-v2', operation_id: 'operation-test-1', stage_id: 'stage-1',
      token: 'broken', command_category: 'fake', expected_result: 'completed', state: 'completed',
      claimed_at: new Date().toISOString(), started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      command_result: null, harness_result: { classification: 'completed', detail: 'evidence_retained' }, retry: null,
    })}\n`, { mode: 0o600 });
    assert.throws(() => createManifest(packet.root), /command evidence/i);
  } finally { packet.cleanup(); }
});

test('CLI completes and verifies an end-to-end local packet', () => {
  const packet = makePacket();
  const run = (...arguments_) => spawnSync(process.execPath, [evidenceCli, ...arguments_], { encoding: 'utf8' });
  try {
    assert.equal((statSync(packet.root).mode & 0o777), 0o700);
    assert.equal(runWrapper(packet.root, 'cli-run', ['clean']).status, 0);
    assert.equal(run('freeze-stage', '--root', packet.root, '--stage', 'stage-1').status, 0);
    assert.equal(run('create-manifest', '--root', packet.root).status, 0);
    assert.equal(run('seal', '--root', packet.root).status, 0);
    for (const command of ['verify-metadata', 'verify-events', 'verify-tokens', 'verify-permissions', 'verify-paths', 'verify-manifest', 'verify-seal']) {
      assert.equal(run(command, '--root', packet.root).status, 0, command);
    }
    assert.equal(run('verify-stage', '--root', packet.root, '--stage', 'stage-1').status, 0);
    assert.equal(run('verify-secret-scan', '--root', packet.root).status, 0);
    assert.equal(run('verify-customer-scan', '--root', packet.root).status, 0);
    const verified = run('verify', '--root', packet.root);
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).status, 'verified');
  } finally { packet.cleanup(); }
});
