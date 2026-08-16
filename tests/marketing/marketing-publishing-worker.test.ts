import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketingPublishingHandler } from '../../server/marketingPublishingHttp.ts';
import {
  createFacebookPublishingAdapter,
  marketingPublishingProviders,
  sanitizeProviderFailure,
} from '../../server/marketingPublishingProviders.ts';
import { resolveMarketingPublishingConfig, runMarketingPublishingWorker } from '../../server/marketingPublishingWorker.ts';
import { FacebookProviderError } from '../../server/facebookMarketingConnection.ts';

test('provider capabilities remain distinct and every provider is truthfully unconnected', () => {
  assert.deepEqual(marketingPublishingProviders.facebook.capabilities, { text: true, media: false });
  assert.deepEqual(marketingPublishingProviders.instagram.capabilities, { text: false, media: true });
  assert.deepEqual(marketingPublishingProviders.tiktok.capabilities, { text: false, media: true });
  for (const adapter of Object.values(marketingPublishingProviders)) {
    assert.equal(adapter.getConnectionReadiness().status, 'setup_required');
  }
});

test('worker configuration fails closed on missing or mismatched project identity', () => {
  assert.equal(resolveMarketingPublishingConfig({}), null);
  assert.equal(resolveMarketingPublishingConfig({
    SUPABASE_URL: 'https://uqgtheclhxqlnjpfmheq.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF: 'zpzdkoaubyjtsomccxya',
  }), null);
  assert.deepEqual(resolveMarketingPublishingConfig({
    SUPABASE_URL: 'https://zpzdkoaubyjtsomccxya.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF: 'zpzdkoaubyjtsomccxya',
  }), {
    supabaseUrl: 'https://zpzdkoaubyjtsomccxya.supabase.co',
    serviceRoleKey: 'test-service-role',
    expectedProjectRef: 'zpzdkoaubyjtsomccxya',
  });
});

test('unconnected provider claim fails safely without beginning an external request', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'servsync_claim_due_marketing_publications') return { data: [{
        publication_id: '61000000-0000-4000-8000-000000000001',
        attempt_number: 1,
        provider: 'facebook',
        provider_connection_id: '61000000-0000-4000-8000-000000000002',
        destination_key: 'page',
        content_snapshot: { title: 'Approved', body: 'Approved copy.', content_type: 'social_post' },
      }], error: null };
      return { data: null, error: null };
    },
  };
  const result = await runMarketingPublishingWorker(client as never);
  assert.deepEqual(result, { claimed: 1, published: 0, failed: 1 });
  assert.deepEqual(calls.map(call => call.name), [
    'servsync_claim_due_marketing_publications',
    'servsync_fail_marketing_publication',
  ]);
  assert.equal(calls[1].args.p_retry_eligible, false);
  assert.equal(JSON.stringify(calls).includes('token'), false);
});

test('Facebook managed video fails closed before token access or provider request', () => {
  let tokenReads = 0;
  let providerRequests = 0;
  const adapter = createFacebookPublishingAdapter({
    config: {
      appId: '1234567890', appSecret: 'test-secret', graphApiVersion: 'v26.0',
      oauthRedirectUri: 'https://servsync.app/api/marketing-facebook-oauth-callback',
      loginConfigurationId: '9876543210', expectedProjectRef: 'uqgtheclhxqlnjpfmheq', publicPostsEnabled: true,
    },
    getPageToken: async () => { tokenReads += 1; return 'test-page-token'; },
    fetcher: async () => { providerRequests += 1; return new Response('{}'); },
  });
  const failure = adapter.validatePublication({
    publication_id: '61000000-0000-4000-8000-000000000010', attempt_number: 1, provider: 'facebook',
    provider_connection_id: '61000000-0000-4000-8000-000000000011', destination_key: '1122334455667788',
    content_snapshot: { title: 'Flagship', body: 'Exact approved public copy.', content_type: 'social_post' },
    media_pairing_id: '61000000-0000-4000-8000-000000000012',
    media_snapshot: {
      pairing_id: '61000000-0000-4000-8000-000000000012',
      asset_id: '61000000-0000-4000-8000-000000000013', storage_bucket: 'marketing-assets',
      storage_path: 'workspace/asset/flagship.mp4', mime_type: 'video/mp4', sha256: 'a'.repeat(64),
      media_variant: 'narrated_marketing_derivative',
    },
  });
  assert.deepEqual(failure, {
    category: 'unsupported', message: 'Facebook managed-video publishing is not enabled in this release.',
    retryEligible: false, requestStarted: false,
  });
  assert.equal(tokenReads, 0);
  assert.equal(providerRequests, 0);
});

test('uncertain network result disables automatic retry to prevent duplicate public posts', () => {
  assert.deepEqual(sanitizeProviderFailure(new Error('network timeout')), {
    category: 'provider_uncertain',
    message: 'The provider result could not be confirmed. Automatic retry is disabled to prevent a duplicate post.',
    retryEligible: false,
    requestStarted: true,
  });
});

test('sanitized Facebook failures preserve bounded provider classification', () => {
  assert.deepEqual(sanitizeProviderFailure(new FacebookProviderError(
    'provider_permission', 'Facebook rejected the publication request.', false, true,
  )), {
    category: 'provider_permission',
    message: 'Facebook rejected the publication request.',
    retryEligible: false,
    requestStarted: true,
  });
});

test('worker endpoint requires Cron auth and exact environment configuration', async () => {
  const saved = { ...process.env };
  try {
    process.env.CRON_SECRET = 'test-secret';
    delete process.env.SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF;
    const handler = createMarketingPublishingHandler();
    assert.equal((await handler(new Request('https://servsync.app/api/marketing-publications-worker'))).status, 401);
    const response = await handler(new Request('https://servsync.app/api/marketing-publications-worker', { headers: { Authorization: 'Bearer test-secret' } }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'failed', reason: 'configuration_unavailable' });
  } finally {
    process.env = saved;
  }
});
