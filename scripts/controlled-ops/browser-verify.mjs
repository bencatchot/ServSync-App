#!/usr/bin/env node

import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify, EvidenceError, safeError } from './internal.mjs';
import { verifyBrowserSummary } from './browser-importer.mjs';

function parseOptions(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new EvidenceError('INVALID_ARGUMENTS', 'Browser verifier arguments are invalid.');
    options[key.slice(2)] = value;
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (!options.summary) throw new EvidenceError('INVALID_ARGUMENTS', '--summary is required.');
    const summary = verifyBrowserSummary(options.summary, { sourceJournalPath: options.journal ?? null });
    process.stdout.write(`${canonicalStringify({
      journal_recomputed: Boolean(options.journal),
      run_status: summary.status,
      status: 'verified',
      tests: summary.counts.started,
    })}\n`);
  } catch (error) {
    const safe = safeError(error);
    process.stderr.write(`${basename(process.argv[1])}: ${safe.code}: ${safe.message}\n`);
    process.exitCode = 90;
  }
}
