#!/usr/bin/env node
import { readBackupHealth } from '../../server/storageBackup.ts';
import { storageBackupConfig } from '../../server/storageBackupConfig.ts';

const config = storageBackupConfig();
const health = await readBackupHealth(config.backup, config.sourceProjectRef);
const ageHours = (Date.now() - Date.parse(health.lastSuccessfulBackupAt)) / 3_600_000;
const healthy = ageHours <= 36 && health.metrics.failedObjectCount === 0;
console.log(JSON.stringify({
  status: healthy ? 'healthy' : 'unhealthy',
  sourceProjectRef: health.sourceProjectRef,
  lastSuccessfulBackupAt: health.lastSuccessfulBackupAt,
  lastRunId: health.lastRunId,
  manifestSha256: health.manifestSha256,
  metrics: health.metrics,
  ageHours: Number(ageHours.toFixed(2)),
}, null, 2));
if (!healthy) process.exitCode = 1;
