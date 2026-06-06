// ServSync inspection-ai edge function
// Analyzes contractor walkthrough notes and returns structured finding suggestions.
// Deploy: supabase functions deploy inspection-ai
// Env var required: ANTHROPIC_API_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Not authenticated.' }, 401);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY is not configured.' }, 500);

  // Verify caller is a contractor
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (supabaseUrl && supabaseAnonKey) {
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=role&limit=1`, {
      headers: { apikey: supabaseAnonKey, Authorization: authHeader },
    });
    const profiles = await profileRes.json();
    const role = Array.isArray(profiles) ? profiles[0]?.role : undefined;
    if (role !== 'contractor') {
      return jsonResponse({ error: 'Only contractor accounts can use the AI inspection assistant.' }, 403);
    }
  }

  let body: { notes: string; rooms: RoomInput[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const { notes, rooms } = body;
  if (!notes?.trim()) return jsonResponse({ error: 'Missing notes.' }, 400);
  if (!Array.isArray(rooms) || rooms.length === 0) return jsonResponse({ error: 'Missing rooms.' }, 400);

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
      return jsonResponse({ error: 'AI service error. Try again.' }, 502);
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
      return jsonResponse({ error: 'Failed to parse AI response. Try again.' }, 502);
    }

    return jsonResponse(suggestions);
  } catch (err) {
    console.error('inspection-ai error:', err);
    return jsonResponse({ error: 'Unexpected error.' }, 500);
  }
});
