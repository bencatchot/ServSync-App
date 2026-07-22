#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import { closeSync, existsSync, fsyncSync, readFileSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIMITS, EvidenceError, assertOperationRoot, assertPacketOwnedDirectory, canonicalStringify, openExclusivePacketFile,
  safeError, utcNow, validateAuthorizationReference, validateCommandCategory, validateControlledSlug,
  validateExpectedResult,
} from './internal.mjs';
import {
  appendEvent, claimExecutionToken, promoteCommandArtifacts, terminalObservedResultForState, updateExecutionToken, verifyEventChain,
} from './evidence.mjs';
import { createSanitizationSummary, sanitizeContent } from './sanitize.mjs';

const EXIT = Object.freeze({ arguments: 90, capture: 91, sanitizer: 92, evidence: 93, interrupted: 94, limit: 95 });
const WRAPPER_OPTIONS = new Set(['operation-root', 'stage', 'token', 'category', 'expected', 'expected-affected-rows', 'runtime-ms', 'retry-of', 'retry-authorization']);

function parse(arguments_) {
  const options = {}; let index = 0;
  while (index < arguments_.length && arguments_[index] !== '--') {
    const name = arguments_[index]; const value = arguments_[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new EvidenceError('INVALID_ARGUMENTS', 'Wrapper arguments are invalid.');
    const key = name.slice(2); if (!WRAPPER_OPTIONS.has(key) || Object.hasOwn(options, key)) throw new EvidenceError('INVALID_ARGUMENTS', 'Wrapper option is unknown or duplicated.');
    options[key] = value; index += 2;
  }
  if (arguments_[index] !== '--' || index + 1 >= arguments_.length) throw new EvidenceError('INVALID_ARGUMENTS', 'An explicit command argv is required after --.');
  return { options, command: arguments_[index + 1], args: arguments_.slice(index + 2) };
}

function required(options, name) { const value = options[name]; if (!value) throw new EvidenceError('INVALID_ARGUMENTS', `--${name} is required.`); return value; }
function safeUnlink(path) { try { unlinkSync(path); } catch {} }
function signalNumber(name) { return osConstants.signals[name] ?? null; }
function harnessResult(classification, detail, wrapperSignal = null) {
  return { classification, detail, wrapper_signal: wrapperSignal?.name ?? null, forwarded_signal: wrapperSignal?.name ?? null };
}
function writeAll(descriptor, chunk) {
  let offset = 0;
  while (offset < chunk.length) offset += writeSync(descriptor, chunk, offset, chunk.length - offset);
}

function nextLineBytes(current, chunk) {
  let length = current;
  for (const byte of chunk) {
    if (byte === 0x0a) length = 0;
    else { length += 1; if (length > LIMITS.line_bytes) return -1; }
  }
  return length;
}

function assertCaptureDestinations(rootPath, stageId, token) {
  const artifactDirectory = join(rootPath, 'stages', stageId, 'artifacts');
  assertPacketOwnedDirectory(rootPath, artifactDirectory, [0o700]);
  for (const suffix of ['stdout.txt', 'stderr.txt', 'stdout.sanitization.json', 'stderr.sanitization.json']) {
    if (existsSync(join(artifactDirectory, `${token}.${suffix}`))) throw new EvidenceError('CAPTURE_SETUP_FAILURE', 'A retained capture destination already exists.');
  }
}

function recordTerminalEvent(rootPath, stageId, token, commandCategory, expectedResult, tokenState, commandResult, artifactPaths = [], detail = null) {
  const head = verifyEventChain(rootPath).head;
  const observedResult = terminalObservedResultForState(tokenState, detail);
  const exitCode = commandResult.exit_kind === 'normal' ? commandResult.exit_code : (commandResult.exit_kind === 'signal' ? 128 + commandResult.signal_number : null);
  appendEvent(rootPath, head, {
    stage_id: stageId, event_id: `${token}-completed`, event_type: 'command_completed', action_timestamp: utcNow(), archive_timestamp: null,
    command_category: commandCategory, expected_result: expectedResult, observed_result: observedResult,
    result_classification: observedResult, exit_code: exitCode, sanitized_artifact_paths: artifactPaths,
  });
}

async function terminateGroup(child, signal = 'SIGTERM') {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); } catch {}
  const deadline = Date.now() + LIMITS.command_termination_grace_ms;
  while (Date.now() < deadline) {
    try { process.kill(-child.pid, 0); } catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
}

async function maybeTestBarrier(label, getWrapperSignal) {
  if (process.env.SERVSYNC_CONTROLLED_OPS_ALLOW_TEST_HOOKS !== '1' || !process.env.SERVSYNC_CONTROLLED_OPS_TEST_BARRIER) return;
  let barrier;
  try { barrier = JSON.parse(process.env.SERVSYNC_CONTROLLED_OPS_TEST_BARRIER); } catch { return; }
  if (barrier?.label !== label || typeof barrier.ready !== 'string' || typeof barrier.release !== 'string') return;
  try { writeFileSync(barrier.ready, `${label}\n`, { mode: 0o600 }); } catch {}
  while (!existsSync(barrier.release) && !getWrapperSignal()) await new Promise((resolve) => setTimeout(resolve, 10));
}

async function main() {
  const { options, command, args } = parse(process.argv.slice(2));
  const root = required(options, 'operation-root'); const stageId = required(options, 'stage'); const token = required(options, 'token'); const commandCategory = required(options, 'category'); const expectedResult = required(options, 'expected');
  validateControlledSlug(stageId, 'stage'); validateControlledSlug(token, 'token'); validateCommandCategory(commandCategory); validateExpectedResult(expectedResult);
  if (options['retry-authorization']) validateAuthorizationReference(options['retry-authorization'], 'retry authorization');
  const expectedRows = options['expected-affected-rows'] === undefined ? null : Number.parseInt(options['expected-affected-rows'], 10);
  if (expectedRows !== null && (!/^\d+$/.test(options['expected-affected-rows']) || !Number.isSafeInteger(expectedRows))) throw new EvidenceError('INVALID_ARGUMENTS', 'Expected affected rows must be a nonnegative integer.');
  const runtimeMs = options['runtime-ms'] === undefined ? LIMITS.command_runtime_ms : Number.parseInt(options['runtime-ms'], 10);
  if (!Number.isInteger(runtimeMs) || runtimeMs < 1 || runtimeMs > LIMITS.command_runtime_ms) throw new EvidenceError('INVALID_ARGUMENTS', 'Runtime limit is invalid.');

  let child; let wrapperSignal = null; let stdoutFd; let stderrFd; let rootPath; let rawStdout; let rawStderr; let tokenClaimed = false;
  const getWrapperSignal = () => wrapperSignal;
  const onWrapperSignal = (name) => {
    if (!wrapperSignal) {
      wrapperSignal = { name, number: signalNumber(name), received_utc: utcNow() };
      void terminateGroup(child, name);
    }
  };
  const listeners = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((name) => {
    const listener = () => onWrapperSignal(name);
    process.on(name, listener);
    return [name, listener];
  });
  const checkpoint = async (label) => {
    await maybeTestBarrier(label, getWrapperSignal);
    return wrapperSignal;
  };
  const closeCaptures = () => {
    if (stdoutFd !== undefined) { try { closeSync(stdoutFd); } catch {} stdoutFd = undefined; }
    if (stderrFd !== undefined) { try { closeSync(stderrFd); } catch {} stderrFd = undefined; }
  };
  const cleanupRaw = () => {
    closeCaptures();
    if (rawStdout) safeUnlink(rawStdout);
    if (rawStderr) safeUnlink(rawStderr);
  };
  const finalizePreSpawnInterruption = () => {
    cleanupRaw();
    if (tokenClaimed) {
      const notStarted = { exit_kind: 'not_started', exit_code: null, signal_name: null, signal_number: null };
      updateExecutionToken(rootPath, token, 'interrupted', {
        commandResult: notStarted,
        harnessResult: harnessResult('interrupted', 'pre_spawn_interruption', wrapperSignal),
      });
      recordTerminalEvent(rootPath, stageId, token, commandCategory, expectedResult, 'interrupted', notStarted);
    }
    process.exitCode = EXIT.interrupted;
  };

  try {
    if (await checkpoint('after-argument-validation')) { finalizePreSpawnInterruption(); return; }
    ({ rootPath } = assertOperationRoot(root)); const quarantine = join(rootPath, 'quarantine');
    claimExecutionToken(rootPath, { stageId, token, commandCategory, expectedResult, retryOf: options['retry-of'], retryAuthorization: options['retry-authorization'] });
    tokenClaimed = true;
    if (await checkpoint('after-token-claim')) { finalizePreSpawnInterruption(); return; }
    rawStdout = join(quarantine, `${token}.stdout.raw`); rawStderr = join(quarantine, `${token}.stderr.raw`);
    try {
      assertPacketOwnedDirectory(rootPath, quarantine, [0o700]);
      assertCaptureDestinations(rootPath, stageId, token);
      if (await checkpoint('before-capture-creation')) { finalizePreSpawnInterruption(); return; }
      stdoutFd = openExclusivePacketFile(rootPath, rawStdout); stderrFd = openExclusivePacketFile(rootPath, rawStderr);
      if (await checkpoint('after-capture-open')) { finalizePreSpawnInterruption(); return; }
    } catch {
      cleanupRaw();
      const notStarted = { exit_kind: 'not_started', exit_code: null, signal_name: null, signal_number: null };
      updateExecutionToken(rootPath, token, 'failed_before_execution', { commandResult: notStarted, harnessResult: harnessResult('capture_setup_failure', 'capture_setup_failure') });
      recordTerminalEvent(rootPath, stageId, token, commandCategory, expectedResult, 'failed_before_execution', notStarted);
      process.exitCode = EXIT.capture; return;
    }

    if (await checkpoint('before-command-started')) { finalizePreSpawnInterruption(); return; }

    let limitClass = null; let stdoutBytes = 0; let stderrBytes = 0; let combinedBytes = 0; let stdoutLineBytes = 0; let stderrLineBytes = 0; let closed = false;

  const closeResult = await new Promise((resolveClose) => {
    let timer;
    try { child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env }); }
    catch { resolveClose({ code: null, signal: null, spawnError: true }); return; }
    let spawnError = false; child.once('error', () => { spawnError = true; });
    if (child.pid === undefined) {
      child.once('close', (code, signal) => { if (timer) clearTimeout(timer); closed = true; resolveClose({ code, signal, spawnError: true }); });
      return;
    }
    const startedAt = utcNow(); const head = verifyEventChain(rootPath).head;
    appendEvent(rootPath, head, { stage_id: stageId, event_id: `${token}-started`, event_type: 'command_started', action_timestamp: startedAt, archive_timestamp: null, command_category: commandCategory, expected_result: expectedResult, observed_result: 'started', result_classification: 'started', exit_code: null, sanitized_artifact_paths: [] });
    updateExecutionToken(rootPath, token, 'started');
    void checkpoint('after-child-spawn').then((signal) => { if (signal) void terminateGroup(child, signal.name); });
    const consume = (stream, descriptor, kind) => stream.on('data', (chunk) => {
      if (closed || limitClass) return;
      const nextKind = (kind === 'stdout' ? stdoutBytes : stderrBytes) + chunk.length; const nextCombined = combinedBytes + chunk.length;
      const maximum = kind === 'stdout' ? LIMITS.stdout_bytes : LIMITS.stderr_bytes;
      const lineBytes = nextLineBytes(kind === 'stdout' ? stdoutLineBytes : stderrLineBytes, chunk);
      if (lineBytes < 0 || nextKind > maximum || nextCombined > LIMITS.combined_capture_bytes) { limitClass = lineBytes < 0 ? `${kind}_line_limit` : (nextCombined > LIMITS.combined_capture_bytes ? 'combined_capture_limit' : `${kind}_limit`); void terminateGroup(child); return; }
      writeAll(descriptor, chunk); combinedBytes = nextCombined;
      if (kind === 'stdout') { stdoutBytes = nextKind; stdoutLineBytes = lineBytes; } else { stderrBytes = nextKind; stderrLineBytes = lineBytes; }
    });
    consume(child.stdout, stdoutFd, 'stdout'); consume(child.stderr, stderrFd, 'stderr');
    timer = setTimeout(() => { limitClass = 'runtime_timeout'; void terminateGroup(child); }, runtimeMs);
    child.once('close', (code, signal) => { clearTimeout(timer); closed = true; resolveClose({ code, signal, spawnError }); });
  });
  fsyncSync(stdoutFd); fsyncSync(stderrFd); closeSync(stdoutFd); closeSync(stderrFd); stdoutFd = undefined; stderrFd = undefined;

  if (closeResult.spawnError) {
    const notStarted = { exit_kind: 'not_started', exit_code: null, signal_name: null, signal_number: null };
    safeUnlink(rawStdout); safeUnlink(rawStderr); updateExecutionToken(rootPath, token, 'failed_before_execution', { commandResult: notStarted, harnessResult: harnessResult('spawn_failure', 'spawn_failure') });
    recordTerminalEvent(rootPath, stageId, token, commandCategory, expectedResult, 'failed_before_execution', notStarted); process.exitCode = EXIT.capture; return;
  }
  const commandResult = closeResult.signal ? { exit_kind: 'signal', exit_code: null, signal_name: closeResult.signal, signal_number: signalNumber(closeResult.signal) } : { exit_kind: 'normal', exit_code: closeResult.code, signal_name: null, signal_number: null };
  if (wrapperSignal || limitClass) {
    safeUnlink(rawStdout); safeUnlink(rawStderr); const state = wrapperSignal ? 'interrupted' : 'limit_exceeded'; const detail = wrapperSignal ? 'wrapper_interrupted' : limitClass;
    updateExecutionToken(rootPath, token, state, { commandResult, harnessResult: harnessResult(state, detail, wrapperSignal) });
    recordTerminalEvent(rootPath, stageId, token, commandCategory, expectedResult, state, commandResult); process.exitCode = wrapperSignal ? EXIT.interrupted : EXIT.limit; return;
  }
  if (await checkpoint('before-artifact-sanitization')) {
    safeUnlink(rawStdout); safeUnlink(rawStderr);
    updateExecutionToken(rootPath, token, 'interrupted', { commandResult, harnessResult: harnessResult('interrupted', 'wrapper_interrupted', wrapperSignal) });
    recordTerminalEvent(rootPath, stageId, token, commandCategory, expectedResult, 'interrupted', commandResult); process.exitCode = EXIT.interrupted; return;
  }

  let stdoutSanitized; let stderrSanitized; let stdoutSummary; let stderrSummary;
  const stdoutName = `${token}.stdout.txt`; const stderrName = `${token}.stderr.txt`; const stdoutSummaryName = `${token}.stdout.sanitization.json`; const stderrSummaryName = `${token}.stderr.sanitization.json`;
  try {
    stdoutSanitized = sanitizeContent(readFileSync(rawStdout, 'utf8'), { mode: 'lines' }).output;
    stderrSanitized = sanitizeContent(readFileSync(rawStderr, 'utf8'), { mode: 'lines' }).output;
    stdoutSummary = createSanitizationSummary({ mode: 'lines', artifactPath: stdoutName, output: stdoutSanitized });
    stderrSummary = createSanitizationSummary({ mode: 'lines', artifactPath: stderrName, output: stderrSanitized });
  } catch {
    safeUnlink(rawStdout); safeUnlink(rawStderr); updateExecutionToken(rootPath, token, 'sanitizer_failed', { commandResult, harnessResult: harnessResult('sanitizer_failed', 'sanitizer_rejected') });
    recordTerminalEvent(rootPath, stageId, token, commandCategory, expectedResult, 'sanitizer_failed', commandResult); process.exitCode = EXIT.sanitizer; return;
  }
  safeUnlink(rawStdout); safeUnlink(rawStderr);

  const temporary = [
    [`${token}.stdout.sanitized`, stdoutSanitized], [`${token}.stderr.sanitized`, stderrSanitized],
    [`${token}.stdout.summary.json`, `${canonicalStringify(stdoutSummary)}\n`],
    [`${token}.stderr.summary.json`, `${canonicalStringify(stderrSummary)}\n`],
  ];
  const paths = [];
  try {
    for (const [name, content] of temporary) { const path = join(quarantine, name); const fd = openExclusivePacketFile(rootPath, path); try { writeSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); } paths.push(path); }
    promoteCommandArtifacts(rootPath, stageId, token, [
      { source: `quarantine/${token}.stdout.sanitized`, destination: stdoutName, artifact_class: 'command_stdout', summary_destination: stdoutSummaryName },
      { source: `quarantine/${token}.stderr.sanitized`, destination: stderrName, artifact_class: 'command_stderr', summary_destination: stderrSummaryName },
      { source: `quarantine/${token}.stdout.summary.json`, destination: stdoutSummaryName, artifact_class: 'sanitization_summary', summary_destination: stdoutSummaryName },
      { source: `quarantine/${token}.stderr.summary.json`, destination: stderrSummaryName, artifact_class: 'sanitization_summary', summary_destination: stderrSummaryName },
    ]);
  } catch {
    for (const path of paths) safeUnlink(path); updateExecutionToken(rootPath, token, 'harness_failed_after_execution', { commandResult, harnessResult: harnessResult('harness_failed', 'artifact_promotion_failure') });
    recordTerminalEvent(rootPath, stageId, token, commandCategory, expectedResult, 'harness_failed_after_execution', commandResult, [], 'harness_failed'); process.exitCode = EXIT.evidence; return;
  }

  const mismatch = expectedRows !== null && stdoutSanitized.split('\n').filter((line) => line === `affected_rows=${expectedRows}`).length !== 1;
  const state = mismatch ? 'harness_failed_after_execution' : (closeResult.signal ? 'signaled' : (closeResult.code === 0 ? 'completed' : 'command_failed')); updateExecutionToken(rootPath, token, state, { commandResult, harnessResult: harnessResult(mismatch ? 'affected_rows_mismatch' : 'evidence_complete', mismatch ? 'affected_rows_mismatch' : 'evidence_complete') });
  const artifactPaths = [stdoutName, stderrName, stdoutSummaryName, stderrSummaryName].map((name) => `stages/${stageId}/artifacts/${name}`);
  recordTerminalEvent(rootPath, stageId, token, commandCategory, expectedResult, state, commandResult, artifactPaths, mismatch ? 'affected_rows_mismatch' : null);
  process.exitCode = mismatch ? EXIT.evidence : (commandResult.exit_kind === 'signal' ? 128 + commandResult.signal_number : commandResult.exit_code);
  } finally {
    for (const [name, listener] of listeners) process.off(name, listener);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const safe = safeError(error); process.stderr.write(`${basename(process.argv[1])}: ${safe.code}: ${safe.message}\n`);
    process.exitCode = ['INVALID_ARGUMENTS', 'ALREADY_CLAIMED', 'RETRY_NOT_AUTHORIZED', 'RETRY_TOKEN_MISSING', 'DUPLICATE_RETRY_AUTHORIZATION'].includes(safe.code) ? EXIT.arguments : EXIT.evidence;
  });
}
