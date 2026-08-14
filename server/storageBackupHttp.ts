type BackupHandlerDependencies = {
  configured: () => {
    source: unknown;
    backup: unknown;
    sourceProjectRef: string;
    accountId: string;
    bucket: string;
    retentionRuns: number;
  };
  run: (options: any) => Promise<any>;
};

type HealthHandlerDependencies = {
  configured: () => { backup: unknown; sourceProjectRef: string };
  read: (backup: any, sourceProjectRef: string) => Promise<any>;
  now: () => Date;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function authorized(request: Request, secretNames: string[]) {
  const authorization = request.headers.get('authorization');
  return secretNames.some(name => {
    const secret = process.env[name]?.trim();
    return Boolean(secret && authorization === `Bearer ${secret}`);
  });
}

export function createStorageBackupHandler(dependencies: BackupHandlerDependencies) {
  return async function handler(request: Request) {
    if (request.method !== 'GET' && request.method !== 'POST') return json({ status: 'failed', reason: 'method_not_allowed' }, 405);
    if (!authorized(request, ['CRON_SECRET'])) return json({ status: 'failed', reason: 'unauthorized' }, 401);
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
      console.error(JSON.stringify({ event: 'storage_backup_failed', status: 'failed', occurredAt: new Date().toISOString(), reason: 'backup_unavailable' }));
      return json({ status: 'failed', reason: 'backup_unavailable' }, 503);
    }
  };
}

export function createStorageBackupHealthHandler(dependencies: HealthHandlerDependencies) {
  return async function handler(request: Request) {
    if (request.method !== 'GET') return json({ status: 'failed', reason: 'method_not_allowed' }, 405);
    if (!authorized(request, ['CRON_SECRET', 'SERVSYNC_STORAGE_BACKUP_HEALTH_TOKEN'])) {
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
