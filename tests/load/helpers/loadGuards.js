const PRODUCTION_HOSTS = new Set(['servsync.app', 'www.servsync.app']);
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';

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
