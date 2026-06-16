export type TestRole = 'contractor' | 'homeowner';
export type TestCredentialKey = TestRole | 'contractorB' | 'homeownerB';

export type TestCredentials = {
  email: string;
  password: string;
};

const PRODUCTION_HOSTS = new Set(['servsync.app', 'www.servsync.app']);
const REQUIRED_TEST_ENV_NAMES = [
  'TEST_APP_URL',
  'TEST_HOMEOWNER_EMAIL',
  'TEST_HOMEOWNER_PASSWORD',
  'TEST_CONTRACTOR_EMAIL',
  'TEST_CONTRACTOR_PASSWORD',
  'TEST_HOMEOWNER_B_EMAIL',
  'TEST_HOMEOWNER_B_PASSWORD',
  'TEST_CONTRACTOR_B_EMAIL',
  'TEST_CONTRACTOR_B_PASSWORD',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
];

export const testAppUrl = requireSandboxTestAppUrl();

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Load .env.test.local and verify these names are present without printing their values: ${REQUIRED_TEST_ENV_NAMES.join(
        ', ',
      )}.`,
    );
  }
  return value;
}

function requireSandboxTestAppUrl(): string {
  const value = requiredEnv('TEST_APP_URL');
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid TEST_APP_URL "${value}". Set it to a Vercel Preview / sandbox URL before running Playwright.`);
  }

  if (PRODUCTION_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      'Refusing to run authenticated Playwright tests against production servsync.app. Set TEST_APP_URL to the Vercel Preview / sandbox URL.',
    );
  }

  return value;
}

export function credentialsFor(key: TestCredentialKey): TestCredentials {
  switch (key) {
    case 'contractor':
      return {
        email: requiredEnv('TEST_CONTRACTOR_EMAIL'),
        password: requiredEnv('TEST_CONTRACTOR_PASSWORD'),
      };
    case 'contractorB':
      return {
        email: requiredEnv('TEST_CONTRACTOR_B_EMAIL'),
        password: requiredEnv('TEST_CONTRACTOR_B_PASSWORD'),
      };
    case 'homeownerB':
      return {
        email: requiredEnv('TEST_HOMEOWNER_B_EMAIL'),
        password: requiredEnv('TEST_HOMEOWNER_B_PASSWORD'),
      };
    case 'homeowner':
    default:
      return {
        email: requiredEnv('TEST_HOMEOWNER_EMAIL'),
        password: requiredEnv('TEST_HOMEOWNER_PASSWORD'),
      };
  }
}
