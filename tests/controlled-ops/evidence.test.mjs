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
    mkdirSync(join(packet.root, '.controlled-ops-mutation.lock'), { mode: 0o700 });
    assert.throws(() => appendEvent(packet.root, GENESIS_HASH, event(new Date().toISOString(), 'event-1')), /mutation lock/i);
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
    updateExecutionToken(packet.root, 'token-1', 'completed', {
      commandResult: { exit_kind: 'normal', exit_code: 0, signal_name: null, signal_number: null },
      harnessResult: { classification: 'completed', detail: 'evidence_retained', wrapper_signal: null, forwarded_signal: null },
    });
    const retry = claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'token-2', commandCategory: 'fake', expectedResult: 'completed', retryOf: 'token-1', retryAuthorization: 'review:retry' });
    assert.equal(retry.retry.retry_count, 1);
    assert.throws(() => updateExecutionToken(packet.root, 'token-1', 'started'), /transition/i);
  } finally { packet.cleanup(); }
});

test('completed execution tokens require successful harness evidence', () => {
  let caseNumber = 0;
  for (const [classification, shouldPass] of [
    ['completed', true],
    ['evidence_complete', true],
    ['harness_failed', false],
    ['interrupted', false],
    [null, false],
    ['completed-with-signal', false],
  ]) {
    const packet = makePacket('stage-1', `op-h${caseNumber += 1}`);
    try {
      claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'token-1', commandCategory: 'fake', expectedResult: 'completed' });
      updateExecutionToken(packet.root, 'token-1', 'started');
      const harnessResult = classification === null ? null : {
        classification: classification === 'completed-with-signal' ? 'completed' : classification,
        detail: classification === 'evidence_complete' ? 'evidence_complete' : 'evidence_retained',
        wrapper_signal: classification === 'completed-with-signal' ? 'SIGTERM' : null,
        forwarded_signal: classification === 'completed-with-signal' ? 'SIGTERM' : null,
      };
      const update = () => updateExecutionToken(packet.root, 'token-1', 'completed', {
        commandResult: { exit_kind: 'normal', exit_code: 0, signal_name: null, signal_number: null },
        harnessResult,
      });
      if (shouldPass) assert.doesNotThrow(update);
      else assert.throws(update, /harness|signal|token/i);
    } finally { packet.cleanup(); }
  }
});

test('retry lineage rejects reused authorization, cycles, and cross-operation token records', () => {
  const packet = makePacket(); const other = makePacket('stage-1', 'operation-test-2');
  const completed = { commandResult: { exit_kind: 'normal', exit_code: 0, signal_name: null, signal_number: null }, harnessResult: { classification: 'completed', detail: 'evidence_retained', wrapper_signal: null, forwarded_signal: null } };
  try {
    claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'original', commandCategory: 'fake', expectedResult: 'completed' });
    updateExecutionToken(packet.root, 'original', 'started'); updateExecutionToken(packet.root, 'original', 'completed', completed);
    claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'retry-one', commandCategory: 'fake', expectedResult: 'completed', retryOf: 'original', retryAuthorization: 'review:one' });
    assert.throws(() => claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'retry-two', commandCategory: 'fake', expectedResult: 'completed', retryOf: 'original', retryAuthorization: 'review:one' }), /already used/i);
    assert.throws(() => claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'self', commandCategory: 'fake', expectedResult: 'completed', retryOf: 'self', retryAuthorization: 'review:two' }), /distinct prior token/i);
    writeFileSync(join(other.root, 'tokens', 'foreign.json'), readFileSync(join(packet.root, 'tokens', 'original.json')), { mode: 0o600 });
    assert.throws(() => claimExecutionToken(other.root, { stageId: 'stage-1', token: 'retry-foreign', commandCategory: 'fake', expectedResult: 'completed', retryOf: 'foreign', retryAuthorization: 'review:three' }), /operation|schema/i);
  } finally { packet.cleanup(); other.cleanup(); }
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
    authorizationReference: 'task:local',
  }), /outside Git/i);
});
