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
  mediaVariant: 'silent_product_demo_master' | 'narrated_marketing_derivative';
  sourceSilentFilename: string | null;
  sourceSilentSha256: string | null;
  narrationProvider: 'OpenAI' | null;
  narrationModel: string | null;
  narrationVoice: string | null;
  narrationScript: string | null;
  narrationScriptVersion: number | null;
  narrationAudioDurationSeconds: number | null;
  narrationStartSeconds: number | null;
  narrationEndSeconds: number | null;
  aiNarrationDisclosureRequired: boolean;
  aiNarrationDisclosureText: string | null;
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

export const AI_NARRATION_DISCLOSURE = "AI-generated voiceover using OpenAI's Cedar voice.";

export type NarratedDemoRecordingMetadata = {
  schema_version: 1;
  scenario: string;
  recording_version: number;
  generated_at: string;
  source_git_commit: string;
  environment: 'Demo';
  source_silent_video: {
    filename: string;
    duration_seconds: number;
    width: number;
    height: number;
    codec: 'h264';
    pixel_format: 'yuv420p';
    sha256: string;
  };
  narration: {
    filename: string;
    model: string;
    voice: 'cedar';
    request_count: 1;
    duration_seconds: number;
    size_bytes: number;
    sha256: string;
    instructions: string;
    script_filename: string;
  };
  preview: {
    filename: string;
    duration_seconds: number;
    size_bytes: number;
    video_codec: 'h264';
    audio_codec: 'aac';
    narration_start_seconds: number;
    narration_end_seconds: number;
    final_quiet_seconds: number;
    sha256: string;
    validation_status: 'passed_full_1x_review';
    reviewed_at: string;
    pacing_review: 'passed';
  };
  marketing: { production_asset_id: null; production_pairing_id: null; approval_status: string; uploaded: false; published: false };
  security: { credential_persisted: false; sensitive_data_check: 'passed'; fictional_demo_data_only: true; ai_voice_disclosure_required_before_public_use: true };
  narration_script: string;
  narration_provider: 'OpenAI';
  narration_script_version: number;
  ai_narration_disclosure_text: string;
};

export type MarketingMediaUploadMetadata = DurableDemoRecordingMetadata | NarratedDemoRecordingMetadata;

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

export function parseNarratedDemoRecordingMetadata(value: unknown): NarratedDemoRecordingMetadata {
  if (!isRecord(value) || value.schema_version !== 1 || value.environment !== 'Demo'
    || typeof value.scenario !== 'string' || !SCENARIO.test(value.scenario)
    || !Number.isInteger(value.recording_version) || Number(value.recording_version) < 1
    || !isTimestamp(value.generated_at) || typeof value.source_git_commit !== 'string' || !COMMIT.test(value.source_git_commit)
    || !isRecord(value.source_silent_video) || typeof value.source_silent_video.filename !== 'string'
    || !SAFE_MP4.test(value.source_silent_video.filename)
    || !requireNumber(value.source_silent_video.duration_seconds, 0.1, 300)
    || !requireNumber(value.source_silent_video.width, 320, 4096) || !requireNumber(value.source_silent_video.height, 240, 2160)
    || value.source_silent_video.codec !== 'h264' || value.source_silent_video.pixel_format !== 'yuv420p'
    || typeof value.source_silent_video.sha256 !== 'string' || !SHA256.test(value.source_silent_video.sha256)
    || !isRecord(value.narration) || typeof value.narration.filename !== 'string' || !value.narration.filename.endsWith('.mp3')
    || typeof value.narration.model !== 'string' || value.narration.model.length < 3 || value.narration.voice !== 'cedar'
    || value.narration.request_count !== 1 || !requireNumber(value.narration.duration_seconds, 0.1, 300)
    || !Number.isInteger(value.narration.size_bytes) || Number(value.narration.size_bytes) < 1
    || typeof value.narration.sha256 !== 'string' || !SHA256.test(value.narration.sha256)
    || typeof value.narration.instructions !== 'string' || value.narration.instructions.trim().length < 10
    || typeof value.narration.script_filename !== 'string' || !value.narration.script_filename.endsWith('.txt')
    || !isRecord(value.preview) || typeof value.preview.filename !== 'string' || !value.preview.filename.endsWith('.mp4')
    || !requireNumber(value.preview.duration_seconds, 0.1, 300) || !Number.isInteger(value.preview.size_bytes)
    || Number(value.preview.size_bytes) < 1 || Number(value.preview.size_bytes) > 104857600
    || value.preview.video_codec !== 'h264' || value.preview.audio_codec !== 'aac'
    || !requireNumber(value.preview.narration_start_seconds, 0, 300)
    || !requireNumber(value.preview.narration_end_seconds, 0.1, 300)
    || Number(value.preview.narration_end_seconds) <= Number(value.preview.narration_start_seconds)
    || !requireNumber(value.preview.final_quiet_seconds, 0, 300)
    || typeof value.preview.sha256 !== 'string' || !SHA256.test(value.preview.sha256)
    || value.preview.validation_status !== 'passed_full_1x_review' || !isTimestamp(value.preview.reviewed_at)
    || value.preview.pacing_review !== 'passed' || !isRecord(value.marketing) || value.marketing.uploaded !== false
    || value.marketing.published !== false || !isRecord(value.security) || value.security.credential_persisted !== false
    || value.security.sensitive_data_check !== 'passed' || value.security.fictional_demo_data_only !== true
    || value.security.ai_voice_disclosure_required_before_public_use !== true
    || value.narration_provider !== 'OpenAI' || !Number.isInteger(value.narration_script_version)
    || Number(value.narration_script_version) < 1 || typeof value.narration_script !== 'string'
    || value.narration_script.trim().length < 10 || value.narration_script.length > 5000
    || value.ai_narration_disclosure_text !== AI_NARRATION_DISCLOSURE) {
    throw new MarketingMediaError('validation', 'Choose an owner-reviewed narrated Demo package with complete Cedar provenance.');
  }
  if (Number(value.preview.duration_seconds) !== Number(value.source_silent_video.duration_seconds)
    || Number(value.preview.narration_end_seconds) > Number(value.preview.duration_seconds)
    || Math.abs(Number(value.preview.final_quiet_seconds)
      - (Number(value.preview.duration_seconds) - Number(value.preview.narration_end_seconds))) > 0.05) {
    throw new MarketingMediaError('validation', 'Narrated recording timing does not match its preserved silent source.');
  }
  return value as unknown as NarratedDemoRecordingMetadata;
}

export function parseMarketingMediaUploadMetadata(value: unknown): MarketingMediaUploadMetadata {
  if (isRecord(value) && isRecord(value.preview) && isRecord(value.narration)) {
    return parseNarratedDemoRecordingMetadata(value);
  }
  return parseDurableDemoRecordingMetadata(value);
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
    || !['silent_product_demo_master', 'narrated_marketing_derivative'].includes(String(value.media_variant ?? 'silent_product_demo_master'))
    || !isTimestamp(value.pacing_reviewed_at) || !isTimestamp(value.created_at) || !signedUrl.startsWith('http')) {
    throw new MarketingMediaError('malformed', 'ServSync received an invalid Marketing media response.');
  }
  const mediaVariant = (value.media_variant ?? 'silent_product_demo_master') as MarketingMediaAsset['mediaVariant'];
  const narrationRequired = value.ai_narration_disclosure_required === true;
  if (mediaVariant === 'narrated_marketing_derivative' && (
    typeof value.source_silent_filename !== 'string' || !SAFE_MP4.test(value.source_silent_filename)
    || typeof value.source_silent_sha256 !== 'string' || !SHA256.test(value.source_silent_sha256)
    || value.narration_provider !== 'OpenAI' || typeof value.narration_model !== 'string'
    || value.narration_voice !== 'cedar' || typeof value.narration_script !== 'string'
    || !Number.isInteger(value.narration_script_version)
    || !requireNumber(Number(value.narration_audio_duration_seconds), 0.1, 300)
    || !requireNumber(Number(value.narration_start_seconds), 0, 300)
    || !requireNumber(Number(value.narration_end_seconds), 0.1, 300)
    || !narrationRequired || typeof value.ai_narration_disclosure_text !== 'string'
  )) throw new MarketingMediaError('malformed', 'ServSync received incomplete narrated Marketing media provenance.');
  return {
    id: value.asset_id, type: 'video', source: 'demo_recorder', recorderScenario: value.recorder_scenario,
    sourceCommit: value.source_commit, storageBucket: 'marketing-assets', storagePath: value.storage_path,
    signedUrl, mimeType: 'video/mp4', fileSizeBytes: Number(value.file_size_bytes), width: Number(value.width),
    height: Number(value.height), durationSeconds: Number(value.duration_seconds), sha256: value.sha256,
    validationStatus: 'passed', sensitiveDataCheck: 'passed', pacingReview: 'passed',
    pacingReviewedAt: value.pacing_reviewed_at, mediaVariant,
    sourceSilentFilename: typeof value.source_silent_filename === 'string' ? value.source_silent_filename : null,
    sourceSilentSha256: typeof value.source_silent_sha256 === 'string' ? value.source_silent_sha256 : null,
    narrationProvider: value.narration_provider === 'OpenAI' ? 'OpenAI' : null,
    narrationModel: typeof value.narration_model === 'string' ? value.narration_model : null,
    narrationVoice: typeof value.narration_voice === 'string' ? value.narration_voice : null,
    narrationScript: typeof value.narration_script === 'string' ? value.narration_script : null,
    narrationScriptVersion: Number.isInteger(value.narration_script_version) ? Number(value.narration_script_version) : null,
    narrationAudioDurationSeconds: requireNumber(Number(value.narration_audio_duration_seconds), 0.1, 300) ? Number(value.narration_audio_duration_seconds) : null,
    narrationStartSeconds: requireNumber(Number(value.narration_start_seconds), 0, 300) ? Number(value.narration_start_seconds) : null,
    narrationEndSeconds: requireNumber(Number(value.narration_end_seconds), 0.1, 300) ? Number(value.narration_end_seconds) : null,
    aiNarrationDisclosureRequired: narrationRequired,
    aiNarrationDisclosureText: typeof value.ai_narration_disclosure_text === 'string' ? value.ai_narration_disclosure_text : null,
    createdAt: value.created_at,
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
      metadata: MarketingMediaUploadMetadata;
      claimDemonstrated: string;
    }) {
      const { workspaceId, content, mp4, metadata, claimDemonstrated } = input;
      const narrated = 'preview' in metadata;
      const mp4Filename = narrated ? metadata.preview.filename : metadata.mp4_filename;
      const mp4Size = narrated ? metadata.preview.size_bytes : metadata.mp4_size_bytes;
      const mp4Sha256 = narrated ? metadata.preview.sha256 : metadata.mp4_sha256;
      const width = narrated ? metadata.source_silent_video.width : metadata.width;
      const height = narrated ? metadata.source_silent_video.height : metadata.height;
      const duration = narrated ? metadata.preview.duration_seconds : metadata.duration_seconds;
      const reviewedAt = narrated ? metadata.preview.reviewed_at : metadata.pacing_reviewed_at;
      if (!UUID.test(workspaceId) || (narrated ? !['needs_approval', 'approved'].includes(content.status) : content.status !== 'approved')
        || mp4Filename !== mp4.name || mp4.type !== 'video/mp4' || mp4.size !== mp4Size) {
        throw new MarketingMediaError('validation', 'The MP4, metadata, and approved content do not form a valid upload package.');
      }
      if (narrated && !content.body.includes(metadata.ai_narration_disclosure_text)) {
        throw new MarketingMediaError('validation', 'The public post must include the exact AI narration disclosure before pairing.');
      }
      const [sha256, video] = await Promise.all([sha256ForFile(mp4), readVideoFileMetadata(mp4)]);
      if (sha256 !== mp4Sha256 || video.width !== width || video.height !== height
        || Math.abs(video.durationSeconds - duration) > 0.75) {
        throw new MarketingMediaError('validation', 'The MP4 no longer matches its reviewed recorder metadata.');
      }
      const assetId = crypto.randomUUID();
      const pairingId = crypto.randomUUID();
      const storageFilename = narrated
        ? `servsync-${metadata.scenario}-narrated-v${metadata.recording_version}-${metadata.generated_at.replace(/Z$/, '').replace(/[.:]/g, '-')}Z.mp4`
        : metadata.mp4_filename;
      const storagePath = `${workspaceId}/${assetId}/${storageFilename}`;
      const bucket = client.storage.from('marketing-assets');
      const upload = await bucket.upload(storagePath, mp4, { contentType: 'video/mp4', upsert: false });
      if (upload.error) throw new MarketingMediaError('storage', 'ServSync could not upload the private Marketing video.');
      try {
        await rpc(client, narrated
          ? 'servsync_register_narrated_marketing_media'
          : 'servsync_register_and_pair_internal_marketing_media_asset', {
          p_asset_id: assetId,
          p_pairing_id: pairingId,
          p_content_id: content.id,
          p_expected_content_revision: content.revisionNumber,
          p_recorder_scenario: metadata.scenario,
          p_source_commit: metadata.source_git_commit,
          p_storage_path: storagePath,
          p_mime_type: 'video/mp4',
          p_file_size_bytes: mp4Size,
          p_width: width,
          p_height: height,
          p_duration_seconds: duration,
          p_sha256: mp4Sha256,
          p_pacing_reviewed_at: reviewedAt,
          p_claim_demonstrated: claimDemonstrated.trim(),
          ...(narrated ? {
            p_source_silent_filename: metadata.source_silent_video.filename,
            p_source_silent_sha256: metadata.source_silent_video.sha256,
            p_narration_provider: metadata.narration_provider,
            p_narration_model: metadata.narration.model,
            p_narration_voice: metadata.narration.voice,
            p_narration_script: metadata.narration_script,
            p_narration_script_version: metadata.narration_script_version,
            p_narration_audio_duration_seconds: metadata.narration.duration_seconds,
            p_narration_start_seconds: metadata.preview.narration_start_seconds,
            p_narration_end_seconds: metadata.preview.narration_end_seconds,
            p_ai_narration_disclosure_text: metadata.ai_narration_disclosure_text,
          } : {}),
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
