import { createMarketingUsageAdapter, prepareMarketingUpload, type MarketingUsageClient } from './marketingUsage';

export type MarketingCreationMedia = {
  path: string;
  mimeType: string;
  fileSizeBytes: number;
};

export type MarketingCreationJob = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  completedAt: string | null;
  workItems: Array<{ title: string; customerDescription: string | null }>;
  media: MarketingCreationMedia[];
};

export type MarketingCreationProductMedia = {
  id: string;
  label: string;
  type: 'image' | 'video';
  variant: string;
  durationSeconds: number | null;
  sourceKind: 'managed_asset' | 'help_walkthrough';
  sourceAssetId: string;
  sourceRevision: number | null;
  sha256: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
};

export type MarketingCreationContext = {
  profile: null | {
    id: string;
    version: number;
    name: string | null;
    summary: string;
    serviceFocus: string[];
    tone: string;
    generationReady: boolean;
  };
  jobs: MarketingCreationJob[];
  productMedia: MarketingCreationProductMedia[];
};

type RpcResult = { data: unknown; error: unknown };
type StorageResult<T> = PromiseLike<{ data: T; error: unknown }>;

export interface MarketingCreationClient extends MarketingUsageClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  functions: { invoke(name: string, options: { body: Record<string, unknown> }): PromiseLike<RpcResult> };
  auth: {
    getSession(): PromiseLike<{ data: { session: { access_token?: string } | null }; error: unknown }>;
  };
  storage: {
    from(bucket: string): {
      download(path: string): StorageResult<Blob | null>;
      upload(path: string, file: Blob, options: { contentType: string; upsert: boolean }): StorageResult<unknown>;
      remove(paths: string[]): StorageResult<unknown>;
    };
  };
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const message = (error: unknown) => record(error) && typeof error.message === 'string' ? error.message : '';

async function rpc(client: MarketingCreationClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(message(error) || 'ServSync could not complete the Marketing request.');
  return data;
}

function parseContext(value: unknown, helpSources: unknown = []): MarketingCreationContext {
  if (!record(value) || !Array.isArray(value.jobs)) throw new Error('ServSync returned malformed Marketing creation data.');
  const profile = record(value.profile) ? {
    id: text(value.profile.profile_id),
    version: number(value.profile.profile_version),
    name: typeof value.profile.marketing_name === 'string' ? value.profile.marketing_name : null,
    summary: text(value.profile.business_summary),
    serviceFocus: Array.isArray(value.profile.service_focus) ? value.profile.service_focus.filter((item): item is string => typeof item === 'string') : [],
    tone: text(value.profile.tone_style),
    generationReady: value.profile.generation_ready === true,
  } : null;
  const productMedia: MarketingCreationProductMedia[] = [];
  if (Array.isArray(value.product_media)) productMedia.push(...value.product_media.filter(record).map(item => ({
    id: text(item.asset_id), label: text(item.label) || 'ServSync product media',
    type: item.asset_type === 'image' ? 'image' as const : 'video' as const,
    variant: text(item.media_variant),
    durationSeconds: typeof item.duration_seconds === 'number' ? item.duration_seconds : null,
    sourceKind: 'managed_asset' as const, sourceAssetId: text(item.asset_id),
    sourceRevision: null, sha256: null, fileSizeBytes: null, mimeType: null,
  })));
  if (Array.isArray(helpSources)) productMedia.push(...helpSources.filter(record).map(item => ({
    id: text(item.walkthrough_id), label: text(item.title) || 'Help walkthrough',
    type: 'video' as const, variant: 'help_walkthrough',
    durationSeconds: typeof item.duration_seconds === 'number' ? item.duration_seconds : null,
    sourceKind: 'help_walkthrough' as const, sourceAssetId: text(item.video_asset_id),
    sourceRevision: number(item.revision), sha256: text(item.sha256) || null,
    fileSizeBytes: number(item.file_size_bytes) || null, mimeType: text(item.mime_type) || null,
  })));
  return {
    profile,
    productMedia,
    jobs: value.jobs.filter(record).map(job => ({
      id: text(job.job_id), title: text(job.title), summary: typeof job.summary === 'string' ? job.summary : null,
      status: text(job.status), completedAt: typeof job.completed_at === 'string' ? job.completed_at : null,
      workItems: Array.isArray(job.work_items) ? job.work_items.filter(record).map(item => ({
        title: text(item.title), customerDescription: typeof item.customer_description === 'string' ? item.customer_description : null,
      })) : [],
      media: Array.isArray(job.media) ? job.media.filter(record).map(item => ({
        path: text(item.path), mimeType: text(item.mime_type), fileSizeBytes: number(item.file_size_bytes),
      })) : [],
    })),
  };
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createMarketingCreationAdapter(client: MarketingCreationClient, contractorId: string | null) {
  const usage = createMarketingUsageAdapter(client, contractorId);
  return {
    async context() {
      const creation = await rpc(client, 'servsync_get_marketing_creation_context', { p_contractor_id: contractorId });
      const helpSources = contractorId ? [] : await rpc(client, 'servsync_list_help_marketing_sources', {});
      return parseContext(creation, helpSources);
    },
    usage: usage.getSummary,
    upload: usage.upload,
    async selectJobMedia(jobId: string, media: MarketingCreationMedia, rightsAcknowledged: boolean) {
      if (!contractorId) throw new Error('Job media is available in contractor workspaces.');
      const downloaded = await client.storage.from('inspection-media').download(media.path);
      if (downloaded.error || !(downloaded.data instanceof Blob)) throw new Error('ServSync could not read the selected Job media.');
      const file = new File([downloaded.data], media.path.split('/').pop() || 'job-media', { type: media.mimeType });
      if (file.size !== media.fileSizeBytes) throw new Error('The selected Job media changed. Reload and choose it again.');
      const prepared = await prepareMarketingUpload(file);
      const requestId = crypto.randomUUID();
      const reserved = await rpc(client, 'servsync_prepare_job_marketing_derivative', {
        p_contractor_id: contractorId, p_client_request_id: requestId, p_job_id: jobId,
        p_source_path: media.path, p_mime_type: media.mimeType, p_file_size_bytes: media.fileSizeBytes,
        p_sha256: await sha256(file), p_rights_acknowledged: rightsAcknowledged,
      });
      if (!record(reserved)) throw new Error('ServSync could not reserve the Job media derivative.');
      const intakeId = text(reserved.intake_id);
      const derivativePath = text(reserved.derivative_path);
      const posterPath = text(reserved.poster_path);
      const bucket = text(reserved.derivative_bucket);
      let sourceUploaded = false;
      let posterUploaded = false;
      try {
        const source = await client.storage.from(bucket).upload(derivativePath, file, { contentType: file.type, upsert: false });
        if (source.error) throw new Error('ServSync could not copy the selected Job media.');
        sourceUploaded = true;
        const poster = await client.storage.from(bucket).upload(posterPath, prepared.poster, { contentType: 'image/jpeg', upsert: false });
        if (poster.error) throw new Error('ServSync could not prepare the Job media preview.');
        posterUploaded = true;
        const finalized = await rpc(client, 'servsync_finalize_job_marketing_derivative', {
          p_contractor_id: contractorId, p_intake_id: intakeId, p_derivative_sha256: prepared.sha256,
          p_width: prepared.width, p_height: prepared.height, p_duration_seconds: prepared.durationSeconds,
          p_poster_sha256: prepared.posterSha256, p_poster_file_size_bytes: prepared.poster.size,
        });
        if (!record(finalized) || typeof finalized.asset_id !== 'string') throw new Error('ServSync could not confirm the Job media derivative.');
        return finalized.asset_id;
      } catch (error) {
        const paths = [sourceUploaded ? derivativePath : '', posterUploaded ? posterPath : ''].filter(Boolean);
        if (paths.length) await client.storage.from(bucket).remove(paths);
        throw error;
      }
    },
    async importHelpWalkthrough(source: MarketingCreationProductMedia) {
      if (contractorId || source.sourceKind !== 'help_walkthrough' || !source.sha256
        || !source.fileSizeBytes || source.mimeType !== 'video/mp4' || !source.sourceRevision) {
        throw new Error('The selected Help walkthrough is not available for Marketing.');
      }
      const session = await client.auth.getSession();
      const token = session.data.session?.access_token;
      if (session.error || !token) throw new Error('Sign in again to use this Help walkthrough.');
      const grant = await fetch('/api/help-walkthrough-media', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ walkthroughId: source.id, contractorId: null }),
      });
      const grantPayload = await grant.json() as { signedUrl?: string; message?: string };
      if (!grant.ok || !grantPayload.signedUrl) throw new Error(grantPayload.message || 'ServSync could not open this Help walkthrough.');
      const response = await fetch(grantPayload.signedUrl);
      if (!response.ok) throw new Error('ServSync could not read the selected Help media.');
      const blob = await response.blob();
      if (blob.size !== source.fileSizeBytes || await sha256(blob) !== source.sha256) {
        throw new Error('The selected Help media changed. Reload and choose it again.');
      }
      const uploaded = await usage.upload(new File([blob], 'servsync-help-walkthrough.mp4', { type: 'video/mp4' }), true);
      if (!record(uploaded) || typeof uploaded.asset_id !== 'string') throw new Error('ServSync could not confirm the temporary Marketing derivative.');
      await rpc(client, 'servsync_register_help_marketing_derivative', {
        p_walkthrough_id: source.id, p_walkthrough_revision: source.sourceRevision,
        p_help_asset_id: source.sourceAssetId, p_marketing_asset_id: uploaded.asset_id,
        p_source_sha256: source.sha256,
      });
      return uploaded.asset_id;
    },
    async generate(input: { sourceKind: 'job' | 'marketing_upload' | 'managed_asset' | 'simple'; jobId: string | null; assetId: string | null; brief: string }) {
      const { data, error } = await client.functions.invoke('marketing-content-draft', {
        body: {
          clientRequestId: crypto.randomUUID(), contractorId, sourceKind: input.sourceKind,
          sourceJobId: input.jobId, sourceAssetId: input.assetId, ownerBrief: input.brief,
        },
      });
      if (error) throw new Error(message(error) || 'ServSync could not prepare this draft.');
      if (!record(data) || typeof data.contentId !== 'string') throw new Error(text(record(data) ? data.error : '') || 'ServSync could not confirm the draft.');
      return data.contentId;
    },
  };
}
