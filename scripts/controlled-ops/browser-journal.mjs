import {
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
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  GENESIS_HASH,
  EvidenceError,
  assertCanonicalParents,
  assertOutsideGit,
  canonicalStringify,
  fsyncDirectory,
  sha256File,
  validateRawOperationRootInput,
} from './internal.mjs';
import { BROWSER_LIMITS, buildBrowserRecord, decodeUtf8, parseBrowserJournal } from './browser-schema.mjs';

export const JOURNAL_FILENAME = 'browser-journal.ndjson';

function modeOf(info) {
  return info.mode & 0o777;
}

export function validateJournalRootInput(root) {
  validateRawOperationRootInput(root, 'browser journal root');
  const rootPath = resolve(root);
  assertCanonicalParents(rootPath);
  assertOutsideGit(dirname(rootPath));
  if (!existsSync(rootPath)) mkdirSync(rootPath, { mode: 0o700 });
  const real = realpathSync(rootPath);
  if (real !== rootPath) throw new EvidenceError('SYMLINK_REJECTED', 'Browser journal root must not use symlinked path components.');
  const info = lstatSync(rootPath);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || modeOf(info) !== 0o700) {
    throw new EvidenceError('UNSAFE_BROWSER_JOURNAL_ROOT', 'Browser journal root ownership, type, or mode is unsafe.');
  }
  return rootPath;
}

export function assertJournalFile(path, { maximumBytes = BROWSER_LIMITS.journal_bytes } = {}) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.nlink !== 1 || modeOf(info) !== 0o600) {
    throw new EvidenceError('UNSAFE_BROWSER_JOURNAL', 'Browser journal ownership, type, link count, or mode is unsafe.');
  }
  if (info.size > maximumBytes) throw new EvidenceError('BROWSER_JOURNAL_LIMIT', 'Browser journal exceeds its byte limit.');
  return info;
}

export function assertExactlyOneJournal(root, expectedPath = null) {
  const entries = readdirSync(root).sort();
  if (entries.length !== 1 || entries[0] !== JOURNAL_FILENAME) throw new EvidenceError('UNKNOWN_BROWSER_JOURNAL_FILE', 'Browser journal root must contain exactly one known journal file.');
  const journalPath = join(root, JOURNAL_FILENAME);
  if (expectedPath && resolve(expectedPath) !== journalPath) throw new EvidenceError('BROWSER_JOURNAL_MISMATCH', 'Browser journal path is not the expected journal.');
  return journalPath;
}

export function createJournalWriter(root) {
  const rootPath = validateJournalRootInput(root);
  const journalPath = join(rootPath, JOURNAL_FILENAME);
  if (existsSync(journalPath)) throw new EvidenceError('PREEXISTING_BROWSER_JOURNAL', 'Browser journal already exists.');
  const descriptor = openSync(journalPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const info = fstatSync(descriptor);
  if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || modeOf(info) !== 0o600) {
    closeSync(descriptor);
    try { unlinkSync(journalPath); } catch {}
    throw new EvidenceError('UNSAFE_BROWSER_JOURNAL', 'Created browser journal failed ownership checks.');
  }

  let sequence = 0;
  let previousHash = GENESIS_HASH;
  let bytes = 0;
  let closed = false;

  const append = (input) => {
    if (closed) throw new EvidenceError('BROWSER_JOURNAL_CLOSED', 'Browser journal is already closed.');
    sequence += 1;
    if (sequence > BROWSER_LIMITS.journal_records) throw new EvidenceError('BROWSER_RECORD_LIMIT', 'Browser journal record limit exceeded.');
    const record = buildBrowserRecord(previousHash, { ...input, sequence });
    const line = `${canonicalStringify(record)}\n`;
    const lineBytes = Buffer.byteLength(line);
    if (lineBytes > BROWSER_LIMITS.line_bytes || bytes + lineBytes > BROWSER_LIMITS.journal_bytes) {
      throw new EvidenceError('BROWSER_JOURNAL_LIMIT', 'Browser journal byte limit exceeded.');
    }
    writeFileSync(descriptor, line, 'utf8');
    fsyncSync(descriptor);
    bytes += lineBytes;
    previousHash = record.current_record_hash;
    return record;
  };

  const close = () => {
    if (closed) return;
    fsyncSync(descriptor);
    closeSync(descriptor);
    fsyncDirectory(rootPath);
    assertJournalFile(journalPath);
    closed = true;
  };

  return { rootPath, journalPath, append, close };
}

export function readJournal(journalPath) {
  const root = validateJournalRootInput(dirname(resolve(journalPath)));
  const expectedPath = assertExactlyOneJournal(root, resolve(journalPath));
  assertJournalFile(expectedPath);
  const before = statSync(expectedPath);
  const digestBefore = sha256File(expectedPath, BROWSER_LIMITS.journal_bytes);
  const buffer = readFileSync(expectedPath);
  const after = statSync(expectedPath);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new EvidenceError('BROWSER_JOURNAL_REPLACED', 'Browser journal changed while being read.');
  }
  const content = decodeUtf8(buffer);
  const parsed = parseBrowserJournal(content);
  const digestAfter = sha256File(expectedPath, BROWSER_LIMITS.journal_bytes);
  if (digestBefore !== digestAfter) throw new EvidenceError('BROWSER_JOURNAL_REPLACED', 'Browser journal digest changed during import.');
  return { path: expectedPath, sourceDigest: digestAfter, ...parsed };
}
