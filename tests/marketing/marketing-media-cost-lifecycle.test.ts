import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketingMediaCleanupHandler } from '../../server/marketingMediaCleanupHttp.ts';
import {
  resolveMarketingMediaCleanupConfig,
  runMarketingMediaCleanupWorker,
} from '../../server/marketingMediaCleanupWorker.ts';
import {
  createMarketingUsageAdapter,
  parseMarketingCostControls,
  parseMarketingUsageSummary,
} from '../../src/features/marketing/marketingUsage.ts';

const workspaceId = '20000000-0000-4000-8000-000000000001';
const contractorId = '30000000-0000-4000-8000-000000000001';
const assetId = '40000000-0000-4000-8000-000000000001';
const claimToken = '50000000-0000-4000-8000-000000000001';

const summaryFixture = {
  workspace: { workspace_id: workspaceId, workspace_kind: 'contractor', display_name: 'Contractor A' },
  entitlements: {
    plan_key: 'free_beta', active_media_slots: 3, monthly_video_generations: 4,
    ready_scheduled_post_limit: 5, max_generated_video_seconds: 75,
    published_media_retention_hours: 72, abandoned_media_expiration_days: 30,
    generation_enabled: true, usage_period: 'rolling_30_days',
  },
  usage: {
    video_generations_rolling_30_days: 2, active_media_slots: 1,
    active_media_bytes: 2048, ready_scheduled_posts: 3,
  },
  generation: { enabled: true, global_budget_configured: true, global_warning: false, global_hard_stop: false },
  recent_media: [{
    asset_id: assetId, asset_type: 'video', source: 'marketing_upload', state: 'uploaded',
    mime_type: 'video/mp4', file_size_bytes: 2048, poster_path: `${workspaceId}/${assetId}/poster.jpg`, purged_at: null,
  }],
};

test('quota summary exposes contractor-safe usage without platform cost details', () => {
  const parsed = parseMarketingUsageSummary(summaryFixture);
  assert.equal(parsed.entitlements.monthlyVideoGenerations, 4);
  assert.equal(parsed.usage.activeMediaSlots, 1);
  assert.equal(parsed.recentMedia[0].posterPath, `${workspaceId}/${assetId}/poster.jpg`);
  assert.equal(JSON.stringify(parsed).includes('monthlyBudget'), false);
});

test('cost controls preserve configured, disabled, and unconfigured states', () => {
  const parsed = parseMarketingCostControls({
    generation_enabled: false,
    monthly_budget_microusd: null,
    warning_percent: 80,
    hard_stop_percent: 100,
    current_spend_microusd: 1200,
    stop_reason: 'Owner paused Marketing generation.',
    updated_at: '2026-08-17T12:00:00.000Z',
  });
  assert.equal(parsed.generationEnabled, false);
  assert.equal(parsed.monthlyBudgetMicrousd, null);
  assert.equal(parsed.currentSpendMicrousd, 1200);
});

test('usage adapter always passes contractor context to the canonical server resolver', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const adapter = createMarketingUsageAdapter({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: name === 'servsync_get_marketing_usage_summary' ? summaryFixture : {}, error: null };
    },
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), remove: async () => ({ data: null, error: null }) }) },
  }, contractorId);
  await adapter.getSummary();
  assert.deepEqual(calls, [
    { name: 'servsync_ensure_contractor_marketing_workspace', args: { p_contractor_id: contractorId } },
    { name: 'servsync_get_marketing_usage_summary', args: { p_contractor_id: contractorId } },
  ]);
});

test('cleanup configuration fails closed on missing or mismatched project identity', () => {
  assert.equal(resolveMarketingMediaCleanupConfig({}), null);
  assert.equal(resolveMarketingMediaCleanupConfig({
    SUPABASE_URL: 'https://uqgtheclhxqlnjpfmheq.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture',
    SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF: 'zpzdkoaubyjtsomccxya',
  }), null);
  assert.equal(resolveMarketingMediaCleanupConfig({
    SUPABASE_URL: 'https://zpzdkoaubyjtsomccxya.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture',
    SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF: 'zpzdkoaubyjtsomccxya',
  })?.expectedProjectRef, 'zpzdkoaubyjtsomccxya');
});

test('cleanup worker removes only the exact claimed object and then completes the claim', async () => {
  const calls: string[] = [];
  const removed: string[][] = [];
  const client = {
    rpc: async (name: string) => {
      calls.push(name);
      if (name === 'servsync_claim_marketing_media_purges') return { data: [{
        asset_id: assetId,
        claim_token: claimToken,
        storage_bucket: 'marketing-assets',
        storage_path: `${workspaceId}/${assetId}/media.mp4`,
      }], error: null };
      return { data: null, error: null };
    },
    storage: { from: (bucket: string) => ({
      remove: async (paths: string[]) => { assert.equal(bucket, 'marketing-assets'); removed.push(paths); return { data: null, error: null }; },
    }) },
  };
  assert.deepEqual(await runMarketingMediaCleanupWorker(client as never), { claimed: 1, purged: 1, failed: 0 });
  assert.deepEqual(removed, [[`${workspaceId}/${assetId}/media.mp4`]]);
  assert.deepEqual(calls, [
    'servsync_claim_marketing_media_purges',
    'servsync_claim_abandoned_marketing_upload_purges',
    'servsync_complete_marketing_media_purge',
  ]);
});

test('invalid cleanup claim fails without a storage deletion and is returned to retry state', async () => {
  const calls: string[] = [];
  let removes = 0;
  const client = {
    rpc: async (name: string) => {
      calls.push(name);
      if (name === 'servsync_claim_marketing_media_purges') return { data: [{
        asset_id: assetId, claim_token: claimToken, storage_bucket: 'wrong-bucket', storage_path: '../workspace',
      }], error: null };
      return { data: null, error: null };
    },
    storage: { from: () => ({ remove: async () => { removes += 1; return { data: null, error: null }; } }) },
  };
  assert.deepEqual(await runMarketingMediaCleanupWorker(client as never), { claimed: 1, purged: 0, failed: 1 });
  assert.equal(removes, 0);
  assert.deepEqual(calls, [
    'servsync_claim_marketing_media_purges',
    'servsync_claim_abandoned_marketing_upload_purges',
    'servsync_fail_marketing_media_purge',
  ]);
});

test('cleanup worker removes both exact abandoned upload objects before completing intake cleanup', async () => {
  const intakeId = '60000000-0000-4000-8000-000000000001';
  const calls: string[] = [];
  const removed: string[][] = [];
  const client = {
    rpc: async (name: string) => {
      calls.push(name);
      if (name === 'servsync_claim_marketing_media_purges') return { data: [], error: null };
      if (name === 'servsync_claim_abandoned_marketing_upload_purges') return { data: [{
        intake_id: intakeId,
        claim_token: claimToken,
        source_bucket: 'marketing-assets',
        source_path: `${workspaceId}/${intakeId}/media.mp4`,
        poster_bucket: 'marketing-assets',
        poster_path: `${workspaceId}/${intakeId}/poster.jpg`,
      }], error: null };
      return { data: null, error: null };
    },
    storage: { from: (bucket: string) => ({
      remove: async (paths: string[]) => { assert.equal(bucket, 'marketing-assets'); removed.push(paths); return { data: null, error: null }; },
    }) },
  };
  assert.deepEqual(await runMarketingMediaCleanupWorker(client as never), { claimed: 1, purged: 1, failed: 0 });
  assert.deepEqual(removed, [[
    `${workspaceId}/${intakeId}/media.mp4`,
    `${workspaceId}/${intakeId}/poster.jpg`,
  ]]);
  assert.deepEqual(calls, [
    'servsync_claim_marketing_media_purges',
    'servsync_claim_abandoned_marketing_upload_purges',
    'servsync_complete_abandoned_marketing_upload_purge',
  ]);
});

test('cleanup HTTP boundary requires the existing Cron bearer secret', async () => {
  const before = { ...process.env };
  process.env.CRON_SECRET = 'fixture-cron-secret';
  delete process.env.SUPABASE_URL;
  try {
    const handler = createMarketingMediaCleanupHandler();
    assert.equal((await handler(new Request('https://servsync.app/api/marketing-media-cleanup'))).status, 401);
    const response = await handler(new Request('https://servsync.app/api/marketing-media-cleanup', {
      headers: { authorization: 'Bearer fixture-cron-secret' },
    }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'failed', reason: 'configuration_unavailable' });
  } finally {
    if (before.CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before.CRON_SECRET;
    if (before.SUPABASE_URL === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = before.SUPABASE_URL;
  }
});
