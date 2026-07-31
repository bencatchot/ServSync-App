import {
  credentialEnvNamesForTarget,
  requireValidationTarget,
  type ValidationCredentialKey,
} from './validationTarget';

export type TestRole = 'contractor' | 'homeowner';
export type TestCredentialKey = TestRole | 'contractorB' | 'homeownerB';

export type TestCredentials = {
  email: string;
  password: string;
};

const REQUIRED_TEST_ENV_NAMES = [
  'SERVSYNC_VALIDATION_TARGET',
  'TEST_APP_URL',
  'TEST_SUPABASE_URL',
  'TEST_SUPABASE_PROJECT_REF',
  'TEST_HOMEOWNER_EMAIL',
  'TEST_HOMEOWNER_PASSWORD',
  'TEST_CONTRACTOR_EMAIL',
  'TEST_CONTRACTOR_PASSWORD',
  'TEST_HOMEOWNER_B_EMAIL',
  'TEST_HOMEOWNER_B_PASSWORD',
  'TEST_CONTRACTOR_B_EMAIL',
  'TEST_CONTRACTOR_B_PASSWORD',
  'DEMO_HOMEOWNER_EMAIL',
  'DEMO_HOMEOWNER_PASSWORD',
  'DEMO_CONTRACTOR_EMAIL',
  'DEMO_CONTRACTOR_PASSWORD',
  'DEMO_HOMEOWNER_B_EMAIL',
  'DEMO_HOMEOWNER_B_PASSWORD',
  'DEMO_CONTRACTOR_B_EMAIL',
  'DEMO_CONTRACTOR_B_PASSWORD',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
];

export const testAppUrl = requireSafeTestAppUrl();

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

function requireSafeTestAppUrl(): string {
  return requireValidationTarget({ requireAppUrl: true }).appUrl ?? requiredEnv('TEST_APP_URL');
}

export function credentialsFor(key: TestCredentialKey): TestCredentials {
  const { targetName } = requireValidationTarget({
    requireAppUrl: true,
    requireSupabaseEnv: true,
    requireCredentials: [key as ValidationCredentialKey],
  });
  const names = credentialEnvNamesForTarget(targetName, key as ValidationCredentialKey);

  return {
    email: requiredEnv(names.email),
    password: requiredEnv(names.password),
  };
}
