export type TestRole = 'contractor' | 'homeowner';

export type TestCredentials = {
  email: string;
  password: string;
};

export const testAppUrl = requiredEnv('TEST_APP_URL');

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set TEST_APP_URL, TEST_CONTRACTOR_EMAIL, TEST_CONTRACTOR_PASSWORD, TEST_HOMEOWNER_EMAIL, and TEST_HOMEOWNER_PASSWORD before running Playwright.`,
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
