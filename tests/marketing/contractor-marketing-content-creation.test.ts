import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createMarketingCreationAdapter } from '../../src/features/marketing/marketingCreation.ts';
import { isContractorMarketingUiEnabled } from '../../src/features/marketing/contractorMarketingAvailability.ts';

const contractorId = '20000000-0000-4000-8000-000000000001';
const contentId = '50000000-0000-4000-8000-000000000001';

function client(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const value = {
    calls,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'servsync_get_marketing_creation_context') return { data: {
        workspace_id: '30000000-0000-4000-8000-000000000001',
        profile: {
          profile_id: '40000000-0000-4000-8000-000000000001', profile_version: 1,
          marketing_name: 'Clear Pipe Plumbing', business_summary: 'Local residential plumbing service.',
          service_focus: ['Plumbing'], tone_style: 'Plainspoken and practical.', generation_ready: true,
        },
        product_media: [{
          asset_id: '81000000-0000-4000-8000-000000000001', label: 'Homeowner Home History',
          asset_type: 'video', media_variant: 'silent_product_demo_master', duration_seconds: 29.24,
        }],
        jobs: [{
          job_id: '60000000-0000-4000-8000-000000000001', title: 'Kitchen repair', summary: 'Replaced a shutoff valve.',
          status: 'completed', completed_at: '2026-08-18T00:00:00Z',
          work_items: [{ title: 'Replace valve', customer_description: 'Replaced the worn valve.' }],
          media: [{ path: `${contractorId}/jobs/photo.jpg`, mime_type: 'image/jpeg', file_size_bytes: 32 }],
        }],
      }, error: null };
      return { data: {}, error: null };
    },
    functions: { invoke: async (name: string, options: { body: Record<string, unknown> }) => {
      calls.push({ name, args: options.body });
      return { data: { contentId, status: 'draft', replayed: false }, error: null };
    } },
    storage: { from: () => ({
      download: async () => ({ data: null, error: new Error('not used') }),
      upload: async () => ({ data: null, error: null }),
      remove: async () => ({ data: null, error: null }),
    }) },
    ...overrides,
  };
  return value;
}

test('creation context exposes only the normalized business and completed-work shape', async () => {
  const api = client();
  const context = await createMarketingCreationAdapter(api, contractorId).context();
  assert.equal(context.profile?.name, 'Clear Pipe Plumbing');
  assert.equal(context.productMedia[0]?.label, 'Homeowner Home History');
  assert.equal(context.jobs[0]?.workItems[0]?.customerDescription, 'Replaced the worn valve.');
  assert.deepEqual(Object.keys(context.jobs[0] ?? {}).sort(), ['completedAt', 'id', 'media', 'status', 'summary', 'title', 'workItems']);
  assert.deepEqual(api.calls[0], { name: 'servsync_get_marketing_creation_context', args: { p_contractor_id: contractorId } });
});

test('internal product-media draft keeps canonical asset identity under the shared request', async () => {
  const api = client();
  await createMarketingCreationAdapter(api, null).generate({
    sourceKind: 'managed_asset', jobId: null, assetId: '81000000-0000-4000-8000-000000000001',
    brief: 'Show how a homeowner can reopen a finalized report in Home History.',
  });
  const call = api.calls.find(item => item.name === 'marketing-content-draft');
  assert.equal(call?.args.contractorId, null);
  assert.equal(call?.args.sourceKind, 'managed_asset');
  assert.equal(call?.args.sourceAssetId, '81000000-0000-4000-8000-000000000001');
});

test('simple post invokes one purpose-built function with no media or Job identity', async () => {
  const api = client();
  const result = await createMarketingCreationAdapter(api, contractorId).generate({
    sourceKind: 'simple', jobId: null, assetId: null, brief: 'Explain our spring maintenance availability.',
  });
  assert.equal(result, contentId);
  const call = api.calls.find(item => item.name === 'marketing-content-draft');
  assert.equal(call?.args.contractorId, contractorId);
  assert.equal(call?.args.sourceKind, 'simple');
  assert.equal(call?.args.sourceJobId, null);
  assert.equal(call?.args.sourceAssetId, null);
  assert.match(String(call?.args.clientRequestId), /^[0-9a-f-]{36}$/);
});

test('function errors remain friendly and do not expose provider payloads', async () => {
  const api = client({ functions: { invoke: async () => ({ data: null, error: { message: 'Marketing drafting is temporarily paused.' } }) } });
  await assert.rejects(
    createMarketingCreationAdapter(api, contractorId).generate({ sourceKind: 'simple', jobId: null, assetId: null, brief: 'A short post.' }),
    /temporarily paused/,
  );
});

test('runtime function uses structured output, durable claim RPCs, and no media generation provider', async () => {
  const source = await readFile(new URL('../../supabase/functions/marketing-content-draft/index.ts', import.meta.url), 'utf8');
  assert.match(source, /servsync_reserve_marketing_content_creation/);
  assert.match(source, /servsync_claim_marketing_content_creation/);
  assert.match(source, /servsync_complete_marketing_content_creation/);
  assert.match(source, /type: 'json_schema'/);
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.doesNotMatch(source, /sora|images\/generations|audio\/speech/i);
  assert.doesNotMatch(source, /details:\s*openAi|openAiJson/);
  assert.match(source, /friendlyError\(error, providerStarted\)/);
  assert.doesNotMatch(source, /return\s+error\.message|error:\s*error\.message/);
});

test('migration keeps text generation outside the video quota and public-post path', async () => {
  const migration = await readFile(new URL('../../servsync-contractor-marketing-content-creation.sql', import.meta.url), 'utf8');
  assert.match(migration, /'ai_text_generation',false/);
  assert.doesNotMatch(migration, /update public\.marketing_publishing_controls/);
  assert.doesNotMatch(migration, /servsync_authorize_marketing_publication/);
  assert.match(migration, /job_media_derivative/);
  assert.doesNotMatch(migration, /item\.internal_notes|job\.customer|job\.address|unit_price_cents/);
});

test('FB-037I migration adds only bounded internal managed-media context and usage evidence', async () => {
  const migration = await readFile(new URL('../../servsync-admin-marketing-dogfood.sql', import.meta.url), 'utf8');
  assert.match(migration, /^--[\s\S]*\nbegin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /'managed_asset'/);
  assert.match(migration, /p_contractor_id is not null[\s\S]*ServSync product media is internal-only/);
  assert.match(migration, /asset\.source='demo_recorder'/);
  assert.match(migration, /asset\.sensitive_data_check='passed'/);
  assert.match(migration, /ai_text_drafts_rolling_30_days/);
  assert.match(migration, /recent_text_draft/);
  assert.doesNotMatch(migration, /update public\.marketing_publishing_controls/);
  assert.doesNotMatch(migration, /insert into public\.marketing_publications/);
});

test('contractor Marketing discovery remains default-off and requires an exact rollout flag', async () => {
  assert.equal(isContractorMarketingUiEnabled({}), false);
  assert.equal(isContractorMarketingUiEnabled({ VITE_CONTRACTOR_MARKETING_UI_ENABLED: 'false' }), false);
  assert.equal(isContractorMarketingUiEnabled({ VITE_CONTRACTOR_MARKETING_UI_ENABLED: 'TRUE' }), false);
  assert.equal(isContractorMarketingUiEnabled({ VITE_CONTRACTOR_MARKETING_UI_ENABLED: 'true' }), true);
  const app = await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /CONTRACTOR_MARKETING_UI_ENABLED &&/);
});

test('shared Create post UI exposes the three bounded paths without a publishing action', async () => {
  const source = await readFile(new URL('../../src/features/marketing/MarketingCreatePost.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../../src/features/marketing/MarketingWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /label="From a Job"/);
  assert.match(source, /label="Upload media"/);
  assert.match(source, /label="Simple post"/);
  assert.match(source, /label="ServSync product media"/);
  assert.match(source, /I have permission to use this media for Marketing\./);
  assert.match(source, /busyRef\.current/);
  assert.match(source, /marketing-create-usage/);
  assert.match(source, /sm:grid-cols-3/);
  assert.doesNotMatch(source, />Publish(?: now)?</i);
  assert.match(workspace, /createdContentId, status: 'draft'/);
  assert.doesNotMatch(workspace, /setPreviewContentId\(id\)/);
});
