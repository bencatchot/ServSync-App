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
