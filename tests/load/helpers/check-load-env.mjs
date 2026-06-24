const requiredScripts = ['load:public', 'load:sandbox:auth-read'];

const productionHosts = ['servsync.app', 'www.servsync.app'];
const productionSupabaseRef = 'uqgtheclhxqlnjpfmheq';
const sandboxSupabaseRef = 'zpzdkoaubyjtsomccxya';

console.log('ServSync load-test safety check');
console.log('');
console.log('Expected npm scripts:', requiredScripts.join(', '));
console.log('Required run gate: LOAD_TEST_ALLOW=true');
console.log('Public target gate: LOAD_TEST_TARGET_ENV=production-public');
console.log('Future sandbox auth gate: LOAD_TEST_TARGET_ENV=sandbox-auth');
console.log('Sandbox auth read-only gate: LOAD_TEST_AUTH_READ_ONLY=true');
console.log('Sandbox auth credential file: LOAD_TEST_CREDENTIALS_FILE=tests/load/.local/sandbox-auth-credentials.json');
console.log('Sandbox anon key required: LOAD_TEST_SUPABASE_ANON_KEY=<sandbox anon key>');
console.log(`Production hosts blocked for authenticated scenarios: ${productionHosts.join(', ')}`);
console.log(`Production Supabase ref blocked for authenticated scenarios: ${productionSupabaseRef}`);
console.log(`Current approved sandbox Supabase ref for authenticated scenarios: ${sandboxSupabaseRef}`);
console.log('');
console.log('This check does not run load, log in, seed data, mutate records, or contact Supabase.');
