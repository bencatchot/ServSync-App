export type TestRole = 'contractor' | 'homeowner';

export type TestCredentials = {
  email: string;
  password: string;
};

const PRODUCTION_HOSTS = new Set(['servsync.app', 'www.servsync.app']);

export const testAppUrl = requireSandboxTestAppUrl();

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set TEST_APP_URL, TEST_CONTRACTOR_EMAIL, TEST_CONTRACTOR_PASSWORD, TEST_HOMEOWNER_EMAIL, and TEST_HOMEOWNER_PASSWORD before running Playwright.`,
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

export function credentialsFor(role: TestRole): TestCredentials {
  if (role === 'contractor') {
    return {
      email: requiredEnv('TEST_CONTRACTOR_EMAIL'),
      password: requiredEnv('TEST_CONTRACTOR_PASSWORD'),
    };
  }

  return {
    email: requiredEnv('TEST_HOMEOWNER_EMAIL'),
    password: requiredEnv('TEST_HOMEOWNER_PASSWORD'),
  };
}
