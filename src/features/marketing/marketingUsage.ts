export type MarketingUsageSummary = {
  workspace: { workspaceId: string; workspaceKind: 'internal' | 'contractor'; displayName: string };
  entitlements: {
    planKey: string;
    activeMediaSlots: number;
    monthlyVideoGenerations: number;
    readyScheduledPostLimit: number;
    maxGeneratedVideoSeconds: number;
    publishedMediaRetentionHours: number;
    abandonedMediaExpirationDays: number;
    generationEnabled: boolean;
    usagePeriod: 'rolling_30_days';
  };
  usage: {
    videoGenerationsRolling30Days: number;
    aiTextDraftsRolling30Days: number;
    activeMediaSlots: number;
    activeMediaBytes: number;
    readyScheduledPosts: number;
  };
  generation: {
    enabled: boolean;
    globalBudgetConfigured: boolean;
    globalWarning: boolean;
    globalHardStop: boolean;
    recentTextDraft: null | {
      provider: string;
      model: string;
      costStatus: 'known' | 'estimated' | 'pending' | 'unavailable';
      knownCostMicrousd: number | null;
      estimatedCostMicrousd: number | null;
      outcome: string;
      inputTokens: number;
      outputTokens: number;
      occurredAt: string;
    };
  };
  recentMedia: Array<{
    assetId: string;
    assetType: 'image' | 'video';
    source: string;
    state: string;
    mimeType: string;
    fileSizeBytes: number;
    posterPath: string | null;
    purgedAt: string | null;
  }>;
};

export type MarketingCostControls = {
  generationEnabled: boolean;
  monthlyBudgetMicrousd: number | null;
  warningPercent: number;
  hardStopPercent: number;
  currentSpendMicrousd: number;
  stopReason: string | null;
  updatedAt: string;
};

type RpcResult = { data: unknown; error: unknown };
type StorageResult<T> = PromiseLike<{ data: T; error: unknown }>;

export interface MarketingUsageClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  storage: {
    from(bucket: string): {
      upload(path: string, file: Blob, options: { contentType: string; upsert: boolean }): StorageResult<unknown>;
      remove(paths: string[]): StorageResult<unknown>;
    };
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const string = (value: unknown) => typeof value === 'string' ? value : '';

function serverMessage(error: unknown) {
  return isRecord(error) && typeof error.message === 'string' ? error.message : '';
}

async function rpc(client: MarketingUsageClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(serverMessage(error) || 'ServSync could not complete the Marketing request.');
  return data;
}

export function parseMarketingUsageSummary(value: unknown): MarketingUsageSummary {
  if (!isRecord(value) || !isRecord(value.workspace) || !isRecord(value.entitlements)
    || !isRecord(value.usage) || !isRecord(value.generation) || !Array.isArray(value.recent_media)) {
    throw new Error('ServSync returned malformed Marketing usage data.');
  }
  const workspaceKind = value.workspace.workspace_kind;
  if (workspaceKind !== 'internal' && workspaceKind !== 'contractor') throw new Error('Invalid Marketing workspace.');
  return {
    workspace: {
      workspaceId: string(value.workspace.workspace_id),
      workspaceKind,
      displayName: string(value.workspace.display_name),
    },
    entitlements: {
      planKey: string(value.entitlements.plan_key),
      activeMediaSlots: number(value.entitlements.active_media_slots),
      monthlyVideoGenerations: number(value.entitlements.monthly_video_generations),
      readyScheduledPostLimit: number(value.entitlements.ready_scheduled_post_limit),
      maxGeneratedVideoSeconds: number(value.entitlements.max_generated_video_seconds),
      publishedMediaRetentionHours: number(value.entitlements.published_media_retention_hours),
      abandonedMediaExpirationDays: number(value.entitlements.abandoned_media_expiration_days),
      generationEnabled: value.entitlements.generation_enabled === true,
      usagePeriod: 'rolling_30_days',
    },
    usage: {
      videoGenerationsRolling30Days: number(value.usage.video_generations_rolling_30_days),
      aiTextDraftsRolling30Days: number(value.usage.ai_text_drafts_rolling_30_days),
      activeMediaSlots: number(value.usage.active_media_slots),
      activeMediaBytes: number(value.usage.active_media_bytes),
      readyScheduledPosts: number(value.usage.ready_scheduled_posts),
    },
    generation: {
      enabled: value.generation.enabled === true,
      globalBudgetConfigured: value.generation.global_budget_configured === true,
      globalWarning: value.generation.global_warning === true,
      globalHardStop: value.generation.global_hard_stop === true,
      recentTextDraft: isRecord(value.generation.recent_text_draft) ? {
        provider: string(value.generation.recent_text_draft.provider),
        model: string(value.generation.recent_text_draft.model),
        costStatus: ['known', 'estimated', 'pending'].includes(string(value.generation.recent_text_draft.cost_status))
          ? string(value.generation.recent_text_draft.cost_status) as 'known' | 'estimated' | 'pending'
          : 'unavailable',
        knownCostMicrousd: value.generation.recent_text_draft.known_cost_microusd === null ? null : number(value.generation.recent_text_draft.known_cost_microusd),
        estimatedCostMicrousd: value.generation.recent_text_draft.estimated_cost_microusd === null ? null : number(value.generation.recent_text_draft.estimated_cost_microusd),
        outcome: string(value.generation.recent_text_draft.outcome),
        inputTokens: number(value.generation.recent_text_draft.input_tokens),
        outputTokens: number(value.generation.recent_text_draft.output_tokens),
        occurredAt: string(value.generation.recent_text_draft.occurred_at),
      } : null,
    },
    recentMedia: value.recent_media.filter(isRecord).map(item => ({
      assetId: string(item.asset_id),
      assetType: item.asset_type === 'image' ? 'image' : 'video',
      source: string(item.source),
      state: string(item.state),
      mimeType: string(item.mime_type),
      fileSizeBytes: number(item.file_size_bytes),
      posterPath: typeof item.poster_path === 'string' ? item.poster_path : null,
      purgedAt: typeof item.purged_at === 'string' ? item.purged_at : null,
    })),
  };
}

export function parseMarketingCostControls(value: unknown): MarketingCostControls {
  if (!isRecord(value)) throw new Error('ServSync returned malformed Marketing cost controls.');
  return {
    generationEnabled: value.generation_enabled === true,
    monthlyBudgetMicrousd: value.monthly_budget_microusd === null ? null : number(value.monthly_budget_microusd),
    warningPercent: number(value.warning_percent),
    hardStopPercent: number(value.hard_stop_percent),
    currentSpendMicrousd: number(value.current_spend_microusd),
    stopReason: typeof value.stop_reason === 'string' ? value.stop_reason : null,
    updatedAt: string(value.updated_at),
  };
}

export function createMarketingUsageAdapter(client: MarketingUsageClient, contractorId: string | null) {
  return {
    async getSummary() {
      if (contractorId) {
        await rpc(client, 'servsync_ensure_contractor_marketing_workspace', {
          p_contractor_id: contractorId,
        });
      }
      return parseMarketingUsageSummary(await rpc(client, 'servsync_get_marketing_usage_summary', {
        p_contractor_id: contractorId,
      }));
    },
    async getCostControls() {
      return parseMarketingCostControls(await rpc(client, 'servsync_get_marketing_cost_controls', {}));
    },
    async updateCostControls(input: Omit<MarketingCostControls, 'currentSpendMicrousd' | 'updatedAt'>) {
      return parseMarketingCostControls(await rpc(client, 'servsync_update_marketing_cost_controls', {
        p_generation_enabled: input.generationEnabled,
        p_monthly_budget_microusd: input.monthlyBudgetMicrousd,
        p_warning_percent: input.warningPercent,
        p_hard_stop_percent: input.hardStopPercent,
        p_stop_reason: input.stopReason,
      }));
    },
    async upload(file: File, rightsAcknowledged: boolean) {
      const requestId = crypto.randomUUID();
      const reserved = await rpc(client, 'servsync_reserve_marketing_upload', {
        p_contractor_id: contractorId,
        p_client_request_id: requestId,
        p_original_file_name: file.name,
        p_mime_type: file.type,
        p_file_size_bytes: file.size,
        p_rights_acknowledged: rightsAcknowledged,
      });
      if (!isRecord(reserved)) throw new Error('ServSync could not reserve the Marketing upload.');
      const intakeId = string(reserved.intake_id);
      const bucket = string(reserved.storage_bucket);
      const sourcePath = string(reserved.source_path);
      const posterPath = string(reserved.poster_path);
      const prepared = await prepareMarketingUpload(file);
      let sourceUploaded = false;
      let posterUploaded = false;
      try {
        const sourceResult = await client.storage.from(bucket).upload(sourcePath, file, { contentType: file.type, upsert: false });
        if (sourceResult.error) throw new Error('ServSync could not upload the Marketing media.');
        sourceUploaded = true;
        const posterResult = await client.storage.from(bucket).upload(posterPath, prepared.poster, { contentType: 'image/jpeg', upsert: false });
        if (posterResult.error) throw new Error('ServSync could not upload the Marketing preview image.');
        posterUploaded = true;
        return await rpc(client, 'servsync_finalize_marketing_upload', {
          p_contractor_id: contractorId,
          p_intake_id: intakeId,
          p_sha256: prepared.sha256,
          p_width: prepared.width,
          p_height: prepared.height,
          p_duration_seconds: prepared.durationSeconds,
          p_poster_sha256: prepared.posterSha256,
          p_poster_file_size_bytes: prepared.poster.size,
        });
      } catch (error) {
        const exactPaths = [sourceUploaded ? sourcePath : '', posterUploaded ? posterPath : ''].filter(Boolean);
        if (exactPaths.length) await client.storage.from(bucket).remove(exactPaths);
        throw error;
      }
    },
  };
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function canvasPoster(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, 640 / width, 640 / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare a Marketing preview image.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('This browser could not encode the Marketing preview image.')),
    'image/jpeg', 0.78,
  ));
}

async function videoMetadata(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('The MP4 could not be decoded.'));
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('The MP4 duration is unavailable.');
    video.currentTime = Math.min(0.25, Math.max(0, video.duration / 3));
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('The MP4 preview frame could not be read.'));
    });
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      durationSeconds: video.duration,
      poster: await canvasPoster(video, video.videoWidth, video.videoHeight),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareMarketingUpload(file: File) {
  if (!['image/jpeg','image/png','image/webp','video/mp4'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, WebP, or MP4 file.');
  }
  const metadata = file.type === 'video/mp4'
    ? await videoMetadata(file)
    : await (async () => {
      const bitmap = await createImageBitmap(file);
      try {
        return { width: bitmap.width, height: bitmap.height, durationSeconds: null, poster: await canvasPoster(bitmap, bitmap.width, bitmap.height) };
      } finally {
        bitmap.close();
      }
    })();
  return {
    ...metadata,
    sha256: await sha256(file),
    posterSha256: await sha256(metadata.poster),
  };
}
