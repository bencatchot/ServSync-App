#!/usr/bin/env node

import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EvidenceError,
  assertCanonicalParents,
  assertOutsideGit,
  canonicalStringify,
  fsyncDirectory,
  safeError,
  sha256File,
  validateRawOperationRootInput,
  validateTimestamp,
} from './internal.mjs';
import {
  BROWSER_LIMITS,
  BROWSER_PROVENANCE_MODES,
  BROWSER_SUMMARY_SCHEMA,
  BROWSER_TOOL_VERSION,
  attemptIdFor,
  computeBrowserRunAuthTag,
  decodeUtf8,
  testIdFor,
  validateGeneratedBrowserId,
  validateDuration,
  validateBrowserSourceBinding,
  validateBrowserPacketBindingFields,
  validateSummary,
} from './browser-schema.mjs';
import {
  validateConsoleAggregate,
  validateNetworkAggregate,
  validatePageErrorAggregate,
} from './browser-collectors.mjs';
import { JOURNAL_FILENAME, createJournalWriter, readJournal } from './browser-journal.mjs';
import { parseStrictJson } from './sanitize.mjs';
import { createBrowserLaunchContract } from './browser-launch-policy.mjs';

const SUMMARY_FILENAME = 'browser-summary.json';
const LAUNCH_DIRECTORY = 'launch';
const JOURNAL_DIRECTORY = 'journal';
const SUMMARY_DIRECTORY = 'summary';
const OUTPUT_DIRECTORY = 'playwright-output';
const BROWSER_LAUNCH_FILENAME = 'browser-launch.json';
const BROWSER_REPORTER_READY_FILENAME = 'browser-reporter-ready.json';
const BROWSER_WORKSPACE_MARKER_FILENAME = 'browser-workspace.json';
const BROWSER_WORKSPACE_MARKER_SCHEMA = 'servsync-controlled-ops/browser-workspace-v1';
const cleanupHandleStates = new WeakMap();
const workspaceJournalRoots = new Map();
const workspaceSummaryRoots = new Map();
const workspaceLaunchRoots = new Map();
const standaloneHandleStates = new WeakMap();
const WORKSPACE_DIRECTORY_MODES = Object.freeze({
  [JOURNAL_DIRECTORY]: 0o700,
  [SUMMARY_DIRECTORY]: 0o700,
  [LAUNCH_DIRECTORY]: 0o700,
  [OUTPUT_DIRECTORY]: 0o755,
});
const STANDALONE_OUTPUT_MODE = 0o700;
const STANDALONE_STATES = Object.freeze({
  CREATED: 'created',
  WRITER_OPEN: 'writer_open',
  WRITER_CLOSED: 'writer_closed',
  IMPORTED: 'imported',
  FINALIZING: 'finalizing',
  FINALIZED: 'finalized',
  DISCARDING: 'discarding',
  DISCARDED: 'discarded',
  FAILED: 'failed',
});

function modeOf(info) {
  return info.mode & 0o777;
}

function identityOf(path) {
  const info = lstatSync(path);
  return {
    dev: info.dev,
    ino: info.ino,
    uid: info.uid,
    mode: modeOf(info),
    type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other',
  };
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid && left.mode === right.mode && left.type === right.type;
}

function registerWorkspaceState(state) {
  workspaceJournalRoots.set(join(state.root, JOURNAL_DIRECTORY), state);
  workspaceSummaryRoots.set(join(state.root, SUMMARY_DIRECTORY), state);
  workspaceLaunchRoots.set(join(state.root, LAUNCH_DIRECTORY), state);
}

function unregisterWorkspaceState(state) {
  workspaceJournalRoots.delete(join(state.root, JOURNAL_DIRECTORY));
  workspaceSummaryRoots.delete(join(state.root, SUMMARY_DIRECTORY));
  workspaceLaunchRoots.delete(join(state.root, LAUNCH_DIRECTORY));
}

function fileProvenance(path, maximumBytes) {
  const info = lstatSync(path);
  return {
    dev: info.dev,
    ino: info.ino,
    uid: info.uid,
    mode: modeOf(info),
    nlink: info.nlink,
    size: info.size,
    mtimeMs: info.mtimeMs,
    ctimeMs: info.ctimeMs,
    sha256: sha256File(path, maximumBytes),
  };
}

function createPreparedFile(path) {
  if (existsSync(path)) throw new EvidenceError('PREEXISTING_BROWSER_ARTIFACT', 'Browser evidence artifact already exists.');
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || modeOf(info) !== 0o600 || info.size !== 0) {
      throw new EvidenceError('UNSAFE_BROWSER_ARTIFACT', 'Prepared browser evidence artifact failed ownership checks.');
    }
    fsyncSync(descriptor);
  } catch (error) {
    try { closeSync(descriptor); } catch {}
    try { unlinkSync(path); } catch {}
    throw error;
  }
  closeSync(descriptor);
  fsyncDirectory(dirname(path));
  return fileProvenance(path, BROWSER_LIMITS.summary_bytes);
}

function createWorkspaceMarker(root, runId) {
  const path = join(root, BROWSER_WORKSPACE_MARKER_FILENAME);
  if (existsSync(path)) throw new EvidenceError('PREEXISTING_BROWSER_ARTIFACT', 'Browser workspace marker already exists.');
  const marker = {
    schema_version: BROWSER_WORKSPACE_MARKER_SCHEMA,
    tool_version: BROWSER_TOOL_VERSION,
    created_utc: new Date().toISOString(),
    run_id: runId,
  };
  const content = `${canonicalStringify(marker)}\n`;
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || modeOf(info) !== 0o600) {
      throw new EvidenceError('UNSAFE_BROWSER_ARTIFACT', 'Created browser workspace marker failed ownership checks.');
    }
    writeFileSync(descriptor, content, 'utf8');
    fsyncSync(descriptor);
  } catch (error) {
    try { closeSync(descriptor); } catch {}
    try { unlinkSync(path); } catch {}
    throw error;
  }
  closeSync(descriptor);
  fsyncDirectory(root);
  return fileProvenance(path, BROWSER_LIMITS.summary_bytes);
}

function sameFileProvenance(path, expected, maximumBytes) {
  if (!expected) return false;
  const actual = fileProvenance(path, maximumBytes);
  return actual.dev === expected.dev
    && actual.ino === expected.ino
    && actual.uid === expected.uid
    && actual.mode === expected.mode
    && actual.nlink === expected.nlink
    && actual.size === expected.size
    && actual.mtimeMs === expected.mtimeMs
    && actual.ctimeMs === expected.ctimeMs
    && actual.sha256 === expected.sha256;
}

function samePreparedFileIdentity(path, expected) {
  if (!expected) return false;
  const actual = fileProvenance(path, BROWSER_LIMITS.summary_bytes);
  return actual.dev === expected.dev
    && actual.ino === expected.ino
    && actual.uid === expected.uid
    && actual.mode === expected.mode
    && actual.nlink === expected.nlink;
}

function provenanceError() {
  throw new EvidenceError('BROWSER_CLEANUP_PROVENANCE_MISMATCH', 'Browser cleanup evidence does not belong to the authenticated workspace run.');
}

function assertWorkspaceRootSafety(state) {
  const root = state.root;
  validateRawOperationRootInput(root, 'browser evidence workspace root');
  if (!isAbsolute(root) || root !== resolve(root) || root !== root.normalize('NFC')) throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Browser evidence workspace root is not canonical.');
  if ([sep, '/tmp', '/private/tmp', process.cwd(), process.env.HOME].filter(Boolean).includes(root) || dirname(root) === root) {
    throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Refusing to clean a dangerous browser evidence workspace root.');
  }
  assertCanonicalParents(root);
  assertOutsideGit(root);
  if (!existsSync(root) || realpathSync(root) !== root) throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Browser evidence workspace root is missing or symlinked.');
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || modeOf(info) !== 0o700 || !sameIdentity(identityOf(root), state.rootIdentity)) {
    throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Browser evidence workspace root identity changed.');
  }
  return root;
}

function assertWorkspaceChild(state, relativePath, { type, mode }) {
  const root = assertWorkspaceRootSafety(state);
  const parts = relativePath.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new EvidenceError('UNSAFE_BROWSER_CLEANUP', 'Browser cleanup child path is unsafe.');
  const path = resolve(root, ...parts);
  if (path === root || !path.startsWith(`${root}${sep}`) || relative(root, path).split(sep).join('/') !== relativePath) {
    throw new EvidenceError('UNSAFE_BROWSER_CLEANUP', 'Browser cleanup child escapes the workspace root.');
  }
  assertCanonicalParents(path);
  if (realpathSync(dirname(path)) !== dirname(path)) throw new EvidenceError('SYMLINK_REJECTED', 'Browser cleanup child parent is symlinked.');
  const before = lstatSync(path);
  if (before.isSymbolicLink() || before.uid !== process.getuid?.() || before.dev !== state.rootIdentity.dev || modeOf(before) !== mode) {
    throw new EvidenceError('UNSAFE_BROWSER_CLEANUP', 'Browser cleanup child ownership, device, mode, or symlink state is unsafe.');
  }
  if (type === 'file' && (!before.isFile() || before.nlink !== 1)) throw new EvidenceError('UNSAFE_BROWSER_CLEANUP', 'Browser cleanup child file is unsafe.');
  if (type === 'directory' && !before.isDirectory()) throw new EvidenceError('UNSAFE_BROWSER_CLEANUP', 'Browser cleanup child directory is unsafe.');
  const after = lstatSync(path);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new EvidenceError('BROWSER_CLEANUP_RACE', 'Browser cleanup child changed during validation.');
  }
  return path;
}

function snapshotExpectedDirectories(root, { includeOutput = false, outputMode = WORKSPACE_DIRECTORY_MODES[OUTPUT_DIRECTORY] } = {}) {
  const names = [JOURNAL_DIRECTORY, SUMMARY_DIRECTORY, LAUNCH_DIRECTORY];
  if (includeOutput) names.push(OUTPUT_DIRECTORY);
  const directories = names.map((name) => {
    const path = join(root, name);
    const mode = name === OUTPUT_DIRECTORY ? outputMode : WORKSPACE_DIRECTORY_MODES[name];
    mkdirSync(path, { mode });
    chmodSync(path, mode);
    const info = lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.dev !== lstatSync(root).dev || modeOf(info) !== mode) {
      throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Browser evidence workspace child directory is unsafe.');
    }
    return [name, identityOf(path)];
  });
  return Object.fromEntries(directories);
}

function expectedEntries() {
  return new Set([
    BROWSER_WORKSPACE_MARKER_FILENAME,
    JOURNAL_DIRECTORY,
    `${JOURNAL_DIRECTORY}/${JOURNAL_FILENAME}`,
    SUMMARY_DIRECTORY,
    `${SUMMARY_DIRECTORY}/${SUMMARY_FILENAME}`,
    LAUNCH_DIRECTORY,
    `${LAUNCH_DIRECTORY}/${BROWSER_LAUNCH_FILENAME}`,
    `${LAUNCH_DIRECTORY}/${BROWSER_REPORTER_READY_FILENAME}`,
    OUTPUT_DIRECTORY,
  ]);
}

function standaloneExpectedEntries() {
  return new Set([
    BROWSER_WORKSPACE_MARKER_FILENAME,
    JOURNAL_DIRECTORY,
    `${JOURNAL_DIRECTORY}/${JOURNAL_FILENAME}`,
    SUMMARY_DIRECTORY,
    `${SUMMARY_DIRECTORY}/${SUMMARY_FILENAME}`,
    LAUNCH_DIRECTORY,
    OUTPUT_DIRECTORY,
  ]);
}

function readCanonicalBrowserJson(path, expectedSchema, label) {
  const content = decodeUtf8(readFileSync(path));
  if (!content.endsWith('\n')) throw new EvidenceError('BROWSER_CLEANUP_INVALID_FILE', `${label} must be canonical JSON.`);
  const parsed = parseStrictJson(content.slice(0, -1));
  if (content !== `${canonicalStringify(parsed)}\n` || parsed.schema_version !== expectedSchema) {
    throw new EvidenceError('BROWSER_CLEANUP_INVALID_FILE', `${label} is not recognized as generated browser evidence.`);
  }
  return parsed;
}

function readWorkspaceMarker(path) {
  const marker = readCanonicalBrowserJson(path, BROWSER_WORKSPACE_MARKER_SCHEMA, 'browser workspace marker');
  if (Object.keys(marker).sort().join(',') !== 'created_utc,run_id,schema_version,tool_version'
    || marker.tool_version !== BROWSER_TOOL_VERSION
    || !validateGeneratedBrowserId(marker.run_id, 'browser workspace run ID')) {
    throw new EvidenceError('BROWSER_CLEANUP_INVALID_FILE', 'Browser workspace marker is not recognized as generated browser evidence.');
  }
  validateTimestamp(marker.created_utc, 'browser workspace marker timestamp');
  return marker;
}

function verifyJournalAuthentication(state, records) {
  const launch = state.provenance.launch;
  const prepared = state.provenance.journalPrepared;
  if (!launch || !prepared) provenanceError();
  const journalPath = join(state.root, JOURNAL_DIRECTORY, JOURNAL_FILENAME);
  if (!samePreparedFileIdentity(journalPath, prepared)) provenanceError();
  const terminal = records.at(-1);
  if (!terminal || terminal.record_type !== 'browser_run_completed' || terminal.run_id !== launch.runId) provenanceError();
  const runStart = records[0];
  if (runStart.record_type !== 'browser_run_started'
    || runStart.source_binding_mode !== launch.sourceBindingMode
    || runStart.source_manifest_digest !== launch.sourceManifestDigest
    || runStart.packet_binding_mode !== launch.packetBinding.packet_binding_mode
    || runStart.operation_id !== launch.packetBinding.operation_id
    || runStart.stage_id !== launch.packetBinding.stage_id
    || runStart.execution_token_id !== launch.packetBinding.execution_token_id
    || runStart.command_category !== launch.packetBinding.command_category
    || runStart.binding_digest !== launch.packetBinding.binding_digest) {
    provenanceError();
  }
  const withoutCurrentHash = { ...terminal };
  delete withoutCurrentHash.current_record_hash;
  if (terminal.run_auth_tag !== computeBrowserRunAuthTag(launch.journalAuthSecret, withoutCurrentHash)) provenanceError();
}

function verifyStandaloneJournalAuthentication(state, records) {
  const prepared = state.provenance.journalPrepared;
  if (!prepared) provenanceError();
  const journalPath = join(state.root, JOURNAL_DIRECTORY, JOURNAL_FILENAME);
  if (!samePreparedFileIdentity(journalPath, prepared)) provenanceError();
  if (records.some((record) => record.run_id !== state.runId)) provenanceError();
  const runStart = records[0];
  if (runStart.record_type !== 'browser_run_started' || runStart.source_binding_mode !== 'none' || runStart.source_manifest_digest !== null) provenanceError();
  const terminal = records.at(-1);
  if (!terminal || terminal.record_type !== 'browser_run_completed') provenanceError();
  const withoutCurrentHash = { ...terminal };
  delete withoutCurrentHash.current_record_hash;
  if (terminal.run_auth_tag !== computeBrowserRunAuthTag(state.standaloneAuthSecret, withoutCurrentHash)) provenanceError();
}

function journalProvenanceMode(records) {
  const mode = records[0]?.provenance_mode;
  if (!BROWSER_PROVENANCE_MODES.includes(mode) || records.some((record) => record.provenance_mode !== mode)) {
    throw new EvidenceError('INVALID_BROWSER_PROVENANCE_MODE', 'Browser journal provenance mode is inconsistent.');
  }
  return mode;
}

function verifyReporterReadyAuthentication(state, ready) {
  const launch = state.provenance.launch;
  const prepared = state.provenance.reporterReadyPrepared;
  if (!launch || !prepared) provenanceError();
  const readyPath = join(state.root, LAUNCH_DIRECTORY, BROWSER_REPORTER_READY_FILENAME);
  if (!samePreparedFileIdentity(readyPath, prepared)) provenanceError();
  if (ready.run_id !== launch.runId || ready.nonce_digest !== launch.nonceDigest) provenanceError();
  const { ready_auth_tag: actualTag, ...withoutTag } = ready;
  const expectedTag = createHmac('sha256', Buffer.from(launch.journalAuthSecret, 'hex'))
    .update(canonicalStringify({ ...withoutTag, ready_auth_tag: null }))
    .digest('hex');
  if (actualTag !== expectedTag) provenanceError();
}

function validateFileContentBeforeCleanup(state, relativePath) {
  const path = join(state.root, ...relativePath.split('/'));
  if (!existsSync(path)) return;
  if (relativePath === BROWSER_WORKSPACE_MARKER_FILENAME) {
    const marker = readWorkspaceMarker(path);
    if (marker.run_id !== state.runId || !sameFileProvenance(path, state.provenance.marker, BROWSER_LIMITS.summary_bytes)) provenanceError();
  } else if (relativePath === `${JOURNAL_DIRECTORY}/${JOURNAL_FILENAME}`) {
    if (state.provenance.journalPrepared && !state.provenance.imported && sameFileProvenance(path, state.provenance.journalPrepared, BROWSER_LIMITS.journal_bytes) && lstatSync(path).size === 0) return;
    const { records, sourceDigest } = readJournal(path);
    reconcile(records, sourceDigest, { outputRoot: join(state.root, OUTPUT_DIRECTORY), generatedAt: new Date().toISOString() });
    verifyJournalAuthentication(state, records);
    const imported = state.provenance.imported;
    if (imported) {
      if (sourceDigest !== imported.sourceJournalSha256 || !sameFileProvenance(path, imported.journalFile, BROWSER_LIMITS.journal_bytes)) provenanceError();
    } else if (journalProvenanceMode(records) !== 'generated_workspace' || !samePreparedFileIdentity(path, state.provenance.journalPrepared)) {
      provenanceError();
    }
  } else if (relativePath === `${SUMMARY_DIRECTORY}/${SUMMARY_FILENAME}`) {
    const journalPath = join(state.root, JOURNAL_DIRECTORY, JOURNAL_FILENAME);
    const summary = verifyBrowserSummary(path, existsSync(journalPath) ? { sourceJournalPath: journalPath } : {});
    const imported = state.provenance.imported;
    if (!imported
      || summary.run_id !== imported.runId
      || summary.source_journal_sha256 !== imported.sourceJournalSha256
      || !sameFileProvenance(path, imported.summaryFile, BROWSER_LIMITS.summary_bytes)) provenanceError();
  } else if (relativePath === `${LAUNCH_DIRECTORY}/${BROWSER_LAUNCH_FILENAME}`) {
    const descriptor = readCanonicalBrowserJson(path, 'servsync-controlled-ops/browser-launch-v1', 'browser launch descriptor');
    const launch = state.provenance.launch;
    if (!launch
      || descriptor.run_id !== launch.runId
      || descriptor.nonce_digest !== launch.nonceDigest
      || !sameFileProvenance(path, launch.descriptorFile, BROWSER_LIMITS.summary_bytes)) provenanceError();
  } else if (relativePath === `${LAUNCH_DIRECTORY}/${BROWSER_REPORTER_READY_FILENAME}`) {
    if (state.provenance.reporterReadyPrepared && !state.provenance.reporterReady && sameFileProvenance(path, state.provenance.reporterReadyPrepared, BROWSER_LIMITS.summary_bytes) && lstatSync(path).size === 0) return;
    const ready = readCanonicalBrowserJson(path, 'servsync-controlled-ops/browser-reporter-ready-v1', 'browser reporter-ready record');
    verifyReporterReadyAuthentication(state, ready);
    const reporterReady = state.provenance.reporterReady;
    if (!reporterReady || !sameFileProvenance(path, reporterReady, BROWSER_LIMITS.summary_bytes)) provenanceError();
  }
}

function validatedArtifactProvenance(state, relativePath) {
  const path = join(state.root, ...relativePath.split('/'));
  if (!existsSync(path)) return null;
  validateFileContentBeforeCleanup(state, relativePath);
  if (relativePath === BROWSER_WORKSPACE_MARKER_FILENAME) return { path, provenance: state.provenance.marker, maximumBytes: BROWSER_LIMITS.summary_bytes, mode: 0o600 };
  if (relativePath === `${JOURNAL_DIRECTORY}/${JOURNAL_FILENAME}`) {
    const provenance = state.provenance.imported?.journalFile
      ?? (lstatSync(path).size === 0 ? state.provenance.journalPrepared : fileProvenance(path, BROWSER_LIMITS.journal_bytes));
    if (!provenance) provenanceError();
    return { path, provenance, maximumBytes: BROWSER_LIMITS.journal_bytes, mode: 0o600 };
  }
  if (relativePath === `${SUMMARY_DIRECTORY}/${SUMMARY_FILENAME}`) {
    const provenance = state.provenance.imported?.summaryFile;
    if (!provenance) provenanceError();
    return { path, provenance, maximumBytes: BROWSER_LIMITS.summary_bytes, mode: 0o600 };
  }
  if (relativePath === `${LAUNCH_DIRECTORY}/${BROWSER_REPORTER_READY_FILENAME}`) {
    const provenance = state.provenance.reporterReady ?? state.provenance.reporterReadyPrepared;
    if (!provenance) provenanceError();
    return { path, provenance, maximumBytes: BROWSER_LIMITS.summary_bytes, mode: 0o600 };
  }
  if (relativePath === `${LAUNCH_DIRECTORY}/${BROWSER_LAUNCH_FILENAME}`) {
    const provenance = state.provenance.launch?.descriptorFile;
    if (!provenance) provenanceError();
    return { path, provenance, maximumBytes: BROWSER_LIMITS.summary_bytes, mode: 0o600 };
  }
  throw new EvidenceError('BROWSER_CLEANUP_UNKNOWN_ENTRY', 'Browser cleanup artifact is not recognized.');
}

function cleanupOneArtifact(state, relativePath, deleted) {
  const path = join(state.root, ...relativePath.split('/'));
  if (!existsSync(path)) return;
  const expected = validatedArtifactProvenance(state, relativePath);
  if (!expected) return;
  const safePath = assertWorkspaceChild(state, relativePath, { type: 'file', mode: expected.mode });
  if (safePath !== expected.path || !sameFileProvenance(safePath, expected.provenance, expected.maximumBytes)) provenanceError();
  unlinkSync(safePath);
  deleted.push(relativePath);
  fsyncDirectory(dirname(safePath));
}

function inventoryWorkspace(state, path = state.root, depth = 0, entries = []) {
  if (depth > 4) throw new EvidenceError('BROWSER_CLEANUP_INVENTORY', 'Browser cleanup inventory exceeded its depth limit.');
  const root = state.root;
  const names = readdirSync(path).sort();
  for (const name of names) {
    const child = join(path, name);
    const childRelative = relative(root, child).split(sep).join('/');
    const info = lstatSync(child);
    if (!expectedEntries().has(childRelative)) {
      throw new EvidenceError('BROWSER_CLEANUP_UNKNOWN_ENTRY', 'Browser cleanup encountered an unexpected workspace entry.');
    }
    if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Browser cleanup refuses symlinked entries.');
    entries.push(childRelative);
    if (info.isDirectory()) inventoryWorkspace(state, child, depth + 1, entries);
  }
  return entries;
}

function inventoryStandaloneWorkspace(state, path = state.root, depth = 0, entries = []) {
  if (depth > 4) throw new EvidenceError('BROWSER_CLEANUP_INVENTORY', 'Standalone browser cleanup inventory exceeded its depth limit.');
  const root = state.root;
  const names = readdirSync(path).sort();
  const expected = standaloneExpectedEntries();
  for (const name of names) {
    const child = join(path, name);
    const childRelative = relative(root, child).split(sep).join('/');
    const info = lstatSync(child);
    if (!expected.has(childRelative)) {
      throw new EvidenceError('BROWSER_CLEANUP_UNKNOWN_ENTRY', 'Standalone browser cleanup encountered an unexpected workspace entry.');
    }
    if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Standalone browser cleanup refuses symlinked entries.');
    entries.push(childRelative);
    if (info.isDirectory()) inventoryStandaloneWorkspace(state, child, depth + 1, entries);
  }
  return entries;
}

function assertStandaloneDirectories(state) {
  assertWorkspaceRootSafety(state);
  for (const [name, identity] of Object.entries(state.directoryIdentities)) {
    const path = assertWorkspaceChild(state, name, { type: 'directory', mode: identity.mode });
    if (!sameIdentity(identityOf(path), identity)) throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Standalone browser evidence child directory identity changed.');
  }
}

function unlinkProvenanceFile(state, relativePath, provenance, maximumBytes, deleted) {
  if (!existsSync(join(state.root, ...relativePath.split('/')))) return false;
  const safePath = assertWorkspaceChild(state, relativePath, { type: 'file', mode: 0o600 });
  if (!sameFileProvenance(safePath, provenance, maximumBytes)) provenanceError();
  unlinkSync(safePath);
  deleted.push(relativePath);
  fsyncDirectory(dirname(safePath));
  return true;
}

function unlinkPreparedStandaloneJournal(state, deleted) {
  const relativePath = `${JOURNAL_DIRECTORY}/${JOURNAL_FILENAME}`;
  const path = join(state.root, JOURNAL_DIRECTORY, JOURNAL_FILENAME);
  if (!existsSync(path)) return false;
  const safePath = assertWorkspaceChild(state, relativePath, { type: 'file', mode: 0o600 });
  if (!samePreparedFileIdentity(safePath, state.provenance.journalPrepared)) provenanceError();
  unlinkSync(safePath);
  deleted.push(relativePath);
  fsyncDirectory(dirname(safePath));
  return true;
}

function removeStandaloneDirectory(state, relativePath, deleted) {
  const path = join(state.root, relativePath);
  if (!existsSync(path)) return false;
  const identity = state.directoryIdentities[relativePath];
  const safePath = assertWorkspaceChild(state, relativePath, { type: 'directory', mode: identity?.mode ?? WORKSPACE_DIRECTORY_MODES[relativePath] });
  if (identity && !sameIdentity(identityOf(safePath), identity)) throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Standalone browser evidence directory identity changed.');
  if (readdirSync(safePath).length > 0) throw new EvidenceError('BROWSER_CLEANUP_NOT_EMPTY', 'Standalone browser evidence directory is not empty.');
  rmdirSync(safePath);
  deleted.push(relativePath);
  fsyncDirectory(dirname(safePath));
  return true;
}

function verifyStandaloneImportedSummary(state) {
  const imported = state.provenance.imported;
  if (!imported) throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Standalone browser evidence has not been imported.');
  const journalPath = join(state.root, JOURNAL_DIRECTORY, JOURNAL_FILENAME);
  const summaryPath = join(state.root, SUMMARY_DIRECTORY, SUMMARY_FILENAME);
  const summary = verifyBrowserSummary(summaryPath, { sourceJournalPath: journalPath });
  if (summary.run_id !== imported.runId
    || summary.source_journal_sha256 !== imported.sourceJournalSha256
    || !sameFileProvenance(journalPath, imported.journalFile, BROWSER_LIMITS.journal_bytes)
    || !sameFileProvenance(summaryPath, imported.summaryFile, BROWSER_LIMITS.summary_bytes)) {
    provenanceError();
  }
  return summary;
}

function clearStandaloneSecret(state) {
  state.standaloneAuthSecret = null;
  state.provenance.writerControl = null;
}

export function createBrowserEvidenceWorkspace({ parentRoot = '/private/tmp', prefix = 'servsync-browser-evidence-' } = {}) {
  validateRawOperationRootInput(parentRoot, 'browser evidence parent root');
  validateRawOperationRootInput(prefix, 'browser evidence prefix');
  if (!prefix.startsWith('servsync-') || /[\/\\]/.test(prefix)) throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Browser evidence prefix is unsafe.');
  const parent = resolve(parentRoot);
  assertCanonicalParents(parent);
  assertOutsideGit(parent);
  const root = mkdtempSync(join(parent, prefix));
  chmodSync(root, 0o700);
  if (realpathSync(root) !== root) throw new EvidenceError('SYMLINK_REJECTED', 'Browser evidence workspace root is symlinked.');
  const rootIdentity = identityOf(root);
  if (rootIdentity.type !== 'directory' || rootIdentity.uid !== process.getuid?.() || rootIdentity.mode !== 0o700) {
    throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Browser evidence workspace root failed safety checks.');
  }
  const directoryIdentities = snapshotExpectedDirectories(root);
  const runId = `browser-workspace-${randomBytes(12).toString('hex')}`;
  const markerFile = createWorkspaceMarker(root, runId);
  const state = {
    runId,
    root,
    rootIdentity,
    directoryIdentities,
    provenance: {
      marker: markerFile,
      imported: null,
      journalPrepared: null,
      launch: null,
      reporterReadyPrepared: null,
      reporterReady: null,
    },
    cleanupState: 'active',
  };
  registerWorkspaceState(state);
  const cleanupHandle = Object.freeze({});
  cleanupHandleStates.set(cleanupHandle, state);
  const workspace = {
    runId,
    root,
    journalRoot: join(root, JOURNAL_DIRECTORY),
    summaryRoot: join(root, SUMMARY_DIRECTORY),
    launchRoot: join(root, LAUNCH_DIRECTORY),
    outputRoot: join(root, OUTPUT_DIRECTORY),
    journalPath: join(root, JOURNAL_DIRECTORY, JOURNAL_FILENAME),
    summaryPath: join(root, SUMMARY_DIRECTORY, SUMMARY_FILENAME),
    cleanupHandle,
  };
  return Object.freeze(workspace);
}

export function createStandaloneBrowserEvidenceSession({ parentRoot = '/private/tmp', prefix = 'servsync-browser-standalone-' } = {}) {
  validateRawOperationRootInput(parentRoot, 'standalone browser evidence parent root');
  validateRawOperationRootInput(prefix, 'standalone browser evidence prefix');
  if (!prefix.startsWith('servsync-') || /[\/\\]/.test(prefix)) throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Standalone browser evidence prefix is unsafe.');
  const parent = resolve(parentRoot);
  assertCanonicalParents(parent);
  assertOutsideGit(parent);
  const root = mkdtempSync(join(parent, prefix));
  chmodSync(root, 0o700);
  if (realpathSync(root) !== root) throw new EvidenceError('SYMLINK_REJECTED', 'Standalone browser evidence root is symlinked.');
  const rootIdentity = identityOf(root);
  if (rootIdentity.type !== 'directory' || rootIdentity.uid !== process.getuid?.() || rootIdentity.mode !== 0o700) {
    throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Standalone browser evidence root failed safety checks.');
  }
  const directoryIdentities = snapshotExpectedDirectories(root, { includeOutput: true, outputMode: STANDALONE_OUTPUT_MODE });
  const runId = `browser-standalone-${randomBytes(12).toString('hex')}`;
  const markerFile = createWorkspaceMarker(root, runId);
  const journalPrepared = createPreparedFile(join(root, JOURNAL_DIRECTORY, JOURNAL_FILENAME));
  const state = {
    runId,
    root,
    rootIdentity,
    directoryIdentities,
    standaloneAuthSecret: randomBytes(32).toString('hex'),
    provenance: {
      marker: markerFile,
      imported: null,
      journalPrepared,
      writerCreated: false,
      writerControl: null,
    },
    sessionState: STANDALONE_STATES.CREATED,
  };
  const standaloneHandle = Object.freeze({});
  standaloneHandleStates.set(standaloneHandle, state);
  return Object.freeze({
    runId,
    root,
    journalRoot: join(root, JOURNAL_DIRECTORY),
    summaryRoot: join(root, SUMMARY_DIRECTORY),
    launchRoot: join(root, LAUNCH_DIRECTORY),
    outputRoot: join(root, OUTPUT_DIRECTORY),
    journalPath: join(root, JOURNAL_DIRECTORY, JOURNAL_FILENAME),
    summaryPath: join(root, SUMMARY_DIRECTORY, SUMMARY_FILENAME),
    standaloneHandle,
  });
}

function stateForCleanupHandle(cleanupHandle) {
  const state = cleanupHandleStates.get(cleanupHandle);
  if (!state) throw new EvidenceError('INVALID_BROWSER_CLEANUP_HANDLE', 'Browser cleanup requires an authentic workspace cleanup handle.');
  if (state.cleanupState !== 'active') throw new EvidenceError('BROWSER_CLEANUP_STATE', 'Browser cleanup handle is not active.');
  return state;
}

function stateForStandaloneHandle(standaloneHandle, { allowedStates = null, action = 'use' } = {}) {
  const state = standaloneHandleStates.get(standaloneHandle);
  if (!state) throw new EvidenceError('INVALID_BROWSER_STANDALONE_HANDLE', 'Standalone browser operation requires an authentic evidence session handle.');
  if (allowedStates && !allowedStates.includes(state.sessionState)) {
    throw new EvidenceError('BROWSER_PROVENANCE_STATE', `Standalone browser evidence session cannot ${action} from its current lifecycle state.`);
  }
  return state;
}

function closeStandaloneWriterControl(state) {
  const control = state.provenance.writerControl;
  if (!control || control.closed) return;
  control.writer.close();
  control.closed = true;
  if (state.sessionState === STANDALONE_STATES.WRITER_OPEN) state.sessionState = STANDALONE_STATES.WRITER_CLOSED;
}

function standaloneWriterFacade(state, writer) {
  return Object.freeze({
    rootPath: writer.rootPath,
    journalPath: writer.journalPath,
    append(input) {
      if (state.sessionState !== STANDALONE_STATES.WRITER_OPEN) {
        throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Standalone browser journal writer is not active.');
      }
      return writer.append(input);
    },
    close() {
      if (state.sessionState === STANDALONE_STATES.WRITER_CLOSED) return;
      if (state.sessionState !== STANDALONE_STATES.WRITER_OPEN) {
        throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Standalone browser journal writer cannot close from its current lifecycle state.');
      }
      closeStandaloneWriterControl(state);
    },
  });
}

export function createStandaloneBrowserJournalWriter({ standaloneHandle } = {}) {
  const state = stateForStandaloneHandle(standaloneHandle, { allowedStates: [STANDALONE_STATES.CREATED], action: 'create a writer' });
  if (state.provenance.writerCreated || state.provenance.imported || state.provenance.writerControl) {
    throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Standalone browser journal writer already exists.');
  }
  try {
    const journalRoot = assertWorkspaceChild(state, JOURNAL_DIRECTORY, { type: 'directory', mode: WORKSPACE_DIRECTORY_MODES[JOURNAL_DIRECTORY] });
    assertWorkspaceChild(state, `${JOURNAL_DIRECTORY}/${JOURNAL_FILENAME}`, { type: 'file', mode: 0o600 });
    const writer = createJournalWriter(journalRoot, {
      allowPrepared: true,
      journalAuthSecret: state.standaloneAuthSecret,
      provenanceMode: 'standalone',
    });
    state.provenance.writerCreated = true;
    state.provenance.writerControl = { writer, closed: false };
    state.sessionState = STANDALONE_STATES.WRITER_OPEN;
    return standaloneWriterFacade(state, writer);
  } catch (error) {
    state.sessionState = STANDALONE_STATES.FAILED;
    throw error;
  }
}

export function createBrowserWorkspaceLaunchContract({ cleanupHandle, baseURL, runLabel, packetBinding = null } = {}) {
  const state = stateForCleanupHandle(cleanupHandle);
  if (state.provenance.launch || state.provenance.journalPrepared || state.provenance.reporterReadyPrepared) {
    throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Browser workspace launch provenance already exists.');
  }
  const launchRoot = assertWorkspaceChild(state, LAUNCH_DIRECTORY, { type: 'directory', mode: WORKSPACE_DIRECTORY_MODES[LAUNCH_DIRECTORY] });
  const launch = createBrowserLaunchContract({ root: launchRoot, baseURL, runLabel, packetBinding });
  const descriptorPath = join(state.root, LAUNCH_DIRECTORY, BROWSER_LAUNCH_FILENAME);
  state.provenance.launch = {
    runId: launch.descriptor.run_id,
    nonceDigest: launch.descriptor.nonce_digest,
    journalAuthDigest: launch.descriptor.journal_auth_digest,
    journalAuthSecret: launch.journalAuthSecret,
    sourceBindingMode: 'current_source_snapshot',
    sourceManifestDigest: launch.descriptor.source_manifest_digest,
    packetBinding: {
      packet_binding_mode: launch.descriptor.packet_binding_mode,
      operation_id: launch.descriptor.operation_id,
      stage_id: launch.descriptor.stage_id,
      execution_token_id: launch.descriptor.execution_token_id,
      command_category: launch.descriptor.command_category,
      binding_digest: launch.descriptor.binding_digest,
    },
    descriptorFile: fileProvenance(descriptorPath, BROWSER_LIMITS.summary_bytes),
  };
  state.provenance.reporterReadyPrepared = createPreparedFile(join(state.root, LAUNCH_DIRECTORY, BROWSER_REPORTER_READY_FILENAME));
  state.provenance.journalPrepared = createPreparedFile(join(state.root, JOURNAL_DIRECTORY, JOURNAL_FILENAME));
  return launch;
}

export function recordBrowserReporterReady({ cleanupHandle } = {}) {
  const state = stateForCleanupHandle(cleanupHandle);
  const readyPath = join(state.root, LAUNCH_DIRECTORY, BROWSER_REPORTER_READY_FILENAME);
  assertWorkspaceChild(state, `${LAUNCH_DIRECTORY}/${BROWSER_REPORTER_READY_FILENAME}`, { type: 'file', mode: 0o600 });
  const ready = readCanonicalBrowserJson(readyPath, 'servsync-controlled-ops/browser-reporter-ready-v1', 'browser reporter-ready record');
  verifyReporterReadyAuthentication(state, ready);
  if (state.provenance.reporterReady) throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Browser reporter-ready provenance already exists.');
  state.provenance.reporterReady = fileProvenance(readyPath, BROWSER_LIMITS.summary_bytes);
  return { status: 'recorded' };
}

function parseOptions(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new EvidenceError('INVALID_ARGUMENTS', 'Browser importer arguments are invalid.');
    options[key.slice(2)] = value;
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (!value) throw new EvidenceError('INVALID_ARGUMENTS', `--${name} is required.`);
  return value;
}

function validateOutputRoot(root) {
  validateRawOperationRootInput(root, 'browser summary root');
  const rootPath = resolve(root);
  assertCanonicalParents(rootPath);
  assertOutsideGit(dirname(rootPath));
  if (!existsSync(rootPath)) mkdirSync(rootPath, { mode: 0o700 });
  if (realpathSync(rootPath) !== rootPath) throw new EvidenceError('SYMLINK_REJECTED', 'Browser summary root must not use symlinked path components.');
  const info = lstatSync(rootPath);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || modeOf(info) !== 0o700) {
    throw new EvidenceError('UNSAFE_BROWSER_SUMMARY_ROOT', 'Browser summary root ownership, type, or mode is unsafe.');
  }
  return rootPath;
}

function createExclusiveSummary(path, content) {
  const root = validateOutputRoot(dirname(resolve(path)));
  const destination = resolve(path);
  if (dirname(destination) !== root || basename(destination) !== 'browser-summary.json') {
    throw new EvidenceError('UNSAFE_BROWSER_SUMMARY_PATH', 'Browser summary path must be an exact browser-summary.json leaf in the summary root.');
  }
  if (existsSync(destination)) throw new EvidenceError('PREEXISTING_BROWSER_SUMMARY', 'Browser summary destination already exists.');
  const descriptor = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || modeOf(info) !== 0o600) {
      throw new EvidenceError('UNSAFE_BROWSER_SUMMARY', 'Created browser summary failed ownership checks.');
    }
    if (Buffer.byteLength(content) > BROWSER_LIMITS.summary_bytes) throw new EvidenceError('BROWSER_SUMMARY_LIMIT', 'Browser summary exceeds its byte limit.');
    writeFileSync(descriptor, content, 'utf8');
    fsyncSync(descriptor);
  } catch (error) {
    try { closeSync(descriptor); } catch {}
    try { unlinkSync(destination); } catch {}
    throw error;
  }
  closeSync(descriptor);
  fsyncDirectory(root);
  return destination;
}

function classifyError(status, rawError) {
  if (!rawError) return 'none';
  if (status === 'timed_out') return 'timeout';
  const name = String(rawError.name ?? '').toLowerCase();
  if (name.includes('assert')) return 'assertion';
  if (name.includes('timeout')) return 'timeout';
  return 'unknown';
}

function countProhibitedArtifacts(outputRoot) {
  if (!outputRoot) return { screenshots: 0, traces: 0, videos: 0, hars: 0, html_reports: 0, storage_states: 0 };
  const root = resolve(outputRoot);
  if (!existsSync(root)) return { screenshots: 0, traces: 0, videos: 0, hars: 0, html_reports: 0, storage_states: 0 };
  if (!isAbsolute(root)) throw new EvidenceError('UNSAFE_BROWSER_OUTPUT_ROOT', 'Browser output root must be absolute.');
  const counts = { screenshots: 0, traces: 0, videos: 0, hars: 0, html_reports: 0, storage_states: 0 };
  const visit = (path, depth = 0) => {
    if (depth > 12) throw new EvidenceError('BROWSER_OUTPUT_LIMIT', 'Browser output traversal exceeded its limit.');
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new EvidenceError('SYMLINK_REJECTED', 'Browser output contains a symlink.');
    if (info.isDirectory()) {
      for (const name of new Set(readdirSync(path))) visit(join(path, name), depth + 1);
      return;
    }
    if (!info.isFile()) throw new EvidenceError('UNSAFE_BROWSER_OUTPUT', 'Browser output contains a non-regular file.');
    const lower = basename(path).toLowerCase();
    if (/\.(png|jpg|jpeg|webp)$/.test(lower)) counts.screenshots += 1;
    else if (lower.endsWith('.zip')) counts.traces += 1;
    else if (/\.(webm|mp4)$/.test(lower)) counts.videos += 1;
    else if (lower.endsWith('.har')) counts.hars += 1;
    else if (lower.endsWith('.html')) counts.html_reports += 1;
    else if (lower.includes('storage') && lower.endsWith('.json')) counts.storage_states += 1;
    else throw new EvidenceError('PROHIBITED_BROWSER_ARTIFACT', 'Browser output root contains an unexpected retained artifact.');
  };
  visit(root);
  return counts;
}

function reconcile(records, sourceDigest, { outputRoot = null, generatedAt = new Date().toISOString() } = {}) {
  const runStarted = records.filter((record) => record.record_type === 'browser_run_started');
  const runCompleted = records.filter((record) => record.record_type === 'browser_run_completed');
  if (runStarted.length !== 1) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser journal must contain exactly one run-start record.');
  if (runCompleted.length !== 1) throw new EvidenceError('BROWSER_INCOMPLETE_JOURNAL', 'Browser journal lacks a terminal run-completion record.');
  if (records[0].record_type !== 'browser_run_started') throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Run-start record must be first.');
  if (records.at(-1).record_type !== 'browser_run_completed') throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Run-completion record must be last.');
  const runId = runStarted[0].run_id;
  if (records.some((record) => record.run_id !== runId)) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser journal contains multiple run IDs.');
  const sourceBinding = validateBrowserSourceBinding(runStarted[0].source_binding_mode, runStarted[0].source_manifest_digest, { runStart: true });
  const packetBinding = validateBrowserPacketBindingFields({
    packet_binding_mode: runStarted[0].packet_binding_mode,
    operation_id: runStarted[0].operation_id,
    stage_id: runStarted[0].stage_id,
    execution_token_id: runStarted[0].execution_token_id,
    command_category: runStarted[0].command_category,
    binding_digest: runStarted[0].binding_digest,
  }, {
    runStart: true,
    browserRunId: runStarted[0].run_id,
    sourceBindingMode: sourceBinding.source_binding_mode,
    sourceManifestDigest: sourceBinding.source_manifest_digest,
    provenanceMode: runStarted[0].provenance_mode,
  });

  const starts = new Map();
  const terminals = new Map();
  const stepCounts = new Map();
  const collectorRecords = new Map();
  const attemptIds = new Set();
  const openAttempts = new Map();
  for (const record of records.slice(1, -1)) {
    if (record.record_type === 'browser_test_started') {
      if (starts.has(record.attempt_id)) throw new EvidenceError('BROWSER_DUPLICATE_ID', 'Duplicate browser attempt start.');
      if (attemptIds.has(record.attempt_id)) throw new EvidenceError('BROWSER_DUPLICATE_ID', 'Duplicate browser attempt ID.');
      if (record.test_id !== testIdFor({ specPath: record.spec_path, project: record.project, safeLabel: record.safe_label })) throw new EvidenceError('BROWSER_ID_MISMATCH', 'Browser test ID does not match safe inputs.');
      if (record.attempt_id !== attemptIdFor({ testId: record.test_id, retryIndex: record.retry_index, workerIndex: record.worker_index })) throw new EvidenceError('BROWSER_ID_MISMATCH', 'Browser attempt ID does not match safe inputs.');
      starts.set(record.attempt_id, record);
      attemptIds.add(record.attempt_id);
      openAttempts.set(record.attempt_id, { phase: 'started', collectors: new Set() });
    } else if (record.record_type === 'browser_step_completed') {
      const attempt = openAttempts.get(record.attempt_id);
      if (!attempt || attempt.phase !== 'started') throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser step references an attempt that is not accepting steps.');
      stepCounts.set(record.attempt_id, (stepCounts.get(record.attempt_id) ?? 0) + 1);
      if (stepCounts.get(record.attempt_id) > BROWSER_LIMITS.steps_per_test) throw new EvidenceError('BROWSER_STEP_LIMIT', 'Browser step limit exceeded.');
    } else if (['browser_console_summary', 'browser_page_error_summary', 'browser_network_summary'].includes(record.record_type)) {
      const attempt = openAttempts.get(record.attempt_id);
      if (!attempt) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser collector summary references an attempt that has not started.');
      const requiredOrder = ['browser_console_summary', 'browser_page_error_summary', 'browser_network_summary'];
      if (record.record_type !== requiredOrder[attempt.collectors.size]) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser collector summary ordering is invalid.');
      if (attempt.collectors.has(record.record_type)) throw new EvidenceError('BROWSER_DUPLICATE_ID', 'Browser attempt has duplicate collector summary.');
      const start = starts.get(record.attempt_id);
      if (!start || record.test_id !== start.test_id || record.retry_index !== start.retry_index || record.worker_index !== start.worker_index || record.spec_path !== start.spec_path || record.safe_label !== start.safe_label) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser collector summary identity does not match its attempt.');
      const byAttempt = collectorRecords.get(record.attempt_id) ?? {};
      if (record.record_type === 'browser_console_summary') {
        validateConsoleAggregate(record.console_aggregate);
        byAttempt.console = record.console_aggregate;
      } else if (record.record_type === 'browser_page_error_summary') {
        validatePageErrorAggregate(record.page_error_aggregate);
        byAttempt.page_error = record.page_error_aggregate;
      } else {
        validateNetworkAggregate(record.network_aggregate);
        byAttempt.network = record.network_aggregate;
      }
      collectorRecords.set(record.attempt_id, byAttempt);
      attempt.collectors.add(record.record_type);
    } else if (record.record_type === 'browser_test_completed') {
      const attempt = openAttempts.get(record.attempt_id);
      if (!attempt) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser test completion lacks a start record.');
      if (attempt.collectors.size !== 3) throw new EvidenceError('BROWSER_INCOMPLETE_JOURNAL', 'Browser test completion lacks required collector summaries.');
      if (terminals.has(record.attempt_id)) throw new EvidenceError('BROWSER_DUPLICATE_TERMINAL', 'Browser attempt has duplicate terminal records.');
      terminals.set(record.attempt_id, record);
      openAttempts.delete(record.attempt_id);
    } else {
      throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser record appears in an invalid position.');
    }
  }
  if (starts.size > BROWSER_LIMITS.tests_per_run) throw new EvidenceError('BROWSER_TEST_LIMIT', 'Browser test limit exceeded.');
  if (starts.size !== terminals.size) throw new EvidenceError('BROWSER_INCOMPLETE_JOURNAL', 'Every started browser test must have one terminal record.');
  if (openAttempts.size !== 0) throw new EvidenceError('BROWSER_INCOMPLETE_JOURNAL', 'Browser journal contains an unfinished attempt.');

  const tests = [...starts.values()].sort((left, right) => left.attempt_id.localeCompare(right.attempt_id)).map((start) => {
    const terminal = terminals.get(start.attempt_id);
    const observability = collectorRecords.get(start.attempt_id);
    if (!observability?.console || !observability?.page_error || !observability?.network) throw new EvidenceError('BROWSER_INCOMPLETE_JOURNAL', 'Browser observability evidence is incomplete.');
    for (const aggregate of [observability.console, observability.page_error, observability.network]) {
      if (aggregate.completeness_status !== 'complete' || aggregate.overflow_count !== 0 || aggregate.listener_error_count !== 0 || aggregate.collector_failure_class !== 'none') {
        throw new EvidenceError('BROWSER_OBSERVABILITY_INCOMPLETE', 'Browser observability evidence is not trusted complete.');
      }
    }
    validateDuration(terminal.duration_ms, 'browser test duration');
    return {
      test_id: start.test_id,
      attempt_id: start.attempt_id,
      spec_path: start.spec_path,
      safe_label: start.safe_label,
      project: start.project,
      worker_index: start.worker_index,
      retry_index: start.retry_index,
      status: terminal.status,
      duration_ms: terminal.duration_ms,
      error_classification: terminal.error_classification,
      step_count: stepCounts.get(start.attempt_id) ?? 0,
      observability,
    };
  });
  const counts = {
    started: tests.length,
    passed: tests.filter((test) => test.status === 'passed').length,
    failed: tests.filter((test) => test.status === 'failed').length,
    timed_out: tests.filter((test) => test.status === 'timed_out').length,
    skipped: tests.filter((test) => test.status === 'skipped').length,
    interrupted: tests.filter((test) => test.status === 'interrupted').length,
    incomplete: tests.filter((test) => test.status === 'incomplete').length,
    steps: tests.reduce((sum, test) => sum + test.step_count, 0),
  };
  const runStatus = runCompleted[0].status;
  if (runStatus === 'passed' && (counts.failed + counts.timed_out + counts.interrupted + counts.incomplete) > 0) {
    throw new EvidenceError('BROWSER_STATUS_MISMATCH', 'Browser run is marked passed with failing tests.');
  }
  if (runStatus === 'failed' && (counts.failed + counts.timed_out + counts.interrupted + counts.incomplete) === 0) {
    throw new EvidenceError('BROWSER_STATUS_MISMATCH', 'Browser run is marked failed with no failing tests.');
  }
  validateTimestamp(generatedAt, 'browser summary generated timestamp');
  const prohibited = countProhibitedArtifacts(outputRoot);
  const summary = {
    schema_version: BROWSER_SUMMARY_SCHEMA,
    tool_version: BROWSER_TOOL_VERSION,
    generated_utc: generatedAt,
    source_journal_sha256: sourceDigest,
    run_id: runId,
    source_binding_mode: sourceBinding.source_binding_mode,
    source_manifest_digest: sourceBinding.source_manifest_digest,
    ...packetBinding,
    target_classification: 'local',
    project: 'chromium',
    worker_count: 1,
    retry_limit: BROWSER_LIMITS.retry_index_max,
    started_utc: runStarted[0].timestamp,
    completed_utc: runCompleted[0].timestamp,
    duration_ms: runCompleted[0].duration_ms,
    status: runStatus,
    counts,
    tests,
    observability: summarizeObservability(tests),
    prohibited_artifacts: prohibited,
  };
  return validateSummary(summary);
}

function summarizeObservability(tests) {
  const totals = {
    console_total: 0,
    page_error_total: 0,
    network_total: 0,
    overflow_total: 0,
    rejected_sensitive_total: 0,
    rejected_customer_content_total: 0,
    collector_failure_total: 0,
  };
  for (const test of tests) {
    totals.console_total += test.observability.console.total_count;
    totals.page_error_total += test.observability.page_error.total_count;
    totals.network_total += test.observability.network.total_requests;
    for (const aggregate of [test.observability.console, test.observability.page_error, test.observability.network]) {
      totals.overflow_total += aggregate.overflow_count;
      totals.rejected_sensitive_total += aggregate.rejected_sensitive_count ?? 0;
      totals.rejected_customer_content_total += aggregate.rejected_customer_content_count ?? 0;
      totals.collector_failure_total += aggregate.listener_error_count;
    }
  }
  return {
    completeness_status: totals.overflow_total === 0 && totals.collector_failure_total === 0 ? 'complete' : 'incomplete_collector_error',
    totals,
  };
}

function importTrustedBrowserJournalInternal({ journalPath, summaryPath, outputRoot = null, generatedAt, authenticatedState = null, standaloneState = null } = {}) {
  if (!journalPath || !summaryPath) throw new EvidenceError('INVALID_ARGUMENTS', 'Browser import requires journalPath and summaryPath.');
  const { records, sourceDigest } = readJournal(journalPath);
  const provenanceMode = journalProvenanceMode(records);
  if (provenanceMode === 'generated_workspace' && !authenticatedState) {
    throw new EvidenceError('BROWSER_GENERATED_IMPORT_REQUIRES_AUTH', 'Generated browser journals require an authenticated workspace import.');
  }
  if (provenanceMode === 'standalone' && !standaloneState) {
    throw new EvidenceError('BROWSER_STANDALONE_IMPORT_REQUIRES_HANDLE', 'Standalone browser journals require an authenticated standalone evidence session.');
  }
  if (provenanceMode === 'standalone' && authenticatedState) {
    throw new EvidenceError('BROWSER_PROVENANCE_MODE_MISMATCH', 'Authenticated generated import requires a generated workspace journal.');
  }
  if (provenanceMode === 'generated_workspace' && standaloneState) {
    throw new EvidenceError('BROWSER_PROVENANCE_MODE_MISMATCH', 'Authenticated standalone import requires a standalone journal.');
  }
  const summary = reconcile(records, sourceDigest, { outputRoot, generatedAt });
  if (authenticatedState) {
    const launch = authenticatedState.provenance.launch;
    if (!launch
      || summary.source_binding_mode !== launch.sourceBindingMode
      || summary.source_manifest_digest !== launch.sourceManifestDigest
      || summary.packet_binding_mode !== launch.packetBinding.packet_binding_mode
      || summary.operation_id !== launch.packetBinding.operation_id
      || summary.stage_id !== launch.packetBinding.stage_id
      || summary.execution_token_id !== launch.packetBinding.execution_token_id
      || summary.command_category !== launch.packetBinding.command_category
      || summary.binding_digest !== launch.packetBinding.binding_digest) {
      provenanceError();
    }
  } else if (standaloneState && (summary.source_binding_mode !== 'none'
    || summary.source_manifest_digest !== null
    || summary.packet_binding_mode !== 'none'
    || summary.operation_id !== null
    || summary.stage_id !== null
    || summary.execution_token_id !== null
    || summary.command_category !== null
    || summary.binding_digest !== null)) {
    provenanceError();
  }
  const content = `${canonicalStringify(summary)}\n`;
  const journalState = authenticatedState ? workspaceJournalRoots.get(dirname(resolve(journalPath))) : null;
  const summaryState = authenticatedState ? workspaceSummaryRoots.get(dirname(resolve(summaryPath))) : null;
  const activeState = authenticatedState ?? standaloneState;
  if (authenticatedState) {
    if (!journalState || !summaryState || journalState !== summaryState || (authenticatedState && journalState !== authenticatedState)) {
      throw new EvidenceError('BROWSER_CLEANUP_PROVENANCE_MISMATCH', 'Browser import paths do not belong to the same generated workspace.');
    }
    if (activeState.provenance.imported) {
      throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Browser import provenance already exists.');
    }
    verifyJournalAuthentication(activeState, records);
  } else if (standaloneState) {
    if (resolve(journalPath) !== join(standaloneState.root, JOURNAL_DIRECTORY, JOURNAL_FILENAME)
      || resolve(summaryPath) !== join(standaloneState.root, SUMMARY_DIRECTORY, SUMMARY_FILENAME)
      || resolve(outputRoot) !== join(standaloneState.root, OUTPUT_DIRECTORY)) {
      throw new EvidenceError('BROWSER_CLEANUP_PROVENANCE_MISMATCH', 'Standalone import paths do not belong to the authenticated evidence session.');
    }
    if (!standaloneState.provenance.writerCreated || standaloneState.provenance.imported) {
      throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Standalone browser import provenance is not in an importable state.');
    }
    verifyStandaloneJournalAuthentication(standaloneState, records);
  }
  const destination = createExclusiveSummary(summaryPath, content);
  if (activeState) {
    activeState.provenance.imported = {
      runId: summary.run_id,
      sourceJournalSha256: sourceDigest,
      journalFile: fileProvenance(resolve(journalPath), BROWSER_LIMITS.journal_bytes),
      summaryFile: fileProvenance(destination, BROWSER_LIMITS.summary_bytes),
    };
  }
  return { summary, summaryPath: destination };
}

export function importBrowserJournal({ journalPath, summaryPath, outputRoot = null, generatedAt } = {}) {
  void journalPath;
  void summaryPath;
  void outputRoot;
  void generatedAt;
  throw new EvidenceError('BROWSER_PATH_IMPORT_DISABLED', 'Path-based browser journal imports are verification-only and cannot create trusted summaries.');
}

export function importGeneratedBrowserWorkspaceJournal({ cleanupHandle, generatedAt } = {}) {
  const state = stateForCleanupHandle(cleanupHandle);
  const journalPath = join(state.root, JOURNAL_DIRECTORY, JOURNAL_FILENAME);
  const summaryPath = join(state.root, SUMMARY_DIRECTORY, SUMMARY_FILENAME);
  return importTrustedBrowserJournalInternal({
    journalPath,
    summaryPath,
    outputRoot: join(state.root, OUTPUT_DIRECTORY),
    generatedAt,
    authenticatedState: state,
  });
}

export function verifyGeneratedBrowserWorkspaceSummary({ cleanupHandle } = {}) {
  const state = stateForCleanupHandle(cleanupHandle);
  const summaryPath = join(state.root, SUMMARY_DIRECTORY, SUMMARY_FILENAME);
  const journalPath = join(state.root, JOURNAL_DIRECTORY, JOURNAL_FILENAME);
  return {
    summary: verifyBrowserSummary(summaryPath, { sourceJournalPath: journalPath }),
    summaryPath,
  };
}

export function importStandaloneBrowserJournal({ standaloneHandle, generatedAt } = {}) {
  const state = stateForStandaloneHandle(standaloneHandle, { allowedStates: [STANDALONE_STATES.WRITER_CLOSED], action: 'import' });
  const journalPath = join(state.root, JOURNAL_DIRECTORY, JOURNAL_FILENAME);
  const summaryPath = join(state.root, SUMMARY_DIRECTORY, SUMMARY_FILENAME);
  try {
    const result = importTrustedBrowserJournalInternal({
      journalPath,
      summaryPath,
      outputRoot: join(state.root, OUTPUT_DIRECTORY),
      generatedAt,
      standaloneState: state,
    });
    state.sessionState = STANDALONE_STATES.IMPORTED;
    return result;
  } catch (error) {
    state.sessionState = STANDALONE_STATES.FAILED;
    throw error;
  }
}

export function finalizeStandaloneBrowserEvidenceSession({ standaloneHandle } = {}) {
  const state = standaloneHandleStates.get(standaloneHandle);
  if (!state) throw new EvidenceError('INVALID_BROWSER_STANDALONE_HANDLE', 'Standalone browser finalize requires an authentic evidence session handle.');
  if (state.sessionState === STANDALONE_STATES.FINALIZED) {
    return {
      status: 'already_finalized',
      run_id: state.runId,
      summaryPath: join(state.root, SUMMARY_DIRECTORY, SUMMARY_FILENAME),
    };
  }
  if (state.sessionState === STANDALONE_STATES.DISCARDED) {
    return { status: 'already_discarded', run_id: state.runId, deleted: [] };
  }
  if (state.sessionState !== STANDALONE_STATES.IMPORTED) {
    throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Standalone browser evidence can finalize only after successful import.');
  }
  state.sessionState = STANDALONE_STATES.FINALIZING;
  const deleted = [];
  try {
    closeStandaloneWriterControl(state);
    inventoryStandaloneWorkspace(state);
    assertStandaloneDirectories(state);
    const summary = verifyStandaloneImportedSummary(state);
    unlinkProvenanceFile(state, `${JOURNAL_DIRECTORY}/${JOURNAL_FILENAME}`, state.provenance.imported.journalFile, BROWSER_LIMITS.journal_bytes, deleted);
    unlinkProvenanceFile(state, BROWSER_WORKSPACE_MARKER_FILENAME, state.provenance.marker, BROWSER_LIMITS.summary_bytes, deleted);
    for (const relativePath of [OUTPUT_DIRECTORY, LAUNCH_DIRECTORY, JOURNAL_DIRECTORY]) {
      removeStandaloneDirectory(state, relativePath, deleted);
    }
    inventoryStandaloneWorkspace(state);
    const remaining = readdirSync(state.root).sort();
    if (remaining.length !== 1 || remaining[0] !== SUMMARY_DIRECTORY) throw new EvidenceError('BROWSER_CLEANUP_NOT_EMPTY', 'Standalone finalize retained unexpected workspace entries.');
    const summaryDir = assertWorkspaceChild(state, SUMMARY_DIRECTORY, { type: 'directory', mode: WORKSPACE_DIRECTORY_MODES[SUMMARY_DIRECTORY] });
    if (readdirSync(summaryDir).sort().join(',') !== SUMMARY_FILENAME) throw new EvidenceError('BROWSER_CLEANUP_NOT_EMPTY', 'Standalone finalize retained unexpected summary entries.');
    clearStandaloneSecret(state);
    state.sessionState = STANDALONE_STATES.FINALIZED;
    return {
      status: 'finalized',
      run_id: state.runId,
      summaryPath: join(state.root, SUMMARY_DIRECTORY, SUMMARY_FILENAME),
      run_status: summary.status,
      deleted,
    };
  } catch (error) {
    state.sessionState = STANDALONE_STATES.FAILED;
    throw error;
  }
}

export function discardStandaloneBrowserEvidenceSession({ standaloneHandle } = {}) {
  const state = standaloneHandleStates.get(standaloneHandle);
  if (!state) throw new EvidenceError('INVALID_BROWSER_STANDALONE_HANDLE', 'Standalone browser discard requires an authentic evidence session handle.');
  if (state.sessionState === STANDALONE_STATES.DISCARDED) {
    return { status: 'already_discarded', run_id: state.runId, deleted: [] };
  }
  if (state.sessionState === STANDALONE_STATES.FINALIZED) {
    return {
      status: 'already_finalized',
      run_id: state.runId,
      summaryPath: join(state.root, SUMMARY_DIRECTORY, SUMMARY_FILENAME),
      deleted: [],
    };
  }
  state.sessionState = STANDALONE_STATES.DISCARDING;
  const deleted = [];
  try {
    try { closeStandaloneWriterControl(state); } catch (error) {
      state.sessionState = STANDALONE_STATES.FAILED;
      throw error;
    }
    if (!existsSync(state.root)) throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Standalone browser evidence root is missing before discard.');
    inventoryStandaloneWorkspace(state);
    assertStandaloneDirectories(state);
    if (existsSync(join(state.root, SUMMARY_DIRECTORY, SUMMARY_FILENAME))) {
      if (!state.provenance.imported) provenanceError();
      unlinkProvenanceFile(state, `${SUMMARY_DIRECTORY}/${SUMMARY_FILENAME}`, state.provenance.imported.summaryFile, BROWSER_LIMITS.summary_bytes, deleted);
    }
    unlinkPreparedStandaloneJournal(state, deleted);
    unlinkProvenanceFile(state, BROWSER_WORKSPACE_MARKER_FILENAME, state.provenance.marker, BROWSER_LIMITS.summary_bytes, deleted);
    for (const relativePath of [OUTPUT_DIRECTORY, LAUNCH_DIRECTORY, SUMMARY_DIRECTORY, JOURNAL_DIRECTORY]) {
      removeStandaloneDirectory(state, relativePath, deleted);
    }
    if (readdirSync(state.root).length > 0) throw new EvidenceError('BROWSER_CLEANUP_NOT_EMPTY', 'Standalone browser evidence root is not empty.');
    const root = assertWorkspaceRootSafety(state);
    rmdirSync(root);
    deleted.push('.');
    clearStandaloneSecret(state);
    state.sessionState = STANDALONE_STATES.DISCARDED;
    return { status: 'discarded', run_id: state.runId, deleted };
  } catch (error) {
    state.sessionState = STANDALONE_STATES.FAILED;
    throw error;
  }
}

export function verifyBrowserSummary(summaryPath, { sourceJournalPath = null } = {}) {
  const path = resolve(summaryPath);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.nlink !== 1 || modeOf(info) !== 0o600 || info.size > BROWSER_LIMITS.summary_bytes) {
    throw new EvidenceError('UNSAFE_BROWSER_SUMMARY', 'Browser summary ownership, type, link count, mode, or size is unsafe.');
  }
  const content = decodeUtf8(readFileSync(path));
  if (!content.endsWith('\n')) throw new EvidenceError('BROWSER_SUMMARY_TRUNCATED', 'Browser summary must end with a newline.');
  const parsed = parseStrictJson(content.slice(0, -1));
  if (content !== `${canonicalStringify(parsed)}\n`) throw new EvidenceError('BROWSER_SUMMARY_NONCANONICAL', 'Browser summary is not canonical JSON.');
  const summary = validateSummary(parsed);
  if (sourceJournalPath) {
    const { records, sourceDigest } = readJournal(sourceJournalPath);
    if (sourceDigest !== summary.source_journal_sha256) throw new EvidenceError('BROWSER_SOURCE_MISMATCH', 'Browser summary source digest does not match current journal.');
    const expected = reconcile(records, sourceDigest, { generatedAt: summary.generated_utc });
    if (canonicalStringify(expected) !== canonicalStringify(summary)) {
      throw new EvidenceError('BROWSER_SOURCE_MISMATCH', 'Browser summary does not match independently reconciled journal evidence.');
    }
  }
  return summary;
}

export function cleanupBrowserEvidence(cleanupHandle) {
  const state = cleanupHandleStates.get(cleanupHandle);
  if (!state) throw new EvidenceError('INVALID_BROWSER_CLEANUP_HANDLE', 'Browser cleanup requires an authentic workspace cleanup handle.');
  if (state.cleanupState === 'cleaned') return { status: 'already_cleaned', run_id: state.runId, deleted: [] };
  if (state.cleanupState !== 'active') throw new EvidenceError('BROWSER_CLEANUP_STATE', 'Browser cleanup handle is not active.');
  state.cleanupState = 'cleaning';
  const deleted = [];
  try {
    if (!existsSync(state.root)) {
      throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Browser evidence workspace root is missing before cleanup.');
    }
    inventoryWorkspace(state);
    for (const [name, identity] of Object.entries(state.directoryIdentities)) {
      let expectedIdentity = identity;
      if (name === OUTPUT_DIRECTORY && identity.mode === 0o755) {
        const outputPath = join(state.root, name);
        const current = existsSync(outputPath) ? identityOf(outputPath) : null;
        if (current
          && current.dev === identity.dev
          && current.ino === identity.ino
          && current.uid === identity.uid
          && current.type === identity.type
          && current.mode === 0o700) {
          expectedIdentity = current;
          state.directoryIdentities[name] = current;
        }
      }
      const path = assertWorkspaceChild(state, name, { type: 'directory', mode: expectedIdentity.mode });
      if (!sameIdentity(identityOf(path), expectedIdentity)) throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Browser evidence workspace child directory identity changed.');
    }
    for (const relativePath of [
      `${JOURNAL_DIRECTORY}/${JOURNAL_FILENAME}`,
      `${SUMMARY_DIRECTORY}/${SUMMARY_FILENAME}`,
      `${LAUNCH_DIRECTORY}/${BROWSER_REPORTER_READY_FILENAME}`,
      `${LAUNCH_DIRECTORY}/${BROWSER_LAUNCH_FILENAME}`,
      BROWSER_WORKSPACE_MARKER_FILENAME,
    ]) {
      cleanupOneArtifact(state, relativePath, deleted);
    }
    for (const relativePath of [OUTPUT_DIRECTORY, LAUNCH_DIRECTORY, SUMMARY_DIRECTORY, JOURNAL_DIRECTORY]) {
      const path = join(state.root, relativePath);
      if (!existsSync(path)) continue;
      let expectedMode = state.directoryIdentities[relativePath]?.mode ?? WORKSPACE_DIRECTORY_MODES[relativePath];
      if (relativePath === OUTPUT_DIRECTORY && !state.directoryIdentities[relativePath] && modeOf(lstatSync(path)) === 0o700) {
        expectedMode = 0o700;
      }
      const safePath = assertWorkspaceChild(state, relativePath, { type: 'directory', mode: expectedMode });
      if (readdirSync(safePath).length > 0) throw new EvidenceError('BROWSER_CLEANUP_NOT_EMPTY', 'Browser evidence directory is not empty.');
      rmdirSync(safePath);
      deleted.push(relativePath);
      fsyncDirectory(dirname(safePath));
    }
    inventoryWorkspace({ ...state, root: state.root });
    if (readdirSync(state.root).length > 0) throw new EvidenceError('BROWSER_CLEANUP_NOT_EMPTY', 'Browser evidence workspace root is not empty.');
    const root = assertWorkspaceRootSafety(state);
    rmdirSync(root);
    deleted.push('.');
    unregisterWorkspaceState(state);
    state.cleanupState = 'cleaned';
    return { status: 'cleaned', run_id: state.runId, deleted };
  } catch (error) {
    state.cleanupState = 'cleanup_failed';
    throw error;
  }
}

function runCli() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseOptions(rest);
  if (command === 'import') {
    const result = importBrowserJournal({
      journalPath: required(options, 'journal'),
      summaryPath: required(options, 'summary'),
      outputRoot: options['output-root'] ?? null,
    });
    process.stdout.write(`${canonicalStringify({ status: 'imported', summary_path: result.summaryPath, run_status: result.summary.status })}\n`);
  } else if (command === 'verify') {
    const summary = verifyBrowserSummary(required(options, 'summary'), { sourceJournalPath: options.journal ?? null });
    process.stdout.write(`${canonicalStringify({
      journal_recomputed: Boolean(options.journal),
      run_status: summary.status,
      source_binding_mode: summary.source_binding_mode,
      source_manifest_digest: summary.source_manifest_digest,
      status: 'verified',
      terminal_hmac_authenticated: false,
      tests: summary.counts.started,
    })}\n`);
  } else {
    throw new EvidenceError('INVALID_COMMAND', 'Unknown browser importer command.');
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

export { classifyError, reconcile };
