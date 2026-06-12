// ServSync inspection-ai edge function
// Analyzes contractor walkthrough notes and returns structured finding suggestions.
// Deploy: supabase functions deploy inspection-ai
// Env var required: OPENAI_API_KEY
// Optional env var: OPENAI_MODEL

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

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stemToken(value: string) {
  return value
    .replace(/ing$/, '')
    .replace(/age$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '');
}

function hasPhrase(haystack: string, phrase: string) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  if (` ${haystack} `.includes(` ${normalizedPhrase} `)) return true;
  const phraseTokens = normalizedPhrase.split(' ');
  if (phraseTokens.length === 1) {
    const target = stemToken(phraseTokens[0]);
    if (target.length <= 2) return haystack.split(' ').some(token => token === target);
    return haystack.split(' ').some(token => {
      const stemmed = stemToken(token);
      if (target.length <= 4) return stemmed === target;
      return stemmed === target || (stemmed.length > 4 && token.startsWith(target));
    });
  }
  return false;
}

function hasAny(lower: string, phrases: string[]) {
  return phrases.some(phrase => hasPhrase(lower, phrase));
}

function statusFromFindingText(text: string): FindingStatus | null {
  const lower = normalizeText(text);
  const unresolved = hasAny(lower, [
    'recommend',
    'recommended',
    'needs repair',
    'requires repair',
    'not fixed',
    'not repaired',
    'still leaking',
    'estimate',
    'quote',
  ]);
  const completed = hasAny(lower, [
    'fixed',
    'repaired',
    'replaced',
    'corrected',
    'resolved',
    'adjusted',
    'tightened',
    'secured',
    'sealed',
    'cleared',
    'cleaned',
    'reset',
  ]) && !unresolved;
  const clear = hasAny(lower, [
    'no leak',
    'no leaks',
    'no damage',
    'no concern',
    'no concerns',
    'no issue',
    'no issues',
    'good condition',
    'normal operation',
    'working properly',
    'looks good',
    'passed',
  ]) && !unresolved;

  if (completed) return 'Fixed On Site';
  if (clear) return 'Pass';
  if (hasAny(lower, [
    'urgent',
    'immediately',
    'hazardous',
    'dangerous',
    'unsafe',
    'active leak',
    'actively leaking',
    'active water intrusion',
    'water intrusion',
    'electrical hazard',
    'gas odor',
    'sewage backup',
    'structural danger',
    'immediate damage risk',
  ])) return 'Urgent';
  if (hasAny(lower, [
    'recommend replacing',
    'recommend replacement',
    'recommended replacing',
    'recommended replacement',
    'recommend repair',
    'needs repair',
    'requires repair',
    'should be repaired',
    'not working',
    'not functioning',
    'does not work',
    'failed',
    'failure',
    'broken',
    'damaged',
    'damage',
    'defective',
    'faulty',
    'inoperable',
    'malfunction',
    'malfunctioning',
    'leaking',
    'leak',
    'dripping',
    'drip',
    'running',
    'keeps running',
    'loose',
    'clogged',
    'clog',
    'blocked',
    'replace',
    'replacing',
    'replacement',
    'repair',
    'ball valve',
    'fill valve',
    'flapper',
  ])) return 'Needs Repair';
  if (hasAny(lower, [
    'monitor',
    'watch',
    'minor',
    'slight',
    'early',
    'developing',
    'potential',
    'possible',
    'wear',
    'worn',
    'squeak',
    'squeaking',
    'noise',
    'rattle',
    'wobble',
    'sticks',
    'sticking',
    'slow',
    'weak',
    'hairline',
    'small stain',
    'moisture stain',
    'water stain',
    'cosmetic',
    'not normal',
    'abnormal',
  ])) return 'Monitor';
  return null;
}

function severityRank(status: FindingStatus) {
  const ranks: Record<FindingStatus, number> = {
    Pass: 0,
    Monitor: 1,
    'Fixed On Site': 2,
    'Needs Repair': 3,
    Urgent: 4,
  };
  return ranks[status];
}

function saferFindingStatus(modelStatus: FindingStatus, notes: string, action: string): FindingStatus {
  const inferred = statusFromFindingText(`${notes} ${action}`);
  if (!inferred || inferred === 'Pass') return modelStatus;
  if (modelStatus === 'Pass') return inferred;
  return severityRank(inferred) > severityRank(modelStatus) ? inferred : modelStatus;
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

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'OPENAI_API_KEY is not configured.' }, 500, corsHeaders);

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
  - Urgent: immediate safety hazard, structural failure, active water intrusion, active leak, electrical hazard, sewage backup, or immediate damage risk
  - Needs Repair: damage, defect, malfunction, running fixture, leak, broken/failed item, loose component, clogged item, or repair/replacement recommendation
  - Monitor: minor wear, potential issue, or item to watch at next visit
  - Fixed On Site: issue that was corrected during this visit
  - Pass: only when notes clearly say the item is okay, working properly, acceptable, good condition, or no issue was found
- Never classify repair recommendations as Pass. Wording like "recommend replacing", "needs repair", "not working", "running", "leaking", "damaged", "failed", "broken", "loose", or "clogged" must be Needs Repair unless Urgent applies.
- Write a concise observation note (1-2 sentences max)
- Suggest a recommended action where applicable (leave empty string for Pass)
- Only return findings for items with notable observations (not everything is flagged)
- Return at most 15 findings

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "suggestions": [
    {
      "room": "exact room name from checklist",
      "item": "exact item text from checklist",
      "status": "Needs Repair",
      "notes": "Brief observation about what was found",
      "action": "Recommended next step"
    }
  ]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
        input: prompt,
        max_output_tokens: 2048,
        text: {
          format: {
            type: 'json_schema',
            name: 'inspection_finding_suggestions',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['suggestions'],
              properties: {
                suggestions: {
                  type: 'array',
                  maxItems: 15,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['room', 'item', 'status', 'notes', 'action'],
                    properties: {
                      room: { type: 'string' },
                      item: { type: 'string' },
                      status: { type: 'string', enum: ['Pass', 'Monitor', 'Fixed On Site', 'Needs Repair', 'Urgent'] },
                      notes: { type: 'string' },
                      action: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });

    const openAiRes = await response.json();
    if (!response.ok) {
      console.error('OpenAI API error:', openAiRes?.error ?? 'AI service error');
      return jsonResponse({ error: 'AI service error. Try again.' }, 502, corsHeaders);
    }

    const rawText = openAiRes.output_text
      || openAiRes.output?.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content || [])
        ?.find((part: { type?: string }) => part.type === 'output_text')?.text
      || '[]';

    let suggestions: FindingSuggestion[] = [];
    try {
      const parsed = JSON.parse(rawText);
      const parsedSuggestions = Array.isArray(parsed) ? parsed : parsed?.suggestions;
      if (Array.isArray(parsedSuggestions)) {
        const validStatuses: FindingStatus[] = ['Pass', 'Monitor', 'Fixed On Site', 'Needs Repair', 'Urgent'];
        suggestions = parsedSuggestions
          .filter((s: unknown) => typeof s === 'object' && s !== null)
          .map((s: Record<string, unknown>) => {
            const notes = String(s.notes ?? '');
            const action = String(s.action ?? '');
            const modelStatus = validStatuses.includes(s.status as FindingStatus) ? (s.status as FindingStatus) : 'Monitor';
            return {
              room: String(s.room ?? ''),
              item: String(s.item ?? ''),
              status: saferFindingStatus(modelStatus, notes, action),
              notes,
              action,
            };
          })
          .filter((s) => s.room && s.item)
          .slice(0, 15);
      }
    } catch {
      console.error('Failed to parse OpenAI response.');
      return jsonResponse({ error: 'Failed to parse AI response. Try again.' }, 502, corsHeaders);
    }

    return jsonResponse(suggestions, 200, corsHeaders);
  } catch (err) {
    console.error('inspection-ai error:', err);
    return jsonResponse({ error: 'Unexpected error.' }, 500, corsHeaders);
  }
});
