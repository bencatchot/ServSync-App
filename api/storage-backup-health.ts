import { readBackupHealth } from '../server/storageBackup.ts';
import { storageBackupConfig } from '../server/storageBackupConfig.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function createStorageBackupHealthHandler(dependencies = {
  configured: storageBackupConfig,
  read: readBackupHealth,
  now: () => new Date(),
}) {
  return async function handler(request: Request) {
    if (request.method !== 'GET') return json({ status: 'failed', reason: 'method_not_allowed' }, 405);
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return json({ status: 'failed', reason: 'unauthorized' }, 401);
    }
    try {
      const config = dependencies.configured();
      const health = await dependencies.read(config.backup, config.sourceProjectRef);
      const ageHours = (dependencies.now().getTime() - Date.parse(health.lastSuccessfulBackupAt)) / 3_600_000;
      const healthy = ageHours <= 36 && health.metrics.failedObjectCount === 0;
      return json({
        status: healthy ? 'healthy' : 'unhealthy',
        sourceProjectRef: health.sourceProjectRef,
        lastSuccessfulBackupAt: health.lastSuccessfulBackupAt,
        lastRunId: health.lastRunId,
        manifestSha256: health.manifestSha256,
        metrics: health.metrics,
        ageHours: Number(ageHours.toFixed(2)),
      }, healthy ? 200 : 503);
    } catch {
      return json({ status: 'unhealthy', reason: 'health_unavailable' }, 503);
    }
  };
}

const handler = createStorageBackupHealthHandler();
export default { fetch: handler };
