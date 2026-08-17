import { createHash } from 'node:crypto';
import {
  FacebookProviderError,
  facebookTextPublicationRequest,
  facebookVideoConfirmationRequest,
  facebookVideoPublicationRequest,
  resolveFacebookMarketingConfig,
  validateFacebookText,
  type FacebookMarketingConfig,
} from './facebookMarketingConnection.js';
import { publicMessageForProvider } from '../src/features/marketing/marketingPublicationPreview.js';

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
  operation?: 'publish' | 'reconcile';
  provider: MarketingProvider;
  provider_connection_id: string;
  destination_key: string;
  content_revision?: number;
  content_snapshot: { title?: string; body?: string; content_type?: string; content_revision?: number };
  media_pairing_id?: string | null;
  media_snapshot?: {
    pairing_id?: string;
    asset_id?: string;
    storage_bucket?: string;
    storage_path?: string;
    mime_type?: string;
    sha256?: string;
    file_size_bytes?: number;
    media_variant?: string;
    ai_narration_disclosure_text?: string;
  } | null;
  provider_publication_id?: string | null;
  provider_metadata?: Record<string, unknown> | null;
  provider_reconciliation_count?: number;
};

export type ManagedMediaFile = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: 'video/mp4';
  assetId: string;
  sha256: string;
};

export type PreparedProviderPublication = {
  claim: PublicationClaim;
  pageToken: string;
  publicMessage: string;
  media: ManagedMediaFile | null;
};

export type ProviderPublishResult = {
  providerPublicationId: string;
  state: 'published' | 'accepted';
  metadata: Record<string, string | number | boolean | null>;
};

export type ProviderReconciliationResult = {
  state: 'published' | 'processing';
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
  preparePublication(claim: PublicationClaim): Promise<PreparedProviderPublication>;
  publish(prepared: PreparedProviderPublication): Promise<ProviderPublishResult>;
  reconcile(prepared: PreparedProviderPublication): Promise<ProviderReconciliationResult>;
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
    category: 'unsupported', message: reason, retryEligible: false, requestStarted: false,
  }),
  async preparePublication() { throw new Error('Provider publishing is unavailable.'); },
  async publish() { throw new Error('Provider publishing is unavailable.'); },
  async reconcile() { throw new Error('Provider publishing is unavailable.'); },
});

function facebookResponseFailure(response: Response, uncertainMessage: string) {
  if (response.status === 401) return new FacebookProviderError('provider_auth', 'Facebook authorization is invalid or expired.', false, true);
  if (response.status === 403) return new FacebookProviderError('provider_permission', 'Facebook rejected the Page publication request.', false, true);
  if (response.status === 429) return new FacebookProviderError('rate_limit', 'Facebook temporarily limited this request.', false, true);
  if (response.status >= 500) return new FacebookProviderError('provider_uncertain', uncertainMessage, false, true);
  return new FacebookProviderError('content_validation', 'Facebook rejected the video publication request.', false, true);
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateManagedVideoClaim(claim: PublicationClaim): ProviderPublishFailure | null {
  const media = claim.media_snapshot;
  const pathParts = media?.storage_path?.split('/') ?? [];
  if (!media || !claim.media_pairing_id || !uuid(claim.media_pairing_id)
    || media.pairing_id !== claim.media_pairing_id || !uuid(media.asset_id)
    || media.storage_bucket !== 'marketing-assets'
    || pathParts.length !== 3 || !uuid(pathParts[0]) || pathParts[1] !== media.asset_id
    || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}\.mp4$/.test(pathParts[2] ?? '')
    || media.mime_type !== 'video/mp4'
    || typeof media.file_size_bytes !== 'number' || !Number.isSafeInteger(media.file_size_bytes)
    || media.file_size_bytes < 1 || media.file_size_bytes > 104_857_600
    || typeof media.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(media.sha256)
    || !['silent_product_demo_master', 'narrated_marketing_derivative'].includes(String(media.media_variant))) {
    return {
      category: 'content_validation', message: 'The approved managed video snapshot is invalid.',
      retryEligible: false, requestStarted: false,
    };
  }
  const disclosure = media.ai_narration_disclosure_text;
  if (media.media_variant === 'narrated_marketing_derivative'
    && (typeof disclosure !== 'string' || !claim.content_snapshot.body?.includes(disclosure))) {
    return {
      category: 'content_validation',
      message: 'The approved public message is missing the required AI narration disclosure.',
      retryEligible: false,
      requestStarted: false,
    };
  }
  return null;
}

export function createFacebookPublishingAdapter({
  config = resolveFacebookMarketingConfig(),
  getPageToken,
  getManagedMedia,
  fetcher = fetch,
}: {
  config?: FacebookMarketingConfig | null;
  getPageToken: (connectionId: string) => Promise<string>;
  getManagedMedia?: (claim: PublicationClaim) => Promise<ManagedMediaFile>;
  fetcher?: typeof fetch;
}): MarketingPublishingProviderAdapter {
  const readiness = () => {
    if (!config) return { status: 'setup_required' as const, reason: 'Facebook Page setup and owner authorization are required.' };
    if (!config.publicPostsEnabled) return { status: 'setup_required' as const, reason: 'Facebook is connected for readiness only; public posting remains owner-gated.' };
    return { status: 'connected' as const, reason: 'Facebook Page text and managed-video publishing are enabled.' };
  };
  return {
    provider: 'facebook',
    capabilities: { text: true, media: true },
    getConnectionReadiness: readiness,
    validatePublication(claim) {
      const connection = readiness();
      if (connection.status !== 'connected') return {
        category: 'unsupported', message: connection.reason, retryEligible: false, requestStarted: false,
      };
      if (!/^\d{3,80}$/.test(claim.destination_key)) return {
        category: 'provider_auth', message: 'The Facebook Page destination is invalid.', retryEligible: false, requestStarted: false,
      };
      if (claim.operation === 'reconcile' && !/^\d{3,80}$/.test(claim.provider_publication_id ?? '')) return {
        category: 'provider_uncertain', message: 'The accepted Facebook Video ID is unavailable.', retryEligible: false, requestStarted: true,
      };
      if (claim.media_snapshot) {
        const mediaFailure = validateManagedVideoClaim(claim);
        if (mediaFailure) return mediaFailure;
        if (!getManagedMedia && claim.operation !== 'reconcile') return {
          category: 'unsupported', message: 'Managed Marketing media retrieval is unavailable.', retryEligible: false, requestStarted: false,
        };
      }
      const validation = validateFacebookText(publicMessageForProvider('facebook', claim.content_snapshot));
      return validation ? {
        category: validation.category,
        message: validation.message,
        retryEligible: validation.retryEligible,
        requestStarted: validation.requestStarted,
      } : null;
    },
    async preparePublication(claim) {
      if (!config?.publicPostsEnabled) throw new FacebookProviderError('unsupported', 'Facebook public posting is not enabled.');
      const pageToken = await getPageToken(claim.provider_connection_id);
      const publicMessage = publicMessageForProvider('facebook', claim.content_snapshot);
      const media = claim.media_snapshot && claim.operation !== 'reconcile'
        ? await getManagedMedia!(claim)
        : null;
      if (media && (media.assetId !== claim.media_snapshot?.asset_id || media.sha256 !== claim.media_snapshot.sha256)) {
        throw new FacebookProviderError('content_validation', 'The managed Marketing video does not match the approved snapshot.');
      }
      return { claim, pageToken, publicMessage, media };
    },
    async publish(prepared): Promise<ProviderPublishResult> {
      if (!config?.publicPostsEnabled) throw new FacebookProviderError('unsupported', 'Facebook public posting is not enabled.');
      if (!prepared.claim.media_snapshot) {
        const request = facebookTextPublicationRequest(
          config, prepared.claim.destination_key, prepared.pageToken, prepared.publicMessage,
        );
        let response: Response;
        try { response = await fetcher(request.url, { ...request.init, cache: 'no-store' }); }
        catch { throw new FacebookProviderError('provider_uncertain', 'The Facebook post result could not be confirmed.', false, true); }
        let result: unknown = null;
        try { result = await response.json(); } catch { /* sanitized below */ }
        if (!response.ok || !result || typeof result !== 'object' || typeof (result as Record<string, unknown>).id !== 'string') {
          throw facebookResponseFailure(response, 'The Facebook post result could not be confirmed.');
        }
        return {
          providerPublicationId: (result as Record<string, string>).id,
          state: 'published',
          metadata: { page_id: prepared.claim.destination_key, provider_identifier_kind: 'page_post_id' },
        };
      }
      if (!prepared.media) throw new FacebookProviderError('content_validation', 'The required managed Marketing video is unavailable.');
      const request = facebookVideoPublicationRequest(
        config, prepared.claim.destination_key, prepared.pageToken, prepared.publicMessage, prepared.media,
      );
      let response: Response;
      try { response = await fetcher(request.url, { ...request.init, cache: 'no-store' }); }
      catch { throw new FacebookProviderError('provider_uncertain', 'The Facebook video upload result could not be confirmed. Automatic retry is disabled.', false, true); }
      let result: unknown = null;
      try { result = await response.json(); } catch { /* sanitized below */ }
      const responseBody = result && typeof result === 'object' ? result as Record<string, unknown> : null;
      const responseId = typeof responseBody?.id === 'string' && /^\d{3,80}$/.test(responseBody.id)
        ? responseBody.id : null;
      const responseVideoId = typeof responseBody?.video_id === 'string' && /^\d{3,80}$/.test(responseBody.video_id)
        ? responseBody.video_id : null;
      const videoId = responseId ?? responseVideoId;
      if (!response.ok || !videoId || (responseId && responseVideoId && responseId !== responseVideoId)) {
        if (response.ok) {
          throw new FacebookProviderError(
            'provider_uncertain',
            'Facebook accepted the video request without a usable Video ID. Automatic retry is disabled.',
            false,
            true,
          );
        }
        throw facebookResponseFailure(response, 'The Facebook video upload result could not be confirmed. Automatic retry is disabled.');
      }
      return {
        providerPublicationId: videoId,
        state: 'accepted',
        metadata: {
          page_id: prepared.claim.destination_key,
          provider_identifier_kind: 'video_id',
          provider_response_identifier_fields: responseId && responseVideoId
            ? 'id+video_id' : responseId ? 'id' : 'video_id',
          provider_state: 'accepted',
          upload_method: 'page_videos_multipart_source',
          media_pairing_id: prepared.claim.media_pairing_id ?? null,
          asset_id: prepared.media.assetId,
          asset_sha256: prepared.media.sha256,
          message_sha256: createHash('sha256').update(prepared.publicMessage, 'utf8').digest('hex'),
        },
      };
    },
    async reconcile(prepared): Promise<ProviderReconciliationResult> {
      if (!config?.publicPostsEnabled) throw new FacebookProviderError('unsupported', 'Facebook public posting is not enabled.');
      const videoId = prepared.claim.provider_publication_id;
      if (!videoId) throw new FacebookProviderError('provider_uncertain', 'The accepted Facebook Video ID is unavailable.', false, true);
      const request = facebookVideoConfirmationRequest(config, videoId, prepared.pageToken);
      let response: Response;
      try { response = await fetcher(request.url, { ...request.init, cache: 'no-store' }); }
      catch { return { state: 'processing', metadata: { provider_state: 'confirmation_unavailable' } }; }
      let result: unknown = null;
      try { result = await response.json(); } catch { /* sanitized below */ }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw facebookResponseFailure(response, 'The Facebook video confirmation result could not be confirmed.');
        }
        return {
          state: 'processing',
          metadata: { provider_state: 'confirmation_pending', confirmation_http_status: response.status },
        };
      }
      if (!result || typeof result !== 'object') {
        return { state: 'processing', metadata: { provider_state: 'confirmation_pending' } };
      }
      const video = result as Record<string, unknown>;
      if (video.id !== videoId) throw new FacebookProviderError('provider_uncertain', 'Facebook returned a mismatched Video ID.', false, true);
      if (typeof video.created_time !== 'string' || video.created_time.length === 0) {
        return { state: 'processing', metadata: { provider_state: 'processing' } };
      }
      if (video.description !== prepared.publicMessage) {
        throw new FacebookProviderError('content_validation', 'Facebook did not preserve the exact approved public message.', false, true);
      }
      return {
        state: 'published',
        metadata: { provider_state: 'confirmed', provider_created_time: video.created_time },
      };
    },
  };
}

export const marketingPublishingProviders: Record<MarketingProvider, MarketingPublishingProviderAdapter> = {
  facebook: unavailable('facebook', { text: true, media: true }, 'Facebook Page setup and owner authorization are required.'),
  instagram: unavailable('instagram', { text: false, media: true }, 'Instagram media publishing is not enabled.'),
  tiktok: unavailable('tiktok', { text: false, media: true }, 'TikTok Content Posting access is not enabled.'),
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
