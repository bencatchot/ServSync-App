export const MARKETING_PROVIDERS = ['facebook', 'instagram', 'tiktok'] as const;
export const MARKETING_PUBLICATION_STATUSES = ['scheduled', 'publishing', 'published', 'failed', 'cancelled'] as const;
export const MARKETING_PACKAGE_STATUSES = ['needs_review', 'ready', 'scheduled', 'publishing', 'published', 'needs_attention', 'retired'] as const;

export type MarketingProvider = (typeof MARKETING_PROVIDERS)[number];
export type MarketingPublicationStatus = (typeof MARKETING_PUBLICATION_STATUSES)[number];
export type MarketingPackageStatus = (typeof MARKETING_PACKAGE_STATUSES)[number];
export type MarketingPublicationMode = 'publish_now' | 'scheduled';

export type MarketingProviderConnection = {
  id: string;
  provider: MarketingProvider;
  priority: number;
  status: 'setup_required' | 'connected' | 'disabled' | 'error';
  readinessStatus: 'setup_required' | 'authorization_pending' | 'page_selection_required' | 'ready' | 'reconnect_required' | 'disconnected' | 'error';
  destinationLabel: string | null;
  capabilities: { text: boolean; media: boolean; publishingEnabled: boolean };
  readinessNote: string;
  connectedAt: string | null;
  lastValidatedAt: string | null;
  tokenExpiresAt: string | null;
  identityRevision: number;
};

export type MarketingFacebookSetup = {
  sessionId: string;
  status: 'page_selection_required';
  expiresAt: string;
  candidatePages: Array<{ pageId: string; pageName: string; tasks: string[]; eligible: boolean }>;
};

export type MarketingQueueAsset = {
  id: string;
  type: 'image' | 'video';
  source: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  sha256: string;
  mediaVariant: string;
  lifecycleState: string;
  storageBucket: string | null;
  storagePath: string | null;
  posterBucket: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  purgedAt: string | null;
  disclosureRequired: boolean;
  disclosureText: string | null;
  createdAt: string;
};

export type MarketingQueuePairing = {
  id: string;
  contentId: string;
  contentRevision: number;
  assetId: string;
  claimDemonstrated: string;
  status: 'candidate' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
};

export type MarketingPublicationPackage = {
  id: string;
  fingerprint: string;
  contentId: string;
  contentRevision: number;
  snapshot: { title: string; body: string; content_type: string; content_revision: number };
  mediaPairingId: string | null;
  mediaSnapshot: Record<string, unknown> | null;
  provider: MarketingProvider;
  connectionId: string;
  connectionRevision: number;
  destinationLabel: string;
  status: MarketingPackageStatus;
  previewedAt: string | null;
  approvedAt: string | null;
  requiredDisclosures: string[];
  retiredReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketingPublication = {
  id: string;
  packageId: string;
  packageFingerprint: string;
  contentId: string;
  contentRevision: number;
  snapshot: MarketingPublicationPackage['snapshot'];
  mediaPairingId: string | null;
  mediaSnapshot: Record<string, unknown> | null;
  provider: MarketingProvider;
  destinationLabel: string;
  mode: MarketingPublicationMode;
  scheduledAt: string;
  timezone: string;
  status: MarketingPublicationStatus;
  attemptCount: number;
  maxAttempts: number;
  retryEligible: boolean;
  replacementEligible: boolean;
  providerPublicationId: string | null;
  providerPermalink: string | null;
  failureCategory: string | null;
  failureMessage: string | null;
  createdAt: string;
  publishingStartedAt: string | null;
  publishedAt: string | null;
  cancelledAt: string | null;
};

export type MarketingPublishingState = {
  workspace: { id: string; kind: 'internal' | 'contractor'; displayName: string };
  operationAvailable: boolean;
  preparedLimit: number;
  preparedCount: number;
  providers: MarketingProviderConnection[];
  facebookSetup: MarketingFacebookSetup | null;
  packages: MarketingPublicationPackage[];
  publications: MarketingPublication[];
  assets: MarketingQueueAsset[];
  pairings: MarketingQueuePairing[];
};

type RpcResult = { data: unknown; error: unknown };
type SignedUrlResult = PromiseLike<{ data: { signedUrl?: string } | null; error: unknown }>;
export interface MarketingPublishingRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  storage?: { from(bucket: string): { createSignedUrl(path: string, expiresIn: number): SignedUrlResult } };
}

export class MarketingPublishingAdapterError extends Error {
  constructor(public readonly kind: 'unauthorized' | 'stale' | 'ambiguous' | 'rpc' | 'malformed', message: string) {
    super(message);
    this.name = 'MarketingPublishingAdapterError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableTimestamp = (value: unknown): value is string | null => value === null || timestamp(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

function malformed(): never {
  throw new MarketingPublishingAdapterError('malformed', 'ServSync received an invalid publishing response.');
}

function errorFor(value: unknown, mutation: boolean) {
  const server = record(value) ? String(value.message ?? '') : '';
  const code = record(value) ? String(value.code ?? '') : '';
  if (code === '42501') return new MarketingPublishingAdapterError('unauthorized', 'Marketing publishing is unavailable for this account.');
  if (code === '40001' || server.includes('changed; reload')) return new MarketingPublishingAdapterError('stale', 'This post changed. Reload before continuing.');
  if (server.includes('allowance is full')) return new MarketingPublishingAdapterError('rpc', 'The beta prepared-post limit is full. Publish or cancel an active item first.');
  if (server.includes('Provider setup is required')) return new MarketingPublishingAdapterError('rpc', 'Connect the selected destination before publishing.');
  if (server.includes('safe retry')) return new MarketingPublishingAdapterError('rpc', 'This result needs review and cannot be retried safely.');
  return new MarketingPublishingAdapterError('rpc', mutation ? 'ServSync could not save this publishing action.' : 'ServSync could not load publishing.');
}

async function rpc(client: MarketingPublishingRpcClient, name: string, args: Record<string, unknown>, mutation: boolean) {
  try {
    const result = await client.rpc(name, args);
    if (result.error) throw errorFor(result.error, mutation);
    return result.data;
  } catch (error) {
    if (error instanceof MarketingPublishingAdapterError) throw error;
    throw new MarketingPublishingAdapterError(mutation ? 'ambiguous' : 'rpc', mutation
      ? 'The publishing result could not be confirmed. Reload before trying again.'
      : 'ServSync could not load publishing.');
  }
}

function parseProvider(value: unknown): MarketingProviderConnection {
  if (!record(value) || typeof value.connection_id !== 'string' || !UUID.test(value.connection_id)
    || !MARKETING_PROVIDERS.includes(value.provider as MarketingProvider)
    || typeof value.priority !== 'number' || !Number.isInteger(value.priority)
    || !['setup_required', 'connected', 'disabled', 'error'].includes(String(value.connection_status))
    || !['setup_required', 'authorization_pending', 'page_selection_required', 'ready', 'reconnect_required', 'disconnected', 'error'].includes(String(value.readiness_status))
    || !nullableString(value.destination_label) || !record(value.capabilities)
    || typeof value.capabilities.text !== 'boolean' || typeof value.capabilities.media !== 'boolean'
    || typeof value.readiness_note !== 'string' || !nullableTimestamp(value.connected_at)
    || !nullableTimestamp(value.last_validated_at) || !nullableTimestamp(value.token_expires_at)
    || typeof value.identity_revision !== 'number' || !Number.isSafeInteger(value.identity_revision)) malformed();
  return {
    id: value.connection_id,
    provider: value.provider as MarketingProvider,
    priority: value.priority,
    status: value.connection_status as MarketingProviderConnection['status'],
    readinessStatus: value.readiness_status as MarketingProviderConnection['readinessStatus'],
    destinationLabel: value.destination_label,
    capabilities: {
      text: value.capabilities.text,
      media: value.capabilities.media,
      publishingEnabled: value.capabilities.publishing_enabled === true,
    },
    readinessNote: value.readiness_note,
    connectedAt: value.connected_at,
    lastValidatedAt: value.last_validated_at,
    tokenExpiresAt: value.token_expires_at,
    identityRevision: value.identity_revision,
  };
}

function parsePackage(value: unknown): MarketingPublicationPackage {
  if (!record(value) || typeof value.package_id !== 'string' || !UUID.test(value.package_id)
    || typeof value.package_fingerprint !== 'string' || !SHA.test(value.package_fingerprint)
    || typeof value.content_id !== 'string' || !UUID.test(value.content_id)
    || typeof value.content_revision !== 'number' || !Number.isSafeInteger(value.content_revision)
    || !record(value.content_snapshot) || typeof value.content_snapshot.title !== 'string'
    || typeof value.content_snapshot.body !== 'string' || typeof value.content_snapshot.content_type !== 'string'
    || typeof value.content_snapshot.content_revision !== 'number'
    || !(value.media_pairing_id === null || (typeof value.media_pairing_id === 'string' && UUID.test(value.media_pairing_id)))
    || !(value.media_snapshot === null || record(value.media_snapshot))
    || !MARKETING_PROVIDERS.includes(value.provider as MarketingProvider)
    || typeof value.connection_id !== 'string' || !UUID.test(value.connection_id)
    || typeof value.connection_revision !== 'number' || !Number.isSafeInteger(value.connection_revision)
    || typeof value.destination_label !== 'string'
    || !MARKETING_PACKAGE_STATUSES.includes(value.status as MarketingPackageStatus)
    || !nullableTimestamp(value.previewed_at) || !nullableTimestamp(value.approved_at)
    || !Array.isArray(value.required_disclosures) || !value.required_disclosures.every(item => typeof item === 'string')
    || !nullableString(value.retired_reason) || !timestamp(value.created_at) || !timestamp(value.updated_at)) malformed();
  return {
    id: value.package_id, fingerprint: value.package_fingerprint,
    contentId: value.content_id, contentRevision: value.content_revision,
    snapshot: value.content_snapshot as MarketingPublicationPackage['snapshot'],
    mediaPairingId: value.media_pairing_id, mediaSnapshot: value.media_snapshot,
    provider: value.provider as MarketingProvider, connectionId: value.connection_id,
    connectionRevision: value.connection_revision, destinationLabel: value.destination_label,
    status: value.status as MarketingPackageStatus, previewedAt: value.previewed_at,
    approvedAt: value.approved_at, requiredDisclosures: value.required_disclosures as string[],
    retiredReason: value.retired_reason, createdAt: value.created_at, updatedAt: value.updated_at,
  };
}

function parsePublication(value: unknown): MarketingPublication {
  if (!record(value) || typeof value.publication_id !== 'string' || !UUID.test(value.publication_id)
    || typeof value.package_id !== 'string' || !UUID.test(value.package_id)
    || typeof value.package_fingerprint !== 'string' || !SHA.test(value.package_fingerprint)
    || typeof value.content_id !== 'string' || !UUID.test(value.content_id)
    || typeof value.content_revision !== 'number' || !record(value.content_snapshot)
    || !(value.media_pairing_id === null || (typeof value.media_pairing_id === 'string' && UUID.test(value.media_pairing_id)))
    || !(value.media_snapshot === null || record(value.media_snapshot))
    || !MARKETING_PROVIDERS.includes(value.provider as MarketingProvider)
    || typeof value.destination_label !== 'string' || !['publish_now', 'scheduled'].includes(String(value.publication_mode))
    || !timestamp(value.scheduled_at) || typeof value.authorization_timezone !== 'string'
    || !MARKETING_PUBLICATION_STATUSES.includes(value.status as MarketingPublicationStatus)
    || typeof value.attempt_count !== 'number' || typeof value.max_attempts !== 'number'
    || typeof value.retry_eligible !== 'boolean' || typeof value.replacement_eligible !== 'boolean'
    || !nullableString(value.provider_publication_id)
    || !nullableString(value.provider_permalink) || !nullableString(value.failure_category)
    || !nullableString(value.failure_message) || !timestamp(value.created_at)
    || !nullableTimestamp(value.publishing_started_at) || !nullableTimestamp(value.published_at)
    || !nullableTimestamp(value.cancelled_at)) malformed();
  return {
    id: value.publication_id, packageId: value.package_id, packageFingerprint: value.package_fingerprint,
    contentId: value.content_id, contentRevision: value.content_revision,
    snapshot: value.content_snapshot as MarketingPublication['snapshot'], mediaPairingId: value.media_pairing_id,
    mediaSnapshot: value.media_snapshot, provider: value.provider as MarketingProvider,
    destinationLabel: value.destination_label, mode: value.publication_mode as MarketingPublicationMode,
    scheduledAt: value.scheduled_at, timezone: value.authorization_timezone,
    status: value.status as MarketingPublicationStatus, attemptCount: value.attempt_count,
    maxAttempts: value.max_attempts, retryEligible: value.retry_eligible,
    replacementEligible: value.replacement_eligible,
    providerPublicationId: value.provider_publication_id, providerPermalink: value.provider_permalink,
    failureCategory: value.failure_category, failureMessage: value.failure_message,
    createdAt: value.created_at, publishingStartedAt: value.publishing_started_at,
    publishedAt: value.published_at, cancelledAt: value.cancelled_at,
  };
}

function parseAsset(value: unknown): MarketingQueueAsset {
  if (!record(value) || typeof value.asset_id !== 'string' || !UUID.test(value.asset_id)
    || !['image', 'video'].includes(String(value.asset_type)) || typeof value.source !== 'string'
    || typeof value.mime_type !== 'string' || typeof value.file_size_bytes !== 'number'
    || typeof value.sha256 !== 'string' || !SHA.test(value.sha256)
    || typeof value.media_variant !== 'string' || typeof value.lifecycle_state !== 'string'
    || !nullableString(value.storage_bucket ?? null) || !nullableString(value.storage_path ?? null)
    || !nullableString(value.poster_bucket ?? null) || !nullableString(value.poster_path ?? null)
    || !nullableString(value.purged_at ?? null) || !nullableString(value.ai_narration_disclosure_text ?? null)
    || !timestamp(value.created_at)) malformed();
  return {
    id: value.asset_id, type: value.asset_type as 'image' | 'video', source: value.source,
    mimeType: value.mime_type, fileSizeBytes: value.file_size_bytes,
    width: typeof value.width === 'number' ? value.width : null,
    height: typeof value.height === 'number' ? value.height : null,
    durationSeconds: typeof value.duration_seconds === 'number' ? value.duration_seconds : null,
    sha256: value.sha256, mediaVariant: value.media_variant, lifecycleState: value.lifecycle_state,
    storageBucket: typeof value.storage_bucket === 'string' ? value.storage_bucket : null,
    storagePath: typeof value.storage_path === 'string' ? value.storage_path : null,
    posterBucket: typeof value.poster_bucket === 'string' ? value.poster_bucket : null,
    posterPath: typeof value.poster_path === 'string' ? value.poster_path : null,
    posterUrl: null, purgedAt: typeof value.purged_at === 'string' ? value.purged_at : null,
    disclosureRequired: value.ai_narration_disclosure_required === true,
    disclosureText: typeof value.ai_narration_disclosure_text === 'string' ? value.ai_narration_disclosure_text : null,
    createdAt: value.created_at,
  };
}

function parsePairing(value: unknown): MarketingQueuePairing {
  if (!record(value) || typeof value.pairing_id !== 'string' || !UUID.test(value.pairing_id)
    || typeof value.content_id !== 'string' || !UUID.test(value.content_id)
    || typeof value.content_revision !== 'number' || typeof value.asset_id !== 'string' || !UUID.test(value.asset_id)
    || typeof value.claim_demonstrated !== 'string' || !['candidate', 'approved', 'rejected'].includes(String(value.status))
    || !timestamp(value.created_at) || !nullableTimestamp(value.reviewed_at)) malformed();
  return {
    id: value.pairing_id, contentId: value.content_id, contentRevision: value.content_revision,
    assetId: value.asset_id, claimDemonstrated: value.claim_demonstrated,
    status: value.status as MarketingQueuePairing['status'], createdAt: value.created_at,
    reviewedAt: value.reviewed_at,
  };
}

async function signedUrl(client: MarketingPublishingRpcClient, bucket: string | null, path: string | null) {
  if (!client.storage || !bucket || !path) return null;
  const result = await client.storage.from(bucket).createSignedUrl(path, 900);
  return result.error || typeof result.data?.signedUrl !== 'string' ? null : result.data.signedUrl;
}

async function parseState(client: MarketingPublishingRpcClient, value: unknown, catalog: unknown): Promise<MarketingPublishingState> {
  if (!record(value) || !record(value.workspace) || !Array.isArray(value.providers)
    || !Array.isArray(value.packages) || !Array.isArray(value.publications)
    || typeof value.operation_available !== 'boolean' || typeof value.prepared_limit !== 'number'
    || typeof value.prepared_count !== 'number' || !record(catalog)
    || !Array.isArray(catalog.assets) || !Array.isArray(catalog.pairings)) malformed();
  const assets = catalog.assets.map(parseAsset);
  await Promise.all(assets.map(async asset => { asset.posterUrl = await signedUrl(client, asset.posterBucket, asset.posterPath); }));
  let facebookSetup: MarketingFacebookSetup | null = null;
  if (record(value.facebook_setup)) {
    if (typeof value.facebook_setup.session_id !== 'string' || !UUID.test(value.facebook_setup.session_id)
      || value.facebook_setup.status !== 'page_selection_required' || !timestamp(value.facebook_setup.expires_at)
      || !Array.isArray(value.facebook_setup.candidate_pages)) malformed();
    facebookSetup = {
      sessionId: value.facebook_setup.session_id, status: 'page_selection_required', expiresAt: value.facebook_setup.expires_at,
      candidatePages: value.facebook_setup.candidate_pages.map(page => {
        if (!record(page) || typeof page.page_id !== 'string' || typeof page.page_name !== 'string'
          || !Array.isArray(page.tasks) || typeof page.eligible !== 'boolean') malformed();
        return { pageId: page.page_id, pageName: page.page_name, tasks: page.tasks as string[], eligible: page.eligible };
      }),
    };
  }
  return {
    workspace: { id: String(value.workspace.workspace_id), kind: value.workspace.workspace_kind === 'contractor' ? 'contractor' : 'internal', displayName: String(value.workspace.display_name) },
    operationAvailable: value.operation_available, preparedLimit: value.prepared_limit,
    preparedCount: value.prepared_count, providers: value.providers.map(parseProvider), facebookSetup,
    packages: value.packages.map(parsePackage), publications: value.publications.map(parsePublication),
    assets, pairings: catalog.pairings.map(parsePairing),
  };
}

function receipt(value: unknown) {
  if (!record(value)) malformed();
  return {
    publicationId: typeof value.publication_id === 'string' && UUID.test(value.publication_id) ? value.publication_id : null,
    packageId: typeof value.package_id === 'string' && UUID.test(value.package_id) ? value.package_id : null,
    status: typeof value.status === 'string' ? value.status : '', replayed: value.replayed === true,
    fingerprint: typeof value.package_fingerprint === 'string' ? value.package_fingerprint : null,
  };
}

export function createMarketingPublishingAdapter(client: MarketingPublishingRpcClient, contractorId: string | null = null) {
  return {
    async get() {
      const [state, catalog] = await Promise.all([
        rpc(client, 'servsync_get_marketing_publishing', { p_contractor_id: contractorId }, false),
        rpc(client, 'servsync_get_marketing_media_catalog', { p_contractor_id: contractorId }, false),
      ]);
      return parseState(client, state, catalog);
    },
    async pairMedia(input: { pairingId: string; contentId: string; contentRevision: number; assetId: string; claim: string }) {
      return receipt(await rpc(client, 'servsync_create_marketing_media_pairing', {
        p_contractor_id: contractorId, p_pairing_id: input.pairingId, p_content_id: input.contentId,
        p_expected_content_revision: input.contentRevision, p_asset_id: input.assetId, p_claim_demonstrated: input.claim,
      }, true));
    },
    async reviewMedia(pairingId: string, decision: 'approved' | 'rejected') {
      return receipt(await rpc(client, 'servsync_review_marketing_media_pairing', {
        p_contractor_id: contractorId, p_pairing_id: pairingId, p_decision: decision,
      }, true));
    },
    async preparePackage(input: { requestId: string; contentId: string; contentRevision: number; pairingId: string | null; provider: MarketingProvider; connectionId: string }) {
      return receipt(await rpc(client, 'servsync_prepare_marketing_publication_package', {
        p_contractor_id: contractorId, p_client_request_id: input.requestId, p_content_id: input.contentId,
        p_expected_content_revision: input.contentRevision, p_media_pairing_id: input.pairingId,
        p_provider: input.provider, p_provider_connection_id: input.connectionId,
      }, true));
    },
    async recordPreview(packageId: string, fingerprint: string) {
      return receipt(await rpc(client, 'servsync_record_marketing_package_preview', {
        p_contractor_id: contractorId, p_package_id: packageId, p_expected_fingerprint: fingerprint,
      }, true));
    },
    async approvePackage(packageId: string, fingerprint: string) {
      return receipt(await rpc(client, 'servsync_approve_marketing_publication_package', {
        p_contractor_id: contractorId, p_package_id: packageId, p_expected_fingerprint: fingerprint,
      }, true));
    },
    async authorize(input: { requestId: string; packageId: string; fingerprint: string; mode: MarketingPublicationMode; scheduledAt: string | null; timezone: string }) {
      return receipt(await rpc(client, 'servsync_authorize_marketing_publication', {
        p_contractor_id: contractorId, p_authorization_request_id: input.requestId, p_package_id: input.packageId,
        p_expected_fingerprint: input.fingerprint, p_publication_mode: input.mode,
        p_scheduled_at: input.scheduledAt, p_timezone: input.timezone,
      }, true));
    },
    async cancel(publicationId: string) {
      return receipt(await rpc(client, 'servsync_cancel_marketing_publication', {
        p_contractor_id: contractorId, p_publication_id: publicationId,
      }, true));
    },
    async reschedule(publicationId: string, scheduledAt: string, timezone: string) {
      return receipt(await rpc(client, 'servsync_reschedule_marketing_publication', {
        p_contractor_id: contractorId, p_publication_id: publicationId,
        p_authorization_request_id: crypto.randomUUID(), p_scheduled_at: scheduledAt, p_timezone: timezone,
      }, true));
    },
    async retry(publicationId: string) {
      return receipt(await rpc(client, 'servsync_retry_marketing_publication', {
        p_contractor_id: contractorId, p_publication_id: publicationId, p_retry_request_id: crypto.randomUUID(),
      }, true));
    },
    async prepareReplacement(publicationId: string) {
      return receipt(await rpc(client, 'servsync_prepare_marketing_pre_provider_replacement', {
        p_contractor_id: contractorId, p_publication_id: publicationId,
        p_recovery_request_id: crypto.randomUUID(),
      }, true));
    },
    async mediaUrl(assetId: string) {
      const access = await rpc(client, 'servsync_get_marketing_media_access', {
        p_contractor_id: contractorId, p_asset_id: assetId,
      }, false);
      if (!record(access) || access.state === 'purged') return null;
      return signedUrl(client, typeof access.storage_bucket === 'string' ? access.storage_bucket : null,
        typeof access.storage_path === 'string' ? access.storage_path : null);
    },
  };
}
