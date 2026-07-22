import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { appendEvent, freezeStage, registerArtifact, verifyEventChain } from '../../scripts/controlled-ops/evidence.mjs';
import { GENESIS_HASH, LIMITS, canonicalStringify } from '../../scripts/controlled-ops/internal.mjs';
import { sanitizeContent } from '../../scripts/controlled-ops/sanitize.mjs';
import { makePacket, writeSafeArtifact } from './helpers.mjs';

function completeEvent(packet) {
  appendEvent(packet.root, GENESIS_HASH, {
    stage_id: 'stage-1', event_id: 'complete', event_type: 'stage_completed', action_timestamp: new Date().toISOString(),
    archive_timestamp: null, command_category: null, expected_result: 'completed', observed_result: 'completed',
    result_classification: 'passed', exit_code: null, sanitized_artifact_paths: [],
  });
}

test('event count limit fails before parsing excess records', () => {
  const packet = makePacket();
  try {
    writeFileSync(join(packet.root, 'events.ndjson'), '{}\n'.repeat(LIMITS.event_count + 1), { mode: 0o600 });
    assert.throws(() => verifyEventChain(packet.root), /event count/i);
  } finally { packet.cleanup(); }
});

test('artifact count limit blocks additional registration', () => {
  const packet = makePacket();
  try {
    const first = writeSafeArtifact(packet.root, 'first.txt');
    registerArtifact(packet.root, 'stage-1', 'first.txt', 'test_evidence', first.summary);
    registerArtifact(packet.root, 'stage-1', first.summaryName, 'sanitization_summary');
    const entries = Array.from({ length: LIMITS.artifact_count_per_stage }, (_, index) => ({ path: `registered-${index}.txt`, artifact_class: 'test_evidence', sanitization_status: 'internal', summary_path: `registered-${index}.txt` }));
    writeFileSync(join(packet.root, 'stages', 'stage-1', 'artifact-index.json'), `${canonicalStringify({ schema_version: 'servsync-controlled-ops/artifact-index-v2', operation_id: 'operation-test-1', stage_id: 'stage-1', artifacts: entries })}\n`, { mode: 0o600 });
    const next = writeSafeArtifact(packet.root, 'next.txt');
    assert.throws(() => registerArtifact(packet.root, 'stage-1', 'next.txt', 'test_evidence', next.summary), /artifact count/i);
  } finally { packet.cleanup(); }
});

test('stage traversal and artifact-size limits fail closed', () => {
  const packet = makePacket();
  try {
    const safe = writeSafeArtifact(packet.root); registerArtifact(packet.root, 'stage-1', 'evidence.txt', 'test_evidence', safe.summary); registerArtifact(packet.root, 'stage-1', safe.summaryName, 'sanitization_summary'); completeEvent(packet);
    let nested = join(packet.root, 'stages', 'stage-1', 'artifacts');
    for (let index = 0; index < LIMITS.traversal_depth + 2; index += 1) { nested = join(nested, `d${index}`); mkdirSync(nested, { mode: 0o700 }); }
    writeFileSync(join(nested, 'deep.txt'), 'status=ok\n', { mode: 0o600 });
    assert.throws(() => freezeStage(packet.root, 'stage-1'), /traversal/i);
  } finally { packet.cleanup(); }

  const second = makePacket();
  try {
    const safe = writeSafeArtifact(second.root); registerArtifact(second.root, 'stage-1', 'evidence.txt', 'test_evidence', safe.summary); registerArtifact(second.root, 'stage-1', safe.summaryName, 'sanitization_summary'); completeEvent(second);
    writeFileSync(join(second.root, 'stages', 'stage-1', 'artifacts', 'oversized.txt'), Buffer.alloc(LIMITS.artifact_bytes + 1, 0x61), { mode: 0o600 });
    assert.throws(() => freezeStage(second.root, 'stage-1'), /size limit/i);
  } finally { second.cleanup(); }
});

test('sanitizer total-input and line limits reject over-boundary input', () => {
  const safeLine = 'status=ok\n';
  assert.throws(() => sanitizeContent(safeLine.repeat(Math.ceil((LIMITS.artifact_bytes + 1) / Buffer.byteLength(safeLine)))), /input exceeds/i);
  assert.throws(() => sanitizeContent(`status=${'x'.repeat(LIMITS.line_bytes)}\n`), /oversized line/i);
});
