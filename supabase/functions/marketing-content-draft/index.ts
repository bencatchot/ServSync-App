const ALLOWED_ORIGINS = new Set([
  'https://servsync.app',
  'https://www.servsync.app',
  'https://serv-sync-app-refresh.vercel.app',
  'https://serv-sync-app.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]);

function headers(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://servsync.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

function response(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function friendlyError(error: unknown, providerStarted: boolean) {
  if (providerStarted) {
    return 'The draft outcome is uncertain. Refresh before trying again; ServSync will not retry automatically.';
  }
  const value = error instanceof Error ? error.message : '';
  if (/temporarily paused/i.test(value)) return 'Marketing drafting is temporarily paused.';
  if (/allowance|limit|active media/i.test(value)) return 'This Marketing workspace has reached its current beta allowance.';
  if (/profile/i.test(value)) return 'Complete the Business Marketing Profile before preparing a draft.';
  return 'ServSync could not prepare this Marketing draft.';
}

async function rpc(url: string, key: string, name: string, body: Record<string, unknown>, authorization?: string) {
  const result = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: authorization ?? `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await result.json().catch(() => null);
  if (!result.ok) throw new Error(text(record(payload) ? payload.message : '') || 'ServSync could not prepare this draft.');
  return payload;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: headers(req) });
  if (req.method !== 'POST') return response(req, { error: 'Method not allowed.' }, 405);

  const authorization = req.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  const model = Deno.env.get('SERVSYNC_MARKETING_TEXT_MODEL') || Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';
  if (!authorization) return response(req, { error: 'Sign in to prepare Marketing content.' }, 401);
  if (!supabaseUrl || !anonKey || !serviceKey || !openAiKey) {
    return response(req, { error: 'Marketing drafting is not configured in this environment.' }, 503);
  }

  let requestId = '';
  let claimToken = '';
  let providerStarted = false;
  try {
    const body = await req.json();
    const clientRequestId = text(body.clientRequestId);
    const sourceKind = text(body.sourceKind);
    const contractorId = typeof body.contractorId === 'string' ? body.contractorId : null;
    const sourceJobId = typeof body.sourceJobId === 'string' ? body.sourceJobId : null;
    const sourceAssetId = typeof body.sourceAssetId === 'string' ? body.sourceAssetId : null;
    const ownerBrief = text(body.ownerBrief);
    if (!clientRequestId || !['job', 'marketing_upload', 'simple'].includes(sourceKind) || ownerBrief.length < 3) {
      return response(req, { error: 'Add a short note about what this post should say.' }, 400);
    }

    const reserved = await rpc(supabaseUrl, anonKey, 'servsync_reserve_marketing_content_creation', {
      p_contractor_id: contractorId,
      p_client_request_id: clientRequestId,
      p_source_kind: sourceKind,
      p_source_job_id: sourceJobId,
      p_source_asset_id: sourceAssetId,
      p_owner_brief: ownerBrief,
      p_provider: 'openai',
      p_model: model,
    }, authorization);
    if (!record(reserved)) throw new Error('ServSync could not confirm the draft request.');
    requestId = text(reserved.request_id);
    if (reserved.status === 'completed' && typeof reserved.content_id === 'string') {
      return response(req, { contentId: reserved.content_id, status: 'draft', replayed: true });
    }

    const claimed = await rpc(supabaseUrl, serviceKey, 'servsync_claim_marketing_content_creation', { p_request_id: requestId });
    if (!record(claimed)) throw new Error('ServSync could not claim the draft request.');
    if (claimed.status === 'completed' && typeof claimed.content_id === 'string') {
      return response(req, { contentId: claimed.content_id, status: 'draft', replayed: true });
    }
    if (claimed.status !== 'processing' || typeof claimed.claim_token !== 'string') {
      return response(req, { error: 'This draft request is already being handled. Refresh before trying again.' }, 409);
    }
    claimToken = text(claimed.claim_token);

    const prompt = [
      'Prepare one truthful social post draft for a small home-service contractor.',
      'Use only the supplied business profile, owner brief, and source context.',
      'Never invent customer names, addresses, prices, dates, certifications, ratings, guarantees, metrics, or work not stated in the context.',
      'Do not mention internal software objects, billing details, private notes, or AI.',
      'Use plain contractor language. Keep one main idea, a short title, and 1-3 brief paragraphs.',
      `Business profile: ${JSON.stringify(claimed.profile)}`,
      `Source type: ${text(claimed.source_kind)}`,
      `Source context: ${JSON.stringify(claimed.source)}`,
      `Owner direction: ${text(claimed.owner_brief)}`,
    ].join('\n\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    providerStarted = true;
    let openAiResponse: Response;
    try {
      openAiResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          input: prompt,
          max_output_tokens: 700,
          text: {
            format: {
              type: 'json_schema',
              name: 'servsync_marketing_draft',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'body'],
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 160 },
                  body: { type: 'string', minLength: 10, maxLength: 3000 },
                },
              },
            },
          },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    const openAi = await openAiResponse.json().catch(() => null);
    if (!openAiResponse.ok) {
      await rpc(supabaseUrl, serviceKey, 'servsync_fail_marketing_content_creation', {
        p_request_id: requestId,
        p_claim_token: claimToken,
        p_outcome: 'failed',
        p_failure_category: 'provider_rejected',
        p_failure_message: 'The drafting provider could not complete this request.',
      });
      return response(req, { error: 'The draft could not be prepared. No post was created.' }, 502);
    }
    const outputText = record(openAi) && typeof openAi.output_text === 'string'
      ? openAi.output_text
      : record(openAi) && Array.isArray(openAi.output)
        ? openAi.output.flatMap(item => record(item) && Array.isArray(item.content) ? item.content : [])
          .find(part => record(part) && part.type === 'output_text')?.text
        : null;
    if (typeof outputText !== 'string') throw new Error('The drafting provider returned no usable copy.');
    const draft = JSON.parse(outputText);
    if (!record(draft)) throw new Error('The drafting provider returned malformed copy.');
    const usage = record(openAi) && record(openAi.usage) ? openAi.usage : {};
    const completed = await rpc(supabaseUrl, serviceKey, 'servsync_complete_marketing_content_creation', {
      p_request_id: requestId,
      p_claim_token: claimToken,
      p_title: text(draft.title),
      p_body: text(draft.body),
      p_input_tokens: Number(usage.input_tokens ?? 0),
      p_output_tokens: Number(usage.output_tokens ?? 0),
    });
    return response(req, {
      contentId: record(completed) ? completed.content_id : null,
      status: 'draft',
      replayed: record(completed) && completed.replayed === true,
    });
  } catch (error) {
    if (providerStarted && requestId && claimToken) {
      await rpc(supabaseUrl!, serviceKey!, 'servsync_fail_marketing_content_creation', {
        p_request_id: requestId,
        p_claim_token: claimToken,
        p_outcome: 'uncertain',
        p_failure_category: 'provider_outcome_uncertain',
        p_failure_message: 'The provider outcome is uncertain. ServSync will not retry this request automatically.',
      }).catch(() => undefined);
    }
    return response(req, { error: friendlyError(error, providerStarted) }, providerStarted ? 502 : 400);
  }
});
