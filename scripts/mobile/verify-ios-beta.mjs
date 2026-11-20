import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEMO_SUPABASE_URL, DEMO_WEB_ORIGIN } from './environment.mjs';
import { iosBetaDefines } from './ios-beta-environment.mjs';

export function verifyIosBetaResources(directory) {
  const config = JSON.parse(readFileSync(join(directory, 'capacitor.config.json'), 'utf8'));
  assert.equal(config.appId, 'app.servsync.mobile');
  assert.equal(config.appName, 'ServSync Beta');
  assert.ok(!config.server, 'The beta must launch packaged resources.');
  const publicDir = join(directory, 'public');
  const assets = readdirSync(join(publicDir, 'assets')).filter(name => name.endsWith('.js'));
  const js = assets.map(name => readFileSync(join(publicDir, 'assets', name), 'utf8')).join('\n');
  const hosts = new Set(js.match(/https?:\/\/[\w.-]+\.supabase\.co\b/gi));
  assert.deepEqual([...hosts], [DEMO_SUPABASE_URL], 'Unexpected packaged Supabase endpoint.');
  assert.ok(js.includes(DEMO_WEB_ORIGIN) && js.includes('ServSync Beta · Demo accounts only'));
  assert.ok(!/https?:\/\/(?:www\.)?servsync\.app\b/i.test(js), 'Unexpected Production web origin.');
  assert.ok(!/sb_secret_[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+/.test(js), 'Unexpected embedded API key type.');
  const keys = new Set(js.match(/sb_publishable_[\w-]+/g));
  assert.equal(keys.size, 1, 'Expected exactly one packaged public key.');
  iosBetaDefines({ VITE_SUPABASE_URL: DEMO_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: [...keys][0] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyIosBetaResources(process.argv[2]);
  console.log('Verified packaged ServSync Beta identity, Demo endpoints, public key and banner.');
}
