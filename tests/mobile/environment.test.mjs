import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertMobileDemoEnvironment, DEMO_SUPABASE_URL } from '../../scripts/mobile/environment.mjs';
const jwt = claims => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const env = key => ({ VITE_SUPABASE_URL: DEMO_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: key });

test('allows the approved Demo public key formats', () => {
  assert.doesNotThrow(() => assertMobileDemoEnvironment(env('sb_publishable_test_only')));
  assert.doesNotThrow(() => assertMobileDemoEnvironment(env(jwt({role:'anon',ref:'bdytwgejqnlblhrnqxkp'}))));
});
test('refuses privileged, empty, malformed and another project JWT', () => {
  for (const key of ['', 'sb_secret_test', 'malformed', jwt({role:'service_role',ref:'bdytwgejqnlblhrnqxkp'}), jwt({role:'anon',ref:'another-project'})]) {
    assert.throws(() => assertMobileDemoEnvironment(env(key)));
  }
});
test('refuses every non-Demo URL including deceptive suffixes and cleartext', () => {
  for (const url of ['', 'https://production.supabase.co', DEMO_SUPABASE_URL+'.evil.test', DEMO_SUPABASE_URL.replace('https:','http:')]) {
    assert.throws(() => assertMobileDemoEnvironment({...env('sb_publishable_test_only'),VITE_SUPABASE_URL:url}));
  }
});
