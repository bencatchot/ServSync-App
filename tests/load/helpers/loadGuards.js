import encoding from 'k6/encoding';

const PRODUCTION_HOSTS = new Set(['servsync.app', 'www.servsync.app']);
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const LOCAL_CREDENTIALS_PREFIX = 'tests/load/.local/';

const READ_ONLY_TABLES = new Set([
  'contractor_profiles',
  'contractor_saved_estimate_charges',
  'estimate_templates',
  'estimates',
  'home_reminders',
  'homeowner_profiles',
  'homes',
  'inspections',
  'invoices',
]);

const READ_ONLY_RPCS = new Set([
  'servsync_contractor_connected_homeowners',
  'servsync_contractor_service_requests',
  'servsync_current_contractor_profile',
  'servsync_get_homeowner_connections',
  'servsync_homeowner_service_requests',
]);

const PUBLIC_ROUTE_ALLOWLIST = new Set([
  '/',
  '/#/home',
  '/#/terms',
  '/#/privacy',
  '/#/acceptable-use',
  '/#/trust-safety',
]);

const STAGE_PROFILES = {
  tiny: [{ duration: '10s', target: 1 }],
  '5': [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 5 },
    { duration: '20s', target: 0 },
  ],
  '10': [
    { duration: '45s', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  '25': [
    { duration: '1m', target: 25 },
    { duration: '3m', target: 25 },
    { duration: '30s', target: 0 },
  ],
  '100': [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  '250': [
    { duration: '3m', target: 250 },
    { duration: '8m', target: 250 },
    { duration: '2m', target: 0 },
  ],
  '500': [
    { duration: '5m', target: 500 },
    { duration: '10m', target: 500 },
    { duration: '3m', target: 0 },
  ],
  '1000': [
    { duration: '8m', target: 1000 },
    { duration: '15m', target: 1000 },
    { duration: '5m', target: 0 },
  ],
};

function requiredEnv(name) {
  const value = (__ENV[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function decodeJwtPayload(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length < 2) return null;

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(encoding.b64decode(paddedPayload, 's'));
  } catch (_error) {
    return null;
  }
}

function looksLikeServiceRoleKey(value) {
  const key = String(value || '').trim();
  if (!key) return false;
  if (/service[_-]?role/i.test(key)) return true;
  if (/^sb_secret_/i.test(key)) return true;
  const payload = decodeJwtPayload(key);
  return payload?.role === 'service_role';
}

function readCredentialsFile(path) {
  const localName = path.slice(LOCAL_CREDENTIALS_PREFIX.length);
  try {
    return open(import.meta.resolve(`../.local/${localName}`));
  } catch (_error) {
    throw new Error(`Could not read LOAD_TEST_CREDENTIALS_FILE at "${path}". Keep the real file local and ignored under ${LOCAL_CREDENTIALS_PREFIX}.`);
  }
}

function assertCredentialEntry(entry, role, index) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid ${role} credential entry #${index + 1}.`);
  }
  if (typeof entry.email !== 'string' || !entry.email.trim()) {
    throw new Error(`Missing email for ${role} credential entry #${index + 1}.`);
  }
  if (typeof entry.password !== 'string' || !entry.password) {
    throw new Error(`Missing password for ${role} credential entry #${index + 1}.`);
  }
}

function parseBaseUrl() {
  const rawValue = (__ENV.LOAD_TEST_BASE_URL || 'https://servsync.app').trim();
  const markdownLink = rawValue.match(/^\[[^\]]+\]\((https?:\/\/[^)\s]+)\)$/i);
  const value = (markdownLink ? markdownLink[1] : rawValue).replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(value)) {
    throw new Error(`Invalid LOAD_TEST_BASE_URL "${rawValue}". Use a raw http:// or https:// URL.`);
  }

  const withoutProtocol = value.replace(/^https?:\/\//i, '');
  const hostWithOptionalPort = withoutProtocol.split(/[/?#]/)[0];
  if (!hostWithOptionalPort || /\s/.test(hostWithOptionalPort) || hostWithOptionalPort.includes('@')) {
    throw new Error(`Invalid LOAD_TEST_BASE_URL "${rawValue}". Could not extract a safe hostname.`);
  }

  const hostname = hostWithOptionalPort.split(':')[0].toLowerCase();
  if (!hostname) {
    throw new Error(`Invalid LOAD_TEST_BASE_URL "${rawValue}". Could not extract a safe hostname.`);
  }

  return { url: value, hostname };
}

export function requireLoadTestAllowed(expectedTargetEnv) {
  if ((__ENV.LOAD_TEST_ALLOW || '').trim() !== 'true') {
    throw new Error('Refusing to run load test without LOAD_TEST_ALLOW=true.');
  }

  const targetEnv = requiredEnv('LOAD_TEST_TARGET_ENV');
  if (targetEnv !== expectedTargetEnv) {
    throw new Error(`Refusing to run ${expectedTargetEnv} script with LOAD_TEST_TARGET_ENV=${targetEnv}.`);
  }
}

export function publicBaseUrl() {
  requireLoadTestAllowed('production-public');
  return parseBaseUrl().url;
}

export function sandboxBaseUrl() {
  requireLoadTestAllowed('sandbox-auth');
  const parsed = parseBaseUrl();
  if (PRODUCTION_HOSTS.has(parsed.hostname)) {
    throw new Error('Refusing to run authenticated load-test structure against servsync.app production.');
  }
  return parsed.url;
}

export function requireSandboxSupabaseRef() {
  const supabaseUrl = requiredEnv('LOAD_TEST_SUPABASE_URL');
  if (supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run authenticated load-test structure against the production Supabase project.');
  }
  if (!supabaseUrl.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Authenticated load-test structure currently allows only sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }
  return supabaseUrl.replace(/\/+$/, '');
}

export function requireSandboxAnonKey() {
  const anonKey = requiredEnv('LOAD_TEST_SUPABASE_ANON_KEY');
  if (looksLikeServiceRoleKey(anonKey)) {
    throw new Error('Refusing to run with a Supabase service-role key. Use the sandbox anon key only.');
  }
  return anonKey;
}

export function requireSandboxAuthReadOnly() {
  if ((__ENV.LOAD_TEST_AUTH_READ_ONLY || '').trim() !== 'true') {
    throw new Error('Refusing to run sandbox authenticated load without LOAD_TEST_AUTH_READ_ONLY=true.');
  }
}

export function authProfileMode() {
  const profile = (__ENV.LOAD_TEST_AUTH_PROFILE || 'mixed').trim();
  if (!['homeowner', 'contractor', 'mixed'].includes(profile)) {
    throw new Error('LOAD_TEST_AUTH_PROFILE must be one of: homeowner, contractor, mixed.');
  }
  return profile;
}

export function loadSandboxCredentials() {
  const credentialsPath = requiredEnv('LOAD_TEST_CREDENTIALS_FILE');
  if (credentialsPath.startsWith('/') || credentialsPath.startsWith('~') || /^[a-z]+:\/\//i.test(credentialsPath)) {
    throw new Error(`LOAD_TEST_CREDENTIALS_FILE must be a relative path under ${LOCAL_CREDENTIALS_PREFIX}.`);
  }
  if (credentialsPath.includes('..') || credentialsPath.includes('\\') || !credentialsPath.startsWith(LOCAL_CREDENTIALS_PREFIX)) {
    throw new Error(`LOAD_TEST_CREDENTIALS_FILE must stay under ${LOCAL_CREDENTIALS_PREFIX}.`);
  }
  if (!credentialsPath.endsWith('.json')) {
    throw new Error('LOAD_TEST_CREDENTIALS_FILE must point to a JSON file.');
  }

  let parsed;
  try {
    parsed = JSON.parse(readCredentialsFile(credentialsPath));
  } catch (error) {
    throw new Error(`Invalid sandbox load credential file: ${error.message}`);
  }

  const homeowners = Array.isArray(parsed?.homeowners) ? parsed.homeowners : [];
  const contractors = Array.isArray(parsed?.contractors) ? parsed.contractors : [];
  if (!homeowners.length || !contractors.length) {
    throw new Error('Sandbox authenticated load requires at least one homeowner and one contractor credential.');
  }

  homeowners.forEach((entry, index) => assertCredentialEntry(entry, 'homeowner', index));
  contractors.forEach((entry, index) => assertCredentialEntry(entry, 'contractor', index));

  return { homeowners, contractors };
}

export function assertReadOnlyRestTable(table) {
  if (!READ_ONLY_TABLES.has(table)) {
    throw new Error(`Supabase REST table "${table}" is not in the authenticated read-only load allowlist.`);
  }
}

export function assertReadOnlyRpc(rpcName) {
  if (!READ_ONLY_RPCS.has(rpcName)) {
    throw new Error(`Supabase RPC "${rpcName}" is not in the authenticated read-only load allowlist.`);
  }
}

export function publicRoutes() {
  const raw = (__ENV.LOAD_TEST_PUBLIC_ROUTES || '/,/#/home,/#/terms,/#/privacy,/#/acceptable-use,/#/trust-safety')
    .split(',')
    .map(route => route.trim())
    .filter(Boolean);

  for (const route of raw) {
    if (!PUBLIC_ROUTE_ALLOWLIST.has(route)) {
      throw new Error(`Public load-test route "${route}" is not approved. Allowed routes: ${Array.from(PUBLIC_ROUTE_ALLOWLIST).join(', ')}`);
    }
  }

  return raw;
}

export function stageProfile() {
  const profile = (__ENV.LOAD_TEST_STAGE_PROFILE || 'tiny').trim();
  const stages = STAGE_PROFILES[profile];
  if (!stages) {
    throw new Error(`Unknown LOAD_TEST_STAGE_PROFILE "${profile}". Use one of: ${Object.keys(STAGE_PROFILES).join(', ')}.`);
  }
  if ((profile === '500' || profile === '1000') && (__ENV.LOAD_TEST_HIGH_VU_APPROVED || '').trim() !== 'true') {
    throw new Error(`${profile} VU runs require manual approval and LOAD_TEST_HIGH_VU_APPROVED=true.`);
  }
  return stages;
}

export const publicThresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<1000'],
};

export const sandboxAuthReadThresholds = {
  checks: ['rate==1'],
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<1500'],
};
