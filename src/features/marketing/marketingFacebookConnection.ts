type SessionResult = { data: { session?: { access_token?: string } | null } | null; error: unknown };

export interface MarketingFacebookAuthClient {
  auth: { getSession(): PromiseLike<SessionResult> };
}

export class MarketingFacebookConnectionError extends Error {}

const RETURN_STATUSES = ['page_selection_required', 'connected', 'failed'] as const;

export function marketingFacebookReturnStatus(search: string) {
  const value = new URLSearchParams(search).get('marketing_facebook');
  return RETURN_STATUSES.includes(value as (typeof RETURN_STATUSES)[number])
    ? value as (typeof RETURN_STATUSES)[number]
    : null;
}

async function accessToken(client: MarketingFacebookAuthClient) {
  const result = await client.auth.getSession();
  const token = result.data?.session?.access_token;
  if (result.error || typeof token !== 'string' || token.length < 20) {
    throw new MarketingFacebookConnectionError('Sign in again before managing Facebook.');
  }
  return token;
}

async function request(client: MarketingFacebookAuthClient, path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Authorization: `Bearer ${await accessToken(client)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== 'object') {
    const reason = result && typeof result === 'object' && 'reason' in result ? String(result.reason) : '';
    if (reason === 'facebook_setup_required') throw new MarketingFacebookConnectionError('Meta app setup is required before Facebook can be connected.');
    if (reason === 'provider_auth') throw new MarketingFacebookConnectionError('Facebook authorization expired. Connect again.');
    if (reason === 'provider_permission') throw new MarketingFacebookConnectionError('Facebook did not grant the required Page permission.');
    throw new MarketingFacebookConnectionError('ServSync could not complete the Facebook connection action.');
  }
  return result as Record<string, unknown>;
}

export function createMarketingFacebookConnectionAdapter(client: MarketingFacebookAuthClient) {
  return {
    async start() {
      const result = await request(client, '/api/marketing-facebook-oauth-start', {});
      if (result.status !== 'authorization_required' || typeof result.authorization_url !== 'string') {
        throw new MarketingFacebookConnectionError('ServSync did not receive a safe Facebook authorization URL.');
      }
      const url = new URL(result.authorization_url);
      if (url.protocol !== 'https:' || url.hostname !== 'www.facebook.com') {
        throw new MarketingFacebookConnectionError('ServSync refused an invalid Facebook authorization destination.');
      }
      window.location.assign(url.toString());
    },
    async selectPage(sessionId: string, pageId: string) {
      await request(client, '/api/marketing-facebook-connection', { action: 'select_page', session_id: sessionId, page_id: pageId });
    },
    async recheck() { await request(client, '/api/marketing-facebook-connection', { action: 'recheck' }); },
    async disconnect() { await request(client, '/api/marketing-facebook-connection', { action: 'disconnect' }); },
  };
}
