#!/usr/bin/env node

import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENESIS_HASH, LIMITS, PACKET_LOCK_NAME, SCHEMA_VERSION, TOOL_VERSION, EvidenceError,
  assertExactObject, assertNoPacketLock, assertNoSymlinkPath, assertOperationRoot, assertOutsideGit,
  assertPacketOwnedDirectory, assertPacketOwnedFile, assertSupportedPlatform, canonicalStringify,
  claimFileAtomic, compareStrings, fsyncDirectory, openExclusivePacketFile, pathIdentity,
  readDirectorySorted, readJson, resolveInside, safeError, sha256, utcNow, validateAuthorizationReference,
  validateCommandCategory, validateControlledSlug, validateExpectedResult, validateOperationClassification,
  validateOperationId, validateRawOperationRootInput, validateRelativePath, validateSafeLabel,
  validateTargetClassification, validateTimestamp, withPacketMutationLock, writeJsonAtomic,
} from './internal.mjs';
import {
  MANIFEST_SCHEMA, STAGE_MANIFEST_SCHEMA, buildPacketManifest, buildStageManifest, manifestDigest,
  readCanonicalJsonFile, validatePacketManifest, validateStageManifest, verifyPacketManifest, verifyStageManifest,
  assertNoDeferredBrowserVerificationArtifacts,
} from './manifest.mjs';
import {
  SANITIZER_SCHEMA, SANITIZER_VERSION, sanitizeContent, scanCustomerContent, scanSensitiveContent,
  verifySanitizationSummary,
} from './sanitize.mjs';

const EVENT_FIELDS = [
  'schema_version', 'operation_id', 'sequence', 'event_id', 'stage_id', 'event_type', 'action_timestamp',
  'collection_timestamp', 'archive_timestamp', 'target_classification', 'command_category', 'expected_result',
  'observed_result', 'result_classification', 'exit_code', 'sanitized_artifact_paths', 'previous_event_hash', 'current_event_hash',
];
const EVENT_INPUT_FIELDS = new Set(['stage_id', 'event_id', 'event_type', 'action_timestamp', 'archive_timestamp', 'command_category', 'expected_result', 'observed_result', 'result_classification', 'exit_code', 'sanitized_artifact_paths']);
const TERMINAL_TOKEN_STATES = new Set(['completed', 'command_failed', 'signaled', 'sanitizer_failed', 'interrupted', 'failed_before_execution', 'harness_failed_after_execution', 'limit_exceeded']);
const TOKEN_STATES = new Set(['claimed', 'started', ...TERMINAL_TOKEN_STATES]);
const TOKEN_FIELDS = ['schema_version', 'operation_id', 'stage_id', 'token', 'command_category', 'expected_result', 'state', 'claimed_at', 'started_at', 'completed_at', 'command_result', 'harness_result', 'retry'];
const WRAPPER_SIGNALS = new Set(['SIGINT', 'SIGTERM', 'SIGHUP']);
const SEAL_SCHEMA = 'servsync-controlled-ops/seal-v2';
const FREEZE_SCHEMA = 'servsync-controlled-ops/stage-freeze-v2';
const TERMINAL_EVENT_EXPECTATIONS = Object.freeze({
  completed: { observed: new Set(['passed']), exitKinds: new Set(['normal']), artifacts: 'required', startedEvent: 'required' },
  command_failed: { observed: new Set(['command_failed']), exitKinds: new Set(['normal']), artifacts: 'required', startedEvent: 'required' },
  signaled: { observed: new Set(['signaled']), exitKinds: new Set(['signal']), artifacts: 'required', startedEvent: 'required' },
  sanitizer_failed: { observed: new Set(['sanitizer_failed']), exitKinds: new Set(['normal', 'signal']), artifacts: 'forbidden', startedEvent: 'required' },
  interrupted: { observed: new Set(['interrupted']), exitKinds: new Set(['not_started', 'normal', 'signal']), artifacts: 'forbidden', startedEvent: 'allowed' },
  failed_before_execution: { observed: new Set(['failed_before_execution']), exitKinds: new Set(['not_started']), artifacts: 'forbidden', startedEvent: 'forbidden' },
  harness_failed_after_execution: { observed: new Set(['harness_failed', 'affected_rows_mismatch']), exitKinds: new Set(['normal', 'signal']), artifacts: 'allowed', startedEvent: 'required' },
  limit_exceeded: { observed: new Set(['limit_exceeded']), exitKinds: new Set(['signal']), artifacts: 'forbidden', startedEvent: 'required' },
});

function parseOptions(arguments_) {
  const options = { positional: [] };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument.startsWith('--')) { options.positional.push(argument); continue; }
    const name = argument.slice(2); const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) throw new EvidenceError('INVALID_ARGUMENTS', `Missing value for --${name}.`);
    options[name] = value; index += 1;
  }
  return options;
}
function required(options, name) { const value = options[name]; if (typeof value !== 'string' || value.length === 0) throw new EvidenceError('INVALID_ARGUMENTS', `--${name} is required.`); return value; }
function parseInteger(value, name) { if (!/^-?\d+$/.test(value ?? '')) throw new EvidenceError('INVALID_ARGUMENTS', `--${name} must be an integer.`); return Number.parseInt(value, 10); }
function operationPaths(root) { return { events: join(root, 'events.ndjson'), tokens: join(root, 'tokens'), stages: join(root, 'stages'), quarantine: join(root, 'quarantine'), manifest: join(root, 'manifest.json'), seal: join(root, 'seal.json') }; }

export function initializeOperation(root, fields) {
  assertSupportedPlatform(); validateRawOperationRootInput(root); const rootPath = resolve(root); assertOutsideGit(dirname(rootPath));
  if (existsSync(rootPath)) throw new EvidenceError('OPERATION_ROOT_EXISTS', 'Operation root must not already exist.');
  validateOperationId(fields.operationId); validateOperationClassification(fields.operationClassification);
  validateTargetClassification(fields.targetClassification); validateAuthorizationReference(fields.authorizationReference);
  process.umask(0o077); mkdirSync(rootPath, { mode: 0o700 });
  for (const directory of ['tokens', 'stages', 'quarantine']) mkdirSync(join(rootPath, directory), { mode: 0o700 });
  const createdAt = fields.createdAt ?? utcNow(); validateTimestamp(createdAt, 'createdAt');
  writeJsonAtomic(join(rootPath, 'operation.json'), {
    schema_version: SCHEMA_VERSION, operation_id: fields.operationId, created_utc: createdAt,
    operation_classification: fields.operationClassification, target_classification: fields.targetClassification,
    authorization_reference: fields.authorizationReference, tool_version: TOOL_VERSION,
    root_identity: pathIdentity(rootPath), limits: LIMITS,
  }, 0o600, rootPath);
  const descriptor = openExclusivePacketFile(rootPath, join(rootPath, 'events.ndjson'));
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
  fsyncDirectory(rootPath); return rootPath;
}

function validateEvent(event) {
  assertExactObject(event, EVENT_FIELDS, [], 'event record');
  if (event.schema_version !== SCHEMA_VERSION || !Number.isInteger(event.sequence) || event.sequence < 1) throw new EvidenceError('INVALID_EVENT_SEQUENCE', 'Event schema or sequence is invalid.');
  validateOperationId(event.operation_id); validateSafeLabel(event.event_id, 'event ID');
  validateControlledSlug(event.stage_id, 'stage ID'); validateControlledSlug(event.event_type, 'event type', { allowUnderscore: true });
  validateTargetClassification(event.target_classification); validateExpectedResult(event.expected_result);
  validateControlledSlug(event.observed_result, 'observed result', { allowUnderscore: true });
  validateControlledSlug(event.result_classification, 'result classification', { allowUnderscore: true });
  if (event.command_category !== null) validateCommandCategory(event.command_category);
  if (event.exit_code !== null && (!Number.isInteger(event.exit_code) || event.exit_code < 0 || event.exit_code > 255)) throw new EvidenceError('INVALID_EXIT_CODE', 'Event exit code is invalid.');
  if (!Array.isArray(event.sanitized_artifact_paths) || event.sanitized_artifact_paths.length > LIMITS.artifact_count_per_stage) throw new EvidenceError('INVALID_EVENT_ARTIFACTS', 'Event artifact paths are invalid.');
  event.sanitized_artifact_paths.forEach((path) => validateRelativePath(path));
  return event;
}

export function readEvents(root) {
  const path = operationPaths(root).events; assertPacketOwnedFile(root, path, [0o600], LIMITS.manifest_bytes);
  const content = readFileSync(path, 'utf8'); if (content === '') return [];
  if (!content.endsWith('\n')) throw new EvidenceError('TRUNCATED_EVENT_LOG', 'Event timeline does not end on a record boundary.');
  const lines = content.slice(0, -1).split('\n'); if (lines.length > LIMITS.event_count) throw new EvidenceError('EVENT_COUNT_LIMIT', 'Event count exceeds its configured limit.');
  return lines.map((line) => {
    let event; try { event = JSON.parse(line); } catch { throw new EvidenceError('INVALID_EVENT_LOG', 'Event timeline contains malformed JSON.'); }
    validateEvent(event);
    if (line !== canonicalStringify(event)) throw new EvidenceError('NONCANONICAL_EVENT', 'Event timeline contains a noncanonical record.');
    return event;
  });
}

export function verifyEventChain(root) {
  const { metadata } = assertOperationRoot(root); const events = readEvents(root);
  let previousHash = GENESIS_HASH; let previousTimestamp = validateTimestamp(metadata.created_utc, 'operation created timestamp'); let previousCollectionTimestamp = previousTimestamp; const eventIds = new Set();
  events.forEach((event, index) => {
    if (event.operation_id !== metadata.operation_id || event.sequence !== index + 1) throw new EvidenceError('INVALID_EVENT_SEQUENCE', 'Event sequence or operation identity is invalid.');
    if (eventIds.has(event.event_id)) throw new EvidenceError('DUPLICATE_EVENT_ID', 'Event ID is duplicated.'); eventIds.add(event.event_id);
    const actionTime = validateTimestamp(event.action_timestamp, 'action timestamp'); const collectionTime = validateTimestamp(event.collection_timestamp, 'collection timestamp');
    if (actionTime < previousTimestamp || collectionTime < actionTime || collectionTime < previousCollectionTimestamp) throw new EvidenceError('TIMESTAMP_REGRESSION', 'Event timestamps regress.');
    if (event.archive_timestamp !== null && validateTimestamp(event.archive_timestamp, 'archive timestamp') < collectionTime) throw new EvidenceError('TIMESTAMP_REGRESSION', 'Archive timestamp precedes collection.');
    if (event.previous_event_hash !== previousHash) throw new EvidenceError('EVENT_CHAIN_MISMATCH', 'Previous event hash is invalid.');
    const { current_event_hash: currentHash, ...withoutHash } = event; const expectedHash = sha256(`${previousHash}\n${canonicalStringify(withoutHash)}`);
    if (currentHash !== expectedHash) throw new EvidenceError('EVENT_CHAIN_MISMATCH', 'Current event hash is invalid.');
    previousHash = currentHash; previousTimestamp = actionTime; previousCollectionTimestamp = collectionTime;
  });
  return { eventCount: events.length, head: previousHash, lastActionTimestamp: events.at(-1)?.action_timestamp ?? metadata.created_utc };
}

export function appendEventUnderPacketMutation(rootPath, metadata, expectedHead, input) {
  for (const key of Object.keys(input)) if (!EVENT_INPUT_FIELDS.has(key)) throw new EvidenceError('UNKNOWN_EVENT_FIELD', 'Event input contains an unknown field.');
  validateControlledSlug(input.stage_id, 'stage ID'); validateSafeLabel(input.event_id, 'event ID');
  validateControlledSlug(input.event_type, 'event type', { allowUnderscore: true });
  validateControlledSlug(input.result_classification, 'result classification', { allowUnderscore: true });
  validateExpectedResult(input.expected_result); validateControlledSlug(input.observed_result, 'observed result', { allowUnderscore: true });
  if (input.command_category !== null) validateCommandCategory(input.command_category); validateTimestamp(input.action_timestamp, 'action timestamp');
  if (input.archive_timestamp !== null) validateTimestamp(input.archive_timestamp, 'archive timestamp');
  const stagePath = resolveInside(rootPath, `stages/${input.stage_id}`); if (!existsSync(stagePath) || existsSync(join(stagePath, 'stage-freeze.json'))) throw new EvidenceError('INVALID_STAGE', 'Events require an existing workflow-unfrozen stage.');
  const chain = verifyEventChain(rootPath); if (chain.eventCount >= LIMITS.event_count) throw new EvidenceError('EVENT_COUNT_LIMIT', 'Event count exceeds its configured limit.');
  if (readEvents(rootPath).some((event) => event.event_id === input.event_id)) throw new EvidenceError('DUPLICATE_EVENT_ID', 'Event ID is duplicated.');
  if (expectedHead !== chain.head) throw new EvidenceError('STALE_EVENT_HEAD', 'Expected event head is stale.');
  if (Date.parse(input.action_timestamp) < Date.parse(chain.lastActionTimestamp)) throw new EvidenceError('TIMESTAMP_REGRESSION', 'Event action timestamp regresses.');
  const artifacts = input.sanitized_artifact_paths ?? []; artifacts.forEach((path) => { const safe = validateRelativePath(path); if (!safe.startsWith(`stages/${input.stage_id}/artifacts/`)) throw new EvidenceError('INVALID_EVENT_ARTIFACTS', 'Event artifacts must belong to the event stage.'); });
  const withoutHash = { schema_version: SCHEMA_VERSION, operation_id: metadata.operation_id, sequence: chain.eventCount + 1, event_id: input.event_id, stage_id: input.stage_id, event_type: input.event_type, action_timestamp: input.action_timestamp, collection_timestamp: utcNow(), archive_timestamp: input.archive_timestamp, target_classification: metadata.target_classification, command_category: input.command_category, expected_result: input.expected_result, observed_result: input.observed_result, result_classification: input.result_classification, exit_code: input.exit_code, sanitized_artifact_paths: artifacts, previous_event_hash: chain.head };
  const event = { ...withoutHash, current_event_hash: sha256(`${chain.head}\n${canonicalStringify(withoutHash)}`) }; validateEvent(event);
  const descriptor = openSync(operationPaths(rootPath).events, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
  try { writeFileSync(descriptor, `${canonicalStringify(event)}\n`, 'utf8'); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  fsyncDirectory(rootPath); return event;
}

export function appendEvent(root, expectedHead, input) { return withPacketMutationLock(root, 'append-event', ({ rootPath, metadata }) => appendEventUnderPacketMutation(rootPath, metadata, expectedHead, input)); }

export function createStage(root, stageId) {
  return withPacketMutationLock(root, 'create-stage', ({ rootPath, metadata }) => {
    validateControlledSlug(stageId, 'stage ID'); const stagePath = resolveInside(rootPath, `stages/${stageId}`); if (existsSync(stagePath)) throw new EvidenceError('STAGE_EXISTS', 'Stage already exists.');
    mkdirSync(join(stagePath, 'artifacts'), { recursive: true, mode: 0o700 });
    writeJsonAtomic(join(stagePath, 'artifact-index.json'), { schema_version: 'servsync-controlled-ops/artifact-index-v2', operation_id: metadata.operation_id, stage_id: stageId, artifacts: [] }, 0o600, rootPath);
  });
}

function tokenPath(root, token) { validateControlledSlug(token, 'token'); return resolveInside(root, `tokens/${token}.json`); }
function validateCommandResult(value) {
  if (value === null) return;
  assertExactObject(value, ['exit_kind', 'exit_code', 'signal_name', 'signal_number'], [], 'command result');
  if (!['normal', 'signal', 'not_started'].includes(value.exit_kind)) throw new EvidenceError('INVALID_TOKEN', 'Command exit kind is invalid.');
  if (value.exit_kind === 'normal' && (!Number.isInteger(value.exit_code) || value.exit_code < 0 || value.exit_code > 255 || value.signal_name !== null || value.signal_number !== null)) throw new EvidenceError('INVALID_TOKEN', 'Normal command result is invalid.');
  if (value.exit_kind === 'signal' && (value.exit_code !== null || typeof value.signal_name !== 'string' || !Number.isInteger(value.signal_number))) throw new EvidenceError('INVALID_TOKEN', 'Signal command result is invalid.');
  if (value.exit_kind === 'not_started' && (value.exit_code !== null || value.signal_name !== null || value.signal_number !== null)) throw new EvidenceError('INVALID_TOKEN', 'Pre-execution command result is invalid.');
}
function validateToken(token, metadata) {
  assertExactObject(token, TOKEN_FIELDS, [], 'execution token');
  if (token.schema_version !== 'servsync-controlled-ops/execution-token-v2' || token.operation_id !== metadata.operation_id || !TOKEN_STATES.has(token.state)) throw new EvidenceError('INVALID_TOKEN', 'Execution token schema, operation, or state is invalid.');
  validateControlledSlug(token.stage_id, 'stage ID'); validateControlledSlug(token.token, 'token');
  validateCommandCategory(token.command_category); validateExpectedResult(token.expected_result);
  validateTimestamp(token.claimed_at, 'token claimed timestamp'); if (token.started_at !== null) validateTimestamp(token.started_at, 'token started timestamp'); if (token.completed_at !== null) validateTimestamp(token.completed_at, 'token completed timestamp');
  validateCommandResult(token.command_result);
  if (token.harness_result !== null) {
    assertExactObject(token.harness_result, ['classification', 'detail', 'wrapper_signal', 'forwarded_signal'], [], 'harness result');
    validateControlledSlug(token.harness_result.classification, 'harness classification', { allowUnderscore: true });
    validateControlledSlug(token.harness_result.detail, 'harness detail', { allowUnderscore: true });
    if (token.harness_result.wrapper_signal !== null && !WRAPPER_SIGNALS.has(token.harness_result.wrapper_signal)) throw new EvidenceError('INVALID_TOKEN', 'Wrapper signal provenance is invalid.');
    if (token.harness_result.forwarded_signal !== null && !WRAPPER_SIGNALS.has(token.harness_result.forwarded_signal)) throw new EvidenceError('INVALID_TOKEN', 'Forwarded signal provenance is invalid.');
  }
  if (token.retry !== null) {
    assertExactObject(token.retry, ['prior_token', 'authorization_reference', 'retry_count'], [], 'retry lineage');
    validateControlledSlug(token.retry.prior_token, 'prior token'); validateAuthorizationReference(token.retry.authorization_reference, 'retry authorization');
    if (!Number.isInteger(token.retry.retry_count) || token.retry.retry_count < 1) throw new EvidenceError('INVALID_TOKEN', 'Retry count is invalid.');
  }
  if (['claimed'].includes(token.state) && (token.started_at !== null || token.completed_at !== null)) throw new EvidenceError('INVALID_TOKEN', 'Claimed token timestamps are inconsistent.');
  if (token.state === 'started' && (token.started_at === null || token.completed_at !== null)) throw new EvidenceError('INVALID_TOKEN', 'Started token timestamps are inconsistent.');
  if (TERMINAL_TOKEN_STATES.has(token.state) && token.completed_at === null) throw new EvidenceError('INVALID_TOKEN', 'Terminal token lacks completion evidence.');
  if (token.state === 'completed' && (token.command_result?.exit_kind !== 'normal' || token.command_result.exit_code !== 0)) throw new EvidenceError('INVALID_TOKEN', 'Completed token command evidence is inconsistent.');
  if (token.state === 'command_failed' && (token.command_result?.exit_kind !== 'normal' || token.command_result.exit_code === 0)) throw new EvidenceError('INVALID_TOKEN', 'Failed token command evidence is inconsistent.');
  if (token.state === 'signaled' && token.command_result?.exit_kind !== 'signal') throw new EvidenceError('INVALID_TOKEN', 'Signaled token command evidence is inconsistent.');
  if (token.state === 'failed_before_execution' && token.command_result?.exit_kind !== 'not_started') throw new EvidenceError('INVALID_TOKEN', 'Pre-execution token evidence is inconsistent.');
  if (token.state === 'interrupted' && token.harness_result?.classification !== 'interrupted') throw new EvidenceError('INVALID_TOKEN', 'Interrupted token evidence is inconsistent.');
  if (token.harness_result !== null && token.harness_result.wrapper_signal !== null && token.state !== 'interrupted') throw new EvidenceError('INVALID_TOKEN', 'Wrapper signal provenance is only valid for interruptions.');
  if (token.harness_result !== null && token.harness_result.forwarded_signal !== token.harness_result.wrapper_signal) throw new EvidenceError('INVALID_TOKEN', 'Forwarded signal provenance is inconsistent.');
  return token;
}

function eventExitCode(commandResult) {
  if (commandResult?.exit_kind === 'normal') return commandResult.exit_code;
  if (commandResult?.exit_kind === 'signal') return 128 + commandResult.signal_number;
  return null;
}

export function terminalObservedResultForState(state, detail = null) {
  const expectation = TERMINAL_EVENT_EXPECTATIONS[state];
  if (!expectation) throw new EvidenceError('INVALID_TOKEN', 'Terminal token state has no event mapping.');
  const observed = state === 'completed' ? 'passed'
    : (state === 'harness_failed_after_execution' ? (detail === 'affected_rows_mismatch' ? 'affected_rows_mismatch' : 'harness_failed') : state);
  if (!expectation.observed.has(observed)) throw new EvidenceError('INVALID_TOKEN', 'Terminal token state cannot emit the requested result.');
  return observed;
}

function verifyTerminalEventBinding(token, events) {
  const expectation = TERMINAL_EVENT_EXPECTATIONS[token.state];
  if (!expectation) throw new EvidenceError('INVALID_TOKEN', 'Terminal token state has no event mapping.');
  const startedEvents = events.filter((event) => event.event_id === `${token.token}-started`);
  const terminalEvents = events.filter((event) => event.event_id === `${token.token}-completed`);
  if (terminalEvents.length !== 1) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} must have exactly one terminal event.`);
  if (expectation.startedEvent === 'required' && startedEvents.length !== 1) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} lacks required start evidence.`);
  if (expectation.startedEvent === 'forbidden' && startedEvents.length !== 0) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} has impossible start evidence.`);
  if (expectation.startedEvent === 'allowed' && startedEvents.length > 1) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} has duplicate start evidence.`);
  if (token.started_at !== null && startedEvents.length !== 1) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} lacks required start evidence.`);
  if (token.started_at === null && startedEvents.length !== 0) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} has start evidence without a started token timestamp.`);
  const terminal = terminalEvents[0];
  if (terminal.event_type !== 'command_completed' || terminal.stage_id !== token.stage_id || terminal.command_category !== token.command_category || terminal.expected_result !== token.expected_result) {
    throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} terminal event does not match token context.`);
  }
  if (!expectation.observed.has(terminal.observed_result) || terminal.result_classification !== terminal.observed_result) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} terminal event classification is incompatible.`);
  if (!expectation.exitKinds.has(token.command_result?.exit_kind) || terminal.exit_code !== eventExitCode(token.command_result)) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} terminal event exit evidence is incompatible.`);
  if (expectation.artifacts === 'required' && terminal.sanitized_artifact_paths.length === 0) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} terminal event lacks required artifacts.`);
  if (expectation.artifacts === 'forbidden' && terminal.sanitized_artifact_paths.length !== 0) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} terminal event has forbidden artifacts.`);
  if (token.state === 'interrupted') {
    const signal = token.harness_result?.wrapper_signal;
    if (token.command_result.exit_kind === 'not_started' && signal === null) throw new EvidenceError('INCOMPLETE_TOKEN_TIMELINE', `Execution token ${token.token} interruption lacks wrapper signal provenance.`);
  }
}

function verifyTokensUnlocked(root, metadata) {
  const tokens = []; const retryAuthorizations = new Set(); const events = readEvents(root);
  for (const file of readDirectorySorted(operationPaths(root).tokens)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}\.json$/.test(file)) throw new EvidenceError('UNCLASSIFIED_FILE', 'Token directory contains an unexpected file.');
    const token = validateToken(readCanonicalJsonFile(join(operationPaths(root).tokens, file)), metadata);
    if (!TERMINAL_TOKEN_STATES.has(token.state)) throw new EvidenceError('UNRESOLVED_TOKEN', `Execution token ${token.token} is unresolved in state ${token.state}.`);
    verifyTerminalEventBinding(token, events);
    if (token.retry) {
      if (retryAuthorizations.has(token.retry.authorization_reference)) throw new EvidenceError('DUPLICATE_RETRY_AUTHORIZATION', 'Retry authorization is reused.'); retryAuthorizations.add(token.retry.authorization_reference);
      if (token.retry.prior_token === token.token) throw new EvidenceError('RETRY_CYCLE', 'Retry token cannot reference itself.');
      const priorPath = tokenPath(root, token.retry.prior_token); if (!existsSync(priorPath)) throw new EvidenceError('RETRY_TOKEN_MISSING', 'Prior retry token does not exist.');
      const prior = validateToken(readCanonicalJsonFile(priorPath), metadata);
      if (!TERMINAL_TOKEN_STATES.has(prior.state) || prior.operation_id !== token.operation_id || prior.stage_id !== token.stage_id || prior.command_category !== token.command_category || (prior.retry?.retry_count ?? 0) + 1 !== token.retry.retry_count) throw new EvidenceError('INVALID_RETRY_LINEAGE', 'Retry lineage is incompatible.');
    }
    tokens.push(token);
  }
  return tokens;
}
export function verifyTokens(root) { const { rootPath, metadata } = assertOperationRoot(root); assertNoPacketLock(rootPath); return verifyTokensUnlocked(rootPath, metadata); }

export function claimExecutionToken(root, fields) {
  return withPacketMutationLock(root, 'claim-token', ({ rootPath, metadata }) => {
    validateControlledSlug(fields.stageId, 'stage ID'); validateControlledSlug(fields.token, 'token');
    validateCommandCategory(fields.commandCategory); validateExpectedResult(fields.expectedResult);
    const stagePath = resolveInside(rootPath, `stages/${fields.stageId}`); if (!existsSync(stagePath) || existsSync(join(stagePath, 'stage-freeze.json'))) throw new EvidenceError('INVALID_STAGE', 'Execution stage is missing or workflow-frozen.');
    let retry = null;
    if (fields.retryOf || fields.retryAuthorization) {
      if (!fields.retryOf || !fields.retryAuthorization || fields.retryOf === fields.token) throw new EvidenceError('RETRY_NOT_AUTHORIZED', 'Retries require a distinct prior token and explicit authorization.');
      validateControlledSlug(fields.retryOf, 'retry token'); validateAuthorizationReference(fields.retryAuthorization, 'retry authorization');
      for (const file of readDirectorySorted(operationPaths(rootPath).tokens)) {
        const existing = validateToken(readCanonicalJsonFile(join(operationPaths(rootPath).tokens, file)), metadata);
        if (existing.retry?.authorization_reference === fields.retryAuthorization) throw new EvidenceError('DUPLICATE_RETRY_AUTHORIZATION', 'Retry authorization is already used.');
      }
      const priorPath = tokenPath(rootPath, fields.retryOf); if (!existsSync(priorPath)) throw new EvidenceError('RETRY_TOKEN_MISSING', 'Prior retry token does not exist.');
      const prior = validateToken(readCanonicalJsonFile(priorPath), metadata);
      if (!TERMINAL_TOKEN_STATES.has(prior.state) || prior.operation_id !== metadata.operation_id || prior.stage_id !== fields.stageId || prior.command_category !== fields.commandCategory) throw new EvidenceError('RETRY_NOT_AUTHORIZED', 'Prior token is not a compatible terminal execution.');
      retry = { prior_token: fields.retryOf, authorization_reference: fields.retryAuthorization, retry_count: (prior.retry?.retry_count ?? 0) + 1 };
    }
    const record = { schema_version: 'servsync-controlled-ops/execution-token-v2', operation_id: metadata.operation_id, stage_id: fields.stageId, token: fields.token, command_category: fields.commandCategory, expected_result: fields.expectedResult, state: 'claimed', claimed_at: utcNow(), started_at: null, completed_at: null, command_result: null, harness_result: null, retry };
    try { claimFileAtomic(rootPath, tokenPath(rootPath, fields.token), record); } catch (error) { if (error?.code === 'CAPTURE_SETUP_FAILURE' || error?.code === 'PREEXISTING_LEAF') throw new EvidenceError('ALREADY_CLAIMED', 'The one-time token is already claimed.'); throw error; }
    return record;
  });
}

export function updateExecutionToken(root, token, state, fields = {}) {
  return withPacketMutationLock(root, 'update-token', ({ rootPath, metadata }) => {
    if (!TOKEN_STATES.has(state)) throw new EvidenceError('INVALID_TOKEN_STATUS', 'Execution token state is invalid.');
    const path = tokenPath(rootPath, token); const current = validateToken(readCanonicalJsonFile(path), metadata);
    const transitions = { claimed: new Set(['started', 'failed_before_execution', 'interrupted']), started: new Set(['completed', 'command_failed', 'signaled', 'sanitizer_failed', 'interrupted', 'harness_failed_after_execution', 'limit_exceeded']) };
    if (!transitions[current.state]?.has(state)) throw new EvidenceError('INVALID_TOKEN_TRANSITION', 'Execution token transition is invalid.');
    const now = utcNow(); const next = { ...current, state, started_at: state === 'started' ? now : current.started_at, completed_at: TERMINAL_TOKEN_STATES.has(state) ? now : null, command_result: fields.commandResult ?? current.command_result, harness_result: fields.harnessResult ?? current.harness_result };
    validateToken(next, metadata); writeJsonAtomic(path, next, 0o600, rootPath); return next;
  });
}

function verifyArtifactSummary(root, stageId, entry) {
  if (entry.sanitization_status === 'internal') return;
  const artifactPath = resolveInside(root, `stages/${stageId}/artifacts/${entry.path}`); const summaryPath = resolveInside(root, `stages/${stageId}/artifacts/${entry.summary_path}`);
  assertPacketOwnedFile(root, artifactPath, [0o600, 0o400]); assertPacketOwnedFile(root, summaryPath, [0o600, 0o400]);
  const output = readFileSync(artifactPath, 'utf8'); const summary = readCanonicalJsonFile(summaryPath);
  verifySanitizationSummary(summary, { artifactPath: entry.path, output });
}

export function registerArtifact(root, stageId, artifactPath, artifactClass, summaryPath = null) {
  return withPacketMutationLock(root, 'register-artifact', ({ rootPath, metadata }) => {
    validateSafeLabel(stageId, 'stage ID'); validateSafeLabel(artifactClass, 'artifact class'); const relativeArtifactPath = validateRelativePath(artifactPath, 'artifact path');
    const stagePath = resolveInside(rootPath, `stages/${stageId}`); if (existsSync(join(stagePath, 'stage-freeze.json'))) throw new EvidenceError('STAGE_FROZEN', 'Workflow-frozen stages cannot accept artifacts.');
    const fullArtifactPath = resolveInside(rootPath, `stages/${stageId}/artifacts/${relativeArtifactPath}`); assertPacketOwnedFile(rootPath, fullArtifactPath, [0o600]);
    let relativeSummaryPath;
    if (artifactClass === 'sanitization_summary') relativeSummaryPath = relativeArtifactPath;
    else {
      if (!summaryPath) throw new EvidenceError('SANITIZATION_NOT_PROVEN', 'A sanitization summary is required.');
      const safeSummaryPath = resolve(summaryPath); const rel = relative(resolveInside(rootPath, `stages/${stageId}/artifacts`), safeSummaryPath).split('\\').join('/');
      if (rel.startsWith('..') || isAbsolute(rel)) throw new EvidenceError('PATH_ESCAPE', 'Sanitization summary must be in the same stage artifact directory.');
      relativeSummaryPath = validateRelativePath(rel, 'summary path');
      verifySanitizationSummary(readCanonicalJsonFile(safeSummaryPath), { artifactPath: relativeArtifactPath, output: readFileSync(fullArtifactPath, 'utf8') });
    }
    const indexPath = join(stagePath, 'artifact-index.json'); const index = readCanonicalJsonFile(indexPath);
    if (index.schema_version !== 'servsync-controlled-ops/artifact-index-v2' || index.operation_id !== metadata.operation_id || index.stage_id !== stageId || !Array.isArray(index.artifacts)) throw new EvidenceError('INVALID_ARTIFACT_INDEX', 'Artifact index is invalid.');
    if (index.artifacts.length >= LIMITS.artifact_count_per_stage) throw new EvidenceError('ARTIFACT_COUNT_LIMIT', 'Artifact count exceeds its configured limit.');
    if (index.artifacts.some((entry) => entry.path === relativeArtifactPath)) throw new EvidenceError('ARTIFACT_EXISTS', 'Artifact is already registered.');
    index.artifacts.push({ path: relativeArtifactPath, artifact_class: artifactClass, sanitization_status: artifactClass === 'sanitization_summary' ? 'internal' : 'passed', summary_path: relativeSummaryPath }); index.artifacts.sort((a, b) => compareStrings(a.path, b.path));
    writeJsonAtomic(indexPath, index, 0o600, rootPath);
  });
}

export function promoteCommandArtifacts(root, stageId, token, items) {
  return withPacketMutationLock(root, 'promote-artifacts', ({ rootPath, metadata }) => {
    validateSafeLabel(stageId, 'stage ID'); validateSafeLabel(token, 'token');
    const stagePath = resolveInside(rootPath, `stages/${stageId}`); const artifactDir = join(stagePath, 'artifacts'); assertPacketOwnedDirectory(rootPath, artifactDir, [0o700]);
    const indexPath = join(stagePath, 'artifact-index.json'); const index = readCanonicalJsonFile(indexPath); if (index.operation_id !== metadata.operation_id) throw new EvidenceError('INVALID_ARTIFACT_INDEX', 'Artifact index operation mismatch.');
    const additions = [];
    for (const item of items) {
      assertExactObject(item, ['source', 'destination', 'artifact_class', 'summary_destination'], [], 'promotion item');
      const source = resolveInside(rootPath, validateRelativePath(item.source)); const destinationRelative = validateRelativePath(item.destination); const destination = resolveInside(rootPath, `stages/${stageId}/artifacts/${destinationRelative}`);
      assertPacketOwnedFile(rootPath, source, [0o600], LIMITS.artifact_bytes); assertPacketOwnedDirectory(rootPath, dirname(destination), [0o700]);
      const descriptor = openExclusivePacketFile(rootPath, destination, 0o600);
      try { writeFileSync(descriptor, readFileSync(source)); fsyncSync(descriptor); } finally { closeSync(descriptor); }
      fsyncDirectory(dirname(destination)); unlinkSync(source);
      additions.push({ path: destinationRelative, artifact_class: item.artifact_class, sanitization_status: item.artifact_class === 'sanitization_summary' ? 'internal' : 'passed', summary_path: validateRelativePath(item.summary_destination) });
    }
    if (index.artifacts.length + additions.length > LIMITS.artifact_count_per_stage) throw new EvidenceError('ARTIFACT_COUNT_LIMIT', 'Artifact count exceeds its configured limit.');
    for (const entry of additions) if (index.artifacts.some((current) => current.path === entry.path)) throw new EvidenceError('ARTIFACT_EXISTS', 'Artifact is already registered.'); else index.artifacts.push(entry);
    index.artifacts.sort((a, b) => compareStrings(a.path, b.path));
    for (const entry of additions.filter((item) => item.sanitization_status === 'passed')) verifyArtifactSummary(rootPath, stageId, entry);
    writeJsonAtomic(indexPath, index, 0o600, rootPath); return additions;
  });
}

function scanArtifact(path) {
  const content = readFileSync(path, 'utf8');
  return {
    secret: scanSensitiveContent(content),
    customer: scanCustomerContent(content),
  };
}
function scanPacketSecurity(root, { allowActiveLock = false } = {}) {
  const totals = { secret_findings: 0, customer_content_findings: 0, files_scanned: 0 };
  const visit = (path, depth = 0) => {
    if (depth > LIMITS.traversal_depth) throw new EvidenceError('TRAVERSAL_DEPTH_LIMIT', 'Packet traversal exceeds its configured depth.');
    const info = lstatSync(path); if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted.');
    if (info.isDirectory()) {
      if (path === operationPaths(root).quarantine) { if (readDirectorySorted(path).length > 0) throw new EvidenceError('QUARANTINE_NOT_EMPTY', 'Quarantine must be empty.'); return; }
      for (const name of readDirectorySorted(path)) {
        if (path === root && name === PACKET_LOCK_NAME) { if (!allowActiveLock) throw new EvidenceError('CONCURRENT_OPERATION', 'Packet scan encountered a mutation lock.'); continue; }
        visit(join(path, name), depth + 1);
      }
    } else if (info.isFile()) {
      assertPacketOwnedFile(root, path, [0o600, 0o400], LIMITS.manifest_bytes);
      const scans = scanArtifact(path); totals.secret_findings += scans.secret.length; totals.customer_content_findings += scans.customer.length; totals.files_scanned += 1;
    } else throw new EvidenceError('UNSUPPORTED_FILE', 'Unsupported packet entry.');
  };
  visit(root); return totals;
}

function freezeTree(root, path, depth = 0) {
  if (depth > LIMITS.traversal_depth) throw new EvidenceError('TRAVERSAL_DEPTH_LIMIT', 'Freeze traversal exceeds its configured depth.');
  const info = lstatSync(path); if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted.');
  if (info.isDirectory()) { assertPacketOwnedDirectory(root, path, [0o700]); for (const name of readDirectorySorted(path)) freezeTree(root, join(path, name), depth + 1); chmodSync(path, 0o500); }
  else if (info.isFile()) { assertPacketOwnedFile(root, path, [0o600]); chmodSync(path, 0o400); }
  else throw new EvidenceError('UNSUPPORTED_FILE', 'Only packet-owned regular files may be workflow-frozen.');
}

export function freezeStage(root, stageId, timestamps = {}) {
  return withPacketMutationLock(root, 'freeze-stage', ({ rootPath, metadata }) => {
    validateControlledSlug(stageId, 'stage ID'); verifyTokensUnlocked(rootPath, metadata);
    if (readDirectorySorted(operationPaths(rootPath).quarantine).length > 0) throw new EvidenceError('QUARANTINE_NOT_EMPTY', 'Quarantine must be empty before freeze.');
    const stagePath = resolveInside(rootPath, `stages/${stageId}`); if (existsSync(join(stagePath, 'stage-freeze.json'))) throw new EvidenceError('STAGE_FROZEN', 'Stage is already workflow-frozen.');
    const index = readCanonicalJsonFile(join(stagePath, 'artifact-index.json')); if (!Array.isArray(index.artifacts) || index.artifacts.length === 0) throw new EvidenceError('MISSING_ARTIFACT', 'A stage cannot freeze without evidence artifacts.');
    assertNoDeferredBrowserVerificationArtifacts(rootPath, metadata.operation_id, stageId);
    const chain = verifyEventChain(rootPath);
    const registered = new Set(index.artifacts.map((entry) => entry.path)); const retained = [];
    const collect = (path, prefix = '', depth = 0) => {
      if (depth > LIMITS.traversal_depth) throw new EvidenceError('TRAVERSAL_DEPTH_LIMIT', 'Stage traversal exceeds its configured depth.');
      for (const name of readDirectorySorted(path)) { const current = join(path, name); const rel = prefix ? `${prefix}/${name}` : name; const info = lstatSync(current); if (info.isDirectory()) collect(current, rel, depth + 1); else { assertPacketOwnedFile(rootPath, current, [0o600]); retained.push(rel); } }
    };
    collect(join(stagePath, 'artifacts')); if (canonicalStringify([...registered].sort(compareStrings)) !== canonicalStringify(retained.sort(compareStrings))) throw new EvidenceError('UNCLASSIFIED_FILE', 'Stage contains missing or unregistered artifacts.');
    for (const entry of index.artifacts) { if (entry.sanitization_status === 'passed') verifyArtifactSummary(rootPath, stageId, entry); const scans = scanArtifact(resolveInside(rootPath, `stages/${stageId}/artifacts/${entry.path}`)); if (scans.secret.length) throw new EvidenceError('SECRET_SCAN_FAILED', 'Stage secret scan failed.'); if (scans.customer.length) throw new EvidenceError('CUSTOMER_SCAN_FAILED', 'Stage customer-content scan failed.'); }
    const actionTimestamp = timestamps.actionTimestamp ?? utcNow(); const collectionTimestamp = timestamps.collectionTimestamp ?? utcNow(); const freezeTimestamp = timestamps.freezeTimestamp ?? utcNow();
    const action = validateTimestamp(actionTimestamp, 'stage action timestamp'); const collection = validateTimestamp(collectionTimestamp, 'stage collection timestamp'); const frozen = validateTimestamp(freezeTimestamp, 'stage freeze timestamp'); if (action < Date.parse(chain.lastActionTimestamp) || collection < action || frozen < collection) throw new EvidenceError('TIMESTAMP_REGRESSION', 'Stage timestamps regress.');
    freezeTree(rootPath, join(stagePath, 'artifacts')); chmodSync(join(stagePath, 'artifact-index.json'), 0o400);
    const manifest = buildStageManifest(rootPath, metadata.operation_id, stageId, index); writeJsonAtomic(join(stagePath, 'stage-manifest.json'), manifest, 0o400, rootPath);
    const freezeRecord = { schema_version: FREEZE_SCHEMA, operation_id: metadata.operation_id, stage_id: stageId, lifecycle: 'workflow-frozen', action_completed_utc: actionTimestamp, collected_utc: collectionTimestamp, frozen_utc: freezeTimestamp, event_chain_head: chain.head, stage_manifest_digest: manifestDigest(manifest), security_scan: { secret_findings: 0, customer_content_findings: 0 } };
    writeJsonAtomic(join(stagePath, 'stage-freeze.json'), freezeRecord, 0o400, rootPath); chmodSync(stagePath, 0o500); fsyncDirectory(dirname(stagePath)); return freezeRecord;
  });
}

function validateFreeze(freeze, metadata, stageId) {
  assertExactObject(freeze, ['schema_version', 'operation_id', 'stage_id', 'lifecycle', 'action_completed_utc', 'collected_utc', 'frozen_utc', 'event_chain_head', 'stage_manifest_digest', 'security_scan'], [], 'stage freeze');
  assertExactObject(freeze.security_scan, ['secret_findings', 'customer_content_findings'], [], 'stage security scan');
  if (freeze.schema_version !== FREEZE_SCHEMA || freeze.operation_id !== metadata.operation_id || freeze.stage_id !== stageId || freeze.lifecycle !== 'workflow-frozen') throw new EvidenceError('STAGE_FREEZE_MISMATCH', 'Stage freeze schema is invalid.');
  if (freeze.security_scan.secret_findings !== 0 || freeze.security_scan.customer_content_findings !== 0 || !/^[a-f0-9]{64}$/.test(freeze.event_chain_head) || !/^[a-f0-9]{64}$/.test(freeze.stage_manifest_digest)) throw new EvidenceError('STAGE_FREEZE_MISMATCH', 'Stage freeze integrity values are invalid.');
  return freeze;
}
export function verifyStageFreeze(root, stageId) {
  const { rootPath, metadata } = assertOperationRoot(root); validateControlledSlug(stageId, 'stage ID'); const stagePath = resolveInside(rootPath, `stages/${stageId}`); assertPacketOwnedDirectory(rootPath, stagePath, [0o500]);
  assertNoDeferredBrowserVerificationArtifacts(rootPath, metadata.operation_id, stageId);
  const manifestPath = join(stagePath, 'stage-manifest.json'); const freezePath = join(stagePath, 'stage-freeze.json'); assertPacketOwnedFile(rootPath, manifestPath, [0o400]); assertPacketOwnedFile(rootPath, freezePath, [0o400]);
  const manifest = readCanonicalJsonFile(manifestPath); validateStageManifest(manifest); const freeze = validateFreeze(readCanonicalJsonFile(freezePath), metadata, stageId);
  if (freeze.stage_manifest_digest !== manifestDigest(manifest)) throw new EvidenceError('STAGE_FREEZE_MISMATCH', 'Stage manifest digest does not match freeze.');
  const heads = new Set([GENESIS_HASH, ...readEvents(rootPath).map((event) => event.current_event_hash)]); if (!heads.has(freeze.event_chain_head)) throw new EvidenceError('STAGE_FREEZE_MISMATCH', 'Stage freeze references an unknown event head.');
  const action = validateTimestamp(freeze.action_completed_utc, 'stage action timestamp'); const collection = validateTimestamp(freeze.collected_utc, 'stage collection timestamp'); const frozen = validateTimestamp(freeze.frozen_utc, 'stage freeze timestamp'); if (collection < action || frozen < collection) throw new EvidenceError('TIMESTAMP_REGRESSION', 'Stage timestamps regress.');
  verifyStageManifest(rootPath, manifest); return freeze;
}

function permissionSummary(root, { allowActiveLock = false } = {}) {
  const entries = [];
  const visit = (path, relativePath = '', depth = 0) => {
    if (depth > LIMITS.traversal_depth) throw new EvidenceError('TRAVERSAL_DEPTH_LIMIT', 'Permission traversal exceeds its configured depth.');
    for (const name of readDirectorySorted(path)) {
      const rel = relativePath ? `${relativePath}/${name}` : name; if (rel === PACKET_LOCK_NAME) { if (!allowActiveLock) throw new EvidenceError('CONCURRENT_OPERATION', 'Permission verification encountered a lock.'); continue; }
      const current = join(path, name); const info = lstatSync(current); if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted.');
      if (info.isDirectory()) { const expected = rel.startsWith('stages/') && existsSync(join(root, rel.split('/').slice(0, 2).join('/'), 'stage-freeze.json')) ? 0o500 : 0o700; assertPacketOwnedDirectory(root, current, [expected]); entries.push({ path: rel, type: 'directory', mode: expected.toString(8) }); visit(current, rel, depth + 1); }
      else {
        if (rel === 'manifest.json' || rel === 'seal.json') { assertPacketOwnedFile(root, current, [0o600], LIMITS.manifest_bytes); continue; }
        let expected = 0o600; if (/^stages\/[^/]+\/(?:artifacts\/.*|artifact-index\.json|stage-manifest\.json|stage-freeze\.json)$/.test(rel) && existsSync(join(root, rel.split('/').slice(0, 2).join('/'), 'stage-freeze.json'))) expected = 0o400; assertPacketOwnedFile(root, current, [expected], LIMITS.manifest_bytes); entries.push({ path: rel, type: 'file', mode: expected.toString(8) });
      }
    }
  };
  visit(root); return { entries, digest: sha256(canonicalStringify(entries)) };
}

export function createManifest(root) {
  return withPacketMutationLock(root, 'create-manifest', ({ rootPath, metadata }) => {
    assertNoDeferredBrowserVerificationArtifacts(rootPath, metadata.operation_id);
    verifyEventChain(rootPath); verifyTokensUnlocked(rootPath, metadata); for (const stageId of readDirectorySorted(operationPaths(rootPath).stages)) verifyStageFreeze(rootPath, stageId);
    const security = scanPacketSecurity(rootPath, { allowActiveLock: true }); if (security.secret_findings) throw new EvidenceError('SECRET_SCAN_FAILED', 'Packet secret scan failed.'); if (security.customer_content_findings) throw new EvidenceError('CUSTOMER_SCAN_FAILED', 'Packet customer-content scan failed.');
    const manifest = buildPacketManifest(rootPath, metadata.operation_id, { allowActiveLock: true }); writeJsonAtomic(operationPaths(rootPath).manifest, manifest, 0o600, rootPath); return manifest;
  });
}

function validateSeal(seal, metadata) {
  assertExactObject(seal, ['schema_version', 'operation_id', 'sealed_utc', 'manifest_digest', 'final_event_chain_head', 'stage_freeze_digests', 'security_scan_summary', 'permission_digest', 'external_anchor'], [], 'packet seal');
  assertExactObject(seal.security_scan_summary, ['secret_findings', 'customer_content_findings', 'files_scanned'], [], 'seal security scan');
  if (seal.schema_version !== SEAL_SCHEMA || seal.operation_id !== metadata.operation_id || seal.external_anchor !== 'retain-seal-sha256-outside-packet' || !Array.isArray(seal.stage_freeze_digests)) throw new EvidenceError('INVALID_SEAL', 'Packet seal schema is invalid.');
  for (const entry of seal.stage_freeze_digests) { assertExactObject(entry, ['stage_id', 'freeze_digest'], [], 'seal stage digest'); validateControlledSlug(entry.stage_id, 'seal stage ID'); if (!/^[a-f0-9]{64}$/.test(entry.freeze_digest)) throw new EvidenceError('INVALID_SEAL', 'Stage freeze digest is invalid.'); }
  if (![seal.manifest_digest, seal.final_event_chain_head, seal.permission_digest].every((value) => /^[a-f0-9]{64}$/.test(value)) || seal.security_scan_summary.secret_findings !== 0 || seal.security_scan_summary.customer_content_findings !== 0 || !Number.isInteger(seal.security_scan_summary.files_scanned)) throw new EvidenceError('INVALID_SEAL', 'Seal integrity values are invalid.');
  validateTimestamp(seal.sealed_utc, 'sealed timestamp'); return seal;
}
export function sealOperation(root, sealedAt = utcNow()) {
  return withPacketMutationLock(root, 'seal', ({ rootPath, metadata }) => {
    assertNoDeferredBrowserVerificationArtifacts(rootPath, metadata.operation_id);
    validateTimestamp(sealedAt, 'sealed timestamp'); verifyTokensUnlocked(rootPath, metadata); assertPacketOwnedFile(rootPath, operationPaths(rootPath).manifest, [0o600], LIMITS.manifest_bytes);
    const manifest = readCanonicalJsonFile(operationPaths(rootPath).manifest); validatePacketManifest(manifest); verifyPacketManifest(rootPath, manifest, { allowActiveLock: true }); const chain = verifyEventChain(rootPath);
    const stages = readDirectorySorted(operationPaths(rootPath).stages).map((stageId) => { const freeze = verifyStageFreeze(rootPath, stageId); return { stage_id: stageId, freeze_digest: sha256(`${canonicalStringify(freeze)}\n`) }; });
    const security = scanPacketSecurity(rootPath, { allowActiveLock: true }); if (security.secret_findings || security.customer_content_findings) throw new EvidenceError('SECURITY_SCAN_FAILED', 'Packet security scan failed.');
    const permissions = permissionSummary(rootPath, { allowActiveLock: true });
    const seal = { schema_version: SEAL_SCHEMA, operation_id: metadata.operation_id, sealed_utc: sealedAt, manifest_digest: manifestDigest(manifest), final_event_chain_head: chain.head, stage_freeze_digests: stages, security_scan_summary: security, permission_digest: permissions.digest, external_anchor: 'retain-seal-sha256-outside-packet' };
    writeJsonAtomic(operationPaths(rootPath).seal, seal, 0o600, rootPath); return { seal, seal_sha256: sha256(`${canonicalStringify(seal)}\n`) };
  });
}

export function verifyPacket(root, expectedSealDigest = null) {
  const { rootPath, metadata } = assertOperationRoot(root); assertNoPacketLock(rootPath); assertNoDeferredBrowserVerificationArtifacts(rootPath, metadata.operation_id); const chain = verifyEventChain(rootPath); const tokens = verifyTokensUnlocked(rootPath, metadata); const stages = readDirectorySorted(operationPaths(rootPath).stages).map((stageId) => verifyStageFreeze(rootPath, stageId));
  assertPacketOwnedFile(rootPath, operationPaths(rootPath).manifest, [0o600], LIMITS.manifest_bytes); assertPacketOwnedFile(rootPath, operationPaths(rootPath).seal, [0o600], LIMITS.manifest_bytes);
  const manifest = readCanonicalJsonFile(operationPaths(rootPath).manifest); verifyPacketManifest(rootPath, manifest); const seal = validateSeal(readCanonicalJsonFile(operationPaths(rootPath).seal), metadata);
  const digest = sha256(`${canonicalStringify(seal)}\n`); if (expectedSealDigest !== null && expectedSealDigest !== digest) throw new EvidenceError('EXTERNAL_ANCHOR_MISMATCH', 'Packet seal does not match the externally retained digest.');
  if (seal.manifest_digest !== manifestDigest(manifest) || seal.final_event_chain_head !== chain.head || canonicalStringify(seal.stage_freeze_digests) !== canonicalStringify(stages.map((freeze) => ({ stage_id: freeze.stage_id, freeze_digest: sha256(`${canonicalStringify(freeze)}\n`) })))) throw new EvidenceError('SEAL_MISMATCH', 'Packet seal does not match retained evidence.');
  if (seal.permission_digest !== permissionSummary(rootPath).digest) throw new EvidenceError('SEAL_MISMATCH', 'Packet permissions do not match the seal.');
  const security = scanPacketSecurity(rootPath); if (security.secret_findings || security.customer_content_findings) throw new EvidenceError('SECURITY_SCAN_FAILED', 'Packet security scan failed.');
  return { operation_id: metadata.operation_id, event_count: chain.eventCount, token_count: tokens.length, stage_count: stages.length, seal_sha256: digest, status: 'verified' };
}

function eventInput(options) { return { stage_id: required(options, 'stage'), event_id: required(options, 'event-id'), event_type: required(options, 'event-type'), action_timestamp: required(options, 'action-timestamp'), archive_timestamp: options['archive-timestamp'] ?? null, command_category: options.category ?? null, expected_result: required(options, 'expected'), observed_result: required(options, 'observed'), result_classification: required(options, 'result-classification'), exit_code: options['exit-code'] === undefined ? null : parseInteger(options['exit-code'], 'exit-code'), sanitized_artifact_paths: options.artifacts ? options.artifacts.split(',').filter(Boolean) : [] }; }

function commandResultFromOptions(options) {
  const kind = required(options, 'exit-kind'); return { exit_kind: kind, exit_code: options['exit-code'] === undefined ? null : parseInteger(options['exit-code'], 'exit-code'), signal_name: options['signal-name'] ?? null, signal_number: options['signal-number'] === undefined ? null : parseInteger(options['signal-number'], 'signal-number') };
}

function runCli() {
  const [command, ...arguments_] = process.argv.slice(2); const options = parseOptions(arguments_);
  switch (command) {
    case 'init': initializeOperation(required(options, 'root'), { operationId: required(options, 'operation-id'), operationClassification: required(options, 'classification'), targetClassification: required(options, 'target'), authorizationReference: required(options, 'authorization-reference'), createdAt: options['created-at'] }); break;
    case 'create-stage': createStage(required(options, 'root'), required(options, 'stage')); break;
    case 'head': { const rootPath = required(options, 'root'); assertNoPacketLock(rootPath); process.stdout.write(`${verifyEventChain(rootPath).head}\n`); break; }
    case 'append-event': process.stdout.write(`${canonicalStringify(appendEvent(required(options, 'root'), required(options, 'expected-head'), eventInput(options)))}\n`); break;
    case 'claim-token': process.stdout.write(`${canonicalStringify(claimExecutionToken(required(options, 'root'), { stageId: required(options, 'stage'), token: required(options, 'token'), commandCategory: required(options, 'category'), expectedResult: required(options, 'expected'), retryOf: options['retry-of'], retryAuthorization: options['retry-authorization'] }))}\n`); break;
    case 'update-token': process.stdout.write(`${canonicalStringify(updateExecutionToken(required(options, 'root'), required(options, 'token'), required(options, 'status'), { commandResult: options['exit-kind'] ? commandResultFromOptions(options) : undefined, harnessResult: options['harness-classification'] ? { classification: options['harness-classification'], detail: required(options, 'harness-detail'), wrapper_signal: options['wrapper-signal'] ?? null, forwarded_signal: options['forwarded-signal'] ?? null } : undefined }))}\n`); break;
    case 'register-artifact': registerArtifact(required(options, 'root'), required(options, 'stage'), required(options, 'path'), required(options, 'class'), options.summary); break;
    case 'freeze-stage': process.stdout.write(`${canonicalStringify(freezeStage(required(options, 'root'), required(options, 'stage')))}\n`); break;
    case 'create-manifest': process.stdout.write(`${canonicalStringify(createManifest(required(options, 'root')))}\n`); break;
    case 'seal': { const result = sealOperation(required(options, 'root')); process.stdout.write(`${canonicalStringify(result)}\n`); break; }
    case 'verify-metadata': { const rootPath = required(options, 'root'); assertNoPacketLock(rootPath); process.stdout.write(`${canonicalStringify(assertOperationRoot(rootPath).metadata)}\n`); break; }
    case 'verify-events': { const rootPath = required(options, 'root'); assertNoPacketLock(rootPath); process.stdout.write(`${canonicalStringify(verifyEventChain(rootPath))}\n`); break; }
    case 'verify-tokens': process.stdout.write(`${canonicalStringify({ count: verifyTokens(required(options, 'root')).length, status: 'verified' })}\n`); break;
    case 'verify-stage': { const rootPath = required(options, 'root'); assertNoPacketLock(rootPath); process.stdout.write(`${canonicalStringify(verifyStageFreeze(rootPath, required(options, 'stage')))}\n`); break; }
    case 'verify-manifest': { const rootPath = required(options, 'root'); process.stdout.write(`${canonicalStringify(verifyPacketManifest(rootPath, readCanonicalJsonFile(join(rootPath, 'manifest.json'))))}\n`); break; }
    case 'verify-permissions': process.stdout.write(`${canonicalStringify(permissionSummary(required(options, 'root')))}\n`); break;
    case 'verify-paths': { const { rootPath, metadata } = assertOperationRoot(required(options, 'root')); buildPacketManifest(rootPath, metadata.operation_id); process.stdout.write('{"status":"verified"}\n'); break; }
    case 'verify-secret-scan': { const result = scanPacketSecurity(required(options, 'root')); if (result.secret_findings) throw new EvidenceError('SECRET_SCAN_FAILED', 'Packet secret scan failed.'); process.stdout.write(`${canonicalStringify({ files_scanned: result.files_scanned, secret_findings: 0, status: 'verified' })}\n`); break; }
    case 'verify-customer-scan': { const result = scanPacketSecurity(required(options, 'root')); if (result.customer_content_findings) throw new EvidenceError('CUSTOMER_SCAN_FAILED', 'Packet customer-content scan failed.'); process.stdout.write(`${canonicalStringify({ files_scanned: result.files_scanned, customer_content_findings: 0, status: 'verified' })}\n`); break; }
    case 'verify-seal': case 'verify': process.stdout.write(`${canonicalStringify(verifyPacket(required(options, 'root'), options['expected-seal-digest'] ?? null))}\n`); break;
    default: throw new EvidenceError('INVALID_COMMAND', 'Unknown evidence command.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { runCli(); } catch (error) { const safe = safeError(error); process.stderr.write(`${basename(process.argv[1])}: ${safe.code}: ${safe.message}\n`); process.exitCode = 90; }
}
