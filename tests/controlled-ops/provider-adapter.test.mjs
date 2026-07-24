import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROVIDER_COMMAND_CATEGORY,
  PROVIDER_CONTRACT_VERSION,
  createProviderExecutionPlan,
  providerResultEvidenceLines,
  providerTargetDigest,
  validateCredentialReference,
  validateProviderExecutionPlan,
  validateProviderResult,
} from '../../scripts/controlled-ops/provider-adapter.mjs';
import {
  FAKE_PROVIDER_ADAPTER_ID,
  createFakeProviderTarget,
  executeFakeProviderPlan,
  fakeProviderAdapter,
  prepareFakeProviderPlan,
  simulateFakeProviderReplay,
} from '../../scripts/controlled-ops/fake-provider-adapter.mjs';
import { sanitizeContent, scanCustomerContent, scanSensitiveContent } from '../../scripts/controlled-ops/sanitize.mjs';

function hasCode(code) {
  return (error) => error?.code === code;
}

function validPlan(overrides = {}) {
  return prepareFakeProviderPlan({
    operationId: 'operation-test-1',
    stageId: 'stage-1',
    executionTokenId: 'provider-token',
    approvalReference: 'task:local',
    credentialReference: 'fake:local-ref',
    requestedAction: 'simulate_success',
    ...overrides,
  });
}

test('provider adapter contract creates and validates an exact bounded plan', () => {
  assert.equal(fakeProviderAdapter.adapter_id, FAKE_PROVIDER_ADAPTER_ID);
  const plan = validPlan();
  assert.equal(plan.schema_version, 'servsync-controlled-ops/provider-execution-plan-v1');
  assert.equal(plan.adapter_version, PROVIDER_CONTRACT_VERSION);
  assert.equal(plan.command_category, PROVIDER_COMMAND_CATEGORY);
  assert.equal(validateProviderExecutionPlan(plan), plan);
  assert.match(plan.target_identity_digest, /^[a-f0-9]{64}$/);
  assert.throws(() => validateProviderExecutionPlan({ ...plan, extra: true }), hasCode('INVALID_SCHEMA'));
  assert.throws(() => validateProviderExecutionPlan({ ...plan, plan_digest: '0'.repeat(64) }), hasCode('PROVIDER_PLAN_INVALID'));
});

test('provider adapter rejects unsafe caller-controlled inputs', () => {
  const target = createFakeProviderTarget();
  assert.throws(() => createProviderExecutionPlan({
    adapterId: FAKE_PROVIDER_ADAPTER_ID,
    adapterVersion: PROVIDER_CONTRACT_VERSION,
    operationId: 'operation-test-1',
    stageId: 'stage-1',
    executionTokenId: 'provider-token',
    commandCategory: 'unsupported-category',
    approvalReference: 'task:local',
    credentialReference: 'fake:local-ref',
    target,
    requestedAction: 'simulate_success',
    executionMode: 'dry_run',
    expectedResult: 'completed',
    timeoutMs: 1_000,
  }), hasCode('PROVIDER_PLAN_INVALID'));
  assert.throws(() => validPlan({ approvalReference: 'task:abcdef1234567890' }), hasCode('UNSAFE_CALLER_METADATA'));
  assert.throws(() => validPlan({ credentialReference: `fake:${'a'.repeat(24)}` }), hasCode('UNSAFE_CALLER_METADATA'));
  assert.throws(() => validPlan({ target: { target_classification: 'local-fixture', target_id: 'https://example.com', target_identity_digest: '0'.repeat(64) } }), hasCode('INVALID_PROVIDER_TARGET'));
  assert.throws(() => validPlan({ requestedAction: 'simulate_success;rm-rf' }), hasCode('INVALID_LABEL'));
  assert.throws(() => validateCredentialReference('token:secret'), hasCode('UNSAFE_CALLER_METADATA'));
});

test('target identity digest detects target drift before fake execution', () => {
  const plan = validPlan();
  const drifted = {
    target_classification: 'local-fixture',
    target_id: 'other-target',
    target_identity_digest: providerTargetDigest({
      adapterId: FAKE_PROVIDER_ADAPTER_ID,
      targetClassification: 'local-fixture',
      targetId: 'other-target',
    }),
  };
  assert.throws(() => executeFakeProviderPlan(plan, { currentTarget: drifted }), hasCode('PROVIDER_TARGET_DRIFT'));
  assert.throws(() => executeFakeProviderPlan(validPlan({ requestedAction: 'target_drift' })), hasCode('PROVIDER_TARGET_DRIFT'));
});

test('fake provider produces deterministic bounded classifications without network or live commands', () => {
  const cases = [
    ['simulate_success', 'success', 'simulated_change'],
    ['simulate_rejection', 'provider_rejected', 'rejected'],
    ['simulate_timeout', 'timeout', 'unknown'],
    ['simulate_cancellation', 'cancelled', 'unknown'],
    ['simulate_ambiguous', 'ambiguous_success', 'unknown'],
    ['credential_rejected', 'credential_rejected', 'rejected'],
  ];
  for (const [action, classification, affected] of cases) {
    const result = executeFakeProviderPlan(validPlan({ requestedAction: action }), {
      startedUtc: '2026-07-24T00:00:00.000Z',
      completedUtc: '2026-07-24T00:00:00.000Z',
    });
    assert.equal(result.result_classification, classification);
    assert.equal(result.affected_result, affected);
    assert.equal(scanSensitiveContent(JSON.stringify(result)).length, 0);
    assert.equal(scanCustomerContent(JSON.stringify(result)).length, 0);
    assert.equal(validateProviderResult(result), result);
    assert.doesNotThrow(() => sanitizeContent(providerResultEvidenceLines(result), { mode: 'lines' }));
  }
  assert.equal(simulateFakeProviderReplay(validPlan()).result_classification, 'success');
  assert.throws(() => executeFakeProviderPlan(validPlan({ requestedAction: 'malformed_result' })), hasCode('PROVIDER_PLAN_INVALID'));
});
