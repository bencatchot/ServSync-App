import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const SCHEMA_VERSION = 'servsync-controlled-ops/v2';
export const TOOL_VERSION = '1.2.0';
export const GENESIS_HASH = '0'.repeat(64);
export const SAFE_LABEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
export const PACKET_LOCK_NAME = '.controlled-ops-mutation.lock';
export const LIMITS = Object.freeze({
  command_runtime_ms: 30_000,
  command_termination_grace_ms: 1_000,
  stdout_bytes: 1_048_576,
  stderr_bytes: 1_048_576,
  combined_capture_bytes: 1_572_864,
  line_bytes: 16_384,
  json_input_bytes: 262_144,
  json_depth: 16,
  json_array_items: 256,
  json_object_fields: 64,
  event_count: 10_000,
  artifact_count_per_stage: 256,
  traversal_depth: 24,
  artifact_bytes: 2_097_152,
  manifest_bytes: 4_194_304,
  packet_bytes: 64 * 1_048_576,
});
export const SUCCESSFUL_HARNESS_CLASSIFICATIONS = Object.freeze(['completed', 'evidence_complete']);
const SUCCESSFUL_HARNESS_CLASSIFICATION_SET = new Set(SUCCESSFUL_HARNESS_CLASSIFICATIONS);
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

export class EvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EvidenceError';
    this.code = code;
  }
}

export function fail(code, message) {
  throw new EvidenceError(code, message);
}

export function assertSupportedPlatform() {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    fail('UNSUPPORTED_PLATFORM', 'Controlled operations require supported POSIX semantics.');
  }
  if (typeof process.getuid !== 'function' || constants.O_NOFOLLOW === undefined) {
    fail('UNSUPPORTED_PLATFORM', 'Required POSIX ownership or no-follow primitives are unavailable.');
  }
}

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_CANONICAL_VALUE', 'Canonical data must contain finite numbers.');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(compareStrings).map((key) => [key, canonicalize(value[key])]));
  }
  fail('INVALID_CANONICAL_VALUE', 'Canonical data contains an unsupported value.');
}

export function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256File(path, maximumBytes = LIMITS.artifact_bytes) {
  const info = statSync(path);
  if (info.size > maximumBytes) fail('FILE_SIZE_LIMIT', 'Evidence file exceeds its configured size limit.');
  return sha256(readFileSync(path));
}

export function utcNow() {
  return new Date().toISOString();
}

export function validateTimestamp(value, fieldName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    fail('INVALID_TIMESTAMP', `${fieldName} must be a canonical UTC timestamp.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('INVALID_TIMESTAMP', `${fieldName} must be a valid canonical UTC timestamp.`);
  return parsed;
}

export function validateSafeLabel(value, fieldName) {
  if (typeof value !== 'string' || !SAFE_LABEL_PATTERN.test(value)) fail('INVALID_LABEL', `${fieldName} must be a safe label.`);
  return value;
}

function entropyBitsPerCharacter(value) {
  const counts = new Map();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

export function validateRawOperationRootInput(value, fieldName = 'operation root') {
  if (typeof value !== 'string' || value.length === 0) fail('UNSAFE_OPERATION_ROOT', `${fieldName} is invalid.`);
  if (value.normalize('NFC') !== value || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) {
    fail('UNSAFE_OPERATION_ROOT', `${fieldName} contains unsafe characters.`);
  }
  return value;
}

function rejectOpaqueValue(value, fieldName) {
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(value)
    || /^[a-f0-9]{32,}$/i.test(value)
    || /^[A-Za-z0-9_+/=-]{24,}$/.test(value)
    || (value.length >= 24 && entropyBitsPerCharacter(value) >= 3.8)) {
    fail('UNSAFE_CALLER_METADATA', `${fieldName} must be a short non-secret reference.`);
  }
}

export function validateControlledSlug(value, fieldName, { maxLength = 64, allowUnderscore = false } = {}) {
  const pattern = allowUnderscore ? /^[a-z][a-z0-9_-]{0,63}$/ : /^[a-z][a-z0-9-]{0,63}$/;
  if (typeof value !== 'string' || value.length > maxLength || !pattern.test(value) || value.normalize('NFC') !== value) {
    fail('INVALID_LABEL', `${fieldName} must be a bounded structured label.`);
  }
  rejectOpaqueValue(value, fieldName);
  return value;
}

export function validateOperationId(value) {
  return validateControlledSlug(value, 'operation ID', { maxLength: 64 });
}

export function validateOperationClassification(value) {
  return validateControlledSlug(value, 'operation classification', { maxLength: 40 });
}

export function validateTargetClassification(value) {
  return validateControlledSlug(value, 'target classification', { maxLength: 40 });
}

export function validateCommandCategory(value) {
  return validateControlledSlug(value, 'command category', { maxLength: 48 });
}

export function validateExpectedResult(value) {
  return validateControlledSlug(value, 'expected result', { maxLength: 32 });
}

function eventExitCode(commandResult) {
  if (commandResult?.exit_kind === 'normal') return commandResult.exit_code;
  if (commandResult?.exit_kind === 'signal') return 128 + commandResult.signal_number;
  return null;
}

function terminalBindingError(code, message) {
  throw new EvidenceError(code, message);
}

export function validateSuccessfulHarnessResult(harnessResult, { code = 'INVALID_TOKEN' } = {}) {
  if (harnessResult === null
    || !SUCCESSFUL_HARNESS_CLASSIFICATION_SET.has(harnessResult.classification)
    || harnessResult.wrapper_signal !== null
    || harnessResult.forwarded_signal !== null) {
    terminalBindingError(code, 'Completed token harness evidence is inconsistent.');
  }
}

export function terminalObservedResultForState(state, detail = null, { code = 'INVALID_TOKEN' } = {}) {
  const expectation = TERMINAL_EVENT_EXPECTATIONS[state];
  if (!expectation) terminalBindingError(code, 'Terminal token state has no event mapping.');
  const observed = state === 'completed' ? 'passed'
    : (state === 'harness_failed_after_execution' ? (detail === 'affected_rows_mismatch' ? 'affected_rows_mismatch' : 'harness_failed') : state);
  if (!expectation.observed.has(observed)) terminalBindingError(code, 'Terminal token state cannot emit the requested result.');
  return observed;
}

export function validateTerminalEventBinding(token, events, { code = 'INCOMPLETE_TOKEN_TIMELINE' } = {}) {
  const expectation = TERMINAL_EVENT_EXPECTATIONS[token.state];
  if (!expectation) terminalBindingError(code, 'Terminal token state has no event mapping.');
  const startedEvents = events.filter((event) => event.event_id === `${token.token}-started`);
  const terminalEvents = events.filter((event) => event.event_id === `${token.token}-completed`);
  if (terminalEvents.length !== 1) terminalBindingError(code, `Execution token ${token.token} must have exactly one terminal event.`);
  if (expectation.startedEvent === 'required' && startedEvents.length !== 1) terminalBindingError(code, `Execution token ${token.token} lacks required start evidence.`);
  if (expectation.startedEvent === 'forbidden' && startedEvents.length !== 0) terminalBindingError(code, `Execution token ${token.token} has impossible start evidence.`);
  if (expectation.startedEvent === 'allowed' && startedEvents.length > 1) terminalBindingError(code, `Execution token ${token.token} has duplicate start evidence.`);
  if (token.started_at !== null && startedEvents.length !== 1) terminalBindingError(code, `Execution token ${token.token} lacks required start evidence.`);
  if (token.started_at === null && startedEvents.length !== 0) terminalBindingError(code, `Execution token ${token.token} has start evidence without a started token timestamp.`);
  const terminal = terminalEvents[0];
  if (terminal.event_type !== 'command_completed'
    || terminal.stage_id !== token.stage_id
    || terminal.command_category !== token.command_category
    || terminal.expected_result !== token.expected_result) {
    terminalBindingError(code, `Execution token ${token.token} terminal event does not match token context.`);
  }
  if (!expectation.observed.has(terminal.observed_result)
    || terminal.result_classification !== terminal.observed_result
    || terminal.observed_result !== terminalObservedResultForState(token.state, token.harness_result?.detail ?? null, { code })) {
    terminalBindingError(code, `Execution token ${token.token} terminal event classification is incompatible.`);
  }
  if (!expectation.exitKinds.has(token.command_result?.exit_kind) || terminal.exit_code !== eventExitCode(token.command_result)) {
    terminalBindingError(code, `Execution token ${token.token} terminal event exit evidence is incompatible.`);
  }
  if (expectation.artifacts === 'required' && terminal.sanitized_artifact_paths.length === 0) terminalBindingError(code, `Execution token ${token.token} terminal event lacks required artifacts.`);
  if (expectation.artifacts === 'forbidden' && terminal.sanitized_artifact_paths.length !== 0) terminalBindingError(code, `Execution token ${token.token} terminal event has forbidden artifacts.`);
  if (token.state === 'completed') validateSuccessfulHarnessResult(token.harness_result, { code });
  if (token.state === 'interrupted') {
    const signal = token.harness_result?.wrapper_signal;
    if (token.command_result.exit_kind === 'not_started' && signal === null) terminalBindingError(code, `Execution token ${token.token} interruption lacks wrapper signal provenance.`);
  }
  return terminal;
}

export function validateAuthorizationReference(value, fieldName = 'authorization reference') {
  if (typeof value !== 'string' || value.length > 40 || value.normalize('NFC') !== value) {
    fail('UNSAFE_CALLER_METADATA', `${fieldName} must be a bounded non-secret authorization reference.`);
  }
  const match = /^(owner|ticket|issue|review|task|change):([a-z0-9][a-z0-9-]{1,23})$/.exec(value);
  if (!match) fail('UNSAFE_CALLER_METADATA', `${fieldName} must use an approved human-readable reference type.`);
  const shortReference = match[2];
  const compact = shortReference.replaceAll('-', '');
  if ((compact.length >= 16 && /[a-z]/.test(compact) && /\d/.test(compact)) || /^[a-f0-9]{16,}$/i.test(compact)) {
    fail('UNSAFE_CALLER_METADATA', `${fieldName} must not contain opaque random-looking material.`);
  }
  rejectOpaqueValue(value, fieldName);
  return value;
}

export function validateRelativePath(value, fieldName = 'path') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || isAbsolute(value) || value.includes('\0') || /[\u0000-\u001f\u007f]/.test(value)) {
    fail('UNSAFE_PATH', `${fieldName} must be a bounded relative path without control characters.`);
  }
  const normalized = value.normalize('NFC').replaceAll('\\', '/');
  if (normalized !== value.replaceAll('\\', '/') || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    fail('UNSAFE_PATH', `${fieldName} contains an unsafe or noncanonical segment.`);
  }
  return normalized;
}

export function resolveInside(root, relativePath) {
  validateRawOperationRootInput(root);
  const safeRelative = validateRelativePath(relativePath);
  const rootPath = resolve(root);
  const candidate = resolve(rootPath, safeRelative);
  if (candidate === rootPath || !candidate.startsWith(`${rootPath}${sep}`)) fail('PATH_ESCAPE', 'Path escapes the operation root.');
  return candidate;
}

function existingAncestor(path) {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) fail('MISSING_PATH', 'No existing path ancestor was found.');
    current = parent;
  }
  return current;
}

export function assertCanonicalParents(path) {
  const ancestor = existingAncestor(path);
  if (realpathSync(ancestor) !== ancestor) fail('SYMLINK_REJECTED', 'Symlinked path components are not supported.');
  let current = ancestor;
  while (true) {
    if (lstatSync(current).isSymbolicLink()) fail('SYMLINK_REJECTED', 'Symlinked path components are not supported.');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function assertNoSymlinkPath(root, candidate, { allowMissingLeaf = false } = {}) {
  const rootPath = resolve(root);
  const target = resolve(candidate);
  if (target !== rootPath && !target.startsWith(`${rootPath}${sep}`)) fail('PATH_ESCAPE', 'Path escapes the operation root.');
  const rel = relative(rootPath, target);
  let current = rootPath;
  const parts = rel === '' ? [] : rel.split(sep);
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    if (!existsSync(current)) {
      if (allowMissingLeaf && index === parts.length - 1) return;
      fail('MISSING_PATH', 'Required path does not exist.');
    }
    if (lstatSync(current).isSymbolicLink()) fail('SYMLINK_REJECTED', 'Symlinks are not permitted in operation packets.');
  }
}

function modeOf(info) {
  return info.mode & 0o777;
}

export function pathIdentity(path) {
  const info = lstatSync(path);
  return { device: String(info.dev), inode: String(info.ino), uid: info.uid, mode: modeOf(info), links: info.nlink };
}

export function assertDirectoryMode(path, allowedModes = [0o700, 0o500]) {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || !allowedModes.includes(modeOf(info))) fail('UNSAFE_DIRECTORY_MODE', 'Directory type or permissions are unsafe.');
}

export function assertFileMode(path, allowedModes = [0o600, 0o400]) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || !allowedModes.includes(modeOf(info))) fail('UNSAFE_FILE_MODE', 'File type or permissions are unsafe.');
}

export function assertPacketOwnedDirectory(root, path, allowedModes = [0o700, 0o500]) {
  assertNoSymlinkPath(root, path);
  const rootInfo = lstatSync(root);
  const info = lstatSync(path);
  if (!info.isDirectory() || info.uid !== process.getuid() || info.dev !== rootInfo.dev || !allowedModes.includes(modeOf(info))) {
    fail('UNSAFE_DIRECTORY', 'Packet directory ownership, device, type, or mode is unsafe.');
  }
  return info;
}

export function assertPacketOwnedFile(root, path, allowedModes = [0o600, 0o400], maximumBytes = LIMITS.artifact_bytes) {
  assertNoSymlinkPath(root, path);
  const rootInfo = lstatSync(root);
  const info = lstatSync(path);
  if (!info.isFile() || info.uid !== process.getuid() || info.dev !== rootInfo.dev || info.nlink !== 1 || !allowedModes.includes(modeOf(info))) {
    fail('UNSAFE_FILE', 'Packet file ownership, device, link count, type, or mode is unsafe.');
  }
  if (info.size > maximumBytes) fail('FILE_SIZE_LIMIT', 'Evidence file exceeds its configured size limit.');
  return info;
}

export function openExclusivePacketFile(root, path, mode = 0o600) {
  assertSupportedPlatform();
  assertPacketOwnedDirectory(root, dirname(path), [0o700]);
  if (existsSync(path)) fail('PREEXISTING_LEAF', 'Evidence destination already exists.');
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
    const info = fstatSync(descriptor);
    const rootInfo = lstatSync(root);
    if (!info.isFile() || info.uid !== process.getuid() || info.dev !== rootInfo.dev || info.nlink !== 1 || modeOf(info) !== mode) {
      fail('UNSAFE_FILE', 'New evidence file did not satisfy packet ownership invariants.');
    }
    return descriptor;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { if (existsSync(path) && !lstatSync(path).isSymbolicLink()) unlinkSync(path); } catch {}
    if (error instanceof EvidenceError) throw error;
    fail('CAPTURE_SETUP_FAILURE', 'Evidence destination could not be created securely.');
  }
}

export function fsyncDirectory(path) {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(descriptor); } catch { fail('UNSUPPORTED_DURABILITY', 'Directory fsync is unavailable on this filesystem.'); } finally { closeSync(descriptor); }
}

export function writeJsonAtomic(path, value, mode = 0o600, root = dirname(path)) {
  const parent = dirname(path);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
  const packetRoot = resolve(root);
  assertPacketOwnedDirectory(packetRoot, parent, [0o700, 0o500]);
  if (existsSync(path)) assertPacketOwnedFile(packetRoot, path, [mode]);
  const temporaryPath = join(parent, `.controlled-ops-write-${randomUUID()}.tmp`);
  const descriptor = openExclusivePacketFile(packetRoot, temporaryPath, mode);
  try {
    writeFileSync(descriptor, `${canonicalStringify(value)}\n`, 'utf8');
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
  assertPacketOwnedDirectory(packetRoot, parent, [0o700, 0o500]);
  renameSync(temporaryPath, path);
  fsyncDirectory(parent);
}

export function readJson(path, maximumBytes = LIMITS.manifest_bytes) {
  const info = statSync(path);
  if (info.size > maximumBytes) fail('JSON_SIZE_LIMIT', 'JSON evidence exceeds its configured size limit.');
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { fail('INVALID_JSON', 'A required JSON artifact is malformed.'); }
}

export function claimFileAtomic(root, path, value) {
  const descriptor = openExclusivePacketFile(root, path, 0o600);
  try {
    writeFileSync(descriptor, `${canonicalStringify(value)}\n`, 'utf8');
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
  fsyncDirectory(dirname(path));
}

export function assertExactObject(value, requiredFields, optionalFields = [], label = 'record') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SCHEMA', `${label} must be an object.`);
  const allowed = new Set([...requiredFields, ...optionalFields]);
  const keys = Object.keys(value);
  for (const field of requiredFields) if (!Object.hasOwn(value, field)) fail('INVALID_SCHEMA', `${label} is missing a required field.`);
  for (const field of keys) if (!allowed.has(field)) fail('INVALID_SCHEMA', `${label} contains an unknown field.`);
  return value;
}

export function assertOutsideGit(path) {
  assertCanonicalParents(path);
  let current = realpathSync(existingAncestor(path));
  while (true) {
    if (existsSync(join(current, '.git'))) fail('INSIDE_GIT', 'Operation packets must be created outside Git worktrees.');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function assertOperationRoot(root, { allowSealed = true } = {}) {
  assertSupportedPlatform();
  validateRawOperationRootInput(root);
  const rootPath = resolve(root);
  if (!existsSync(rootPath) || realpathSync(rootPath) !== rootPath) fail('INVALID_PACKET', 'Operation root is missing or has a symlinked component.');
  assertPacketOwnedDirectory(rootPath, rootPath, [0o700]);
  const metadataPath = join(rootPath, 'operation.json');
  assertPacketOwnedFile(rootPath, metadataPath, [0o600]);
  const metadata = readJson(metadataPath);
  assertExactObject(metadata, [
    'schema_version', 'operation_id', 'created_utc', 'operation_classification', 'target_classification',
    'authorization_reference', 'tool_version', 'root_identity', 'limits',
  ], [], 'operation metadata');
  assertExactObject(metadata.root_identity, ['device', 'inode', 'uid', 'mode', 'links'], [], 'operation root identity');
  if (metadata.schema_version !== SCHEMA_VERSION || metadata.tool_version !== TOOL_VERSION) fail('INVALID_PACKET', 'Operation metadata is invalid.');
  validateOperationId(metadata.operation_id);
  validateOperationClassification(metadata.operation_classification);
  validateTargetClassification(metadata.target_classification);
  validateAuthorizationReference(metadata.authorization_reference);
  validateTimestamp(metadata.created_utc, 'operation created timestamp');
  const identity = pathIdentity(rootPath);
  for (const key of ['device', 'inode', 'uid', 'mode']) if (metadata.root_identity[key] !== identity[key]) fail('ROOT_IDENTITY_CHANGED', 'Operation root identity changed.');
  if (canonicalStringify(metadata.limits) !== canonicalStringify(LIMITS)) fail('INVALID_PACKET', 'Operation limits do not match this tool version.');
  if (!allowSealed && existsSync(join(rootPath, 'seal.json'))) fail('PACKET_SEALED', 'The operation packet is sealed.');
  return { rootPath, metadata };
}

export function withPacketMutationLock(root, category, action) {
  const { rootPath, metadata } = assertOperationRoot(root, { allowSealed: category === 'verify' });
  validateSafeLabel(category, 'lock category');
  const lockPath = join(rootPath, PACKET_LOCK_NAME);
  try { mkdirSync(lockPath, { mode: 0o700 }); } catch (error) {
    if (error?.code === 'EEXIST') fail('CONCURRENT_OPERATION', 'A packet mutation lock already exists; recovery is manual and fail-closed.');
    throw error;
  }
  try {
    assertPacketOwnedDirectory(rootPath, lockPath, [0o700]);
    writeJsonAtomic(join(lockPath, 'lock.json'), {
      schema_version: 'servsync-controlled-ops/lock-v1', operation_id: metadata.operation_id,
      category, pid: process.pid, created_utc: utcNow(),
    }, 0o600, rootPath);
    return action({ rootPath, metadata, lockPath });
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
    fsyncDirectory(rootPath);
  }
}

export function inspectPacketLock(root) {
  const rootPath = resolve(root); const lockPath = join(rootPath, PACKET_LOCK_NAME); const metadataPath = join(lockPath, 'lock.json');
  assertPacketOwnedDirectory(rootPath, lockPath, [0o700]); assertPacketOwnedFile(rootPath, metadataPath, [0o600]);
  const record = readJson(metadataPath); assertExactObject(record, ['schema_version', 'operation_id', 'category', 'pid', 'created_utc'], [], 'packet lock');
  const operation = readJson(join(rootPath, 'operation.json'));
  if (record.schema_version !== 'servsync-controlled-ops/lock-v1' || record.operation_id !== operation.operation_id || !Number.isInteger(record.pid) || record.pid < 1) fail('INVALID_LOCK', 'Packet lock metadata is invalid.');
  validateSafeLabel(record.operation_id, 'lock operation ID'); validateSafeLabel(record.category, 'lock category'); validateTimestamp(record.created_utc, 'lock created timestamp');
  if (readFileSync(metadataPath, 'utf8') !== `${canonicalStringify(record)}\n`) fail('INVALID_LOCK', 'Packet lock metadata is noncanonical.');
  return record;
}

export function assertNoPacketLock(root) {
  if (existsSync(join(resolve(root), PACKET_LOCK_NAME))) { inspectPacketLock(root); fail('CONCURRENT_OPERATION', 'Packet verification requires no active or stale mutation lock.'); }
}

export function safeError(error) {
  if (error instanceof EvidenceError) return { code: error.code, message: error.message };
  return { code: 'INTERNAL_ERROR', message: 'The evidence harness encountered an internal error.' };
}

export function readDirectorySorted(path) {
  return [...new Set(readdirSync(path))].sort(compareStrings);
}
