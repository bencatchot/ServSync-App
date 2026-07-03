import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  appHashRoute,
  appRouteUrl,
  contractorProfileUrl,
  contractorTeamInviteUrl,
  homeownerClaimUrl,
  homeownerInviteUrl,
  passwordResetRedirectTo,
} from '../../src/appLinks';

const repoRoot = process.cwd();
const webLocation = { origin: 'https://servsync.app', pathname: '/' };

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test.describe('mobile auth and app-link readiness foundation', () => {
  test('app-link helper preserves current hash-route URL shapes', () => {
    expect(appHashRoute('homeowner')).toBe('#/homeowner');
    expect(appRouteUrl('homeowner', {}, webLocation)).toBe('https://servsync.app/#/homeowner');
    expect(homeownerClaimUrl('claim token/1', webLocation)).toBe('https://servsync.app/#/homeowner?claim=claim+token%2F1');
    expect(homeownerInviteUrl('invite code/1', webLocation)).toBe('https://servsync.app/#/homeowner?invite=invite+code%2F1');
    expect(contractorTeamInviteUrl('team+invite/1', webLocation)).toBe('https://servsync.app/#/contractor?team_invite=team%2Binvite%2F1');
    expect(contractorProfileUrl('catchot & sons', webLocation)).toBe('https://servsync.app/#/profile?slug=catchot+%26+sons');
  });

  test('password reset redirects remain role-specific hash routes', () => {
    expect(passwordResetRedirectTo('homeowner', webLocation)).toBe('https://servsync.app/#/homeowner?mode=reset-password');
    expect(passwordResetRedirectTo('contractor', webLocation)).toBe('https://servsync.app/#/contractor?mode=reset-password');
    expect(passwordResetRedirectTo('platform_admin', webLocation)).toBe('https://servsync.app/#/admin?mode=reset-password');
  });

  test('frontend app links use the shared helper instead of duplicate URL builders', () => {
    const appSource = readRepoFile('src/App.tsx');
    const helperSource = readRepoFile('src/appLinks.ts');

    expect(appSource).toContain("from './appLinks'");
    expect(appSource).toContain('redirectTo: passwordResetRedirectTo(role)');
    expect(appSource).toContain('homeownerClaimUrl(token)');
    expect(appSource).toContain('homeownerInviteUrl(code)');
    expect(appSource).toContain('contractorTeamInviteUrl(invite.invite_code)');
    expect(appSource).toContain('contractorProfileUrl(contractor.slug)');
    expect(appSource).not.toContain('window.location.origin}${window.location.pathname}#/homeowner');
    expect(appSource).not.toContain('window.location.origin}${window.location.pathname}#/contractor');
    expect(appSource).not.toContain('window.location.origin}${window.location.pathname}#/profile');
    expect(appSource).not.toContain('window.location.origin}/#/');
    expect(helperSource).toContain('export function passwordResetRedirectTo');
    expect(helperSource).toContain("return appRouteUrl(passwordResetRouteForRole(role), { mode: 'reset-password' }, location);");
  });

  test('signup confirmation and resend behavior remain unchanged', () => {
    const appSource = readRepoFile('src/App.tsx');
    const signupSpec = readRepoFile('tests/e2e/signup-confirmation-modal.spec.ts');

    expect(appSource).toContain('await supabase.auth.signUp({');
    expect(appSource).toContain('await supabase.auth.resend({');
    expect(appSource).not.toContain('emailRedirectTo');
    expect(signupSpec).toContain("expect(modalSource).not.toContain('emailRedirectTo');");
  });

  test('slice does not add native deep links, universal links, service workers, backend, or package changes', () => {
    const frontendSources = [
      readRepoFile('src/App.tsx'),
      readRepoFile('src/appLinks.ts'),
    ].join('\n').toLowerCase();

    expect(frontendSources).not.toContain('servsync://');
    expect(frontendSources).not.toContain('capacitor');
    expect(frontendSources).not.toContain('serviceworker');
    expect(frontendSources).not.toContain('navigator.serviceworker');
    expect(existsSync(resolve(repoRoot, 'capacitor.config.ts'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'capacitor.config.json'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'ios'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'android'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'public/sw.js'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'public/.well-known/apple-app-site-association'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'public/.well-known/assetlinks.json'))).toBe(false);
  });
});
