const PRODUCTION_APP_HOSTS = new Set(['servsync.app', 'www.servsync.app']);

export type DemoRole = 'contractor' | 'homeowner';

export type DemoCredentials = {
  email: string;
  password: string;
};

export function ensureMarketingAppUrl(): string {
  const value = process.env.TEST_APP_URL?.trim();
  if (!value) {
    throw new Error('Missing TEST_APP_URL. Use a non-production preview, staging, or localhost URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid TEST_APP_URL.');
  }

  if (PRODUCTION_APP_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('Refusing to capture marketing screenshots against production servsync.app.');
  }

  return value;
}

export function demoCredentialsFor(role: DemoRole): DemoCredentials | null {
  const prefix = role === 'contractor' ? 'MARKETING_DEMO_CONTRACTOR' : 'MARKETING_DEMO_HOMEOWNER';
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`]?.trim();

  if (!email || !password) return null;
  if (!email.toLowerCase().endsWith('@example.com')) {
    throw new Error(`${prefix}_EMAIL must be an example.com demo account email.`);
  }

  return { email, password };
}
