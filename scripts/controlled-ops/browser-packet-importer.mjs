import {
  closeSync,
  existsSync,
  fsyncSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EvidenceError,
  LIMITS,
  assertExactObject,
  assertOperationRoot,
  assertPacketOwnedDirectory,
  assertPacketOwnedFile,
  canonicalStringify,
  compareStrings,
  fsyncDirectory,
  openExclusivePacketFile,
  readDirectorySorted,
  resolveInside,
  safeError,
  sha256,
  utcNow,
  validateControlledSlug,
  validateRelativePath,
  validateTimestamp,
  withPacketMutationLock,
  writeJsonAtomic,
} from './internal.mjs';
import { readCanonicalJsonFile } from './manifest.mjs';
import { appendEventUnderPacketMutation, verifyEventChain, readEvents } from './evidence.mjs';
import {
  BROWSER_WORKFLOW_COMMAND_CATEGORY,
  BROWSER_LIMITS,
  BROWSER_SUMMARY_SCHEMA,
  createBrowserPacketBinding,
  validateGeneratedBrowserId,
  validateSummary,
} from './browser-schema.mjs';
import {
  cleanupBrowserEvidence,
  createBrowserWorkspaceLaunchContract,
  importGeneratedBrowserWorkspaceJournal,
  verifyBrowserSummary,
} from './browser-importer.mjs';
import { parseStrictJson, scanCustomerContent, scanSensitiveContent } from './sanitize.mjs';

export const BROWSER_PACKET_IMPORT_SCHEMA = 'servsync-controlled-ops/browser-packet-import-v1';
export const BROWSER_PACKET_IMPORT_STATUS = 'browser-promoted';
export const BROWSER_SUMMARY_ARTIFACT = 'browser-summary.json';
export const BROWSER_IMPORT_SUMMARY_ARTIFACT = 'browser-import-summary.json';
export const BROWSER_IMPORT_TRANSACTION_ARTIFACT = 'browser-import-transaction.json';

const TOKEN_FIELDS = ['schema_version', 'operation_id', 'stage_id', 'token', 'command_category', 'expected_result', 'state', 'claimed_at', 'started_at', 'completed_at', 'command_result', 'harness_result', 'retry'];
const TRANSACTION_FIELDS = [
  'schema_version',
  'operation_id',
  'stage_id',
  'execution_token_id',
  'command_category',
  'binding_digest',
  'browser_run_id',
  'source_binding_mode',
  'source_manifest_digest',
  'browser_summary_sha256',
  'browser_summary_bytes',
  'transaction_state',
  'workspace_cleanup_status',
  'browser_summary_artifact_status',
  'browser_import_summary_artifact_status',
  'artifact_index_status',
  'promotion_event_status',
  'prepared_utc',
  'updated_utc',
];
const TRANSACTION_STATES = new Set(['prepared', 'workspace_cleaned', 'artifacts_written', 'index_registered', 'event_recorded', 'completed']);
const ARTIFACT_STATUSES = new Set(['absent', 'written']);
const INDEX_STATUSES = new Set(['absent', 'registered']);
const EVENT_STATUSES = new Set(['absent', 'recorded']);
const CLEANUP_STATUSES = new Set(['pending', 'cleaned']);

function assertCompletedBrowserWorkflowToken(rootPath, metadata, stageId, tokenId) {
  validateControlledSlug(stageId, 'browser packet stage ID');
  validateControlledSlug(tokenId, 'browser packet execution token ID');
  const stagePath = resolveInside(rootPath, `stages/${stageId}`);
  if (!existsSync(stagePath) || existsSync(join(stagePath, 'stage-freeze.json'))) {
    throw new EvidenceError('BROWSER_PACKET_STAGE_INVALID', 'Browser packet import requires an existing workflow-unfrozen stage.');
  }
  const tokenPath = resolveInside(rootPath, `tokens/${tokenId}.json`);
  const token = readCanonicalJsonFile(tokenPath);
  assertExactObject(token, TOKEN_FIELDS, [], 'browser packet execution token');
  if (token.schema_version !== 'servsync-controlled-ops/execution-token-v2'
    || token.operation_id !== metadata.operation_id
    || token.stage_id !== stageId
    || token.token !== tokenId
    || token.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY) {
    throw new EvidenceError('BROWSER_PACKET_TOKEN_INVALID', 'Browser packet import token identity is invalid.');
  }
  if (token.state !== 'completed'
    || token.command_result?.exit_kind !== 'normal'
    || token.command_result.exit_code !== 0
    || !['completed', 'evidence_complete'].includes(token.harness_result?.classification)) {
    throw new EvidenceError('BROWSER_PACKET_TOKEN_NOT_SUCCESSFUL', 'Browser packet import requires a successfully completed execution token.');
  }
  const terminal = readEvents(rootPath).filter((event) => event.event_id === `${tokenId}-completed`);
  if (terminal.length !== 1
    || terminal[0].stage_id !== stageId
    || terminal[0].command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || terminal[0].observed_result !== 'passed'
    || terminal[0].exit_code !== 0) {
    throw new EvidenceError('BROWSER_PACKET_TOKEN_TIMELINE_INVALID', 'Browser packet import token lacks matching successful terminal evidence.');
  }
  return token;
}

function assertLaunchEligibleToken(rootPath, metadata, stageId, tokenId) {
  validateControlledSlug(stageId, 'browser packet stage ID');
  validateControlledSlug(tokenId, 'browser packet execution token ID');
  const stagePath = resolveInside(rootPath, `stages/${stageId}`);
  if (!existsSync(stagePath) || existsSync(join(stagePath, 'stage-freeze.json'))) {
    throw new EvidenceError('BROWSER_PACKET_STAGE_INVALID', 'Browser launch binding requires an existing workflow-unfrozen stage.');
  }
  const token = readCanonicalJsonFile(resolveInside(rootPath, `tokens/${tokenId}.json`));
  assertExactObject(token, TOKEN_FIELDS, [], 'browser packet execution token');
  if (token.schema_version !== 'servsync-controlled-ops/execution-token-v2'
    || token.operation_id !== metadata.operation_id
    || token.stage_id !== stageId
    || token.token !== tokenId
    || token.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY) {
    throw new EvidenceError('BROWSER_PACKET_TOKEN_INVALID', 'Browser launch binding token identity is invalid.');
  }
  if (!['claimed', 'started'].includes(token.state)) {
    throw new EvidenceError('BROWSER_PACKET_TOKEN_STATE_INVALID', 'Browser launch binding requires an active browser workflow token.');
  }
  return token;
}

function fixedPacketBindingInput(metadata, stageId, tokenId) {
  return {
    operation_id: metadata.operation_id,
    stage_id: stageId,
    execution_token_id: tokenId,
    command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
  };
}

export function createPacketBoundBrowserLaunchContract({
  operationRoot,
  stageId,
  executionTokenId,
  browserWorkspace,
  baseURL,
  runLabel,
} = {}) {
  const { rootPath, metadata } = assertOperationRoot(operationRoot, { allowSealed: false });
  return withPacketMutationLock(rootPath, 'browser-launch-binding', ({ rootPath: lockedRoot, metadata: lockedMetadata }) => {
    assertLaunchEligibleToken(lockedRoot, lockedMetadata, stageId, executionTokenId);
    return createBrowserWorkspaceLaunchContract({
      cleanupHandle: browserWorkspace?.cleanupHandle,
      baseURL,
      runLabel,
      packetBinding: fixedPacketBindingInput(lockedMetadata, stageId, executionTokenId),
    });
  });
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
    throw new EvidenceError('BROWSER_PACKET_SUMMARY_NOT_ELIGIBLE', 'Browser packet import requires successful complete generated browser evidence.');
  }
  for (const test of summary.tests) {
    if (test.status !== 'passed' || test.worker_index !== 0 || test.retry_index !== 0) {
      throw new EvidenceError('BROWSER_PACKET_SUMMARY_NOT_ELIGIBLE', 'Browser packet import requires successful worker-zero retry-zero tests.');
    }
    for (const aggregate of [test.observability.console, test.observability.page_error, test.observability.network]) {
      if (aggregate.completeness_status !== 'complete'
        || aggregate.overflow_count !== 0
        || aggregate.late_event_count !== 0
        || aggregate.listener_error_count !== 0
        || aggregate.collector_failure_class !== 'none') {
        throw new EvidenceError('BROWSER_PACKET_SUMMARY_NOT_ELIGIBLE', 'Browser packet import requires complete collector aggregates.');
      }
    }
    const network = test.observability.network;
    if (network.unresolved_request_count !== 0
      || network.duplicate_terminal_count !== 0
      || network.unexpected_page_count !== 0
      || network.websocket_attempt_count !== 0
      || network.worker_attempt_count !== 0) {
      throw new EvidenceError('BROWSER_PACKET_SUMMARY_NOT_ELIGIBLE', 'Browser packet import rejects unsupported browser activity.');
    }
  }
}

function canonicalJsonBytes(value, label) {
  const content = `${canonicalStringify(value)}\n`;
  const parsed = parseStrictJson(content.slice(0, -1));
  if (content !== `${canonicalStringify(parsed)}\n`) {
    throw new EvidenceError('BROWSER_PACKET_NONCANONICAL_JSON', `${label} must be canonical JSON.`);
  }
  return content;
}

function packetSideScan(content) {
  const scanContent = content;
  const secretFindings = scanSensitiveContent(scanContent, { includeEntropy: false });
  if (secretFindings.length > 0) throw new EvidenceError('BROWSER_PACKET_SECRET_SCAN_FAILED', 'Browser packet candidate failed secret scanning.');
  const customerFindings = scanCustomerContent(scanContent);
  if (customerFindings.length > 0) throw new EvidenceError('BROWSER_PACKET_CUSTOMER_SCAN_FAILED', 'Browser packet candidate failed customer-content scanning.');
  return { secret_findings: 0, customer_content_findings: 0 };
}

function writePacketFileExclusive(rootPath, destination, content) {
  const descriptor = openExclusivePacketFile(rootPath, destination, 0o600);
  try {
    writeFileSync(descriptor, content, 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  fsyncDirectory(dirname(destination));
  return assertPacketOwnedFile(rootPath, destination, [0o600], LIMITS.artifact_bytes);
}

function writeQuarantine(rootPath, name, content) {
  validateRelativePath(name, 'browser packet quarantine name');
  const path = resolveInside(rootPath, `quarantine/${name}`);
  writePacketFileExclusive(rootPath, path, content);
  return path;
}

function verifyPacketFileContent(rootPath, path, expectedContent, maximumBytes = LIMITS.artifact_bytes) {
  const info = assertPacketOwnedFile(rootPath, path, [0o600], maximumBytes);
  if (readFileSync(path, 'utf8') !== expectedContent) {
    throw new EvidenceError('BROWSER_PACKET_STATE_CONFLICT', 'Browser packet retained evidence does not match the recoverable transaction.');
  }
  return info;
}

function writeOrVerifyPacketFile(rootPath, destination, content, maximumBytes = LIMITS.artifact_bytes) {
  if (existsSync(destination)) return verifyPacketFileContent(rootPath, destination, content, maximumBytes);
  return writePacketFileExclusive(rootPath, destination, content);
}

function copyCandidateToArtifact(rootPath, source, destination, maximumBytes = LIMITS.artifact_bytes) {
  assertPacketOwnedFile(rootPath, source, [0o600], LIMITS.artifact_bytes);
  const content = readFileSync(source, 'utf8');
  return writeOrVerifyPacketFile(rootPath, destination, content, maximumBytes);
}

function transactionPath(rootPath) {
  return resolveInside(rootPath, `quarantine/${BROWSER_IMPORT_TRANSACTION_ARTIFACT}`);
}

function summaryCandidatePath(rootPath) {
  return resolveInside(rootPath, 'quarantine/browser-summary-candidate.json');
}

function importSummaryCandidatePath(rootPath) {
  return resolveInside(rootPath, 'quarantine/browser-import-summary-candidate.json');
}

function validateTransaction(transaction, metadata, stageId, executionTokenId) {
  assertExactObject(transaction, TRANSACTION_FIELDS, [], 'browser import transaction');
  if (transaction.schema_version !== 'servsync-controlled-ops/browser-import-transaction-v1'
    || transaction.operation_id !== metadata.operation_id
    || transaction.stage_id !== stageId
    || transaction.execution_token_id !== executionTokenId
    || transaction.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || transaction.source_binding_mode !== 'current_source_snapshot'
    || !/^[a-f0-9]{64}$/.test(transaction.binding_digest)
    || !/^[a-f0-9]{64}$/.test(transaction.source_manifest_digest)
    || !/^[a-f0-9]{64}$/.test(transaction.browser_summary_sha256)
    || !Number.isInteger(transaction.browser_summary_bytes)
    || transaction.browser_summary_bytes <= 0
    || transaction.browser_summary_bytes > BROWSER_LIMITS.summary_bytes
    || !TRANSACTION_STATES.has(transaction.transaction_state)
    || !CLEANUP_STATUSES.has(transaction.workspace_cleanup_status)
    || !ARTIFACT_STATUSES.has(transaction.browser_summary_artifact_status)
    || !ARTIFACT_STATUSES.has(transaction.browser_import_summary_artifact_status)
    || !INDEX_STATUSES.has(transaction.artifact_index_status)
    || !EVENT_STATUSES.has(transaction.promotion_event_status)) {
    throw new EvidenceError('BROWSER_PACKET_TRANSACTION_INVALID', 'Browser import transaction is invalid.');
  }
  validateControlledSlug(transaction.operation_id, 'browser import transaction operation ID');
  validateControlledSlug(transaction.stage_id, 'browser import transaction stage ID');
  validateControlledSlug(transaction.execution_token_id, 'browser import transaction execution token ID');
  validateGeneratedBrowserId(transaction.browser_run_id, 'browser import transaction run ID');
  validateTimestamp(transaction.prepared_utc, 'browser import transaction prepared timestamp');
  validateTimestamp(transaction.updated_utc, 'browser import transaction updated timestamp');
  return transaction;
}

function readTransaction(rootPath, metadata, stageId, executionTokenId) {
  const path = transactionPath(rootPath);
  if (!existsSync(path)) return null;
  const transaction = readCanonicalJsonFile(path);
  return validateTransaction(transaction, metadata, stageId, executionTokenId);
}

function writeTransaction(rootPath, transaction, updatedUtc = utcNow()) {
  const next = validateTransaction({ ...transaction, updated_utc: updatedUtc }, { operation_id: transaction.operation_id }, transaction.stage_id, transaction.execution_token_id);
  writeJsonAtomic(transactionPath(rootPath), next, 0o600, rootPath);
  assertPacketOwnedFile(rootPath, transactionPath(rootPath), [0o600], LIMITS.manifest_bytes);
  return next;
}

function removePacketFile(rootPath, path) {
  assertPacketOwnedFile(rootPath, path, [0o600], LIMITS.artifact_bytes);
  unlinkSync(path);
  fsyncDirectory(dirname(path));
}

function browserArtifactEntries() {
  return [
    { path: BROWSER_IMPORT_SUMMARY_ARTIFACT, artifact_class: 'browser_import_summary', sanitization_status: 'internal', summary_path: BROWSER_IMPORT_SUMMARY_ARTIFACT },
    { path: BROWSER_SUMMARY_ARTIFACT, artifact_class: 'browser_summary', sanitization_status: 'internal', summary_path: BROWSER_IMPORT_SUMMARY_ARTIFACT },
  ];
}

function matchingEntry(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function registerOrVerifyBrowserArtifacts(rootPath, metadata, stageId) {
  const stagePath = resolveInside(rootPath, `stages/${stageId}`);
  const indexPath = join(stagePath, 'artifact-index.json');
  const index = readCanonicalJsonFile(indexPath);
  assertExactObject(index, ['schema_version', 'operation_id', 'stage_id', 'artifacts'], [], 'artifact index');
  if (index.schema_version !== 'servsync-controlled-ops/artifact-index-v2'
    || index.operation_id !== metadata.operation_id
    || index.stage_id !== stageId
    || !Array.isArray(index.artifacts)) {
    throw new EvidenceError('INVALID_ARTIFACT_INDEX', 'Browser packet import requires a valid artifact index.');
  }
  const additions = browserArtifactEntries();
  for (const addition of additions) {
    const matches = index.artifacts.filter((entry) => entry.path === addition.path);
    if (matches.length > 1 || (matches.length === 1 && !matchingEntry(matches[0], addition))) {
      throw new EvidenceError('BROWSER_PACKET_STATE_CONFLICT', 'Browser packet artifact index conflicts with the recoverable transaction.');
    }
  }
  const missing = additions.filter((addition) => !index.artifacts.some((entry) => entry.path === addition.path));
  if (index.artifacts.length + missing.length > LIMITS.artifact_count_per_stage) {
    throw new EvidenceError('ARTIFACT_COUNT_LIMIT', 'Artifact count exceeds its configured limit.');
  }
  index.artifacts.push(...missing);
  index.artifacts.sort((a, b) => compareStrings(a.path, b.path));
  writeJsonAtomic(indexPath, index, 0o600, rootPath);
  return readCanonicalJsonFile(indexPath);
}

function assertNoExistingBrowserImport(rootPath, stageId) {
  const artifactDir = resolveInside(rootPath, `stages/${stageId}/artifacts`);
  assertPacketOwnedDirectory(rootPath, artifactDir, [0o700]);
  for (const name of [BROWSER_SUMMARY_ARTIFACT, BROWSER_IMPORT_SUMMARY_ARTIFACT]) {
    if (existsSync(join(artifactDir, name))) {
      throw new EvidenceError('BROWSER_PACKET_IMPORT_EXISTS', 'Browser packet import already exists.');
    }
  }
  for (const current of readDirectorySorted(resolveInside(rootPath, 'quarantine'))) {
    if (current.includes('browser-summary') || current.includes('browser-import-summary') || current === BROWSER_IMPORT_TRANSACTION_ARTIFACT) {
      throw new EvidenceError('BROWSER_PACKET_QUARANTINE_NOT_EMPTY', 'Browser packet import encountered unresolved quarantine evidence.');
    }
  }
}

function assertNoExistingOrConflictingBrowserImport(rootPath, stageId, hasTransaction) {
  if (hasTransaction) return;
  assertNoExistingBrowserImport(rootPath, stageId);
}

function browserEventInput(stageId, executionTokenId, importedAt, artifactPaths) {
  return {
    stage_id: stageId,
    event_id: `${executionTokenId}-browser-evidence`,
    event_type: 'browser-promoted',
    action_timestamp: importedAt,
    archive_timestamp: null,
    command_category: BROWSER_WORKFLOW_COMMAND_CATEGORY,
    expected_result: 'completed',
    observed_result: 'browser-promoted',
    result_classification: 'passed',
    exit_code: null,
    sanitized_artifact_paths: artifactPaths,
  };
}

function verifyOrAppendBrowserEvent(rootPath, metadata, stageId, executionTokenId, importedAt, artifactPaths) {
  const expectedInput = browserEventInput(stageId, executionTokenId, importedAt, artifactPaths);
  const existing = readEvents(rootPath).filter((event) => event.event_id === expectedInput.event_id);
  if (existing.length > 1) throw new EvidenceError('BROWSER_PACKET_EVENT_CONFLICT', 'Browser promotion event is duplicated.');
  if (existing.length === 1) {
    const [event] = existing;
    if (event.stage_id !== stageId
      || event.event_type !== expectedInput.event_type
      || event.command_category !== expectedInput.command_category
      || event.expected_result !== expectedInput.expected_result
      || event.observed_result !== expectedInput.observed_result
      || event.result_classification !== expectedInput.result_classification
      || event.exit_code !== null
      || canonicalStringify(event.sanitized_artifact_paths) !== canonicalStringify(artifactPaths)) {
      throw new EvidenceError('BROWSER_PACKET_EVENT_CONFLICT', 'Browser promotion event conflicts with retained evidence.');
    }
    return event;
  }
  const head = verifyEventChain(rootPath).head;
  return appendEventUnderPacketMutation(rootPath, metadata, head, expectedInput);
}

export function verifyPromotedBrowserPacketEvidence(rootPath, metadata, stageId, executionTokenId, { workspaceCleaned = false, allowPendingTransaction = false } = {}) {
  const artifactDir = resolveInside(rootPath, `stages/${stageId}/artifacts`);
  const summaryPath = join(artifactDir, BROWSER_SUMMARY_ARTIFACT);
  const importSummaryPath = join(artifactDir, BROWSER_IMPORT_SUMMARY_ARTIFACT);
  const summaryContent = readFileSync(summaryPath, 'utf8');
  assertPacketOwnedFile(rootPath, summaryPath, [0o600], BROWSER_LIMITS.summary_bytes);
  assertPacketOwnedFile(rootPath, importSummaryPath, [0o600], BROWSER_LIMITS.summary_bytes);
  const summary = validateSummary(readCanonicalJsonFile(summaryPath, BROWSER_LIMITS.summary_bytes));
  const importSummary = validateBrowserImportSummary(readCanonicalJsonFile(importSummaryPath, BROWSER_LIMITS.summary_bytes));
  if (importSummary.operation_id !== metadata.operation_id
    || importSummary.stage_id !== stageId
    || importSummary.execution_token_id !== executionTokenId
    || importSummary.binding_digest !== summary.binding_digest
    || importSummary.browser_run_id !== summary.run_id
    || importSummary.source_manifest_digest !== summary.source_manifest_digest
    || importSummary.browser_summary_sha256 !== sha256(summaryContent)
    || importSummary.browser_summary_bytes !== Buffer.byteLength(summaryContent)) {
    throw new EvidenceError('BROWSER_PACKET_STATE_CONFLICT', 'Browser import summary does not match retained summary evidence.');
  }
  const index = readCanonicalJsonFile(resolveInside(rootPath, `stages/${stageId}/artifact-index.json`));
  for (const entry of browserArtifactEntries()) {
    const matches = index.artifacts.filter((current) => current.path === entry.path);
    if (matches.length !== 1 || !matchingEntry(matches[0], entry)) {
      throw new EvidenceError('BROWSER_PACKET_STATE_CONFLICT', 'Browser artifact index does not match retained browser evidence.');
    }
  }
  const artifactPaths = [
    `stages/${stageId}/artifacts/${BROWSER_SUMMARY_ARTIFACT}`,
    `stages/${stageId}/artifacts/${BROWSER_IMPORT_SUMMARY_ARTIFACT}`,
  ];
  const events = readEvents(rootPath).filter((event) => event.event_id === `${executionTokenId}-browser-evidence`);
  if (events.length !== 1
    || events[0].stage_id !== stageId
    || events[0].event_type !== 'browser-promoted'
    || events[0].command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || events[0].observed_result !== 'browser-promoted'
    || canonicalStringify(events[0].sanitized_artifact_paths) !== canonicalStringify(artifactPaths)) {
    throw new EvidenceError('BROWSER_PACKET_EVENT_CONFLICT', 'Browser promotion event does not match retained evidence.');
  }
  if (!allowPendingTransaction && (existsSync(transactionPath(rootPath))
    || existsSync(summaryCandidatePath(rootPath))
    || existsSync(importSummaryCandidatePath(rootPath)))) {
    throw new EvidenceError('BROWSER_PACKET_TRANSACTION_PENDING', 'Browser packet import transaction is still pending.');
  }
  if (workspaceCleaned !== true) {
    throw new EvidenceError('BROWSER_PACKET_CLEANUP_FAILED', 'Browser packet import requires confirmed workspace cleanup.');
  }
  return { summary, importSummary, artifactPaths };
}

export function promoteGeneratedBrowserEvidenceToPacket({
  operationRoot,
  stageId,
  executionTokenId,
  browserWorkspace,
  generatedAt = utcNow(),
  importedAt = utcNow(),
} = {}) {
  const { rootPath } = assertOperationRoot(operationRoot, { allowSealed: false });
  let promoted;
  withPacketMutationLock(rootPath, 'browser-packet-import', ({ rootPath: lockedRoot, metadata }) => {
    const token = assertCompletedBrowserWorkflowToken(lockedRoot, metadata, stageId, executionTokenId);
    let transaction = readTransaction(lockedRoot, metadata, stageId, executionTokenId);
    assertNoExistingOrConflictingBrowserImport(lockedRoot, stageId, transaction !== null);
    let summary;
    let summaryContent;
    if (transaction === null) {
      const imported = importGeneratedBrowserWorkspaceJournal({ cleanupHandle: browserWorkspace?.cleanupHandle, generatedAt });
      summary = verifyBrowserSummary(imported.summaryPath);
      const expectedBinding = createBrowserPacketBinding({
        operationId: metadata.operation_id,
        stageId,
        executionTokenId,
        commandCategory: token.command_category,
        browserRunId: summary.run_id,
        sourceBindingMode: summary.source_binding_mode,
        sourceManifestDigest: summary.source_manifest_digest,
      });
      assertSuccessfulBrowserSummary(summary, expectedBinding);
      summaryContent = canonicalJsonBytes(summary, 'browser summary');
      packetSideScan(summaryContent);
      writeQuarantine(lockedRoot, 'browser-summary-candidate.json', summaryContent);
      transaction = writeTransaction(lockedRoot, {
        schema_version: 'servsync-controlled-ops/browser-import-transaction-v1',
        operation_id: metadata.operation_id,
        stage_id: stageId,
        execution_token_id: executionTokenId,
        command_category: token.command_category,
        binding_digest: summary.binding_digest,
        browser_run_id: summary.run_id,
        source_binding_mode: summary.source_binding_mode,
        source_manifest_digest: summary.source_manifest_digest,
        browser_summary_sha256: sha256(summaryContent),
        browser_summary_bytes: Buffer.byteLength(summaryContent),
        transaction_state: 'prepared',
        workspace_cleanup_status: 'pending',
        browser_summary_artifact_status: 'absent',
        browser_import_summary_artifact_status: 'absent',
        artifact_index_status: 'absent',
        promotion_event_status: 'absent',
        prepared_utc: importedAt,
        updated_utc: importedAt,
      }, importedAt);
    } else {
      const candidatePath = summaryCandidatePath(lockedRoot);
      verifyPacketFileContent(lockedRoot, candidatePath, readFileSync(candidatePath, 'utf8'), BROWSER_LIMITS.summary_bytes);
      summaryContent = readFileSync(candidatePath, 'utf8');
      if (sha256(summaryContent) !== transaction.browser_summary_sha256
        || Buffer.byteLength(summaryContent) !== transaction.browser_summary_bytes) {
        throw new EvidenceError('BROWSER_PACKET_STATE_CONFLICT', 'Browser summary candidate does not match the recoverable transaction.');
      }
      summary = validateSummary(parseStrictJson(summaryContent.slice(0, -1)));
      const expectedBinding = createBrowserPacketBinding({
        operationId: metadata.operation_id,
        stageId,
        executionTokenId,
        commandCategory: token.command_category,
        browserRunId: transaction.browser_run_id,
        sourceBindingMode: transaction.source_binding_mode,
        sourceManifestDigest: transaction.source_manifest_digest,
      });
      assertSuccessfulBrowserSummary(summary, expectedBinding);
    }
    const summaryRelativePath = `stages/${stageId}/artifacts/${BROWSER_SUMMARY_ARTIFACT}`;
    const importSummaryRelativePath = `stages/${stageId}/artifacts/${BROWSER_IMPORT_SUMMARY_ARTIFACT}`;
    const artifactDir = resolveInside(lockedRoot, `stages/${stageId}/artifacts`);
    copyCandidateToArtifact(lockedRoot, summaryCandidatePath(lockedRoot), join(artifactDir, BROWSER_SUMMARY_ARTIFACT), BROWSER_LIMITS.summary_bytes);
    transaction = writeTransaction(lockedRoot, {
      ...transaction,
      browser_summary_artifact_status: 'written',
      transaction_state: transaction.workspace_cleanup_status === 'cleaned' ? 'workspace_cleaned' : 'prepared',
    });
    if (transaction.workspace_cleanup_status !== 'cleaned') {
      const cleanup = cleanupBrowserEvidence(browserWorkspace?.cleanupHandle);
      if (cleanup.status !== 'cleaned' && cleanup.status !== 'already_cleaned') {
        throw new EvidenceError('BROWSER_PACKET_CLEANUP_FAILED', 'Browser packet import cleanup failed.');
      }
      transaction = writeTransaction(lockedRoot, {
        ...transaction,
        workspace_cleanup_status: 'cleaned',
        transaction_state: 'workspace_cleaned',
      });
    }
    const importSummary = {
      schema_version: BROWSER_PACKET_IMPORT_SCHEMA,
      operation_id: metadata.operation_id,
      stage_id: stageId,
      execution_token_id: executionTokenId,
      command_category: token.command_category,
      binding_digest: summary.binding_digest,
      browser_run_id: summary.run_id,
      source_binding_mode: summary.source_binding_mode,
      source_manifest_digest: summary.source_manifest_digest,
      browser_status: summary.status,
      browser_summary_relative_path: summaryRelativePath,
      browser_summary_sha256: sha256(summaryContent),
      browser_summary_bytes: Buffer.byteLength(summaryContent),
      packet_sanitization_status: 'passed',
      browser_workspace_cleanup_status: 'cleaned',
      imported_utc: transaction.prepared_utc,
    };
    const importSummaryContent = canonicalJsonBytes(importSummary, 'browser import summary');
    packetSideScan(importSummaryContent);
    if (!existsSync(importSummaryCandidatePath(lockedRoot))) {
      writeQuarantine(lockedRoot, 'browser-import-summary-candidate.json', importSummaryContent);
    } else {
      verifyPacketFileContent(lockedRoot, importSummaryCandidatePath(lockedRoot), importSummaryContent, BROWSER_LIMITS.summary_bytes);
    }
    copyCandidateToArtifact(lockedRoot, importSummaryCandidatePath(lockedRoot), join(artifactDir, BROWSER_IMPORT_SUMMARY_ARTIFACT), BROWSER_LIMITS.summary_bytes);
    assertPacketOwnedFile(lockedRoot, join(artifactDir, BROWSER_SUMMARY_ARTIFACT), [0o600], BROWSER_LIMITS.summary_bytes);
    assertPacketOwnedFile(lockedRoot, join(artifactDir, BROWSER_IMPORT_SUMMARY_ARTIFACT), [0o600], BROWSER_LIMITS.summary_bytes);
    transaction = writeTransaction(lockedRoot, {
      ...transaction,
      browser_import_summary_artifact_status: 'written',
      transaction_state: 'artifacts_written',
    });
    registerOrVerifyBrowserArtifacts(lockedRoot, metadata, stageId);
    transaction = writeTransaction(lockedRoot, {
      ...transaction,
      artifact_index_status: 'registered',
      transaction_state: 'index_registered',
    });
    const artifactPaths = [summaryRelativePath, importSummaryRelativePath];
    verifyOrAppendBrowserEvent(lockedRoot, metadata, stageId, executionTokenId, importedAt, artifactPaths);
    transaction = writeTransaction(lockedRoot, {
      ...transaction,
      promotion_event_status: 'recorded',
      transaction_state: 'event_recorded',
    });
    verifyPromotedBrowserPacketEvidence(lockedRoot, metadata, stageId, executionTokenId, { workspaceCleaned: true, allowPendingTransaction: true });
    removePacketFile(lockedRoot, summaryCandidatePath(lockedRoot));
    removePacketFile(lockedRoot, importSummaryCandidatePath(lockedRoot));
    transaction = writeTransaction(lockedRoot, {
      ...transaction,
      transaction_state: 'completed',
    });
    removePacketFile(lockedRoot, transactionPath(lockedRoot));
    if (readDirectorySorted(resolveInside(lockedRoot, 'quarantine')).length !== 0) {
      throw new EvidenceError('BROWSER_PACKET_QUARANTINE_NOT_EMPTY', 'Browser packet import must leave quarantine empty after success.');
    }
    verifyPromotedBrowserPacketEvidence(lockedRoot, metadata, stageId, executionTokenId, { workspaceCleaned: true });
    promoted = {
      status: BROWSER_PACKET_IMPORT_STATUS,
      operation_id: metadata.operation_id,
      stage_id: stageId,
      execution_token_id: executionTokenId,
      command_category: token.command_category,
      browser_run_id: summary.run_id,
      binding_digest: summary.binding_digest,
      browser_summary_relative_path: summaryRelativePath,
      browser_summary_sha256: sha256(summaryContent),
      browser_import_summary_relative_path: importSummaryRelativePath,
      browser_import_summary_sha256: sha256(importSummaryContent),
      browser_workspace_cleanup_status: 'cleaned',
      freeze_state: 'not_frozen',
      manifest_state: 'not_created',
      seal_state: 'not_created',
    };
  });
  return promoted;
}

export function validateBrowserImportSummary(summary) {
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
  if (summary.schema_version !== BROWSER_PACKET_IMPORT_SCHEMA
    || summary.command_category !== BROWSER_WORKFLOW_COMMAND_CATEGORY
    || summary.source_binding_mode !== 'current_source_snapshot'
    || summary.browser_status !== 'passed'
    || summary.packet_sanitization_status !== 'passed'
    || summary.browser_workspace_cleanup_status !== 'cleaned'
    || summary.browser_summary_relative_path !== `stages/${summary.stage_id}/artifacts/${BROWSER_SUMMARY_ARTIFACT}`
    || !/^[a-f0-9]{64}$/.test(summary.binding_digest)
    || !/^[a-f0-9]{64}$/.test(summary.source_manifest_digest)
    || !/^[a-f0-9]{64}$/.test(summary.browser_summary_sha256)
    || !Number.isInteger(summary.browser_summary_bytes)
    || summary.browser_summary_bytes <= 0
    || summary.browser_summary_bytes > BROWSER_LIMITS.summary_bytes) {
    throw new EvidenceError('INVALID_BROWSER_IMPORT_SUMMARY', 'Browser import summary is invalid.');
  }
  validateControlledSlug(summary.operation_id, 'browser import operation ID');
  validateControlledSlug(summary.stage_id, 'browser import stage ID');
  validateControlledSlug(summary.execution_token_id, 'browser import execution token ID');
  validateGeneratedBrowserId(summary.browser_run_id, 'browser import run ID');
  return summary;
}

function parseOptions(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new EvidenceError('INVALID_ARGUMENTS', 'Browser packet importer arguments are invalid.');
    options[key.slice(2)] = value;
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (!value) throw new EvidenceError('INVALID_ARGUMENTS', `--${name} is required.`);
  return value;
}

function runCli() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseOptions(rest);
  if (command === 'validate-import-summary') {
    const path = required(options, 'path');
    const content = readFileSync(path, 'utf8');
    if (!content.endsWith('\n')) throw new EvidenceError('INVALID_BROWSER_IMPORT_SUMMARY', 'Browser import summary must be canonical JSON.');
    const parsed = parseStrictJson(content.slice(0, -1));
    if (content !== `${canonicalStringify(parsed)}\n`) throw new EvidenceError('INVALID_BROWSER_IMPORT_SUMMARY', 'Browser import summary is noncanonical.');
    process.stdout.write(`${canonicalStringify(validateBrowserImportSummary(parsed))}\n`);
    return;
  }
  throw new EvidenceError('INVALID_COMMAND', 'Unknown browser packet importer command.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runCli();
  } catch (error) {
    const safe = safeError(error);
    process.stderr.write(`${basename(process.argv[1])}: ${safe.code}: ${safe.message}\n`);
    process.exitCode = 94;
  }
}
