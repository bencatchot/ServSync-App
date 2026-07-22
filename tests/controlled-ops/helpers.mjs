import { chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStage, initializeOperation } from '../../scripts/controlled-ops/evidence.mjs';

export const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const wrapperPath = join(repoRoot, 'scripts/controlled-ops/run-command.sh');
export const evidenceCli = join(repoRoot, 'scripts/controlled-ops/evidence.mjs');
export const sanitizerCli = join(repoRoot, 'scripts/controlled-ops/sanitize.mjs');
export const fakeCommand = join(repoRoot, 'tests/controlled-ops/fixtures/fake-command.mjs');

export function makePacket(stageId = 'stage-1', operationId = 'operation-test-1') {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'servsync-controlled-ops-test-')));
  const root = join(parent, 'packet');
  initializeOperation(root, {
    operationId,
    operationClassification: 'local-test',
    targetClassification: 'local-fixture',
    authorizationReference: 'test-authorization',
    createdAt: new Date(Date.now() - 5_000).toISOString(),
  });
  createStage(root, stageId);
  return { root, parent, cleanup: () => {
    makeWritable(parent);
    rmSync(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
  } };
}

function makeWritable(path) {
  let info;
  try { info = lstatSync(path); } catch { return; }
  if (info.isDirectory() && !info.isSymbolicLink()) {
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) makeWritable(join(path, name));
  } else if (!info.isSymbolicLink()) {
    chmodSync(path, 0o600);
  }
}

export function runWrapper(root, token, fakeArguments = ['clean'], extraArguments = []) {
  return spawnSync('bash', [
    wrapperPath,
    '--operation-root', root,
    '--stage', 'stage-1',
    '--token', token,
    '--category', 'fake-command',
    '--expected', 'completed',
    ...extraArguments,
    '--', process.execPath, fakeCommand, ...fakeArguments,
  ], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
}

export function fileText(path) {
  return readFileSync(path, 'utf8');
}

export function writeSafeArtifact(root, name = 'evidence.txt', content = 'status=ok\n') {
  const input = join(root, 'quarantine', `${name}.input`);
  const output = join(root, 'stages', 'stage-1', 'artifacts', name);
  const summary = join(root, 'stages', 'stage-1', 'artifacts', `${name}.sanitization.json`);
  writeFileSync(input, content, { mode: 0o600 });
  const result = spawnSync(process.execPath, [sanitizerCli, '--input', input, '--output', output, '--summary', summary, '--artifact-path', name, '--mode', 'lines'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Test artifact sanitization failed.');
  rmSync(input);
  return { output, summary, summaryName: `${name}.sanitization.json` };
}
