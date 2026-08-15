import {
  FacebookProviderError,
  facebookTextPublicationRequest,
  resolveFacebookMarketingConfig,
  validateFacebookText,
  type FacebookMarketingConfig,
} from './facebookMarketingConnection.js';

export type MarketingProvider = 'facebook' | 'instagram' | 'tiktok';
export type ProviderFailureCategory =
  | 'provider_auth'
  | 'provider_permission'
  | 'rate_limit'
  | 'content_validation'
  | 'temporary_provider'
  | 'provider_uncertain'
  | 'unsupported'
  | 'internal';

export type PublicationClaim = {
  publication_id: string;
  attempt_number: number;
  provider: MarketingProvider;
  provider_connection_id: string;
  destination_key: string;
  content_snapshot: { title?: string; body?: string; content_type?: string };
};

export type ProviderPublishResult = {
  providerPublicationId: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type ProviderPublishFailure = {
  category: ProviderFailureCategory;
  message: string;
  retryEligible: boolean;
  requestStarted: boolean;
};

export interface MarketingPublishingProviderAdapter {
  readonly provider: MarketingProvider;
  readonly capabilities: { text: boolean; media: boolean };
  getConnectionReadiness(): { status: 'setup_required' | 'connected'; reason: string };
  validatePublication(claim: PublicationClaim): ProviderPublishFailure | null;
  publishText(claim: PublicationClaim): Promise<ProviderPublishResult>;
}

const unavailable = (
  provider: MarketingProvider,
  capabilities: { text: boolean; media: boolean },
  reason: string,
): MarketingPublishingProviderAdapter => ({
  provider,
  capabilities,
  getConnectionReadiness: () => ({ status: 'setup_required', reason }),
  validatePublication: () => ({
    category: 'unsupported',
    message: reason,
    retryEligible: false,
    requestStarted: false,
  }),
  async publishText() {
    throw new Error('Provider publishing is unavailable.');
  },
});

export function createFacebookPublishingAdapter({
  config = resolveFacebookMarketingConfig(),
  getPageToken,
  fetcher = fetch,
}: {
  config?: FacebookMarketingConfig | null;
  getPageToken: (connectionId: string) => Promise<string>;
  fetcher?: typeof fetch;
}): MarketingPublishingProviderAdapter {
  const readiness = () => {
    if (!config) return { status: 'setup_required' as const, reason: 'Facebook Page setup and owner authorization are required.' };
    if (!config.publicPostsEnabled) return { status: 'setup_required' as const, reason: 'Facebook is connected for readiness only; public posting remains owner-gated.' };
    return { status: 'connected' as const, reason: 'Facebook Page text publishing is enabled.' };
  };
  return {
    provider: 'facebook',
    capabilities: { text: true, media: false },
    getConnectionReadiness: readiness,
    validatePublication(claim) {
      const connection = readiness();
      if (connection.status !== 'connected') return {
        category: 'unsupported', message: connection.reason, retryEligible: false, requestStarted: false,
      };
      if (!/^\d{3,80}$/.test(claim.destination_key)) return {
        category: 'provider_auth', message: 'The Facebook Page destination is invalid.', retryEligible: false, requestStarted: false,
      };
      const validation = validateFacebookText(claim.content_snapshot.body ?? '');
      return validation ? {
        category: validation.category,
        message: validation.message,
        retryEligible: validation.retryEligible,
        requestStarted: validation.requestStarted,
      } : null;
    },
    async publishText(claim) {
      if (!config?.publicPostsEnabled) throw new FacebookProviderError('unsupported', 'Facebook public posting is not enabled.');
      const pageToken = await getPageToken(claim.provider_connection_id);
      const request = facebookTextPublicationRequest(config, claim.destination_key, pageToken, claim.content_snapshot.body ?? '');
      let response: Response;
      try { response = await fetcher(request.url, { ...request.init, cache: 'no-store' }); }
      catch { throw new FacebookProviderError('provider_uncertain', 'The Facebook post result could not be confirmed.', false, true); }
      let result: unknown = null;
      try { result = await response.json(); } catch { /* sanitized below */ }
      if (!response.ok || !result || typeof result !== 'object' || typeof (result as Record<string, unknown>).id !== 'string') {
        throw new FacebookProviderError(
          response.status === 429 ? 'rate_limit' : response.status >= 500 ? 'provider_uncertain' : 'provider_permission',
          response.status >= 500
            ? 'The Facebook post result could not be confirmed.'
            : 'Facebook rejected the publication request.',
          false,
          true,
        );
      }
      return { providerPublicationId: (result as Record<string, string>).id, metadata: { page_id: claim.destination_key } };
    },
  };
}

// Provider setup and OAuth/token storage are intentionally absent. These
// adapters express truthful capability/readiness without mocking success.
export const marketingPublishingProviders: Record<MarketingProvider, MarketingPublishingProviderAdapter> = {
  facebook: unavailable(
    'facebook',
    { text: true, media: false },
    'Facebook Page setup and owner authorization are required.',
  ),
  instagram: unavailable(
    'instagram',
    { text: false, media: true },
    'Instagram media publishing is not enabled.',
  ),
  tiktok: unavailable(
    'tiktok',
    { text: false, media: true },
    'TikTok Content Posting access is not enabled.',
  ),
};

export function sanitizeProviderFailure(error: unknown): ProviderPublishFailure {
  if (error instanceof FacebookProviderError) {
    return {
      category: error.category,
      message: error.message,
      retryEligible: error.retryEligible,
      requestStarted: error.requestStarted,
    };
  }
  const message = error instanceof Error ? error.message : '';
  if (/timeout|network|fetch/i.test(message)) {
    return {
      category: 'provider_uncertain',
      message: 'The provider result could not be confirmed. Automatic retry is disabled to prevent a duplicate post.',
      retryEligible: false,
      requestStarted: true,
    };
  }
  return {
    category: 'internal',
    message: 'The provider request could not be completed.',
    retryEligible: false,
    requestStarted: false,
  };
}
