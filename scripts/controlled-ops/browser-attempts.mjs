import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  EvidenceError,
  LIMITS,
  assertExactObject,
  assertPacketOwnedFile,
  canonicalStringify,
  compareStrings,
  fsyncDirectory,
  readJson,
  readDirectorySorted,
  resolveInside,
  sha256,
  utcNow,
  validateCommandCategory,
  validateControlledSlug,
  validateRelativePath,
  validateTimestamp,
  writeJsonAtomic,
} from './internal.mjs';
import {
  BROWSER_LIMITS,
  BROWSER_WORKFLOW_COMMAND_CATEGORY,
  validateGeneratedBrowserId,
} from './browser-schema.mjs';
import { scanCustomerContent, scanSensitiveContent } from './sanitize.mjs';

function readCanonicalJsonFile(path, maximumBytes = LIMITS.manifest_bytes) {
  const value = readJson(path, maximumBytes);
  const content = readFileSync(path, 'utf8');
  if (content !== `${canonicalStringify(value)}\n`) throw new EvidenceError('NONCANONICAL_JSON', 'JSON evidence is not canonically serialized.');
  return value;
}

export const BROWSER_ATTEMPT_LIMIT = 3;
export const BROWSER_ATTEMPTS_DIR = 'browser-attempts';
export const BROWSER_ATTEMPT_SUMMARY_ARTIFACT = 'browser-summary.json';
export const BROWSER_ATTEMPT_IMPORT_SUMMARY_ARTIFACT = 'browser-import-summary.json';
export const BROWSER_ATTEMPT_OUTCOME_ARTIFACT = 'browser-attempt-outcome.json';
export const BROWSER_ATTEMPT_SELECTION_ARTIFACT = 'browser-attempt-selection.json';
export const BROWSER_ATTEMPT_OUTCOME_SCHEMA = 'servsync-controlled-ops/browser-attempt-outcome-v1';
export const BROWSER_ATTEMPT_SELECTION_SCHEMA = 'servsync-controlled-ops/browser-attempt-selection-v1';
export const BROWSER_ATTEMPT_SUMMARY_CLASS = 'browser_attempt_summary';
export const BROWSER_ATTEMPT_IMPORT_SUMMARY_CLASS = 'browser_attempt_import_summary';
export const BROWSER_ATTEMPT_OUTCOME_CLASS = 'browser_attempt_outcome';
export const BROWSER_ATTEMPT_SELECTION_CLASS = 'browser_attempt_selection';

export const CLEANUP_ASSURANCES = Object.freeze([
  'authenticated_in_process_cleanup',
  'packet_recovery_without_global_workspace_absence_proof',
  'no_workspace_created',
  'cleanup_not_completed',
  'cleanup_state_unknown_after_process_loss',
]);
export const CONTINUABLE_CLEANUP_ASSURANCES = new Set([
  'authenticated_in_process_cleanup',
  'packet_recovery_without_global_workspace_absence_proof',
  'no_workspace_created',
]);
const TERMINAL_STATES = new Set(['completed', 'command_failed', 'signaled', 'sanitizer_failed', 'interrupted', 'failed_before_execution', 'harness_failed_after_execution', 'limit_exceeded']);
const ACTIVE_STATES = new Set(['claimed', 'started']);
const ATTEMPT_STATUSES = new Map([
  ['completed', 'succeeded'],
  ['command_failed', 'command_failed'],
  ['signaled', 'signaled'],
  ['sanitizer_failed', 'sanitizer_failed'],
  ['interrupted', 'interrupted'],
  ['failed_before_execution', 'failed_before_execution'],
  ['harness_failed_after_execution', 'harness_failed_after_execution'],
  ['limit_exceeded', 'limit_exceeded'],
]);
const OUTCOME_FIELDS = [
  'schema_version', 'operation_id', 'stage_id', 'execution_token_id', 'command_category', 'attempt_sequence',
  'prior_execution_token_id', 'retry_count', 'token_terminal_state', 'attempt_status', 'command_result', 'harness_result',
  'browser_run_id', 'binding_digest', 'browser_evidence_status', 'browser_summary_path', 'browser_summary_sha256',
  'browser_summary_bytes', 'browser_import_summary_path', 'browser_import_summary_sha256', 'browser_import_summary_bytes',
  'terminal_event_id', 'terminal_event_hash', 'retained_utc', 'cleanup_assurance', 'privacy_scan',
];
const SELECTION_FIELDS = [
  'schema_version', 'operation_id', 'stage_id', 'command_category', 'selected_execution_token_id',
  'selected_browser_run_id', 'selected_binding_digest', 'selected_attempt_sequence', 'lineage_head_execution_token_id',
  'attempt_count', 'selection_rule', 'attempt_inventory_digest', 'selection_utc', 'verification_status',
];

export function attemptRelativeDir(token) {
  validateControlledSlug(token, 'browser attempt token');
  return `${BROWSER_ATTEMPTS_DIR}/${token}`;
}

export function attemptArtifactPath(token, artifact) {
  validateControlledSlug(token, 'browser attempt token');
  return `${attemptRelativeDir(token)}/${artifact}`;
}

export function attemptSummaryPath(token) {
  return attemptArtifactPath(token, BROWSER_ATTEMPT_SUMMARY_ARTIFACT);
}

export function attemptImportSummaryPath(token) {
  return attemptArtifactPath(token, BROWSER_ATTEMPT_IMPORT_SUMMARY_ARTIFACT);
}

export function attemptOutcomePath(token) {
  return attemptArtifactPath(token, BROWSER_ATTEMPT_OUTCOME_ARTIFACT);
}

export function packetAttemptArtifactPath(rootPath, stageId, relativePath) {
  return resolveInside(rootPath, `stages/${stageId}/artifacts/${validateRelativePath(relativePath)}`);
}

export function expectedAttemptEntry(token, artifactClass) {
  const path = artifactClass === BROWSER_ATTEMPT_SUMMARY_CLASS ? attemptSummaryPath(token)
    : artifactClass === BROWSER_ATTEMPT_IMPORT_SUMMARY_CLASS ? attemptImportSummaryPath(token)
      : attemptOutcomePath(token);
  return {
    path,
    artifact_class: artifactClass,
    sanitization_status: 'internal',
    summary_path: artifactClass === BROWSER_ATTEMPT_OUTCOME_CLASS ? path : attemptOutcomePath(token),
  };
}

export function expectedSelectionEntry() {
  return {
    path: BROWSER_ATTEMPT_SELECTION_ARTIFACT,
    artifact_class: BROWSER_ATTEMPT_SELECTION_CLASS,
    sanitization_status: 'internal',
    summary_path: BROWSER_ATTEMPT_SELECTION_ARTIFACT,
  };
}

export function classifyBrowserAttemptPath(path, artifactClass) {
  const normalized = validateRelativePath(path);
  if (normalized === BROWSER_ATTEMPT_SELECTION_ARTIFACT) {
    if (artifactClass !== BROWSER_ATTEMPT_SELECTION_CLASS) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser selection path and class do not match.');
    return { kind: 'selection' };
  }
  const match = normalized.match(/^browser-attempts\/([a-z][a-z0-9-]{0,63})\/(browser-summary\.json|browser-import-summary\.json|browser-attempt-outcome\.json)$/);
  if (!match) {
    if ([BROWSER_ATTEMPT_SUMMARY_CLASS, BROWSER_ATTEMPT_IMPORT_SUMMARY_CLASS, BROWSER_ATTEMPT_OUTCOME_CLASS].includes(artifactClass)) {
      throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser attempt class and path do not match.');
    }
    return null;
  }
  const [, token, leaf] = match;
  const expectedClass = leaf === BROWSER_ATTEMPT_SUMMARY_ARTIFACT ? BROWSER_ATTEMPT_SUMMARY_CLASS
    : leaf === BROWSER_ATTEMPT_IMPORT_SUMMARY_ARTIFACT ? BROWSER_ATTEMPT_IMPORT_SUMMARY_CLASS
      : BROWSER_ATTEMPT_OUTCOME_CLASS;
  if (artifactClass !== expectedClass) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser attempt path and class do not match.');
  return { kind: 'attempt', token, leaf, artifactClass: expectedClass };
}

function tokenPath(rootPath, token) {
  return resolveInside(rootPath, `tokens/${validateControlledSlug(token, 'token')}.json`);
}

export function readBrowserTokensForStage(rootPath, metadata, stageId) {
  validateControlledSlug(stageId, 'stage ID');
  const tokens = [];
  for (const file of readDirectorySorted(resolveInside(rootPath, 'tokens'))) {
    if (!file.endsWith('.json')) continue;
    const token = readCanonicalJsonFile(resolveInside(rootPath, `tokens/${file}`));
    if (token.operation_id === metadata.operation_id && token.stage_id === stageId && token.command_category === BROWSER_WORKFLOW_COMMAND_CATEGORY) tokens.push(token);
  }
  tokens.sort((left, right) => compareStrings(left.token, right.token));
  return tokens;
}

export function browserRetryCount(token) {
  return token.retry?.retry_count ?? 0;
}

export function attemptSequenceForToken(token) {
  return browserRetryCount(token) + 1;
}

export function assertBrowserTokenClaimAllowed(rootPath, metadata, fields) {
  if (fields.commandCategory !== BROWSER_WORKFLOW_COMMAND_CATEGORY) return;
  validateControlledSlug(fields.stageId, 'stage ID');
  const tokens = readBrowserTokensForStage(rootPath, metadata, fields.stageId);
  if (tokens.some((token) => ACTIVE_STATES.has(token.state))) throw new EvidenceError('BROWSER_ATTEMPT_ACTIVE', 'A browser attempt is already active for this stage.');
  if (tokens.length >= BROWSER_ATTEMPT_LIMIT) throw new EvidenceError('BROWSER_ATTEMPT_LIMIT', 'Browser attempt limit reached for this stage.');
  const existingChildren = new Map();
  for (const token of tokens) {
    if (token.retry) existingChildren.set(token.retry.prior_token, (existingChildren.get(token.retry.prior_token) ?? 0) + 1);
  }
  if (!fields.retryOf) {
    if (tokens.length > 0) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Additional browser attempts require retry lineage.');
    return;
  }
  const prior = tokens.find((token) => token.token === fields.retryOf);
  if (!prior || !TERMINAL_STATES.has(prior.state)) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser retry predecessor must be terminal in the same stage.');
  if (existingChildren.get(prior.token)) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser retry branches are not permitted.');
  const tail = tokens.find((token) => !existingChildren.has(token.token));
  if (!tail || tail.token !== prior.token) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser retry must reference the current lineage tail.');
}

function validateCommandResult(value) {
  if (value === null) return;
  assertExactObject(value, ['exit_kind', 'exit_code', 'signal_name', 'signal_number'], [], 'browser attempt command result');
  if (!['normal', 'signal', 'not_started'].includes(value.exit_kind)) throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt command result is invalid.');
}

function validateHarnessResult(value) {
  if (value === null) return;
  assertExactObject(value, ['classification', 'detail', 'wrapper_signal', 'forwarded_signal'], [], 'browser attempt harness result');
  validateControlledSlug(value.classification, 'browser attempt harness classification', { allowUnderscore: true });
  validateControlledSlug(value.detail, 'browser attempt harness detail', { allowUnderscore: true });
}

export function validateAttemptOutcome(outcome) {
  assertExactObject(outcome, OUTCOME_FIELDS, [], 'browser attempt outcome');
  if (outcome.schema_version !== BROWSER_ATTEMPT_OUTCOME_SCHEMA || outcome.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY) {
    throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt outcome schema is invalid.');
  }
  validateControlledSlug(outcome.operation_id, 'browser attempt operation ID');
  validateControlledSlug(outcome.stage_id, 'browser attempt stage ID');
  validateControlledSlug(outcome.execution_token_id, 'browser attempt token ID');
  validateTimestamp(outcome.retained_utc, 'browser attempt retained timestamp');
  if (!Number.isInteger(outcome.attempt_sequence) || outcome.attempt_sequence < 1 || outcome.attempt_sequence > BROWSER_ATTEMPT_LIMIT) throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt sequence is invalid.');
  if (outcome.prior_execution_token_id !== null) validateControlledSlug(outcome.prior_execution_token_id, 'browser attempt prior token ID');
  if (!Number.isInteger(outcome.retry_count) || outcome.retry_count !== outcome.attempt_sequence - 1) throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt retry count is invalid.');
  if (!ATTEMPT_STATUSES.has(outcome.token_terminal_state) || outcome.attempt_status !== ATTEMPT_STATUSES.get(outcome.token_terminal_state)) throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt terminal status is invalid.');
  validateCommandResult(outcome.command_result);
  validateHarnessResult(outcome.harness_result);
  if (!CLEANUP_ASSURANCES.includes(outcome.cleanup_assurance)) throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt cleanup assurance is invalid.');
  assertExactObject(outcome.privacy_scan, ['secret_findings', 'customer_content_findings', 'prohibited_retained_artifact_findings', 'files_scanned'], [], 'browser attempt privacy scan');
  if (outcome.privacy_scan.secret_findings !== 0 || outcome.privacy_scan.customer_content_findings !== 0 || outcome.privacy_scan.prohibited_retained_artifact_findings !== 0 || !Number.isInteger(outcome.privacy_scan.files_scanned)) throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt privacy scan is invalid.');
  if (!/^.+-completed$/.test(outcome.terminal_event_id) || !/^[a-f0-9]{64}$/.test(outcome.terminal_event_hash)) throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt terminal event binding is invalid.');
  if (outcome.attempt_status === 'succeeded') {
    if (outcome.browser_evidence_status !== 'promoted'
      || typeof outcome.browser_run_id !== 'string'
      || typeof outcome.binding_digest !== 'string'
      || !/^[a-f0-9]{64}$/.test(outcome.binding_digest)
      || !/^[a-f0-9]{64}$/.test(outcome.browser_summary_sha256)
      || !/^[a-f0-9]{64}$/.test(outcome.browser_import_summary_sha256)
      || !Number.isInteger(outcome.browser_summary_bytes)
      || !Number.isInteger(outcome.browser_import_summary_bytes)
      || outcome.browser_summary_path !== `stages/${outcome.stage_id}/artifacts/${attemptSummaryPath(outcome.execution_token_id)}`
      || outcome.browser_import_summary_path !== `stages/${outcome.stage_id}/artifacts/${attemptImportSummaryPath(outcome.execution_token_id)}`) {
      throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Successful browser attempt outcome is invalid.');
    }
    validateGeneratedBrowserId(outcome.browser_run_id, 'browser attempt run ID');
  } else if (outcome.browser_evidence_status !== 'not_retained'
    || outcome.browser_summary_path !== null
    || outcome.browser_summary_sha256 !== null
    || outcome.browser_summary_bytes !== null
    || outcome.browser_import_summary_path !== null
    || outcome.browser_import_summary_sha256 !== null
    || outcome.browser_import_summary_bytes !== null) {
    throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Terminal unsuccessful browser attempt outcome is invalid.');
  }
  return outcome;
}

export function readAttemptOutcome(rootPath, stageId, token, modes = [0o600, 0o400]) {
  const path = packetAttemptArtifactPath(rootPath, stageId, attemptOutcomePath(token));
  const info = assertPacketOwnedFile(rootPath, path, modes, BROWSER_LIMITS.summary_bytes);
  const content = readFileSync(path, 'utf8');
  const outcome = validateAttemptOutcome(readCanonicalJsonFile(path, BROWSER_LIMITS.summary_bytes));
  return { outcome, content, info, path };
}

export function terminalEventForToken(events, token) {
  const matches = events.filter((event) => event.event_id === `${token.token}-completed`);
  if (matches.length !== 1) throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt token terminal event must exist exactly once.');
  return matches[0];
}

function privacyScanForContents(contents) {
  for (const content of contents) {
    if (scanSensitiveContent(content, { includeEntropy: false }).length > 0) throw new EvidenceError('BROWSER_ATTEMPT_PRIVACY_FAILED', 'Browser attempt retained content failed secret scan.');
    if (scanCustomerContent(content).length > 0) throw new EvidenceError('BROWSER_ATTEMPT_PRIVACY_FAILED', 'Browser attempt retained content failed customer scan.');
  }
  return { secret_findings: 0, customer_content_findings: 0, prohibited_retained_artifact_findings: 0, files_scanned: contents.length };
}

export function buildAttemptOutcome({ metadata, stageId, token, terminalEvent, cleanupAssurance, summary = null, summaryContent = null, importSummary = null, importContent = null, retainedAt = utcNow() }) {
  const attemptStatus = ATTEMPT_STATUSES.get(token.state);
  if (!attemptStatus) throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt token is not terminal.');
  const successful = attemptStatus === 'succeeded';
  const contents = successful ? [summaryContent, importContent] : [];
  const privacyScan = privacyScanForContents(contents);
  const outcome = {
    schema_version: BROWSER_ATTEMPT_OUTCOME_SCHEMA,
    operation_id: metadata.operation_id,
    stage_id: stageId,
    execution_token_id: token.token,
    command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    attempt_sequence: attemptSequenceForToken(token),
    prior_execution_token_id: token.retry?.prior_token ?? null,
    retry_count: browserRetryCount(token),
    token_terminal_state: token.state,
    attempt_status: attemptStatus,
    command_result: token.command_result,
    harness_result: token.harness_result,
    browser_run_id: successful ? summary.run_id : null,
    binding_digest: successful ? summary.binding_digest : null,
    browser_evidence_status: successful ? 'promoted' : 'not_retained',
    browser_summary_path: successful ? `stages/${stageId}/artifacts/${attemptSummaryPath(token.token)}` : null,
    browser_summary_sha256: successful ? sha256(summaryContent) : null,
    browser_summary_bytes: successful ? Buffer.byteLength(summaryContent) : null,
    browser_import_summary_path: successful ? `stages/${stageId}/artifacts/${attemptImportSummaryPath(token.token)}` : null,
    browser_import_summary_sha256: successful ? sha256(importContent) : null,
    browser_import_summary_bytes: successful ? Buffer.byteLength(importContent) : null,
    terminal_event_id: terminalEvent.event_id,
    terminal_event_hash: terminalEvent.current_event_hash,
    retained_utc: retainedAt,
    cleanup_assurance: cleanupAssurance,
    privacy_scan: privacyScan,
  };
  return validateAttemptOutcome(outcome);
}

export function writeOrVerifyJsonArtifact(rootPath, stageId, relativePath, value, maximumBytes = BROWSER_LIMITS.summary_bytes) {
  const path = packetAttemptArtifactPath(rootPath, stageId, relativePath);
  const content = `${canonicalStringify(value)}\n`;
  if (Buffer.byteLength(content) > maximumBytes) throw new EvidenceError('BROWSER_ATTEMPT_SIZE_LIMIT', 'Browser attempt artifact exceeds its configured limit.');
  if (existsSync(path)) {
    assertPacketOwnedFile(rootPath, path, [0o600], maximumBytes);
    if (readFileSync(path, 'utf8') !== content) throw new EvidenceError('BROWSER_PACKET_STATE_CONFLICT', 'Browser attempt artifact conflicts with retained evidence.');
    return { path, content };
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeJsonAtomic(path, value, 0o600, rootPath);
  return { path, content };
}

export function writeOrVerifyTextArtifact(rootPath, stageId, relativePath, content, maximumBytes = BROWSER_LIMITS.summary_bytes) {
  const path = packetAttemptArtifactPath(rootPath, stageId, relativePath);
  if (Buffer.byteLength(content) > maximumBytes) throw new EvidenceError('BROWSER_ATTEMPT_SIZE_LIMIT', 'Browser attempt artifact exceeds its configured limit.');
  if (existsSync(path)) {
    assertPacketOwnedFile(rootPath, path, [0o600], maximumBytes);
    if (readFileSync(path, 'utf8') !== content) throw new EvidenceError('BROWSER_PACKET_STATE_CONFLICT', 'Browser attempt artifact conflicts with retained evidence.');
    return path;
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, content, { mode: 0o600, flag: 'wx' });
  fsyncDirectory(dirname(path));
  return path;
}

export function registerBrowserAttemptEntries(rootPath, metadata, stageId, entries) {
  const indexPath = resolveInside(rootPath, `stages/${stageId}/artifact-index.json`);
  const index = readCanonicalJsonFile(indexPath);
  assertExactObject(index, ['schema_version', 'operation_id', 'stage_id', 'artifacts'], [], 'artifact index');
  if (index.operation_id !== metadata.operation_id || index.stage_id !== stageId) throw new EvidenceError('INVALID_ARTIFACT_INDEX', 'Browser attempt artifact index is invalid.');
  for (const entry of entries) {
    validateRelativePath(entry.path); validateRelativePath(entry.summary_path);
    const current = index.artifacts.filter((candidate) => candidate.path === entry.path);
    if (current.length > 1 || (current.length === 1 && canonicalStringify(current[0]) !== canonicalStringify(entry))) throw new EvidenceError('BROWSER_PACKET_STATE_CONFLICT', 'Browser attempt artifact index conflicts with retained evidence.');
    if (current.length === 0) index.artifacts.push(entry);
  }
  if (index.artifacts.length > LIMITS.artifact_count_per_stage) throw new EvidenceError('ARTIFACT_COUNT_LIMIT', 'Artifact count exceeds its configured limit.');
  index.artifacts.sort((left, right) => compareStrings(left.path, right.path));
  writeJsonAtomic(indexPath, index, 0o600, rootPath);
  return index;
}

export function validateSelection(selection) {
  assertExactObject(selection, SELECTION_FIELDS, [], 'browser attempt selection');
  if (selection.schema_version !== BROWSER_ATTEMPT_SELECTION_SCHEMA
    || selection.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || selection.selection_rule !== 'latest_authorized_terminal_attempt'
    || selection.verification_status !== 'passed'
    || !Number.isInteger(selection.selected_attempt_sequence)
    || !Number.isInteger(selection.attempt_count)
    || selection.attempt_count < 1
    || selection.attempt_count > BROWSER_ATTEMPT_LIMIT
    || selection.selected_attempt_sequence !== selection.attempt_count
    || !/^[a-f0-9]{64}$/.test(selection.selected_binding_digest)
    || !/^[a-f0-9]{64}$/.test(selection.attempt_inventory_digest)) {
    throw new EvidenceError('BROWSER_ATTEMPT_SELECTION_INVALID', 'Browser attempt selection schema is invalid.');
  }
  validateControlledSlug(selection.operation_id, 'browser selection operation ID');
  validateControlledSlug(selection.stage_id, 'browser selection stage ID');
  validateControlledSlug(selection.selected_execution_token_id, 'browser selection token ID');
  validateControlledSlug(selection.lineage_head_execution_token_id, 'browser selection lineage head token ID');
  validateGeneratedBrowserId(selection.selected_browser_run_id, 'browser selection run ID');
  validateTimestamp(selection.selection_utc, 'browser selection timestamp');
  return selection;
}

export function browserAttemptTokenSetFromIndex(index) {
  const tokens = new Set();
  let hasV2 = false;
  let hasSelection = false;
  for (const entry of index.artifacts ?? []) {
    const classified = classifyBrowserAttemptPath(entry.path, entry.artifact_class);
    if (classified?.kind === 'attempt') { hasV2 = true; tokens.add(classified.token); }
    if (classified?.kind === 'selection') { hasV2 = true; hasSelection = true; }
  }
  return { hasV2, hasSelection, tokens: [...tokens].sort(compareStrings) };
}

export function buildAttemptInventory(rootPath, metadata, stageId, events, { requireOutcomes = true, modes = [0o600, 0o400], excludeToken = null } = {}) {
  const tokens = readBrowserTokensForStage(rootPath, metadata, stageId).filter((token) => token.token !== excludeToken);
  if (tokens.length === 0) return { attempts: [], digest: sha256('[]'), tail: null };
  if (tokens.length > BROWSER_ATTEMPT_LIMIT) throw new EvidenceError('BROWSER_ATTEMPT_LIMIT', 'Browser attempt limit exceeded.');
  const byToken = new Map(tokens.map((token) => [token.token, token]));
  const children = new Map();
  let first = null;
  for (const token of tokens) {
    if (!TERMINAL_STATES.has(token.state)) throw new EvidenceError('BROWSER_ATTEMPT_ACTIVE', 'Browser attempt is not terminal.');
    if (token.retry === null) {
      if (first) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser lineage has multiple first attempts.');
      first = token;
    } else {
      const prior = byToken.get(token.retry.prior_token);
      if (!prior || prior.operation_id !== token.operation_id || prior.stage_id !== token.stage_id || prior.command_category !== token.command_category) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser retry predecessor is invalid.');
      if (children.has(prior.token)) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser retry branch detected.');
      if ((prior.retry?.retry_count ?? 0) + 1 !== token.retry.retry_count) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser retry sequence gap detected.');
      children.set(prior.token, token);
    }
  }
  if (!first) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser lineage lacks a first attempt.');
  const ordered = [];
  let current = first;
  while (current) {
    ordered.push(current);
    current = children.get(current.token);
  }
  if (ordered.length !== tokens.length) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser lineage contains a cycle or orphan.');
  const attempts = [];
  for (const [index, token] of ordered.entries()) {
    if (attemptSequenceForToken(token) !== index + 1) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser attempt sequence is invalid.');
    const terminalEvent = terminalEventForToken(events, token);
    let outcome = null;
    let outcomeContent = null;
    if (existsSync(packetAttemptArtifactPath(rootPath, stageId, attemptOutcomePath(token.token)))) {
      const read = readAttemptOutcome(rootPath, stageId, token.token, modes);
      outcome = read.outcome;
      outcomeContent = read.content;
      if (outcome.operation_id !== metadata.operation_id
        || outcome.stage_id !== stageId
        || outcome.execution_token_id !== token.token
        || outcome.prior_execution_token_id !== (token.retry?.prior_token ?? null)
        || outcome.retry_count !== browserRetryCount(token)
        || outcome.attempt_sequence !== index + 1
        || outcome.token_terminal_state !== token.state
        || outcome.terminal_event_id !== terminalEvent.event_id
        || outcome.terminal_event_hash !== terminalEvent.current_event_hash) {
        throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_INVALID', 'Browser attempt outcome does not match token lineage.');
      }
      if (!CONTINUABLE_CLEANUP_ASSURANCES.has(outcome.cleanup_assurance)) throw new EvidenceError('BROWSER_PREDECESSOR_NOT_RECONCILED', 'Browser attempt cleanup state blocks continuation.');
    } else if (requireOutcomes) {
      throw new EvidenceError('BROWSER_ATTEMPT_OUTCOME_MISSING', 'Every browser attempt must have an outcome.');
    }
    attempts.push({
      attempt_sequence: index + 1,
      execution_token_id: token.token,
      prior_execution_token_id: token.retry?.prior_token ?? null,
      retry_count: browserRetryCount(token),
      token_terminal_state: token.state,
      attempt_status: outcome?.attempt_status ?? ATTEMPT_STATUSES.get(token.state),
      browser_run_id: outcome?.browser_run_id ?? null,
      binding_digest: outcome?.binding_digest ?? null,
      outcome_path: attemptOutcomePath(token.token),
      outcome_sha256: outcomeContent ? sha256(outcomeContent) : null,
      outcome_bytes: outcomeContent ? Buffer.byteLength(outcomeContent) : null,
      terminal_event_id: terminalEvent.event_id,
      terminal_event_hash: terminalEvent.current_event_hash,
      promotion_event_id: token.state === 'completed' ? `${token.token}-browser-evidence` : null,
      promotion_event_hash: null,
      token,
      outcome,
    });
  }
  const canonical = attempts.map(({ token, outcome, ...entry }) => entry);
  return { attempts, digest: sha256(canonicalStringify(canonical)), tail: attempts.at(-1) };
}

export function assertPredecessorOutcomeForRetryLaunch(rootPath, metadata, stageId, token) {
  if (token.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY || token.retry === null) return;
  const events = [];
  const eventContent = readFileSync(resolveInside(rootPath, 'events.ndjson'), 'utf8').trim();
  if (eventContent.length > 0) eventContent.split('\n').forEach((line) => events.push(JSON.parse(line)));
  const prior = readCanonicalJsonFile(tokenPath(rootPath, token.retry.prior_token));
  const inventory = buildAttemptInventory(rootPath, metadata, stageId, events, { requireOutcomes: false, excludeToken: token.token });
  const priorAttempt = inventory.attempts.find((attempt) => attempt.execution_token_id === prior.token);
  if (inventory.tail?.execution_token_id !== prior.token) throw new EvidenceError('BROWSER_RETRY_LINEAGE_INVALID', 'Browser retry predecessor must be the current lineage tail.');
  if (!priorAttempt?.outcome || !CONTINUABLE_CLEANUP_ASSURANCES.has(priorAttempt.outcome.cleanup_assurance)) {
    throw new EvidenceError('BROWSER_PREDECESSOR_NOT_RECONCILED', 'Browser retry predecessor has not been safely retained.');
  }
}

export function buildSelectionRecord({ metadata, stageId, inventory, selectedAttempt, selectedOutcome, selectionUtc = utcNow() }) {
  const selection = {
    schema_version: BROWSER_ATTEMPT_SELECTION_SCHEMA,
    operation_id: metadata.operation_id,
    stage_id: stageId,
    command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    selected_execution_token_id: selectedAttempt.execution_token_id,
    selected_browser_run_id: selectedOutcome.browser_run_id,
    selected_binding_digest: selectedOutcome.binding_digest,
    selected_attempt_sequence: selectedAttempt.attempt_sequence,
    lineage_head_execution_token_id: selectedAttempt.execution_token_id,
    attempt_count: inventory.attempts.length,
    selection_rule: 'latest_authorized_terminal_attempt',
    attempt_inventory_digest: inventory.digest,
    selection_utc: selectionUtc,
    verification_status: 'passed',
  };
  return validateSelection(selection);
}
