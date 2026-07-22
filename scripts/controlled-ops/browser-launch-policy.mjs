import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  EvidenceError,
  assertCanonicalParents,
  canonicalStringify,
  fsyncDirectory,
  sha256,
  utcNow,
  validateControlledSlug,
  validateRawOperationRootInput,
  validateTimestamp,
} from './internal.mjs';
import { parseStrictJson } from './sanitize.mjs';
import { validateBrowserLoopbackUrl, validateBrowserUrl } from './browser-schema.mjs';
import { registerBrowserLaunchProvenance } from './browser-importer.mjs';

export const BROWSER_LAUNCH_SCHEMA = 'servsync-controlled-ops/browser-launch-v1';
export const BROWSER_REPORTER_READY_SCHEMA = 'servsync-controlled-ops/browser-reporter-ready-v1';
export const BROWSER_LAUNCH_TOOL_VERSION = '2a.2.0';
export const REPORTER_READY_FILENAME = 'browser-reporter-ready.json';
export const LAUNCH_DESCRIPTOR_FILENAME = 'browser-launch.json';

export const PROHIBITED_BROWSER_ENV_NAMES = Object.freeze([
  'BROWSER_BASE_URL',
  'BROWSER_COOKIE',
  'BROWSER_CREDENTIAL',
  'BROWSER_PASSWORD',
  'BROWSER_SECRET',
  'BROWSER_STORAGE_STATE',
  'BROWSER_TOKEN',
  'DATABASE_URL',
  'PLAYWRIGHT_COOKIE',
  'PLAYWRIGHT_CREDENTIAL',
  'PLAYWRIGHT_PASSWORD',
  'PLAYWRIGHT_SECRET',
  'PLAYWRIGHT_STORAGE_STATE',
  'PLAYWRIGHT_TOKEN',
  'STORAGE_STATE',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'TEST_APP_URL',
  'TEST_COOKIE',
  'TEST_CREDENTIAL',
  'TEST_PASSWORD',
  'TEST_SECRET',
  'TEST_STORAGE_STATE',
  'TEST_TOKEN',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
  'VERCEL_BYPASS_SECRET',
  'VERCEL_TOKEN',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
]);

function modeOf(info) {
  return info.mode & 0o777;
}

function readCanonicalJson(path) {
  const content = readFileSync(path, 'utf8');
  if (!content.endsWith('\n')) throw new EvidenceError('BROWSER_LAUNCH_NONCANONICAL', 'Browser launch JSON must end with a newline.');
  const parsed = parseStrictJson(content.slice(0, -1));
  if (content !== `${canonicalStringify(parsed)}\n`) throw new EvidenceError('BROWSER_LAUNCH_NONCANONICAL', 'Browser launch JSON is not canonical.');
  return parsed;
}

function assertMode700Directory(path, fieldName) {
  validateRawOperationRootInput(path, fieldName);
  const root = resolve(path);
  assertCanonicalParents(root);
  if (!existsSync(root)) mkdirSync(root, { mode: 0o700 });
  if (realpathSync(root) !== root) throw new EvidenceError('SYMLINK_REJECTED', `${fieldName} must not use symlinked path components.`);
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || modeOf(info) !== 0o700) {
    throw new EvidenceError('UNSAFE_BROWSER_LAUNCH_ROOT', `${fieldName} ownership, type, or mode is unsafe.`);
  }
  return root;
}

function writeExclusiveJson(root, path, value) {
  if (dirname(path) !== root) throw new EvidenceError('UNSAFE_BROWSER_LAUNCH_PATH', 'Browser launch file must be inside the launch root.');
  if (existsSync(path)) throw new EvidenceError('PREEXISTING_BROWSER_LAUNCH_FILE', 'Browser launch file already exists.');
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || modeOf(info) !== 0o600) {
      throw new EvidenceError('UNSAFE_BROWSER_LAUNCH_FILE', 'Created browser launch file failed ownership checks.');
    }
    writeFileSync(descriptor, `${canonicalStringify(value)}\n`, 'utf8');
    fsyncSync(descriptor);
  } catch (error) {
    try { closeSync(descriptor); } catch {}
    try { unlinkSync(path); } catch {}
    throw error;
  }
  closeSync(descriptor);
  fsyncDirectory(root);
  return path;
}

function assertLaunchFile(path, expectedBasename) {
  const resolved = resolve(path);
  if (basename(resolved) !== expectedBasename) throw new EvidenceError('UNSAFE_BROWSER_LAUNCH_PATH', 'Browser launch path has an unexpected file name.');
  const info = lstatSync(resolved);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.nlink !== 1 || modeOf(info) !== 0o600) {
    throw new EvidenceError('UNSAFE_BROWSER_LAUNCH_FILE', 'Browser launch file ownership, type, link count, or mode is unsafe.');
  }
  return resolved;
}

export function assertNoProhibitedBrowserEnvironment(env = process.env) {
  const names = Object.keys(env)
    .filter((name) => PROHIBITED_BROWSER_ENV_NAMES.includes(name))
    .sort();
  if (names.length > 0) {
    throw new EvidenceError('PROHIBITED_BROWSER_ENVIRONMENT', `Controlled-ops browser launch rejects prohibited environment variable: ${names[0]}.`);
  }
}

export function assertSupportedLauncherArguments(argv = []) {
  if (argv.length > 0) throw new EvidenceError('UNSUPPORTED_BROWSER_LAUNCH_ARGUMENT', 'Controlled-ops browser launcher does not accept positional arguments or Playwright flags.');
}

export function createBrowserLaunchContract({ root, baseURL, runLabel }) {
  const launchRoot = assertMode700Directory(root, 'browser launch root');
  const safeBaseURL = validateBrowserUrl(baseURL);
  const safeRunLabel = validateControlledSlug(runLabel, 'browser run label', { maxLength: 64 });
  const nonce = randomBytes(32).toString('hex');
  const runId = `browser-run-${randomBytes(12).toString('hex')}`;
  const descriptorPath = join(launchRoot, LAUNCH_DESCRIPTOR_FILENAME);
  const reporterReadyPath = join(launchRoot, REPORTER_READY_FILENAME);
  const descriptor = {
    schema_version: BROWSER_LAUNCH_SCHEMA,
    tool_version: BROWSER_LAUNCH_TOOL_VERSION,
    created_utc: utcNow(),
    run_id: runId,
    nonce_digest: sha256(nonce),
    base_url: safeBaseURL,
    run_label: safeRunLabel,
    reporter_ready_path: reporterReadyPath,
  };
  writeExclusiveJson(launchRoot, descriptorPath, descriptor);
  registerBrowserLaunchProvenance({
    launchRoot,
    descriptorPath,
    runId,
    nonceDigest: descriptor.nonce_digest,
  });
  return { descriptor, descriptorPath, nonce, reporterReadyPath };
}

export function readBrowserLaunchDescriptor(descriptorPath) {
  const path = assertLaunchFile(descriptorPath, LAUNCH_DESCRIPTOR_FILENAME);
  const descriptor = readCanonicalJson(path);
  const required = ['schema_version', 'tool_version', 'created_utc', 'run_id', 'nonce_digest', 'base_url', 'run_label', 'reporter_ready_path'];
  const keys = Object.keys(descriptor).sort();
  if (canonicalStringify(keys) !== canonicalStringify(required.sort())) throw new EvidenceError('INVALID_BROWSER_LAUNCH_DESCRIPTOR', 'Browser launch descriptor schema is invalid.');
  if (descriptor.schema_version !== BROWSER_LAUNCH_SCHEMA || descriptor.tool_version !== BROWSER_LAUNCH_TOOL_VERSION) throw new EvidenceError('INVALID_BROWSER_LAUNCH_DESCRIPTOR', 'Browser launch descriptor version is invalid.');
  validateTimestamp(descriptor.created_utc, 'browser launch created timestamp');
  if (!/^browser-run-[a-f0-9]{24}$/.test(descriptor.run_id)) throw new EvidenceError('INVALID_BROWSER_LAUNCH_DESCRIPTOR', 'Browser launch run ID is invalid.');
  if (!/^[a-f0-9]{64}$/.test(descriptor.nonce_digest)) throw new EvidenceError('INVALID_BROWSER_LAUNCH_DESCRIPTOR', 'Browser launch nonce digest is invalid.');
  validateBrowserUrl(descriptor.base_url);
  validateControlledSlug(descriptor.run_label, 'browser run label', { maxLength: 64 });
  const readyPath = resolve(descriptor.reporter_ready_path);
  const root = dirname(path);
  if (dirname(readyPath) !== root || basename(readyPath) !== REPORTER_READY_FILENAME) throw new EvidenceError('INVALID_BROWSER_LAUNCH_DESCRIPTOR', 'Browser reporter-ready path is invalid.');
  return { descriptor, descriptorPath: path, launchRoot: root, reporterReadyPath: readyPath };
}

export function assertBrowserLaunchContract({ descriptorPath, nonce }) {
  if (!descriptorPath || !nonce) throw new EvidenceError('BROWSER_LAUNCH_CONTRACT_MISSING', 'Controlled-ops browser launch contract is required.');
  const result = readBrowserLaunchDescriptor(descriptorPath);
  if (sha256(nonce) !== result.descriptor.nonce_digest) throw new EvidenceError('BROWSER_LAUNCH_CONTRACT_MISMATCH', 'Controlled-ops browser launch nonce does not match.');
  return result;
}

export function assertBrowserLaunchContractFromEnv(env = process.env) {
  return assertBrowserLaunchContract({
    descriptorPath: env.CONTROLLED_OPS_BROWSER_LAUNCH_DESCRIPTOR,
    nonce: env.CONTROLLED_OPS_BROWSER_LAUNCH_NONCE,
  });
}

export function writeReporterReady({ descriptorPath, nonce }) {
  const { descriptor, launchRoot, reporterReadyPath } = assertBrowserLaunchContract({ descriptorPath, nonce });
  const ready = {
    schema_version: BROWSER_REPORTER_READY_SCHEMA,
    tool_version: BROWSER_LAUNCH_TOOL_VERSION,
    created_utc: utcNow(),
    run_id: descriptor.run_id,
    nonce_digest: descriptor.nonce_digest,
    pid: process.pid,
  };
  writeExclusiveJson(launchRoot, reporterReadyPath, ready);
  return ready;
}

export function assertReporterReady({ descriptorPath, nonce, expectedReporterPid = null }) {
  const { descriptor, reporterReadyPath } = assertBrowserLaunchContract({ descriptorPath, nonce });
  const path = assertLaunchFile(reporterReadyPath, REPORTER_READY_FILENAME);
  const ready = readCanonicalJson(path);
  const required = ['schema_version', 'tool_version', 'created_utc', 'run_id', 'nonce_digest', 'pid'];
  const keys = Object.keys(ready).sort();
  if (canonicalStringify(keys) !== canonicalStringify(required.sort())) throw new EvidenceError('INVALID_BROWSER_REPORTER_READY', 'Browser reporter-ready schema is invalid.');
  if (ready.schema_version !== BROWSER_REPORTER_READY_SCHEMA || ready.tool_version !== BROWSER_LAUNCH_TOOL_VERSION) throw new EvidenceError('INVALID_BROWSER_REPORTER_READY', 'Browser reporter-ready version is invalid.');
  validateTimestamp(ready.created_utc, 'browser reporter-ready timestamp');
  if (ready.run_id !== descriptor.run_id || ready.nonce_digest !== descriptor.nonce_digest || !Number.isInteger(ready.pid) || ready.pid < 1) {
    throw new EvidenceError('INVALID_BROWSER_REPORTER_READY', 'Browser reporter-ready binding is invalid.');
  }
  if (expectedReporterPid !== null && ready.pid !== expectedReporterPid) {
    throw new EvidenceError('INVALID_BROWSER_REPORTER_READY', 'Browser reporter-ready process binding is invalid.');
  }
  return ready;
}

export function createBrowserEgressGuard(baseURL) {
  const allowed = new URL(validateBrowserUrl(baseURL));
  let violations = 0;
  const check = (value) => {
    let target;
    try {
      validateBrowserLoopbackUrl(value, { fieldName: 'browser request URL', allowPath: true });
      target = new URL(value);
    } catch {
      violations += 1;
      return false;
    }
    const allowedTarget = target.protocol === 'http:'
      && target.hostname === allowed.hostname
      && target.port === allowed.port
      && !target.username
      && !target.password
      && !target.hash;
    if (!allowedTarget) violations += 1;
    return allowedTarget;
  };
  return {
    shouldAllow: check,
    get violationCount() { return violations; },
  };
}
