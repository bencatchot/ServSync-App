import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Operator-only: requires explicit approval for disposable Sandbox accounts/data.
// Never applies migrations, sends email, prints secrets, or touches Demo/Production.
const REF = 'zpzdkoaubyjtsomccxya';
const HASH = '0aa72fef5517fa8e843d39876637394a75b36662e37496c362b02836baf6dd42';
assert.ok(process.argv.includes('--execute-sandbox'), 'Explicit --execute-sandbox required after owner approval.');
assert.equal(createHash('sha256').update(readFileSync('servsync-admin-contractor-prospects.sql')).digest('hex'), HASH);
const workdir = mkdtempSync(join(tmpdir(), 'servsync-prospect-runtime-'));
mkdirSync(join(workdir, 'supabase/.temp'), { recursive: true });
writeFileSync(join(workdir, 'supabase/.temp/project-ref'), REF, { mode: 0o600 });
const marker = `prospect-acceptance-${randomUUID()}`;
const ids = { users: [], prospects: [] };
const sessions = [];
const results = [];
function registry() { writeFileSync(join(workdir, 'fixture-ids.json'), JSON.stringify({ marker, ...ids }), { mode: 0o600 }); }
function cli(args) { return execFileSync('supabase', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 30 * 1024 * 1024 }); }
function query(sql) { return JSON.parse(cli(['db', 'query', '--linked', '--workdir', workdir, '--output', 'json', sql])).rows; }
const keys = JSON.parse(cli(['projects', 'api-keys', '--project-ref', REF, '--output', 'json']));
const anonKey = keys.find(k => k.name === 'anon')?.api_key;
const serviceKey = keys.find(k => k.name === 'service_role')?.api_key;
assert.ok(anonKey && serviceKey);
const makeClient = key => createClient(`https://${REF}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const service = makeClient(serviceKey), anon = makeClient(anonKey);
function check(value, label) { assert.ok(value, label); results.push(label); }
async function ok(client, name, args = {}) { const r = await client.rpc(name, args); assert.equal(r.error, null, `${name} must succeed: ${r.error?.message}`); return r.data; }
async function denied(client, name, args, label, pattern) { const r = await client.rpc(name, args); check(r.error && (!pattern || pattern.test(r.error.message)), label); }
async function actor(name, role) {
  const email = `${marker}-${name}@example.invalid`, password = `Aa1!${randomUUID()}`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: role === 'platform_admin' ? 'homeowner' : role, full_name: `${marker} ${name}` } });
  assert.equal(created.error, null, 'Fixture account creation');
  const id = created.data.user.id; ids.users.push(id); registry();
  if (role === 'platform_admin') assert.equal((await service.from('profiles').update({ role }).eq('id', id)).error, null);
  const client = makeClient(anonKey);
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null, 'Fixture sign-in'); sessions.push(client);
  return { id, email, password, client, session: signed.data.session };
}
async function save(admin, slug, details, published = true, old = null) {
  const p = await ok(admin.client, 'servsync_admin_save_contractor_prospect', { p_id: old?.id || null, p_revision: old?.revision || null, p_slug: slug, p_details: details, p_published: published });
  if (!old) { ids.prospects.push(p.id); registry(); }
  return p;
}
const issue = (admin, p, email) => ok(admin.client, 'servsync_admin_issue_contractor_claim', { p_id: p.id, p_revision: p.revision, p_email: email });
const review = token => ({ p_token: token });
const accept = (invite, details, revision = invite.profile.revision) => ({ p_token: invite.token, p_revision: revision, p_details: details });
const quoted = values => values.map(v => { assert.match(v, /^[0-9a-f-]{36}$/); return `'${v}'::uuid`; }).join(',');
const baselineSql = `begin;
create temp table prospect_preservation(label text, row_count bigint, fingerprint text) on commit drop;
do $b$ declare r record; begin
for r in select tablename from pg_tables where schemaname='public' and tablename<>'contractor_prospects' loop
execute format('insert into prospect_preservation select %L,count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) from public.%I t', 'public.'||r.tablename,r.tablename);
end loop; end $b$;
insert into prospect_preservation select 'auth.users',count(*),md5(coalesce(string_agg(id::text,'' order by id),'')) from auth.users;
insert into prospect_preservation select 'storage.objects',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from storage.objects t;
insert into prospect_preservation select 'storage.buckets',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from storage.buckets t;
select * from prospect_preservation order by label; rollback;`;
const baseline = query(baselineSql);
const prospectBefore = query('select id, md5(to_jsonb(p)::text) fingerprint from public.contractor_prospects p order by id');
async function run() {
  const admin = await actor('admin', 'platform_admin'), owner = await actor('owner', 'contractor');
  const other = await actor('other', 'contractor'), homeowner = await actor('homeowner', 'homeowner');
  const unverified = await actor('unverified', 'contractor');
  const details = { business_name: marker, contact_name: 'Private fixture contact', email: owner.email, phone: '555-0101', website_url: 'https://example.invalid', city: 'Fairhope', state: 'AL', service_categories: ['Plumbing'], service_zip_codes: ['36532'] };
  let p = await save(admin, marker, details);
  for (const [label, client] of [['anonymous', anon], ['homeowner', homeowner.client], ['contractor', other.client]]) {
    await denied(client, 'servsync_admin_contractor_prospects', {}, `${label} cannot access admin prospects`);
    check(Boolean((await client.from('contractor_prospects').select('id')).error), `${label} direct table denied`);
  }
  check(Boolean((await admin.client.from('contractor_prospects').select('id')).error), 'admin direct table denied');
  check(Boolean((await service.from('contractor_prospects').select('id')).error), 'service role direct table denied');
  check(Boolean((await other.client.from('profiles').update({ role: 'platform_admin' }).eq('id', other.id)).error), 'contractor self-promotion denied');
  const listing = await ok(anon, 'servsync_public_contractor_prospects', { p_slug: p.slug });
  check(listing.length === 1 && listing[0].claim_status === 'unclaimed', 'public unclaimed profile');
  check(!/Private fixture|555-0101|example.invalid|token|invited_email|website_url/.test(JSON.stringify(listing)), 'public contact and invitation redaction');
  check(query(`select count(*) n from public.contractor_profiles where id='${p.id}'`)[0].n === 0, 'no operational contractor before claim');
  check(Boolean((await homeowner.client.from('homeowner_contractor_connections').insert({ homeowner_user_id: homeowner.id, contractor_id: p.id, status: 'pending' })).error), 'unclaimed connection denied');
  await denied(homeowner.client, 'servsync_create_service_request', { p_connection_id: p.id, p_category: 'Plumbing', p_urgency: 'normal', p_title: marker, p_description: 'Unclaimed cannot respond' }, 'unclaimed service request denied', /active contractor connection/i);
  check(Boolean((await other.client.from('contractor_profiles').insert({ owner_user_id: other.id, slug: p.slug, business_name: marker })).error), 'reserved slug spoof denied');
  check(Boolean((await other.client.from('contractor_profiles').insert({ id: p.id, owner_user_id: other.id, slug: `${marker}-spoof`, business_name: marker })).error), 'reserved UUID spoof denied');
  await denied(admin.client, 'servsync_admin_save_contractor_prospect', { p_id: null, p_revision: null, p_slug: `${marker}-bad`, p_details: { business_name: marker, logo_url: 'javascript:alert(1)' }, p_published: true }, 'unsafe logo rejected', /HTTPS/);
  let invite = await issue(admin, p, owner.email);
  check(!JSON.stringify(await ok(admin.client, 'servsync_admin_contractor_prospects')).includes('token'), 'ordinary admin reads token-free');
  check(!JSON.stringify(await ok(anon, 'servsync_review_contractor_claim', review(invite.token))).includes(owner.email), 'anonymous claim review redacted');
  await denied(other.client, 'servsync_review_contractor_claim', review(invite.token), 'wrong recipient review denied', /verified contractor/);
  await denied(other.client, 'servsync_accept_contractor_claim', accept(invite, details), 'wrong recipient claim denied', /verified contractor/);
  await denied(owner.client, 'servsync_accept_contractor_claim', accept(invite, details, 1), 'stale claim denied', /changed/);
  await denied(owner.client, 'servsync_accept_contractor_claim', accept(invite, { ...details, website_url: 'javascript:bad' }), 'failed validation preserves claim', /HTTPS/);
  check((await ok(owner.client, 'servsync_review_contractor_claim', review(invite.token))).details.email === owner.email, 'verified recipient private review');
  const claimedDetails = { ...details, business_name: `${marker} reviewed`, admin_notes: 'injected', account_status: 'paused' };
  const concurrent = await Promise.all([owner.client.rpc('servsync_accept_contractor_claim', accept(invite, claimedDetails)), owner.client.rpc('servsync_accept_contractor_claim', accept(invite, claimedDetails))]);
  check(concurrent.filter(r => !r.error).length === 1, 'concurrent claims have one winner');
  await denied(owner.client, 'servsync_accept_contractor_claim', accept(invite, details), 'replay denied', /unavailable/);
  const canonical = query(`select id,owner_user_id,business_name,account_status,admin_notes from public.contractor_profiles where id='${p.id}'`);
  check(canonical.length === 1 && canonical[0].owner_user_id === owner.id && canonical[0].account_status === 'active' && canonical[0].admin_notes === '', 'same identity and reviewed fields without privilege injection');
  check(query(`select count(*) n from public.contractor_billing_accounts where contractor_id='${p.id}'`)[0].n === 1, 'billing initialized exactly once');
  const updated = await owner.client.from('contractor_profiles').update({ business_name: `${marker} owner edited` }).eq('id', p.id).select('id');
  check(!updated.error && updated.data.length === 1, 'normal owner editing enabled');
  const claimedListing = await ok(anon, 'servsync_public_contractor_prospects', { p_search: marker });
  check(claimedListing.some(r => r.id === p.id && r.claim_status === 'claimed' && r.details.business_name.endsWith('owner edited')), 'Discover reflects current owner fields');
  const connected = await homeowner.client.from('homeowner_contractor_connections').insert({ homeowner_user_id: homeowner.id, contractor_id: p.id, status: 'pending' }).select('id').single();
  check(!connected.error, 'connection allowed after claim');
  // Only the exact disposable connection is activated for service-request validation.
  query(`update public.homeowner_contractor_connections set status='active' where id='${connected.data.id}' and homeowner_user_id='${homeowner.id}' and contractor_id='${p.id}'`);
  await ok(homeowner.client, 'servsync_create_service_request', { p_connection_id: connected.data.id, p_category: 'Plumbing', p_urgency: 'normal', p_title: marker, p_description: 'Claimed fixture can respond' });
  check(query(`select count(*) n from public.service_requests where contractor_id='${p.id}'`)[0].n === 1, 'service request works after claim');
  p = await save(admin, `${marker}-second`, details);
  invite = await issue(admin, p, owner.email);
  await denied(owner.client, 'servsync_accept_contractor_claim', accept(invite, details), 'existing owner cannot overwrite or merge', /already own/);
  const oldToken = invite.token;
  invite = await issue(admin, invite.profile, unverified.email);
  await denied(anon, 'servsync_review_contractor_claim', review(oldToken), 'rotation invalidates previous link', /unavailable/);
  query(`update auth.users set email_confirmed_at=null where id='${unverified.id}' and email='${unverified.email}'`);
  await denied(unverified.client, 'servsync_accept_contractor_claim', accept(invite, details), 'unverified account cannot claim', /verified contractor/);
  p = await save(admin, p.slug, details, false, invite.profile);
  await denied(anon, 'servsync_review_contractor_claim', review(invite.token), 'edits invalidate link', /unavailable/);
  check((await ok(anon, 'servsync_public_contractor_prospects', { p_slug: p.slug })).length === 0, 'hidden profile not public');
  invite = await issue(admin, p, other.email);
  p = await ok(admin.client, 'servsync_admin_revoke_contractor_claim', { p_id: p.id, p_revision: invite.profile.revision });
  await denied(anon, 'servsync_review_contractor_claim', review(invite.token), 'revoked link denied', /unavailable/);
  invite = await issue(admin, p, other.email);
  query(`update public.contractor_prospects set expires_at=now()-interval '1 second' where id='${p.id}' and slug='${p.slug}'`);
  await denied(other.client, 'servsync_accept_contractor_claim', accept(invite, details), 'expired link denied', /unavailable/);
  if (process.argv.includes('--browser')) {
    const { verifyBrowser } = await import('./validate-admin-contractor-prospects-sandbox-browser.mjs');
    await verifyBrowser({ admin, other, homeowner, anonKey, ref: REF, marker, results, registerProspect: id => { ids.prospects.push(id); registry(); } });
  }
}
async function cleanup() {
  // Exact IDs registered immediately after creation; no broad marker deletion.
  if (ids.prospects.length) query(`delete from public.contractor_prospects where id in (${quoted(ids.prospects)}) and created_by in (${quoted(ids.users)})`);
  for (const client of sessions) await client.auth.signOut();
  for (const id of [...ids.users].reverse()) {
    const result = await service.auth.admin.deleteUser(id);
    assert.equal(result.error, null, 'Exact fixture Auth deletion must succeed');
  }
  assert.deepEqual(query(baselineSql), baseline, 'All pre-existing relation fingerprints preserved');
  assert.deepEqual(query('select id, md5(to_jsonb(p)::text) fingerprint from public.contractor_prospects p order by id'), prospectBefore, 'No prospect residue');
  results.push('zero fixture residue; all pre-existing relation fingerprints preserved');
}
let failure;
try { await run(); } catch (error) { failure = error; }
try { await cleanup(); } catch (error) { failure = new Error(`${failure?.message || ''} Cleanup failed: ${error.message}`); }
if (failure) { console.error(JSON.stringify({ status: 'failed', message: failure.message, checks: results, fixtureRegistry: join(workdir, 'fixture-ids.json') })); process.exitCode = 1; }
else console.log(JSON.stringify({ status: 'passed', target: REF, migrationSha256: HASH, preservationRelations: baseline.length, checks: results }, null, 2));
