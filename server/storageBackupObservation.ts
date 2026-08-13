import type { BackupHealth } from './storageBackup.js';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type ScheduledBackupObservation = {
  schedulerInvocationId: string;
  runId: string;
  completedAt: string;
  sourceProjectRef: string;
  manifestSha256: string;
  metrics: BackupHealth['metrics'];
  ageHours: number;
};

export function validateScheduledBackupObservation(options: {
  health: BackupHealth;
  expectedSourceProjectRef: string;
  expectedAfter: string;
  expectedBefore: string;
  schedulerInvocationId: string;
  now?: Date;
  staleAfterHours?: number;
}): ScheduledBackupObservation {
  const after = Date.parse(options.expectedAfter);
  const before = Date.parse(options.expectedBefore);
  const completedAt = Date.parse(options.health.lastSuccessfulBackupAt);
  if (![after, before, completedAt].every(Number.isFinite) || before <= after) {
    throw new Error('Scheduled backup observation window is invalid.');
  }
  if (!options.schedulerInvocationId.trim()) {
    throw new Error('A Vercel Cron invocation identifier is required as independent scheduler evidence.');
  }
  if (options.health.sourceProjectRef !== options.expectedSourceProjectRef) {
    throw new Error('Scheduled backup source identity does not match Production.');
  }
  if (completedAt < after || completedAt > before) {
    throw new Error('Latest successful backup is outside the expected natural Cron window.');
  }
  if (!SHA256_PATTERN.test(options.health.manifestSha256)) {
    throw new Error('Scheduled backup manifest SHA-256 is invalid.');
  }
  if (options.health.metrics.failedObjectCount !== 0) {
    throw new Error('Scheduled backup reported object failures.');
  }
  if (options.health.metrics.backedUpObjectCount !== options.health.metrics.sourceObjectCount) {
    throw new Error('Scheduled backup did not account for every source object.');
  }
  const now = options.now ?? new Date();
  const ageHours = (now.getTime() - completedAt) / 3_600_000;
  if (ageHours < 0 || ageHours > (options.staleAfterHours ?? 36)) {
    throw new Error('Scheduled backup health is stale or dated in the future.');
  }
  return {
    schedulerInvocationId: options.schedulerInvocationId.trim(),
    runId: options.health.lastRunId,
    completedAt: options.health.lastSuccessfulBackupAt,
    sourceProjectRef: options.health.sourceProjectRef,
    manifestSha256: options.health.manifestSha256,
    metrics: options.health.metrics,
    ageHours: Number(ageHours.toFixed(2)),
  };
}
