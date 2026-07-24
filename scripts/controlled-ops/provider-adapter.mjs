import {
  EvidenceError,
  LIMITS,
  assertExactObject,
  canonicalStringify,
  sha256,
  utcNow,
  validateAuthorizationReference,
  validateCommandCategory,
  validateControlledSlug,
  validateExpectedResult,
  validateTargetClassification,
  validateTimestamp,
} from './internal.mjs';
import { scanCustomerContent, scanSensitiveContent } from './sanitize.mjs';

export const PROVIDER_ADAPTER_SCHEMA = 'servsync-controlled-ops/provider-adapter-v1';
export const PROVIDER_PLAN_SCHEMA = 'servsync-controlled-ops/provider-execution-plan-v1';
export const PROVIDER_RESULT_SCHEMA = 'servsync-controlled-ops/provider-result-v1';
export const PROVIDER_CONTRACT_VERSION = '2d-a.1.0';
export const PROVIDER_COMMAND_CATEGORY = 'provider-operation';

export const PROVIDER_EXECUTION_MODES = Object.freeze(['dry_run', 'simulated_mutation']);
export const PROVIDER_RESULT_CLASSIFICATIONS = Object.freeze([
  'success',
  'provider_rejected',
  'timeout',
  'cancelled',
  'ambiguous_success',
  'target_drift',
  'credential_rejected',
]);
export const PROVIDER_AFFECTED_RESULTS = Object.freeze(['none', 'simulated_change', 'rejected', 'unknown']);

const PLAN_FIELDS = [
  'schema_version',
  'adapter_id',
  'adapter_version',
  'operation_id',
  'stage_id',
  'execution_token_id',
  'command_category',
  'approval_reference',
  'credential_reference',
  'target_classification',
  'target_id',
  'target_identity_digest',
  'requested_action',
  'execution_mode',
  'expected_result',
  'timeout_ms',
  'plan_digest',
];

const RESULT_FIELDS = [
  'schema_version',
  'adapter_id',
  'adapter_version',
  'operation_id',
  'stage_id',
  'execution_token_id',
  'command_category',
  'approval_reference',
  'credential_reference',
  'target_classification',
  'target_id',
  'target_identity_digest',
  'requested_action',
  'execution_mode',
  'started_utc',
  'completed_utc',
  'result_classification',
  'timeout_classification',
  'cancellation_classification',
  'affected_result',
  'safe_provider_reference',
  'evidence_digest',
  'privacy_scan',
];

function rejectOpaqueValue(value, fieldName) {
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(value)
    || /^[a-f0-9]{16,}$/i.test(value.replaceAll('-', ''))
    || /^[A-Za-z0-9_+/=-]{24,}$/.test(value)) {
    throw new EvidenceError('UNSAFE_CALLER_METADATA', `${fieldName} must be a bounded non-secret reference.`);
  }
}

export function validateCredentialReference(value, fieldName = 'credential reference') {
  if (typeof value !== 'string' || value.length > 40 || value.normalize('NFC') !== value) {
    throw new EvidenceError('UNSAFE_CALLER_METADATA', `${fieldName} must be a bounded non-secret credential reference.`);
  }
  const match = /^(none|fake|vault):([a-z0-9][a-z0-9-]{1,23})$/.exec(value);
  if (!match) throw new EvidenceError('UNSAFE_CALLER_METADATA', `${fieldName} must use an approved non-secret reference type.`);
  const compact = match[2].replaceAll('-', '');
  if ((compact.length >= 16 && /[a-z]/.test(compact) && /\d/.test(compact)) || /^[a-f0-9]{16,}$/i.test(compact)) {
    throw new EvidenceError('UNSAFE_CALLER_METADATA', `${fieldName} must not contain opaque random-looking material.`);
  }
  rejectOpaqueValue(value, fieldName);
  return value;
}

export function validateProviderAdapter(adapter) {
  assertExactObject(adapter, ['schema_version', 'adapter_id', 'adapter_version', 'supported_command_categories', 'supported_execution_modes'], [], 'provider adapter');
  if (adapter.schema_version !== PROVIDER_ADAPTER_SCHEMA || adapter.adapter_version !== PROVIDER_CONTRACT_VERSION) {
    throw new EvidenceError('PROVIDER_ADAPTER_INVALID', 'Provider adapter schema or version is invalid.');
  }
  validateControlledSlug(adapter.adapter_id, 'provider adapter ID', { allowUnderscore: true });
  if (!Array.isArray(adapter.supported_command_categories)
    || adapter.supported_command_categories.length === 0
    || adapter.supported_command_categories.length > 8
    || !adapter.supported_command_categories.includes(PROVIDER_COMMAND_CATEGORY)) {
    throw new EvidenceError('PROVIDER_ADAPTER_INVALID', 'Provider adapter command categories are invalid.');
  }
  adapter.supported_command_categories.forEach((category) => validateCommandCategory(category));
  if (canonicalStringify(adapter.supported_execution_modes) !== canonicalStringify(PROVIDER_EXECUTION_MODES)) {
    throw new EvidenceError('PROVIDER_ADAPTER_INVALID', 'Provider adapter execution modes are invalid.');
  }
  return adapter;
}

export function providerTargetDigest({ adapterId, targetClassification, targetId }) {
  validateControlledSlug(adapterId, 'provider adapter ID', { allowUnderscore: true });
  validateTargetClassification(targetClassification);
  validateControlledSlug(targetId, 'provider target ID', { allowUnderscore: true, maxLength: 64 });
  return sha256(canonicalStringify({
    schema_version: 'servsync-controlled-ops/provider-target-v1',
    adapter_id: adapterId,
    target_classification: targetClassification,
    target_id: targetId,
  }));
}

export function validateProviderTarget(target, adapterId) {
  assertExactObject(target, ['target_classification', 'target_id', 'target_identity_digest'], [], 'provider target');
  if (/[:/?#@\\]/.test(target.target_id)) {
    throw new EvidenceError('INVALID_PROVIDER_TARGET', 'Provider target must be a safe structured identifier, not a URL or path.');
  }
  const expectedDigest = providerTargetDigest({
    adapterId,
    targetClassification: target.target_classification,
    targetId: target.target_id,
  });
  if (target.target_identity_digest !== expectedDigest) {
    throw new EvidenceError('PROVIDER_TARGET_DRIFT', 'Provider target identity does not match the approved target.');
  }
  return { ...target, target_identity_digest: expectedDigest };
}

function validateTimeout(value) {
  if (!Number.isInteger(value) || value < 1 || value > LIMITS.command_runtime_ms) {
    throw new EvidenceError('PROVIDER_PLAN_INVALID', 'Provider timeout is outside the supported local bound.');
  }
  return value;
}

function basePlan(fields) {
  return Object.fromEntries(PLAN_FIELDS.filter((field) => field !== 'plan_digest').map((field) => [field, fields[field]]));
}

function planDigest(fields) {
  return sha256(canonicalStringify(basePlan(fields)));
}

export function createProviderExecutionPlan(fields = {}) {
  assertExactObject(fields, [
    'adapterId',
    'adapterVersion',
    'operationId',
    'stageId',
    'executionTokenId',
    'commandCategory',
    'approvalReference',
    'credentialReference',
    'target',
    'requestedAction',
    'executionMode',
    'expectedResult',
    'timeoutMs',
  ], [], 'provider plan input');
  validateControlledSlug(fields.adapterId, 'provider adapter ID', { allowUnderscore: true });
  if (fields.adapterVersion !== PROVIDER_CONTRACT_VERSION) throw new EvidenceError('PROVIDER_PLAN_INVALID', 'Provider adapter version is unsupported.');
  validateControlledSlug(fields.operationId, 'provider operation ID');
  validateControlledSlug(fields.stageId, 'provider stage ID');
  validateControlledSlug(fields.executionTokenId, 'provider token ID');
  validateCommandCategory(fields.commandCategory);
  if (fields.commandCategory !== PROVIDER_COMMAND_CATEGORY) throw new EvidenceError('PROVIDER_PLAN_INVALID', 'Provider command category is unsupported.');
  validateAuthorizationReference(fields.approvalReference, 'provider approval reference');
  validateCredentialReference(fields.credentialReference, 'provider credential reference');
  validateControlledSlug(fields.requestedAction, 'provider requested action', { allowUnderscore: true });
  validateExpectedResult(fields.expectedResult);
  if (!PROVIDER_EXECUTION_MODES.includes(fields.executionMode)) throw new EvidenceError('PROVIDER_PLAN_INVALID', 'Provider execution mode is unsupported.');
  const target = validateProviderTarget(fields.target, fields.adapterId);
  const plan = {
    schema_version: PROVIDER_PLAN_SCHEMA,
    adapter_id: fields.adapterId,
    adapter_version: fields.adapterVersion,
    operation_id: fields.operationId,
    stage_id: fields.stageId,
    execution_token_id: fields.executionTokenId,
    command_category: fields.commandCategory,
    approval_reference: fields.approvalReference,
    credential_reference: fields.credentialReference,
    target_classification: target.target_classification,
    target_id: target.target_id,
    target_identity_digest: target.target_identity_digest,
    requested_action: fields.requestedAction,
    execution_mode: fields.executionMode,
    expected_result: fields.expectedResult,
    timeout_ms: validateTimeout(fields.timeoutMs),
  };
  return validateProviderExecutionPlan({ ...plan, plan_digest: planDigest(plan) });
}

export function validateProviderExecutionPlan(plan) {
  assertExactObject(plan, PLAN_FIELDS, [], 'provider execution plan');
  if (plan.schema_version !== PROVIDER_PLAN_SCHEMA || plan.adapter_version !== PROVIDER_CONTRACT_VERSION) {
    throw new EvidenceError('PROVIDER_PLAN_INVALID', 'Provider plan schema or version is invalid.');
  }
  validateControlledSlug(plan.adapter_id, 'provider adapter ID', { allowUnderscore: true });
  validateControlledSlug(plan.operation_id, 'provider operation ID');
  validateControlledSlug(plan.stage_id, 'provider stage ID');
  validateControlledSlug(plan.execution_token_id, 'provider token ID');
  validateCommandCategory(plan.command_category);
  if (plan.command_category !== PROVIDER_COMMAND_CATEGORY) throw new EvidenceError('PROVIDER_PLAN_INVALID', 'Provider plan command category is unsupported.');
  validateAuthorizationReference(plan.approval_reference, 'provider approval reference');
  validateCredentialReference(plan.credential_reference, 'provider credential reference');
  const target = validateProviderTarget({
    target_classification: plan.target_classification,
    target_id: plan.target_id,
    target_identity_digest: plan.target_identity_digest,
  }, plan.adapter_id);
  validateControlledSlug(plan.requested_action, 'provider requested action', { allowUnderscore: true });
  validateExpectedResult(plan.expected_result);
  if (!PROVIDER_EXECUTION_MODES.includes(plan.execution_mode)) throw new EvidenceError('PROVIDER_PLAN_INVALID', 'Provider plan execution mode is unsupported.');
  validateTimeout(plan.timeout_ms);
  if (plan.plan_digest !== planDigest({ ...plan, ...target })) throw new EvidenceError('PROVIDER_PLAN_INVALID', 'Provider plan digest does not match the plan.');
  return plan;
}

function privacyScanForRecord(value) {
  const content = canonicalStringify(value);
  const secretFindings = scanSensitiveContent(content).length;
  const customerFindings = scanCustomerContent(content).length;
  return {
    secret_findings: secretFindings,
    customer_content_findings: customerFindings,
    files_scanned: 1,
  };
}

function resultDigest(fields) {
  const withoutDigest = Object.fromEntries(RESULT_FIELDS
    .filter((field) => !['evidence_digest', 'privacy_scan'].includes(field))
    .map((field) => [field, fields[field]]));
  return sha256(canonicalStringify(withoutDigest));
}

export function buildProviderResult(fields = {}) {
  assertExactObject(fields, [
    'plan',
    'startedUtc',
    'completedUtc',
    'resultClassification',
    'timeoutClassification',
    'cancellationClassification',
    'affectedResult',
    'safeProviderReference',
  ], [], 'provider result input');
  const plan = validateProviderExecutionPlan(fields.plan);
  validateTimestamp(fields.startedUtc, 'provider started timestamp');
  validateTimestamp(fields.completedUtc, 'provider completed timestamp');
  if (Date.parse(fields.completedUtc) < Date.parse(fields.startedUtc)) throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider result timestamp regressed.');
  if (!PROVIDER_RESULT_CLASSIFICATIONS.includes(fields.resultClassification)) throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider result classification is invalid.');
  if (fields.timeoutClassification !== null && !['timed_out'].includes(fields.timeoutClassification)) throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider timeout classification is invalid.');
  if (fields.cancellationClassification !== null && !['cancelled'].includes(fields.cancellationClassification)) throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider cancellation classification is invalid.');
  if (!PROVIDER_AFFECTED_RESULTS.includes(fields.affectedResult)) throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider affected result is invalid.');
  validateControlledSlug(fields.safeProviderReference, 'provider safe reference', { allowUnderscore: true, maxLength: 64 });
  const result = {
    schema_version: PROVIDER_RESULT_SCHEMA,
    adapter_id: plan.adapter_id,
    adapter_version: plan.adapter_version,
    operation_id: plan.operation_id,
    stage_id: plan.stage_id,
    execution_token_id: plan.execution_token_id,
    command_category: plan.command_category,
    approval_reference: plan.approval_reference,
    credential_reference: plan.credential_reference,
    target_classification: plan.target_classification,
    target_id: plan.target_id,
    target_identity_digest: plan.target_identity_digest,
    requested_action: plan.requested_action,
    execution_mode: plan.execution_mode,
    started_utc: fields.startedUtc,
    completed_utc: fields.completedUtc,
    result_classification: fields.resultClassification,
    timeout_classification: fields.timeoutClassification,
    cancellation_classification: fields.cancellationClassification,
    affected_result: fields.affectedResult,
    safe_provider_reference: fields.safeProviderReference,
  };
  const withDigest = { ...result, evidence_digest: resultDigest(result) };
  const privacyScan = privacyScanForRecord(withDigest);
  if (privacyScan.secret_findings !== 0 || privacyScan.customer_content_findings !== 0) {
    throw new EvidenceError('PROVIDER_RESULT_PRIVACY_FAILED', 'Provider result contains unsafe retained content.');
  }
  return validateProviderResult({ ...withDigest, privacy_scan: privacyScan });
}

export function validateProviderResult(result) {
  assertExactObject(result, RESULT_FIELDS, [], 'provider result');
  if (result.schema_version !== PROVIDER_RESULT_SCHEMA || result.adapter_version !== PROVIDER_CONTRACT_VERSION) {
    throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider result schema or version is invalid.');
  }
  validateControlledSlug(result.adapter_id, 'provider adapter ID', { allowUnderscore: true });
  validateControlledSlug(result.operation_id, 'provider operation ID');
  validateControlledSlug(result.stage_id, 'provider stage ID');
  validateControlledSlug(result.execution_token_id, 'provider token ID');
  validateCommandCategory(result.command_category);
  validateAuthorizationReference(result.approval_reference, 'provider approval reference');
  validateCredentialReference(result.credential_reference, 'provider credential reference');
  validateProviderTarget({
    target_classification: result.target_classification,
    target_id: result.target_id,
    target_identity_digest: result.target_identity_digest,
  }, result.adapter_id);
  validateControlledSlug(result.requested_action, 'provider requested action', { allowUnderscore: true });
  if (!PROVIDER_EXECUTION_MODES.includes(result.execution_mode)
    || !PROVIDER_RESULT_CLASSIFICATIONS.includes(result.result_classification)
    || !PROVIDER_AFFECTED_RESULTS.includes(result.affected_result)
    || !/^[a-f0-9]{64}$/.test(result.evidence_digest)) {
    throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider result contains invalid classifications.');
  }
  if (result.timeout_classification !== null && result.timeout_classification !== 'timed_out') throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider timeout classification is invalid.');
  if (result.cancellation_classification !== null && result.cancellation_classification !== 'cancelled') throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider cancellation classification is invalid.');
  validateControlledSlug(result.safe_provider_reference, 'provider safe reference', { allowUnderscore: true, maxLength: 64 });
  validateTimestamp(result.started_utc, 'provider started timestamp');
  validateTimestamp(result.completed_utc, 'provider completed timestamp');
  if (Date.parse(result.completed_utc) < Date.parse(result.started_utc)) throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider result timestamp regressed.');
  assertExactObject(result.privacy_scan, ['secret_findings', 'customer_content_findings', 'files_scanned'], [], 'provider result privacy scan');
  if (result.privacy_scan.secret_findings !== 0 || result.privacy_scan.customer_content_findings !== 0 || result.privacy_scan.files_scanned !== 1) {
    throw new EvidenceError('PROVIDER_RESULT_PRIVACY_FAILED', 'Provider result privacy scan failed.');
  }
  if (result.evidence_digest !== resultDigest(result)) throw new EvidenceError('PROVIDER_RESULT_INVALID', 'Provider result digest does not match retained fields.');
  return result;
}

export function providerResultEvidenceLines(result) {
  const validated = validateProviderResult(result);
  const status = ['success'].includes(validated.result_classification) ? 'completed'
    : ['timeout', 'cancelled'].includes(validated.result_classification) ? 'interrupted'
      : 'failed';
  const classification = validated.result_classification === 'success' ? 'passed'
    : validated.result_classification === 'timeout' ? 'limit_exceeded'
      : validated.result_classification === 'cancelled' ? 'interrupted'
        : 'harness_failed';
  const affectedRows = validated.affected_result === 'simulated_change' ? 1 : 0;
  return [
    `status=${status}`,
    `classification=${classification}`,
    `result=${status === 'completed' ? 'passed' : 'failed'}`,
    `transaction=${status === 'completed' ? 'committed' : 'rolled_back'}`,
    `affected_rows=${affectedRows}`,
    `identifier_prefix=${validated.evidence_digest.slice(0, 8)}`,
    '',
  ].join('\n');
}

export function currentProviderTimestamp() {
  return utcNow();
}
