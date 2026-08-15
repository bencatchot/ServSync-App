import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createFacebookOauthState,
  discoverFacebookPages,
  exchangeFacebookAuthorizationCode,
  FACEBOOK_REQUIRED_PERMISSIONS,
  FacebookProviderError,
  facebookAuthorizationUrl,
  hashFacebookOauthValue,
  resolveFacebookMarketingConfig,
  validateFacebookPage,
  type FacebookMarketingConfig,
} from './facebookMarketingConnection.js';
import { resolveMarketingPublishingConfig } from './marketingPublishingWorker.js';

type RpcClient = Pick<SupabaseClient, 'rpc'>;
type FacebookHttpDependencies = {
  config: () => FacebookMarketingConfig | null;
  clients: () => { user: (accessToken: string) => RpcClient; service: RpcClient } | null;
  fetcher: typeof fetch;
  createState: typeof createFacebookOauthState;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function redirect(status: 'page_selection_required' | 'connected' | 'failed') {
  const target = new URL('https://servsync.app/');
  target.searchParams.set('marketing_facebook', status);
  target.hash = '/contractor';
  return new Response(null, { status: 303, headers: { Location: target.toString(), 'Cache-Control': 'no-store, private' } });
}

function bearer(request: Request) {
  const value = request.headers.get('authorization') ?? '';
  return /^Bearer [^\s]{20,}$/.test(value) ? value.slice(7) : null;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function rpc<T>(client: RpcClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(name);
  return data as T;
}

function defaultDependencies(): FacebookHttpDependencies {
  return {
    config: () => resolveFacebookMarketingConfig(),
    clients: () => {
      const publishing = resolveMarketingPublishingConfig();
      if (!publishing) return null;
      const base = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
      return {
        service: createClient(publishing.supabaseUrl, publishing.serviceRoleKey, base),
        user: accessToken => createClient(publishing.supabaseUrl, publishing.serviceRoleKey, {
          ...base,
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        }),
      };
    },
    fetcher: fetch,
    createState: createFacebookOauthState,
  };
}

function safeCategory(error: unknown) {
  return error instanceof FacebookProviderError ? error.category : 'internal';
}

function reportFailure(stage: string, error: unknown) {
  console.error(JSON.stringify({
    event: 'facebook_marketing_connection_failed',
    stage,
    category: safeCategory(error),
  }));
}

export function createFacebookOauthStartHandler(dependencies: FacebookHttpDependencies = defaultDependencies()) {
  return async function handler(request: Request) {
    if (request.method !== 'POST') return json({ status: 'failed', reason: 'method_not_allowed' }, 405);
    if (!sameOrigin(request)) return json({ status: 'failed', reason: 'forbidden' }, 403);
    const accessToken = bearer(request);
    if (!accessToken) return json({ status: 'failed', reason: 'authentication_required' }, 401);
    const config = dependencies.config();
    const clients = dependencies.clients();
    if (!config || !clients) return json({ status: 'failed', reason: 'facebook_setup_required' }, 503);
    const state = dependencies.createState();
    try {
      await rpc(clients.user(accessToken), 'servsync_begin_internal_marketing_facebook_oauth', {
        p_state_hash: state.stateHash,
        p_redirect_uri: config.callbackUrl,
        p_provider_app_key: config.appId,
      });
      return json({ status: 'authorization_required', authorization_url: facebookAuthorizationUrl(config, state.state) });
    } catch (error) {
      reportFailure('start', error);
      return json({ status: 'failed', reason: 'facebook_connection_unavailable' }, 403);
    }
  };
}

export function createFacebookOauthCallbackHandler(dependencies: FacebookHttpDependencies = defaultDependencies()) {
  return async function handler(request: Request) {
    if (request.method !== 'GET') return json({ status: 'failed', reason: 'method_not_allowed' }, 405);
    const config = dependencies.config();
    const clients = dependencies.clients();
    if (!config || !clients) return json({ status: 'failed', reason: 'facebook_setup_required' }, 503);
    const url = new URL(request.url);
    const state = url.searchParams.get('state') ?? '';
    if (state.length < 20 || state.length > 512) return redirect('failed');
    const stateHash = hashFacebookOauthValue(state);
    if (url.searchParams.has('error')) {
      try {
        await rpc(clients.service, 'servsync_private_fail_marketing_facebook_oauth', {
          p_state_hash: stateHash,
          p_error_category: 'provider_denied',
        });
      } catch (error) { reportFailure('provider_denied', error); }
      return redirect('failed');
    }
    const code = url.searchParams.get('code') ?? '';
    if (code.length < 8 || code.length > 4096) return redirect('failed');
    let sessionId: string | null = null;
    try {
      const consumed = await rpc<{ session_id: string }>(clients.service, 'servsync_private_consume_marketing_facebook_oauth', {
        p_state_hash: stateHash,
        p_authorization_code_hash: hashFacebookOauthValue(code),
        p_provider_app_key: config.appId,
      });
      sessionId = consumed.session_id;
      const token = await exchangeFacebookAuthorizationCode(config, code, dependencies.fetcher);
      const discovered = await discoverFacebookPages(config, token.accessToken, dependencies.fetcher);
      await rpc(clients.service, 'servsync_private_store_marketing_facebook_oauth_result', {
        p_session_id: sessionId,
        p_user_access_token: token.accessToken,
        p_provider_user_key: discovered.providerUserId,
        p_permissions: discovered.grantedPermissions,
        p_candidate_pages: discovered.pages.map(page => page.safe),
        p_token_expires_at: token.expiresAt,
      });
      return redirect('page_selection_required');
    } catch (error) {
      reportFailure(sessionId ? 'callback_exchange' : 'callback_state', error);
      if (sessionId) {
        try {
          await rpc(clients.service, 'servsync_private_fail_marketing_facebook_session', {
            p_session_id: sessionId,
            p_error_category: safeCategory(error),
          });
        } catch { /* the original sanitized failure is authoritative */ }
      }
      return redirect('failed');
    }
  };
}

async function body(request: Request) {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(length) || length > 2_048) throw new Error('invalid');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 2_048) throw new Error('invalid');
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
  return parsed as Record<string, unknown>;
}

export function createFacebookConnectionHandler(dependencies: FacebookHttpDependencies = defaultDependencies()) {
  return async function handler(request: Request) {
    if (request.method !== 'POST') return json({ status: 'failed', reason: 'method_not_allowed' }, 405);
    if (!sameOrigin(request)) return json({ status: 'failed', reason: 'forbidden' }, 403);
    const accessToken = bearer(request);
    if (!accessToken) return json({ status: 'failed', reason: 'authentication_required' }, 401);
    const config = dependencies.config();
    const clients = dependencies.clients();
    if (!config || !clients) return json({ status: 'failed', reason: 'facebook_setup_required' }, 503);
    let input: Record<string, unknown>;
    try { input = await body(request); } catch { return json({ status: 'failed', reason: 'invalid_request' }, 400); }
    const action = input.action;
    try {
      if (action === 'select_page') {
        if (typeof input.session_id !== 'string' || typeof input.page_id !== 'string') throw new Error('invalid');
        const authorized = await rpc<{ session_id: string }>(clients.user(accessToken), 'servsync_authorize_internal_marketing_facebook_page_selection', {
          p_session_id: input.session_id,
          p_page_id: input.page_id,
        });
        const userToken = await rpc<string>(clients.service, 'servsync_private_get_marketing_facebook_session_token', {
          p_session_id: authorized.session_id,
        });
        const discovered = await discoverFacebookPages(config, userToken, dependencies.fetcher);
        const selected = discovered.pages.find(page => page.safe.page_id === input.page_id && page.safe.eligible);
        if (!selected) throw new FacebookProviderError('provider_permission', 'The selected Facebook Page is no longer eligible.');
        const page = await validateFacebookPage(config, selected.safe.page_id, selected.accessToken, dependencies.fetcher);
        await rpc(clients.service, 'servsync_private_complete_marketing_facebook_page', {
          p_session_id: authorized.session_id,
          p_page_id: page.pageId,
          p_page_name: page.pageName,
          p_page_tasks: selected.safe.tasks,
          p_page_access_token: selected.accessToken,
          p_token_expires_at: null,
        });
        return json({ status: 'connected', readiness: 'ready_except_live_post_verification' });
      }
      if (action === 'recheck') {
        const authorized = await rpc<{ connection_id: string; page_id: string }>(clients.user(accessToken), 'servsync_authorize_internal_marketing_facebook_recheck');
        const pageToken = await rpc<string>(clients.service, 'servsync_private_get_marketing_facebook_page_token', {
          p_connection_id: authorized.connection_id,
        });
        const page = await validateFacebookPage(config, authorized.page_id, pageToken, dependencies.fetcher);
        await rpc(clients.service, 'servsync_private_record_marketing_facebook_recheck', {
          p_connection_id: authorized.connection_id,
          p_page_id: page.pageId,
          p_page_name: page.pageName,
          p_page_tasks: page.tasks,
        });
        return json({ status: 'connected', readiness: 'ready_except_live_post_verification' });
      }
      if (action === 'disconnect') {
        await rpc(clients.user(accessToken), 'servsync_disconnect_internal_marketing_facebook');
        return json({ status: 'disconnected' });
      }
      return json({ status: 'failed', reason: 'invalid_request' }, 400);
    } catch (error) {
      if (action === 'recheck' && error instanceof FacebookProviderError
        && (error.category === 'provider_auth' || error.category === 'provider_permission')) {
        try {
          const authorized = await rpc<{ connection_id: string }>(clients.user(accessToken), 'servsync_authorize_internal_marketing_facebook_recheck');
          await rpc(clients.service, 'servsync_private_fail_marketing_facebook_recheck', {
            p_connection_id: authorized.connection_id,
            p_error_category: error.category,
          });
        } catch { /* preserve the original sanitized provider failure */ }
      }
      reportFailure(typeof action === 'string' ? action : 'action', error);
      return json({ status: 'failed', reason: safeCategory(error) }, error instanceof FacebookProviderError ? 409 : 403);
    }
  };
}

export const FACEBOOK_CONNECTION_REQUIRED_PERMISSIONS = FACEBOOK_REQUIRED_PERMISSIONS;
