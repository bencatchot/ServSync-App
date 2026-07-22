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
  BROWSER_SUMMARY_SCHEMA,
  BROWSER_TOOL_VERSION,
  attemptIdFor,
  computeBrowserRunAuthTag,
  decodeUtf8,
  testIdFor,
  validateGeneratedBrowserId,
  validateDuration,
  validateSummary,
} from './browser-schema.mjs';
import { JOURNAL_FILENAME, readJournal } from './browser-journal.mjs';
import { parseStrictJson } from './sanitize.mjs';
import { createBrowserLaunchContract } from './browser-launch-policy.mjs';

const SUMMARY_FILENAME = 'browser-summary.json';
const LAUNCH_DIRECTORY = 'launch';
const JOURNAL_DIRECTORY = 'journal';
const SUMMARY_DIRECTORY = 'summary';
const OUTPUT_DIRECTORY = 'playwright-output';
const PLAYWRIGHT_LAST_RUN_FILENAME = '.last-run.json';
const BROWSER_LAUNCH_FILENAME = 'browser-launch.json';
const BROWSER_REPORTER_READY_FILENAME = 'browser-reporter-ready.json';
const BROWSER_WORKSPACE_MARKER_FILENAME = 'browser-workspace.json';
const BROWSER_WORKSPACE_MARKER_SCHEMA = 'servsync-controlled-ops/browser-workspace-v1';
const cleanupHandleStates = new WeakMap();
const workspaceJournalRoots = new Map();
const workspaceSummaryRoots = new Map();
const workspaceLaunchRoots = new Map();
const WORKSPACE_DIRECTORY_MODES = Object.freeze({
  [JOURNAL_DIRECTORY]: 0o700,
  [SUMMARY_DIRECTORY]: 0o700,
  [LAUNCH_DIRECTORY]: 0o700,
  [OUTPUT_DIRECTORY]: 0o755,
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

function snapshotExpectedDirectories(root) {
  const directories = [JOURNAL_DIRECTORY, SUMMARY_DIRECTORY, LAUNCH_DIRECTORY].map((name) => {
    const path = join(root, name);
    const mode = WORKSPACE_DIRECTORY_MODES[name];
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
    `${OUTPUT_DIRECTORY}/${PLAYWRIGHT_LAST_RUN_FILENAME}`,
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
  const withoutCurrentHash = { ...terminal };
  delete withoutCurrentHash.current_record_hash;
  if (terminal.run_auth_tag !== computeBrowserRunAuthTag(launch.journalAuthSecret, withoutCurrentHash)) provenanceError();
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
    } else {
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
  } else if (relativePath === `${OUTPUT_DIRECTORY}/${PLAYWRIGHT_LAST_RUN_FILENAME}`) {
    const bookkeeping = state.provenance.bookkeeping;
    if (!bookkeeping || !sameFileProvenance(path, bookkeeping, BROWSER_LIMITS.summary_bytes)) provenanceError();
    const parsed = parseStrictJson(decodeUtf8(readFileSync(path)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.keys(parsed).sort().join(',') !== 'failedTests,status'
      || !['passed', 'failed'].includes(parsed.status)
      || !Array.isArray(parsed.failedTests)
      || parsed.failedTests.length !== 0) {
      throw new EvidenceError('BROWSER_CLEANUP_INVALID_FILE', 'Playwright last-run record is not recognized as safe generated browser evidence.');
    }
  }
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
      bookkeeping: null,
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

function stateForCleanupHandle(cleanupHandle) {
  const state = cleanupHandleStates.get(cleanupHandle);
  if (!state) throw new EvidenceError('INVALID_BROWSER_CLEANUP_HANDLE', 'Browser cleanup requires an authentic workspace cleanup handle.');
  if (state.cleanupState !== 'active') throw new EvidenceError('BROWSER_CLEANUP_STATE', 'Browser cleanup handle is not active.');
  return state;
}

export function createBrowserWorkspaceLaunchContract({ cleanupHandle, baseURL, runLabel } = {}) {
  const state = stateForCleanupHandle(cleanupHandle);
  if (state.provenance.launch || state.provenance.journalPrepared || state.provenance.reporterReadyPrepared) {
    throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Browser workspace launch provenance already exists.');
  }
  const launchRoot = assertWorkspaceChild(state, LAUNCH_DIRECTORY, { type: 'directory', mode: WORKSPACE_DIRECTORY_MODES[LAUNCH_DIRECTORY] });
  const launch = createBrowserLaunchContract({ root: launchRoot, baseURL, runLabel });
  const descriptorPath = join(state.root, LAUNCH_DIRECTORY, BROWSER_LAUNCH_FILENAME);
  state.provenance.launch = {
    runId: launch.descriptor.run_id,
    nonceDigest: launch.descriptor.nonce_digest,
    journalAuthDigest: launch.descriptor.journal_auth_digest,
    journalAuthSecret: launch.journalAuthSecret,
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

export function recordBrowserBookkeeping({ cleanupHandle } = {}) {
  const state = stateForCleanupHandle(cleanupHandle);
  const lastRunPath = join(state.root, OUTPUT_DIRECTORY, PLAYWRIGHT_LAST_RUN_FILENAME);
  if (!existsSync(lastRunPath)) return { status: 'absent' };
  assertWorkspaceChild(state, `${OUTPUT_DIRECTORY}/${PLAYWRIGHT_LAST_RUN_FILENAME}`, { type: 'file', mode: 0o644 });
  const parsed = parseStrictJson(decodeUtf8(readFileSync(lastRunPath)));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).sort().join(',') !== 'failedTests,status'
    || !['passed', 'failed'].includes(parsed.status)
    || !Array.isArray(parsed.failedTests)
    || parsed.failedTests.length !== 0) {
    throw new EvidenceError('BROWSER_CLEANUP_INVALID_FILE', 'Playwright last-run record is not recognized as safe generated browser evidence.');
  }
  if (state.provenance.bookkeeping) throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Browser bookkeeping provenance already exists.');
  state.provenance.bookkeeping = fileProvenance(lastRunPath, BROWSER_LIMITS.summary_bytes);
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

  const starts = new Map();
  const terminals = new Map();
  const stepCounts = new Map();
  const attemptIds = new Set();
  for (const record of records.slice(1, -1)) {
    if (record.record_type === 'browser_test_started') {
      if (starts.has(record.test_id)) throw new EvidenceError('BROWSER_DUPLICATE_ID', 'Duplicate browser test start.');
      if (attemptIds.has(record.attempt_id)) throw new EvidenceError('BROWSER_DUPLICATE_ID', 'Duplicate browser attempt ID.');
      if (record.test_id !== testIdFor({ specPath: record.spec_path, project: record.project, safeLabel: record.safe_label })) throw new EvidenceError('BROWSER_ID_MISMATCH', 'Browser test ID does not match safe inputs.');
      if (record.attempt_id !== attemptIdFor({ testId: record.test_id, retryIndex: record.retry_index, workerIndex: record.worker_index })) throw new EvidenceError('BROWSER_ID_MISMATCH', 'Browser attempt ID does not match safe inputs.');
      starts.set(record.test_id, record);
      attemptIds.add(record.attempt_id);
    } else if (record.record_type === 'browser_step_completed') {
      if (!starts.has(record.test_id)) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser step references a test that has not started.');
      stepCounts.set(record.test_id, (stepCounts.get(record.test_id) ?? 0) + 1);
      if (stepCounts.get(record.test_id) > BROWSER_LIMITS.steps_per_test) throw new EvidenceError('BROWSER_STEP_LIMIT', 'Browser step limit exceeded.');
    } else if (record.record_type === 'browser_test_completed') {
      if (!starts.has(record.test_id)) throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser test completion lacks a start record.');
      if (terminals.has(record.test_id)) throw new EvidenceError('BROWSER_DUPLICATE_TERMINAL', 'Browser test has duplicate terminal records.');
      terminals.set(record.test_id, record);
    } else {
      throw new EvidenceError('BROWSER_LIFECYCLE_MISMATCH', 'Browser record appears in an invalid position.');
    }
  }
  if (starts.size > BROWSER_LIMITS.tests_per_run) throw new EvidenceError('BROWSER_TEST_LIMIT', 'Browser test limit exceeded.');
  if (starts.size !== terminals.size) throw new EvidenceError('BROWSER_INCOMPLETE_JOURNAL', 'Every started browser test must have one terminal record.');

  const tests = [...starts.values()].sort((left, right) => left.test_id.localeCompare(right.test_id)).map((start) => {
    const terminal = terminals.get(start.test_id);
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
      step_count: stepCounts.get(start.test_id) ?? 0,
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
    target_classification: 'local',
    project: 'chromium',
    worker_count: 1,
    retry_limit: 1,
    started_utc: runStarted[0].timestamp,
    completed_utc: runCompleted[0].timestamp,
    duration_ms: runCompleted[0].duration_ms,
    status: runStatus,
    counts,
    tests,
    prohibited_artifacts: prohibited,
  };
  return validateSummary(summary);
}

export function importBrowserJournal({ journalPath, summaryPath, outputRoot = null, generatedAt } = {}) {
  if (!journalPath || !summaryPath) throw new EvidenceError('INVALID_ARGUMENTS', 'Browser import requires journalPath and summaryPath.');
  const { records, sourceDigest } = readJournal(journalPath);
  const summary = reconcile(records, sourceDigest, { outputRoot, generatedAt });
  const content = `${canonicalStringify(summary)}\n`;
  const journalState = workspaceJournalRoots.get(dirname(resolve(journalPath)));
  const summaryState = workspaceSummaryRoots.get(dirname(resolve(summaryPath)));
  const journalRoot = dirname(resolve(journalPath));
  const summaryRoot = dirname(resolve(summaryPath));
  const candidateWorkspaceRoot = dirname(journalRoot);
  if (basename(journalRoot) === JOURNAL_DIRECTORY
    && basename(summaryRoot) === SUMMARY_DIRECTORY
    && candidateWorkspaceRoot === dirname(summaryRoot)
    && existsSync(join(candidateWorkspaceRoot, BROWSER_WORKSPACE_MARKER_FILENAME))
    && (!journalState || !summaryState || journalState !== summaryState)) {
    throw new EvidenceError('BROWSER_CLEANUP_PROVENANCE_MISMATCH', 'Browser import requires an authenticated generated workspace.');
  }
  if (journalState || summaryState) {
    if (!journalState || !summaryState || journalState !== summaryState) {
      throw new EvidenceError('BROWSER_CLEANUP_PROVENANCE_MISMATCH', 'Browser import paths do not belong to the same generated workspace.');
    }
    if (journalState.provenance.imported) {
      throw new EvidenceError('BROWSER_PROVENANCE_STATE', 'Browser import provenance already exists.');
    }
    verifyJournalAuthentication(journalState, records);
  }
  const destination = createExclusiveSummary(summaryPath, content);
  if (journalState || summaryState) {
    journalState.provenance.imported = {
      runId: summary.run_id,
      sourceJournalSha256: sourceDigest,
      journalFile: fileProvenance(resolve(journalPath), BROWSER_LIMITS.journal_bytes),
      summaryFile: fileProvenance(destination, BROWSER_LIMITS.summary_bytes),
    };
  }
  return { summary, summaryPath: destination };
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
    const { sourceDigest } = readJournal(sourceJournalPath);
    if (sourceDigest !== summary.source_journal_sha256) throw new EvidenceError('BROWSER_SOURCE_MISMATCH', 'Browser summary source digest does not match current journal.');
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
      const path = assertWorkspaceChild(state, name, { type: 'directory', mode: identity.mode });
      if (!sameIdentity(identityOf(path), identity)) throw new EvidenceError('UNSAFE_BROWSER_WORKSPACE', 'Browser evidence workspace child directory identity changed.');
    }
    for (const relativePath of [
      BROWSER_WORKSPACE_MARKER_FILENAME,
      `${JOURNAL_DIRECTORY}/${JOURNAL_FILENAME}`,
      `${SUMMARY_DIRECTORY}/${SUMMARY_FILENAME}`,
      `${LAUNCH_DIRECTORY}/${BROWSER_REPORTER_READY_FILENAME}`,
      `${LAUNCH_DIRECTORY}/${BROWSER_LAUNCH_FILENAME}`,
      `${OUTPUT_DIRECTORY}/${PLAYWRIGHT_LAST_RUN_FILENAME}`,
    ]) {
      validateFileContentBeforeCleanup(state, relativePath);
    }
    for (const relativePath of [
      `${JOURNAL_DIRECTORY}/${JOURNAL_FILENAME}`,
      `${SUMMARY_DIRECTORY}/${SUMMARY_FILENAME}`,
      `${LAUNCH_DIRECTORY}/${BROWSER_REPORTER_READY_FILENAME}`,
      `${LAUNCH_DIRECTORY}/${BROWSER_LAUNCH_FILENAME}`,
      `${OUTPUT_DIRECTORY}/${PLAYWRIGHT_LAST_RUN_FILENAME}`,
      BROWSER_WORKSPACE_MARKER_FILENAME,
    ]) {
      const path = join(state.root, ...relativePath.split('/'));
      if (!existsSync(path)) continue;
      const safePath = assertWorkspaceChild(state, relativePath, { type: 'file', mode: relativePath.endsWith(PLAYWRIGHT_LAST_RUN_FILENAME) ? 0o644 : 0o600 });
      unlinkSync(safePath);
      deleted.push(relativePath);
      fsyncDirectory(dirname(safePath));
    }
    for (const relativePath of [OUTPUT_DIRECTORY, LAUNCH_DIRECTORY, SUMMARY_DIRECTORY, JOURNAL_DIRECTORY]) {
      const path = join(state.root, relativePath);
      if (!existsSync(path)) continue;
      const safePath = assertWorkspaceChild(state, relativePath, { type: 'directory', mode: state.directoryIdentities[relativePath]?.mode ?? WORKSPACE_DIRECTORY_MODES[relativePath] });
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
    process.stdout.write(`${canonicalStringify({ status: 'verified', run_status: summary.status, tests: summary.counts.started })}\n`);
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
