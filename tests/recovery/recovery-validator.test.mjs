import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRecoveryTarget,
  catalogSummary,
  validationStatus,
} from '../../scripts/recovery/validate-restored-project.mjs';

test('recovery target guard rejects every protected ServSync environment', () => {
  for (const projectRef of ['uqgtheclhxqlnjpfmheq', 'bdytwgejqnlblhrnqxkp', 'zpzdkoaubyjtsomccxya']) {
    assert.throws(() => assertRecoveryTarget({ id: projectRef, name: 'servsync-recovery-drill-test', status: 'ACTIVE_HEALTHY' }, projectRef), /refuses Production, Demo, and Sandbox/);
  }
});

test('recovery target guard requires exact identity, prefix, and healthy state', () => {
  assert.throws(() => assertRecoveryTarget({ id: 'other', name: 'servsync-recovery-drill-test', status: 'ACTIVE_HEALTHY' }, 'expected'), /exact requested project ref/);
  assert.throws(() => assertRecoveryTarget({ id: 'expected', name: 'ordinary-project', status: 'ACTIVE_HEALTHY' }, 'expected'), /prefix/);
  assert.throws(() => assertRecoveryTarget({ id: 'expected', name: 'servsync-recovery-drill-test', status: 'COMING_UP' }, 'expected'), /ACTIVE_HEALTHY/);
  assert.doesNotThrow(() => assertRecoveryTarget({ id: 'expected', name: 'servsync-recovery-drill-test', status: 'ACTIVE_HEALTHY' }, 'expected'));
});

test('catalog summary is deterministic and validates the snapshot contract', () => {
  const snapshot = {
    snapshotVersion: 2,
    relations: [], managedRelations: [], columns: [], constraints: [], indexes: [], triggers: [],
    policies: [], functions: [], functionGrants: [], tableGrants: [], columnGrants: [], defaultAcls: [],
  };
  assert.deepEqual(catalogSummary(snapshot), {
    fingerprint: '9ff2aed824179d8bc9945ce19793f022a5d7ed9d8c099ed9858f2156a593c9c8',
    counts: {
      relations: 0, managedRelations: 0, columns: 0, constraints: 0, indexes: 0, triggers: 0,
      policies: 0, functions: 0, functionGrants: 0, tableGrants: 0, columnGrants: 0, defaultAcls: 0,
    },
  });
  assert.throws(() => catalogSummary({ snapshotVersion: 1 }), /contract/);
});

test('validation status retains relationship and financial findings', () => {
  assert.equal(validationStatus({ relationshipViolations: { orphan: 0 }, financialViolations: { mismatch: 0 } }), 'PASS');
  assert.equal(validationStatus({ relationshipViolations: { orphan: 1 }, financialViolations: { mismatch: 0 } }), 'PASS_WITH_FINDINGS');
  assert.equal(validationStatus({ relationshipViolations: { orphan: 0 }, financialViolations: { mismatch: 1 } }), 'PASS_WITH_FINDINGS');
});
