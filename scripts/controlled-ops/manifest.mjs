import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  EvidenceError,
  canonicalStringify,
  compareStrings,
  readDirectorySorted,
  readJson,
  resolveInside,
  sha256,
  sha256File,
  validateRelativePath,
} from './internal.mjs';

const TOP_LEVEL_FILES = new Map([
  ['operation.json', 'operation_metadata'],
  ['events.ndjson', 'event_timeline'],
]);
const ADMINISTRATIVE_EXCLUSIONS = new Set(['manifest.json', 'seal.json']);

function artifactRegistry(root, stageId) {
  const path = resolveInside(root, `stages/${stageId}/artifact-index.json`);
  if (!existsSync(path)) return new Map();
  const registry = readJson(path);
  if (!Array.isArray(registry.artifacts)) throw new EvidenceError('INVALID_ARTIFACT_INDEX', 'Stage artifact index is invalid.');
  return new Map(registry.artifacts.map((entry) => [entry.path, entry]));
}

function classifyPath(root, relativePath, registries) {
  if (TOP_LEVEL_FILES.has(relativePath)) return { artifactClass: TOP_LEVEL_FILES.get(relativePath), sanitizationStatus: 'internal' };
  if (relativePath.startsWith('tokens/') && relativePath.endsWith('.json')) return { artifactClass: 'execution_token', sanitizationStatus: 'internal' };
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

function walkFiles(root, current = root) {
  const output = [];
  for (const name of readDirectorySorted(current)) {
    if (name.startsWith('.controlled-ops-')) continue;
    const path = join(current, name);
    const relativePath = relative(root, path).split('\\').join('/');
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted in operation packets.');
    if (info.isDirectory()) {
      if (relativePath === 'quarantine') {
        if (readDirectorySorted(path).length > 0) throw new EvidenceError('QUARANTINE_NOT_EMPTY', 'Quarantine must be empty.');
        continue;
      }
      output.push(...walkFiles(root, path));
    } else if (info.isFile()) {
      if (!ADMINISTRATIVE_EXCLUSIONS.has(relativePath)) output.push(relativePath);
    } else {
      throw new EvidenceError('UNSUPPORTED_FILE', 'Only regular files and directories are permitted.');
    }
  }
  return output.sort(compareStrings);
}

function stageArtifactFiles(root, stageId, current = resolveInside(root, `stages/${stageId}/artifacts`)) {
  const artifactRoot = resolveInside(root, `stages/${stageId}/artifacts`);
  const files = [];
  for (const name of readDirectorySorted(current)) {
    const path = join(current, name);
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted in stage artifacts.');
    if (info.isDirectory()) files.push(...stageArtifactFiles(root, stageId, path));
    else if (info.isFile()) files.push(relative(artifactRoot, path).split('\\').join('/'));
    else throw new EvidenceError('UNSUPPORTED_FILE', 'Only regular stage artifacts are permitted.');
  }
  return files.sort(compareStrings);
}

export function buildPacketManifest(root, operationId) {
  const stageRoot = join(root, 'stages');
  const registries = new Map();
  if (existsSync(stageRoot)) {
    for (const stageId of readDirectorySorted(stageRoot)) registries.set(stageId, artifactRegistry(root, stageId));
  }
  const files = walkFiles(root).map((relativePath) => {
    validateRelativePath(relativePath);
    const path = resolveInside(root, relativePath);
    const info = statSync(path);
    const classification = classifyPath(root, relativePath, registries);
    return {
      path: relativePath,
      sha256: sha256File(path),
      byte_size: info.size,
      mode: (info.mode & 0o777).toString(8).padStart(3, '0'),
      artifact_class: classification.artifactClass,
      frozen_stage: relativePath.startsWith('stages/') && existsSync(join(root, relativePath.split('/').slice(0, 2).join('/'), 'stage-freeze.json')),
      sanitization_status: classification.sanitizationStatus,
    };
  });
  return {
    schema_version: 'servsync-controlled-ops/manifest-v1',
    operation_id: operationId,
    inventory_scope: 'retained_evidence_excluding_integrity_files',
    integrity_files: ['manifest.json', 'seal.json'],
    files,
    inventory_digest: sha256(canonicalStringify(files)),
  };
}

export function verifyPacketManifest(root, manifest) {
  const rebuilt = buildPacketManifest(root, manifest.operation_id);
  if (canonicalStringify(rebuilt) !== canonicalStringify(manifest)) {
    throw new EvidenceError('MANIFEST_MISMATCH', 'Packet manifest does not match retained evidence.');
  }
  return rebuilt;
}

export function buildStageManifest(root, operationId, stageId, registry) {
  const registeredPaths = registry.artifacts.map((entry) => validateRelativePath(entry.path, 'artifact path')).sort(compareStrings);
  const retainedPaths = stageArtifactFiles(root, stageId);
  if (canonicalStringify(registeredPaths) !== canonicalStringify(retainedPaths)) {
    throw new EvidenceError('UNCLASSIFIED_FILE', 'Stage artifacts do not match the registered inventory.');
  }
  const artifacts = [...registry.artifacts]
    .sort((left, right) => compareStrings(left.path, right.path))
    .map((entry) => {
      const relativePath = validateRelativePath(entry.path, 'artifact path');
      const path = resolveInside(root, `stages/${stageId}/artifacts/${relativePath}`);
      if (!existsSync(path) || !lstatSync(path).isFile()) throw new EvidenceError('MISSING_ARTIFACT', 'A registered stage artifact is missing.');
      const info = statSync(path);
      return {
        path: relativePath,
        sha256: sha256File(path),
        byte_size: info.size,
        mode: (info.mode & 0o777).toString(8).padStart(3, '0'),
        artifact_class: entry.artifact_class,
        sanitization_status: entry.sanitization_status,
      };
    });
  return {
    schema_version: 'servsync-controlled-ops/stage-manifest-v1',
    operation_id: operationId,
    stage_id: stageId,
    artifacts,
    artifacts_digest: sha256(canonicalStringify(artifacts)),
  };
}

export function verifyStageManifest(root, manifest) {
  const indexPath = resolveInside(root, `stages/${manifest.stage_id}/artifact-index.json`);
  const rebuilt = buildStageManifest(root, manifest.operation_id, manifest.stage_id, readJson(indexPath));
  if (canonicalStringify(rebuilt) !== canonicalStringify(manifest)) {
    throw new EvidenceError('STAGE_MANIFEST_MISMATCH', 'Frozen stage artifacts have changed.');
  }
  return rebuilt;
}

export function manifestDigest(manifest) {
  return sha256(`${canonicalStringify(manifest)}\n`);
}

export function readCanonicalJsonFile(path) {
  const value = readJson(path);
  if (readFileSync(path, 'utf8') !== `${canonicalStringify(value)}\n`) {
    throw new EvidenceError('NONCANONICAL_JSON', 'JSON evidence is not canonically serialized.');
  }
  return value;
}
