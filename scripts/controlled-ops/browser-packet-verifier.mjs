import {
  existsSync,
  lstatSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  EvidenceError,
  LIMITS,
  assertExactObject,
  assertPacketOwnedDirectory,
  assertPacketOwnedFile,
  canonicalStringify,
  compareStrings,
  fsyncDirectory,
  readDirectorySorted,
  resolveInside,
  sha256,
  utcNow,
  validateControlledSlug,
  validateRelativePath,
  validateTimestamp,
  writeJsonAtomic,
} from './internal.mjs';
import {
  BROWSER_LIMITS,
  BROWSER_SUMMARY_SCHEMA,
  BROWSER_WORKFLOW_COMMAND_CATEGORY,
  createBrowserPacketBinding,
  validateGeneratedBrowserId,
  validateSummary,
} from './browser-schema.mjs';
import { parseStrictJson, scanCustomerContent, scanSensitiveContent } from './sanitize.mjs';
import {
  BROWSER_ATTEMPT_IMPORT_SUMMARY_CLASS,
  BROWSER_ATTEMPT_OUTCOME_CLASS,
  BROWSER_ATTEMPT_SELECTION_ARTIFACT,
  BROWSER_ATTEMPT_SELECTION_CLASS,
  BROWSER_ATTEMPT_SUMMARY_CLASS,
  attemptImportSummaryPath,
  attemptOutcomePath,
  attemptSummaryPath,
  browserAttemptTokenSetFromIndex,
  buildAttemptInventory,
  buildSelectionRecord,
  expectedSelectionEntry,
  registerBrowserAttemptEntries,
  validateSelection,
  writeOrVerifyJsonArtifact,
} from './browser-attempts.mjs';

export const BROWSER_PACKET_VERIFICATION_SCHEMA = 'servsync-controlled-ops/browser-freeze-verification-v1';
export const BROWSER_PACKET_VERIFICATION_SCHEMA_V2 = 'servsync-controlled-ops/browser-freeze-verification-v2';
export const BROWSER_FREEZE_VERIFICATION_ARTIFACT = 'browser-freeze-verification.json';
export const BROWSER_FREEZE_VERIFICATION_ARTIFACT_CLASS = 'browser_freeze_verification';
export const BROWSER_SUMMARY_ARTIFACT = 'browser-summary.json';
export const BROWSER_IMPORT_SUMMARY_ARTIFACT = 'browser-import-summary.json';
export const BROWSER_PACKET_IMPORT_SCHEMA = 'servsync-controlled-ops/browser-packet-import-v1';
export const BROWSER_VERIFICATION_DEFERRED_MESSAGE = 'Browser-aware stage verification is required before generic packet finalization can proceed.';

const BROWSER_VERIFICATION_CANDIDATE = 'browser-freeze-verification-candidate.json';
const BROWSER_IMPORT_TRANSACTION_ARTIFACT = 'browser-import-transaction.json';
const BROWSER_ARTIFACTS = Object.freeze([
  { path: BROWSER_IMPORT_SUMMARY_ARTIFACT, artifact_class: 'browser_import_summary', sanitization_status: 'internal', summary_path: BROWSER_IMPORT_SUMMARY_ARTIFACT },
  { path: BROWSER_SUMMARY_ARTIFACT, artifact_class: 'browser_summary', sanitization_status: 'internal', summary_path: BROWSER_IMPORT_SUMMARY_ARTIFACT },
  { path: BROWSER_FREEZE_VERIFICATION_ARTIFACT, artifact_class: BROWSER_FREEZE_VERIFICATION_ARTIFACT_CLASS, sanitization_status: 'internal', summary_path: BROWSER_FREEZE_VERIFICATION_ARTIFACT },
]);
const BROWSER_PATH_CLASS = new Map(BROWSER_ARTIFACTS.map((entry) => [entry.path, entry.artifact_class]));
const BROWSER_CLASS_PATH = new Map(BROWSER_ARTIFACTS.map((entry) => [entry.artifact_class, entry.path]));
const VERIFICATION_FIELDS = [
  'schema_version',
  'operation_id',
  'stage_id',
  'execution_token_id',
  'command_category',
  'browser_run_id',
  'binding_digest',
  'source_binding_mode',
  'source_manifest_digest',
  'browser_summary_path',
  'browser_summary_sha256',
  'browser_summary_bytes',
  'browser_import_summary_path',
  'browser_import_summary_sha256',
  'browser_import_summary_bytes',
  'promotion_event_id',
  'promotion_event_hash',
  'event_chain_head_at_verification',
  'verification_utc',
  'verification_status',
  'cleanup_assurance',
  'privacy_scan',
];
const VERIFICATION_V2_FIELDS = [
  ...VERIFICATION_FIELDS,
  'selected_execution_token_id',
  'selected_browser_run_id',
  'selected_binding_digest',
  'selected_attempt_sequence',
  'attempt_count',
  'attempt_inventory_digest',
  'selection_record_path',
  'selection_record_sha256',
  'selection_record_bytes',
  'selected_outcome_path',
  'selected_outcome_sha256',
  'selected_outcome_bytes',
];
const RAW_BROWSER_NAME_PATTERNS = [
  /browser-journal/i,
  /browser-launch/i,
  /browser-reporter-ready/i,
  /journal-auth/i,
  /launch-nonce/i,
  /storage-state/i,
  /\.(?:png|jpe?g|webp|zip|webm|mp4|har|html|trace)$/i,
];

function browserArtifactPath(rootPath, stageId, artifactName) {
  return resolveInside(rootPath, `stages/${stageId}/artifacts/${artifactName}`);
}

function verificationCandidatePath(rootPath) {
  return resolveInside(rootPath, `quarantine/${BROWSER_VERIFICATION_CANDIDATE}`);
}

function retainedVerificationPath(rootPath, stageId) {
  return browserArtifactPath(rootPath, stageId, BROWSER_FREEZE_VERIFICATION_ARTIFACT);
}

function transactionPath(rootPath) {
  return resolveInside(rootPath, `quarantine/${BROWSER_IMPORT_TRANSACTION_ARTIFACT}`);
}

function readCanonicalPacketJson(rootPath, path, maximumBytes = LIMITS.manifest_bytes, modes = [0o600, 0o400]) {
  const info = assertPacketOwnedFile(rootPath, path, modes, maximumBytes);
  const content = readFileSync(path, 'utf8');
  if (!content.endsWith('\n')) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser packet evidence must be canonical JSON.');
  const parsed = parseStrictJson(content.slice(0, -1));
  if (content !== `${canonicalStringify(parsed)}\n`) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser packet evidence is not canonical JSON.');
  return { content, parsed, info };
}

function packetSideScan(content) {
  const secret = scanSensitiveContent(content, { includeEntropy: false });
  if (secret.length > 0) throw new EvidenceError('BROWSER_VERIFICATION_SECRET_SCAN_FAILED', 'Browser verification rejected retained secret-like content.');
  const customer = scanCustomerContent(content);
  if (customer.length > 0) throw new EvidenceError('BROWSER_VERIFICATION_CUSTOMER_SCAN_FAILED', 'Browser verification rejected retained customer-like content.');
  return { secret_findings: 0, customer_content_findings: 0 };
}

function readArtifactIndex(rootPath, operationId, stageId, modes = [0o600, 0o400]) {
  const indexPath = resolveInside(rootPath, `stages/${stageId}/artifact-index.json`);
  const { parsed: index } = readCanonicalPacketJson(rootPath, indexPath, LIMITS.manifest_bytes, modes);
  assertExactObject(index, ['schema_version', 'operation_id', 'stage_id', 'artifacts'], [], 'artifact index');
  if (index.schema_version !== 'servsync-controlled-ops/artifact-index-v2'
    || index.operation_id !== operationId
    || index.stage_id !== stageId
    || !Array.isArray(index.artifacts)
    || index.artifacts.length > LIMITS.artifact_count_per_stage) {
    throw new EvidenceError('INVALID_ARTIFACT_INDEX', 'Artifact index is invalid.');
  }
  const paths = new Set();
  for (const entry of index.artifacts) {
    assertExactObject(entry, ['path', 'artifact_class', 'sanitization_status', 'summary_path'], [], 'artifact registration');
    validateRelativePath(entry.path);
    validateRelativePath(entry.summary_path);
    if (!['passed', 'internal'].includes(entry.sanitization_status) || paths.has(entry.path)) {
      throw new EvidenceError('INVALID_ARTIFACT_INDEX', 'Artifact registration is invalid.');
    }
    paths.add(entry.path);
    const expectedClass = BROWSER_PATH_CLASS.get(entry.path);
    const expectedPath = BROWSER_CLASS_PATH.get(entry.artifact_class);
    if ((expectedClass && entry.artifact_class !== expectedClass) || (expectedPath && entry.path !== expectedPath)) {
      throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser artifact path and class do not match.');
    }
    const attemptEntry = browserAttemptTokenSetFromIndex({ artifacts: [entry] });
    if (attemptEntry.hasV2 && entry.artifact_class === BROWSER_ATTEMPT_SELECTION_CLASS && entry.summary_path !== BROWSER_ATTEMPT_SELECTION_ARTIFACT) {
      throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser selection summary path is invalid.');
    }
    if ([BROWSER_ATTEMPT_SUMMARY_CLASS, BROWSER_ATTEMPT_IMPORT_SUMMARY_CLASS, BROWSER_ATTEMPT_OUTCOME_CLASS].includes(entry.artifact_class)) {
      const expectedSummary = entry.artifact_class === BROWSER_ATTEMPT_OUTCOME_CLASS ? entry.path : attemptOutcomePath(entry.path.split('/')[1]);
      if (entry.summary_path !== expectedSummary) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser attempt summary path is invalid.');
    }
  }
  return index;
}

function expectedBrowserEntry(path) {
  const entry = BROWSER_ARTIFACTS.find((candidate) => candidate.path === path);
  if (!entry) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Unknown browser artifact path.');
  return entry;
}

function matchingEntry(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function inspectBrowserArtifactGroup(rootPath, operationId, stageId, modes = [0o600, 0o400]) {
  const index = readArtifactIndex(rootPath, operationId, stageId, modes);
  const v2 = browserAttemptTokenSetFromIndex(index);
  const browserEntries = index.artifacts.filter((entry) => BROWSER_PATH_CLASS.has(entry.path) || BROWSER_CLASS_PATH.has(entry.artifact_class));
  const fixedEntries = browserEntries.filter((entry) => entry.path !== BROWSER_FREEZE_VERIFICATION_ARTIFACT);
  const hasFreezeVerification = browserEntries.some((entry) => entry.path === BROWSER_FREEZE_VERIFICATION_ARTIFACT);
  if (v2.hasV2 && fixedEntries.length > 0) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser stage mixes v1 and v2 evidence.');
  if (v2.hasV2) {
    if (!v2.hasSelection) return { kind: 'v2-pending', index, entries: new Map(), attemptTokens: v2.tokens };
    return { kind: hasFreezeVerification ? 'v2-complete' : 'v2-pending', index, entries: new Map(), attemptTokens: v2.tokens };
  }
  if (browserEntries.length === 0) return { kind: 'none', index, entries: new Map() };
  const byPath = new Map();
  for (const entry of browserEntries) {
    const expected = expectedBrowserEntry(entry.path);
    if (!matchingEntry(entry, expected)) {
      throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser artifact index entry is invalid.');
    }
    byPath.set(entry.path, entry);
  }
  const hasSummary = byPath.has(BROWSER_SUMMARY_ARTIFACT);
  const hasImport = byPath.has(BROWSER_IMPORT_SUMMARY_ARTIFACT);
  const hasVerification = byPath.has(BROWSER_FREEZE_VERIFICATION_ARTIFACT);
  if (browserEntries.length !== byPath.size || !hasSummary || !hasImport) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser artifact index is incomplete or duplicated.');
  }
  if (!hasVerification) return { kind: 'pending', index, entries: byPath };
  if (browserEntries.length !== 3) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser artifact index contains duplicate browser evidence.');
  return { kind: 'complete', index, entries: byPath };
}

export function assertBrowserArtifactIndexConsistency(rootPath, operationId, stageId, { requireVerified = true, modes = [0o600, 0o400] } = {}) {
  const group = inspectBrowserArtifactGroup(rootPath, operationId, stageId, modes);
  if (group.kind === 'none') return group;
  if ((group.kind === 'pending' || group.kind === 'v2-pending') && requireVerified) {
    throw new EvidenceError('BROWSER_VERIFICATION_DEFERRED', BROWSER_VERIFICATION_DEFERRED_MESSAGE);
  }
  if (group.kind === 'complete' || group.kind === 'v2-complete') verifyBrowserVerificationRecordStructural(rootPath, operationId, stageId, group, modes);
  return group;
}

export function browserVerificationIndexEntry() {
  return { ...expectedBrowserEntry(BROWSER_FREEZE_VERIFICATION_ARTIFACT) };
}

function assertSuccessfulBrowserSummary(summary, expectedBinding) {
  validateSummary(summary);
  if (summary.schema_version !== BROWSER_SUMMARY_SCHEMA
    || summary.status !== 'passed'
    || summary.packet_binding_mode !== 'command_token'
    || summary.operation_id !== expectedBinding.operation_id
    || summary.stage_id !== expectedBinding.stage_id
    || summary.execution_token_id !== expectedBinding.execution_token_id
    || summary.command_category !== expectedBinding.command_category
    || summary.binding_digest !== expectedBinding.binding_digest
    || summary.run_id !== expectedBinding.browser_run_id
    || summary.source_binding_mode !== expectedBinding.source_binding_mode
    || summary.source_manifest_digest !== expectedBinding.source_manifest_digest
    || summary.worker_count !== 1
    || summary.retry_limit !== 0
    || summary.observability.completeness_status !== 'complete'
    || summary.observability.totals.overflow_total !== 0
    || summary.observability.totals.collector_failure_total !== 0
    || summary.observability.totals.rejected_sensitive_total !== 0
    || summary.observability.totals.rejected_customer_content_total !== 0
    || Object.values(summary.prohibited_artifacts).some((value) => value !== 0)) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser summary is not eligible for packet finalization.');
  }
  for (const browserTest of summary.tests) {
    if (browserTest.status !== 'passed' || browserTest.worker_index !== 0 || browserTest.retry_index !== 0) {
      throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser summary contains a non-final eligible test attempt.');
    }
    for (const aggregate of [browserTest.observability.console, browserTest.observability.page_error, browserTest.observability.network]) {
      if (aggregate.completeness_status !== 'complete'
        || aggregate.overflow_count !== 0
        || aggregate.late_event_count !== 0
        || aggregate.listener_error_count !== 0
        || aggregate.collector_failure_class !== 'none') {
        throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser observability aggregate is incomplete.');
      }
    }
    const { network } = browserTest.observability;
    if (network.unresolved_request_count !== 0
      || network.duplicate_terminal_count !== 0
      || network.unexpected_page_count !== 0
      || network.websocket_attempt_count !== 0
      || network.worker_attempt_count !== 0) {
      throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser evidence contains unsupported runtime activity.');
    }
  }
}

function validateBrowserImportSummary(summary) {
  assertExactObject(summary, [
    'schema_version',
    'operation_id',
    'stage_id',
    'execution_token_id',
    'command_category',
    'binding_digest',
    'browser_run_id',
    'source_binding_mode',
    'source_manifest_digest',
    'browser_status',
    'browser_summary_relative_path',
    'browser_summary_sha256',
    'browser_summary_bytes',
    'packet_sanitization_status',
    'browser_workspace_cleanup_status',
    'imported_utc',
  ], [], 'browser import summary');
  const fixedSummaryPath = `stages/${summary.stage_id}/artifacts/${BROWSER_SUMMARY_ARTIFACT}`;
  const attemptSummaryRelativePath = typeof summary.execution_token_id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(summary.execution_token_id)
    ? `stages/${summary.stage_id}/artifacts/${attemptSummaryPath(summary.execution_token_id)}`
    : null;
  if (summary.schema_version !== BROWSER_PACKET_IMPORT_SCHEMA
    || summary.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || summary.source_binding_mode !== 'current_source_snapshot'
    || summary.browser_status !== 'passed'
    || summary.packet_sanitization_status !== 'passed'
    || summary.browser_workspace_cleanup_status !== 'cleaned'
    || ![fixedSummaryPath, attemptSummaryRelativePath].includes(summary.browser_summary_relative_path)
    || !/^[a-f0-9]{64}$/.test(summary.binding_digest)
    || !/^[a-f0-9]{64}$/.test(summary.source_manifest_digest)
    || !/^[a-f0-9]{64}$/.test(summary.browser_summary_sha256)
    || !Number.isInteger(summary.browser_summary_bytes)
    || summary.browser_summary_bytes <= 0
    || summary.browser_summary_bytes > BROWSER_LIMITS.summary_bytes) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser import summary is invalid.');
  }
  validateControlledSlug(summary.operation_id, 'browser import operation ID');
  validateControlledSlug(summary.stage_id, 'browser import stage ID');
  validateControlledSlug(summary.execution_token_id, 'browser import execution token ID');
  validateGeneratedBrowserId(summary.browser_run_id, 'browser import run ID');
  validateTimestamp(summary.imported_utc, 'browser import timestamp');
  return summary;
}

function readBrowserSummary(rootPath, stageId) {
  const path = browserArtifactPath(rootPath, stageId, BROWSER_SUMMARY_ARTIFACT);
  const { content, parsed, info } = readCanonicalPacketJson(rootPath, path, BROWSER_LIMITS.summary_bytes);
  return { content, summary: validateSummary(parsed), info };
}

function readImportSummary(rootPath, stageId) {
  const path = browserArtifactPath(rootPath, stageId, BROWSER_IMPORT_SUMMARY_ARTIFACT);
  const { content, parsed, info } = readCanonicalPacketJson(rootPath, path, BROWSER_LIMITS.summary_bytes);
  return { content, importSummary: validateBrowserImportSummary(parsed), info };
}

function assertCompletedToken(tokens, stageId, executionTokenId) {
  const token = tokens.find((candidate) => candidate.token === executionTokenId);
  if (!token
    || token.stage_id !== stageId
    || token.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || token.state !== 'completed'
    || token.command_result?.exit_kind !== 'normal'
    || token.command_result.exit_code !== 0
    || !['completed', 'evidence_complete'].includes(token.harness_result?.classification)) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser verification requires a successful browser-workflow execution token.');
  }
  return token;
}

function assertTerminalTokenEvent(events, stageId, executionTokenId) {
  const matches = events.filter((event) => event.event_id === `${executionTokenId}-completed`);
  if (matches.length !== 1
    || matches[0].stage_id !== stageId
    || matches[0].command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || matches[0].observed_result !== 'passed'
    || matches[0].result_classification !== 'passed'
    || matches[0].exit_code !== 0) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser execution token terminal event is invalid.');
  }
  return matches[0];
}

function assertPromotionEvent(events, stageId, executionTokenId, artifactPaths) {
  const matches = events.filter((event) => event.event_id === `${executionTokenId}-browser-evidence`);
  if (matches.length !== 1) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser promotion event must exist exactly once.');
  const [event] = matches;
  if (event.stage_id !== stageId
    || event.event_type !== 'browser-promoted'
    || event.archive_timestamp !== null
    || event.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || event.expected_result !== 'completed'
    || event.observed_result !== 'browser-promoted'
    || event.result_classification !== 'passed'
    || event.exit_code !== null
    || canonicalStringify(event.sanitized_artifact_paths) !== canonicalStringify(artifactPaths)) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser promotion event does not match retained artifacts.');
  }
  validateTimestamp(event.action_timestamp, 'browser promotion event timestamp');
  return event;
}

function assertImportSummaryMatchesEvidence(importSummary, metadata, stageId, token, summaryContent, summary) {
  const binding = createBrowserPacketBinding({
    operationId: metadata.operation_id,
    stageId,
    executionTokenId: token.token,
    commandCategory: token.command_category,
    browserRunId: summary.run_id,
    sourceBindingMode: summary.source_binding_mode,
    sourceManifestDigest: summary.source_manifest_digest,
  });
  assertSuccessfulBrowserSummary(summary, binding);
  if (importSummary.operation_id !== metadata.operation_id
    || importSummary.stage_id !== stageId
    || importSummary.execution_token_id !== token.token
    || importSummary.command_category !== token.command_category
    || importSummary.binding_digest !== binding.binding_digest
    || importSummary.browser_run_id !== summary.run_id
    || importSummary.source_binding_mode !== summary.source_binding_mode
    || importSummary.source_manifest_digest !== summary.source_manifest_digest
    || importSummary.browser_summary_sha256 !== sha256(summaryContent)
    || importSummary.browser_summary_bytes !== Buffer.byteLength(summaryContent)) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser import summary does not match retained browser summary.');
  }
  return binding;
}

function scanBrowserPrivacy(rootPath, stageId, contents) {
  const totals = { secret_findings: 0, customer_content_findings: 0, prohibited_retained_artifact_findings: 0, files_scanned: 0 };
  for (const content of contents) {
    const scan = packetSideScan(content);
    totals.secret_findings += scan.secret_findings;
    totals.customer_content_findings += scan.customer_content_findings;
    totals.files_scanned += 1;
  }
  const stageRoot = resolveInside(rootPath, `stages/${stageId}/artifacts`);
  const stack = [[stageRoot, 0]];
  while (stack.length > 0) {
    const [current, depth] = stack.pop();
    if (depth > LIMITS.traversal_depth) throw new EvidenceError('TRAVERSAL_DEPTH_LIMIT', 'Browser privacy traversal exceeds its configured depth.');
    assertPacketOwnedDirectory(rootPath, current, [0o700, 0o500]);
    for (const name of readDirectorySorted(current)) {
      const path = join(current, name);
      const rel = relative(stageRoot, path).split('\\').join('/');
      const info = lstatSync(path);
      if (info.isDirectory()) {
        stack.push([path, depth + 1]);
      } else if (info.isFile()) {
        assertPacketOwnedFile(rootPath, path, [0o600, 0o400], BROWSER_LIMITS.summary_bytes);
        if (RAW_BROWSER_NAME_PATTERNS.some((pattern) => pattern.test(rel))
          && ![BROWSER_SUMMARY_ARTIFACT, BROWSER_IMPORT_SUMMARY_ARTIFACT, BROWSER_FREEZE_VERIFICATION_ARTIFACT].includes(rel)) {
          totals.prohibited_retained_artifact_findings += 1;
        }
      } else {
        throw new EvidenceError('UNSUPPORTED_FILE', 'Browser stage contains an unsupported file.');
      }
    }
  }
  if (totals.prohibited_retained_artifact_findings !== 0) {
    throw new EvidenceError('BROWSER_VERIFICATION_PRIVACY_FAILED', 'Browser packet retained prohibited raw browser evidence.');
  }
  return totals;
}

function expectedArtifactPaths(stageId) {
  return [
    `stages/${stageId}/artifacts/${BROWSER_SUMMARY_ARTIFACT}`,
    `stages/${stageId}/artifacts/${BROWSER_IMPORT_SUMMARY_ARTIFACT}`,
  ];
}

function buildVerificationRecord({
  metadata,
  stageId,
  token,
  summary,
  summaryContent,
  importSummary,
  importContent,
  binding,
  promotionEvent,
  chain,
  privacyScan,
  verificationUtc,
}) {
  return {
    schema_version: BROWSER_PACKET_VERIFICATION_SCHEMA,
    operation_id: metadata.operation_id,
    stage_id: stageId,
    execution_token_id: token.token,
    command_category: token.command_category,
    browser_run_id: summary.run_id,
    binding_digest: binding.binding_digest,
    source_binding_mode: summary.source_binding_mode,
    source_manifest_digest: summary.source_manifest_digest,
    browser_summary_path: `stages/${stageId}/artifacts/${BROWSER_SUMMARY_ARTIFACT}`,
    browser_summary_sha256: sha256(summaryContent),
    browser_summary_bytes: Buffer.byteLength(summaryContent),
    browser_import_summary_path: `stages/${stageId}/artifacts/${BROWSER_IMPORT_SUMMARY_ARTIFACT}`,
    browser_import_summary_sha256: sha256(importContent),
    browser_import_summary_bytes: Buffer.byteLength(importContent),
    promotion_event_id: promotionEvent.event_id,
    promotion_event_hash: promotionEvent.current_event_hash,
    event_chain_head_at_verification: chain.head,
    verification_utc: verificationUtc,
    verification_status: 'passed',
    cleanup_assurance: 'packet_recovery_without_global_workspace_absence_proof',
    privacy_scan: privacyScan,
  };
}

function validateVerificationRecord(record) {
  assertExactObject(record, VERIFICATION_FIELDS, [], 'browser freeze verification');
  validateCommonVerificationRecord(record, 'browser freeze verification');
  if (record.schema_version !== BROWSER_PACKET_VERIFICATION_SCHEMA
    || record.browser_summary_path !== `stages/${record.stage_id}/artifacts/${BROWSER_SUMMARY_ARTIFACT}`
    || record.browser_import_summary_path !== `stages/${record.stage_id}/artifacts/${BROWSER_IMPORT_SUMMARY_ARTIFACT}`) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser freeze verification record is invalid.');
  }
  return record;
}

function validateCommonVerificationRecord(record, label) {
  assertExactObject(record.privacy_scan, ['secret_findings', 'customer_content_findings', 'prohibited_retained_artifact_findings', 'files_scanned'], [], 'browser verification privacy scan');
  if (record.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || record.source_binding_mode !== 'current_source_snapshot'
    || record.verification_status !== 'passed'
    || !['packet_recovery_without_global_workspace_absence_proof', 'authenticated_in_process_cleanup'].includes(record.cleanup_assurance)
    || ![record.binding_digest, record.source_manifest_digest, record.browser_summary_sha256, record.browser_import_summary_sha256, record.promotion_event_hash, record.event_chain_head_at_verification].every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    || !Number.isInteger(record.browser_summary_bytes)
    || record.browser_summary_bytes <= 0
    || record.browser_summary_bytes > BROWSER_LIMITS.summary_bytes
    || !Number.isInteger(record.browser_import_summary_bytes)
    || record.browser_import_summary_bytes <= 0
    || record.browser_import_summary_bytes > BROWSER_LIMITS.summary_bytes
    || record.privacy_scan.secret_findings !== 0
    || record.privacy_scan.customer_content_findings !== 0
    || record.privacy_scan.prohibited_retained_artifact_findings !== 0
    || !Number.isInteger(record.privacy_scan.files_scanned)
    || record.privacy_scan.files_scanned < 2) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', `${label} record is invalid.`);
  }
  validateControlledSlug(record.operation_id, 'browser verification operation ID');
  validateControlledSlug(record.stage_id, 'browser verification stage ID');
  validateControlledSlug(record.execution_token_id, 'browser verification token ID');
  validateGeneratedBrowserId(record.browser_run_id, 'browser verification run ID');
  validateTimestamp(record.verification_utc, 'browser verification timestamp');
  return record;
}

function assertVerificationMatchesState(record, {
  metadata,
  stageId,
  token,
  summary,
  summaryContent,
  importSummary,
  importContent,
  binding,
  promotionEvent,
  chain,
  privacyScan,
}) {
  validateVerificationRecord(record);
  const expected = buildVerificationRecord({
    metadata,
    stageId,
    token,
    summary,
    summaryContent,
    importSummary,
    importContent,
    binding,
    promotionEvent,
    chain,
    privacyScan,
    verificationUtc: record.verification_utc,
  });
  if (canonicalStringify(record) !== canonicalStringify(expected)) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser freeze verification record does not match retained evidence.');
  }
  if (Date.parse(record.verification_utc) < Math.max(
    validateTimestamp(importSummary.imported_utc, 'browser import timestamp'),
    validateTimestamp(promotionEvent.action_timestamp, 'browser promotion timestamp'),
  )) {
    throw new EvidenceError('TIMESTAMP_REGRESSION', 'Browser verification timestamp precedes retained browser evidence.');
  }
  return record;
}

function selectedAttemptArtifactPaths(stageId, token) {
  return [
    `stages/${stageId}/artifacts/${attemptSummaryPath(token)}`,
    `stages/${stageId}/artifacts/${attemptImportSummaryPath(token)}`,
    `stages/${stageId}/artifacts/${attemptOutcomePath(token)}`,
  ];
}

function readAttemptSummary(rootPath, stageId, token) {
  const path = browserArtifactPath(rootPath, stageId, attemptSummaryPath(token));
  const { content, parsed, info } = readCanonicalPacketJson(rootPath, path, BROWSER_LIMITS.summary_bytes);
  return { content, summary: validateSummary(parsed), info };
}

function readAttemptImportSummary(rootPath, stageId, token) {
  const path = browserArtifactPath(rootPath, stageId, attemptImportSummaryPath(token));
  const { content, parsed, info } = readCanonicalPacketJson(rootPath, path, BROWSER_LIMITS.summary_bytes);
  return { content, importSummary: validateBrowserImportSummary(parsed), info };
}

function v2PrivacyScan(rootPath, stageId, contents) {
  return scanBrowserPrivacy(rootPath, stageId, contents);
}

function buildVerificationRecordV2({
  metadata,
  stageId,
  token,
  summary,
  summaryContent,
  importSummary,
  importContent,
  outcome,
  outcomeContent,
  binding,
  promotionEvent,
  chain,
  privacyScan,
  verificationUtc,
  selection,
  selectionContent,
}) {
  return {
    ...buildVerificationRecord({
      metadata,
      stageId,
      token,
      summary,
      summaryContent,
      importSummary,
      importContent,
      binding,
      promotionEvent,
      chain,
      privacyScan,
      verificationUtc,
    }),
    schema_version: BROWSER_PACKET_VERIFICATION_SCHEMA_V2,
    browser_summary_path: `stages/${stageId}/artifacts/${attemptSummaryPath(token.token)}`,
    browser_import_summary_path: `stages/${stageId}/artifacts/${attemptImportSummaryPath(token.token)}`,
    selected_execution_token_id: token.token,
    selected_browser_run_id: summary.run_id,
    selected_binding_digest: binding.binding_digest,
    selected_attempt_sequence: selection.selected_attempt_sequence,
    attempt_count: selection.attempt_count,
    attempt_inventory_digest: selection.attempt_inventory_digest,
    selection_record_path: `stages/${stageId}/artifacts/${BROWSER_ATTEMPT_SELECTION_ARTIFACT}`,
    selection_record_sha256: sha256(selectionContent),
    selection_record_bytes: Buffer.byteLength(selectionContent),
    selected_outcome_path: `stages/${stageId}/artifacts/${attemptOutcomePath(token.token)}`,
    selected_outcome_sha256: sha256(outcomeContent),
    selected_outcome_bytes: Buffer.byteLength(outcomeContent),
    cleanup_assurance: outcome.cleanup_assurance,
  };
}

function validateVerificationRecordV2(record) {
  assertExactObject(record, VERIFICATION_V2_FIELDS, [], 'browser freeze verification v2');
  if (record.schema_version !== BROWSER_PACKET_VERIFICATION_SCHEMA_V2
    || record.selection_record_path !== `stages/${record.stage_id}/artifacts/${BROWSER_ATTEMPT_SELECTION_ARTIFACT}`
    || record.browser_summary_path !== `stages/${record.stage_id}/artifacts/${attemptSummaryPath(record.selected_execution_token_id)}`
    || record.browser_import_summary_path !== `stages/${record.stage_id}/artifacts/${attemptImportSummaryPath(record.selected_execution_token_id)}`
    || record.selected_outcome_path !== `stages/${record.stage_id}/artifacts/${attemptOutcomePath(record.selected_execution_token_id)}`
    || record.selected_execution_token_id !== record.execution_token_id
    || record.selected_browser_run_id !== record.browser_run_id
    || record.selected_binding_digest !== record.binding_digest
    || !Number.isInteger(record.selected_attempt_sequence)
    || !Number.isInteger(record.attempt_count)
    || record.selected_attempt_sequence !== record.attempt_count
    || ![record.attempt_inventory_digest, record.selection_record_sha256, record.selected_outcome_sha256].every((value) => /^[a-f0-9]{64}$/.test(value))
    || !Number.isInteger(record.selection_record_bytes)
    || !Number.isInteger(record.selected_outcome_bytes)) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser freeze verification v2 record is invalid.');
  }
  validateCommonVerificationRecord(record, 'browser freeze verification v2');
  return record;
}

function v2VerificationState(rootPath, metadata, stageId, events, chain, tokens, group) {
  if (!['v2-pending', 'v2-complete'].includes(group.kind)) return null;
  const inventory = buildAttemptInventory(rootPath, metadata, stageId, events, { requireOutcomes: true });
  const selected = inventory.tail;
  if (!selected || selected.attempt_status !== 'succeeded') throw new EvidenceError('BROWSER_FINAL_ATTEMPT_NOT_SUCCESSFUL', 'The latest authorized browser attempt is not successful.');
  const token = tokens.find((candidate) => candidate.token === selected.execution_token_id);
  if (!token) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Selected browser attempt token is missing.');
  const { content: summaryContent, summary } = readAttemptSummary(rootPath, stageId, token.token);
  const { content: importContent, importSummary } = readAttemptImportSummary(rootPath, stageId, token.token);
  const outcomeRead = readCanonicalPacketJson(rootPath, browserArtifactPath(rootPath, stageId, attemptOutcomePath(token.token)), BROWSER_LIMITS.summary_bytes);
  const outcome = selected.outcome;
  const binding = assertImportSummaryMatchesEvidence(importSummary, metadata, stageId, token, summaryContent, summary);
  if (outcome.browser_run_id !== summary.run_id
    || outcome.binding_digest !== binding.binding_digest
    || outcome.browser_summary_sha256 !== sha256(summaryContent)
    || outcome.browser_import_summary_sha256 !== sha256(importContent)) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Selected browser attempt outcome does not match retained evidence.');
  }
  const promotionEvent = assertPromotionEvent(events, stageId, token.token, selectedAttemptArtifactPaths(stageId, token.token));
  if (selected.promotion_event_id !== promotionEvent.event_id || selected.promotion_event_hash !== promotionEvent.current_event_hash) {
    throw new EvidenceError('BROWSER_ATTEMPT_SELECTION_INVALID', 'Selected browser attempt inventory does not match the promotion event.');
  }
  const privacyScan = v2PrivacyScan(rootPath, stageId, [summaryContent, importContent, outcomeRead.content]);
  return { inventory, selected, token, summary, summaryContent, importSummary, importContent, outcome, outcomeContent: outcomeRead.content, binding, promotionEvent, privacyScan };
}

function writeOrVerifySelectionRecord(rootPath, metadata, stageId, state) {
  const retainedPath = browserArtifactPath(rootPath, stageId, BROWSER_ATTEMPT_SELECTION_ARTIFACT);
  const candidatePath = resolveInside(rootPath, `quarantine/browser-attempt-selection-candidate.json`);
  const selection = buildSelectionRecord({
    metadata,
    stageId,
    inventory: state.inventory,
    selectedAttempt: state.selected,
    selectedOutcome: state.outcome,
  });
  const content = `${canonicalStringify(selection)}\n`;
  if (existsSync(retainedPath)) {
    const retained = readCanonicalPacketJson(rootPath, retainedPath, BROWSER_LIMITS.summary_bytes);
    const retainedSelection = validateSelection(retained.parsed);
    const expected = buildSelectionRecord({
      metadata,
      stageId,
      inventory: state.inventory,
      selectedAttempt: state.selected,
      selectedOutcome: state.outcome,
      selectionUtc: retainedSelection.selection_utc,
    });
    if (canonicalStringify(retainedSelection) !== canonicalStringify(expected)) throw new EvidenceError('BROWSER_ATTEMPT_SELECTION_INVALID', 'Browser attempt selection conflicts with retained evidence.');
    return { selection: retainedSelection, content: retained.content };
  }
  if (existsSync(candidatePath)) {
    const candidate = readCanonicalPacketJson(rootPath, candidatePath, BROWSER_LIMITS.summary_bytes, [0o600]);
    if (canonicalStringify(validateSelection(candidate.parsed)) !== canonicalStringify(selection)) throw new EvidenceError('BROWSER_ATTEMPT_SELECTION_INVALID', 'Browser attempt selection candidate conflicts with retained evidence.');
  } else {
    writeJsonAtomic(candidatePath, selection, 0o600, rootPath);
  }
  writeJsonAtomic(retainedPath, selection, 0o600, rootPath);
  if (existsSync(candidatePath)) {
    unlinkSync(candidatePath);
    fsyncDirectory(dirname(candidatePath));
  }
  registerBrowserAttemptEntries(rootPath, metadata, stageId, [expectedSelectionEntry()]);
  return { selection, content };
}

function assertVerificationMatchesStateV2(record, { metadata, stageId, state, chain, selection, selectionContent }) {
  validateVerificationRecordV2(record);
  const historicalChain = { ...chain, head: record.event_chain_head_at_verification };
  const expected = buildVerificationRecordV2({
    metadata,
    stageId,
    token: state.token,
    summary: state.summary,
    summaryContent: state.summaryContent,
    importSummary: state.importSummary,
    importContent: state.importContent,
    outcome: state.outcome,
    outcomeContent: state.outcomeContent,
    binding: state.binding,
    promotionEvent: state.promotionEvent,
    chain: historicalChain,
    privacyScan: state.privacyScan,
    verificationUtc: record.verification_utc,
    selection,
    selectionContent,
  });
  if (canonicalStringify(record) !== canonicalStringify(expected)) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser freeze verification v2 does not match retained evidence.');
  return record;
}

function writeOrVerifyVerificationRecordV2(rootPath, stageId, state, metadata, chain, selectionRecord) {
  const retainedPath = retainedVerificationPath(rootPath, stageId);
  const candidatePath = verificationCandidatePath(rootPath);
  if (existsSync(retainedPath)) {
    const retained = readCanonicalPacketJson(rootPath, retainedPath, BROWSER_LIMITS.summary_bytes);
    const record = assertVerificationMatchesStateV2(retained.parsed, { metadata, stageId, state, chain, ...selectionRecord });
    if (existsSync(candidatePath)) unlinkSync(candidatePath);
    return record;
  }
  const verificationUtc = new Date(Math.max(
    Date.parse(utcNow()),
    Date.parse(chain.lastActionTimestamp),
    Date.parse(state.importSummary.imported_utc),
    Date.parse(state.promotionEvent.action_timestamp),
    Date.parse(selectionRecord.selection.selection_utc),
  )).toISOString();
  const record = buildVerificationRecordV2({ metadata, stageId, token: state.token, summary: state.summary, summaryContent: state.summaryContent, importSummary: state.importSummary, importContent: state.importContent, outcome: state.outcome, outcomeContent: state.outcomeContent, binding: state.binding, promotionEvent: state.promotionEvent, chain, privacyScan: state.privacyScan, verificationUtc, selection: selectionRecord.selection, selectionContent: selectionRecord.content });
  validateVerificationRecordV2(record);
  writeJsonAtomic(candidatePath, record, 0o600, rootPath);
  writeJsonAtomic(retainedPath, record, 0o600, rootPath);
  unlinkSync(candidatePath);
  fsyncDirectory(dirname(candidatePath));
  return record;
}

function browserVerificationState(rootPath, metadata, stageId, events, chain, tokens) {
  validateControlledSlug(stageId, 'browser verification stage ID');
  const group = inspectBrowserArtifactGroup(rootPath, metadata.operation_id, stageId);
  if (group.kind === 'none') return { kind: 'none', group };
  if (group.kind === 'v2-pending' || group.kind === 'v2-complete') return { kind: group.kind, group, v2: v2VerificationState(rootPath, metadata, stageId, events, chain, tokens, group) };
  if (group.kind !== 'pending' && group.kind !== 'complete') {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser evidence is not in a verifiable state.');
  }
  const { content: summaryContent, summary } = readBrowserSummary(rootPath, stageId);
  const { content: importContent, importSummary } = readImportSummary(rootPath, stageId);
  const token = assertCompletedToken(tokens, stageId, importSummary.execution_token_id);
  assertTerminalTokenEvent(events, stageId, token.token);
  const binding = assertImportSummaryMatchesEvidence(importSummary, metadata, stageId, token, summaryContent, summary);
  const promotionEvent = assertPromotionEvent(events, stageId, token.token, expectedArtifactPaths(stageId));
  if (promotionEvent.current_event_hash !== chain.head) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser promotion event must be the current event-chain head before stage freeze.');
  }
  const privacyScan = scanBrowserPrivacy(rootPath, stageId, [summaryContent, importContent]);
  if (existsSync(transactionPath(rootPath))) throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser import transaction remains unresolved.');
  for (const candidate of ['browser-summary-candidate.json', 'browser-import-summary-candidate.json']) {
    if (existsSync(resolveInside(rootPath, `quarantine/${candidate}`))) {
      throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser import candidate remains unresolved.');
    }
  }
  return {
    kind: group.kind,
    group,
    summary,
    summaryContent,
    importSummary,
    importContent,
    token,
    binding,
    promotionEvent,
    privacyScan,
  };
}

function writeOrVerifyVerificationRecord(rootPath, stageId, state, metadata, chain) {
  const retainedPath = retainedVerificationPath(rootPath, stageId);
  const candidatePath = verificationCandidatePath(rootPath);
  if (existsSync(retainedPath)) {
    const { content, parsed } = readCanonicalPacketJson(rootPath, retainedPath, BROWSER_LIMITS.summary_bytes);
    const record = assertVerificationMatchesState(parsed, { metadata, stageId, ...state, chain });
    packetSideScan(content);
    if (existsSync(candidatePath)) {
      const candidate = readCanonicalPacketJson(rootPath, candidatePath, BROWSER_LIMITS.summary_bytes);
      assertVerificationMatchesState(candidate.parsed, { metadata, stageId, ...state, chain });
      unlinkSync(candidatePath);
      fsyncDirectory(dirname(candidatePath));
    }
    return record;
  }

  let record;
  if (existsSync(candidatePath)) {
    const { content, parsed } = readCanonicalPacketJson(rootPath, candidatePath, BROWSER_LIMITS.summary_bytes, [0o600]);
    record = assertVerificationMatchesState(parsed, { metadata, stageId, ...state, chain });
    packetSideScan(content);
  } else {
    const notBefore = Math.max(
      validateTimestamp(chain.lastActionTimestamp, 'event chain timestamp'),
      validateTimestamp(state.importSummary.imported_utc, 'browser import timestamp'),
      validateTimestamp(state.promotionEvent.action_timestamp, 'browser promotion timestamp'),
    );
    record = buildVerificationRecord({
      metadata,
      stageId,
      ...state,
      chain,
      verificationUtc: new Date(Math.max(Date.parse(utcNow()), notBefore)).toISOString(),
    });
    validateVerificationRecord(record);
    const content = `${canonicalStringify(record)}\n`;
    packetSideScan(content);
    writeJsonAtomic(candidatePath, record, 0o600, rootPath);
  }

  writeJsonAtomic(retainedPath, record, 0o600, rootPath);
  assertPacketOwnedFile(rootPath, retainedPath, [0o600], BROWSER_LIMITS.summary_bytes);
  unlinkSync(candidatePath);
  fsyncDirectory(dirname(candidatePath));
  return record;
}

function registerVerificationArtifact(rootPath, operationId, stageId) {
  const indexPath = resolveInside(rootPath, `stages/${stageId}/artifact-index.json`);
  const index = readArtifactIndex(rootPath, operationId, stageId, [0o600]);
  const addition = browserVerificationIndexEntry();
  const matches = index.artifacts.filter((entry) => entry.path === addition.path);
  if (matches.length > 1 || (matches.length === 1 && !matchingEntry(matches[0], addition))) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser verification artifact index entry conflicts with retained evidence.');
  }
  if (matches.length === 0) {
    if (index.artifacts.length >= LIMITS.artifact_count_per_stage) throw new EvidenceError('ARTIFACT_COUNT_LIMIT', 'Artifact count exceeds its configured limit.');
    index.artifacts.push(addition);
    index.artifacts.sort((left, right) => compareStrings(left.path, right.path));
    writeJsonAtomic(indexPath, index, 0o600, rootPath);
  }
  return readArtifactIndex(rootPath, operationId, stageId, [0o600]);
}

export function ensureBrowserVerificationForFreeze({ rootPath, metadata, stageId, events, chain, tokens }) {
  const state = browserVerificationState(rootPath, metadata, stageId, events, chain, tokens);
  if (state.kind === 'none') return null;
  if (state.kind === 'v2-pending' || state.kind === 'v2-complete') {
    const selectionRecord = writeOrVerifySelectionRecord(rootPath, metadata, stageId, state.v2);
    const record = writeOrVerifyVerificationRecordV2(rootPath, stageId, state.v2, metadata, chain, selectionRecord);
    registerVerificationArtifact(rootPath, metadata.operation_id, stageId);
    const group = inspectBrowserArtifactGroup(rootPath, metadata.operation_id, stageId, [0o600]);
    if (group.kind !== 'v2-complete') throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser verification v2 artifact was not registered.');
    verifyBrowserStageEvidence({ rootPath, metadata, stageId, events, chain, tokens });
    return record;
  }
  const record = writeOrVerifyVerificationRecord(rootPath, stageId, state, metadata, chain);
  registerVerificationArtifact(rootPath, metadata.operation_id, stageId);
  const group = inspectBrowserArtifactGroup(rootPath, metadata.operation_id, stageId, [0o600]);
  if (group.kind !== 'complete') throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser verification artifact was not registered.');
  verifyBrowserStageEvidence({ rootPath, metadata, stageId, events, chain, tokens });
  return record;
}

export function verifyBrowserStageEvidence({ rootPath, metadata, stageId, events, chain, tokens }) {
  const state = browserVerificationState(rootPath, metadata, stageId, events, chain, tokens);
  if (state.kind === 'none') return null;
  if (state.kind === 'v2-pending') throw new EvidenceError('BROWSER_VERIFICATION_DEFERRED', BROWSER_VERIFICATION_DEFERRED_MESSAGE);
  if (state.kind === 'v2-complete') {
    const selectionRead = readCanonicalPacketJson(rootPath, browserArtifactPath(rootPath, stageId, BROWSER_ATTEMPT_SELECTION_ARTIFACT), BROWSER_LIMITS.summary_bytes);
    const selection = validateSelection(selectionRead.parsed);
    if (selection.attempt_inventory_digest !== state.v2.inventory.digest || selection.selected_execution_token_id !== state.v2.selected.execution_token_id) throw new EvidenceError('BROWSER_ATTEMPT_SELECTION_INVALID', 'Browser attempt selection does not match inventory.');
    const { parsed: record } = readCanonicalPacketJson(rootPath, retainedVerificationPath(rootPath, stageId), BROWSER_LIMITS.summary_bytes);
    return assertVerificationMatchesStateV2(record, { metadata, stageId, state: state.v2, chain, selection, selectionContent: selectionRead.content });
  }
  if (state.kind !== 'complete') throw new EvidenceError('BROWSER_VERIFICATION_DEFERRED', BROWSER_VERIFICATION_DEFERRED_MESSAGE);
  const { parsed: record } = readCanonicalPacketJson(rootPath, retainedVerificationPath(rootPath, stageId), BROWSER_LIMITS.summary_bytes);
  return assertVerificationMatchesState(record, { metadata, stageId, ...state, chain });
}

export function verifyBrowserVerificationRecordStructural(rootPath, operationId, stageId, group = null, modes = [0o600, 0o400]) {
  const currentGroup = group ?? inspectBrowserArtifactGroup(rootPath, operationId, stageId, modes);
  if (currentGroup.kind === 'none') return null;
  if (currentGroup.kind === 'v2-pending') throw new EvidenceError('BROWSER_VERIFICATION_DEFERRED', BROWSER_VERIFICATION_DEFERRED_MESSAGE);
  if (currentGroup.kind === 'v2-complete') {
    const recordRead = readCanonicalPacketJson(rootPath, retainedVerificationPath(rootPath, stageId), BROWSER_LIMITS.summary_bytes, modes);
    return validateVerificationRecordV2(recordRead.parsed);
  }
  if (currentGroup.kind !== 'complete') throw new EvidenceError('BROWSER_VERIFICATION_DEFERRED', BROWSER_VERIFICATION_DEFERRED_MESSAGE);
  const { content: summaryContent, summary } = readBrowserSummary(rootPath, stageId);
  const { content: importContent, importSummary } = readImportSummary(rootPath, stageId);
  const { content: verificationContent, parsed: record } = readCanonicalPacketJson(rootPath, retainedVerificationPath(rootPath, stageId), BROWSER_LIMITS.summary_bytes, modes);
  validateVerificationRecord(record);
  packetSideScan(verificationContent);
  if (record.operation_id !== operationId
    || record.stage_id !== stageId
    || record.execution_token_id !== importSummary.execution_token_id
    || record.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || record.browser_run_id !== summary.run_id
    || record.binding_digest !== summary.binding_digest
    || record.binding_digest !== importSummary.binding_digest
    || record.source_binding_mode !== summary.source_binding_mode
    || record.source_binding_mode !== importSummary.source_binding_mode
    || record.source_manifest_digest !== summary.source_manifest_digest
    || record.source_manifest_digest !== importSummary.source_manifest_digest
    || record.browser_summary_sha256 !== sha256(summaryContent)
    || record.browser_summary_sha256 !== importSummary.browser_summary_sha256
    || record.browser_summary_bytes !== Buffer.byteLength(summaryContent)
    || record.browser_summary_bytes !== importSummary.browser_summary_bytes
    || record.browser_import_summary_sha256 !== sha256(importContent)
    || record.browser_import_summary_bytes !== Buffer.byteLength(importContent)) {
    throw new EvidenceError('BROWSER_VERIFICATION_INVALID', 'Browser verification record does not match retained browser artifacts.');
  }
  return record;
}
