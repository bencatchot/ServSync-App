import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { readJson } from '../../scripts/controlled-ops/internal.mjs';
import { fakeCommand, makePacket, runWrapper, wrapperPath } from './helpers.mjs';

test('wrapper preserves zero and nonzero exit codes and separates output', () => {
  for (const [token, args, expected] of [['zero', ['stderr'], 0], ['seven', ['exit', '7'], 7], ['high', ['exit', '143'], 143]]) {
    const packet = makePacket();
    try {
      const result = runWrapper(packet.root, token, args);
      assert.equal(result.status, expected, result.stderr);
      const artifacts = join(packet.root, 'stages', 'stage-1', 'artifacts');
      assert.ok(existsSync(join(artifacts, `${token}.stdout.txt`)));
      assert.ok(existsSync(join(artifacts, `${token}.stderr.txt`)));
      assert.deepEqual(readdirSync(join(packet.root, 'quarantine')), []);
      const tokenRecord = readJson(join(packet.root, 'tokens', `${token}.json`));
      assert.equal(tokenRecord.command_result.exit_kind, 'normal');
      assert.equal(tokenRecord.command_result.exit_code, expected);
    } finally { packet.cleanup(); }
  }
});

test('quarantined raw streams are mode 600 while a command is running', async () => {
  const packet = makePacket();
  try {
    const child = spawn('bash', [wrapperPath,
      '--operation-root', packet.root, '--stage', 'stage-1', '--token', 'delayed', '--category', 'fake-command',
      '--expected', 'completed', '--', process.execPath, fakeCommand, 'delay', '400'],
    { stdio: 'pipe', env: { PATH: process.env.PATH ?? '' } });
    const exitPromise = new Promise((resolve) => child.once('exit', resolve));
    const stdoutRaw = join(packet.root, 'quarantine', 'delayed.stdout.raw');
    const stderrRaw = join(packet.root, 'quarantine', 'delayed.stderr.raw');
    for (let attempt = 0; attempt < 50 && (!existsSync(stdoutRaw) || !existsSync(stderrRaw)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(statSync(stdoutRaw).mode & 0o777, 0o600);
    assert.equal(statSync(stderrRaw).mode & 0o777, 0o600);
    const exitCode = await exitPromise;
    assert.equal(exitCode, 0);
    assert.deepEqual(readdirSync(join(packet.root, 'quarantine')), []);
  } finally { packet.cleanup(); }
});

test('a token executes once and duplicate use fails before command execution', () => {
  const packet = makePacket();
  const counter = join(packet.parent, 'counter.txt');
  try {
    assert.equal(runWrapper(packet.root, 'once', ['clean', '', counter]).status, 0);
    assert.equal(runWrapper(packet.root, 'once', ['clean', '', counter]).status, 90);
    assert.equal(readFileSync(counter, 'utf8').trim().split('\n').length, 1);
  } finally { packet.cleanup(); }
});

test('sanitizer failure removes quarantine and never promotes raw output or retries', () => {
  const packet = makePacket();
  const counter = join(packet.parent, 'counter.txt');
  try {
    const result = runWrapper(packet.root, 'secret', ['secret', '', counter]);
    assert.equal(result.status, 92);
    assert.deepEqual(readdirSync(join(packet.root, 'quarantine')), []);
    assert.deepEqual(readdirSync(join(packet.root, 'stages', 'stage-1', 'artifacts')), []);
    assert.equal(readJson(join(packet.root, 'tokens', 'secret.json')).state, 'sanitizer_failed');
    assert.equal(readFileSync(counter, 'utf8').trim().split('\n').length, 1);
    const retained = readFileSync(join(packet.root, 'events.ndjson'), 'utf8');
    assert.equal(retained.includes('Bearer'), false);
  } finally { packet.cleanup(); }
});

test('authorized retry uses a new token while an implicit retry is denied', () => {
  const packet = makePacket();
  try {
    assert.equal(runWrapper(packet.root, 'first', ['exit', '7']).status, 7);
    const denied = runWrapper(packet.root, 'retry-denied', ['clean'], ['--retry-of', 'first']);
    assert.equal(denied.status, 90);
    const allowed = runWrapper(packet.root, 'retry-approved', ['clean'], ['--retry-of', 'first', '--retry-authorization', 'approval-operator']);
    assert.equal(allowed.status, 0, allowed.stderr);
  } finally { packet.cleanup(); }
});

test('wrapper rejects sourcing and works when launched by zsh', { skip: spawnSync('zsh', ['--version']).error ? 'zsh is unavailable' : false }, () => {
  const sourced = spawnSync('bash', ['-c', `source "$1"`, '_', wrapperPath], { encoding: 'utf8' });
  assert.equal(sourced.status, 94);
  const packet = makePacket();
  try {
    const result = spawnSync('zsh', ['-c', '"$@"', '_', wrapperPath,
      '--operation-root', packet.root, '--stage', 'stage-1', '--token', 'zsh-run', '--category', 'fake-command',
      '--expected', 'completed', '--', process.execPath, fakeCommand, 'clean'], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
    assert.equal(result.status, 0, result.stderr);
  } finally { packet.cleanup(); }
});

test('signal termination remains distinguishable from harness failure', () => {
  const packet = makePacket();
  try {
    const result = runWrapper(packet.root, 'signal', ['signal']);
    assert.equal(result.status, 143, result.stderr);
    const token = readJson(join(packet.root, 'tokens', 'signal.json'));
    assert.equal(token.state, 'signaled');
    assert.equal(token.command_result.exit_kind, 'signal');
    assert.equal(token.command_result.signal_name, 'SIGTERM');
  } finally { packet.cleanup(); }
});

test('affected-row assertions are explicit and fail without rerunning the command', () => {
  const packet = makePacket();
  const counter = join(packet.parent, 'counter.txt');
  try {
    const pass = runWrapper(packet.root, 'rows-pass', ['affected', '1', counter], ['--expected-affected-rows', '1']);
    assert.equal(pass.status, 0, pass.stderr);
    const fail = runWrapper(packet.root, 'rows-fail', ['affected', '2', counter], ['--expected-affected-rows', '1']);
    assert.equal(fail.status, 93, fail.stderr);
    assert.equal(readFileSync(counter, 'utf8').trim().split('\n').length, 2);
    assert.equal(readJson(join(packet.root, 'tokens', 'rows-fail.json')).state, 'harness_failed_after_execution');
  } finally { packet.cleanup(); }
});
