import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const FACEBOOK_GRAPH_API_VERSION = 'v26.0';
export const FACEBOOK_REQUIRED_PERMISSIONS = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
] as const;
export const FACEBOOK_REQUIRED_PAGE_TASK = 'CREATE_CONTENT';
export const FACEBOOK_OAUTH_STATE_TTL_SECONDS = 600;
export const FACEBOOK_PRODUCTION_PROJECT_REF = 'uqgtheclhxqlnjpfmheq';
export const FACEBOOK_CALLBACK_URL = 'https://servsync.app/api/marketing-facebook-oauth-callback';

export type FacebookFailureCategory =
  | 'provider_auth'
  | 'provider_permission'
  | 'rate_limit'
  | 'content_validation'
  | 'temporary_provider'
  | 'provider_uncertain'
  | 'unsupported'
  | 'internal';

export class FacebookProviderError extends Error {
  constructor(
    public readonly category: FacebookFailureCategory,
    message: string,
    public readonly retryEligible = false,
    public readonly requestStarted = false,
  ) {
    super(message);
  }
}

export type FacebookMarketingConfig = {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
  callbackUrl: string;
  publicPostsEnabled: boolean;
};

export type FacebookPageCandidate = {
  page_id: string;
  page_name: string;
  tasks: string[];
  eligible: boolean;
};

type MetaError = { error?: { code?: unknown; error_subcode?: unknown; type?: unknown; is_transient?: unknown } };

function projectRef(value: string) {
  try { return new URL(value).hostname.split('.')[0] ?? ''; } catch { return ''; }
}

export function resolveFacebookMarketingConfig(environment: NodeJS.ProcessEnv = process.env): FacebookMarketingConfig | null {
  const appId = environment.SERVSYNC_META_APP_ID?.trim() ?? '';
  const appSecret = environment.SERVSYNC_META_APP_SECRET?.trim() ?? '';
  const graphApiVersion = environment.SERVSYNC_META_GRAPH_API_VERSION?.trim() ?? '';
  const callbackUrl = environment.SERVSYNC_META_OAUTH_REDIRECT_URI?.trim() ?? '';
  const expectedRef = environment.SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF?.trim() ?? '';
  const supabaseUrl = environment.SUPABASE_URL?.trim() ?? '';
  if (!/^\d{3,40}$/.test(appId) || appSecret.length < 20) return null;
  if (graphApiVersion !== FACEBOOK_GRAPH_API_VERSION || callbackUrl !== FACEBOOK_CALLBACK_URL) return null;
  if (expectedRef !== FACEBOOK_PRODUCTION_PROJECT_REF || projectRef(supabaseUrl) !== FACEBOOK_PRODUCTION_PROJECT_REF) return null;
  return {
    appId,
    appSecret,
    graphApiVersion,
    callbackUrl,
    publicPostsEnabled: environment.SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED === 'true',
  };
}

export function createFacebookOauthState() {
  const state = randomBytes(32).toString('base64url');
  return { state, stateHash: hashFacebookOauthValue(state) };
}

export function hashFacebookOauthValue(value: string) {
  return `\\x${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function equalFacebookOauthValue(left: string, right: string) {
  const a = createHash('sha256').update(left, 'utf8').digest();
  const b = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export function facebookAuthorizationUrl(config: FacebookMarketingConfig, state: string) {
  const url = new URL(`https://www.facebook.com/${config.graphApiVersion}/dialog/oauth`);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', config.callbackUrl);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', FACEBOOK_REQUIRED_PERMISSIONS.join(','));
  return url.toString();
}

function appSecretProof(token: string, appSecret: string) {
  return createHmac('sha256', appSecret).update(token, 'utf8').digest('hex');
}

function classifyMetaError(status: number, body: MetaError): FacebookProviderError {
  const code = typeof body.error?.code === 'number' ? body.error.code : null;
  const transient = body.error?.is_transient === true;
  if (status === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
    return new FacebookProviderError('rate_limit', 'Facebook temporarily limited this request.', true);
  }
  if (status === 401 || code === 190) return new FacebookProviderError('provider_auth', 'Facebook authorization is invalid or expired.');
  if (status === 403 || code === 10 || code === 200) return new FacebookProviderError('provider_permission', 'Facebook did not grant the required Page permission.');
  if (transient || status >= 500) return new FacebookProviderError('temporary_provider', 'Facebook is temporarily unavailable.', true);
  return new FacebookProviderError('internal', 'Facebook could not complete the request.');
}

async function metaJson<T>(fetcher: typeof fetch, url: URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetcher(url, { ...init, cache: 'no-store' }); }
  catch { throw new FacebookProviderError('provider_uncertain', 'Facebook could not be reached.', false, Boolean(init)); }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* sanitized below */ }
  if (!response.ok || !body || typeof body !== 'object') throw classifyMetaError(response.status, (body ?? {}) as MetaError);
  return body as T;
}

async function tokenExchange(fetcher: typeof fetch, config: FacebookMarketingConfig, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${config.graphApiVersion}/oauth/access_token`);
  const body = await metaJson<{ access_token?: unknown; expires_in?: unknown }>(fetcher, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (typeof body.access_token !== 'string' || body.access_token.length < 20) {
    throw new FacebookProviderError('provider_auth', 'Facebook did not return a usable authorization token.');
  }
  const expiresIn = typeof body.expires_in === 'number' && Number.isFinite(body.expires_in) && body.expires_in > 0
    ? Math.min(body.expires_in, 60 * 60 * 24 * 365)
    : null;
  return { accessToken: body.access_token, expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null };
}

export async function exchangeFacebookAuthorizationCode(
  config: FacebookMarketingConfig,
  code: string,
  fetcher: typeof fetch = fetch,
) {
  if (code.length < 8 || code.length > 4096) throw new FacebookProviderError('provider_auth', 'Facebook returned an invalid authorization code.');
  const short = await tokenExchange(fetcher, config, {
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.callbackUrl,
    code,
  });
  try {
    return await tokenExchange(fetcher, config, {
      grant_type: 'fb_exchange_token',
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: short.accessToken,
    });
  } catch (error) {
    if (error instanceof FacebookProviderError && error.category !== 'temporary_provider') throw error;
    return short;
  }
}

export async function discoverFacebookPages(
  config: FacebookMarketingConfig,
  userAccessToken: string,
  fetcher: typeof fetch = fetch,
) {
  const proof = appSecretProof(userAccessToken, config.appSecret);
  const meUrl = new URL(`https://graph.facebook.com/${config.graphApiVersion}/me`);
  meUrl.searchParams.set('fields', 'id');
  meUrl.searchParams.set('appsecret_proof', proof);
  const auth = { headers: { Authorization: `Bearer ${userAccessToken}` } };
  const me = await metaJson<{ id?: unknown }>(fetcher, meUrl, auth);
  if (typeof me.id !== 'string' || !/^\d{3,80}$/.test(me.id)) throw new FacebookProviderError('provider_auth', 'Facebook identity could not be validated.');

  const permissionsUrl = new URL(`https://graph.facebook.com/${config.graphApiVersion}/me/permissions`);
  permissionsUrl.searchParams.set('appsecret_proof', proof);
  const permissionBody = await metaJson<{ data?: unknown }>(fetcher, permissionsUrl, auth);
  const granted = Array.isArray(permissionBody.data)
    ? permissionBody.data.flatMap(item => item && typeof item === 'object'
      && (item as Record<string, unknown>).status === 'granted'
      && typeof (item as Record<string, unknown>).permission === 'string'
      ? [(item as Record<string, unknown>).permission as string]
      : [])
    : [];
  const requiredGranted = FACEBOOK_REQUIRED_PERMISSIONS.every(permission => granted.includes(permission));

  const pagesUrl = new URL(`https://graph.facebook.com/${config.graphApiVersion}/me/accounts`);
  pagesUrl.searchParams.set('fields', 'id,name,access_token,tasks');
  pagesUrl.searchParams.set('limit', '100');
  pagesUrl.searchParams.set('appsecret_proof', proof);
  const pagesBody = await metaJson<{ data?: unknown; paging?: unknown }>(fetcher, pagesUrl, auth);
  const rawPages = Array.isArray(pagesBody.data) ? pagesBody.data : [];
  const pages = rawPages.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const page = item as Record<string, unknown>;
    if (typeof page.id !== 'string' || !/^\d{3,80}$/.test(page.id)
      || typeof page.name !== 'string' || page.name.trim().length === 0 || page.name.length > 200
      || typeof page.access_token !== 'string' || page.access_token.length < 20) return [];
    const tasks = Array.isArray(page.tasks) ? page.tasks.filter((task): task is string => typeof task === 'string').slice(0, 30) : [];
    return [{
      safe: { page_id: page.id, page_name: page.name.trim(), tasks, eligible: requiredGranted && tasks.includes(FACEBOOK_REQUIRED_PAGE_TASK) } satisfies FacebookPageCandidate,
      accessToken: page.access_token,
    }];
  });
  return { providerUserId: me.id, grantedPermissions: granted.sort(), pages };
}

export async function validateFacebookPage(
  config: FacebookMarketingConfig,
  pageId: string,
  pageAccessToken: string,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(`https://graph.facebook.com/${config.graphApiVersion}/${pageId}`);
  url.searchParams.set('fields', 'id,name,tasks');
  url.searchParams.set('appsecret_proof', appSecretProof(pageAccessToken, config.appSecret));
  const body = await metaJson<{ id?: unknown; name?: unknown; tasks?: unknown }>(fetcher, url, {
    headers: { Authorization: `Bearer ${pageAccessToken}` },
  });
  if (body.id !== pageId || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw new FacebookProviderError('provider_auth', 'Facebook Page identity could not be validated.');
  }
  const tasks = Array.isArray(body.tasks) ? body.tasks.filter((task): task is string => typeof task === 'string') : [];
  if (!tasks.includes(FACEBOOK_REQUIRED_PAGE_TASK)) {
    throw new FacebookProviderError('provider_permission', 'The selected Facebook Page does not grant content publishing authority.');
  }
  return { pageId, pageName: body.name.trim(), tasks };
}

export function validateFacebookText(body: string) {
  const value = body.trim();
  if (!value || value.length > 63_206) {
    return new FacebookProviderError('content_validation', 'Facebook text must contain between 1 and 63,206 characters.');
  }
  return null;
}

export function facebookTextPublicationRequest(
  config: FacebookMarketingConfig,
  pageId: string,
  pageAccessToken: string,
  message: string,
) {
  const validation = validateFacebookText(message);
  if (validation) throw validation;
  const body = new URLSearchParams({
    message: message.trim(),
    appsecret_proof: appSecretProof(pageAccessToken, config.appSecret),
  });
  return {
    url: new URL(`https://graph.facebook.com/${config.graphApiVersion}/${pageId}/feed`),
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    } satisfies RequestInit,
  };
}
