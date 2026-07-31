import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  credentialEnvNamesForTarget,
  parseSupabaseProjectRefFromUrl,
  requireValidationTarget,
} from './helpers/validationTarget';

const securityCatalogPath = resolve(process.cwd(), 'tests/e2e/security-catalog.spec.ts');

const sandboxEnv = {
  SERVSYNC_VALIDATION_TARGET: 'sandbox',
  TEST_APP_URL: 'https://serv-sync-app-refresh-git-example-bencatchots-projects.vercel.app',
  TEST_SUPABASE_URL: 'https://zpzdkoaubyjtsomccxya.supabase.co',
  TEST_SUPABASE_PROJECT_REF: 'zpzdkoaubyjtsomccxya',
  TEST_CONTRACTOR_EMAIL: 'contractor@example.test',
  TEST_CONTRACTOR_PASSWORD: 'password-placeholder',
  TEST_HOMEOWNER_EMAIL: 'homeowner@example.test',
  TEST_HOMEOWNER_PASSWORD: 'password-placeholder',
};

const demoEnv = {
  SERVSYNC_VALIDATION_TARGET: 'demo',
  TEST_APP_URL: 'https://servsync-demo-4v0cil6iy-bencatchots-projects.vercel.app',
  TEST_SUPABASE_URL: 'https://bdytwgejqnlblhrnqxkp.supabase.co',
  TEST_SUPABASE_PROJECT_REF: 'bdytwgejqnlblhrnqxkp',
  DEMO_CONTRACTOR_EMAIL: 'demo-contractor@example.test',
  DEMO_CONTRACTOR_PASSWORD: 'password-placeholder',
  DEMO_HOMEOWNER_EMAIL: 'demo-homeowner@example.test',
  DEMO_HOMEOWNER_PASSWORD: 'password-placeholder',
};

test.describe('validation target configuration guards', () => {
  test('allows the known Sandbox target when the explicit target and refs agree', () => {
    const result = requireValidationTarget({
      env: sandboxEnv,
      requireAppUrl: true,
      requireSupabaseEnv: true,
      requireLinkedProjectRef: true,
      requireCredentials: ['contractor', 'homeowner'],
      linkedProjectRef: 'zpzdkoaubyjtsomccxya',
    });

    expect(result.targetName).toBe('sandbox');
    expect(result.target.projectRef).toBe('zpzdkoaubyjtsomccxya');
    expect(result.appUrl).toBe(sandboxEnv.TEST_APP_URL);
  });

  test('allows the known Demo target when the explicit target and refs agree', () => {
    const result = requireValidationTarget({
      env: demoEnv,
      requireAppUrl: true,
      requireSupabaseEnv: true,
      requireLinkedProjectRef: true,
      requireCredentials: ['contractor', 'homeowner'],
      linkedProjectRef: 'bdytwgejqnlblhrnqxkp',
    });

    expect(result.targetName).toBe('demo');
    expect(result.target.projectRef).toBe('bdytwgejqnlblhrnqxkp');
    expect(credentialEnvNamesForTarget('demo', 'contractor')).toEqual({
      email: 'DEMO_CONTRACTOR_EMAIL',
      password: 'DEMO_CONTRACTOR_PASSWORD',
    });
  });

  test('rejects the known Production project and production app hosts', () => {
    expect(() =>
      requireValidationTarget({
        env: {
          ...sandboxEnv,
          TEST_APP_URL: 'https://servsync.app',
        },
        requireAppUrl: true,
      }),
    ).toThrow(/production servsync\.app/i);

    expect(() =>
      requireValidationTarget({
        env: {
          ...sandboxEnv,
          TEST_SUPABASE_URL: 'https://uqgtheclhxqlnjpfmheq.supabase.co',
          TEST_SUPABASE_PROJECT_REF: 'uqgtheclhxqlnjpfmheq',
        },
        requireSupabaseEnv: true,
      }),
    ).toThrow(/Production project/i);

    expect(() =>
      requireValidationTarget({
        env: sandboxEnv,
        requireLinkedProjectRef: true,
        linkedProjectRef: 'uqgtheclhxqlnjpfmheq',
      }),
    ).toThrow(/Production project/i);
  });

  test('rejects unknown targets and mismatched target, URL, ref, or linked project', () => {
    expect(() =>
      requireValidationTarget({
        env: {
          ...sandboxEnv,
          SERVSYNC_VALIDATION_TARGET: 'staging',
        },
      }),
    ).toThrow(/expected sandbox or demo/i);

    expect(() =>
      requireValidationTarget({
        env: {
          ...demoEnv,
          TEST_SUPABASE_PROJECT_REF: 'zpzdkoaubyjtsomccxya',
        },
        requireSupabaseEnv: true,
      }),
    ).toThrow(/does not match demo/i);

    expect(() =>
      requireValidationTarget({
        env: {
          ...demoEnv,
          TEST_SUPABASE_URL: 'https://zpzdkoaubyjtsomccxya.supabase.co',
        },
        requireSupabaseEnv: true,
      }),
    ).toThrow(/does not match demo/i);

    expect(() =>
      requireValidationTarget({
        env: demoEnv,
        requireLinkedProjectRef: true,
        linkedProjectRef: 'zpzdkoaubyjtsomccxya',
      }),
    ).toThrow(/not demo bdytwgejqnlblhrnqxkp/i);
  });

  test('fails closed when required target, URL, ref, or credential variables are absent', () => {
    expect(() => requireValidationTarget({ env: {} })).toThrow(/SERVSYNC_VALIDATION_TARGET/i);
    expect(() => requireValidationTarget({ env: { SERVSYNC_VALIDATION_TARGET: 'demo' }, requireAppUrl: true })).toThrow(
      /TEST_APP_URL/i,
    );
    expect(() => requireValidationTarget({ env: { SERVSYNC_VALIDATION_TARGET: 'demo' }, requireSupabaseEnv: true })).toThrow(
      /TEST_SUPABASE_PROJECT_REF/i,
    );
    expect(() =>
      requireValidationTarget({
        env: {
          ...demoEnv,
          DEMO_CONTRACTOR_PASSWORD: '',
        },
        requireCredentials: ['contractor'],
      }),
    ).toThrow(/DEMO_CONTRACTOR_PASSWORD/i);
  });

  test('parses Supabase project refs without accepting malformed URLs', () => {
    expect(parseSupabaseProjectRefFromUrl('https://bdytwgejqnlblhrnqxkp.supabase.co')).toBe('bdytwgejqnlblhrnqxkp');
    expect(parseSupabaseProjectRefFromUrl('https://servsync.app')).toBeNull();
    expect(parseSupabaseProjectRefFromUrl('not a url')).toBeNull();
  });

  test('security catalog uses the shared validation-target guard instead of a Sandbox-only hardcode', () => {
    const source = readFileSync(securityCatalogPath, 'utf8');

    expect(source).toContain("import { requireValidationTarget } from './helpers/validationTarget';");
    expect(source).toContain('requireValidationTarget({ requireLinkedProjectRef: true, requireSupabaseEnv: true })');
    expect(source).not.toContain("const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya'");
    expect(source).not.toContain('Refusing catalog checks because Supabase CLI is linked to "${linkedProjectRef ||');
  });
});
