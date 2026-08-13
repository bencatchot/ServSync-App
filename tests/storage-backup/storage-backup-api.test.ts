import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageBackupHandler } from '../../api/storage-backup.ts';
import { createStorageBackupHealthHandler } from '../../api/storage-backup-health.ts';
import { storageBackupConfig } from '../../server/storageBackupConfig.ts';

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
            metrics: { bucketCount: 7, sourceObjectCount: 4, sourceBytes: 10, backedUpObjectCount: 4, newObjectVersions: 4, unchangedObjectVersions: 0, tombstoneCount: 0, failedObjectCount: 0, r2BytesWritten: 10 },
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
        metrics: { bucketCount: 7, sourceObjectCount: 4, sourceBytes: 10, backedUpObjectCount: 4, newObjectVersions: 0, unchangedObjectVersions: 4, tombstoneCount: 0, failedObjectCount: 0, r2BytesWritten: 0 },
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

test('backup configuration rejects invalid retention without constructing an operational run', () => {
  const names = [
    'SERVSYNC_STORAGE_BACKUP_SOURCE_PROJECT_REF',
    'SERVSYNC_STORAGE_BACKUP_SOURCE_URL',
    'SERVSYNC_STORAGE_BACKUP_SOURCE_SECRET_KEY',
    'SERVSYNC_STORAGE_BACKUP_R2_ACCOUNT_ID',
    'SERVSYNC_STORAGE_BACKUP_R2_BUCKET',
    'SERVSYNC_STORAGE_BACKUP_R2_ENDPOINT',
    'SERVSYNC_STORAGE_BACKUP_R2_ACCESS_KEY_ID',
    'SERVSYNC_STORAGE_BACKUP_R2_SECRET_ACCESS_KEY',
    'SERVSYNC_STORAGE_BACKUP_RETENTION_DAYS',
  ] as const;
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    SERVSYNC_STORAGE_BACKUP_SOURCE_PROJECT_REF: 'sourceprojectref',
    SERVSYNC_STORAGE_BACKUP_SOURCE_URL: 'https://sourceprojectref.supabase.co',
    SERVSYNC_STORAGE_BACKUP_SOURCE_SECRET_KEY: 'test-secret',
    SERVSYNC_STORAGE_BACKUP_R2_ACCOUNT_ID: 'account-id',
    SERVSYNC_STORAGE_BACKUP_R2_BUCKET: 'backup-bucket',
    SERVSYNC_STORAGE_BACKUP_R2_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    SERVSYNC_STORAGE_BACKUP_R2_ACCESS_KEY_ID: 'test-access',
    SERVSYNC_STORAGE_BACKUP_R2_SECRET_ACCESS_KEY: 'test-secret',
    SERVSYNC_STORAGE_BACKUP_RETENTION_DAYS: 'NaN',
  });
  try {
    assert.throws(storageBackupConfig, /whole number from 1 through 365/);
  } finally {
    for (const name of names) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
