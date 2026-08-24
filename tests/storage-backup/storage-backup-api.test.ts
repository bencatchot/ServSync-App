import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageBackupHandler, createStorageBackupHealthHandler } from '../../server/storageBackupHttp.ts';
import { parseStorageBackupRetention, requiredStorageBackupConfig } from '../../server/storageBackupConfigContract.ts';

test('backup endpoint requires the Cron bearer secret and returns only aggregate evidence', async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  try {
    const handler = createStorageBackupHandler({
      configured: () => ({ source: {}, backup: {}, sourceProjectRef: 'source', accountId: 'account', bucket: 'bucket', retentionRuns: 90 }) as never,
      run: async () => ({
        envelope: {
          manifestSha256: 'hash',
          manifest: {
            runId: 'run', completedAt: '2026-08-13T00:00:00.000Z', sourceProjectRef: 'source',
            metrics: { bucketCount: 9, sourceObjectCount: 4, sourceBytes: 10, backedUpObjectCount: 4, newObjectVersions: 4, unchangedObjectVersions: 0, tombstoneCount: 0, failedObjectCount: 0, r2BytesWritten: 10 },
          },
        },
        retention: { expiredManifests: 0, expiredObjects: 0 },
      }) as never,
    });
    assert.equal((await handler(new Request('https://servsync.app/api/storage-backup'))).status, 401);
    const response = await handler(new Request('https://servsync.app/api/storage-backup', { headers: { Authorization: 'Bearer test-cron-secret' } }));
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.status, 'complete');
    assert.equal(JSON.stringify(body).includes('object path'), false);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});

test('health endpoint treats backups older than 36 hours as unhealthy', async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  try {
    const handler = createStorageBackupHealthHandler({
      configured: () => ({ backup: {}, sourceProjectRef: 'source' }) as never,
      read: async () => ({
        sourceProjectRef: 'source', status: 'healthy', healthVersion: 1, lastRunId: 'run', manifestKey: 'manifest', manifestSha256: 'hash',
        lastSuccessfulBackupAt: '2026-08-10T00:00:00.000Z',
        metrics: { bucketCount: 9, sourceObjectCount: 4, sourceBytes: 10, backedUpObjectCount: 4, newObjectVersions: 0, unchangedObjectVersions: 4, tombstoneCount: 0, failedObjectCount: 0, r2BytesWritten: 0 },
      }),
      now: () => new Date('2026-08-13T00:00:00.000Z'),
    });
    const response = await handler(new Request('https://servsync.app/api/storage-backup-health', { headers: { Authorization: 'Bearer test-cron-secret' } }));
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { status: string }).status, 'unhealthy');
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});

test('health endpoint accepts the narrow observer token without granting backup execution', async () => {
  const originalCron = process.env.CRON_SECRET;
  const originalHealth = process.env.SERVSYNC_STORAGE_BACKUP_HEALTH_TOKEN;
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.SERVSYNC_STORAGE_BACKUP_HEALTH_TOKEN = 'test-health-secret';
  try {
    const healthHandler = createStorageBackupHealthHandler({
      configured: () => ({ backup: {}, sourceProjectRef: 'source' }) as never,
      read: async () => ({
        sourceProjectRef: 'source', status: 'healthy', healthVersion: 1, lastRunId: 'run', manifestKey: 'manifest', manifestSha256: 'a'.repeat(64),
        lastSuccessfulBackupAt: '2026-08-13T00:00:00.000Z',
        metrics: { bucketCount: 9, sourceObjectCount: 4, sourceBytes: 10, backedUpObjectCount: 4, newObjectVersions: 0, unchangedObjectVersions: 4, tombstoneCount: 0, failedObjectCount: 0, r2BytesWritten: 0 },
      }),
      now: () => new Date('2026-08-13T01:00:00.000Z'),
    });
    const backupHandler = createStorageBackupHandler({
      configured: () => ({ source: {}, backup: {}, sourceProjectRef: 'source', accountId: 'account', bucket: 'bucket', retentionRuns: 90 }) as never,
      run: async () => { throw new Error('must not run'); },
    });
    const headers = { Authorization: 'Bearer test-health-secret' };
    assert.equal((await healthHandler(new Request('https://servsync.app/api/storage-backup-health', { headers }))).status, 200);
    assert.equal((await backupHandler(new Request('https://servsync.app/api/storage-backup', { headers }))).status, 401);
  } finally {
    if (originalCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCron;
    if (originalHealth === undefined) delete process.env.SERVSYNC_STORAGE_BACKUP_HEALTH_TOKEN;
    else process.env.SERVSYNC_STORAGE_BACKUP_HEALTH_TOKEN = originalHealth;
  }
});

test('backup configuration rejects invalid retention before constructing an operational run', () => {
  assert.throws(() => parseStorageBackupRetention('NaN'), /whole number from 1 through 365/);
  assert.throws(() => parseStorageBackupRetention('90.5'), /whole number from 1 through 365/);
  assert.equal(parseStorageBackupRetention('90'), 90);
});

test('backup configuration fails closed when an R2 credential is missing', () => {
  assert.throws(
    () => requiredStorageBackupConfig('SERVSYNC_STORAGE_BACKUP_R2_ACCESS_KEY_ID', {}),
    /R2_ACCESS_KEY_ID is unavailable/,
  );
  assert.equal(requiredStorageBackupConfig('KEY', { KEY: ' value ' }), 'value');
});
