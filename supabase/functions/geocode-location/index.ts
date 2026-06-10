// ServSync geocode-location edge function.
// Deploy: supabase functions deploy geocode-location
// Required secrets:
//   GEOCODING_PROVIDER=mapbox|google
//   GEOCODING_API_KEY=<provider key>
//   SUPABASE_URL=<project url>
//   SUPABASE_ANON_KEY=<anon key>
//   SUPABASE_SERVICE_ROLE_KEY=<service role key>

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

type GeocodeResult = {
  ok: boolean;
  normalized_location: string;
  location_text: string;
  city: string;
  state: string;
  zip_code: string;
  latitude: number | null;
  longitude: number | null;
  provider: string;
  provider_place_id: string;
  precision: string;
  error?: string;
};

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

function jsonResponse(body: unknown, status = 200, headers = baseCorsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function cleanString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildQuery(body: Record<string, unknown>) {
  const locationText = cleanString(body.location_text);
  const zipCode = cleanString(body.zip_code);
  const city = cleanString(body.city);
  const state = cleanString(body.state);
  return locationText || zipCode || [city, state].filter(Boolean).join(', ');
}

function emptyResult(query: string, error: string): GeocodeResult {
  return {
    ok: false,
    normalized_location: '',
    location_text: query,
    city: '',
    state: '',
    zip_code: '',
    latitude: null,
    longitude: null,
    provider: '',
    provider_place_id: '',
    precision: '',
    error,
  };
}

function cachedResult(row: Record<string, unknown>): GeocodeResult {
  return {
    ok: true,
    normalized_location: cleanString(row.normalized_location),
    location_text: cleanString(row.query_text),
    city: cleanString(row.city),
    state: cleanString(row.state),
    zip_code: cleanString(row.zip_code),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    provider: cleanString(row.provider),
    provider_place_id: cleanString(row.provider_place_id),
    precision: cleanString(row.precision),
  };
}

async function getCachedGeocode(
  supabaseUrl: string,
  serviceRoleKey: string,
  normalizedQuery: string,
): Promise<GeocodeResult | null> {
  const query = new URLSearchParams({
    select: '*',
    normalized_query: `eq.${normalizedQuery}`,
    limit: '1',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/geocoded_locations?${query.toString()}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? cachedResult(row) : null;
}

async function cacheGeocode(
  supabaseUrl: string,
  serviceRoleKey: string,
  queryText: string,
  normalizedQuery: string,
  result: GeocodeResult,
) {
  if (!result.ok || result.latitude === null || result.longitude === null) return;
  await fetch(`${supabaseUrl}/rest/v1/geocoded_locations`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      query_text: queryText,
      normalized_query: normalizedQuery,
      normalized_location: result.normalized_location,
      city: result.city,
      state: result.state,
      zip_code: result.zip_code,
      latitude: result.latitude,
      longitude: result.longitude,
      provider: result.provider,
      provider_place_id: result.provider_place_id,
      precision: result.precision,
    }),
  });
}

function mapboxContextValue(feature: any, prefix: string) {
  const context = Array.isArray(feature?.context) ? feature.context : [];
  const match = context.find((item: any) => typeof item?.id === 'string' && item.id.startsWith(prefix));
  return cleanString(match?.text);
}

async function geocodeWithMapbox(query: string, apiKey: string): Promise<GeocodeResult> {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set('access_token', apiKey);
  url.searchParams.set('country', 'us');
  url.searchParams.set('limit', '1');
  url.searchParams.set('types', 'postcode,place,locality,address');

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    return emptyResult(query, 'Geocoding provider request failed.');
  }
  const feature = Array.isArray(data.features) ? data.features[0] : null;
  const coordinates = Array.isArray(feature?.center) ? feature.center : [];
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!feature || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return emptyResult(query, 'Could not confirm this location.');
  }

  const placeType = Array.isArray(feature.place_type) ? cleanString(feature.place_type[0]) : '';
  const city = placeType === 'place' || placeType === 'locality'
    ? cleanString(feature.text)
    : mapboxContextValue(feature, 'place') || mapboxContextValue(feature, 'locality');
  const state = mapboxContextValue(feature, 'region');
  const zipCode = placeType === 'postcode' ? cleanString(feature.text) : mapboxContextValue(feature, 'postcode');

  return {
    ok: true,
    normalized_location: cleanString(feature.place_name, query),
    location_text: query,
    city,
    state,
    zip_code: zipCode,
    latitude,
    longitude,
    provider: 'mapbox',
    provider_place_id: cleanString(feature.id),
    precision: placeType || 'location',
  };
}

function googleComponent(components: any[], type: string, useShortName = false) {
  const component = components.find(item => Array.isArray(item.types) && item.types.includes(type));
  return cleanString(useShortName ? component?.short_name : component?.long_name);
}

async function geocodeWithGoogle(query: string, apiKey: string): Promise<GeocodeResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('components', 'country:US');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.status !== 'OK') {
    return emptyResult(query, 'Could not confirm this location.');
  }
  const result = Array.isArray(data.results) ? data.results[0] : null;
  const latitude = Number(result?.geometry?.location?.lat);
  const longitude = Number(result?.geometry?.location?.lng);
  if (!result || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return emptyResult(query, 'Could not confirm this location.');
  }

  const components = Array.isArray(result.address_components) ? result.address_components : [];
  const city = googleComponent(components, 'locality')
    || googleComponent(components, 'postal_town')
    || googleComponent(components, 'administrative_area_level_3');
  const state = googleComponent(components, 'administrative_area_level_1', true);
  const zipCode = googleComponent(components, 'postal_code');

  return {
    ok: true,
    normalized_location: cleanString(result.formatted_address, query),
    location_text: query,
    city,
    state,
    zip_code: zipCode,
    latitude,
    longitude,
    provider: 'google',
    provider_place_id: cleanString(result.place_id),
    precision: cleanString(result.geometry?.location_type, 'location').toLowerCase(),
  };
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Not authenticated.' }, 401, corsHeaders);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ error: 'Supabase environment is not configured.' }, 500, corsHeaders);
  }

  const provider = cleanString(Deno.env.get('GEOCODING_PROVIDER'), 'mapbox').toLowerCase();
  const apiKey = Deno.env.get('GEOCODING_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'GEOCODING_API_KEY is not configured.' }, 500, corsHeaders);

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: authHeader },
  });
  if (!userRes.ok) return jsonResponse({ error: 'Not authenticated.' }, 401, corsHeaders);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400, corsHeaders);
  }

  const query = buildQuery(body);
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return jsonResponse(emptyResult(query, 'Location is required.'), 400, corsHeaders);

  const cached = await getCachedGeocode(supabaseUrl, supabaseServiceRoleKey, normalizedQuery);
  if (cached) return jsonResponse(cached, 200, corsHeaders);

  try {
    const result = provider === 'google'
      ? await geocodeWithGoogle(query, apiKey)
      : await geocodeWithMapbox(query, apiKey);
    if (result.ok) {
      await cacheGeocode(supabaseUrl, supabaseServiceRoleKey, query, normalizedQuery, result);
    }
    return jsonResponse(result, result.ok ? 200 : 422, corsHeaders);
  } catch (error) {
    console.error('[geocode-location]', error);
    return jsonResponse(emptyResult(query, error instanceof Error ? error.message : 'Unable to geocode location.'), 500, corsHeaders);
  }
});
