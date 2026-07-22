import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { importBrowserJournal, verifyBrowserSummary } from '../../scripts/controlled-ops/browser-importer.mjs';
import { createJournalWriter, readJournal } from '../../scripts/controlled-ops/browser-journal.mjs';
import { buildBrowserRecord } from '../../scripts/controlled-ops/browser-schema.mjs';
import { GENESIS_HASH, canonicalStringify } from '../../scripts/controlled-ops/internal.mjs';

function tempRoot() {
  const root = mkdtempSync(join('/private/tmp', 'servsync-browser-security-'));
  chmodSync(root, 0o700);
  return root;
}

function hasCode(code) {
  return (error) => error?.code === code;
}

test('journal root rejects symlinks and unknown sibling files', () => {
  const parent = tempRoot();
  try {
    const external = join(parent, 'external');
    const journal = join(parent, 'journal');
    mkdirSync(external, { mode: 0o700 });
    symlinkSync(external, journal);
    assert.throws(() => createJournalWriter(journal), (error) => ['SYMLINK_REJECTED', 'UNSAFE_BROWSER_JOURNAL_ROOT'].includes(error?.code));

    rmSync(journal);
    mkdirSync(journal, { mode: 0o700 });
    const writer = createJournalWriter(journal);
    writer.append({ record_type: 'browser_run_started', run_id: 'browser-run-local', timestamp: '2026-07-22T15:00:00.000Z' });
    writer.append({ record_type: 'browser_run_completed', run_id: 'browser-run-local', timestamp: '2026-07-22T15:00:01.000Z', status: 'passed', duration_ms: 1000 });
    writer.close();
    writeFileSync(join(journal, '.controlled-ops-forged'), 'status=ok\n', { mode: 0o600 });
    assert.throws(() => readJournal(join(journal, 'browser-journal.ndjson')), hasCode('UNKNOWN_BROWSER_JOURNAL_FILE'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('summary verification rejects forged, noncanonical, or secret-bearing summaries', () => {
  const parent = tempRoot();
  try {
    const summaryRoot = join(parent, 'summary');
    mkdirSync(summaryRoot, { mode: 0o700 });
    const path = join(summaryRoot, 'browser-summary.json');
    writeFileSync(path, '{"passed":true}\n', { mode: 0o600 });
    assert.throws(() => verifyBrowserSummary(path), (error) => ['INVALID_BROWSER_SUMMARY', 'BROWSER_SUMMARY_REJECTED', 'INVALID_PACKET_SCHEMA', 'INVALID_SCHEMA'].includes(error?.code));

    const start = buildBrowserRecord(GENESIS_HASH, {
      sequence: 1,
      record_type: 'browser_run_started',
      run_id: 'browser-run-local',
      timestamp: '2026-07-22T15:00:00.000Z',
    });
    const tampered = canonicalStringify({ ...start, safe_label: 'token-eyJaaaaaaaa.bbbbbbbb.cccccccc' });
    writeFileSync(path, `${tampered}\n`, { mode: 0o600 });
    assert.throws(() => verifyBrowserSummary(path), (error) => ['INVALID_BROWSER_SUMMARY', 'BROWSER_SUMMARY_REJECTED', 'INVALID_PACKET_SCHEMA', 'INVALID_SCHEMA'].includes(error?.code));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('summary creation refuses preexisting leaves and unsafe output artifacts', () => {
  const parent = tempRoot();
  try {
    const journalRoot = join(parent, 'journal');
    const summaryRoot = join(parent, 'summary');
    const outputRoot = join(parent, 'output');
    for (const path of [journalRoot, summaryRoot, outputRoot]) mkdirSync(path, { mode: 0o700 });
    const writer = createJournalWriter(journalRoot);
    writer.append({ record_type: 'browser_run_started', run_id: 'browser-run-local', timestamp: '2026-07-22T15:00:00.000Z' });
    writer.append({ record_type: 'browser_run_completed', run_id: 'browser-run-local', timestamp: '2026-07-22T15:00:01.000Z', status: 'passed', duration_ms: 1000 });
    writer.close();
    const summaryPath = join(summaryRoot, 'browser-summary.json');
    writeFileSync(summaryPath, '', { mode: 0o600 });
    assert.throws(() => importBrowserJournal({ journalPath: writer.journalPath, summaryPath, outputRoot }), hasCode('PREEXISTING_BROWSER_SUMMARY'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
