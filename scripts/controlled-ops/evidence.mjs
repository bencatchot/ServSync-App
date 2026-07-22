#!/usr/bin/env node

import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENESIS_HASH,
  SCHEMA_VERSION,
  TOOL_VERSION,
  EvidenceError,
  assertDirectoryMode,
  assertFileMode,
  assertNoSymlinkPath,
  assertOperationRoot,
  assertOutsideGit,
  canonicalStringify,
  compareStrings,
  claimFileAtomic,
  readDirectorySorted,
  readJson,
  resolveInside,
  safeError,
  sha256,
  utcNow,
  validateRelativePath,
  validateSafeLabel,
  validateTimestamp,
  withDirectoryLock,
  writeJsonAtomic,
} from './internal.mjs';
import {
  buildPacketManifest,
  buildStageManifest,
  manifestDigest,
  readCanonicalJsonFile,
  verifyPacketManifest,
  verifyStageManifest,
} from './manifest.mjs';
import { scanCustomerContent, scanSensitiveContent } from './sanitize.mjs';

const EVENT_FIELDS = new Set([
  'stage_id', 'event_id', 'event_type', 'action_timestamp', 'archive_timestamp', 'command_category',
  'expected_result', 'observed_result', 'result_classification', 'exit_code', 'sanitized_artifact_paths',
]);
const TOKEN_STATUSES = new Set(['claimed', 'started', 'completed', 'failed_before_execution', 'sanitizer_failure']);

function parseOptions(arguments_) {
  const options = { positional: [] };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument.startsWith('--')) {
      options.positional.push(argument);
      continue;
    }
    const name = argument.slice(2);
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) throw new EvidenceError('INVALID_ARGUMENTS', `Missing value for --${name}.`);
    options[name] = value;
    index += 1;
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || value.length === 0) throw new EvidenceError('INVALID_ARGUMENTS', `--${name} is required.`);
  return value;
}

function parseInteger(value, name) {
  if (!/^-?\d+$/.test(value ?? '')) throw new EvidenceError('INVALID_ARGUMENTS', `--${name} must be an integer.`);
  return Number.parseInt(value, 10);
}

function operationPaths(root) {
  return {
    events: join(root, 'events.ndjson'),
    tokens: join(root, 'tokens'),
    stages: join(root, 'stages'),
    quarantine: join(root, 'quarantine'),
    manifest: join(root, 'manifest.json'),
    seal: join(root, 'seal.json'),
    eventLock: join(root, '.controlled-ops-events.lock'),
  };
}

export function initializeOperation(root, fields) {
  const rootPath = resolve(root);
  assertOutsideGit(dirname(rootPath));
  if (existsSync(rootPath)) throw new EvidenceError('OPERATION_ROOT_EXISTS', 'Operation root must not already exist.');
  for (const name of ['operationId', 'operationClassification', 'targetClassification', 'authorizationReference']) {
    validateSafeLabel(fields[name], name);
  }
  process.umask(0o077);
  mkdirSync(rootPath, { mode: 0o700 });
  for (const directory of ['tokens', 'stages', 'quarantine']) mkdirSync(join(rootPath, directory), { mode: 0o700 });
  const createdAt = fields.createdAt ?? utcNow();
  validateTimestamp(createdAt, 'createdAt');
  writeJsonAtomic(join(rootPath, 'operation.json'), {
    schema_version: SCHEMA_VERSION,
    operation_id: fields.operationId,
    created_utc: createdAt,
    operation_classification: fields.operationClassification,
    target_classification: fields.targetClassification,
    authorization_reference: fields.authorizationReference,
    tool_version: TOOL_VERSION,
  });
  writeFileSync(join(rootPath, 'events.ndjson'), '', { mode: 0o600, flag: 'wx' });
  chmodSync(join(rootPath, 'events.ndjson'), 0o600);
  return rootPath;
}

export function readEvents(root) {
  const path = operationPaths(root).events;
  assertNoSymlinkPath(root, path);
  const content = readFileSync(path, 'utf8');
  if (content === '') return [];
  if (!content.endsWith('\n')) throw new EvidenceError('TRUNCATED_EVENT_LOG', 'Event timeline does not end on a record boundary.');
  return content.trimEnd().split('\n').map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new EvidenceError('INVALID_EVENT_LOG', 'Event timeline contains malformed JSON.');
    }
  });
}

export function verifyEventChain(root) {
  const { metadata } = assertOperationRoot(root);
  const events = readEvents(root);
  let previousHash = GENESIS_HASH;
  let previousTimestamp = validateTimestamp(metadata.created_utc, 'operation created timestamp');
  let previousCollectionTimestamp = previousTimestamp;
  const eventIds = new Set();
  events.forEach((event, index) => {
    if (event.schema_version !== SCHEMA_VERSION || event.operation_id !== metadata.operation_id || event.sequence !== index + 1) {
      throw new EvidenceError('INVALID_EVENT_SEQUENCE', 'Event sequence or operation identity is invalid.');
    }
    validateSafeLabel(event.event_id, 'event ID');
    if (eventIds.has(event.event_id)) throw new EvidenceError('DUPLICATE_EVENT_ID', 'Event ID is duplicated.');
    eventIds.add(event.event_id);
    const actionTime = validateTimestamp(event.action_timestamp, 'action timestamp');
    const collectionTime = validateTimestamp(event.collection_timestamp, 'collection timestamp');
    if (actionTime < previousTimestamp || collectionTime < actionTime || collectionTime < previousCollectionTimestamp) {
      throw new EvidenceError('TIMESTAMP_REGRESSION', 'Event timestamps regress.');
    }
    if (event.archive_timestamp !== null) {
      const archiveTime = validateTimestamp(event.archive_timestamp, 'archive timestamp');
      if (archiveTime < collectionTime) throw new EvidenceError('TIMESTAMP_REGRESSION', 'Archive timestamp precedes collection.');
    }
    if (event.previous_event_hash !== previousHash) throw new EvidenceError('EVENT_CHAIN_MISMATCH', 'Previous event hash is invalid.');
    const { current_event_hash: currentHash, ...withoutHash } = event;
    const expectedHash = sha256(`${previousHash}\n${canonicalStringify(withoutHash)}`);
    if (currentHash !== expectedHash) throw new EvidenceError('EVENT_CHAIN_MISMATCH', 'Current event hash is invalid.');
    previousHash = currentHash;
    previousTimestamp = actionTime;
    previousCollectionTimestamp = collectionTime;
  });
  return { eventCount: events.length, head: previousHash, lastActionTimestamp: events.at(-1)?.action_timestamp ?? metadata.created_utc };
}

export function appendEvent(root, expectedHead, input) {
  const { rootPath, metadata } = assertOperationRoot(root, { allowSealed: false });
  for (const key of Object.keys(input)) if (!EVENT_FIELDS.has(key)) throw new EvidenceError('UNKNOWN_EVENT_FIELD', 'Event input contains an unknown field.');
  for (const name of ['stage_id', 'event_id', 'event_type', 'result_classification']) validateSafeLabel(input[name], name);
  if (input.command_category !== null) validateSafeLabel(input.command_category, 'command category');
  if (input.exit_code !== null && (!Number.isInteger(input.exit_code) || input.exit_code < 0 || input.exit_code > 255)) {
    throw new EvidenceError('INVALID_EXIT_CODE', 'Exit code must be null or an integer from 0 through 255.');
  }
  if (!Array.isArray(input.sanitized_artifact_paths)) throw new EvidenceError('INVALID_EVENT_ARTIFACTS', 'Sanitized artifact paths must be an array.');
  const stagePath = resolveInside(rootPath, `stages/${input.stage_id}`);
  if (!existsSync(stagePath) || existsSync(join(stagePath, 'stage-freeze.json'))) {
    throw new EvidenceError('INVALID_STAGE', 'Events require an existing unfrozen stage.');
  }
  input.sanitized_artifact_paths.forEach((path) => {
    const safePath = validateRelativePath(path);
    if (!safePath.startsWith(`stages/${input.stage_id}/artifacts/`)) {
      throw new EvidenceError('INVALID_EVENT_ARTIFACTS', 'Event artifacts must belong to the event stage.');
    }
  });
  validateTimestamp(input.action_timestamp, 'action timestamp');
  if (input.archive_timestamp !== null) validateTimestamp(input.archive_timestamp, 'archive timestamp');

  return withDirectoryLock(operationPaths(rootPath).eventLock, () => {
    const chain = verifyEventChain(rootPath);
    if (readEvents(rootPath).some((event) => event.event_id === input.event_id)) {
      throw new EvidenceError('DUPLICATE_EVENT_ID', 'Event ID is duplicated.');
    }
    if (expectedHead !== chain.head) throw new EvidenceError('STALE_EVENT_HEAD', 'Expected event head is stale.');
    if (Date.parse(input.action_timestamp) < Date.parse(chain.lastActionTimestamp)) throw new EvidenceError('TIMESTAMP_REGRESSION', 'Event action timestamp regresses.');
    const withoutHash = {
      schema_version: SCHEMA_VERSION,
      operation_id: metadata.operation_id,
      sequence: chain.eventCount + 1,
      event_id: input.event_id,
      stage_id: input.stage_id,
      event_type: input.event_type,
      action_timestamp: input.action_timestamp,
      collection_timestamp: utcNow(),
      archive_timestamp: input.archive_timestamp,
      target_classification: metadata.target_classification,
      command_category: input.command_category,
      expected_result: validateSafeLabel(input.expected_result, 'expected result'),
      observed_result: validateSafeLabel(input.observed_result, 'observed result'),
      result_classification: input.result_classification,
      exit_code: input.exit_code,
      sanitized_artifact_paths: input.sanitized_artifact_paths,
      previous_event_hash: chain.head,
    };
    const event = { ...withoutHash, current_event_hash: sha256(`${chain.head}\n${canonicalStringify(withoutHash)}`) };
    appendFileSync(operationPaths(rootPath).events, `${canonicalStringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
    return event;
  });
}

export function createStage(root, stageId) {
  const { rootPath, metadata } = assertOperationRoot(root, { allowSealed: false });
  validateSafeLabel(stageId, 'stage ID');
  const stagePath = resolveInside(rootPath, `stages/${stageId}`);
  if (existsSync(stagePath)) throw new EvidenceError('STAGE_EXISTS', 'Stage already exists.');
  mkdirSync(join(stagePath, 'artifacts'), { recursive: true, mode: 0o700 });
  writeJsonAtomic(join(stagePath, 'artifact-index.json'), {
    schema_version: 'servsync-controlled-ops/artifact-index-v1',
    operation_id: metadata.operation_id,
    stage_id: stageId,
    artifacts: [],
  });
}

export function registerArtifact(root, stageId, artifactPath, artifactClass, summaryPath = null) {
  const { rootPath } = assertOperationRoot(root, { allowSealed: false });
  validateSafeLabel(stageId, 'stage ID');
  validateSafeLabel(artifactClass, 'artifact class');
  const relativeArtifactPath = validateRelativePath(artifactPath, 'artifact path');
  const stagePath = resolveInside(rootPath, `stages/${stageId}`);
  if (existsSync(join(stagePath, 'stage-freeze.json'))) throw new EvidenceError('STAGE_FROZEN', 'Frozen stages cannot accept artifacts.');
  const fullArtifactPath = resolveInside(rootPath, `stages/${stageId}/artifacts/${relativeArtifactPath}`);
  assertNoSymlinkPath(rootPath, fullArtifactPath);
  assertFileMode(fullArtifactPath, [0o600]);
  if (!summaryPath && artifactClass !== 'sanitization_summary') {
    throw new EvidenceError('SANITIZATION_NOT_PROVEN', 'A sanitization summary is required for retained evidence.');
  }
  let summary = { passed: true };
  if (summaryPath) {
    const safeSummaryPath = resolve(summaryPath);
    const summaryRelative = relative(rootPath, safeSummaryPath);
    if (summaryRelative === '' || summaryRelative.startsWith('..') || isAbsolute(summaryRelative)) {
      throw new EvidenceError('PATH_ESCAPE', 'Sanitization summary must remain inside the operation packet.');
    }
    assertNoSymlinkPath(rootPath, safeSummaryPath);
    summary = readJson(safeSummaryPath);
  }
  if (summary.passed !== true) throw new EvidenceError('SANITIZATION_NOT_PROVEN', 'Artifact sanitization did not pass.');
  const indexPath = join(stagePath, 'artifact-index.json');
  withDirectoryLock(join(stagePath, '.controlled-ops-index.lock'), () => {
    const index = readJson(indexPath);
    if (index.artifacts.some((entry) => entry.path === relativeArtifactPath)) throw new EvidenceError('ARTIFACT_EXISTS', 'Artifact is already registered.');
    index.artifacts.push({ path: relativeArtifactPath, artifact_class: artifactClass, sanitization_status: 'passed' });
    index.artifacts.sort((left, right) => compareStrings(left.path, right.path));
    writeJsonAtomic(`${indexPath}.new`, index);
    renameSync(`${indexPath}.new`, indexPath);
  });
}

export function claimExecutionToken(root, fields) {
  const { rootPath, metadata } = assertOperationRoot(root, { allowSealed: false });
  for (const name of ['stageId', 'token', 'commandCategory', 'expectedResult']) validateSafeLabel(fields[name], name);
  const stagePath = resolveInside(rootPath, `stages/${fields.stageId}`);
  if (!existsSync(stagePath) || existsSync(join(stagePath, 'stage-freeze.json'))) throw new EvidenceError('INVALID_STAGE', 'Execution stage is missing or frozen.');
  let retry = null;
  if (fields.retryOf || fields.retryAuthorization) {
    if (!fields.retryOf || !fields.retryAuthorization) throw new EvidenceError('RETRY_NOT_AUTHORIZED', 'Retries require a prior token and explicit authorization.');
    validateSafeLabel(fields.retryOf, 'retry token');
    validateSafeLabel(fields.retryAuthorization, 'retry authorization');
    const priorPath = resolveInside(rootPath, `tokens/${fields.retryOf}.json`);
    if (!existsSync(priorPath)) throw new EvidenceError('RETRY_TOKEN_MISSING', 'Prior retry token does not exist.');
    const prior = readJson(priorPath);
    if (!['completed', 'sanitizer_failure'].includes(prior.status) || prior.stage_id !== fields.stageId || prior.command_category !== fields.commandCategory) {
      throw new EvidenceError('RETRY_NOT_AUTHORIZED', 'Prior token is not a compatible completed execution.');
    }
    retry = { prior_token: fields.retryOf, authorization_reference: fields.retryAuthorization, retry_count: (prior.retry?.retry_count ?? 0) + 1 };
  }
  const tokenRecord = {
    schema_version: 'servsync-controlled-ops/execution-token-v1',
    operation_id: metadata.operation_id,
    stage_id: fields.stageId,
    token: fields.token,
    command_category: fields.commandCategory,
    expected_result: fields.expectedResult,
    status: 'claimed',
    claimed_at: utcNow(),
    started_at: null,
    completed_at: null,
    command_exit_code: null,
    retry,
  };
  claimFileAtomic(resolveInside(rootPath, `tokens/${fields.token}.json`), tokenRecord);
  return tokenRecord;
}

export function updateExecutionToken(root, token, status, fields = {}) {
  const { rootPath, metadata } = assertOperationRoot(root, { allowSealed: false });
  validateSafeLabel(token, 'token');
  if (!TOKEN_STATUSES.has(status)) throw new EvidenceError('INVALID_TOKEN_STATUS', 'Execution token status is invalid.');
  const path = resolveInside(rootPath, `tokens/${token}.json`);
  return withDirectoryLock(`${path}.lock`, () => {
    const current = readJson(path);
    if (current.operation_id !== metadata.operation_id) throw new EvidenceError('TOKEN_OPERATION_MISMATCH', 'Execution token belongs to another operation.');
    const transitions = {
      claimed: new Set(['started', 'failed_before_execution']),
      started: new Set(['completed', 'sanitizer_failure']),
    };
    if (!transitions[current.status]?.has(status)) throw new EvidenceError('INVALID_TOKEN_TRANSITION', 'Execution token transition is invalid.');
    const now = utcNow();
    const next = {
      ...current,
      status,
      started_at: status === 'started' ? now : current.started_at,
      completed_at: ['completed', 'failed_before_execution', 'sanitizer_failure'].includes(status) ? now : null,
      command_exit_code: fields.commandExitCode ?? current.command_exit_code,
    };
    if (next.command_exit_code !== null && (!Number.isInteger(next.command_exit_code) || next.command_exit_code < 0 || next.command_exit_code > 255)) {
      throw new EvidenceError('INVALID_EXIT_CODE', 'Execution token exit-code evidence is invalid.');
    }
    writeJsonAtomic(`${path}.new`, next);
    renameSync(`${path}.new`, path);
    return next;
  });
}

function scanArtifactFile(path) {
  const content = readFileSync(path, 'utf8');
  return {
    secretFindings: scanSensitiveContent(content),
    customerFindings: scanCustomerContent(content),
  };
}

function freezeArtifactTree(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted in stage artifacts.');
  if (info.isDirectory()) {
    for (const name of readDirectorySorted(path)) freezeArtifactTree(join(path, name));
    chmodSync(path, 0o500);
  } else if (info.isFile()) {
    chmodSync(path, 0o400);
  } else {
    throw new EvidenceError('UNSUPPORTED_FILE', 'Only regular stage artifacts are permitted.');
  }
}

function scanPacketSecurity(root) {
  const totals = { secret_findings: 0, customer_content_findings: 0, files_scanned: 0 };
  const visit = (path) => {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted in operation packets.');
    if (info.isDirectory()) {
      if (path === operationPaths(root).quarantine) {
        if (readDirectorySorted(path).length > 0) throw new EvidenceError('QUARANTINE_NOT_EMPTY', 'Quarantine must be empty.');
        return;
      }
      for (const name of readDirectorySorted(path)) if (!name.startsWith('.controlled-ops-')) visit(join(path, name));
      return;
    }
    if (!info.isFile()) throw new EvidenceError('UNSUPPORTED_FILE', 'Only regular files and directories are permitted.');
    const content = readFileSync(path, 'utf8');
    totals.secret_findings += scanSensitiveContent(content).length;
    totals.customer_content_findings += scanCustomerContent(content).length;
    totals.files_scanned += 1;
  };
  visit(root);
  return totals;
}

export function freezeStage(root, stageId, timestamps = {}) {
  const { rootPath, metadata } = assertOperationRoot(root, { allowSealed: false });
  validateSafeLabel(stageId, 'stage ID');
  const stagePath = resolveInside(rootPath, `stages/${stageId}`);
  const freezePath = join(stagePath, 'stage-freeze.json');
  if (existsSync(freezePath)) throw new EvidenceError('STAGE_FROZEN', 'Stage is already frozen.');
  if (readDirectorySorted(operationPaths(rootPath).quarantine).length > 0) throw new EvidenceError('QUARANTINE_NOT_EMPTY', 'Quarantine must be empty before freezing.');
  const chain = verifyEventChain(rootPath);
  const index = readJson(join(stagePath, 'artifact-index.json'));
  if (index.artifacts.length === 0) throw new EvidenceError('MISSING_ARTIFACT', 'A stage cannot freeze without evidence artifacts.');
  for (const artifact of index.artifacts) {
    const path = resolveInside(rootPath, `stages/${stageId}/artifacts/${artifact.path}`);
    const scans = scanArtifactFile(path);
    if (scans.secretFindings.length > 0) throw new EvidenceError('SECRET_SCAN_FAILED', 'Stage artifact secret scan failed.');
    if (scans.customerFindings.length > 0) throw new EvidenceError('CUSTOMER_SCAN_FAILED', 'Stage artifact customer-content scan failed.');
  }
  const actionTimestamp = timestamps.actionTimestamp ?? utcNow();
  const collectionTimestamp = timestamps.collectionTimestamp ?? utcNow();
  const freezeTimestamp = timestamps.freezeTimestamp ?? utcNow();
  const action = validateTimestamp(actionTimestamp, 'stage action timestamp');
  const collection = validateTimestamp(collectionTimestamp, 'stage collection timestamp');
  const freeze = validateTimestamp(freezeTimestamp, 'stage freeze timestamp');
  if (action < Date.parse(chain.lastActionTimestamp) || collection < action || freeze < collection) {
    throw new EvidenceError('TIMESTAMP_REGRESSION', 'Stage timestamps regress.');
  }
  freezeArtifactTree(join(stagePath, 'artifacts'));
  chmodSync(join(stagePath, 'artifact-index.json'), 0o400);
  const manifest = buildStageManifest(rootPath, metadata.operation_id, stageId, index);
  writeJsonAtomic(join(stagePath, 'stage-manifest.json'), manifest);
  const freezeRecord = {
    schema_version: 'servsync-controlled-ops/stage-freeze-v1',
    operation_id: metadata.operation_id,
    stage_id: stageId,
    action_completed_utc: actionTimestamp,
    collected_utc: collectionTimestamp,
    frozen_utc: freezeTimestamp,
    event_chain_head: chain.head,
    stage_manifest_digest: manifestDigest(manifest),
    security_scan: { secret_findings: 0, customer_content_findings: 0 },
  };
  writeJsonAtomic(freezePath, freezeRecord);
  chmodSync(join(stagePath, 'stage-manifest.json'), 0o400);
  chmodSync(freezePath, 0o400);
  chmodSync(stagePath, 0o500);
  return freezeRecord;
}

export function verifyStageFreeze(root, stageId) {
  const { rootPath, metadata } = assertOperationRoot(root);
  validateSafeLabel(stageId, 'stage ID');
  const stagePath = resolveInside(rootPath, `stages/${stageId}`);
  assertNoSymlinkPath(rootPath, stagePath);
  const manifest = readCanonicalJsonFile(join(stagePath, 'stage-manifest.json'));
  const freeze = readCanonicalJsonFile(join(stagePath, 'stage-freeze.json'));
  if (manifest.operation_id !== metadata.operation_id || freeze.operation_id !== metadata.operation_id || freeze.stage_manifest_digest !== manifestDigest(manifest)) {
    throw new EvidenceError('STAGE_FREEZE_MISMATCH', 'Stage freeze metadata is invalid.');
  }
  const historicalHeads = new Set([GENESIS_HASH, ...readEvents(rootPath).map((event) => event.current_event_hash)]);
  if (!historicalHeads.has(freeze.event_chain_head)) throw new EvidenceError('STAGE_FREEZE_MISMATCH', 'Stage freeze references an unknown event head.');
  const action = validateTimestamp(freeze.action_completed_utc, 'stage action timestamp');
  const collection = validateTimestamp(freeze.collected_utc, 'stage collection timestamp');
  const frozen = validateTimestamp(freeze.frozen_utc, 'stage freeze timestamp');
  if (collection < action || frozen < collection) throw new EvidenceError('TIMESTAMP_REGRESSION', 'Stage timestamps regress.');
  verifyStageManifest(rootPath, manifest);
  return freeze;
}

function permissionSummary(root) {
  let directories = 0;
  let files = 0;
  const visit = (path) => {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted in operation packets.');
    const mode = info.mode & 0o777;
    if (info.isDirectory()) {
      if (![0o700, 0o500].includes(mode)) throw new EvidenceError('UNSAFE_DIRECTORY_MODE', 'Packet directory permissions are unsafe.');
      directories += 1;
      for (const name of readDirectorySorted(path)) if (!name.startsWith('.controlled-ops-')) visit(join(path, name));
    } else if (info.isFile()) {
      if (![0o600, 0o400].includes(mode)) throw new EvidenceError('UNSAFE_FILE_MODE', 'Packet file permissions are unsafe.');
      files += 1;
    }
  };
  visit(root);
  return { directories, files, allowed_directory_modes: ['700', '500'], allowed_file_modes: ['600', '400'] };
}

function verifyTokens(root) {
  const { metadata } = assertOperationRoot(root);
  const tokensPath = operationPaths(root).tokens;
  const tokens = [];
  for (const file of readDirectorySorted(tokensPath)) {
    if (!file.endsWith('.json')) throw new EvidenceError('UNCLASSIFIED_FILE', 'Token directory contains an unexpected file.');
    const token = readCanonicalJsonFile(join(tokensPath, file));
    if (token.operation_id !== metadata.operation_id || !TOKEN_STATUSES.has(token.status)) throw new EvidenceError('INVALID_TOKEN', 'Execution token is invalid.');
    if (token.status === 'started') throw new EvidenceError('INCOMPLETE_TOKEN', 'An execution token remains in progress.');
    if (token.status === 'completed' && token.command_exit_code === null) throw new EvidenceError('MISSING_EXIT_CODE', 'Completed token lost command exit-code evidence.');
    tokens.push(token);
  }
  return tokens;
}

export function createManifest(root) {
  const { rootPath, metadata } = assertOperationRoot(root, { allowSealed: false });
  verifyEventChain(rootPath);
  verifyTokens(rootPath);
  for (const stageId of readDirectorySorted(operationPaths(rootPath).stages)) verifyStageFreeze(rootPath, stageId);
  const security = scanPacketSecurity(rootPath);
  if (security.secret_findings > 0) throw new EvidenceError('SECRET_SCAN_FAILED', 'Packet secret scan failed.');
  if (security.customer_content_findings > 0) throw new EvidenceError('CUSTOMER_SCAN_FAILED', 'Packet customer-content scan failed.');
  const manifest = buildPacketManifest(rootPath, metadata.operation_id);
  writeJsonAtomic(operationPaths(rootPath).manifest, manifest);
  return manifest;
}

export function sealOperation(root, sealedAt = utcNow()) {
  const { rootPath, metadata } = assertOperationRoot(root, { allowSealed: false });
  validateTimestamp(sealedAt, 'sealed timestamp');
  const manifest = readCanonicalJsonFile(operationPaths(rootPath).manifest);
  verifyPacketManifest(rootPath, manifest);
  const chain = verifyEventChain(rootPath);
  const stageFreezes = readDirectorySorted(operationPaths(rootPath).stages).map((stageId) => {
    const freeze = verifyStageFreeze(rootPath, stageId);
    return { stage_id: stageId, freeze_digest: sha256(`${canonicalStringify(freeze)}\n`) };
  });
  const permissions = permissionSummary(rootPath);
  permissions.files += 1;
  const security = scanPacketSecurity(rootPath);
  if (security.secret_findings > 0 || security.customer_content_findings > 0) throw new EvidenceError('SECURITY_SCAN_FAILED', 'Packet security scan failed.');
  const seal = {
    schema_version: 'servsync-controlled-ops/seal-v1',
    operation_id: metadata.operation_id,
    sealed_utc: sealedAt,
    manifest_digest: manifestDigest(manifest),
    final_event_chain_head: chain.head,
    stage_freeze_digests: stageFreezes,
    security_scan_summary: security,
    packet_permission_summary: permissions,
  };
  writeJsonAtomic(operationPaths(rootPath).seal, seal);
  return seal;
}

export function verifyPacket(root) {
  const { rootPath, metadata } = assertOperationRoot(root);
  const chain = verifyEventChain(rootPath);
  const tokens = verifyTokens(rootPath);
  const stages = readDirectorySorted(operationPaths(rootPath).stages).map((stageId) => verifyStageFreeze(rootPath, stageId));
  const manifest = readCanonicalJsonFile(operationPaths(rootPath).manifest);
  verifyPacketManifest(rootPath, manifest);
  const seal = readCanonicalJsonFile(operationPaths(rootPath).seal);
  if (seal.operation_id !== metadata.operation_id || seal.manifest_digest !== manifestDigest(manifest) || seal.final_event_chain_head !== chain.head) {
    throw new EvidenceError('SEAL_MISMATCH', 'Packet seal does not match the retained evidence.');
  }
  if (canonicalStringify(seal.stage_freeze_digests) !== canonicalStringify(stages.map((freeze) => ({ stage_id: freeze.stage_id, freeze_digest: sha256(`${canonicalStringify(freeze)}\n`) })))) {
    throw new EvidenceError('SEAL_MISMATCH', 'Stage freeze digests do not match the seal.');
  }
  permissionSummary(rootPath);
  if (canonicalStringify(permissionSummary(rootPath)) !== canonicalStringify(seal.packet_permission_summary)) {
    throw new EvidenceError('SEAL_MISMATCH', 'Packet permission summary does not match the seal.');
  }
  const security = scanPacketSecurity(rootPath);
  if (security.secret_findings > 0 || security.customer_content_findings > 0) throw new EvidenceError('SECURITY_SCAN_FAILED', 'Packet security scan failed.');
  return { operation_id: metadata.operation_id, event_count: chain.eventCount, token_count: tokens.length, stage_count: stages.length, status: 'verified' };
}

function eventInput(options) {
  const artifacts = options.artifacts ? options.artifacts.split(',').filter(Boolean) : [];
  return {
    stage_id: required(options, 'stage'),
    event_id: required(options, 'event-id'),
    event_type: required(options, 'event-type'),
    action_timestamp: required(options, 'action-timestamp'),
    archive_timestamp: options['archive-timestamp'] ?? null,
    command_category: options.category ?? null,
    expected_result: required(options, 'expected'),
    observed_result: required(options, 'observed'),
    result_classification: required(options, 'result-classification'),
    exit_code: options['exit-code'] === undefined ? null : parseInteger(options['exit-code'], 'exit-code'),
    sanitized_artifact_paths: artifacts,
  };
}

function runCli() {
  const [command, ...arguments_] = process.argv.slice(2);
  const options = parseOptions(arguments_);
  const root = options.root;
  switch (command) {
    case 'init':
      initializeOperation(required(options, 'root'), {
        operationId: required(options, 'operation-id'),
        operationClassification: required(options, 'classification'),
        targetClassification: required(options, 'target'),
        authorizationReference: required(options, 'authorization-reference'),
        createdAt: options['created-at'],
      });
      break;
    case 'create-stage': createStage(required(options, 'root'), required(options, 'stage')); break;
    case 'head': process.stdout.write(`${verifyEventChain(required(options, 'root')).head}\n`); break;
    case 'append-event': process.stdout.write(`${canonicalStringify(appendEvent(required(options, 'root'), required(options, 'expected-head'), eventInput(options)))}\n`); break;
    case 'claim-token':
      process.stdout.write(`${canonicalStringify(claimExecutionToken(required(options, 'root'), {
        stageId: required(options, 'stage'), token: required(options, 'token'), commandCategory: required(options, 'category'),
        expectedResult: required(options, 'expected'), retryOf: options['retry-of'], retryAuthorization: options['retry-authorization'],
      }))}\n`);
      break;
    case 'update-token':
      process.stdout.write(`${canonicalStringify(updateExecutionToken(required(options, 'root'), required(options, 'token'), required(options, 'status'), {
        commandExitCode: options['exit-code'] === undefined ? undefined : parseInteger(options['exit-code'], 'exit-code'),
      }))}\n`);
      break;
    case 'register-artifact': registerArtifact(required(options, 'root'), required(options, 'stage'), required(options, 'path'), required(options, 'class'), options.summary); break;
    case 'freeze-stage': process.stdout.write(`${canonicalStringify(freezeStage(required(options, 'root'), required(options, 'stage')))}\n`); break;
    case 'create-manifest': process.stdout.write(`${canonicalStringify(createManifest(required(options, 'root')))}\n`); break;
    case 'seal': process.stdout.write(`${canonicalStringify(sealOperation(required(options, 'root')))}\n`); break;
    case 'verify-metadata': process.stdout.write(`${canonicalStringify(assertOperationRoot(required(options, 'root')).metadata)}\n`); break;
    case 'verify-events': process.stdout.write(`${canonicalStringify(verifyEventChain(required(options, 'root')))}\n`); break;
    case 'verify-tokens': process.stdout.write(`${canonicalStringify({ count: verifyTokens(required(options, 'root')).length, status: 'verified' })}\n`); break;
    case 'verify-stage': process.stdout.write(`${canonicalStringify(verifyStageFreeze(required(options, 'root'), required(options, 'stage')))}\n`); break;
    case 'verify-manifest': {
      const rootPath = required(options, 'root');
      process.stdout.write(`${canonicalStringify(verifyPacketManifest(rootPath, readCanonicalJsonFile(join(rootPath, 'manifest.json'))))}\n`);
      break;
    }
    case 'verify-permissions': process.stdout.write(`${canonicalStringify(permissionSummary(required(options, 'root')))}\n`); break;
    case 'verify-paths': {
      const { rootPath, metadata } = assertOperationRoot(required(options, 'root'));
      buildPacketManifest(rootPath, metadata.operation_id);
      process.stdout.write(`${canonicalStringify({ status: 'verified' })}\n`);
      break;
    }
    case 'verify-secret-scan': {
      const result = scanPacketSecurity(required(options, 'root'));
      if (result.secret_findings > 0) throw new EvidenceError('SECRET_SCAN_FAILED', 'Packet secret scan failed.');
      process.stdout.write(`${canonicalStringify({ files_scanned: result.files_scanned, secret_findings: 0, status: 'verified' })}\n`);
      break;
    }
    case 'verify-customer-scan': {
      const result = scanPacketSecurity(required(options, 'root'));
      if (result.customer_content_findings > 0) throw new EvidenceError('CUSTOMER_SCAN_FAILED', 'Packet customer-content scan failed.');
      process.stdout.write(`${canonicalStringify({ files_scanned: result.files_scanned, customer_content_findings: 0, status: 'verified' })}\n`);
      break;
    }
    case 'verify-seal': process.stdout.write(`${canonicalStringify(verifyPacket(required(options, 'root')))}\n`); break;
    case 'verify': process.stdout.write(`${canonicalStringify(verifyPacket(required(options, 'root')))}\n`); break;
    default: throw new EvidenceError('INVALID_COMMAND', 'Unknown evidence command.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runCli();
  } catch (error) {
    const safe = safeError(error);
    process.stderr.write(`${basename(process.argv[1])}: ${safe.code}: ${safe.message}\n`);
    process.exitCode = 90;
  }
}
