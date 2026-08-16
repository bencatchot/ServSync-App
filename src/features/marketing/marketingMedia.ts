import type { MarketingContentItem } from './marketingContent';

export type MarketingMediaAsset = {
  id: string;
  type: 'video';
  source: 'demo_recorder';
  recorderScenario: string;
  sourceCommit: string;
  storageBucket: 'marketing-assets';
  storagePath: string;
  signedUrl: string;
  mimeType: 'video/mp4';
  fileSizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number;
  sha256: string;
  validationStatus: 'passed';
  sensitiveDataCheck: 'passed';
  pacingReview: 'passed';
  pacingReviewedAt: string;
  createdAt: string;
};

export type MarketingMediaPairing = {
  id: string;
  contentId: string;
  contentRevision: number;
  sourceDirectionId: string | null;
  sourceDirectionRevision: number | null;
  assetId: string;
  recorderScenario: string;
  claimDemonstrated: string;
  status: 'candidate' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
};

export type MarketingMediaState = {
  workspaceId: string;
  assets: MarketingMediaAsset[];
  pairings: MarketingMediaPairing[];
};

export type DurableDemoRecordingMetadata = {
  schema_version: 2;
  scenario: string;
  recording_version: number;
  timestamp: string;
  source_git_commit: string;
  environment: 'Demo';
  viewport: { width: number; height: number };
  duration_seconds: number;
  pacing: 'marketing';
  webm_filename: string;
  mp4_filename: string;
  width: number;
  height: number;
  mime_type: 'video/mp4';
  mp4_size_bytes: number;
  webm_sha256: string;
  mp4_sha256: string;
  validation_status: 'passed';
  sensitive_data_check: 'passed';
  pacing_review: 'passed';
  pacing_reviewed_at: string;
  marketing_candidate_status: 'passed';
  pacing_review_criteria: Record<string, true>;
};

type RpcResult = { data: unknown; error: unknown };
type StorageResult<T> = PromiseLike<{ data: T; error: unknown }>;

export interface MarketingMediaClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  storage: {
    from(bucket: string): {
      upload(path: string, file: File, options: { contentType: string; upsert: boolean }): StorageResult<unknown>;
      remove(paths: string[]): StorageResult<unknown>;
      createSignedUrl(path: string, expiresIn: number): StorageResult<{ signedUrl?: string } | null>;
    };
  };
}

export class MarketingMediaError extends Error {
  constructor(public readonly kind: 'validation' | 'unauthorized' | 'rpc' | 'storage' | 'malformed', message: string) {
    super(message);
    this.name = 'MarketingMediaError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SCENARIO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SAFE_MP4 = /^servsync-[a-z0-9-]+-v\d+-[0-9TZ-]+\.mp4$/;
const PACING_REVIEW_CRITERIA = [
  'cursor_followable',
  'click_intent_visible',
  'ui_changes_readable',
  'cursor_speed_acceptable',
  'cursor_motion_natural',
  'text_readable',
  'important_holds_sufficient',
  'final_result_obvious',
] as const;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function serverMessage(error: unknown) {
  return isRecord(error) && typeof error.message === 'string' ? error.message : '';
}

function rpcError(error: unknown, action: string) {
  if (isRecord(error) && (error.code === '42501' || error.status === 401 || error.status === 403)) {
    return new MarketingMediaError('unauthorized', 'Internal Marketing media is unavailable for this account.');
  }
  return new MarketingMediaError('rpc', `ServSync could not ${action}.${serverMessage(error).includes('changed; reload') ? ' The approved content changed; reload and try again.' : ''}`);
}

async function rpc(client: MarketingMediaClient, name: string, args: Record<string, unknown>, action: string) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw rpcError(error, action);
  return data;
}

function requireNumber(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function hasPassedPacingReviewCriteria(value: unknown) {
  return isRecord(value)
    && Object.keys(value).length === PACING_REVIEW_CRITERIA.length
    && PACING_REVIEW_CRITERIA.every(criterion => value[criterion] === true);
}

export function parseDurableDemoRecordingMetadata(value: unknown): DurableDemoRecordingMetadata {
  if (!isRecord(value) || value.schema_version !== 2 || value.environment !== 'Demo'
    || typeof value.scenario !== 'string' || !SCENARIO.test(value.scenario)
    || !Number.isInteger(value.recording_version) || Number(value.recording_version) < 1
    || !isTimestamp(value.timestamp) || typeof value.source_git_commit !== 'string' || !COMMIT.test(value.source_git_commit)
    || !isRecord(value.viewport) || !requireNumber(value.viewport.width, 320, 4096) || !requireNumber(value.viewport.height, 240, 2160)
    || !requireNumber(value.duration_seconds, 0.1, 300) || value.pacing !== 'marketing'
    || typeof value.webm_filename !== 'string' || !value.webm_filename.endsWith('.webm')
    || typeof value.mp4_filename !== 'string' || !SAFE_MP4.test(value.mp4_filename)
    || !requireNumber(value.width, 320, 4096) || !requireNumber(value.height, 240, 2160)
    || value.mime_type !== 'video/mp4' || !Number.isInteger(value.mp4_size_bytes) || Number(value.mp4_size_bytes) < 1 || Number(value.mp4_size_bytes) > 104857600
    || typeof value.webm_sha256 !== 'string' || !SHA256.test(value.webm_sha256)
    || typeof value.mp4_sha256 !== 'string' || !SHA256.test(value.mp4_sha256)
    || value.validation_status !== 'passed' || value.sensitive_data_check !== 'passed'
    || value.pacing_review !== 'passed' || !isTimestamp(value.pacing_reviewed_at)
    || value.marketing_candidate_status !== 'passed'
    || !hasPassedPacingReviewCriteria(value.pacing_review_criteria)) {
    throw new MarketingMediaError('validation', 'Choose a validated Demo recording package with a completed 1x pacing review.');
  }
  if (value.width !== value.viewport.width || value.height !== value.viewport.height) {
    throw new MarketingMediaError('validation', 'Recording dimensions do not match the validated viewport.');
  }
  return value as unknown as DurableDemoRecordingMetadata;
}

export async function sha256ForFile(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function readVideoFileMetadata(file: File) {
  return new Promise<{ width: number; height: number; durationSeconds: number }>((resolveVideo, rejectVideo) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const result = { width: video.videoWidth, height: video.videoHeight, durationSeconds: video.duration };
      cleanup();
      resolveVideo(result);
    };
    video.onerror = () => {
      cleanup();
      rejectVideo(new MarketingMediaError('validation', 'The selected MP4 could not be decoded.'));
    };
    video.src = url;
  });
}

function parseAsset(value: unknown, signedUrl: string): MarketingMediaAsset {
  if (!isRecord(value) || typeof value.asset_id !== 'string' || !UUID.test(value.asset_id)
    || value.asset_type !== 'video' || value.source !== 'demo_recorder'
    || typeof value.recorder_scenario !== 'string' || !SCENARIO.test(value.recorder_scenario)
    || typeof value.source_commit !== 'string' || !COMMIT.test(value.source_commit)
    || value.storage_bucket !== 'marketing-assets' || typeof value.storage_path !== 'string'
    || value.mime_type !== 'video/mp4' || !requireNumber(value.file_size_bytes, 1, 104857600)
    || !requireNumber(value.width, 320, 4096) || !requireNumber(value.height, 240, 2160)
    || !requireNumber(Number(value.duration_seconds), 0.1, 300)
    || typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)
    || value.validation_status !== 'passed' || value.sensitive_data_check !== 'passed' || value.pacing_review !== 'passed'
    || !isTimestamp(value.pacing_reviewed_at) || !isTimestamp(value.created_at) || !signedUrl.startsWith('http')) {
    throw new MarketingMediaError('malformed', 'ServSync received an invalid Marketing media response.');
  }
  return {
    id: value.asset_id, type: 'video', source: 'demo_recorder', recorderScenario: value.recorder_scenario,
    sourceCommit: value.source_commit, storageBucket: 'marketing-assets', storagePath: value.storage_path,
    signedUrl, mimeType: 'video/mp4', fileSizeBytes: Number(value.file_size_bytes), width: Number(value.width),
    height: Number(value.height), durationSeconds: Number(value.duration_seconds), sha256: value.sha256,
    validationStatus: 'passed', sensitiveDataCheck: 'passed', pacingReview: 'passed',
    pacingReviewedAt: value.pacing_reviewed_at, createdAt: value.created_at,
  };
}

function parsePairing(value: unknown): MarketingMediaPairing {
  if (!isRecord(value) || typeof value.pairing_id !== 'string' || !UUID.test(value.pairing_id)
    || typeof value.content_id !== 'string' || !UUID.test(value.content_id)
    || !Number.isInteger(value.content_revision) || Number(value.content_revision) < 1
    || !(value.source_direction_id === null || (typeof value.source_direction_id === 'string' && UUID.test(value.source_direction_id)))
    || !(value.source_direction_revision === null || (Number.isInteger(value.source_direction_revision) && Number(value.source_direction_revision) >= 1))
    || typeof value.asset_id !== 'string' || !UUID.test(value.asset_id)
    || typeof value.recorder_scenario !== 'string' || !SCENARIO.test(value.recorder_scenario)
    || typeof value.claim_demonstrated !== 'string' || value.claim_demonstrated.trim().length < 10
    || !['candidate', 'approved', 'rejected'].includes(String(value.status))
    || !isTimestamp(value.created_at) || !(value.reviewed_at === null || isTimestamp(value.reviewed_at))) {
    throw new MarketingMediaError('malformed', 'ServSync received an invalid Marketing media pairing.');
  }
  return {
    id: value.pairing_id, contentId: value.content_id, contentRevision: Number(value.content_revision),
    sourceDirectionId: value.source_direction_id, sourceDirectionRevision: value.source_direction_revision === null ? null : Number(value.source_direction_revision),
    assetId: value.asset_id, recorderScenario: value.recorder_scenario, claimDemonstrated: value.claim_demonstrated,
    status: value.status as MarketingMediaPairing['status'], createdAt: value.created_at, reviewedAt: value.reviewed_at,
  };
}

async function parseState(client: MarketingMediaClient, value: unknown): Promise<MarketingMediaState> {
  if (!isRecord(value) || typeof value.workspace_id !== 'string' || !UUID.test(value.workspace_id)
    || !Array.isArray(value.assets) || !Array.isArray(value.pairings)) {
    throw new MarketingMediaError('malformed', 'ServSync received an invalid Marketing media state.');
  }
  const assets = await Promise.all(value.assets.map(async asset => {
    if (!isRecord(asset) || asset.storage_bucket !== 'marketing-assets' || typeof asset.storage_path !== 'string') {
      throw new MarketingMediaError('malformed', 'ServSync received an invalid Marketing asset path.');
    }
    const { data, error } = await client.storage.from('marketing-assets').createSignedUrl(asset.storage_path, 3600);
    if (error || !data?.signedUrl) throw new MarketingMediaError('storage', 'ServSync could not open the private Marketing video.');
    return parseAsset(asset, data.signedUrl);
  }));
  return { workspaceId: value.workspace_id, assets, pairings: value.pairings.map(parsePairing) };
}

export function pairingForContent(state: MarketingMediaState | null, content: MarketingContentItem | null) {
  if (!state || !content) return null;
  return state.pairings.find(pairing => pairing.contentId === content.id
    && pairing.contentRevision === content.revisionNumber && pairing.status !== 'rejected') ?? null;
}

export function createMarketingMediaAdapter(client: MarketingMediaClient) {
  return {
    async get() {
      return parseState(client, await rpc(client, 'servsync_get_internal_marketing_media', {}, 'load Marketing media'));
    },
    async uploadAndPair(input: {
      workspaceId: string;
      content: MarketingContentItem;
      mp4: File;
      metadata: DurableDemoRecordingMetadata;
      claimDemonstrated: string;
    }) {
      const { workspaceId, content, mp4, metadata, claimDemonstrated } = input;
      if (!UUID.test(workspaceId) || content.status !== 'approved' || metadata.mp4_filename !== mp4.name
        || mp4.type !== 'video/mp4' || mp4.size !== metadata.mp4_size_bytes) {
        throw new MarketingMediaError('validation', 'The MP4, metadata, and approved content do not form a valid upload package.');
      }
      const [sha256, video] = await Promise.all([sha256ForFile(mp4), readVideoFileMetadata(mp4)]);
      if (sha256 !== metadata.mp4_sha256 || video.width !== metadata.width || video.height !== metadata.height
        || Math.abs(video.durationSeconds - metadata.duration_seconds) > 0.75) {
        throw new MarketingMediaError('validation', 'The MP4 no longer matches its reviewed recorder metadata.');
      }
      const assetId = crypto.randomUUID();
      const pairingId = crypto.randomUUID();
      const storagePath = `${workspaceId}/${assetId}/${metadata.mp4_filename}`;
      const bucket = client.storage.from('marketing-assets');
      const upload = await bucket.upload(storagePath, mp4, { contentType: 'video/mp4', upsert: false });
      if (upload.error) throw new MarketingMediaError('storage', 'ServSync could not upload the private Marketing video.');
      try {
        await rpc(client, 'servsync_register_and_pair_internal_marketing_media_asset', {
          p_asset_id: assetId,
          p_pairing_id: pairingId,
          p_content_id: content.id,
          p_expected_content_revision: content.revisionNumber,
          p_recorder_scenario: metadata.scenario,
          p_source_commit: metadata.source_git_commit,
          p_storage_path: storagePath,
          p_mime_type: 'video/mp4',
          p_file_size_bytes: metadata.mp4_size_bytes,
          p_width: metadata.width,
          p_height: metadata.height,
          p_duration_seconds: metadata.duration_seconds,
          p_sha256: metadata.mp4_sha256,
          p_pacing_reviewed_at: metadata.pacing_reviewed_at,
          p_claim_demonstrated: claimDemonstrated.trim(),
        }, 'register and pair the Marketing video');
      } catch (error) {
        await bucket.remove([storagePath]);
        throw error;
      }
      return { assetId, pairingId };
    },
    async review(pairingId: string, decision: 'approved' | 'rejected') {
      if (!UUID.test(pairingId)) throw new MarketingMediaError('validation', 'Invalid Marketing media pairing.');
      await rpc(client, 'servsync_review_internal_marketing_media_pairing', {
        p_pairing_id: pairingId,
        p_decision: decision,
      }, `${decision === 'approved' ? 'approve' : 'reject'} the Marketing video`);
    },
  };
}
