import {
  createMarketingMediaCleanupClient,
  resolveMarketingMediaCleanupConfig,
  runMarketingMediaCleanupWorker,
} from './marketingMediaCleanupWorker.js';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function createMarketingMediaCleanupHandler() {
  return async function handler(request: Request) {
    if (request.method !== 'GET' && request.method !== 'POST') {
      return json({ status: 'failed', reason: 'method_not_allowed' }, 405);
    }
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      return json({ status: 'failed', reason: 'unauthorized' }, 401);
    }
    const config = resolveMarketingMediaCleanupConfig();
    if (!config) return json({ status: 'failed', reason: 'configuration_unavailable' }, 503);
    try {
      const result = await runMarketingMediaCleanupWorker(createMarketingMediaCleanupClient(config));
      return json({ status: 'complete', ...result, projectRef: config.expectedProjectRef });
    } catch {
      console.error(JSON.stringify({ event: 'marketing_media_cleanup_failed', reason: 'worker_unavailable' }));
      return json({ status: 'failed', reason: 'worker_unavailable' }, 503);
    }
  };
}
