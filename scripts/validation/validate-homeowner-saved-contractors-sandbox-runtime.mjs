// Operator-only Sandbox acceptance. Requires owner approval for disposable accounts/data.
// The runtime requires a separate --apply-migration flag for first installation.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
assert.ok(process.argv.includes('--execute-sandbox'));
const REF='zpzdkoaubyjtsomccxya';
const HASH='aa2203badabc68ab3013fc312192fc0a7af6fb3711473028465ca33f9a9749d7';
const sql=readFileSync('servsync-homeowner-saved-contractors.sql','utf8');
assert.equal(createHash('sha256').update(sql).digest('hex'),HASH);
const workdir=mkdtempSync(join(tmpdir(),'servsync-shortlist-sandbox-'));
mkdirSync(join(workdir,'supabase/.temp'),{recursive:true});
writeFileSync(join(workdir,'supabase/.temp/project-ref'),REF,{mode:0o600});
assert.equal(readFileSync(join(workdir,'supabase/.temp/project-ref'),'utf8'),REF);
function cli(args){return execFileSync('supabase',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:30*1024*1024});}
function query(sql){const file=join(workdir,'query.sql');writeFileSync(file,sql,{mode:0o600});return JSON.parse(cli(['db','query','--linked','--workdir',workdir,'--output','json','--file',file])).rows;}
const projects=JSON.parse(cli(['projects','list','--output','json']));
assert.equal(projects.find(p=>p.id===REF)?.name,'ServSync Sandbox');
const baselineSql = `begin;
create temp table prospect_preservation(label text, row_count bigint, fingerprint text) on commit drop;
do $b$ declare r record; begin
for r in select tablename from pg_tables where schemaname='public' loop
execute format('insert into prospect_preservation select %L,count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) from public.%I t', 'public.'||r.tablename,r.tablename);
end loop; end $b$;
insert into prospect_preservation select 'auth.users',count(*),md5(coalesce(string_agg(id::text,'' order by id),'')) from auth.users;
insert into prospect_preservation select 'storage.objects',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from storage.objects t;
insert into prospect_preservation select 'storage.buckets',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from storage.buckets t;
select * from prospect_preservation order by label; rollback;`;

const existing=query("select to_regclass('public.homeowner_saved_contractors') as existing")[0].existing;
assert.ok(process.argv.includes('--apply-migration') ? !existing : existing, 'Use --apply-migration only for first installation; otherwise validate installed table');
const before=query(baselineSql); writeFileSync(join(workdir,'baseline.json'),JSON.stringify(before),{mode:0o600});
if(process.argv.includes('--apply-migration')) query(sql);
const installed=query(baselineSql);
assert.deepEqual(installed.filter(r=>r.label!=='public.homeowner_saved_contractors'),before.filter(r=>r.label!=='public.homeowner_saved_contractors'),'Migration preserves all existing data');
assert.equal(query("select relrowsecurity from pg_class where oid='public.homeowner_saved_contractors'::regclass")[0].relrowsecurity,true);
assert.equal(query("select count(*) n from pg_policies where schemaname='public' and tablename='homeowner_saved_contractors'")[0].n,3);
assert.equal(query("select count(*) n from pg_trigger where tgrelid='public.homeowner_saved_contractors'::regclass and not tgisinternal")[0].n,0);
const keys=JSON.parse(cli(['projects','api-keys','--project-ref',REF,'--output','json']));
const anonKey=keys.find(k=>k.name==='anon')?.api_key, serviceKey=keys.find(k=>k.name==='service_role')?.api_key;
assert.ok(anonKey&&serviceKey);
const client=key=>createClient(`https://${REF}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const service=client(serviceKey),anon=client(anonKey),ids=[],sessions=[],checks=[];
const marker=`shortlist-${randomUUID()}`;
const register=()=>writeFileSync(join(workdir,'fixture-ids.json'),JSON.stringify({marker,ids}),{mode:0o600});
function check(v,label){assert.ok(v,label);checks.push(label);}
async function actor(name,role){
 const email=`${marker}-${name}@example.invalid`,password=`Aa1!${randomUUID()}`;
 const r=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role,full_name:`${marker} ${name}`}});
 assert.equal(r.error,null,'Fixture creation');ids.push(r.data.user.id);register();
 const c=client(anonKey);const signed=await c.auth.signInWithPassword({email,password});assert.equal(signed.error,null,'Fixture sign-in');sessions.push(c);return {id:r.data.user.id,c,session:signed.data.session};
}
let failure;
try {
 const a=await actor('a','homeowner'),b=await actor('b','homeowner'),owner=await actor('owner','contractor');
 let profiles=query(`select id from public.contractor_profiles where owner_user_id='${owner.id}'`);
 let id=profiles[0]?.id;
 if(!id){id=randomUUID();query(`insert into public.contractor_profiles(id,owner_user_id,slug,business_name) values('${id}','${owner.id}','${marker}','${marker}')`);}
 const table=c=>c.from('homeowner_saved_contractors');
 const save=()=>table(a.c).upsert({homeowner_user_id:a.id,contractor_id:id},{onConflict:'homeowner_user_id,contractor_id',ignoreDuplicates:true});
 let r=await save();check(!r.error,'Owner save through authenticated API');
 r=await save();check(!r.error,'Duplicate save idempotent');
 r=await table(a.c).select('*');check(!r.error&&r.data.length===1,'Owner persistent read');
 r=await table(b.c).select('*');check(!r.error&&r.data.length===0,'Other homeowner cannot read');
 r=await table(b.c).delete().eq('homeowner_user_id',a.id).select();check(!r.error&&r.data.length===0,'Other homeowner cannot delete');
 r=await table(b.c).insert({homeowner_user_id:a.id,contractor_id:id});check(Boolean(r.error),'Spoofed ownership denied');
 r=await table(owner.c).select('*');check(!r.error&&r.data.length===0,'Contractor cannot read private saves');
 r=await table(owner.c).insert({homeowner_user_id:owner.id,contractor_id:id});check(Boolean(r.error),'Contractor save denied');
 r=await table(anon).select('*');check(Boolean(r.error),'Anonymous read denied');
 r=await table(anon).insert({homeowner_user_id:a.id,contractor_id:id});check(Boolean(r.error),'Anonymous save denied');
 r=await table(a.c).update({homeowner_user_id:b.id}).eq('contractor_id',id);check(Boolean(r.error),'Ownership update denied');
 query(`update public.contractor_profiles set public_profile_enabled=false where id='${id}' and owner_user_id='${owner.id}'`);
 r=await table(a.c).select('*');check(!r.error&&r.data.length===1,'Hidden profile preserves private bookmark');
 r=await table(a.c).delete().eq('contractor_id',id).select();check(!r.error&&r.data.length===1,'Hidden profile removable');
 r=await save();check(Boolean(r.error),'Hidden profile new save denied');
 query(`update public.contractor_profiles set public_profile_enabled=true,account_status='paused' where id='${id}' and owner_user_id='${owner.id}'`);
 r=await save();check(Boolean(r.error),'Paused contractor save denied');
 query(`update public.contractor_profiles set account_status='active' where id='${id}' and owner_user_id='${owner.id}'`);
 r=await save();check(!r.error,'Eligible save recovers');
 r=await table(a.c).delete().eq('contractor_id',id);check(!r.error,'Owner removal succeeds');
 r=await table(a.c).select('*');check(!r.error&&r.data.length===0,'Removal persists');
 if(process.argv.includes('--browser')){const {verifyBrowser}=await import('./validate-homeowner-saved-contractors-sandbox-browser.mjs');await verifyBrowser({actor:a,ref:REF,anonKey,marker,checks});}
} catch(e){failure=e;}
finally {
 for(const c of sessions) await c.auth.signOut();
 for(const id of [...ids].reverse()){const r=await service.auth.admin.deleteUser(id);if(r.error)failure=new Error('Exact fixture cleanup failed');}
 try {assert.deepEqual(query(baselineSql),installed,'All pre-existing data and zero fixture residue');checks.push('All relation fingerprints preserved after fixture cleanup');}catch(e){failure=e;}
}
const evidence={status:failure?'failed':'passed',target:REF,migrationSha256:HASH,preservationRelations:before.length,checks,message:failure?.message};
writeFileSync(join(workdir,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));if(failure)process.exitCode=1;
