import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizedFacebookPageTargets,
  createFacebookOauthState,
  debugFacebookAccessToken,
  discoverFacebookPages,
  exchangeFacebookAuthorizationCode,
  FACEBOOK_CALLBACK_URL,
  FACEBOOK_CONTENT_PUBLISHING_TASKS,
  FACEBOOK_GRAPH_API_VERSION,
  FACEBOOK_REQUIRED_PERMISSIONS,
  facebookAuthorizationUrl,
  facebookTextPublicationRequest,
  hashFacebookOauthValue,
  resolveFacebookMarketingConfig,
  validateFacebookPage,
  type FacebookMarketingConfig,
} from '../../server/facebookMarketingConnection.ts';
import {
  createFacebookConnectionHandler,
  createFacebookOauthCallbackHandler,
  createFacebookOauthStartHandler,
} from '../../server/facebookMarketingHttp.ts';
import { createFacebookPublishingAdapter } from '../../server/marketingPublishingProviders.ts';
import { marketingFacebookReturnStatus } from '../../src/features/marketing/marketingFacebookConnection.ts';

const config: FacebookMarketingConfig = {
  appId: '123456789012345',
  appSecret: 'test-app-secret-abcdefghijklmnopqrstuvwxyz',
  loginConfigurationId: '987654321098765',
  graphApiVersion: FACEBOOK_GRAPH_API_VERSION,
  callbackUrl: FACEBOOK_CALLBACK_URL,
  publicPostsEnabled: false,
};
const userToken = 'test-user-token-abcdefghijklmnopqrstuvwxyz';
const pageToken = 'test-page-token-abcdefghijklmnopqrstuvwxyz';
const sessionId = '71000000-0000-4000-8000-000000000001';
const connectionId = '00000000-0000-4000-8000-000000000061';

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function queueFetcher(responses: Response[], calls: Array<{ url: URL; init?: RequestInit }>) {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
    calls.push({ url, init });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected provider request.');
    return response;
  }) as typeof fetch;
}

function rpcClient(handler: (name: string, args: Record<string, unknown>) => unknown) {
  return { rpc: async (name: string, args: Record<string, unknown>) => ({ data: handler(name, args), error: null }) };
}

function tokenDebug(type: 'USER' | 'PAGE', targetIds: string[], profileId?: string) {
  return {
    data: {
      app_id: config.appId,
      type,
      is_valid: true,
      profile_id: profileId,
      scopes: [...FACEBOOK_REQUIRED_PERMISSIONS, 'public_profile'],
      granular_scopes: FACEBOOK_REQUIRED_PERMISSIONS.map(scope => ({ scope, target_ids: targetIds })),
      expires_at: 0,
      data_access_expires_at: 1_800_000_000,
    },
  };
}

test('configuration is pinned to Production, the current Graph version, and the exact callback', () => {
  assert.equal(resolveFacebookMarketingConfig({}), null);
  const environment = {
    SERVSYNC_META_APP_ID: config.appId,
    SERVSYNC_META_APP_SECRET: config.appSecret,
    SERVSYNC_META_LOGIN_CONFIGURATION_ID: config.loginConfigurationId,
    SERVSYNC_META_GRAPH_API_VERSION: FACEBOOK_GRAPH_API_VERSION,
    SERVSYNC_META_OAUTH_REDIRECT_URI: FACEBOOK_CALLBACK_URL,
    SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF: 'uqgtheclhxqlnjpfmheq',
    SUPABASE_URL: 'https://uqgtheclhxqlnjpfmheq.supabase.co',
  } as NodeJS.ProcessEnv;
  assert.deepEqual(resolveFacebookMarketingConfig(environment), config);
  assert.equal(resolveFacebookMarketingConfig({ ...environment, SERVSYNC_META_LOGIN_CONFIGURATION_ID: '' }), null);
  assert.equal(resolveFacebookMarketingConfig({ ...environment, SERVSYNC_META_LOGIN_CONFIGURATION_ID: 'not-a-configuration' }), null);
  assert.equal(resolveFacebookMarketingConfig({ ...environment, SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF: 'bdytwgejqnlblhrnqxkp' }), null);
  assert.equal(resolveFacebookMarketingConfig({ ...environment, SERVSYNC_META_GRAPH_API_VERSION: 'v25.0' }), null);
  assert.equal(resolveFacebookMarketingConfig({ ...environment, SERVSYNC_META_OAUTH_REDIRECT_URI: 'https://example.com/callback' }), null);
  assert.equal(resolveFacebookMarketingConfig({ ...environment, SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED: 'TRUE' })?.publicPostsEnabled, false);
  assert.equal(resolveFacebookMarketingConfig({ ...environment, SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED: 'true' })?.publicPostsEnabled, true);
});

test('browser return routing accepts only bounded Facebook connection states', () => {
  assert.equal(marketingFacebookReturnStatus('?marketing_facebook=page_selection_required'), 'page_selection_required');
  assert.equal(marketingFacebookReturnStatus('?marketing_facebook=connected'), 'connected');
  assert.equal(marketingFacebookReturnStatus('?marketing_facebook=failed'), 'failed');
  assert.equal(marketingFacebookReturnStatus('?marketing_facebook=access_token'), null);
  assert.equal(marketingFacebookReturnStatus('?other=value'), null);
});

test('OAuth state is strong and only its SHA-256 digest is prepared for persistence', () => {
  const first = createFacebookOauthState();
  const second = createFacebookOauthState();
  assert.match(first.state, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(first.state, second.state);
  assert.equal(first.stateHash, hashFacebookOauthValue(first.state));
  assert.match(first.stateHash, /^\\x[0-9a-f]{64}$/);
  assert.equal(first.stateHash.includes(first.state), false);
});

test('authorization URL invokes the reviewed Facebook Login for Business configuration', () => {
  const url = new URL(facebookAuthorizationUrl(config, 'safe-state-value'));
  assert.equal(url.origin, 'https://www.facebook.com');
  assert.equal(url.pathname, `/${FACEBOOK_GRAPH_API_VERSION}/dialog/oauth`);
  assert.equal(url.searchParams.get('client_id'), config.appId);
  assert.equal(url.searchParams.get('redirect_uri'), FACEBOOK_CALLBACK_URL);
  assert.equal(url.searchParams.get('state'), 'safe-state-value');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('config_id'), config.loginConfigurationId);
  assert.equal(url.searchParams.has('scope'), false);
  assert.equal(url.toString().includes(config.appSecret), false);
});

test('token exchange keeps the app secret and provider tokens out of request URLs', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetcher = queueFetcher([
    json({ access_token: 'short-token-abcdefghijklmnopqrstuvwxyz', expires_in: 3600 }),
    json({ access_token: userToken, expires_in: 5_184_000 }),
  ], calls);
  const result = await exchangeFacebookAuthorizationCode(config, 'authorization-code-fixture', fetcher);
  assert.equal(result.accessToken, userToken);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.init?.method, 'POST');
    assert.equal(call.url.search, '');
    assert.equal(call.url.toString().includes(config.appSecret), false);
    assert.equal(call.url.toString().includes(userToken), false);
    assert.equal(call.url.toString().includes('short-token-abcdefghijklmnopqrstuvwxyz'), false);
  }
  const firstBody = calls[0].init?.body as URLSearchParams;
  assert.equal(firstBody.get('client_secret'), config.appSecret);
  assert.equal(firstBody.get('redirect_uri'), FACEBOOK_CALLBACK_URL);
});

test('token debugging parses only sanitized scope and granular Page authorization metadata', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const debug = await debugFacebookAccessToken(config, userToken, queueFetcher([
    json(tokenDebug('USER', ['1199023349954773'])),
  ], calls));
  assert.equal(debug.type, 'USER');
  assert.equal(debug.isValid, true);
  assert.equal(debug.appIdMatches, true);
  assert.deepEqual(authorizedFacebookPageTargets(debug), ['1199023349954773']);
  assert.equal(JSON.stringify(debug).includes(userToken), false);
  assert.equal(calls[0].url.searchParams.get('input_token'), userToken);
  assert.equal(calls[0].url.toString().includes(config.appSecret), false);
  assert.equal(new Headers(calls[0].init?.headers).get('authorization'), `Bearer ${config.appId}|${config.appSecret}`);
  assert.throws(() => authorizedFacebookPageTargets({
    ...debug,
    granularScopes: FACEBOOK_REQUIRED_PERMISSIONS.map(scope => ({
      scope,
      targetIds: Array.from({ length: 101 }, (_, index) => String(1_000_000 + index)),
    })),
  }), { category: 'provider_permission' });
});

test('Page discovery accepts current content tasks and excludes Pages outside granular targets', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetcher = queueFetcher([
    json({ id: '9988776655443322' }),
    json({ data: FACEBOOK_REQUIRED_PERMISSIONS.map(permission => ({ permission, status: 'granted' })) }),
    json(tokenDebug('USER', ['1122334455667788', '8877665544332211'])),
    json({ data: [
      { id: '1122334455667788', name: ' ServSync Page ', access_token: pageToken, tasks: ['PROFILE_PLUS_CREATE_CONTENT'] },
      { id: '8877665544332211', name: 'Read Only Page', access_token: 'read-only-token-abcdefghijklmnopqrstuvwxyz', tasks: ['MODERATE'] },
      { id: '7766554433221100', name: 'Prevention Pros', access_token: 'foreign-page-token-abcdefghijklmnopqrstuvwxyz', tasks: ['PROFILE_PLUS_FULL_CONTROL'] },
    ] }),
  ], calls);
  const discovered = await discoverFacebookPages(config, userToken, fetcher);
  assert.equal(discovered.providerUserId, '9988776655443322');
  assert.deepEqual(discovered.pages.map(page => page.safe), [
    { page_id: '1122334455667788', page_name: 'ServSync Page', tasks: ['PROFILE_PLUS_CREATE_CONTENT'], eligible: true },
    { page_id: '8877665544332211', page_name: 'Read Only Page', tasks: ['MODERATE'], eligible: false },
  ]);
  assert.deepEqual(FACEBOOK_CONTENT_PUBLISHING_TASKS, ['CREATE_CONTENT', 'PROFILE_PLUS_CREATE_CONTENT', 'PROFILE_PLUS_FULL_CONTROL']);
  assert.equal(JSON.stringify(discovered.pages.map(page => page.safe)).includes('token'), false);
  assert.equal(JSON.stringify(discovered).includes('Prevention Pros'), false);
  for (const call of calls) {
    assert.equal(call.url.searchParams.has('access_token'), false);
  }
});

test('zero-row accounts discovery resolves only the direct Page proved by every granular permission', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const selectedOnly = await discoverFacebookPages(config, userToken, queueFetcher([
    json({ id: '9988776655443322' }),
    json({ data: FACEBOOK_REQUIRED_PERMISSIONS.map(permission => ({ permission, status: 'granted' })) }),
    json(tokenDebug('USER', ['1199023349954773'])),
    json({ data: [] }),
    json({ id: '1199023349954773', name: 'ServSync', access_token: pageToken }),
  ], calls));
  assert.deepEqual(selectedOnly.pages.map(page => page.safe), [
    { page_id: '1199023349954773', page_name: 'ServSync', tasks: [], eligible: true },
  ]);
  assert.equal(calls.at(-1)?.url.pathname, '/v26.0/1199023349954773');
  assert.equal(calls.at(-1)?.url.searchParams.get('fields'), 'id,name,access_token');
  assert.equal(calls.at(-1)?.url.searchParams.has('tasks'), false);
});

test('missing granular target authority stays fail-closed even when account rows contain a Page', async () => {
  const zeroPages = await discoverFacebookPages(config, userToken, queueFetcher([
    json({ id: '9988776655443322' }),
    json({ data: FACEBOOK_REQUIRED_PERMISSIONS.map(permission => ({ permission, status: 'granted' })) }),
    json({ data: { ...tokenDebug('USER', ['1199023349954773']).data, granular_scopes: [
      { scope: 'pages_show_list', target_ids: ['1199023349954773'] },
      { scope: 'pages_read_engagement', target_ids: ['1199023349954773'] },
      { scope: 'pages_manage_posts', target_ids: [] },
    ] } }),
    json({ data: [{ id: '1199023349954773', name: 'ServSync', access_token: pageToken, tasks: ['PROFILE_PLUS_FULL_CONTROL'] }] }),
  ], []));
  assert.deepEqual(zeroPages.pages, []);
  assert.deepEqual(zeroPages.grantedPermissions, [...FACEBOOK_REQUIRED_PERMISSIONS].sort());
});

test('Page token validation enforces app, type, exact profile, scopes, and granular target authority', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const valid = await validateFacebookPage(config, '1122334455667788', pageToken, queueFetcher([
    json(tokenDebug('PAGE', ['1122334455667788'], '1122334455667788')),
    json({ id: '1122334455667788', name: 'ServSync Page' }),
  ], calls));
  assert.deepEqual(valid, { pageId: '1122334455667788', pageName: 'ServSync Page', tasks: [] });
  assert.equal(calls[1].url.searchParams.get('fields'), 'id,name');
  assert.equal(calls[1].url.searchParams.has('tasks'), false);
  assert.equal(new Headers(calls[1].init?.headers).get('authorization'), `Bearer ${pageToken}`);
  await assert.rejects(() => validateFacebookPage(config, '1122334455667788', pageToken, queueFetcher([
    json({ data: { ...tokenDebug('PAGE', ['8877665544332211'], '1122334455667788').data } }),
  ], [])), { category: 'provider_permission' });
});

test('start endpoint is same-origin, owner-authorized through RPC, and browser-token free', async () => {
  const calls: Array<{ scope: string; name: string; args: Record<string, unknown> }> = [];
  const dependencies = {
    config: () => config,
    clients: () => ({
      user: () => rpcClient((name, args) => { calls.push({ scope: 'user', name, args }); return { session_id: sessionId }; }),
      service: rpcClient((name, args) => { calls.push({ scope: 'service', name, args }); return null; }),
    }),
    fetcher: fetch,
    createState: () => ({ state: 'safe-random-state-abcdefghijklmnopqrstuvwxyz', stateHash: `\\x${'ab'.repeat(32)}` }),
  };
  const handler = createFacebookOauthStartHandler(dependencies);
  const denied = await handler(new Request('https://servsync.app/api/marketing-facebook-oauth-start', { method: 'POST' }));
  assert.equal(denied.status, 403);
  const response = await handler(new Request('https://servsync.app/api/marketing-facebook-oauth-start', {
    method: 'POST',
    headers: { Origin: 'https://servsync.app', Host: 'servsync.app', Authorization: 'Bearer test-owner-jwt-abcdefghijklmnopqrstuvwxyz' },
  }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, string>;
  assert.equal(body.status, 'authorization_required');
  assert.equal(body.authorization_url.includes(config.appSecret), false);
  assert.equal(body.authorization_url.includes('test-owner-jwt'), false);
  assert.deepEqual(calls.map(call => [call.scope, call.name]), [['user', 'servsync_begin_internal_marketing_facebook_oauth']]);
});

test('callback consumes state once and returns only a safe same-site selection redirect', async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const providerCalls: Array<{ url: URL; init?: RequestInit }> = [];
  const dependencies = {
    config: () => config,
    clients: () => ({
      user: () => rpcClient(() => null),
      service: rpcClient((name, args) => {
        rpcCalls.push({ name, args });
        if (name === 'servsync_private_consume_marketing_facebook_oauth') return { session_id: sessionId };
        return null;
      }),
    }),
    fetcher: queueFetcher([
      json({ access_token: 'short-token-abcdefghijklmnopqrstuvwxyz', expires_in: 3600 }),
      json({ access_token: userToken, expires_in: 5_184_000 }),
      json({ id: '9988776655443322' }),
      json({ data: FACEBOOK_REQUIRED_PERMISSIONS.map(permission => ({ permission, status: 'granted' })) }),
      json(tokenDebug('USER', ['1122334455667788'])),
      json({ data: [{ id: '1122334455667788', name: 'ServSync Page', access_token: pageToken, tasks: ['PROFILE_PLUS_CREATE_CONTENT'] }] }),
    ], providerCalls),
    createState: createFacebookOauthState,
  };
  const handler = createFacebookOauthCallbackHandler(dependencies);
  const response = await handler(new Request('https://servsync.app/api/marketing-facebook-oauth-callback?state=safe-state-abcdefghijklmnopqrstuvwxyz&code=authorization-code-fixture'));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://servsync.app/?marketing_facebook=page_selection_required#/contractor');
  assert.deepEqual(rpcCalls.map(call => call.name), [
    'servsync_private_consume_marketing_facebook_oauth',
    'servsync_private_store_marketing_facebook_oauth_result',
  ]);
  assert.equal(JSON.stringify(rpcCalls[0]).includes('safe-state-abcdefghijklmnopqrstuvwxyz'), false);
  assert.equal(JSON.stringify(rpcCalls[0]).includes('authorization-code-fixture'), false);
  const browserPayload = `${response.headers.get('location')}${await response.text()}`;
  assert.equal(browserPayload.includes(userToken) || browserPayload.includes(pageToken), false);
});

test('provider denial callback is sanitized and consumes only the hashed state', async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const logs: string[] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => { logs.push(values.map(String).join(' ')); };
  try {
    const dependencies = {
      config: () => config,
      clients: () => ({
        user: () => rpcClient(() => null),
        service: rpcClient((name, args) => { rpcCalls.push({ name, args }); return null; }),
      }),
      fetcher: fetch,
      createState: createFacebookOauthState,
    };
    const response = await createFacebookOauthCallbackHandler(dependencies)(new Request(
      'https://servsync.app/api/marketing-facebook-oauth-callback?state=safe-denied-state-abcdefghijklmnopqrstuvwxyz&error=access_denied&error_description=private-provider-detail',
    ));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'https://servsync.app/?marketing_facebook=failed#/contractor');
    assert.deepEqual(rpcCalls.map(call => call.name), ['servsync_private_fail_marketing_facebook_oauth']);
    assert.equal(JSON.stringify(rpcCalls).includes('safe-denied-state-abcdefghijklmnopqrstuvwxyz'), false);
    assert.equal(JSON.stringify(rpcCalls).includes('private-provider-detail'), false);
    assert.equal(logs.join('\n').includes('private-provider-detail'), false);
  } finally {
    console.error = original;
  }
});

test('explicit Page selection re-discovers authority and stores only the selected server token', async () => {
  const rpcCalls: Array<{ scope: string; name: string; args: Record<string, unknown> }> = [];
  const providerCalls: Array<{ url: URL; init?: RequestInit }> = [];
  const dependencies = {
    config: () => config,
    clients: () => ({
      user: () => rpcClient((name, args) => {
        rpcCalls.push({ scope: 'user', name, args });
        return { session_id: sessionId };
      }),
      service: rpcClient((name, args) => {
        rpcCalls.push({ scope: 'service', name, args });
        if (name === 'servsync_private_get_marketing_facebook_session_token') return userToken;
        return null;
      }),
    }),
    fetcher: queueFetcher([
      json({ id: '9988776655443322' }),
      json({ data: FACEBOOK_REQUIRED_PERMISSIONS.map(permission => ({ permission, status: 'granted' })) }),
      json(tokenDebug('USER', ['1122334455667788'])),
      json({ data: [{ id: '1122334455667788', name: 'ServSync Page', access_token: pageToken, tasks: ['PROFILE_PLUS_CREATE_CONTENT'] }] }),
      json(tokenDebug('PAGE', ['1122334455667788'], '1122334455667788')),
      json({ id: '1122334455667788', name: 'ServSync Page' }),
    ], providerCalls),
    createState: createFacebookOauthState,
  };
  const response = await createFacebookConnectionHandler(dependencies)(new Request('https://servsync.app/api/marketing-facebook-connection', {
    method: 'POST',
    headers: {
      Origin: 'https://servsync.app', Host: 'servsync.app', Authorization: 'Bearer test-owner-jwt-abcdefghijklmnopqrstuvwxyz',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'select_page', session_id: sessionId, page_id: '1122334455667788' }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'connected', readiness: 'ready_except_live_post_verification' });
  assert.deepEqual(rpcCalls.map(call => call.name), [
    'servsync_authorize_internal_marketing_facebook_page_selection',
    'servsync_private_get_marketing_facebook_session_token',
    'servsync_private_complete_marketing_facebook_page',
  ]);
  const completed = rpcCalls.at(-1)?.args ?? {};
  assert.equal(completed.p_page_id, '1122334455667788');
  assert.equal(completed.p_page_access_token, pageToken);
  assert.deepEqual(completed.p_page_tasks, ['PROFILE_PLUS_CREATE_CONTENT']);
});

test('readiness-only connection cannot post, while the future kill-switch path builds a token-safe request', async () => {
  const claim = {
    publication_id: '71000000-0000-4000-8000-000000000002', attempt_number: 1, provider: 'facebook' as const,
    provider_connection_id: connectionId, destination_key: '1122334455667788',
    content_snapshot: { title: 'Approved', body: 'A plain approved ServSync post.', content_type: 'social_post' },
  };
  let tokenReads = 0;
  const gated = createFacebookPublishingAdapter({ config, getPageToken: async () => { tokenReads += 1; return pageToken; } });
  assert.equal(gated.getConnectionReadiness().status, 'setup_required');
  assert.equal(gated.validatePublication(claim)?.category, 'unsupported');
  await assert.rejects(() => gated.preparePublication(claim), { category: 'unsupported' });
  assert.equal(tokenReads, 0);

  const request = facebookTextPublicationRequest({ ...config, publicPostsEnabled: true }, claim.destination_key, pageToken, claim.content_snapshot.body);
  assert.equal(request.url.searchParams.has('access_token'), false);
  assert.equal(new Headers(request.init.headers).get('authorization'), `Bearer ${pageToken}`);
  assert.equal((request.init.body as URLSearchParams).has('access_token'), false);

  const fetchCalls: Array<{ url: URL; init?: RequestInit }> = [];
  const enabled = createFacebookPublishingAdapter({
    config: { ...config, publicPostsEnabled: true },
    getPageToken: async id => { assert.equal(id, connectionId); return pageToken; },
    fetcher: queueFetcher([json({ id: '1122334455667788_4455667788990011' })], fetchCalls),
  });
  assert.equal(enabled.validatePublication(claim), null);
  const prepared = await enabled.preparePublication(claim);
  assert.deepEqual(await enabled.publish(prepared), {
    providerPublicationId: '1122334455667788_4455667788990011',
    state: 'published',
    metadata: { page_id: '1122334455667788', provider_identifier_kind: 'page_post_id' },
  });
  assert.equal(fetchCalls.length, 1);
});
