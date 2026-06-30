import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILES = ['.env', '.env.local', '.env.test.local'];
const REQUIRED_TEST_APP_URL = 'https://servsync.app';

const REQUIRED_CREDENTIALS = [
  'PROD_SMOKE_HOMEOWNER_EMAIL',
  'PROD_SMOKE_HOMEOWNER_PASSWORD',
  'PROD_SMOKE_CONTRACTOR_OWNER_EMAIL',
  'PROD_SMOKE_CONTRACTOR_OWNER_PASSWORD',
];

const OPTIONAL_ROLE_CREDENTIALS = [
  'PROD_SMOKE_CONTRACTOR_FIELD_TECH_EMAIL',
  'PROD_SMOKE_CONTRACTOR_FIELD_TECH_PASSWORD',
  'PROD_SMOKE_CONTRACTOR_VIEWER_EMAIL',
  'PROD_SMOKE_CONTRACTOR_VIEWER_PASSWORD',
];

const OPTIONAL_RECORD_IDS = [
  'PROD_SMOKE_CONNECTION_ID',
  'PROD_SMOKE_HOME_ID',
  'PROD_SMOKE_SHARED_PROPERTY_ID',
  'PROD_SMOKE_LOCAL_CONTACT_ID',
  'PROD_SMOKE_LOCAL_HOME_ID',
  'PROD_SMOKE_PROPERTY_PROPOSAL_ID',
  'PROD_SMOKE_SERVICE_REQUEST_ID',
  'PROD_SMOKE_INSPECTION_ID',
  'PROD_SMOKE_ESTIMATE_ID',
  'PROD_SMOKE_INVOICE_ID',
];

const strictMode = process.argv.includes('--strict');
const authReadonlyMode = process.argv.includes('--auth-readonly');
const localEnv = loadLocalEnvFiles();

function loadLocalEnvFiles() {
  const values = new Map();

  for (const fileName of ENV_FILES) {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const parsed = parseEnvLine(rawLine);
      if (!parsed) continue;
      values.set(parsed.name, parsed.value);
    }
  }

  return values;
}

function parseEnvLine(rawLine) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) return null;

  const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
  const separatorIndex = withoutExport.indexOf('=');
  if (separatorIndex <= 0) return null;

  const name = withoutExport.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;

  const value = stripInlineComment(withoutExport.slice(separatorIndex + 1).trim());
  return { name, value: unquote(value) };
}

function stripInlineComment(value) {
  if (value.startsWith('"') || value.startsWith("'")) return value;
  const commentIndex = value.search(/\s#/);
  return commentIndex === -1 ? value : value.slice(0, commentIndex).trim();
}

function unquote(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function hasValue(name) {
  return Boolean(process.env[name]?.trim() || localEnv.get(name)?.trim());
}

function valueFor(name) {
  return process.env[name]?.trim() || localEnv.get(name)?.trim() || '';
}

function groupStatus(names) {
  const present = names.filter(hasValue);
  return {
    present,
    missing: names.filter(name => !hasValue(name)),
    complete: present.length === names.length,
  };
}

function printGroup(title, names) {
  const status = groupStatus(names);
  console.log(`${title}: ${status.complete ? 'complete' : 'incomplete'}`);
  for (const name of names) {
    console.log(`- ${name}: ${hasValue(name) ? 'present' : 'missing'}`);
  }
  console.log('');
  return status;
}

function printTargetStatus() {
  const target = valueFor('TEST_APP_URL');
  const status = {
    present: Boolean(target),
    valid: target === REQUIRED_TEST_APP_URL,
  };

  console.log('Production auth smoke target:');
  console.log(`- TEST_APP_URL: ${status.present ? status.valid ? 'present-valid' : 'present-invalid' : 'missing'}`);
  console.log(`- required exact value: ${REQUIRED_TEST_APP_URL}`);
  console.log('');
  return status;
}

console.log('Production smoke credential readiness');
console.log('');

const targetStatus = authReadonlyMode ? printTargetStatus() : null;
const requiredStatus = printGroup('Required credentials', REQUIRED_CREDENTIALS);
printGroup('Optional role credentials', OPTIONAL_ROLE_CREDENTIALS);
printGroup('Optional smoke record IDs', OPTIONAL_RECORD_IDS);

if (requiredStatus.complete) {
  console.log('Status: required credentials present but unverified. Authenticated production smoke still requires separate explicit approval.');
} else {
  console.log('Status: incomplete. Authenticated production smoke must not run.');
}

console.log('Note: presence only; credentials are not validated, no sign-in is attempted, and no Supabase auth or database calls are made.');
console.log('Note: do not print or paste ignored local credential files in reports, PRs, screenshots, traces, logs, or chat.');

if (authReadonlyMode) {
  console.log(`Auth read-only smoke preflight: ${targetStatus.valid && requiredStatus.complete ? 'passed' : 'blocked'}.`);
  console.log('Note: this preflight only allows the dedicated read-only production auth smoke scaffold to start; it does not approve mutation smoke.');
}

if ((strictMode || authReadonlyMode) && (!requiredStatus.complete || (targetStatus && !targetStatus.valid))) {
  process.exitCode = 1;
}
