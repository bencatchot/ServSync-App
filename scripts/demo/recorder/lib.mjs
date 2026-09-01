import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEMO_RECORDER_PROJECT_REF = 'bdytwgejqnlblhrnqxkp';
export const DEMO_RECORDER_APP_URL = 'https://servsync-demo.vercel.app';
export const DEMO_RECORDER_SUPABASE_URL = `https://${DEMO_RECORDER_PROJECT_REF}.supabase.co`;
export const DEMO_PRESENTATION_QUERY_KEY = 'servsync-presentation';
export const DEMO_PRESENTATION_QUERY_VALUE = 'recorder-v1';
export const DEMO_RECORDER_SCENARIO_QUERY_KEY = 'servsync-recorder-scenario';
export const DEMO_RECORDING_ENV_KEYS = Object.freeze([
  'DEMO_CONTRACTOR_EMAIL',
  'DEMO_CONTRACTOR_PASSWORD',
  'DEMO_HOMEOWNER_EMAIL',
  'DEMO_HOMEOWNER_PASSWORD',
  'DEMO_MODE_ENABLED',
  'DEMO_RECORDING_APP_URL',
  'DEMO_RECORDING_OUTPUT_DIR',
  'DEMO_SUPABASE_ANON_KEY',
  'DEMO_SUPABASE_PROJECT_REF',
  'DEMO_SUPABASE_SERVICE_ROLE_KEY',
  'DEMO_SUPABASE_URL',
  'DEMO_VERCEL_AUTOMATION_BYPASS_SECRET',
]);

export const HUMAN_PACED_PROFILE_NAME = 'servsync-human-paced-v1';
export const HUMAN_PACED_RECORDING_PRESET = Object.freeze({
  profile: HUMAN_PACED_PROFILE_NAME,
  initialHold: 1300,
  settleBeforeClick: 550,
  postClick: 900,
  typing: 75,
  finalHold: 3200,
  nearbyTravel: 700,
  mediumTravel: 1100,
  largeTravel: 1500,
  easing: 'cubic-ease-in-out',
  minimumCursorSteps: 24,
  cursorStepInterval: 24,
});

const PACING = Object.freeze({
  'human-paced': HUMAN_PACED_RECORDING_PRESET,
  marketing: HUMAN_PACED_RECORDING_PRESET,
  tutorial: Object.freeze({
    initialHold: 1700,
    settleBeforeClick: 650,
    postClick: 1200,
    typing: 90,
    finalHold: 3800,
    nearbyTravel: 850,
    mediumTravel: 1300,
    largeTravel: 1750,
  }),
});

export function addDemoPresentationOptIn(rawUrl, scenarioKey = '') {
  const url = new URL(rawUrl);
  url.searchParams.set(DEMO_PRESENTATION_QUERY_KEY, DEMO_PRESENTATION_QUERY_VALUE);
  if (scenarioKey) url.searchParams.set(DEMO_RECORDER_SCENARIO_QUERY_KEY, scenarioKey);
  return url;
}

const PAYMENT_ACTION_PATTERN = /stripe|payment[-_]?intent|online[-_]?payment|checkout/i;
const INVOICE_ONLINE_PAYMENT_HISTORY_RPC = '/rest/v1/rpc/servsync_list_invoice_online_payments';

export function isPaymentProviderRequest(rawUrl, {
  appUrl = DEMO_RECORDER_APP_URL,
  supabaseUrl = DEMO_RECORDER_SUPABASE_URL,
} = {}) {
  const url = new URL(rawUrl);
  const appOrigin = new URL(appUrl).origin;
  const supabaseOrigin = new URL(supabaseUrl).origin;

  if (url.origin === appOrigin && url.pathname.startsWith('/assets/')) return false;
  if (url.origin === supabaseOrigin && url.pathname === INVOICE_ONLINE_PAYMENT_HISTORY_RPC) return false;

  return PAYMENT_ACTION_PATTERN.test(`${url.hostname}${url.pathname}${url.search}`);
}

function unquote(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1);
  return value;
}

export function loadKnownLocalEnv(env = process.env, cwd = process.cwd()) {
  const allowed = new Set(DEMO_RECORDING_ENV_KEYS);
  for (const fileName of ['.env.test.local', '.env.local']) {
    const filePath = resolve(cwd, fileName);
    if (!existsSync(filePath)) continue;
    for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
      const separator = normalized.indexOf('=');
      if (separator <= 0) continue;
      const name = normalized.slice(0, separator).trim();
      if (!allowed.has(name) || env[name]) continue;
      const rawValue = normalized.slice(separator + 1).trim();
      env[name] = unquote(rawValue);
    }
  }
  return env;
}

export function validateScenarioDefinition(scenario) {
  const issues = [];
  if (!scenario?.key || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scenario.key)) issues.push('Scenario key must be kebab-case.');
  if (scenario?.environment?.projectRef !== DEMO_RECORDER_PROJECT_REF) issues.push('Scenario must target the dedicated ServSync Demo project.');
  if (scenario?.environment?.appUrl !== DEMO_RECORDER_APP_URL) issues.push('Scenario must use the durable ServSync Demo app URL.');
  if (!Number.isInteger(scenario?.viewport?.width) || !Number.isInteger(scenario?.viewport?.height)) issues.push('Scenario viewport must use integer dimensions.');
  if (!Array.isArray(scenario?.scenes) || scenario.scenes.length < 1) issues.push('Scenario must define at least one scene.');
  if (new Set((scenario?.scenes || []).map((scene) => scene.key)).size !== (scenario?.scenes || []).length) issues.push('Scenario scene keys must be unique.');
  for (const scene of scenario?.scenes || []) {
    if (!scene.caption || scene.caption.length > 80) issues.push(`Scene ${scene.key || '(unknown)'} must have a caption of 1-80 characters.`);
  }
  if (!scenario?.request?.title || !scenario?.request?.description || !scenario?.request?.category) issues.push('Scenario request requires title, description, and category.');
  if (scenario?.estimate && (!scenario.estimate.title || !scenario.estimate.scope || !scenario.estimate.line?.line_title)) {
    issues.push('Scenario estimate requires title, scope, and a line title.');
  }
  if (issues.length > 0) throw new Error(`Invalid Demo recording scenario:\n- ${issues.join('\n- ')}`);
  return scenario;
}

export function assertSafeRecorderEnvironment(env, scenario) {
  const projectRef = env.DEMO_SUPABASE_PROJECT_REF || scenario.environment.projectRef;
  const supabaseUrl = env.DEMO_SUPABASE_URL || `https://${projectRef}.supabase.co`;
  const appUrl = env.DEMO_RECORDING_APP_URL || scenario.environment.appUrl;
  const parsedSupabase = new URL(supabaseUrl);
  const parsedApp = new URL(appUrl);

  if (projectRef !== DEMO_RECORDER_PROJECT_REF || parsedSupabase.origin !== DEMO_RECORDER_SUPABASE_URL) {
    throw new Error('Demo recorder refused: Supabase target is not the dedicated ServSync Demo project.');
  }
  if (parsedApp.origin !== DEMO_RECORDER_APP_URL) {
    throw new Error('Demo recorder refused: browser target is not the durable ServSync Demo origin.');
  }
  if (env.DEMO_MODE_ENABLED && env.DEMO_MODE_ENABLED !== 'true') {
    throw new Error('Demo recorder refused: DEMO_MODE_ENABLED must be true when supplied.');
  }
  return { projectRef, supabaseUrl, appUrl: parsedApp.origin };
}

export function parseRecorderArgs(args) {
  const [scenarioKey, ...options] = args;
  const parsed = { scenarioKey, pacing: 'marketing', outputDir: null, headed: false };
  for (const option of options) {
    if (option === '--headed') parsed.headed = true;
    else if (option.startsWith('--pacing=')) parsed.pacing = option.slice('--pacing='.length);
    else if (option.startsWith('--output-dir=')) parsed.outputDir = option.slice('--output-dir='.length);
    else throw new Error(`Unsupported Demo recorder option: ${option}`);
  }
  if (!scenarioKey) throw new Error('Usage: npm run demo:record -- <scenario> [--pacing=human-paced|marketing|tutorial] [--headed]');
  if (!PACING[parsed.pacing]) throw new Error(`Unsupported pacing preset: ${parsed.pacing}`);
  return parsed;
}

export function pacingFor(name) {
  if (!PACING[name]) throw new Error(`Unsupported pacing preset: ${name}`);
  return PACING[name];
}

export function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value ** 3 : 1 - ((-2 * value + 2) ** 3) / 2;
}

export function pointerTravelDuration(distance, pacing = HUMAN_PACED_RECORDING_PRESET) {
  if (!Number.isFinite(distance) || distance < 0) throw new Error('Cursor distance must be a non-negative number.');
  if (distance <= 260) return pacing.nearbyTravel;
  if (distance <= 760) return pacing.mediumTravel;
  return pacing.largeTravel;
}

export function cursorInterpolation(start, end, pacing = HUMAN_PACED_RECORDING_PRESET) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const duration = pointerTravelDuration(distance, pacing);
  const steps = Math.max(pacing.minimumCursorSteps || 24, Math.ceil(duration / (pacing.cursorStepInterval || 24)));
  return {
    duration,
    stepDelay: duration / steps,
    points: Array.from({ length: steps }, (_, index) => {
      const progress = easeInOutCubic((index + 1) / steps);
      return {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      };
    }),
  };
}

export function scanVisibleTextForSensitiveData(text, credentials) {
  const normalized = String(text || '').toLowerCase();
  const issues = [];
  for (const [label, value] of Object.entries(credentials)) {
    if (value && normalized.includes(String(value).toLowerCase())) issues.push(`Visible page text contains ${label}.`);
  }
  if (/\b(?:eyj[a-z0-9_-]{20,}|sk_(?:live|test)_[a-z0-9]{12,}|service_role)\b/i.test(text || '')) {
    issues.push('Visible page text contains a token-like or privileged credential marker.');
  }
  return issues;
}

export function assertRecordingDuration(durationSeconds, expected) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Recorded video has no playable duration.');
  if (durationSeconds < expected.min || durationSeconds > expected.max) {
    throw new Error(`Recorded duration ${durationSeconds.toFixed(2)}s is outside ${expected.min}-${expected.max}s.`);
  }
}

export function buildArtifactMetadata({ scenario, sourceCommit, pacing, durationSeconds, fileName, createdAt }) {
  const preset = pacingFor(pacing);
  return {
    schema_version: 1,
    scenario: scenario.key,
    scenario_version: 1,
    created_at: createdAt,
    environment: scenario.environment.name,
    project_ref: scenario.environment.projectRef,
    app_origin: scenario.environment.appUrl,
    viewport: scenario.viewport,
    duration_seconds: Number(durationSeconds.toFixed(3)),
    pacing,
    pacing_profile: preset.profile || pacing,
    pacing_defaults: {
      nearby_cursor_travel_ms: preset.nearbyTravel,
      medium_cursor_travel_ms: preset.mediumTravel,
      large_cursor_travel_ms: preset.largeTravel,
      settle_before_click_ms: preset.settleBeforeClick,
      post_click_hold_ms: preset.postClick,
      typing_ms_per_character: preset.typing,
      initial_hold_ms: preset.initialHold,
      final_hold_ms: preset.finalHold,
      easing: preset.easing || 'playwright-steps',
    },
    source_commit: sourceCommit,
    artifact: fileName,
    format: 'webm',
    fixture_policy: scenario.fixturePolicy || 'Leave one canonical request_ready Demo fixture; the next run resets only registry-owned scenario records.',
    contains_credentials: false,
    canonical_output_provenance: 'validated_servsync_demo_recorder',
  };
}
