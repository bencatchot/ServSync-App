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
  withPacketMutationLock,
  writeJsonAtomic,
} from './internal.mjs';
import { readCanonicalJsonFile } from './manifest.mjs';
import { appendEvent, verifyEventChain, readEvents } from './evidence.mjs';
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

const TOKEN_FIELDS = ['schema_version', 'operation_id', 'stage_id', 'token', 'command_category', 'expected_result', 'state', 'claimed_at', 'started_at', 'completed_at', 'command_result', 'harness_result', 'retry'];

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
  const scanContent = content
    .replace(/\b[a-f0-9]{64}\b/g, '<sha256>')
    .replace(/\bbrowser-run-[a-f0-9]{24}\b/g, '<browser-run-id>')
    .replace(/\b(?:test|attempt)-[a-f0-9]{24}\b/g, '<browser-attempt-id>');
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

function copyFromQuarantine(rootPath, source, destination) {
  assertPacketOwnedFile(rootPath, source, [0o600], LIMITS.artifact_bytes);
  const content = readFileSync(source, 'utf8');
  writePacketFileExclusive(rootPath, destination, content);
  unlinkSync(source);
  fsyncDirectory(dirname(source));
}

function registerBrowserArtifacts(rootPath, metadata, stageId) {
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
  const additions = [
    { path: BROWSER_IMPORT_SUMMARY_ARTIFACT, artifact_class: 'browser_import_summary', sanitization_status: 'internal', summary_path: BROWSER_IMPORT_SUMMARY_ARTIFACT },
    { path: BROWSER_SUMMARY_ARTIFACT, artifact_class: 'browser_summary', sanitization_status: 'internal', summary_path: BROWSER_IMPORT_SUMMARY_ARTIFACT },
  ];
  for (const addition of additions) {
    if (index.artifacts.some((entry) => entry.path === addition.path)) {
      throw new EvidenceError('BROWSER_PACKET_IMPORT_EXISTS', 'Browser packet evidence is already imported for this stage.');
    }
  }
  if (index.artifacts.length + additions.length > LIMITS.artifact_count_per_stage) {
    throw new EvidenceError('ARTIFACT_COUNT_LIMIT', 'Artifact count exceeds its configured limit.');
  }
  index.artifacts.push(...additions);
  index.artifacts.sort((a, b) => compareStrings(a.path, b.path));
  writeJsonAtomic(indexPath, index, 0o600, rootPath);
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
    if (current.includes('browser-summary') || current.includes('browser-import-summary')) {
      throw new EvidenceError('BROWSER_PACKET_QUARANTINE_NOT_EMPTY', 'Browser packet import encountered unresolved quarantine evidence.');
    }
  }
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
    assertNoExistingBrowserImport(lockedRoot, stageId);
    const imported = importGeneratedBrowserWorkspaceJournal({ cleanupHandle: browserWorkspace?.cleanupHandle, generatedAt });
    const summary = verifyBrowserSummary(imported.summaryPath);
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
    const summaryContent = canonicalJsonBytes(summary, 'browser summary');
    packetSideScan(summaryContent);
    const summaryQuarantine = writeQuarantine(lockedRoot, 'browser-summary-candidate.json', summaryContent);
    const cleanup = cleanupBrowserEvidence(browserWorkspace?.cleanupHandle);
    if (cleanup.status !== 'cleaned') {
      throw new EvidenceError('BROWSER_PACKET_CLEANUP_FAILED', 'Browser packet import cleanup failed.');
    }
    const summaryRelativePath = `stages/${stageId}/artifacts/${BROWSER_SUMMARY_ARTIFACT}`;
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
      browser_workspace_cleanup_status: cleanup.status,
      imported_utc: importedAt,
    };
    const importSummaryContent = canonicalJsonBytes(importSummary, 'browser import summary');
    packetSideScan(importSummaryContent);
    const importSummaryQuarantine = writeQuarantine(lockedRoot, 'browser-import-summary-candidate.json', importSummaryContent);
    const artifactDir = resolveInside(lockedRoot, `stages/${stageId}/artifacts`);
    copyFromQuarantine(lockedRoot, summaryQuarantine, join(artifactDir, BROWSER_SUMMARY_ARTIFACT));
    copyFromQuarantine(lockedRoot, importSummaryQuarantine, join(artifactDir, BROWSER_IMPORT_SUMMARY_ARTIFACT));
    assertPacketOwnedFile(lockedRoot, join(artifactDir, BROWSER_SUMMARY_ARTIFACT), [0o600], BROWSER_LIMITS.summary_bytes);
    assertPacketOwnedFile(lockedRoot, join(artifactDir, BROWSER_IMPORT_SUMMARY_ARTIFACT), [0o600], BROWSER_LIMITS.summary_bytes);
    registerBrowserArtifacts(lockedRoot, metadata, stageId);
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
      browser_import_summary_relative_path: `stages/${stageId}/artifacts/${BROWSER_IMPORT_SUMMARY_ARTIFACT}`,
      browser_import_summary_sha256: sha256(importSummaryContent),
      browser_workspace_cleanup_status: cleanup.status,
      freeze_state: 'not_frozen',
      manifest_state: 'not_created',
      seal_state: 'not_created',
    };
  });
  const head = verifyEventChain(rootPath).head;
  appendEvent(rootPath, head, {
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
    sanitized_artifact_paths: [
      promoted.browser_summary_relative_path,
      promoted.browser_import_summary_relative_path,
    ],
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
