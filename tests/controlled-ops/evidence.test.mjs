import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  appendEvent,
  claimExecutionToken,
  createStage,
  readEvents,
  updateExecutionToken,
  verifyEventChain,
  initializeOperation,
} from '../../scripts/controlled-ops/evidence.mjs';
import { GENESIS_HASH, canonicalStringify } from '../../scripts/controlled-ops/internal.mjs';
import { makePacket, repoRoot } from './helpers.mjs';

function event(timestamp, id, observed = 'completed') {
  return {
    stage_id: 'stage-1', event_id: id, event_type: 'test-event', action_timestamp: timestamp,
    archive_timestamp: null, command_category: null, expected_result: 'completed', observed_result: observed,
    result_classification: 'passed', exit_code: null, sanitized_artifact_paths: [],
  };
}

test('canonical serialization and event hash chaining are deterministic', () => {
  assert.equal(canonicalStringify({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  const packet = makePacket();
  try {
    const timestamp = new Date().toISOString();
    const first = appendEvent(packet.root, GENESIS_HASH, event(timestamp, 'event-1'));
    const second = appendEvent(packet.root, first.current_event_hash, event(timestamp, 'event-2'));
    assert.equal(second.sequence, 2);
    assert.equal(second.previous_event_hash, first.current_event_hash);
    assert.equal(verifyEventChain(packet.root).head, second.current_event_hash);
  } finally { packet.cleanup(); }
});

test('event verification rejects tampering, duplicate IDs, stale heads, and timestamp regression', () => {
  const packet = makePacket();
  try {
    const timestamp = new Date().toISOString();
    const first = appendEvent(packet.root, GENESIS_HASH, event(timestamp, 'event-1'));
    assert.throws(() => appendEvent(packet.root, first.current_event_hash, event(timestamp, 'event-1')), /duplicated/i);
    assert.throws(() => appendEvent(packet.root, GENESIS_HASH, event(timestamp, 'event-2')), /stale/i);
    const earlier = new Date(Date.parse(timestamp) - 1_000).toISOString();
    assert.throws(() => appendEvent(packet.root, first.current_event_hash, event(earlier, 'event-3')), /regress/i);
    const eventsPath = join(packet.root, 'events.ndjson');
    const records = readEvents(packet.root);
    records[0].observed_result = 'failed';
    writeFileSync(eventsPath, `${canonicalStringify(records[0])}\n`, { mode: 0o600 });
    assert.throws(() => verifyEventChain(packet.root), /hash/i);
  } finally { packet.cleanup(); }
});

test('concurrent event append lock fails safely', () => {
  const packet = makePacket();
  try {
    mkdirSync(join(packet.root, '.controlled-ops-events.lock'), { mode: 0o700 });
    assert.throws(() => appendEvent(packet.root, GENESIS_HASH, event(new Date().toISOString(), 'event-1')), /concurrent/i);
    assert.equal(readFileSync(join(packet.root, 'events.ndjson'), 'utf8'), '');
  } finally { packet.cleanup(); }
});

test('execution tokens are atomic and retries require a new explicitly authorized token', () => {
  const packet = makePacket();
  try {
    claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'token-1', commandCategory: 'fake', expectedResult: 'completed' });
    assert.throws(() => claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'token-1', commandCategory: 'fake', expectedResult: 'completed' }), /already/i);
    assert.throws(() => claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'token-2', commandCategory: 'fake', expectedResult: 'completed', retryOf: 'token-1' }), /retries require/i);
    updateExecutionToken(packet.root, 'token-1', 'started');
    updateExecutionToken(packet.root, 'token-1', 'completed', { commandExitCode: 0 });
    const retry = claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'token-2', commandCategory: 'fake', expectedResult: 'completed', retryOf: 'token-1', retryAuthorization: 'approved-retry' });
    assert.equal(retry.retry.retry_count, 1);
    assert.throws(() => updateExecutionToken(packet.root, 'token-1', 'started'), /transition/i);
  } finally { packet.cleanup(); }
});

test('later stages are separate and cannot replace an existing stage', () => {
  const packet = makePacket();
  try {
    createStage(packet.root, 'stage-2');
    assert.throws(() => createStage(packet.root, 'stage-2'), /exists/i);
  } finally { packet.cleanup(); }
});

test('operation initialization refuses a packet inside a Git worktree', () => {
  assert.throws(() => initializeOperation(join(repoRoot, 'controlled-ops-packet-should-not-exist'), {
    operationId: 'operation-test-git', operationClassification: 'local-test', targetClassification: 'local-fixture',
    authorizationReference: 'test-authorization',
  }), /outside Git/i);
});
