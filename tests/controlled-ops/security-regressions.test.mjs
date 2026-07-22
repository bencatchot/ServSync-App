import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  appendEvent, claimExecutionToken, createManifest, freezeStage, initializeOperation, registerArtifact, sealOperation,
  readEvents, updateExecutionToken, verifyEventChain, verifyPacket,
} from '../../scripts/controlled-ops/evidence.mjs';
import { GENESIS_HASH, LIMITS, canonicalStringify, readJson, sha256 } from '../../scripts/controlled-ops/internal.mjs';
import { createSanitizationSummary } from '../../scripts/controlled-ops/sanitize.mjs';
import { evidenceCli, fakeCommand, makePacket, runWrapper, wrapperPath, writeSafeArtifact } from './helpers.mjs';

function stageEvent(packet) {
  appendEvent(packet.root, verifyEventChain(packet.root).head, {
    stage_id: 'stage-1', event_id: 'stage-complete', event_type: 'stage_completed', action_timestamp: new Date().toISOString(),
    archive_timestamp: null, command_category: null, expected_result: 'completed', observed_result: 'completed',
    result_classification: 'passed', exit_code: null, sanitized_artifact_paths: [],
  });
}

function prepareStage(packet) {
  const { summary, summaryName } = writeSafeArtifact(packet.root);
  registerArtifact(packet.root, 'stage-1', 'evidence.txt', 'test_evidence', summary);
  registerArtifact(packet.root, 'stage-1', summaryName, 'sanitization_summary');
  stageEvent(packet);
}

function rewriteEvents(root, events) {
  let previous = GENESIS_HASH;
  const rewritten = events.map((event, index) => {
    const withoutHash = {
      ...event,
      sequence: index + 1,
      previous_event_hash: previous,
    };
    delete withoutHash.current_event_hash;
    const current = { ...withoutHash, current_event_hash: sha256(`${previous}\n${canonicalStringify(withoutHash)}`) };
    previous = current.current_event_hash;
    return current;
  });
  writeFileSync(join(root, 'events.ndjson'), `${rewritten.map((event) => canonicalStringify(event)).join('\n')}\n`, { mode: 0o600 });
}

function terminalTokenWithoutEvent(packet, token, state = 'failed_before_execution') {
  claimExecutionToken(packet.root, { stageId: 'stage-1', token, commandCategory: 'fake', expectedResult: 'completed' });
  const notStarted = { exit_kind: 'not_started', exit_code: null, signal_name: null, signal_number: null };
  updateExecutionToken(packet.root, token, state, {
    commandResult: notStarted,
    harnessResult: state === 'interrupted'
      ? { classification: 'interrupted', detail: 'pre_spawn_interruption', wrapper_signal: 'SIGTERM', forwarded_signal: 'SIGTERM' }
      : { classification: 'capture_setup_failure', detail: 'capture_setup_failure', wrapper_signal: null, forwarded_signal: null },
  });
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function waitForExit(child) { return new Promise((resolve) => child.once('exit', (code) => resolve(code))); }

async function waitForPath(path, attempts = 100) {
  for (let attempt = 0; attempt < attempts && !existsSync(path); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(existsSync(path), true, `${path} was not created`);
}

test('eight concurrent appenders serialize safely and preserve one canonical event', async () => {
  const packet = makePacket(); const timestamp = new Date().toISOString();
  try {
    const children = Array.from({ length: 8 }, (_, index) => spawn(process.execPath, [evidenceCli, 'append-event', '--root', packet.root, '--expected-head', GENESIS_HASH, '--stage', 'stage-1', '--event-id', `concurrent-${index}`, '--event-type', 'test-event', '--action-timestamp', timestamp, '--expected', 'completed', '--observed', 'completed', '--result-classification', 'passed'], { stdio: 'ignore' }));
    const exits = await Promise.all(children.map(waitForExit)); assert.equal(exits.filter((code) => code === 0).length, 1);
    assert.equal(verifyEventChain(packet.root).eventCount, 1);
  } finally { packet.cleanup(); }
});

test('two concurrent wrappers cannot execute one token twice', async () => {
  const packet = makePacket(); const counter = join(packet.parent, 'counter.txt');
  try {
    const argv = [wrapperPath, '--operation-root', packet.root, '--stage', 'stage-1', '--token', 'one-token', '--category', 'fake-command', '--expected', 'completed', '--', process.execPath, fakeCommand, 'delay', '100', counter];
    const exits = await Promise.all([spawn('bash', argv, { stdio: 'ignore' }), spawn('bash', argv, { stdio: 'ignore' })].map(waitForExit));
    const sorted = exits.sort((a, b) => a - b); assert.equal(sorted[0], 0); assert.ok([90, 93].includes(sorted[1])); assert.equal(readFileSync(counter, 'utf8').trim().split('\n').length, 1);
  } finally { packet.cleanup(); }
});

test('raw stdout and stderr symlink leaves fail before execution without changing external inodes', () => {
  for (const stream of ['stdout', 'stderr']) {
    const packet = makePacket(); const external = join(packet.parent, `${stream}.txt`); const counter = join(packet.parent, 'counter.txt');
    try {
      writeFileSync(external, 'unchanged\n', { mode: 0o600 });
      symlinkSync(external, join(packet.root, 'quarantine', `linked.${stream}.raw`));
      const result = runWrapper(packet.root, 'linked', ['clean', '', counter]);
      assert.equal(result.status, 91); assert.equal(existsSync(counter), false); assert.equal(readFileSync(external, 'utf8'), 'unchanged\n');
      const token = readJson(join(packet.root, 'tokens', 'linked.json'));
      assert.equal(token.state, 'failed_before_execution'); assert.equal(token.command_result.exit_kind, 'not_started');
    } finally { packet.cleanup(); }
  }
});

test('symlinked artifact directory is rejected before command execution', () => {
  const packet = makePacket(); const external = join(packet.parent, 'external'); const counter = join(packet.parent, 'counter.txt');
  try {
    mkdirSync(external, { mode: 0o700 }); rmSync(join(packet.root, 'stages', 'stage-1', 'artifacts'), { recursive: true });
    symlinkSync(external, join(packet.root, 'stages', 'stage-1', 'artifacts'));
    assert.equal(runWrapper(packet.root, 'unsafe-parent', ['clean', '', counter]).status, 91);
    assert.equal(existsSync(counter), false); assert.deepEqual(readdirSync(external), []);
  } finally { packet.cleanup(); }
});

test('artifact-parent symlink swap after preflight is revalidated before promotion', async () => {
  const packet = makePacket(); const external = join(packet.parent, 'external-swap'); const artifactDirectory = join(packet.root, 'stages', 'stage-1', 'artifacts');
  try {
    mkdirSync(external, { mode: 0o700 });
    const wrapper = spawn('bash', [wrapperPath, '--operation-root', packet.root, '--stage', 'stage-1', '--token', 'swap', '--category', 'fake-command', '--expected', 'completed', '--', process.execPath, fakeCommand, 'delay', '300'], { stdio: 'ignore', env: { PATH: process.env.PATH ?? '' } });
    const raw = join(packet.root, 'quarantine', 'swap.stdout.raw');
    for (let attempt = 0; attempt < 100 && !existsSync(raw); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    rmSync(artifactDirectory, { recursive: true }); symlinkSync(external, artifactDirectory);
    const exit = await new Promise((resolve) => wrapper.once('exit', resolve)); assert.equal(exit, 93);
    assert.deepEqual(readdirSync(external), []); assert.deepEqual(readdirSync(join(packet.root, 'quarantine')), []);
    assert.equal(readJson(join(packet.root, 'tokens', 'swap.json')).state, 'started');
    assert.throws(() => verifyPacket(packet.root), /unresolved/i);
  } finally { packet.cleanup(); }
});

test('operation initialization rejects a symlinked parent component', () => {
  const packet = makePacket(); const actual = join(packet.parent, 'actual-parent'); const linked = join(packet.parent, 'linked-parent');
  try {
    mkdirSync(actual, { mode: 0o700 }); symlinkSync(actual, linked);
    assert.throws(() => initializeOperation(join(linked, 'new-packet'), {
      operationId: 'symlink-parent', operationClassification: 'local-test', targetClassification: 'local-fixture', authorizationReference: 'task:local',
    }), /symlink/i);
  } finally { packet.cleanup(); }
});

test('hard-linked stage artifact is rejected before freeze without changing external mode', () => {
  const packet = makePacket(); const external = join(packet.parent, 'external.txt');
  try {
    const { output, summary, summaryName } = writeSafeArtifact(packet.root);
    registerArtifact(packet.root, 'stage-1', 'evidence.txt', 'test_evidence', summary);
    registerArtifact(packet.root, 'stage-1', summaryName, 'sanitization_summary'); stageEvent(packet);
    const original = readFileSync(output); rmSync(output); writeFileSync(external, original, { mode: 0o600 }); linkSync(external, output);
    assert.throws(() => freezeStage(packet.root, 'stage-1'), /link count|unsafe/i);
    assert.equal(statSync(external).mode & 0o777, 0o600); assert.equal(readFileSync(external, 'utf8'), original.toString());
  } finally { packet.cleanup(); }
});

test('unresolved token and unknown administrative-prefix file block integrity operations', () => {
  const packet = makePacket();
  try {
    prepareStage(packet); claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'claimed', commandCategory: 'fake', expectedResult: 'completed' });
    assert.throws(() => freezeStage(packet.root, 'stage-1'), /claimed/i);
    assert.throws(() => createManifest(packet.root), /claimed/i);
    writeFileSync(join(packet.root, 'manifest.json'), '{}\n', { mode: 0o600 });
    assert.throws(() => sealOperation(packet.root), /claimed/i);
  } finally { packet.cleanup(); }

  const second = makePacket();
  try {
    prepareStage(second); freezeStage(second.root, 'stage-1');
    writeFileSync(join(second.root, '.controlled-ops-forged'), 'status=ok\n', { mode: 0o600 });
    assert.throws(() => createManifest(second.root), /unclassified/i);
  } finally { second.cleanup(); }
});

test('terminal token states require exactly one matching terminal timeline event', () => {
  for (const [state, token] of [['failed_before_execution', 'fbexec'], ['interrupted', 'intr']]) {
    const packet = makePacket();
    try {
      prepareStage(packet);
      terminalTokenWithoutEvent(packet, token, state);
      assert.throws(() => verifyPacket(packet.root), /terminal event|timeline/i);
      assert.throws(() => freezeStage(packet.root, 'stage-1'), /terminal event|timeline/i);
      assert.throws(() => createManifest(packet.root), /terminal event|timeline/i);
      assert.throws(() => sealOperation(packet.root), /terminal event|timeline/i);
    } finally { packet.cleanup(); }
  }
});

test('terminal timeline event mismatches and duplicate completed events fail closed', () => {
  const invalidMutations = ['duplicate', 'wrong-stage', 'wrong-state', 'wrong-exit'];
  for (const mutation of invalidMutations) {
    const packet = makePacket();
    try {
      const result = runWrapper(packet.root, `token-${mutation}`, ['clean']);
      assert.equal(result.status, 0, result.stderr);
      prepareStage(packet);
      const events = readEvents(packet.root);
      const terminalIndex = events.findIndex((event) => event.event_id === `token-${mutation}-completed`);
      assert.notEqual(terminalIndex, -1);
      if (mutation === 'duplicate') events.push({ ...events[terminalIndex] });
      if (mutation === 'wrong-stage') events[terminalIndex] = { ...events[terminalIndex], stage_id: 'stage-other' };
      if (mutation === 'wrong-state') events[terminalIndex] = { ...events[terminalIndex], observed_result: 'command_failed', result_classification: 'command_failed' };
      if (mutation === 'wrong-exit') events[terminalIndex] = { ...events[terminalIndex], exit_code: 7 };
      rewriteEvents(packet.root, events);
      assert.throws(() => verifyPacket(packet.root), /timeline|duplicate|sequence|context|classification|exit/i);
      assert.throws(() => createManifest(packet.root), /timeline|duplicate|sequence|context|classification|exit/i);
      assert.throws(() => sealOperation(packet.root), /timeline|duplicate|sequence|context|classification|exit/i);
    } finally { packet.cleanup(); }
  }
});

test('pre-execution terminal token rejects fake command-started evidence', () => {
  const packet = makePacket();
  try {
    prepareStage(packet);
    terminalTokenWithoutEvent(packet, 'pre-exec-start', 'failed_before_execution');
    const head = verifyEventChain(packet.root).head;
    appendEvent(packet.root, head, {
      stage_id: 'stage-1', event_id: 'pre-exec-start-started', event_type: 'command_started', action_timestamp: new Date().toISOString(),
      archive_timestamp: null, command_category: 'fake', expected_result: 'completed', observed_result: 'started',
      result_classification: 'started', exit_code: null, sanitized_artifact_paths: [],
    });
    const secondHead = verifyEventChain(packet.root).head;
    appendEvent(packet.root, secondHead, {
      stage_id: 'stage-1', event_id: 'pre-exec-start-completed', event_type: 'command_completed', action_timestamp: new Date().toISOString(),
      archive_timestamp: null, command_category: 'fake', expected_result: 'completed', observed_result: 'failed_before_execution',
      result_classification: 'failed_before_execution', exit_code: null, sanitized_artifact_paths: [],
    });
    assert.throws(() => verifyPacket(packet.root), /start evidence/i);
    assert.throws(() => createManifest(packet.root), /start evidence/i);
    assert.throws(() => sealOperation(packet.root), /start evidence/i);
  } finally { packet.cleanup(); }
});

test('terminal event cannot complete a nonterminal token packet', () => {
  const packet = makePacket();
  try {
    prepareStage(packet);
    claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'still-claimed', commandCategory: 'fake', expectedResult: 'completed' });
    const head = verifyEventChain(packet.root).head;
    appendEvent(packet.root, head, {
      stage_id: 'stage-1', event_id: 'still-claimed-completed', event_type: 'command_completed', action_timestamp: new Date().toISOString(),
      archive_timestamp: null, command_category: 'fake', expected_result: 'completed', observed_result: 'failed_before_execution',
      result_classification: 'failed_before_execution', exit_code: null, sanitized_artifact_paths: [],
    });
    assert.throws(() => verifyPacket(packet.root), /unresolved/i);
    assert.throws(() => freezeStage(packet.root, 'stage-1'), /unresolved/i);
    assert.throws(() => createManifest(packet.root), /unresolved/i);
    assert.throws(() => sealOperation(packet.root), /unresolved/i);
  } finally { packet.cleanup(); }
});

test('real pre-execution terminal paths emit terminal events before packet completion', () => {
  const scenarios = [
    ['capture-fail', () => {
      const packet = makePacket();
      symlinkSync(join(packet.parent, 'external.txt'), join(packet.root, 'quarantine', 'capture-fail.stdout.raw'));
      writeFileSync(join(packet.parent, 'external.txt'), 'unchanged\n', { mode: 0o600 });
      return packet;
    }, ['clean']],
    ['spawn-fail', () => makePacket(), [join(process.execPath, 'not-a-command')]],
  ];
  for (const [token, packetFactory, commandArguments] of scenarios) {
    const packet = packetFactory();
    try {
      const result = token === 'spawn-fail'
        ? runWrapper(packet.root, token, [], ['--', ...commandArguments])
        : runWrapper(packet.root, token, commandArguments);
      assert.equal(result.status, 91);
      const tokenRecord = readJson(join(packet.root, 'tokens', `${token}.json`));
      assert.equal(tokenRecord.state, 'failed_before_execution');
      const terminalEvents = readEvents(packet.root).filter((event) => event.event_id === `${token}-completed`);
      assert.equal(terminalEvents.length, 1);
      assert.equal(terminalEvents[0].observed_result, 'failed_before_execution');
    } finally { packet.cleanup(); }
  }
});

test('valid terminal token and event packet can freeze, manifest, seal, and verify', () => {
  const packet = makePacket();
  try {
    assert.equal(runWrapper(packet.root, 'valid-token', ['clean']).status, 0);
    prepareStage(packet);
    freezeStage(packet.root, 'stage-1');
    createManifest(packet.root);
    const sealed = sealOperation(packet.root);
    assert.equal(verifyPacket(packet.root, sealed.seal_sha256).status, 'verified');
  } finally { packet.cleanup(); }
});

test('forged sanitization summaries and arbitrary fingerprints fail closed', () => {
  const packet = makePacket();
  try {
    const artifact = join(packet.root, 'stages', 'stage-1', 'artifacts', 'evidence.txt');
    const summary = join(packet.root, 'stages', 'stage-1', 'artifacts', 'evidence.sanitization.json');
    writeFileSync(artifact, 'status=ok\n', { mode: 0o600 }); writeFileSync(summary, '{"passed":true}\n', { mode: 0o600 });
    assert.throws(() => registerArtifact(packet.root, 'stage-1', 'evidence.txt', 'test_evidence', summary), /schema|required field/i);
    const valid = createSanitizationSummary({ mode: 'lines', artifactPath: 'evidence.txt', output: 'status=ok\n' });
    valid.artifact_sha256 = 'a'.repeat(64); writeFileSync(summary, `${canonicalStringify(valid)}\n`);
    assert.throws(() => registerArtifact(packet.root, 'stage-1', 'evidence.txt', 'test_evidence', summary), /not bound|mismatch/i);
  } finally { packet.cleanup(); }
});

test('event verification rejects byte-noncanonical and truncated NDJSON', () => {
  for (const mutation of ['spacing', 'truncated', 'duplicate-key']) {
    const packet = makePacket();
    try {
      stageEvent(packet); const path = join(packet.root, 'events.ndjson'); const line = readFileSync(path, 'utf8').trimEnd();
      if (mutation === 'spacing') writeFileSync(path, `${line.replace('{', '{ ')}\n`);
      else if (mutation === 'truncated') writeFileSync(path, line);
      else writeFileSync(path, `${line.replace('{', '{"sequence":1,')}\n`);
      assert.throws(() => verifyEventChain(packet.root), /canonical|truncated|record boundary/i);
    } finally { packet.cleanup(); }
  }
});

test('manifest and seal mode-only changes are detected', () => {
  const packet = makePacket();
  try {
    prepareStage(packet); freezeStage(packet.root, 'stage-1'); createManifest(packet.root); const sealed = sealOperation(packet.root);
    chmodSync(join(packet.root, 'manifest.json'), 0o400); assert.throws(() => verifyPacket(packet.root, sealed.seal_sha256), /mode is unsafe/i);
    chmodSync(join(packet.root, 'manifest.json'), 0o600); chmodSync(join(packet.root, 'seal.json'), 0o400); assert.throws(() => verifyPacket(packet.root, sealed.seal_sha256), /mode is unsafe/i);
  } finally { packet.cleanup(); }
});

test('capture limits and runtime timeout terminate once and clear quarantine', () => {
  for (const [token, arguments_, extra] of [
    ['stdout-over', ['large', String(Math.floor(LIMITS.stdout_bytes / 8) + 2)], []],
    ['line-over', ['long-line', String(LIMITS.line_bytes + 1)], []],
    ['timeout', ['delay', '500'], ['--runtime-ms', '50']],
  ]) {
    const packet = makePacket();
    try {
      const result = runWrapper(packet.root, token, arguments_, extra); assert.equal(result.status, 95, result.stderr);
      assert.equal(readJson(join(packet.root, 'tokens', `${token}.json`)).state, 'limit_exceeded');
      assert.deepEqual(readdirSync(join(packet.root, 'quarantine')), []);
    } finally { packet.cleanup(); }
  }
});

test('capture byte limits accept their exact boundary and reject stream and combined overflow', () => {
  const exactRepeats = LIMITS.stdout_bytes / Buffer.byteLength('count=1\n');
  for (const [token, arguments_, expected] of [
    ['stdout-at', ['large', String(exactRepeats)], 0],
    ['stderr-at', ['large-stderr', String(exactRepeats)], 0],
    ['stderr-over', ['large-stderr', String(exactRepeats + 1)], 95],
    ['combined-over', ['both-large', '100000'], 95],
  ]) {
    const packet = makePacket();
    try {
      const result = runWrapper(packet.root, token, arguments_); assert.equal(result.status, expected, result.stderr);
      assert.deepEqual(readdirSync(join(packet.root, 'quarantine')), []);
    } finally { packet.cleanup(); }
  }
});

test('shell-like arguments remain literal argv without shell interpretation', () => {
  const packet = makePacket(); const output = join(packet.parent, 'argv.json');
  const arguments_ = ['space value', 'tab\tvalue', 'line\nvalue', ';', '|', '>', '*', '$(touch nope)', '`touch nope`', '"quoted"', "'single'", '-leading', '--', '', 'Unicode-OK'];
  try {
    const result = runWrapper(packet.root, 'argv', ['argv', output, ...arguments_]); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), arguments_); assert.equal(existsSync(join(packet.parent, 'nope')), false);
  } finally { packet.cleanup(); }
});

test('wrapper interruption terminates the child process group and removes raw capture', async () => {
  const packet = makePacket(); const pids = join(packet.parent, 'pids.txt');
  try {
    const wrapper = spawn('bash', [wrapperPath, '--operation-root', packet.root, '--stage', 'stage-1', '--token', 'interrupt', '--category', 'fake-command', '--expected', 'completed', '--', process.execPath, fakeCommand, 'tree', pids], { stdio: 'ignore', env: { PATH: process.env.PATH ?? '' } });
    for (let attempt = 0; attempt < 100 && (!existsSync(pids) || readFileSync(pids, 'utf8').trim().split('\n').length < 2); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    wrapper.kill('SIGTERM'); const exit = await new Promise((resolve) => wrapper.once('exit', resolve)); assert.equal(exit, 94);
    await new Promise((resolve) => setTimeout(resolve, 100));
    for (const pid of new Set(readFileSync(pids, 'utf8').trim().split('\n').map(Number))) assert.equal(processExists(pid), false, `process ${pid} survived`);
    assert.equal(readJson(join(packet.root, 'tokens', 'interrupt.json')).state, 'interrupted'); assert.deepEqual(readdirSync(join(packet.root, 'quarantine')), []);
  } finally { packet.cleanup(); }
});

test('pre-spawn wrapper SIGTERM records terminal interruption without starting the command', async () => {
  const packet = makePacket(); const counter = join(packet.parent, 'counter.txt'); const ready = join(packet.parent, 'ready.txt'); const release = join(packet.parent, 'release.txt');
  try {
    const wrapper = spawn('bash', [
      wrapperPath, '--operation-root', packet.root, '--stage', 'stage-1', '--token', 'early-term',
      '--category', 'fake-command', '--expected', 'completed', '--', process.execPath, fakeCommand, 'clean', '', counter,
    ], {
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH ?? '',
        SERVSYNC_CONTROLLED_OPS_ALLOW_TEST_HOOKS: '1',
        SERVSYNC_CONTROLLED_OPS_TEST_BARRIER: JSON.stringify({ label: 'before-command-started', ready, release }),
      },
    });
    await waitForPath(ready);
    wrapper.kill('SIGTERM');
    const exit = await waitForExit(wrapper);
    assert.equal(exit, 94);
    assert.equal(existsSync(counter), false);
    assert.deepEqual(readdirSync(join(packet.root, 'quarantine')), []);
    const token = readJson(join(packet.root, 'tokens', 'early-term.json'));
    assert.equal(token.state, 'interrupted');
    assert.equal(token.command_result.exit_kind, 'not_started');
    assert.equal(token.harness_result.wrapper_signal, 'SIGTERM');
    assert.equal(token.harness_result.forwarded_signal, 'SIGTERM');
    assert.equal(token.harness_result.detail, 'pre_spawn_interruption');
    const events = readEvents(packet.root);
    assert.equal(events.some((event) => event.event_type === 'command_started'), false);
    assert.equal(events.filter((event) => event.event_type === 'command_completed').length, 1);
  } finally { packet.cleanup(); }
});

test('wrapper SIGHUP retains exact wrapper, forwarded, and child signal provenance', async () => {
  const packet = makePacket(); const pids = join(packet.parent, 'sighup-pids.txt');
  try {
    const wrapper = spawn('bash', [
      wrapperPath, '--operation-root', packet.root, '--stage', 'stage-1', '--token', 'sighup',
      '--category', 'fake-command', '--expected', 'completed', '--', process.execPath, fakeCommand, 'tree', pids,
    ], { stdio: 'ignore', env: { PATH: process.env.PATH ?? '' } });
    await waitForPath(pids);
    wrapper.kill('SIGHUP');
    const exit = await waitForExit(wrapper);
    assert.equal(exit, 94);
    await new Promise((resolve) => setTimeout(resolve, 100));
    for (const pid of new Set(readFileSync(pids, 'utf8').trim().split('\n').map(Number))) assert.equal(processExists(pid), false, `process ${pid} survived`);
    const token = readJson(join(packet.root, 'tokens', 'sighup.json'));
    assert.equal(token.state, 'interrupted');
    assert.equal(token.harness_result.wrapper_signal, 'SIGHUP');
    assert.equal(token.harness_result.forwarded_signal, 'SIGHUP');
    assert.equal(token.command_result.exit_kind, 'signal');
    assert.equal(token.command_result.signal_name, 'SIGHUP');
    assert.deepEqual(readdirSync(join(packet.root, 'quarantine')), []);
  } finally { packet.cleanup(); }
});

test('high-entropy caller-authored metadata is rejected at creation, verification, manifest, and seal', () => {
  const packet = makePacket(); const opaque = 'auth-a1b2c3d4e5f6g7h8i9j0k1l2m3n4';
  try {
    assert.throws(() => initializeOperation(join(packet.parent, 'bad-auth'), {
      operationId: 'operation-bad-auth', operationClassification: 'local-test', targetClassification: 'local-fixture',
      authorizationReference: opaque,
    }), /authorization reference|caller metadata/i);
    assert.throws(() => claimExecutionToken(packet.root, {
      stageId: 'stage-1', token: 'bad-category', commandCategory: opaque, expectedResult: 'completed',
    }), /command category|caller metadata|label/i);
    claimExecutionToken(packet.root, { stageId: 'stage-1', token: 'original-meta', commandCategory: 'fake', expectedResult: 'completed' });
    writeFileSync(join(packet.root, 'operation.json'), `${canonicalStringify({
      ...readJson(join(packet.root, 'operation.json')),
      authorization_reference: opaque,
    })}\n`, { mode: 0o600 });
    assert.throws(() => verifyPacket(packet.root), /authorization reference|caller metadata/i);
    assert.throws(() => createManifest(packet.root), /authorization reference|caller metadata/i);
    assert.throws(() => sealOperation(packet.root), /authorization reference|caller metadata/i);
  } finally { packet.cleanup(); }
});

test('authorization and retry references reject opaque variants at creation time', () => {
  const invalid = [
    'auth-a1b2c3d4e5f6g7h8i9j0k1l2m3n4',
    'task:a1b2c3d4e5f6g7h8i9j0',
    'review:ab12-cd34-ef56-gh78',
    'ticket:abcdefabcdefabcd',
    'issue:eyJhbGciOiJIUzI1NiJ9',
    'owner:synthetic-customer-test@example',
  ];
  for (const reference of invalid) {
    const packet = makePacket();
    try {
      assert.throws(() => initializeOperation(join(packet.parent, `bad-${invalid.indexOf(reference)}`), {
        operationId: 'operation-bad-reference', operationClassification: 'local-test', targetClassification: 'local-fixture',
        authorizationReference: reference,
      }), /authorization reference|caller metadata|human-readable/i);
      assert.equal(runWrapper(packet.root, 'original', ['clean']).status, 0);
      assert.throws(() => claimExecutionToken(packet.root, {
        stageId: 'stage-1', token: 'retry-bad', commandCategory: 'fake-command', expectedResult: 'completed',
        retryOf: 'original', retryAuthorization: reference,
      }), /retry authorization|caller metadata|human-readable/i);
    } finally { packet.cleanup(); }
  }
});

test('low-entropy authorization and retry references remain compatible', () => {
  for (const reference of ['owner:approved', 'ticket:323', 'issue:fb020', 'review:security', 'task:reaudit', 'change:local']) {
    const type = reference.split(':')[0];
    const packet = makePacket('stage-1', `op-${type}`);
    try {
      initializeOperation(join(packet.parent, `packet-${type}`), {
        operationId: `op-${type}-extra`,
        operationClassification: 'local-test',
        targetClassification: 'local-fixture',
        authorizationReference: reference,
      });
      assert.equal(runWrapper(packet.root, 'original', ['clean']).status, 0);
      const retry = claimExecutionToken(packet.root, {
        stageId: 'stage-1', token: `retry-${reference.split(':')[0]}`, commandCategory: 'fake-command', expectedResult: 'completed',
        retryOf: 'original', retryAuthorization: reference,
      });
      assert.equal(retry.retry.authorization_reference, reference);
    } finally { packet.cleanup(); }
  }
});

test('operation root rejects controls, unicode separators, and non-NFC input before filesystem access', () => {
  const packet = makePacket();
  const invalidRoots = ['bad\nroot', 'bad\rroot', 'bad\troot', `bad${String.fromCharCode(0x7f)}root`, `bad${String.fromCharCode(0x85)}root`, 'bad\u2028root', 'bad\u2029root', 'cafe\u0301'];
  try {
    for (const leaf of invalidRoots) {
      const root = join(packet.parent, leaf);
      assert.throws(() => initializeOperation(root, {
        operationId: 'bad-root', operationClassification: 'local-test', targetClassification: 'local-fixture',
        authorizationReference: 'task:local',
      }), /operation root|unsafe/i);
      assert.equal(existsSync(root), false);
    }
  } finally { packet.cleanup(); }
});

test('normal exit codes 130 and 143 remain distinct from signal termination', () => {
  for (const code of [130, 143]) {
    const packet = makePacket();
    try { const result = runWrapper(packet.root, `exit-${code}`, ['exit', String(code)]); assert.equal(result.status, code); assert.equal(readJson(join(packet.root, 'tokens', `exit-${code}.json`)).command_result.exit_kind, 'normal'); }
    finally { packet.cleanup(); }
  }
  const packet = makePacket();
  try { runWrapper(packet.root, 'signal', ['signal']); assert.equal(readJson(join(packet.root, 'tokens', 'signal.json')).command_result.exit_kind, 'signal'); }
  finally { packet.cleanup(); }
});
