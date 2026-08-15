export const MARKETING_PROVIDERS = ['facebook', 'instagram', 'tiktok'] as const;
export const MARKETING_PUBLICATION_STATUSES = ['scheduled', 'publishing', 'published', 'failed', 'cancelled'] as const;

export type MarketingProvider = (typeof MARKETING_PROVIDERS)[number];
export type MarketingPublicationStatus = (typeof MARKETING_PUBLICATION_STATUSES)[number];
export type MarketingPublicationMode = 'publish_now' | 'scheduled';

export type MarketingProviderConnection = {
  id: string;
  provider: MarketingProvider;
  priority: number;
  status: 'setup_required' | 'connected' | 'disabled' | 'error';
  destinationLabel: string | null;
  capabilities: { text: boolean; media: boolean };
  readinessNote: string;
  connectedAt: string | null;
};

export type MarketingPublication = {
  id: string;
  contentId: string;
  contentRevision: number;
  snapshot: { title: string; body: string; content_type: string; content_revision: number };
  provider: MarketingProvider;
  destinationLabel: string;
  mode: MarketingPublicationMode;
  scheduledAt: string;
  status: MarketingPublicationStatus;
  attemptCount: number;
  maxAttempts: number;
  retryEligible: boolean;
  providerPublicationId: string | null;
  failureCategory: string | null;
  failureMessage: string | null;
  createdAt: string;
  publishingStartedAt: string | null;
  publishedAt: string | null;
  cancelledAt: string | null;
};

export type MarketingPublishingState = {
  providers: MarketingProviderConnection[];
  publications: MarketingPublication[];
};

type RpcResult = { data: unknown; error: unknown };
export interface MarketingPublishingRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

export class MarketingPublishingAdapterError extends Error {
  constructor(public readonly kind: 'unauthorized' | 'stale' | 'ambiguous' | 'rpc' | 'malformed', message: string) {
    super(message);
    this.name = 'MarketingPublishingAdapterError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableTimestamp = (value: unknown): value is string | null => value === null || timestamp(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const localPath = (value: string) => /(^|\s)(file:\/\/|\/Users\/|\/private\/tmp\/|~\/Documents\/)/i.test(value);

function malformed(): never {
  throw new MarketingPublishingAdapterError('malformed', 'ServSync received an invalid publishing response.');
}

function parseState(value: unknown): MarketingPublishingState {
  if (!record(value) || !Array.isArray(value.providers) || !Array.isArray(value.publications)) malformed();
  const providers = value.providers.map(provider => {
    if (!record(provider) || typeof provider.connection_id !== 'string' || !UUID.test(provider.connection_id)
      || !MARKETING_PROVIDERS.includes(provider.provider as MarketingProvider)
      || typeof provider.priority !== 'number' || !Number.isInteger(provider.priority)
      || !['setup_required', 'connected', 'disabled', 'error'].includes(String(provider.connection_status))
      || !nullableString(provider.destination_label) || (typeof provider.destination_label === 'string' && localPath(provider.destination_label)) || !record(provider.capabilities)
      || typeof provider.capabilities.text !== 'boolean' || typeof provider.capabilities.media !== 'boolean'
      || typeof provider.readiness_note !== 'string' || !nullableTimestamp(provider.connected_at)) malformed();
    return {
      id: provider.connection_id,
      provider: provider.provider as MarketingProvider,
      priority: provider.priority,
      status: provider.connection_status as MarketingProviderConnection['status'],
      destinationLabel: provider.destination_label,
      capabilities: { text: provider.capabilities.text, media: provider.capabilities.media },
      readinessNote: provider.readiness_note,
      connectedAt: provider.connected_at,
    };
  });
  const publications = value.publications.map(publication => {
    if (!record(publication) || typeof publication.publication_id !== 'string' || !UUID.test(publication.publication_id)
      || typeof publication.content_id !== 'string' || !UUID.test(publication.content_id)
      || typeof publication.content_revision !== 'number' || !Number.isSafeInteger(publication.content_revision)
      || !record(publication.content_snapshot) || typeof publication.content_snapshot.title !== 'string'
      || typeof publication.content_snapshot.body !== 'string' || typeof publication.content_snapshot.content_type !== 'string'
      || typeof publication.content_snapshot.content_revision !== 'number'
      || !MARKETING_PROVIDERS.includes(publication.provider as MarketingProvider)
      || typeof publication.destination_label !== 'string'
      || !['publish_now', 'scheduled'].includes(String(publication.publication_mode))
      || !timestamp(publication.scheduled_at)
      || !MARKETING_PUBLICATION_STATUSES.includes(publication.status as MarketingPublicationStatus)
      || typeof publication.attempt_count !== 'number' || typeof publication.max_attempts !== 'number'
      || typeof publication.retry_eligible !== 'boolean' || !nullableString(publication.provider_publication_id)
      || !nullableString(publication.failure_category) || !nullableString(publication.failure_message)
      || !timestamp(publication.created_at) || !nullableTimestamp(publication.publishing_started_at)
      || !nullableTimestamp(publication.published_at) || !nullableTimestamp(publication.cancelled_at)) malformed();
    return {
      id: publication.publication_id,
      contentId: publication.content_id,
      contentRevision: publication.content_revision,
      snapshot: publication.content_snapshot as MarketingPublication['snapshot'],
      provider: publication.provider as MarketingProvider,
      destinationLabel: publication.destination_label,
      mode: publication.publication_mode as MarketingPublicationMode,
      scheduledAt: publication.scheduled_at,
      status: publication.status as MarketingPublicationStatus,
      attemptCount: publication.attempt_count,
      maxAttempts: publication.max_attempts,
      retryEligible: publication.retry_eligible,
      providerPublicationId: publication.provider_publication_id,
      failureCategory: publication.failure_category,
      failureMessage: publication.failure_message,
      createdAt: publication.created_at,
      publishingStartedAt: publication.publishing_started_at,
      publishedAt: publication.published_at,
      cancelledAt: publication.cancelled_at,
    };
  });
  return { providers, publications };
}

function errorFor(value: unknown, mutation: boolean) {
  const server = record(value) ? String(value.message ?? '') : '';
  const code = record(value) ? String(value.code ?? '') : '';
  if (code === '42501') return new MarketingPublishingAdapterError('unauthorized', 'Internal Marketing publishing is unavailable for this account.');
  if (code === '40001' || server.includes('changed; reload')) return new MarketingPublishingAdapterError('stale', 'This record changed. Reload before continuing.');
  if (server.includes('Provider setup is required')) return new MarketingPublishingAdapterError('rpc', 'Connect the selected provider before publishing.');
  return new MarketingPublishingAdapterError('rpc', mutation ? 'ServSync could not save this publication.' : 'ServSync could not load publishing.');
}

async function rpc(client: MarketingPublishingRpcClient, name: string, args: Record<string, unknown>, mutation: boolean) {
  try {
    const result = await client.rpc(name, args);
    if (result.error) throw errorFor(result.error, mutation);
    return result.data;
  } catch (error) {
    if (error instanceof MarketingPublishingAdapterError) throw error;
    throw new MarketingPublishingAdapterError(mutation ? 'ambiguous' : 'rpc', mutation
      ? 'The publication result could not be confirmed. Reload before trying again.'
      : 'ServSync could not load publishing.');
  }
}

function receipt(value: unknown) {
  if (!record(value) || typeof value.publication_id !== 'string' || !UUID.test(value.publication_id)
    || !MARKETING_PUBLICATION_STATUSES.includes(value.status as MarketingPublicationStatus)) malformed();
  return { id: value.publication_id, status: value.status as MarketingPublicationStatus, replayed: value.replayed === true };
}

export function createMarketingPublishingAdapter(client: MarketingPublishingRpcClient) {
  return {
    async get() { return parseState(await rpc(client, 'servsync_get_internal_marketing_publishing', {}, false)); },
    async create(input: {
      requestId: string; contentId: string; contentRevision: number; provider: MarketingProvider;
      connectionId: string; mode: MarketingPublicationMode; scheduledAt: string | null;
    }) {
      return receipt(await rpc(client, 'servsync_create_internal_marketing_publication', {
        p_client_request_id: input.requestId,
        p_content_id: input.contentId,
        p_expected_content_revision: input.contentRevision,
        p_provider: input.provider,
        p_provider_connection_id: input.connectionId,
        p_publication_mode: input.mode,
        p_scheduled_at: input.scheduledAt,
      }, true));
    },
    async cancel(publicationId: string) {
      return receipt(await rpc(client, 'servsync_cancel_internal_marketing_publication', { p_publication_id: publicationId }, true));
    },
    async retry(publicationId: string) {
      return receipt(await rpc(client, 'servsync_retry_internal_marketing_publication', { p_publication_id: publicationId }, true));
    },
  };
}
