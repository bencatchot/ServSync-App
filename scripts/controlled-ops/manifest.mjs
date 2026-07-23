import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  EvidenceError, LIMITS, PACKET_LOCK_NAME, assertExactObject, assertPacketOwnedDirectory,
  assertPacketOwnedFile, canonicalStringify, compareStrings, readDirectorySorted, readJson,
  resolveInside, sha256, sha256File, validateControlledSlug, validateRelativePath, validateSafeLabel,
} from './internal.mjs';

export const MANIFEST_SCHEMA = 'servsync-controlled-ops/manifest-v2';
export const STAGE_MANIFEST_SCHEMA = 'servsync-controlled-ops/stage-manifest-v2';
const TOP_LEVEL_FILES = new Map([['operation.json', 'operation_metadata'], ['events.ndjson', 'event_timeline']]);
const INTEGRITY_FILES = new Set(['manifest.json', 'seal.json']);
const DEFERRED_BROWSER_ARTIFACT_CLASSES = new Set(['browser_summary', 'browser_import_summary']);
const DEFERRED_BROWSER_ARTIFACT_PATHS = new Map([
  ['browser-summary.json', 'browser_summary'],
  ['browser-import-summary.json', 'browser_import_summary'],
]);
const BROWSER_VERIFICATION_DEFERRED_MESSAGE = 'Browser-aware stage verification is deferred to Slice 2C-B; generic packet finalization is intentionally blocked.';

function validateRegistry(registry, operationId, stageId) {
  assertExactObject(registry, ['schema_version', 'operation_id', 'stage_id', 'artifacts'], [], 'artifact index');
  if (registry.schema_version !== 'servsync-controlled-ops/artifact-index-v2' || registry.operation_id !== operationId || registry.stage_id !== stageId || !Array.isArray(registry.artifacts) || registry.artifacts.length > LIMITS.artifact_count_per_stage) {
    throw new EvidenceError('INVALID_ARTIFACT_INDEX', 'Stage artifact index is invalid.');
  }
  const paths = new Set();
  for (const entry of registry.artifacts) {
    assertExactObject(entry, ['path', 'artifact_class', 'sanitization_status', 'summary_path'], [], 'artifact registration');
    validateRelativePath(entry.path); validateRelativePath(entry.summary_path);
    validateSafeLabel(entry.artifact_class, 'artifact class');
    if (!['passed', 'internal'].includes(entry.sanitization_status) || paths.has(entry.path)) throw new EvidenceError('INVALID_ARTIFACT_INDEX', 'Artifact registration is invalid.');
    const expectedBrowserClass = DEFERRED_BROWSER_ARTIFACT_PATHS.get(entry.path);
    if (expectedBrowserClass && entry.artifact_class !== expectedBrowserClass) throw new EvidenceError('BROWSER_VERIFICATION_DEFERRED', BROWSER_VERIFICATION_DEFERRED_MESSAGE);
    if (DEFERRED_BROWSER_ARTIFACT_CLASSES.has(entry.artifact_class) && expectedBrowserClass !== entry.artifact_class) throw new EvidenceError('BROWSER_VERIFICATION_DEFERRED', BROWSER_VERIFICATION_DEFERRED_MESSAGE);
    paths.add(entry.path);
  }
  return registry;
}

function artifactRegistry(root, operationId, stageId) {
  const path = resolveInside(root, `stages/${stageId}/artifact-index.json`);
  if (!existsSync(path)) return new Map();
  const registry = validateRegistry(readJson(path), operationId, stageId);
  return new Map(registry.artifacts.map((entry) => [entry.path, entry]));
}

export function assertNoDeferredBrowserVerificationArtifacts(root, operationId, stageId = null) {
  const stageRoot = resolveInside(root, 'stages');
  const stageIds = stageId === null ? readDirectorySorted(stageRoot) : [validateControlledSlug(stageId, 'stage ID')];
  for (const currentStageId of stageIds) {
    const stagePath = resolveInside(root, `stages/${currentStageId}`);
    assertPacketOwnedDirectory(root, stagePath, [0o700, 0o500]);
    const indexPath = resolveInside(root, `stages/${currentStageId}/artifact-index.json`);
    assertPacketOwnedFile(root, indexPath, [0o600, 0o400], LIMITS.manifest_bytes);
    const registry = validateRegistry(readJson(indexPath), operationId, currentStageId);
    if (registry.artifacts.some((entry) => DEFERRED_BROWSER_ARTIFACT_CLASSES.has(entry.artifact_class) || DEFERRED_BROWSER_ARTIFACT_PATHS.has(entry.path))) {
      throw new EvidenceError('BROWSER_VERIFICATION_DEFERRED', BROWSER_VERIFICATION_DEFERRED_MESSAGE);
    }
  }
}

function classifyPath(relativePath, registries) {
  if (TOP_LEVEL_FILES.has(relativePath)) return { artifactClass: TOP_LEVEL_FILES.get(relativePath), sanitizationStatus: 'internal' };
  if (/^tokens\/[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}\.json$/.test(relativePath)) return { artifactClass: 'execution_token', sanitizationStatus: 'internal' };
  const stageMatch = relativePath.match(/^stages\/([^/]+)\/(.+)$/);
  if (stageMatch) {
    const [, stageId, rest] = stageMatch;
    if (rest === 'artifact-index.json') return { artifactClass: 'artifact_index', sanitizationStatus: 'internal' };
    if (rest === 'stage-manifest.json') return { artifactClass: 'stage_manifest', sanitizationStatus: 'internal' };
    if (rest === 'stage-freeze.json') return { artifactClass: 'stage_freeze', sanitizationStatus: 'internal' };
    if (rest.startsWith('artifacts/')) {
      const registered = registries.get(stageId)?.get(rest.slice('artifacts/'.length));
      if (!registered) throw new EvidenceError('UNCLASSIFIED_FILE', 'A retained stage artifact is not classified.');
      return { artifactClass: registered.artifact_class, sanitizationStatus: registered.sanitization_status };
    }
  }
  throw new EvidenceError('UNCLASSIFIED_FILE', 'The packet contains an unclassified retained file.');
}

function walkFiles(root, current = root, depth = 0, { allowActiveLock = false } = {}) {
  if (depth > LIMITS.traversal_depth) throw new EvidenceError('TRAVERSAL_DEPTH_LIMIT', 'Packet traversal exceeds its configured depth.');
  const output = [];
  for (const name of readDirectorySorted(current)) {
    const path = join(current, name);
    const relativePath = relative(root, path).split('\\').join('/');
    if (relativePath === PACKET_LOCK_NAME) {
      if (!allowActiveLock || current !== root) throw new EvidenceError('CONCURRENT_OPERATION', 'Packet inventory encountered an active or stale mutation lock.');
      continue;
    }
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted in operation packets.');
    if (info.isDirectory()) {
      assertPacketOwnedDirectory(root, path, [0o700, 0o500]);
      if (relativePath === 'quarantine') {
        if (readDirectorySorted(path).length > 0) throw new EvidenceError('QUARANTINE_NOT_EMPTY', 'Quarantine must be empty.');
      } else output.push(...walkFiles(root, path, depth + 1, { allowActiveLock }));
    } else if (info.isFile()) {
      if (!INTEGRITY_FILES.has(relativePath)) output.push(relativePath);
    } else throw new EvidenceError('UNSUPPORTED_FILE', 'Only regular files and directories are permitted.');
  }
  return output.sort(compareStrings);
}

function stageArtifactFiles(root, stageId, current = resolveInside(root, `stages/${stageId}/artifacts`), depth = 0) {
  if (depth > LIMITS.traversal_depth) throw new EvidenceError('TRAVERSAL_DEPTH_LIMIT', 'Artifact traversal exceeds its configured depth.');
  const artifactRoot = resolveInside(root, `stages/${stageId}/artifacts`); const files = [];
  for (const name of readDirectorySorted(current)) {
    const path = join(current, name); const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted in stage artifacts.');
    if (info.isDirectory()) { assertPacketOwnedDirectory(root, path, [0o700, 0o500]); files.push(...stageArtifactFiles(root, stageId, path, depth + 1)); }
    else if (info.isFile()) { assertPacketOwnedFile(root, path, [0o600, 0o400]); files.push(relative(artifactRoot, path).split('\\').join('/')); }
    else throw new EvidenceError('UNSUPPORTED_FILE', 'Only regular stage artifacts are permitted.');
  }
  return files.sort(compareStrings);
}

export function buildPacketManifest(root, operationId, { allowActiveLock = false } = {}) {
  assertNoDeferredBrowserVerificationArtifacts(root, operationId);
  const registries = new Map(); const stageRoot = join(root, 'stages');
  for (const stageId of readDirectorySorted(stageRoot)) registries.set(stageId, artifactRegistry(root, operationId, stageId));
  let packetBytes = 0;
  const files = walkFiles(root, root, 0, { allowActiveLock }).map((relativePath) => {
    validateRelativePath(relativePath); const path = resolveInside(root, relativePath);
    const frozen = relativePath.startsWith('stages/') && existsSync(join(root, relativePath.split('/').slice(0, 2).join('/'), 'stage-freeze.json'));
    const expectedModes = frozen && relativePath.startsWith('stages/') ? [0o400] : [0o600];
    const info = assertPacketOwnedFile(root, path, expectedModes, relativePath === 'events.ndjson' ? LIMITS.manifest_bytes : LIMITS.artifact_bytes);
    packetBytes += info.size; if (packetBytes > LIMITS.packet_bytes) throw new EvidenceError('PACKET_SIZE_LIMIT', 'Retained packet exceeds its configured size limit.');
    const classification = classifyPath(relativePath, registries);
    return { path: relativePath, sha256: sha256File(path, Math.max(LIMITS.artifact_bytes, LIMITS.manifest_bytes)), byte_size: info.size, mode: (info.mode & 0o777).toString(8).padStart(3, '0'), artifact_class: classification.artifactClass, frozen_stage: frozen, sanitization_status: classification.sanitizationStatus };
  });
  const manifest = { schema_version: MANIFEST_SCHEMA, operation_id: operationId, inventory_scope: 'retained_evidence_excluding_integrity_files', integrity_files: ['manifest.json', 'seal.json'], files, inventory_digest: sha256(canonicalStringify(files)) };
  if (Buffer.byteLength(canonicalStringify(manifest)) > LIMITS.manifest_bytes) throw new EvidenceError('MANIFEST_SIZE_LIMIT', 'Packet manifest exceeds its configured size limit.');
  return manifest;
}

export function validatePacketManifest(manifest) {
  assertExactObject(manifest, ['schema_version', 'operation_id', 'inventory_scope', 'integrity_files', 'files', 'inventory_digest'], [], 'packet manifest');
  if (manifest.schema_version !== MANIFEST_SCHEMA || manifest.inventory_scope !== 'retained_evidence_excluding_integrity_files' || canonicalStringify(manifest.integrity_files) !== canonicalStringify(['manifest.json', 'seal.json']) || !Array.isArray(manifest.files)) throw new EvidenceError('INVALID_MANIFEST', 'Packet manifest schema is invalid.');
  for (const entry of manifest.files) {
    assertExactObject(entry, ['path', 'sha256', 'byte_size', 'mode', 'artifact_class', 'frozen_stage', 'sanitization_status'], [], 'packet manifest entry');
    validateRelativePath(entry.path); validateSafeLabel(entry.artifact_class, 'artifact class'); if (!/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isInteger(entry.byte_size) || entry.byte_size < 0 || !['600', '400'].includes(entry.mode) || typeof entry.frozen_stage !== 'boolean' || !['passed', 'internal'].includes(entry.sanitization_status)) throw new EvidenceError('INVALID_MANIFEST', 'Packet manifest entry is invalid.');
  }
  return manifest;
}

export function verifyPacketManifest(root, manifest, options = {}) {
  validatePacketManifest(manifest); const rebuilt = buildPacketManifest(root, manifest.operation_id, options);
  if (canonicalStringify(rebuilt) !== canonicalStringify(manifest)) throw new EvidenceError('MANIFEST_MISMATCH', 'Packet manifest does not match retained evidence.');
  return rebuilt;
}

export function buildStageManifest(root, operationId, stageId, registry) {
  validateRegistry(registry, operationId, stageId);
  if (registry.artifacts.some((entry) => DEFERRED_BROWSER_ARTIFACT_CLASSES.has(entry.artifact_class) || DEFERRED_BROWSER_ARTIFACT_PATHS.has(entry.path))) {
    throw new EvidenceError('BROWSER_VERIFICATION_DEFERRED', BROWSER_VERIFICATION_DEFERRED_MESSAGE);
  }
  const registeredPaths = registry.artifacts.map((entry) => validateRelativePath(entry.path)).sort(compareStrings);
  const retainedPaths = stageArtifactFiles(root, stageId);
  if (canonicalStringify(registeredPaths) !== canonicalStringify(retainedPaths)) throw new EvidenceError('UNCLASSIFIED_FILE', 'Stage artifacts do not match the registered inventory.');
  const artifacts = [...registry.artifacts].sort((a, b) => compareStrings(a.path, b.path)).map((entry) => {
    const path = resolveInside(root, `stages/${stageId}/artifacts/${entry.path}`); const info = assertPacketOwnedFile(root, path, [0o400]);
    return { path: entry.path, sha256: sha256File(path), byte_size: info.size, mode: '400', artifact_class: entry.artifact_class, sanitization_status: entry.sanitization_status, summary_path: entry.summary_path };
  });
  return { schema_version: STAGE_MANIFEST_SCHEMA, operation_id: operationId, stage_id: stageId, artifacts, artifacts_digest: sha256(canonicalStringify(artifacts)) };
}

export function validateStageManifest(manifest) {
  assertExactObject(manifest, ['schema_version', 'operation_id', 'stage_id', 'artifacts', 'artifacts_digest'], [], 'stage manifest');
  if (manifest.schema_version !== STAGE_MANIFEST_SCHEMA || !Array.isArray(manifest.artifacts) || manifest.artifacts.length > LIMITS.artifact_count_per_stage) throw new EvidenceError('INVALID_STAGE_MANIFEST', 'Stage manifest schema is invalid.');
  for (const entry of manifest.artifacts) {
    assertExactObject(entry, ['path', 'sha256', 'byte_size', 'mode', 'artifact_class', 'sanitization_status', 'summary_path'], [], 'stage manifest entry');
    validateRelativePath(entry.path); validateRelativePath(entry.summary_path); validateSafeLabel(entry.artifact_class, 'artifact class'); if (!/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isInteger(entry.byte_size) || entry.byte_size < 0 || entry.mode !== '400' || !['passed', 'internal'].includes(entry.sanitization_status)) throw new EvidenceError('INVALID_STAGE_MANIFEST', 'Stage manifest entry is invalid.');
  }
  return manifest;
}

export function verifyStageManifest(root, manifest) {
  validateStageManifest(manifest); assertNoDeferredBrowserVerificationArtifacts(root, manifest.operation_id, manifest.stage_id); const indexPath = resolveInside(root, `stages/${manifest.stage_id}/artifact-index.json`);
  const rebuilt = buildStageManifest(root, manifest.operation_id, manifest.stage_id, readJson(indexPath));
  if (canonicalStringify(rebuilt) !== canonicalStringify(manifest)) throw new EvidenceError('STAGE_MANIFEST_MISMATCH', 'Workflow-frozen stage artifacts have changed.');
  return rebuilt;
}

export function manifestDigest(manifest) { return sha256(`${canonicalStringify(manifest)}\n`); }

export function readCanonicalJsonFile(path, maximumBytes = LIMITS.manifest_bytes) {
  const value = readJson(path, maximumBytes); const content = readFileSync(path, 'utf8');
  if (content !== `${canonicalStringify(value)}\n`) throw new EvidenceError('NONCANONICAL_JSON', 'JSON evidence is not canonically serialized.');
  return value;
}
