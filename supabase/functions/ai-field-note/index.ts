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

function corsHeadersFor(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://servsync.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

const baseCorsHeaders = {
  'Access-Control-Allow-Origin': 'https://servsync.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

type FindingStatus = 'Pass' | 'Monitor' | 'Fixed On Site' | 'Needs Repair' | 'Urgent';
type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';

function jsonResponse(body: unknown, status = 200, headers = baseCorsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function cleanString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'OPENAI_API_KEY is not configured.' }, 500, corsHeaders);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Not authenticated.' }, 401, corsHeaders);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (supabaseUrl && supabaseAnonKey) {
      const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=role&limit=1`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: authHeader,
        },
      });
      const profiles = await profileRes.json();
      const role = Array.isArray(profiles) ? profiles[0]?.role : undefined;
      if (role !== 'platform_admin') return jsonResponse({ error: 'Only platform admins can use the AI field assistant.' }, 403, corsHeaders);
    }

    const body = await req.json();
    const note = cleanString(body.note);
    const room = cleanString(body.room, 'Current room');
    const availableChecklistItems = Array.isArray(body.availableChecklistItems)
      ? body.availableChecklistItems.filter((item: unknown) => typeof item === 'string' && item.trim()).slice(0, 40)
      : [];

    if (!note) return jsonResponse({ error: 'Missing field note.' }, 400, corsHeaders);
    if (availableChecklistItems.length === 0) return jsonResponse({ error: 'No checklist items were provided.' }, 400, corsHeaders);

    const customer = body.customer || {};
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['checklistItem', 'status', 'priority', 'description', 'action', 'due', 'confidence'],
      properties: {
        checklistItem: { type: 'string', enum: availableChecklistItems },
        status: { type: 'string', enum: ['Pass', 'Monitor', 'Fixed On Site', 'Needs Repair', 'Urgent'] },
        priority: { type: 'string', enum: ['Urgent', 'High', 'Medium', 'Low'] },
        description: { type: 'string' },
        action: { type: 'string' },
        due: { type: 'string' },
        confidence: { type: 'number' },
      },
    };

    const prompt = `You are an expert residential preventative maintenance inspection assistant for contractors. Convert the rough field note into concise, customer-friendly inspection report language.\n\nRules:\n- Choose exactly one checklistItem from the provided enum.\n- Do not invent facts not in the note.\n- If the note describes normal condition/no issue, use Pass and Low priority.\n- If it needs watching but not repair, use Monitor and Medium priority.\n- If it should be repaired, use Needs Repair and High or Medium priority.\n- If there is active leak, safety hazard, electrical hazard, gas odor, major water intrusion, or immediate damage risk, use Urgent and Urgent priority.\n- Description should be 1-2 clear sentences for the customer report.\n- Action should be a practical recommended next step.\n- Due should be short, like "Next service visit", "Within 30 days", "ASAP", or "Monitor next visit".
- If the note says tightened, fixed, cleared, adjusted, reset, no leak now, working now, or corrected during visit, prefer Fixed On Site with an action describing what was done.\n\nContext:\nCustomer: ${cleanString(customer.name, 'Unknown')}\nRoom: ${room}\nYear built: ${cleanString(customer.yearBuilt, 'Unknown')}\nRoof age: ${cleanString(customer.roofAge, 'Unknown')}\nHVAC age: ${cleanString(customer.hvacAge, 'Unknown')}\nPlan: ${cleanString(customer.plan, 'Unknown')}\n\nRough field note:\n${note}`;

    const openAiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'field_inspection_draft',
            strict: true,
            schema,
          },
        },
      }),
    });

    const openAiJson = await openAiRes.json();
    if (!openAiRes.ok) {
      console.error('OpenAI error', openAiJson);
      return jsonResponse({ error: 'AI drafting failed.', details: openAiJson }, 502, corsHeaders);
    }

    const outputText = openAiJson.output_text || openAiJson.output?.flatMap((item: any) => item.content || [])?.find((part: any) => part.type === 'output_text')?.text;
    if (!outputText) return jsonResponse({ error: 'AI returned no output.' }, 502, corsHeaders);

    const draft = JSON.parse(outputText) as {
      checklistItem: string;
      status: FindingStatus;
      priority: Priority;
      description: string;
      action: string;
      due: string;
      confidence: number;
    };

    return jsonResponse(draft, 200, corsHeaders);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500, corsHeaders);
  }
});
