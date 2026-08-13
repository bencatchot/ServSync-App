#!/usr/bin/env node
import { runStorageBackup } from '../../server/storageBackup.ts';
import { storageBackupConfig } from '../../server/storageBackupConfig.ts';

const config = storageBackupConfig();
const result = await runStorageBackup({
  source: config.source,
  backup: config.backup,
  expectedSourceProjectRef: config.sourceProjectRef,
  expectedBackupAccountId: config.accountId,
  expectedBackupBucket: config.bucket,
  retainRuns: config.retentionRuns,
});
console.log(JSON.stringify({
  status: 'complete',
  runId: result.envelope.manifest.runId,
  completedAt: result.envelope.manifest.completedAt,
  sourceProjectRef: result.envelope.manifest.sourceProjectRef,
  metrics: result.envelope.manifest.metrics,
  manifestSha256: result.envelope.manifestSha256,
  retention: result.retention,
}, null, 2));
