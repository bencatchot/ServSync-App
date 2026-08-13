import { runStorageBackup } from '../server/storageBackup.ts';
import { storageBackupConfig } from '../server/storageBackupConfig.ts';

export const maxDuration = 300;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function authorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  return Boolean(cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`);
}

export function createStorageBackupHandler(dependencies = {
  configured: storageBackupConfig,
  run: runStorageBackup,
}) {
  return async function handler(request: Request) {
    if (request.method !== 'GET' && request.method !== 'POST') return json({ status: 'failed', reason: 'method_not_allowed' }, 405);
    if (!authorized(request)) return json({ status: 'failed', reason: 'unauthorized' }, 401);
    try {
      const config = dependencies.configured();
      const result = await dependencies.run({
        source: config.source,
        backup: config.backup,
        expectedSourceProjectRef: config.sourceProjectRef,
        expectedBackupAccountId: config.accountId,
        expectedBackupBucket: config.bucket,
        retainRuns: config.retentionRuns,
      });
      return json({
        status: 'complete',
        runId: result.envelope.manifest.runId,
        completedAt: result.envelope.manifest.completedAt,
        sourceProjectRef: result.envelope.manifest.sourceProjectRef,
        metrics: result.envelope.manifest.metrics,
        manifestSha256: result.envelope.manifestSha256,
        retention: result.retention,
      });
    } catch {
      console.error(JSON.stringify({
        event: 'storage_backup_failed',
        status: 'failed',
        occurredAt: new Date().toISOString(),
        reason: 'backup_unavailable',
      }));
      return json({ status: 'failed', reason: 'backup_unavailable' }, 503);
    }
  };
}

const handler = createStorageBackupHandler();
export default { fetch: handler };
