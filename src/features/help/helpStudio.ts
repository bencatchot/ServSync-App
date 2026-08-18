export type HelpWalkthroughState = 'draft' | 'published' | 'needs_review' | 'deprecated' | 'archived';
export type HelpWalkthroughPurpose = 'support' | 'marketing' | 'both';
export type HelpReviewState = 'pending' | 'passed' | 'failed';
export type HelpRecordingStatus = 'requested' | 'preparing' | 'recording' | 'processing' | 'ready_for_review' | 'approved' | 'failed';
export type HelpNarrationMode = 'none' | 'human' | 'ai';

export type HelpRpcResult<T> = PromiseLike<{ data: T | null; error: { message?: string } | null }>;

export type HelpStudioClient = {
  rpc(name: string, args?: Record<string, unknown>): HelpRpcResult<unknown>;
  storage: {
    from(bucket: string): {
      upload(path: string, file: File, options: { contentType: string; upsert: boolean }): HelpRpcResult<unknown>;
    };
  };
  auth: {
    getSession(): PromiseLike<{
      data: { session: { access_token?: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export type HelpWalkthrough = {
  id: string;
  slug: string;
  state: HelpWalkthroughState;
  purpose: HelpWalkthroughPurpose;
  currentRevision: number;
  publishedRevision: number | null;
  title: string;
  summary: string;
  steps: string[];
  keywords: string[];
  featureArea: string;
  routeContexts: string[];
  audienceRoles: string[];
  sourceCommit: string | null;
  sourceVersion: string | null;
  videoAssetId: string | null;
  posterAssetId: string | null;
  humanPacedReview: HelpReviewState;
  sensitiveDataReview: HelpReviewState;
  canonicalOutputReview: HelpReviewState;
  validationStatus: 'draft' | 'passed' | 'failed' | 'needs_review';
  narrationProvider: string | null;
  narrationVoice: string | null;
  narrationDisclosure: string | null;
  transcript: string | null;
  videoFileName: string | null;
  videoBytes: number;
  videoDuration: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  posterFileName: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type HelpSearchResult = {
  id: string;
  slug: string;
  revision: number;
  title: string;
  summary: string;
  steps: string[];
  keywords: string[];
  featureArea: string;
  purpose: HelpWalkthroughPurpose;
  routeContexts: string[];
  videoAssetId: string;
  posterAssetId: string | null;
  durationSeconds: number;
  width: number;
  height: number;
  narrationDisclosure: string | null;
  rank: number;
};

export type HelpUsage = {
  totalAssets: number;
  totalBytes: number;
  videoAssets: number;
  posterAssets: number;
  publishedWalkthroughs: number;
  unpublishedWalkthroughs: number;
};

export type HelpRecordingJob = {
  id: string;
  targetWalkthroughId: string | null;
  status: HelpRecordingStatus;
  slug: string;
  title: string;
  summary: string;
  purpose: HelpWalkthroughPurpose;
  featureArea: string;
  routeContexts: string[];
  audienceRoles: string[];
  keywords: string[];
  requestedGoal: string;
  targetScreen: string;
  requiredStartingState: string;
  scenarioKey: string;
  actionSteps: string[];
  expectedFinalState: string;
  desiredDurationSeconds: number;
  narrationMode: HelpNarrationMode;
  talkingPoints: string[];
  pacingProfile: 'servsync-human-paced-v1';
  sourceKind: 'recorder_generated' | 'provider_generated';
  sourceCommit: string | null;
  sourceVersion: string | null;
  videoAssetId: string | null;
  posterAssetId: string | null;
  recorderMetadata: Record<string, unknown>;
  failureCategory: string | null;
  failureMessage: string | null;
  reviewNotes: string | null;
  approvedWalkthroughId: string | null;
  approvedRevision: number | null;
  requestedAt: string;
  readyForReviewAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

export type HelpRecordingSpecDraft = {
  targetWalkthroughId: string;
  title: string;
  summary: string;
  purpose: HelpWalkthroughPurpose;
  featureArea: string;
  routeContexts: string;
  audienceRoles: string[];
  keywords: string;
  requestedGoal: string;
  targetScreen: string;
  requiredStartingState: string;
  scenarioKey: string;
  actionSteps: string;
  expectedFinalState: string;
  desiredDurationSeconds: string;
  narrationMode: HelpNarrationMode;
  talkingPoints: string;
};

export type HelpWalkthroughDraft = {
  title: string;
  summary: string;
  steps: string;
  keywords: string;
  featureArea: string;
  routeContexts: string;
  audienceRoles: string[];
  purpose: HelpWalkthroughPurpose;
  sourceCommit: string;
  sourceVersion: string;
  videoAssetId: string;
  posterAssetId: string;
  humanPacedReview: HelpReviewState;
  sensitiveDataReview: HelpReviewState;
  canonicalOutputReview: HelpReviewState;
  validationStatus: 'draft' | 'passed' | 'failed' | 'needs_review';
  narrationProvider: string;
  narrationVoice: string;
  narrationDisclosure: string;
  transcript: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_CONTEXT = /^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Help Studio received an invalid response.');
  return value as Record<string, unknown>;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : number(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function rpcMessage(error: { message?: string } | null, fallback: string) {
  const message = error?.message?.trim();
  if (!message) return fallback;
  if (message.includes('Not authorized')) return 'This Help Studio action is not available for your account.';
  if (message.includes('changed; reload')) return 'This walkthrough changed. Reload it before saving.';
  return fallback;
}

async function rpc(client: HelpStudioClient, name: string, args: Record<string, unknown>, fallback: string) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(rpcMessage(error, fallback));
  return data;
}

export function emptyHelpWalkthroughDraft(): HelpWalkthroughDraft {
  return {
    title: '', summary: '', steps: '', keywords: '', featureArea: '', routeContexts: '',
    audienceRoles: ['owner', 'admin', 'office'], purpose: 'support', sourceCommit: '',
    sourceVersion: '', videoAssetId: '', posterAssetId: '', humanPacedReview: 'pending',
    sensitiveDataReview: 'pending', canonicalOutputReview: 'pending', validationStatus: 'draft',
    narrationProvider: '', narrationVoice: '', narrationDisclosure: '', transcript: '',
  };
}

export function emptyHelpRecordingSpecDraft(): HelpRecordingSpecDraft {
  return {
    targetWalkthroughId: '', title: '', summary: '', purpose: 'both', featureArea: '',
    routeContexts: '', audienceRoles: ['owner', 'admin', 'office'], keywords: '',
    requestedGoal: '', targetScreen: '', requiredStartingState: '',
    scenarioKey: 'contractor-create-estimate', actionSteps: '', expectedFinalState: '',
    desiredDurationSeconds: '30', narrationMode: 'none', talkingPoints: '',
  };
}

export function draftFromWalkthrough(item: HelpWalkthrough): HelpWalkthroughDraft {
  return {
    title: item.title,
    summary: item.summary,
    steps: item.steps.join('\n'),
    keywords: item.keywords.join(', '),
    featureArea: item.featureArea,
    routeContexts: item.routeContexts.join(', '),
    audienceRoles: [...item.audienceRoles],
    purpose: item.purpose,
    sourceCommit: item.sourceCommit ?? '',
    sourceVersion: item.sourceVersion ?? '',
    videoAssetId: item.videoAssetId ?? '',
    posterAssetId: item.posterAssetId ?? '',
    humanPacedReview: item.humanPacedReview,
    sensitiveDataReview: item.sensitiveDataReview,
    canonicalOutputReview: item.canonicalOutputReview,
    validationStatus: item.validationStatus,
    narrationProvider: item.narrationProvider ?? '',
    narrationVoice: item.narrationVoice ?? '',
    narrationDisclosure: item.narrationDisclosure ?? '',
    transcript: item.transcript ?? '',
  };
}

function normalizedLines(value: string) {
  return value.split('\n').map(item => item.trim()).filter(Boolean);
}

function normalizedCommaList(value: string) {
  return [...new Set(value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean))];
}

export function helpPayload(draft: HelpWalkthroughDraft) {
  const steps = normalizedLines(draft.steps);
  const keywords = normalizedCommaList(draft.keywords);
  const routeContexts = normalizedCommaList(draft.routeContexts);
  if (draft.title.trim().length < 3 || draft.summary.trim().length < 10 || !steps.length
    || !keywords.length || draft.featureArea.trim().length < 2 || !draft.audienceRoles.length) {
    throw new Error('Add a title, summary, at least one step and keyword, a feature area, and an audience.');
  }
  if (routeContexts.some(item => !SAFE_CONTEXT.test(item))) throw new Error('Route contexts may use letters, numbers, dots, slashes, underscores, and hyphens.');
  if (draft.sourceCommit && !COMMIT.test(draft.sourceCommit)) throw new Error('Source commit must be a full 40-character commit.');
  if (draft.videoAssetId && !UUID.test(draft.videoAssetId)) throw new Error('The selected video asset is invalid.');
  if (draft.posterAssetId && !UUID.test(draft.posterAssetId)) throw new Error('The selected poster asset is invalid.');
  const narrationValues = [draft.narrationProvider, draft.narrationVoice, draft.narrationDisclosure].map(item => item.trim());
  if (narrationValues.some(Boolean) && !narrationValues.every(Boolean)) throw new Error('Narrated walkthroughs need provider, voice, and disclosure together.');
  return {
    title: draft.title.trim(), summary: draft.summary.trim(), steps, keywords,
    feature_area: draft.featureArea.trim(), route_contexts: routeContexts,
    audience_roles: draft.audienceRoles, purpose: draft.purpose,
    source_commit: draft.sourceCommit || null, source_version: draft.sourceVersion.trim() || null,
    video_asset_id: draft.videoAssetId || null, poster_asset_id: draft.posterAssetId || null,
    human_paced_review: draft.humanPacedReview, sensitive_data_review: draft.sensitiveDataReview,
    canonical_output_review: draft.canonicalOutputReview, validation_status: draft.validationStatus,
    narration_provider: narrationValues[0] || null, narration_voice: narrationValues[1] || null,
    narration_disclosure: narrationValues[2] || null, transcript: draft.transcript.trim() || null,
  };
}

export function helpRecordingSpecPayload(draft: HelpRecordingSpecDraft) {
  const actionSteps = normalizedLines(draft.actionSteps);
  const routeContexts = normalizedCommaList(draft.routeContexts);
  const keywords = normalizedCommaList(draft.keywords);
  const talkingPoints = normalizedLines(draft.talkingPoints);
  const desiredDurationSeconds = Number(draft.desiredDurationSeconds);
  const slug = draft.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
  if (draft.title.trim().length < 3 || draft.summary.trim().length < 10
    || draft.featureArea.trim().length < 2 || !routeContexts.length || !keywords.length
    || draft.requestedGoal.trim().length < 10 || draft.targetScreen.trim().length < 2
    || draft.requiredStartingState.trim().length < 3 || !actionSteps.length
    || draft.expectedFinalState.trim().length < 3 || !draft.audienceRoles.length
    || !Number.isInteger(desiredDurationSeconds) || desiredDurationSeconds < 10 || desiredDurationSeconds > 600) {
    throw new Error('Complete the recording goal, screen, start and final states, steps, keywords, audience, and duration.');
  }
  if (!SAFE_SLUG.test(slug)) throw new Error('The recording title must produce a valid internal slug.');
  if (routeContexts.some(item => !SAFE_CONTEXT.test(item))) throw new Error('Route contexts may use letters, numbers, dots, slashes, underscores, and hyphens.');
  if (draft.targetWalkthroughId && !UUID.test(draft.targetWalkthroughId)) throw new Error('The selected walkthrough is invalid.');
  return {
    target_walkthrough_id: draft.targetWalkthroughId || null,
    slug, title: draft.title.trim(), summary: draft.summary.trim(), purpose: draft.purpose,
    feature_area: draft.featureArea.trim(), route_contexts: routeContexts,
    audience_roles: draft.audienceRoles, keywords, requested_goal: draft.requestedGoal.trim(),
    target_screen: draft.targetScreen.trim(), required_starting_state: draft.requiredStartingState.trim(),
    scenario_key: draft.scenarioKey, action_steps: actionSteps,
    expected_final_state: draft.expectedFinalState.trim(), desired_duration_seconds: desiredDurationSeconds,
    narration_mode: draft.narrationMode, talking_points: talkingPoints,
  };
}

export function parseHelpWalkthrough(value: unknown): HelpWalkthrough {
  const item = record(value);
  const id = String(item.walkthrough_id ?? '');
  const slug = String(item.slug ?? '');
  if (!UUID.test(id) || !SAFE_SLUG.test(slug)) throw new Error('Help Studio received an invalid walkthrough identity.');
  return {
    id, slug, state: String(item.state) as HelpWalkthroughState,
    purpose: String(item.purpose) as HelpWalkthroughPurpose,
    currentRevision: number(item.current_revision), publishedRevision: nullableNumber(item.published_revision),
    title: String(item.title ?? ''), summary: String(item.summary ?? ''), steps: strings(item.steps),
    keywords: strings(item.keywords), featureArea: String(item.feature_area ?? ''),
    routeContexts: strings(item.route_contexts), audienceRoles: strings(item.audience_roles),
    sourceCommit: nullableString(item.source_commit), sourceVersion: nullableString(item.source_version),
    videoAssetId: nullableString(item.video_asset_id), posterAssetId: nullableString(item.poster_asset_id),
    humanPacedReview: String(item.human_paced_review) as HelpReviewState,
    sensitiveDataReview: String(item.sensitive_data_review) as HelpReviewState,
    canonicalOutputReview: String(item.canonical_output_review) as HelpReviewState,
    validationStatus: String(item.validation_status) as HelpWalkthrough['validationStatus'],
    narrationProvider: nullableString(item.narration_provider), narrationVoice: nullableString(item.narration_voice),
    narrationDisclosure: nullableString(item.narration_disclosure), transcript: nullableString(item.transcript),
    videoFileName: nullableString(item.video_file_name), videoBytes: number(item.video_bytes),
    videoDuration: nullableNumber(item.video_duration), videoWidth: nullableNumber(item.video_width),
    videoHeight: nullableNumber(item.video_height), posterFileName: nullableString(item.poster_file_name),
    createdAt: String(item.created_at ?? ''), updatedAt: String(item.updated_at ?? ''),
    publishedAt: nullableString(item.published_at),
  };
}

export function parseHelpRecordingJob(value: unknown): HelpRecordingJob {
  const item = record(value);
  const id = String(item.job_id ?? '');
  if (!UUID.test(id)) throw new Error('Help Studio received an invalid recording job identity.');
  const object = item.recorder_metadata;
  return {
    id, targetWalkthroughId: nullableString(item.target_walkthrough_id),
    status: String(item.status) as HelpRecordingStatus, slug: String(item.slug ?? ''),
    title: String(item.title ?? ''), summary: String(item.summary ?? ''),
    purpose: String(item.purpose) as HelpWalkthroughPurpose,
    featureArea: String(item.feature_area ?? ''), routeContexts: strings(item.route_contexts),
    audienceRoles: strings(item.audience_roles), keywords: strings(item.keywords),
    requestedGoal: String(item.requested_goal ?? ''), targetScreen: String(item.target_screen ?? ''),
    requiredStartingState: String(item.required_starting_state ?? ''), scenarioKey: String(item.scenario_key ?? ''),
    actionSteps: strings(item.action_steps), expectedFinalState: String(item.expected_final_state ?? ''),
    desiredDurationSeconds: number(item.desired_duration_seconds), narrationMode: String(item.narration_mode) as HelpNarrationMode,
    talkingPoints: strings(item.talking_points), pacingProfile: String(item.pacing_profile) as 'servsync-human-paced-v1',
    sourceKind: String(item.source_kind) as HelpRecordingJob['sourceKind'], sourceCommit: nullableString(item.source_commit),
    sourceVersion: nullableString(item.source_version), videoAssetId: nullableString(item.video_asset_id),
    posterAssetId: nullableString(item.poster_asset_id),
    recorderMetadata: object && typeof object === 'object' && !Array.isArray(object) ? object as Record<string, unknown> : {},
    failureCategory: nullableString(item.failure_category), failureMessage: nullableString(item.failure_message),
    reviewNotes: nullableString(item.review_notes), approvedWalkthroughId: nullableString(item.approved_walkthrough_id),
    approvedRevision: nullableNumber(item.approved_revision), requestedAt: String(item.requested_at ?? ''),
    readyForReviewAt: nullableString(item.ready_for_review_at), reviewedAt: nullableString(item.reviewed_at),
    updatedAt: String(item.updated_at ?? ''),
  };
}

export function parseHelpSearchResult(value: unknown): HelpSearchResult {
  const item = record(value);
  const id = String(item.walkthrough_id ?? '');
  const videoAssetId = String(item.video_asset_id ?? '');
  if (!UUID.test(id) || !UUID.test(videoAssetId)) throw new Error('Help search returned an invalid walkthrough.');
  return {
    id, slug: String(item.slug ?? ''), revision: number(item.revision), title: String(item.title ?? ''),
    summary: String(item.summary ?? ''), steps: strings(item.steps), keywords: strings(item.keywords),
    featureArea: String(item.feature_area ?? ''), purpose: String(item.purpose) as HelpWalkthroughPurpose,
    routeContexts: strings(item.route_contexts), videoAssetId,
    posterAssetId: nullableString(item.poster_asset_id), durationSeconds: number(item.duration_seconds),
    width: number(item.width), height: number(item.height),
    narrationDisclosure: nullableString(item.narration_disclosure), rank: number(item.rank),
  };
}

export async function listHelpWalkthroughs(client: HelpStudioClient, query = '') {
  const data = await rpc(client, 'servsync_list_help_walkthroughs', { p_query: query || null }, 'Unable to load Help Studio.');
  return (Array.isArray(data) ? data : []).map(parseHelpWalkthrough);
}

export async function listHelpRecordingJobs(client: HelpStudioClient) {
  const data = await rpc(client, 'servsync_list_help_recording_jobs', {}, 'Unable to load recording requests.');
  return (Array.isArray(data) ? data : []).map(parseHelpRecordingJob);
}

export async function createHelpRecordingJob(client: HelpStudioClient, draft: HelpRecordingSpecDraft) {
  return record(await rpc(client, 'servsync_create_help_recording_job', {
    p_spec: helpRecordingSpecPayload(draft),
  }, 'Unable to create the recording request.'));
}

export async function transitionHelpRecordingJob(
  client: HelpStudioClient,
  job: Pick<HelpRecordingJob, 'id' | 'status'>,
  action: 'start_preparing' | 'start_recording' | 'start_processing' | 'complete' | 'fail',
  payload: Record<string, unknown> = {},
) {
  return record(await rpc(client, 'servsync_transition_help_recording_job', {
    p_job_id: job.id, p_expected_status: job.status, p_action: action, p_payload: payload,
  }, 'Unable to update the recording request.'));
}

export async function reviewHelpRecordingJob(client: HelpStudioClient, id: string, action: 'approve' | 'return', notes = '') {
  return record(await rpc(client, 'servsync_review_help_recording_job', {
    p_job_id: id, p_action: action, p_review_notes: notes.trim() || null,
  }, action === 'approve' ? 'Unable to approve the recording.' : 'Unable to return the recording.'));
}

export async function findHelp(client: HelpStudioClient, input: { query?: string; routeContext?: string; contractorId?: string | null; limit?: number }) {
  const data = await rpc(client, 'servsync_find_help', {
    p_query: input.query?.trim() || null, p_route_context: input.routeContext || null,
    p_contractor_id: input.contractorId || null, p_limit: input.limit ?? 10,
  }, 'Help is unavailable right now.');
  return (Array.isArray(data) ? data : []).map(parseHelpSearchResult);
}

export async function loadHelpUsage(client: HelpStudioClient): Promise<HelpUsage> {
  const value = record(await rpc(client, 'servsync_get_help_media_usage', {}, 'Unable to load Help media usage.'));
  return {
    totalAssets: number(value.total_assets), totalBytes: number(value.total_bytes),
    videoAssets: number(value.video_assets), posterAssets: number(value.poster_assets),
    publishedWalkthroughs: number(value.published_walkthroughs),
    unpublishedWalkthroughs: number(value.unpublished_walkthroughs),
  };
}

export async function createHelpWalkthrough(client: HelpStudioClient, slug: string, draft: HelpWalkthroughDraft) {
  if (!SAFE_SLUG.test(slug)) throw new Error('Use a short lowercase slug with words separated by hyphens.');
  return record(await rpc(client, 'servsync_create_help_walkthrough', { p_slug: slug, p_payload: helpPayload(draft) }, 'Unable to create the walkthrough.'));
}

export async function updateHelpWalkthrough(client: HelpStudioClient, id: string, revision: number, draft: HelpWalkthroughDraft) {
  return record(await rpc(client, 'servsync_update_help_walkthrough', {
    p_walkthrough_id: id, p_expected_revision: revision, p_payload: helpPayload(draft),
  }, 'Unable to save the walkthrough.'));
}

export async function transitionHelpWalkthrough(client: HelpStudioClient, id: string, revision: number, action: 'publish' | 'unpublish' | 'needs_review' | 'deprecate' | 'archive') {
  return record(await rpc(client, 'servsync_transition_help_walkthrough', {
    p_walkthrough_id: id, p_expected_revision: revision, p_action: action,
  }, 'Unable to update the walkthrough status.'));
}

export async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function inspectMediaFile(file: File, kind: 'video' | 'poster') {
  const objectUrl = URL.createObjectURL(file);
  try {
    if (kind === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('The video could not be decoded.'));
      });
      return { width: video.videoWidth, height: video.videoHeight, duration: Number(video.duration.toFixed(3)) };
    }
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, duration: null };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadHelpMedia(
  client: HelpStudioClient,
  file: File,
  kind: 'video' | 'poster',
  sourceCommit?: string,
  recording?: { jobId: string; scenario: string; pacingProfile: string },
) {
  const expectedMime = kind === 'video' ? ['video/mp4'] : ['image/png', 'image/jpeg', 'image/webp'];
  if (!expectedMime.includes(file.type) || file.size < 1 || file.size > 104857600) throw new Error('Choose a supported file no larger than 100 MB.');
  const metadata = await inspectMediaFile(file, kind);
  const checksum = await sha256(file);
  if (!SHA256.test(checksum)) throw new Error('The media checksum could not be verified.');
  const reservation = record(await rpc(client,
    recording ? 'servsync_reserve_help_recording_media_upload' : 'servsync_reserve_help_media_upload',
    recording ? {
      p_job_id: recording.jobId, p_asset_kind: kind, p_original_file_name: file.name,
      p_mime_type: file.type, p_file_size_bytes: file.size, p_source_commit: sourceCommit || null,
      p_provenance: { scenario: recording.scenario, pacing_profile: recording.pacingProfile },
    } : {
      p_asset_kind: kind, p_original_file_name: file.name, p_mime_type: file.type,
      p_file_size_bytes: file.size, p_source_commit: sourceCommit || null,
      p_provenance: { canonical_product_output: true, imported_by: 'help_studio_v1' },
    }, 'Unable to reserve private Help storage.'));
  const assetId = String(reservation.asset_id ?? '');
  const bucket = String(reservation.bucket ?? '');
  const path = String(reservation.path ?? '');
  if (!UUID.test(assetId) || bucket !== 'help-walkthroughs' || !path.startsWith('00000000-0000-4000-8000-000000000037/')) {
    throw new Error('Help Studio returned an invalid upload reservation.');
  }
  const { error: uploadError } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error('The private Help media upload failed.');
  await rpc(client, 'servsync_finalize_help_media_upload', {
    p_asset_id: assetId, p_sha256: checksum, p_width: metadata.width,
    p_height: metadata.height, p_duration_seconds: metadata.duration,
  }, 'The uploaded Help media could not be verified.');
  return { assetId, checksum, ...metadata };
}

export function buildHelpRecordingExport(job: HelpRecordingJob) {
  return {
    schema_version: 1,
    recording_job_id: job.id,
    title: job.title,
    purpose: job.purpose,
    feature_area: job.featureArea,
    target_screen: job.targetScreen,
    route_contexts: job.routeContexts,
    audience_roles: job.audienceRoles,
    requested_goal: job.requestedGoal,
    required_starting_state: job.requiredStartingState,
    scenario: job.scenarioKey,
    actions: job.actionSteps,
    expected_final_state: job.expectedFinalState,
    desired_duration_seconds: job.desiredDurationSeconds,
    narration_mode: job.narrationMode,
    talking_points: job.talkingPoints,
    pacing_profile: job.pacingProfile,
  };
}

export async function helpPlaybackUrl(client: HelpStudioClient, walkthroughId: string, contractorId?: string | null) {
  const { data, error } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error('Sign in again to open this walkthrough.');
  const response = await fetch('/api/help-walkthrough-media', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ walkthroughId, contractorId: contractorId || null }),
  });
  const payload = await response.json() as { signedUrl?: string; message?: string };
  if (!response.ok || !payload.signedUrl) throw new Error(payload.message || 'Unable to open this walkthrough.');
  return payload.signedUrl;
}

export async function helpRecordingPlaybackUrl(client: HelpStudioClient, recordingJobId: string) {
  const { data, error } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error('Sign in again to review this recording.');
  const response = await fetch('/api/help-walkthrough-media', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordingJobId }),
  });
  const payload = await response.json() as { signedUrl?: string; message?: string };
  if (!response.ok || !payload.signedUrl) throw new Error(payload.message || 'Unable to review this recording.');
  return payload.signedUrl;
}

export function formatHelpBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
