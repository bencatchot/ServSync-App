import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type ValidationTargetName = 'sandbox' | 'demo';
export type ValidationCredentialKey = 'contractor' | 'homeowner' | 'contractorB' | 'homeownerB';

type ValidationTargetConfig = {
  name: ValidationTargetName;
  label: string;
  projectRef: string;
  credentialEnvNames: Record<ValidationCredentialKey, { email: string; password: string }>;
};

type RequireValidationTargetOptions = {
  env?: NodeJS.ProcessEnv;
  requireAppUrl?: boolean;
  requireSupabaseEnv?: boolean;
  requireLinkedProjectRef?: boolean;
  requireCredentials?: ValidationCredentialKey[];
  linkedProjectRef?: string;
  cwd?: string;
};

export type ValidationTargetResult = {
  target: ValidationTargetConfig;
  targetName: ValidationTargetName;
  appUrl?: string;
  configuredProjectRef?: string;
  configuredUrlRef?: string;
  linkedProjectRef?: string;
};

const VALIDATION_TARGET_ENV_NAME = 'SERVSYNC_VALIDATION_TARGET';
const TEST_APP_URL_ENV_NAME = 'TEST_APP_URL';
const TEST_SUPABASE_URL_ENV_NAME = 'TEST_SUPABASE_URL';
const TEST_SUPABASE_PROJECT_REF_ENV_NAME = 'TEST_SUPABASE_PROJECT_REF';
const PRODUCTION_HOSTS = new Set(['servsync.app', 'www.servsync.app']);
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';

export const VALIDATION_TARGETS: Record<ValidationTargetName, ValidationTargetConfig> = {
  sandbox: {
    name: 'sandbox',
    label: 'ServSync Sandbox',
    projectRef: 'zpzdkoaubyjtsomccxya',
    credentialEnvNames: {
      contractor: { email: 'TEST_CONTRACTOR_EMAIL', password: 'TEST_CONTRACTOR_PASSWORD' },
      homeowner: { email: 'TEST_HOMEOWNER_EMAIL', password: 'TEST_HOMEOWNER_PASSWORD' },
      contractorB: { email: 'TEST_CONTRACTOR_B_EMAIL', password: 'TEST_CONTRACTOR_B_PASSWORD' },
      homeownerB: { email: 'TEST_HOMEOWNER_B_EMAIL', password: 'TEST_HOMEOWNER_B_PASSWORD' },
    },
  },
  demo: {
    name: 'demo',
    label: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    credentialEnvNames: {
      contractor: { email: 'DEMO_CONTRACTOR_EMAIL', password: 'DEMO_CONTRACTOR_PASSWORD' },
      homeowner: { email: 'DEMO_HOMEOWNER_EMAIL', password: 'DEMO_HOMEOWNER_PASSWORD' },
      contractorB: { email: 'DEMO_CONTRACTOR_B_EMAIL', password: 'DEMO_CONTRACTOR_B_PASSWORD' },
      homeownerB: { email: 'DEMO_HOMEOWNER_B_EMAIL', password: 'DEMO_HOMEOWNER_B_PASSWORD' },
    },
  },
};

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function optionalTrimmed(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

export function parseSupabaseProjectRefFromUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) {
    return null;
  }

  try {
    const host = new URL(rawUrl).hostname;
    const match = host.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function readLinkedSupabaseProjectRef(cwd = process.cwd()): string {
  const projectRefPath = resolve(cwd, 'supabase/.temp/project-ref');
  return existsSync(projectRefPath) ? readFileSync(projectRefPath, 'utf8').trim().toLowerCase() : '';
}

export function credentialEnvNamesForTarget(
  targetName: ValidationTargetName,
  key: ValidationCredentialKey,
): { email: string; password: string } {
  return VALIDATION_TARGETS[targetName].credentialEnvNames[key];
}

export function requireValidationTarget(options: RequireValidationTargetOptions = {}): ValidationTargetResult {
  const env = options.env ?? process.env;
  const rawTargetName = requiredEnv(env, VALIDATION_TARGET_ENV_NAME).toLowerCase();

  if (rawTargetName !== 'sandbox' && rawTargetName !== 'demo') {
    throw new Error(
      `Refusing validation target ${VALIDATION_TARGET_ENV_NAME}=${rawTargetName || 'unknown'}; expected sandbox or demo.`,
    );
  }

  const target = VALIDATION_TARGETS[rawTargetName];
  const configuredProjectRef = optionalTrimmed(env, TEST_SUPABASE_PROJECT_REF_ENV_NAME)?.toLowerCase();
  const configuredSupabaseUrl = optionalTrimmed(env, TEST_SUPABASE_URL_ENV_NAME);
  const configuredUrlRef = parseSupabaseProjectRefFromUrl(configuredSupabaseUrl);
  const linkedProjectRef = options.linkedProjectRef ?? readLinkedSupabaseProjectRef(options.cwd);

  if (target.projectRef === PRODUCTION_SUPABASE_REF) {
    throw new Error('Refusing validation because the selected target is the known Production Supabase project.');
  }

  if (configuredProjectRef === PRODUCTION_SUPABASE_REF || configuredUrlRef === PRODUCTION_SUPABASE_REF) {
    throw new Error('Refusing validation because configured Supabase env points at the known Production project.');
  }

  if (options.requireSupabaseEnv && !configuredProjectRef) {
    throw new Error(`Missing required environment variable ${TEST_SUPABASE_PROJECT_REF_ENV_NAME}.`);
  }

  if (options.requireSupabaseEnv && !configuredSupabaseUrl) {
    throw new Error(`Missing required environment variable ${TEST_SUPABASE_URL_ENV_NAME}.`);
  }

  if (configuredProjectRef && configuredProjectRef !== target.projectRef) {
    throw new Error(
      `Refusing validation because ${TEST_SUPABASE_PROJECT_REF_ENV_NAME}=${configuredProjectRef} does not match ${target.name} ${target.projectRef}.`,
    );
  }

  if (configuredSupabaseUrl && !configuredUrlRef) {
    throw new Error(`${TEST_SUPABASE_URL_ENV_NAME} does not contain a parseable Supabase project ref.`);
  }

  if (configuredUrlRef && configuredUrlRef !== target.projectRef) {
    throw new Error(
      `Refusing validation because ${TEST_SUPABASE_URL_ENV_NAME} ref ${configuredUrlRef} does not match ${target.name} ${target.projectRef}.`,
    );
  }

  if (options.requireLinkedProjectRef) {
    if (!linkedProjectRef) {
      throw new Error('Refusing catalog checks because the Supabase CLI linked project ref is unknown.');
    }

    if (linkedProjectRef === PRODUCTION_SUPABASE_REF) {
      throw new Error('Refusing catalog checks because Supabase CLI is linked to the known Production project.');
    }

    if (linkedProjectRef !== target.projectRef) {
      throw new Error(
        `Refusing catalog checks because Supabase CLI is linked to "${linkedProjectRef}", not ${target.name} ${target.projectRef}.`,
      );
    }
  }

  let appUrl: string | undefined;
  if (options.requireAppUrl) {
    appUrl = requiredEnv(env, TEST_APP_URL_ENV_NAME);
    let parsedAppUrl: URL;

    try {
      parsedAppUrl = new URL(appUrl);
    } catch {
      throw new Error(`Invalid ${TEST_APP_URL_ENV_NAME}. Set it to a localhost, Preview, Sandbox, or Demo URL.`);
    }

    if (PRODUCTION_HOSTS.has(parsedAppUrl.hostname.toLowerCase())) {
      throw new Error('Refusing to run authenticated Playwright tests against production servsync.app.');
    }
  }

  for (const key of options.requireCredentials ?? []) {
    const names = target.credentialEnvNames[key];
    requiredEnv(env, names.email);
    requiredEnv(env, names.password);
  }

  return {
    target,
    targetName: target.name,
    appUrl,
    configuredProjectRef,
    configuredUrlRef: configuredUrlRef ?? undefined,
    linkedProjectRef: linkedProjectRef || undefined,
  };
}
