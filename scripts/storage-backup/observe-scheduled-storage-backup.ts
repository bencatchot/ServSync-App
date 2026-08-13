#!/usr/bin/env node
import { readBackupHealth } from '../../server/storageBackup.ts';
import { storageBackupConfig } from '../../server/storageBackupConfig.ts';
import { validateScheduledBackupObservation } from '../../server/storageBackupObservation.ts';

function argument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : '';
  if (!value) throw new Error(`Required argument ${name} is unavailable.`);
  return value;
}

const config = storageBackupConfig();
const health = await readBackupHealth(config.backup, config.sourceProjectRef);
const observation = validateScheduledBackupObservation({
  health,
  expectedSourceProjectRef: config.sourceProjectRef,
  expectedAfter: argument('--expected-after'),
  expectedBefore: argument('--expected-before'),
  schedulerInvocationId: argument('--vercel-invocation-id'),
});

console.log(JSON.stringify({ status: 'scheduled_backup_observed', ...observation }, null, 2));
