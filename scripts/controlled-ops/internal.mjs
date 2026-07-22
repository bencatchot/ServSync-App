import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const SCHEMA_VERSION = 'servsync-controlled-ops/v1';
export const TOOL_VERSION = '1.0.0';
export const GENESIS_HASH = '0'.repeat(64);
export const SAFE_LABEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

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

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_CANONICAL_VALUE', 'Canonical data must contain finite numbers.');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareStrings)
        .map((key) => [key, canonicalize(value[key])]),
    );
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

export function sha256File(path) {
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
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail('INVALID_TIMESTAMP', `${fieldName} must be a valid canonical UTC timestamp.`);
  }
  return parsed;
}

export function validateSafeLabel(value, fieldName) {
  if (typeof value !== 'string' || !SAFE_LABEL_PATTERN.test(value)) {
    fail('INVALID_LABEL', `${fieldName} must be a safe label.`);
  }
  return value;
}

export function validateRelativePath(value, fieldName = 'path') {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value) || value.includes('\0')) {
    fail('UNSAFE_PATH', `${fieldName} must be a nonempty relative path.`);
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    fail('UNSAFE_PATH', `${fieldName} contains an unsafe segment.`);
  }
  return normalized;
}

export function resolveInside(root, relativePath) {
  const safeRelative = validateRelativePath(relativePath);
  const rootPath = resolve(root);
  const candidate = resolve(rootPath, safeRelative);
  if (candidate === rootPath || !candidate.startsWith(`${rootPath}${sep}`)) {
    fail('PATH_ESCAPE', 'Path escapes the operation root.');
  }
  return candidate;
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

export function assertDirectoryMode(path, allowedModes = [0o700, 0o500]) {
  const mode = statSync(path).mode & 0o777;
  if (!allowedModes.includes(mode)) fail('UNSAFE_DIRECTORY_MODE', `Directory permissions are ${mode.toString(8)}.`);
}

export function assertFileMode(path, allowedModes = [0o600, 0o400]) {
  const mode = statSync(path).mode & 0o777;
  if (!allowedModes.includes(mode)) fail('UNSAFE_FILE_MODE', `File permissions are ${mode.toString(8)}.`);
}

export function writeJsonAtomic(path, value, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporaryPath, `${canonicalStringify(value)}\n`, { encoding: 'utf8', mode, flag: 'wx' });
  chmodSync(temporaryPath, mode);
  renameSync(temporaryPath, path);
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('INVALID_JSON', 'A required JSON artifact is malformed.');
  }
}

export function claimFileAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let descriptor;
  try {
    descriptor = openSync(path, 'wx', 0o600);
    writeFileSync(descriptor, `${canonicalStringify(value)}\n`, 'utf8');
  } catch (error) {
    if (error?.code === 'EEXIST') fail('ALREADY_CLAIMED', 'The one-time resource has already been claimed.');
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(path, 0o600);
}

export function withDirectoryLock(lockPath, action) {
  try {
    mkdirSync(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') fail('CONCURRENT_OPERATION', 'A concurrent packet operation is already in progress.');
    throw error;
  }
  try {
    return action();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function assertOutsideGit(path) {
  let current = resolve(path);
  while (true) {
    if (existsSync(join(current, '.git'))) fail('INSIDE_GIT', 'Operation packets must be created outside Git worktrees.');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function assertOperationRoot(root, { allowSealed = true } = {}) {
  const rootPath = resolve(root);
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) fail('INVALID_PACKET', 'Operation root does not exist.');
  if (lstatSync(rootPath).isSymbolicLink()) fail('SYMLINK_REJECTED', 'The operation root cannot be a symlink.');
  assertNoSymlinkPath(rootPath, rootPath);
  assertDirectoryMode(rootPath);
  const metadataPath = join(rootPath, 'operation.json');
  assertNoSymlinkPath(rootPath, metadataPath);
  assertFileMode(metadataPath);
  const metadata = readJson(metadataPath);
  if (metadata.schema_version !== SCHEMA_VERSION || !SAFE_LABEL_PATTERN.test(metadata.operation_id ?? '')) {
    fail('INVALID_PACKET', 'Operation metadata is invalid.');
  }
  if (!allowSealed && existsSync(join(rootPath, 'seal.json'))) fail('PACKET_SEALED', 'The operation packet is sealed.');
  return { rootPath, metadata };
}

export function safeError(error) {
  if (error instanceof EvidenceError) return { code: error.code, message: error.message };
  return { code: 'INTERNAL_ERROR', message: 'The evidence harness encountered an internal error.' };
}

export function readDirectorySorted(path) {
  return [...new Set(readdirSync(path))].sort(compareStrings);
}
