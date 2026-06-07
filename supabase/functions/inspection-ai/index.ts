// ServSync inspection-ai edge function
// Analyzes contractor walkthrough notes and returns structured finding suggestions.
// Deploy: supabase functions deploy inspection-ai
// Env var required: ANTHROPIC_API_KEY

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

interface RoomInput {
  room: string;
  items: string[];
}

interface FindingSuggestion {
  room: string;
  item: string;
  status: FindingStatus;
  notes: string;
  action: string;
}

function jsonResponse(body: unknown, status = 200, headers = baseCorsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

async function enforceAiRateLimit(supabaseUrl: string, serviceRoleKey: string, userId: string, headers: Record<string, string>) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const query = new URLSearchParams({
    select: 'id',
    user_id: `eq.${userId}`,
    function_name: 'eq.inspection-ai',
    called_at: `gte.${since}`,
  });

  const countRes = await fetch(`${supabaseUrl}/rest/v1/ai_call_log?${query.toString()}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'count=exact',
    },
  });
  const contentRange = countRes.headers.get('content-range') ?? '0/0';
  const count = Number(contentRange.split('/')[1] ?? 0);
  if (Number.isFinite(count) && count >= 50) {
    return jsonResponse({ error: 'AI assistant usage is temporarily limited. Try again in a little while.' }, 429, headers);
  }

  await fetch(`${supabaseUrl}/rest/v1/ai_call_log`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId, function_name: 'inspection-ai' }),
  });

  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Not authenticated.' }, 401, corsHeaders);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY is not configured.' }, 500, corsHeaders);

  // Verify caller is a contractor
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  let userId = '';
  if (supabaseUrl && supabaseAnonKey) {
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,role&limit=1`, {
      headers: { apikey: supabaseAnonKey, Authorization: authHeader },
    });
    const profiles = await profileRes.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    const role = profile?.role;
    userId = typeof profile?.id === 'string' ? profile.id : '';
    if (role !== 'contractor') {
      return jsonResponse({ error: 'Only contractor accounts can use the AI inspection assistant.' }, 403, corsHeaders);
    }
    if (supabaseServiceRoleKey && userId) {
      const rateLimitResponse = await enforceAiRateLimit(supabaseUrl, supabaseServiceRoleKey, userId, corsHeaders);
      if (rateLimitResponse) return rateLimitResponse;
    }
  }

  let body: { notes: string; rooms: RoomInput[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400, corsHeaders);
  }

  const { notes, rooms } = body;
  if (!notes?.trim()) return jsonResponse({ error: 'Missing notes.' }, 400, corsHeaders);
  if (!Array.isArray(rooms) || rooms.length === 0) return jsonResponse({ error: 'Missing rooms.' }, 400, corsHeaders);

  const checklistSummary = rooms
    .map(r => `${r.room}: ${r.items.slice(0, 15).join(', ')}`)
    .join('\n');

  const prompt = `You are an expert home inspection assistant. A contractor has provided their walkthrough notes from a home inspection. Your job is to analyze the notes and return structured finding suggestions matched to the inspection checklist.

CHECKLIST:
${checklistSummary}

CONTRACTOR NOTES:
${notes}

Instructions:
- Analyze the notes and identify distinct findings
- Match each finding to the most relevant room and checklist item from the list above
- Assign a status: Pass, Monitor, Fixed On Site, Needs Repair, or Urgent
  - Urgent: immediate safety hazard, structural failure, active water intrusion
  - Needs Repair: damage, defect, or malfunction requiring professional repair
  - Monitor: minor wear, potential issue, or item to watch at next visit
  - Fixed On Site: issue that was corrected during this visit
  - Pass: no issues found
- Write a concise observation note (1-2 sentences max)
- Suggest a recommended action where applicable (leave empty string for Pass)
- Only return findings for items with notable observations (not everything is flagged)
- Return at most 15 findings

Respond ONLY with valid JSON array, no markdown, no explanation:
[
  {
    "room": "exact room name from checklist",
    "item": "exact item text from checklist",
    "status": "Needs Repair",
    "notes": "Brief observation about what was found",
    "action": "Recommended next step"
  }
]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return jsonResponse({ error: 'AI service error. Try again.' }, 502, corsHeaders);
    }

    const claudeRes = await response.json();
    const rawText = claudeRes.content?.[0]?.text ?? '[]';

    let suggestions: FindingSuggestion[] = [];
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        const validStatuses: FindingStatus[] = ['Pass', 'Monitor', 'Fixed On Site', 'Needs Repair', 'Urgent'];
        suggestions = parsed
          .filter((s: unknown) => typeof s === 'object' && s !== null)
          .map((s: Record<string, unknown>) => ({
            room: String(s.room ?? ''),
            item: String(s.item ?? ''),
            status: validStatuses.includes(s.status as FindingStatus) ? (s.status as FindingStatus) : 'Monitor',
            notes: String(s.notes ?? ''),
            action: String(s.action ?? ''),
          }))
          .filter((s) => s.room && s.item)
          .slice(0, 15);
      }
    } catch {
      console.error('Failed to parse Claude response:', rawText);
      return jsonResponse({ error: 'Failed to parse AI response. Try again.' }, 502, corsHeaders);
    }

    return jsonResponse(suggestions, 200, corsHeaders);
  } catch (err) {
    console.error('inspection-ai error:', err);
    return jsonResponse({ error: 'Unexpected error.' }, 500, corsHeaders);
  }
});
