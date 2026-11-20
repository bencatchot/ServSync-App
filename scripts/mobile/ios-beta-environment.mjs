import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { assertMobileDemoEnvironment, DEMO_WEB_ORIGIN, mobileDemoWorkDefines } from './environment.mjs';

// Fingerprint of the public client key in the verified Demo app. Review on rotation.
const demoPublicKeyHash = 'ca791742d67aefbfc2a9298ee54d283539d4f51e3e5cf1e2b46431990586101d';

export function iosBetaDefines(env) {
  const allowed = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_NATIVE_WEB_ORIGIN'];
  if (Object.keys(env).some(name => !allowed.includes(name))) {
    throw new Error('Internal beta accepts only the public Demo URL, key and web origin.');
  }
  assertMobileDemoEnvironment(env);
  if (env.VITE_NATIVE_WEB_ORIGIN !== undefined && env.VITE_NATIVE_WEB_ORIGIN !== DEMO_WEB_ORIGIN) {
    throw new Error('Internal beta requires the Demo web origin.');
  }
  if (createHash('sha256').update(env.VITE_SUPABASE_ANON_KEY).digest('hex') !== demoPublicKeyHash) {
    throw new Error('Internal beta requires the verified Demo public key.');
  }
  return {
    ...mobileDemoWorkDefines({}),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
    'import.meta.env.VITE_NATIVE_WEB_ORIGIN': JSON.stringify(DEMO_WEB_ORIGIN),
    'import.meta.env.VITE_NATIVE_DEMO': '"true"',
    'import.meta.env.VITE_IOS_INTERNAL_BETA': '"true"',
  };
}

export function readIosBetaDefines() {
  const local = parseEnv(readFileSync('.env.mobile.local', 'utf8'));
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('VITE_') && local[name] !== value) {
      throw new Error('Remove conflicting shell VITE_ variables before preparing the internal beta.');
    }
  }
  return iosBetaDefines(local);
}
