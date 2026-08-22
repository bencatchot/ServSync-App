import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import contract from '../../config/runtime-environment-parity.json' with { type: 'json' };
import { safeParitySummary, validateRuntimeParity } from '../../scripts/runtime-parity/lib.mjs';

function snapshot(environment) {
  const expected = contract.environments[environment];
  const values = {
    VITE_SUPABASE_URL: `https://${expected.supabaseProjectRef}.supabase.co`,
    VITE_CONTRACTOR_WORK_UI_ENABLED: 'true',
    VITE_DRAFT_JOB_UI_ENABLED: 'true',
    VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED: 'true',
    VITE_DURABLE_TRADE_SECTIONS_UI_ENABLED: 'false',
    VITE_CONTRACTOR_MARKETING_UI_ENABLED: 'false',
  };
  if (environment === 'demo') Object.assign(values, contract.intentionalDemoDifferences);
  return {
    alias: expected.alias,
    projectId: expected.vercelProjectId,
    projectName: expected.vercelProjectName,
    gitCommitSha: 'a'.repeat(40),
    values,
    configuredKeys: Object.keys(values),
  };
}

function validSnapshots() {
  return { production: snapshot('production'), demo: snapshot('demo') };
}

test('accepts commit, identity, workflow, Supabase isolation, and fail-closed parity', () => {
  const result = validateRuntimeParity(contract, validSnapshots());
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(safeParitySummary(result).note.includes('configuration key names'), true);
});

test('rejects active commit drift and project identity swaps', () => {
  const commits = validSnapshots();
  commits.demo.gitCommitSha = 'b'.repeat(40);
  assert.match(validateRuntimeParity(contract, commits).errors.join('\n'), /same Git commit/i);

  const projects = validSnapshots();
  projects.demo.projectId = projects.production.projectId;
  assert.match(validateRuntimeParity(contract, projects).errors.join('\n'), /fixed environment identity/i);
});

test('rejects missing, disabled, or unequal Production workflow flags', () => {
  const missing = validSnapshots();
  delete missing.demo.values.VITE_CONTRACTOR_WORK_UI_ENABLED;
  assert.match(validateRuntimeParity(contract, missing).errors.join('\n'), /required workflow flag is missing/i);

  const disabled = validSnapshots();
  disabled.demo.values.VITE_DRAFT_JOB_UI_ENABLED = 'false';
  assert.match(validateRuntimeParity(contract, disabled).errors.join('\n'), /values differ/i);
});

test('rejects equal, swapped, or malformed Supabase targets', () => {
  for (const demoUrl of [
    `https://${contract.environments.production.supabaseProjectRef}.supabase.co`,
    'https://example.com',
  ]) {
    const snapshots = validSnapshots();
    snapshots.demo.values.VITE_SUPABASE_URL = demoUrl;
    assert.match(validateRuntimeParity(contract, snapshots).errors.join('\n'), /expected Supabase project/i);
  }
});

test('rejects unapproved presentation configuration and enabled external effects', () => {
  const presentation = validSnapshots();
  presentation.demo.values.VITE_SERVSYNC_DEMO_PRESENTATION_ENABLED = 'false';
  assert.match(validateRuntimeParity(contract, presentation).errors.join('\n'), /intentional difference/i);

  const delivery = validSnapshots();
  delivery.demo.values.EMAIL_ENABLED = 'true';
  assert.match(validateRuntimeParity(contract, delivery).errors.join('\n'), /not explicitly disabled/i);

  const credential = validSnapshots();
  credential.demo.configuredKeys.push('RESEND_API_KEY');
  assert.match(validateRuntimeParity(contract, credential).errors.join('\n'), /must be absent/i);
});

test('live checker never bulk-decrypts unrelated project configuration', () => {
  const source = readFileSync(new URL('../../scripts/runtime-parity/check-live.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /env\?decrypt=true/);
  assert.match(source, /\/v10\/projects\/\$\{encodeURIComponent\(expected\.vercelProjectId\)\}\/env/);
  assert.match(source, /\/v1\/projects\/\$\{encodeURIComponent\(expected\.vercelProjectId\)\}\/env\/\$\{encodeURIComponent\(entryId\)\}/);
});
