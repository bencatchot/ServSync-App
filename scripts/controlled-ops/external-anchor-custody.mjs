import {
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  EvidenceError,
  SCHEMA_VERSION,
  assertCanonicalParents,
  assertExactObject,
  assertOperationRoot,
  assertOutsideGit,
  assertPacketOwnedDirectory,
  assertPacketOwnedFile,
  canonicalStringify,
  fsyncDirectory,
  readDirectorySorted,
  readJson,
  validateControlledSlug,
  validateOperationId,
  validateRawOperationRootInput,
  validateTimestamp,
  writeJsonAtomic,
} from './internal.mjs';
import { verifyPacket } from './evidence.mjs';

export const EXTERNAL_ANCHOR_CUSTODY_SCHEMA = 'servsync-controlled-ops/external-anchor-custody-v1';
export const EXTERNAL_ANCHOR_CUSTODY_STORE_SCHEMA = 'servsync-controlled-ops/external-anchor-custody-store-v1';
export const EXTERNAL_ANCHOR_CUSTODY_VERSION = '2d-a.1.0';
const STORE_MARKER = 'custody-store.json';
const RECORDS_DIRECTORY = 'records';
const CUSTODY_RECORD_FIELDS = [
  'schema_version',
  'custody_record_id',
  'operation_id',
  'seal_sha256',
  'packet_schema_version',
  'source_classification',
  'retained_utc',
  'submission_status',
  'verification_status',
];
const STORE_FIELDS = ['schema_version', 'custody_version', 'records_directory'];

function modeOf(info) {
  return info.mode & 0o777;
}

function validateDigest(value, fieldName = 'seal digest') {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new EvidenceError('INVALID_EXTERNAL_ANCHOR', `${fieldName} must be a SHA-256 digest.`);
  }
  return value;
}

function validateSourceClassification(value) {
  return validateControlledSlug(value, 'custody source classification', { allowUnderscore: true, maxLength: 48 });
}

function custodyRecordId(operationId) {
  return validateOperationId(operationId);
}

function custodyRootPath(root) {
  validateRawOperationRootInput(root, 'custody root');
  return resolve(root);
}

function assertDirectoryOwned(root, path, allowedModes = [0o700]) {
  assertPacketOwnedDirectory(root, path, allowedModes);
  const info = lstatSync(path);
  if ((info.mode & constants.S_IWOTH) !== 0 || (info.mode & constants.S_IWGRP) !== 0) {
    throw new EvidenceError('UNSAFE_CUSTODY_STORE', 'Custody directory mode is unsafe.');
  }
}

function assertRootNotOverlappingPacket(custodyRoot, operationRoot) {
  const custody = resolve(custodyRoot);
  const packet = resolve(operationRoot);
  if (custody === packet || custody.startsWith(`${packet}${sep}`) || packet.startsWith(`${custody}${sep}`)) {
    throw new EvidenceError('CUSTODY_PACKET_OVERLAP', 'External custody store must remain outside the operation packet.');
  }
}

function assertNoUnknownCustodyEntries(rootPath) {
  const names = readDirectorySorted(rootPath);
  const allowedRoot = new Set([STORE_MARKER, RECORDS_DIRECTORY]);
  for (const name of names) {
    if (!allowedRoot.has(name)) throw new EvidenceError('UNKNOWN_CUSTODY_FILE', 'Custody store contains an unexpected entry.');
  }
  const recordsPath = join(rootPath, RECORDS_DIRECTORY);
  for (const name of readDirectorySorted(recordsPath)) {
    if (!/^[a-z][a-z0-9-]{0,63}\.json$/.test(name)) {
      throw new EvidenceError('UNKNOWN_CUSTODY_FILE', 'Custody record directory contains an unexpected entry.');
    }
  }
}

function readCanonicalJson(path, maximumBytes = 262_144) {
  const value = readJson(path, maximumBytes);
  const content = readFileSync(path, 'utf8');
  if (content !== `${canonicalStringify(value)}\n`) {
    throw new EvidenceError('NONCANONICAL_JSON', 'Custody JSON is not canonical.');
  }
  return value;
}

function validateStoreMarker(value) {
  assertExactObject(value, STORE_FIELDS, [], 'custody store metadata');
  if (value.schema_version !== EXTERNAL_ANCHOR_CUSTODY_STORE_SCHEMA
    || value.custody_version !== EXTERNAL_ANCHOR_CUSTODY_VERSION
    || value.records_directory !== RECORDS_DIRECTORY) {
    throw new EvidenceError('INVALID_CUSTODY_STORE', 'Custody store metadata is invalid.');
  }
  return value;
}

function assertCustodyStore(rootPath) {
  if (!existsSync(rootPath) || realpathSync(rootPath) !== rootPath) throw new EvidenceError('INVALID_CUSTODY_STORE', 'Custody store is missing or symlinked.');
  assertDirectoryOwned(rootPath, rootPath, [0o700]);
  const markerPath = join(rootPath, STORE_MARKER);
  const recordsPath = join(rootPath, RECORDS_DIRECTORY);
  assertPacketOwnedFile(rootPath, markerPath, [0o600], 262_144);
  assertDirectoryOwned(rootPath, recordsPath, [0o700]);
  validateStoreMarker(readCanonicalJson(markerPath));
  assertNoUnknownCustodyEntries(rootPath);
  return rootPath;
}

export function initializeLocalAnchorCustodyStore(root) {
  const rootPath = custodyRootPath(root);
  if (!existsSync(rootPath)) {
    assertCanonicalParents(dirname(rootPath));
    assertOutsideGit(dirname(rootPath));
    mkdirSync(rootPath, { mode: 0o700 });
    mkdirSync(join(rootPath, RECORDS_DIRECTORY), { mode: 0o700 });
    writeJsonAtomic(join(rootPath, STORE_MARKER), {
      schema_version: EXTERNAL_ANCHOR_CUSTODY_STORE_SCHEMA,
      custody_version: EXTERNAL_ANCHOR_CUSTODY_VERSION,
      records_directory: RECORDS_DIRECTORY,
    }, 0o600, rootPath);
    fsyncDirectory(rootPath);
  }
  return assertCustodyStore(rootPath);
}

function recordPath(rootPath, operationId) {
  return join(rootPath, RECORDS_DIRECTORY, `${custodyRecordId(operationId)}.json`);
}

function buildCustodyRecord({ operationId, sealDigest, sourceClassification, retainedUtc }) {
  validateOperationId(operationId);
  validateDigest(sealDigest);
  validateSourceClassification(sourceClassification);
  validateTimestamp(retainedUtc, 'custody retained timestamp');
  return validateCustodyRecord({
    schema_version: EXTERNAL_ANCHOR_CUSTODY_SCHEMA,
    custody_record_id: custodyRecordId(operationId),
    operation_id: operationId,
    seal_sha256: sealDigest,
    packet_schema_version: SCHEMA_VERSION,
    source_classification: sourceClassification,
    retained_utc: retainedUtc,
    submission_status: 'retained',
    verification_status: 'verified',
  });
}

export function validateCustodyRecord(record) {
  assertExactObject(record, CUSTODY_RECORD_FIELDS, [], 'external anchor custody record');
  if (record.schema_version !== EXTERNAL_ANCHOR_CUSTODY_SCHEMA
    || record.custody_record_id !== record.operation_id
    || record.packet_schema_version !== SCHEMA_VERSION
    || record.submission_status !== 'retained'
    || record.verification_status !== 'verified') {
    throw new EvidenceError('INVALID_CUSTODY_RECORD', 'External anchor custody record schema is invalid.');
  }
  validateOperationId(record.operation_id);
  validateDigest(record.seal_sha256);
  validateSourceClassification(record.source_classification);
  validateTimestamp(record.retained_utc, 'custody retained timestamp');
  return record;
}

export function readLocalAnchorCustodyRecord({ custodyRoot, operationId }) {
  const rootPath = assertCustodyStore(custodyRootPath(custodyRoot));
  const path = recordPath(rootPath, operationId);
  let info;
  try { info = lstatSync(path); } catch { throw new EvidenceError('EXTERNAL_ANCHOR_UNAVAILABLE', 'Externally retained seal digest is unavailable.'); }
  if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Symlinks are not permitted in external anchor custody.');
  assertPacketOwnedFile(rootPath, path, [0o600], 262_144);
  return validateCustodyRecord(readCanonicalJson(path));
}

export function submitSealDigestToLocalCustody({
  custodyRoot,
  operationRoot,
  sealDigest,
  sourceClassification = 'local_fake_provider',
  retainedUtc = null,
} = {}) {
  assertExactObject({ custodyRoot, operationRoot, sealDigest, sourceClassification, retainedUtc }, ['custodyRoot', 'operationRoot', 'sealDigest'], ['sourceClassification', 'retainedUtc'], 'custody submission');
  const { rootPath: packetRoot, metadata } = assertOperationRoot(operationRoot);
  const requestedCustodyRoot = custodyRootPath(custodyRoot);
  assertRootNotOverlappingPacket(requestedCustodyRoot, packetRoot);
  const rootPath = initializeLocalAnchorCustodyStore(requestedCustodyRoot);
  verifyPacket(packetRoot, validateDigest(sealDigest));
  const expected = buildCustodyRecord({
    operationId: metadata.operation_id,
    sealDigest,
    sourceClassification,
    retainedUtc: retainedUtc ?? new Date().toISOString(),
  });
  const path = recordPath(rootPath, metadata.operation_id);
  if (existsSync(path)) {
    const existing = readLocalAnchorCustodyRecord({ custodyRoot: rootPath, operationId: metadata.operation_id });
    if (existing.seal_sha256 !== sealDigest) {
      throw new EvidenceError('CUSTODY_DIGEST_CONFLICT', 'External anchor custody already retained a different seal digest.');
    }
    const duplicateExpected = buildCustodyRecord({
      operationId: metadata.operation_id,
      sealDigest,
      sourceClassification,
      retainedUtc: existing.retained_utc,
    });
    if (canonicalStringify(existing) !== canonicalStringify(duplicateExpected)) {
      throw new EvidenceError('CUSTODY_RECORD_CONFLICT', 'External anchor custody record conflicts with the requested metadata.');
    }
    return { status: 'duplicate', record: existing };
  }
  writeJsonAtomic(path, expected, 0o600, rootPath);
  return { status: 'retained', record: readLocalAnchorCustodyRecord({ custodyRoot: rootPath, operationId: metadata.operation_id }) };
}

export function retrieveSealDigestFromLocalCustody({ custodyRoot, operationId, sourceClassification = null } = {}) {
  assertExactObject({ custodyRoot, operationId, sourceClassification }, ['custodyRoot', 'operationId'], ['sourceClassification'], 'custody retrieval');
  const record = readLocalAnchorCustodyRecord({ custodyRoot, operationId });
  if (sourceClassification !== null && record.source_classification !== validateSourceClassification(sourceClassification)) {
    throw new EvidenceError('CUSTODY_RECORD_CONFLICT', 'External anchor custody source classification does not match.');
  }
  return record.seal_sha256;
}

export function verifyPacketWithLocalCustody({ operationRoot, custodyRoot, sourceClassification = null } = {}) {
  assertExactObject({ operationRoot, custodyRoot, sourceClassification }, ['operationRoot', 'custodyRoot'], ['sourceClassification'], 'custody verification');
  const { rootPath, metadata } = assertOperationRoot(operationRoot);
  const digest = retrieveSealDigestFromLocalCustody({
    custodyRoot,
    operationId: metadata.operation_id,
    sourceClassification,
  });
  return verifyPacket(rootPath, digest);
}

export function assertCustodyOutsideGitAndPacket({ custodyRoot, operationRoot }) {
  const rootPath = custodyRootPath(custodyRoot);
  assertOutsideGit(dirname(rootPath));
  const { rootPath: packetRoot } = assertOperationRoot(operationRoot);
  assertRootNotOverlappingPacket(rootPath, packetRoot);
  return { custodyRoot: rootPath, operationRoot: packetRoot };
}

export function custodyRelativeRecordPath({ custodyRoot, operationId }) {
  const rootPath = assertCustodyStore(custodyRootPath(custodyRoot));
  const path = recordPath(rootPath, operationId);
  const rel = relative(rootPath, path).split('\\').join('/');
  if (rel.startsWith('..') || rel.includes('..')) throw new EvidenceError('PATH_ESCAPE', 'Custody record path escapes the store.');
  return rel;
}
