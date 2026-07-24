import {
  EvidenceError,
  canonicalStringify,
  utcNow,
} from './internal.mjs';
import {
  PROVIDER_COMMAND_CATEGORY,
  PROVIDER_CONTRACT_VERSION,
  createProviderExecutionPlan,
  buildProviderResult,
  providerTargetDigest,
  validateProviderAdapter,
  validateProviderExecutionPlan,
  validateProviderTarget,
} from './provider-adapter.mjs';

export const FAKE_PROVIDER_ADAPTER_ID = 'local_fake_provider';
export const FAKE_PROVIDER_ACTIONS = Object.freeze([
  'simulate_success',
  'simulate_rejection',
  'simulate_timeout',
  'simulate_cancellation',
  'simulate_ambiguous',
  'target_drift',
  'credential_rejected',
  'malformed_result',
]);

export const fakeProviderAdapter = validateProviderAdapter({
  schema_version: 'servsync-controlled-ops/provider-adapter-v1',
  adapter_id: FAKE_PROVIDER_ADAPTER_ID,
  adapter_version: PROVIDER_CONTRACT_VERSION,
  supported_command_categories: [PROVIDER_COMMAND_CATEGORY],
  supported_execution_modes: ['dry_run', 'simulated_mutation'],
});

export function createFakeProviderTarget({ targetClassification = 'local-fixture', targetId = 'local-fake-target' } = {}) {
  return {
    target_classification: targetClassification,
    target_id: targetId,
    target_identity_digest: providerTargetDigest({
      adapterId: FAKE_PROVIDER_ADAPTER_ID,
      targetClassification,
      targetId,
    }),
  };
}

export function prepareFakeProviderPlan(fields = {}) {
  const target = fields.target ?? createFakeProviderTarget();
  return createProviderExecutionPlan({
    adapterId: FAKE_PROVIDER_ADAPTER_ID,
    adapterVersion: PROVIDER_CONTRACT_VERSION,
    commandCategory: PROVIDER_COMMAND_CATEGORY,
    executionMode: 'dry_run',
    expectedResult: 'completed',
    timeoutMs: 1_000,
    ...fields,
    target,
  });
}

function currentTargetFromOptions(options) {
  if (options.currentTarget === undefined) return null;
  return validateProviderTarget(options.currentTarget, FAKE_PROVIDER_ADAPTER_ID);
}

function classificationForAction(action) {
  switch (action) {
    case 'simulate_success':
      return { resultClassification: 'success', timeoutClassification: null, cancellationClassification: null, affectedResult: 'simulated_change', safeProviderReference: 'fake_success' };
    case 'simulate_rejection':
      return { resultClassification: 'provider_rejected', timeoutClassification: null, cancellationClassification: null, affectedResult: 'rejected', safeProviderReference: 'fake_rejection' };
    case 'simulate_timeout':
      return { resultClassification: 'timeout', timeoutClassification: 'timed_out', cancellationClassification: null, affectedResult: 'unknown', safeProviderReference: 'fake_timeout' };
    case 'simulate_cancellation':
      return { resultClassification: 'cancelled', timeoutClassification: null, cancellationClassification: 'cancelled', affectedResult: 'unknown', safeProviderReference: 'fake_cancelled' };
    case 'simulate_ambiguous':
      return { resultClassification: 'ambiguous_success', timeoutClassification: null, cancellationClassification: null, affectedResult: 'unknown', safeProviderReference: 'fake_ambiguous' };
    case 'credential_rejected':
      return { resultClassification: 'credential_rejected', timeoutClassification: null, cancellationClassification: null, affectedResult: 'rejected', safeProviderReference: 'fake_credfail' };
    default:
      throw new EvidenceError('FAKE_PROVIDER_ACTION_UNSUPPORTED', 'Fake provider action is unsupported.');
  }
}

export function executeFakeProviderPlan(plan, options = {}) {
  const validated = validateProviderExecutionPlan(plan);
  if (!FAKE_PROVIDER_ACTIONS.includes(validated.requested_action)) {
    throw new EvidenceError('FAKE_PROVIDER_ACTION_UNSUPPORTED', 'Fake provider action is unsupported.');
  }
  const currentTarget = currentTargetFromOptions(options);
  if (currentTarget && currentTarget.target_identity_digest !== validated.target_identity_digest) {
    throw new EvidenceError('PROVIDER_TARGET_DRIFT', 'Fake provider target no longer matches the approved target.');
  }
  if (validated.requested_action === 'target_drift') {
    throw new EvidenceError('PROVIDER_TARGET_DRIFT', 'Fake provider target drift was detected before execution.');
  }
  if (validated.requested_action === 'malformed_result') {
    return buildProviderResult({
      plan: { ...validated, plan_digest: '0'.repeat(64) },
      startedUtc: utcNow(),
      completedUtc: utcNow(),
      ...classificationForAction('simulate_success'),
    });
  }
  const startedUtc = options.startedUtc ?? utcNow();
  const completedUtc = options.completedUtc ?? startedUtc;
  return buildProviderResult({
    plan: validated,
    startedUtc,
    completedUtc,
    ...classificationForAction(validated.requested_action),
  });
}

export function simulateFakeProviderReplay(plan) {
  const first = executeFakeProviderPlan(plan, { startedUtc: '2026-07-24T00:00:00.000Z', completedUtc: '2026-07-24T00:00:00.000Z' });
  const second = executeFakeProviderPlan(plan, { startedUtc: '2026-07-24T00:00:00.000Z', completedUtc: '2026-07-24T00:00:00.000Z' });
  if (canonicalStringify(first) !== canonicalStringify(second)) {
    throw new EvidenceError('FAKE_PROVIDER_NONDETERMINISTIC', 'Fake provider replay is nondeterministic.');
  }
  return first;
}
