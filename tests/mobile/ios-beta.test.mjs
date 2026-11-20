import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEMO_SUPABASE_URL } from '../../scripts/mobile/environment.mjs';
import { iosBetaDefines } from '../../scripts/mobile/ios-beta-environment.mjs';

const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const demo = { VITE_SUPABASE_URL: DEMO_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: 'sb_publishable_another_project' };

test('internal beta rejects other public keys and unauthorized frontend settings', () => {
  assert.throws(() => iosBetaDefines(demo), /verified Demo public key/);
  assert.throws(() => iosBetaDefines({ ...demo, VITE_SUPABASE_URL: 'https://other.supabase.co' }), /Demo Supabase URL/);
  assert.throws(() => iosBetaDefines({ ...demo, VITE_NATIVE_WEB_ORIGIN: 'https://servsync.app' }), /Demo web origin/);
  assert.throws(() => iosBetaDefines({ ...demo, VITE_SUPABASE_ANON_KEY: 'sb_secret_test' }), /never a privileged key/);
  assert.throws(() => iosBetaDefines({ ...demo, VITE_UNEXPECTED: 'ignored?' }), /only the public Demo/);
});

test('prototype identities stay separate from the manually signed internal beta', () => {
  assert.match(read('mobile/ios/identity.xcconfig'), /^PRODUCT_BUNDLE_IDENTIFIER = app\.servsync\.demo$/m);
  assert.match(read('mobile/android/app/build.gradle'), /applicationId "app\.servsync\.demo"/);
  const beta = read('mobile/ios-beta/identity.xcconfig');
  assert.match(beta, /^PRODUCT_BUNDLE_IDENTIFIER = app\.servsync\.mobile$/m);
  assert.match(beta, /^DEVELOPMENT_TEAM = GMMS9989NV$/m);
  assert.match(beta, /^CODE_SIGN_STYLE = Manual$/m);
});

test('the beta export template selects internal testing and local export', () => {
  const plist = read('mobile/ios-beta/InternalOnlyExport.plist');
  assert.match(plist, /<key>testFlightInternalTestingOnly<\/key>\s*<true\/>/);
  assert.match(plist, /<key>destination<\/key>\s*<string>export<\/string>/);
});
