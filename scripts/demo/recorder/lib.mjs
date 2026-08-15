import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEMO_RECORDER_PROJECT_REF = 'bdytwgejqnlblhrnqxkp';
export const DEMO_RECORDER_APP_URL = 'https://servsync-demo.vercel.app';
export const DEMO_RECORDER_SUPABASE_URL = `https://${DEMO_RECORDER_PROJECT_REF}.supabase.co`;
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

const PACING = Object.freeze({
  marketing: Object.freeze({ initialHold: 1100, preClick: 220, postClick: 450, typing: 32, finalHold: 5200 }),
  tutorial: Object.freeze({ initialHold: 1600, preClick: 350, postClick: 700, typing: 48, finalHold: 4200 }),
});

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
  if (!scenarioKey) throw new Error('Usage: npm run demo:record -- <scenario> [--pacing=marketing|tutorial] [--headed]');
  if (!PACING[parsed.pacing]) throw new Error(`Unsupported pacing preset: ${parsed.pacing}`);
  return parsed;
}

export function pacingFor(name) {
  if (!PACING[name]) throw new Error(`Unsupported pacing preset: ${name}`);
  return PACING[name];
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
    source_commit: sourceCommit,
    artifact: fileName,
    format: 'webm',
    fixture_policy: scenario.fixturePolicy || 'Leave one canonical request_ready Demo fixture; the next run resets only registry-owned scenario records.',
    contains_credentials: false,
  };
}
