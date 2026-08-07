#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatRolloutStatus, readJson } from './lib.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const ledgerPath = join(scriptDirectory, '..', '..', 'config', 'backend-environment-rollouts.json');

try {
  const ledger = await readJson(ledgerPath);
  console.log(`Backend rollout status (updated ${ledger.updatedOn})\n`);
  console.log(formatRolloutStatus(ledger));
  console.log('\nReasons');
  for (const foundation of ledger.foundations) {
    console.log(`\n${foundation.id} — ${foundation.artifact}`);
    for (const environment of ['sandbox', 'production', 'demo']) {
      const state = foundation.environments[environment];
      console.log(`- ${environment}: ${state.status} — ${state.reason}`);
    }
  }
} catch (error) {
  console.error(`Backend rollout status failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
