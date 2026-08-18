import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketingPublishingHandler } from '../../server/marketingPublishingHttp.ts';
import {
  createFacebookPublishingAdapter,
  marketingPublishingProviders,
  sanitizeProviderFailure,
  type PublicationClaim,
} from '../../server/marketingPublishingProviders.ts';
import { resolveMarketingPublishingConfig, runMarketingPublishingWorker } from '../../server/marketingPublishingWorker.ts';
import { FacebookProviderError, type FacebookMarketingConfig } from '../../server/facebookMarketingConnection.ts';
import { publicMessageForProvider } from '../../src/features/marketing/marketingPublicationPreview.ts';

const config: FacebookMarketingConfig = {
  appId: '123456789012345',
  appSecret: 'test-app-secret-abcdefghijklmnopqrstuvwxyz',
  loginConfigurationId: '987654321098765',
  graphApiVersion: 'v26.0',
  callbackUrl: 'https://servsync.app/api/marketing-facebook-oauth-callback',
  publicPostsEnabled: true,
};
const workspaceId = '00000000-0000-4000-8000-000000000037';
const publicationId = '61000000-0000-4000-8000-000000000010';
const connectionId = '61000000-0000-4000-8000-000000000011';
const pairingId = '61000000-0000-4000-8000-000000000012';
const assetId = '61000000-0000-4000-8000-000000000013';
const videoId = '4455667788990011';
const pageId = '1199023349954773';
const disclosure = "AI-generated voiceover using OpenAI's Cedar voice.";
const message = `Exact approved public copy.\n\n${disclosure}`;
const videoBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
const videoSha = createHash('sha256').update(videoBytes).digest('hex');

function claim(overrides: Partial<PublicationClaim> = {}): PublicationClaim {
  return {
    publication_id: publicationId,
    attempt_number: 1,
    operation: 'publish',
    provider: 'facebook',
    provider_connection_id: connectionId,
    destination_key: pageId,
    content_revision: 9,
    content_snapshot: { title: 'Flagship', body: message, content_type: 'social_post', content_revision: 9 },
    media_pairing_id: pairingId,
    media_snapshot: {
      pairing_id: pairingId,
      asset_id: assetId,
      storage_bucket: 'marketing-assets',
      storage_path: `${workspaceId}/${assetId}/servsync-platform-introduction-v1.mp4`,
      mime_type: 'video/mp4',
      sha256: videoSha,
      file_size_bytes: videoBytes.byteLength,
      media_variant: 'narrated_marketing_derivative',
      ai_narration_disclosure_text: disclosure,
    },
    ...overrides,
  };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function queueFetcher(responses: Array<Response | Error>, calls: Array<{ url: URL; init?: RequestInit }>) {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
    calls.push({ url, init });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected provider request.');
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
}

function enabledAdapter(responses: Array<Response | Error>, calls: Array<{ url: URL; init?: RequestInit }>, overrides: {
  getManagedMedia?: () => Promise<{ bytes: Uint8Array; fileName: string; mimeType: 'video/mp4'; assetId: string; sha256: string }>;
} = {}) {
  return createFacebookPublishingAdapter({
    config,
    getPageToken: async id => { assert.equal(id, connectionId); return 'test-page-token-abcdefghijklmnopqrstuvwxyz'; },
    getManagedMedia: overrides.getManagedMedia ?? (async () => ({
      bytes: videoBytes,
      fileName: 'servsync-platform-introduction-v1.mp4',
      mimeType: 'video/mp4',
      assetId,
      sha256: videoSha,
    })),
    fetcher: queueFetcher(responses, calls),
  });
}

test('provider capabilities remain distinct and every provider is truthfully unconnected', () => {
  assert.deepEqual(marketingPublishingProviders.facebook.capabilities, { text: true, media: true });
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
        publication_id: publicationId,
        attempt_number: 1,
        operation: 'publish',
        provider: 'facebook',
        provider_connection_id: connectionId,
        destination_key: 'page',
        content_snapshot: { title: 'Approved', body: 'Approved copy.', content_type: 'social_post' },
      }], error: null };
      return { data: null, error: null };
    },
  };
  const result = await runMarketingPublishingWorker(client as never, { facebookConfig: null });
  assert.deepEqual(result, { claimed: 1, published: 0, processing: 0, failed: 1 });
  assert.deepEqual(calls.map(call => call.name), [
    'servsync_claim_due_marketing_publications',
    'servsync_fail_marketing_publication',
  ]);
  assert.equal(calls[1].args.p_retry_eligible, false);
  assert.equal(JSON.stringify(calls).includes('token'), false);
});

test('managed Page video uses exact preview copy and exact MP4 bytes, then confirms the known Video ID', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const adapter = enabledAdapter([
    json({ id: videoId }),
    json({ id: videoId, created_time: '2026-08-16T12:00:00+0000', description: message }),
  ], calls);
  const publication = claim();
  assert.equal(adapter.validatePublication(publication), null);
  const prepared = await adapter.preparePublication(publication);
  assert.equal(prepared.publicMessage, publicMessageForProvider('facebook', publication.content_snapshot));
  const accepted = await adapter.publish(prepared);
  assert.equal(accepted.state, 'accepted');
  assert.equal(accepted.providerPublicationId, videoId);
  assert.equal(accepted.metadata.asset_id, assetId);
  assert.equal(accepted.metadata.asset_sha256, videoSha);
  assert.equal(calls[0].url.href, `https://graph-video.facebook.com/v26.0/${pageId}/videos`);
  assert.equal(new Headers(calls[0].init?.headers).get('authorization'), 'Bearer test-page-token-abcdefghijklmnopqrstuvwxyz');
  const form = calls[0].init?.body as FormData;
  assert.equal(form.get('description'), message);
  assert.equal(form.get('published'), 'true');
  const source = form.get('source');
  assert.ok(source instanceof Blob);
  assert.deepEqual(new Uint8Array(await source.arrayBuffer()), videoBytes);
  assert.equal(calls[0].url.searchParams.has('access_token'), false);

  const reconciliation = await adapter.reconcile({
    ...prepared,
    claim: claim({ operation: 'reconcile', provider_publication_id: videoId }),
  });
  assert.equal(reconciliation.state, 'published');
  assert.equal(calls[1].url.pathname, `/v26.0/${videoId}`);
  assert.equal(calls[1].url.searchParams.get('fields'), 'id,created_time,description');
});

test('required media never falls back to a text-only Facebook feed post', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const adapter = enabledAdapter([], calls, {
    getManagedMedia: async () => { throw new Error('Managed Marketing media checksum validation failed.'); },
  });
  await assert.rejects(() => adapter.preparePublication(claim()), /provider request could not be completed|checksum/i);
  assert.equal(calls.length, 0);
});

test('narrated media without the exact disclosure fails before token or provider access', () => {
  let tokenReads = 0;
  const adapter = createFacebookPublishingAdapter({
    config,
    getPageToken: async () => { tokenReads += 1; return 'never'; },
    getManagedMedia: async () => { throw new Error('never'); },
  });
  const publication = claim({ content_snapshot: { ...claim().content_snapshot, body: 'Disclosure removed.' } });
  assert.equal(adapter.validatePublication(publication)?.category, 'content_validation');
  assert.equal(tokenReads, 0);
});

test('known Video ID processing remains a reconciliation-only operation', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  let mediaReads = 0;
  const adapter = enabledAdapter([json({ id: videoId })], calls, {
    getManagedMedia: async () => { mediaReads += 1; throw new Error('reconciliation must not read or upload media'); },
  });
  const prepared = await adapter.preparePublication(claim({
    operation: 'reconcile',
    provider_publication_id: videoId,
    provider_reconciliation_count: 2,
  }));
  const result = await adapter.reconcile(prepared);
  assert.equal(result.state, 'processing');
  assert.equal(mediaReads, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.method, 'GET');
});

test('known Video ID can reconcile after the deployment submission capability is disabled', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const adapter = createFacebookPublishingAdapter({
    config: { ...config, publicPostsEnabled: false },
    getPageToken: async () => 'test-page-token-abcdefghijklmnopqrstuvwxyz',
    getManagedMedia: async () => { throw new Error('reconciliation must not read media'); },
    fetcher: queueFetcher([
      json({ id: videoId, created_time: '2026-08-17T12:00:00+0000', description: message }),
    ], calls),
  });
  const prepared = await adapter.preparePublication(claim({
    operation: 'reconcile', provider_publication_id: videoId, provider_reconciliation_count: 2,
  }));
  const result = await adapter.reconcile(prepared);
  assert.equal(result.state, 'published');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.init?.method, 'GET');
  assert.equal(adapter.getConnectionReadiness().status, 'setup_required');
});

test('ambiguous upload response is terminal and never retry-eligible', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const adapter = enabledAdapter([new Error('network timeout')], calls);
  const prepared = await adapter.preparePublication(claim());
  await assert.rejects(() => adapter.publish(prepared), (error: unknown) => {
    assert.deepEqual(sanitizeProviderFailure(error), {
      category: 'provider_uncertain',
      message: 'The Facebook video upload result could not be confirmed. Automatic retry is disabled.',
      retryEligible: false,
      requestStarted: true,
    });
    return true;
  });
  assert.equal(calls.length, 1);
});

test('successful upload response without a usable Video ID is terminal and never retried', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const adapter = enabledAdapter([json({ success: true })], calls);
  const prepared = await adapter.preparePublication(claim());
  await assert.rejects(() => adapter.publish(prepared), (error: unknown) => {
    assert.deepEqual(sanitizeProviderFailure(error), {
      category: 'provider_uncertain',
      message: 'Facebook accepted the video request without a usable Video ID. Automatic retry is disabled.',
      retryEligible: false,
      requestStarted: true,
    });
    return true;
  });
  assert.equal(calls.length, 1);
});

test('documented video_id response is accepted when the generic id field is absent', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const adapter = enabledAdapter([json({ video_id: videoId })], calls);
  const accepted = await adapter.publish(await adapter.preparePublication(claim()));
  assert.equal(accepted.state, 'accepted');
  assert.equal(accepted.providerPublicationId, videoId);
  assert.equal(accepted.metadata.provider_response_identifier_fields, 'video_id');
});

test('conflicting provider identifier fields are terminal uncertainty', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const adapter = enabledAdapter([json({ id: videoId, video_id: '4455667788990099' })], calls);
  const prepared = await adapter.preparePublication(claim());
  await assert.rejects(() => adapter.publish(prepared), (error: unknown) => {
    const failure = sanitizeProviderFailure(error);
    assert.equal(failure.category, 'provider_uncertain');
    assert.equal(failure.retryEligible, false);
    assert.equal(failure.requestStarted, true);
    return true;
  });
});

test('managed Storage read failure occurs before request start and makes no provider request', async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const publication = claim();
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'servsync_claim_due_marketing_publications') return { data: [publication], error: null };
      if (name === 'servsync_private_get_marketing_facebook_page_token') return { data: 'test-page-token-abcdefghijklmnopqrstuvwxyz', error: null };
      if (name === 'servsync_prepare_marketing_publication_media') return { data: {
        pairing_id: pairingId,
        asset_id: assetId,
        storage_bucket: 'marketing-assets',
        storage_path: publication.media_snapshot?.storage_path,
        mime_type: 'video/mp4',
        file_size_bytes: videoBytes.byteLength,
        sha256: videoSha,
      }, error: null };
      return { data: null, error: null };
    },
    storage: {
      from: () => ({ download: async () => ({ data: null, error: new Error('read unavailable') }) }),
    },
  };
  const fetchCalls: Array<{ url: URL; init?: RequestInit }> = [];
  const result = await runMarketingPublishingWorker(client as never, {
    facebookConfig: config,
    facebookFetcher: queueFetcher([], fetchCalls),
  });
  assert.deepEqual(result, { claimed: 1, published: 0, processing: 0, failed: 1 });
  assert.deepEqual(rpcCalls.map(call => call.name), [
    'servsync_claim_due_marketing_publications',
    'servsync_private_get_marketing_facebook_page_token',
    'servsync_prepare_marketing_publication_media',
    'servsync_fail_marketing_publication',
  ]);
  assert.equal(rpcCalls.at(-1)?.args.p_retry_eligible, true);
  assert.equal(fetchCalls.length, 0);
});

test('worker resolves and checksums media before request start, records acceptance, and defers one known Video ID', async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const publication = claim();
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'servsync_claim_due_marketing_publications') return { data: [publication], error: null };
      if (name === 'servsync_private_get_marketing_facebook_page_token') return { data: 'test-page-token-abcdefghijklmnopqrstuvwxyz', error: null };
      if (name === 'servsync_prepare_marketing_publication_media') return { data: {
        pairing_id: pairingId,
        asset_id: assetId,
        storage_bucket: 'marketing-assets',
        storage_path: publication.media_snapshot?.storage_path,
        mime_type: 'video/mp4',
        file_size_bytes: videoBytes.byteLength,
        sha256: videoSha,
      }, error: null };
      return { data: null, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          assert.equal(bucket, 'marketing-assets');
          assert.equal(path, publication.media_snapshot?.storage_path);
          return { data: new Blob([videoBytes], { type: 'video/mp4' }), error: null };
        },
      }),
    },
  };
  const fetchCalls: Array<{ url: URL; init?: RequestInit }> = [];
  const result = await runMarketingPublishingWorker(client as never, {
    facebookConfig: config,
    facebookFetcher: queueFetcher([json({ id: videoId }), json({ id: videoId })], fetchCalls),
  });
  assert.deepEqual(result, { claimed: 1, published: 0, processing: 1, failed: 0 }, JSON.stringify(rpcCalls));
  assert.deepEqual(rpcCalls.map(call => call.name), [
    'servsync_claim_due_marketing_publications',
    'servsync_private_get_marketing_facebook_page_token',
    'servsync_prepare_marketing_publication_media',
    'servsync_mark_marketing_provider_request_started',
    'servsync_record_marketing_provider_acceptance',
    'servsync_defer_marketing_provider_reconciliation',
  ]);
  assert.equal(fetchCalls.filter(call => call.init?.method === 'POST').length, 1);
  assert.equal(fetchCalls.filter(call => call.init?.method === 'GET').length, 1);
});

test('reconciliation claim confirms without reading media or issuing a second POST', async () => {
  const rpcCalls: string[] = [];
  const publication = claim({
    operation: 'reconcile',
    provider_publication_id: videoId,
    provider_metadata: { asset_id: assetId },
    provider_reconciliation_count: 1,
  });
  const client = {
    rpc: async (name: string) => {
      rpcCalls.push(name);
      if (name === 'servsync_claim_due_marketing_publications') return { data: [publication], error: null };
      if (name === 'servsync_private_get_marketing_facebook_page_token') return { data: 'test-page-token-abcdefghijklmnopqrstuvwxyz', error: null };
      return { data: null, error: null };
    },
  };
  const fetchCalls: Array<{ url: URL; init?: RequestInit }> = [];
  const result = await runMarketingPublishingWorker(client as never, {
    facebookConfig: config,
    facebookFetcher: queueFetcher([
      json({ id: videoId, created_time: '2026-08-16T12:00:00+0000', description: message }),
    ], fetchCalls),
  });
  assert.deepEqual(result, { claimed: 1, published: 1, processing: 0, failed: 0 }, JSON.stringify(rpcCalls));
  assert.deepEqual(rpcCalls, [
    'servsync_claim_due_marketing_publications',
    'servsync_private_get_marketing_facebook_page_token',
    'servsync_complete_marketing_publication',
  ]);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].init?.method, 'GET');
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
