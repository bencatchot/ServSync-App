import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RoleSmokeFailure,
  createRoleSmokeReport,
  preflightRoleSmoke,
  requireSmokeInvariant,
  roleSmokeTrigger,
  safeErrorSummary,
  validateBackupHealth,
} from '../../scripts/operational-smoke/roleSmokeContract.ts';

function sandboxEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    SERVSYNC_ROLE_SMOKE_TARGET: 'sandbox',
    ROLE_SMOKE_SUPABASE_PROJECT_REF: 'zpzdkoaubyjtsomccxya',
    ROLE_SMOKE_SUPABASE_URL: 'https://zpzdkoaubyjtsomccxya.supabase.co',
    ROLE_SMOKE_SUPABASE_ANON_KEY: 'test-anon-key',
    ROLE_SMOKE_APP_URL: 'http://127.0.0.1:4173',
  };
  for (const [role, prefix] of [
    ['OWNER', 'TEST_CONTRACTOR'],
    ['ADMIN', 'TEST_CONTRACTOR_ADMIN'],
    ['OFFICE', 'TEST_CONTRACTOR_OFFICE'],
    ['FIELD', 'TEST_CONTRACTOR_FIELD_TECH'],
    ['VIEWER', 'TEST_CONTRACTOR_VIEWER'],
    ['OTHER', 'TEST_CONTRACTOR_B'],
    ['HOMEOWNER', 'TEST_HOMEOWNER'],
    ['HOMEOWNER_B', 'TEST_HOMEOWNER_B'],
  ]) {
    env[`${prefix}_EMAIL`] = `${role.toLowerCase()}@example.test`;
    env[`${prefix}_PASSWORD`] = `password-${role}`;
  }
  return env;
}

test('preflight accepts the exact Sandbox identity and complete distinct role pairs', () => {
  const result = preflightRoleSmoke(sandboxEnv());
  assert.equal(result.target, 'sandbox');
  assert.equal(result.roles.length, 8);
  assert.equal(result.projectRef, 'zpzdkoaubyjtsomccxya');
});

test('preflight fails closed for missing credentials, Production, mismatch, and duplicate identities', () => {
  const missing = sandboxEnv();
  delete missing.TEST_CONTRACTOR_VIEWER_PASSWORD;
  assert.throws(() => preflightRoleSmoke(missing), (error: unknown) => error instanceof RoleSmokeFailure && error.category === 'CREDENTIAL FAILURE');

  const production = sandboxEnv();
  production.ROLE_SMOKE_SUPABASE_PROJECT_REF = 'uqgtheclhxqlnjpfmheq';
  production.ROLE_SMOKE_SUPABASE_URL = 'https://uqgtheclhxqlnjpfmheq.supabase.co';
  assert.throws(() => preflightRoleSmoke(production), /refuses the Production/);

  const mismatch = sandboxEnv();
  mismatch.ROLE_SMOKE_SUPABASE_URL = 'https://bdytwgejqnlblhrnqxkp.supabase.co';
  assert.throws(() => preflightRoleSmoke(mismatch), /does not match sandbox/);

  const duplicate = sandboxEnv();
  duplicate.TEST_CONTRACTOR_VIEWER_EMAIL = duplicate.TEST_CONTRACTOR_EMAIL;
  assert.throws(() => preflightRoleSmoke(duplicate), /same account/);

  const sharedAcrossEnvironments = sandboxEnv();
  sharedAcrossEnvironments.DEMO_CONTRACTOR_EMAIL = sharedAcrossEnvironments.TEST_CONTRACTOR_EMAIL;
  sharedAcrossEnvironments.DEMO_CONTRACTOR_PASSWORD = sharedAcrossEnvironments.TEST_CONTRACTOR_PASSWORD;
  assert.throws(() => preflightRoleSmoke(sharedAcrossEnvironments), /shared across environment classes/);
});

test('backup-health validation enforces Production identity, SHA, completeness, and 36-hour age', () => {
  const healthy = {
    status: 'healthy',
    sourceProjectRef: 'uqgtheclhxqlnjpfmheq',
    lastSuccessfulBackupAt: '2026-08-14T04:19:00.000Z',
    lastRunId: 'run',
    manifestSha256: 'a'.repeat(64),
    metrics: { failedObjectCount: 0, sourceObjectCount: 4, backedUpObjectCount: 4 },
  };
  assert.doesNotThrow(() => validateBackupHealth(healthy, new Date('2026-08-15T04:00:00.000Z')));
  assert.throws(
    () => validateBackupHealth(healthy, new Date('2026-08-16T17:00:00.000Z')),
    (error: unknown) => error instanceof RoleSmokeFailure && error.category === 'BACKUP HEALTH FAILURE',
  );
  assert.throws(() => validateBackupHealth({ ...healthy, metrics: { ...healthy.metrics, failedObjectCount: 1 } }), /incomplete/);
});

test('report serialization is bounded and error summaries redact identity and secret patterns', () => {
  const summary = safeErrorSummary(new Error('user@example.test token eyJabcdefghijklmnopqrstuvwxyz record 10000000-0000-4000-8000-000000000001'));
  assert.equal(summary.includes('user@example.test'), false);
  assert.equal(summary.includes('eyJabcdefghijklmnopqrstuvwxyz'), false);
  assert.equal(summary.includes('10000000-0000-4000-8000-000000000001'), false);

  const report = createRoleSmokeReport({
    runId: 'run-1',
    startedAt: '2026-08-14T00:00:00.000Z',
    completedAt: '2026-08-14T00:01:00.000Z',
    environment: 'sandbox',
    checks: [
      { name: 'owner_auth', status: 'pass', summary: 'Verified.' },
      { name: 'fixture', status: 'fail', category: 'FIXTURE FAILURE', summary: 'Fixture missing.' },
    ],
  });
  assert.deepEqual({ status: report.status, passed: report.passed, failed: report.failed }, { status: 'fail', passed: 1, failed: 1 });
});

test('scheduler provenance distinguishes natural schedule, manual dispatch, and local runs', () => {
  assert.equal(roleSmokeTrigger({ GITHUB_EVENT_NAME: 'schedule' }), 'schedule');
  assert.equal(roleSmokeTrigger({ GITHUB_EVENT_NAME: 'workflow_dispatch' }), 'workflow_dispatch');
  assert.equal(roleSmokeTrigger({}), 'local');
  assert.throws(() => roleSmokeTrigger({ GITHUB_EVENT_NAME: 'pull_request' }), /unexpected GitHub trigger/);
});

test('missing fixture and wrong role simulations retain meaningful categories', () => {
  assert.throws(
    () => requireSmokeInvariant(false, 'FIXTURE FAILURE', 'fixture', 'Fixture missing.'),
    (error: unknown) => error instanceof RoleSmokeFailure && error.category === 'FIXTURE FAILURE',
  );
  assert.throws(
    () => requireSmokeInvariant(false, 'IDENTITY FAILURE', 'identity', 'Role mismatch.'),
    (error: unknown) => error instanceof RoleSmokeFailure && error.category === 'IDENTITY FAILURE',
  );
});
