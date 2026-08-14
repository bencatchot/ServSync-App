import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScheduledBackupObservation } from '../../server/storageBackupObservation.ts';
import type { BackupHealth } from '../../server/storageBackup.ts';

const SOURCE_REF = 'uqgtheclhxqlnjpfmheq';
const health: BackupHealth = {
  healthVersion: 1,
  status: 'healthy',
  sourceProjectRef: SOURCE_REF,
  lastSuccessfulBackupAt: '2026-08-14T04:19:00.000Z',
  lastRunId: 'natural-run',
  manifestKey: 'private-manifest-key',
  manifestSha256: 'a'.repeat(64),
  metrics: {
    bucketCount: 7,
    sourceObjectCount: 4,
    sourceBytes: 5_274_400,
    backedUpObjectCount: 4,
    newObjectVersions: 0,
    unchangedObjectVersions: 4,
    tombstoneCount: 0,
    failedObjectCount: 0,
    r2BytesWritten: 0,
  },
};

test('scheduled observation accepts aggregate health inside an independently evidenced Cron window', () => {
  const result = validateScheduledBackupObservation({
    health,
    expectedSourceProjectRef: SOURCE_REF,
    expectedAfter: '2026-08-14T04:17:00.000Z',
    expectedBefore: '2026-08-14T04:27:00.000Z',
    schedulerInvocationId: 'vercel-cron-invocation-1',
    now: new Date('2026-08-14T05:00:00.000Z'),
  });
  assert.equal(result.runId, 'natural-run');
  assert.equal(result.metrics.backedUpObjectCount, 4);
  assert.equal('manifestKey' in result, false, 'private R2 object keys are not emitted as observation evidence');
});

test('scheduled observation rejects manual-window, identity, completeness, and scheduler-evidence mismatches', () => {
  const base = {
    health,
    expectedSourceProjectRef: SOURCE_REF,
    expectedAfter: '2026-08-14T04:17:00.000Z',
    expectedBefore: '2026-08-14T04:27:00.000Z',
    schedulerInvocationId: 'vercel-cron-invocation-1',
    now: new Date('2026-08-14T05:00:00.000Z'),
  };
  assert.throws(() => validateScheduledBackupObservation({ ...base, schedulerInvocationId: ' ' }), /invocation identifier/);
  assert.throws(() => validateScheduledBackupObservation({ ...base, expectedSourceProjectRef: 'wrong' }), /source identity/);
  assert.throws(() => validateScheduledBackupObservation({ ...base, expectedAfter: '2026-08-14T05:00:00.000Z', expectedBefore: '2026-08-14T05:10:00.000Z' }), /outside/);
  assert.throws(() => validateScheduledBackupObservation({
    ...base,
    health: { ...health, metrics: { ...health.metrics, backedUpObjectCount: 3 } },
  }), /every source object/);
});
