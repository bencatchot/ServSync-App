import { createClient } from '@supabase/supabase-js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HELP_BUCKET = 'help-walkthroughs';
const SIGNED_URL_SECONDS = 300;

type HelpPlaybackGrant = {
  walkthrough_id?: string;
  recording_job_id?: string;
  revision?: number;
  video_asset_id: string;
  poster_asset_id?: string | null;
  title: string;
};

type HelpMediaAsset = {
  asset_id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  sha256: string;
  file_size_bytes: number;
  duration_seconds: number;
  width: number;
  height: number;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function bearer(request: Request) {
  const value = request.headers.get('authorization') ?? '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function safeBody(value: unknown): { walkthroughId: string | null; recordingJobId: string | null; contractorId: string | null } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some(key => !['walkthroughId', 'recordingJobId', 'contractorId'].includes(key))) return null;
  const walkthroughId = body.walkthroughId === null || body.walkthroughId === undefined
    ? null : typeof body.walkthroughId === 'string' ? body.walkthroughId : '';
  const recordingJobId = body.recordingJobId === null || body.recordingJobId === undefined
    ? null : typeof body.recordingJobId === 'string' ? body.recordingJobId : '';
  const contractorId = body.contractorId === null || body.contractorId === undefined
    ? null
    : typeof body.contractorId === 'string' ? body.contractorId : '';
  if ((walkthroughId === null) === (recordingJobId === null)
    || (walkthroughId !== null && !UUID.test(walkthroughId))
    || (recordingJobId !== null && !UUID.test(recordingJobId))
    || (contractorId !== null && !UUID.test(contractorId))
    || (recordingJobId !== null && contractorId !== null)) return null;
  return { walkthroughId, recordingJobId, contractorId };
}

export function createHelpWalkthroughMediaHandler(
  environment: NodeJS.ProcessEnv = process.env,
  clientFactory: typeof createClient = createClient,
) {
  return async (request: Request) => {
    if (request.method !== 'POST') return json(405, { message: 'Method not allowed.' });
    const accessToken = bearer(request);
    if (!accessToken) return json(401, { message: 'Authentication required.' });

    const supabaseUrl = environment.SUPABASE_URL?.trim() ?? '';
    const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
    if (!supabaseUrl || !serviceRoleKey) return json(503, { message: 'Help playback is unavailable.' });

    let body: { walkthroughId: string | null; recordingJobId: string | null; contractorId: string | null } | null = null;
    try { body = safeBody(await request.json()); } catch { body = null; }
    if (!body) return json(400, { message: 'Invalid walkthrough request.' });

    const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
    const user = clientFactory(supabaseUrl, serviceRoleKey, {
      ...options,
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const service = clientFactory(supabaseUrl, serviceRoleKey, options);

    const { data: grantValue, error: grantError } = body.recordingJobId
      ? await user.rpc('servsync_get_help_recording_playback_grant', { p_job_id: body.recordingJobId })
      : await user.rpc('servsync_get_help_playback_grant', {
        p_walkthrough_id: body.walkthroughId,
        p_contractor_id: body.contractorId,
      });
    if (grantError || !grantValue || typeof grantValue !== 'object') {
      return json(grantError?.code === 'P0002' ? 404 : 403, { message: 'This walkthrough is not available for your account.' });
    }
    const grant = grantValue as HelpPlaybackGrant;
    const identityMatches = body.recordingJobId
      ? grant.recording_job_id === body.recordingJobId
      : grant.walkthrough_id === body.walkthroughId;
    if (!identityMatches || !UUID.test(grant.video_asset_id)) {
      return json(409, { message: 'Walkthrough media identity could not be verified.' });
    }

    const { data: assetRows, error: assetError } = await service.rpc('servsync_get_help_media_for_service', {
      p_asset_id: grant.video_asset_id,
    });
    const asset = Array.isArray(assetRows) ? assetRows[0] as HelpMediaAsset | undefined : undefined;
    if (assetError || !asset) return json(404, { message: 'Walkthrough media is unavailable.' });
    if (asset.asset_id !== grant.video_asset_id || asset.storage_bucket !== HELP_BUCKET || !asset.storage_path
      || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      return json(409, { message: 'Walkthrough media identity could not be verified.' });
    }

    const { data: signed, error: signedError } = await service.storage
      .from(HELP_BUCKET)
      .createSignedUrl(asset.storage_path, SIGNED_URL_SECONDS);
    if (signedError || !signed?.signedUrl) return json(503, { message: 'Walkthrough playback is unavailable.' });

    return json(200, {
      signedUrl: signed.signedUrl,
      expiresIn: SIGNED_URL_SECONDS,
      walkthroughId: grant.walkthrough_id ?? null,
      recordingJobId: grant.recording_job_id ?? null,
      revision: grant.revision,
      mimeType: asset.mime_type,
      durationSeconds: Number(asset.duration_seconds),
      width: asset.width,
      height: asset.height,
    });
  };
}
