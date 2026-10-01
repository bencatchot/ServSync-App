import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Bundle actual feature code with Vite's raw-text behavior; no provider access.
const result = await build({entryPoints:['src/features/legal/policies.ts'],bundle:true,write:false,format:'esm',platform:'node',loader:{'.json':'text'}});
const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const { POLICY_BUNDLE, legalSignupMetadata, requireCurrentLegalBundle } = module;
const policyText = readFileSync('public/legal/servsync-2026-10-01-v1.json','utf8');
const hash = createHash('sha256').update(policyText).digest('hex');

test('required assent has no marketing consent, client timestamp, identity or link token', () => {
 for(const [role,context] of [['homeowner','standard'],['contractor','standard'],['homeowner','contractor_invitation'],['homeowner','local_customer_claim']]){
  const evidence = legalSignupMetadata(role,context,true);
  assert.deepEqual(Object.keys(evidence).sort(),['bundle_id','terms_agreed','privacy_acknowledged','acceptable_use_agreed','contractor_agreed','us_adult_confirmed','context'].sort());
  assert.equal(evidence.contractor_agreed,role==='contractor');
  assert.equal(evidence.context,context);
  assert.throws(()=>legalSignupMetadata(role,context,false));
 }
});
test('preflight rejects missing migration, old version, wrong hash and empty response',async()=>{
 for(const response of [{data:null,error:{message:'missing'}},{data:null,error:null},{data:{bundle_id:'old',policy_sha256:hash},error:null},{data:{bundle_id:POLICY_BUNDLE.bundleId,policy_sha256:'wrong'},error:null}]){
  await assert.rejects(requireCurrentLegalBundle({rpc:async()=>response}),/Account creation is temporarily unavailable/);
 }
 await requireCurrentLegalBundle({rpc:async name=>{
  assert.equal(name,'servsync_current_legal_bundle');
  return {data:{bundle_id:POLICY_BUNDLE.bundleId,policy_sha256:hash},error:null};
 }});
});
test('archive identifies exact bytes; all four substantive policies and assent are included',()=>{
 assert.equal(JSON.parse(readFileSync('public/legal/manifest.json','utf8')).sha256,hash);
 assert.equal(Object.keys(POLICY_BUNDLE.pages).length,4);
 for(const page of Object.values(POLICY_BUNDLE.pages)){
  assert.ok(page.sections.length>=5);
  assert.doesNotMatch(JSON.stringify(page),/final (policy|terms|agreement) should|placeholder|attorney.approved/i);
 }
 assert.match(POLICY_BUNDLE.assent.homeowner,/acknowledge the Privacy Policy/);
 assert.match(POLICY_BUNDLE.assent.contractor,/Contractor Platform Agreement/);
 assert.doesNotMatch(POLICY_BUNDLE.assent.homeowner,/Contractor Platform Agreement/);
});
test('all three existing signup calls carry preflight and context without changing sign-in',()=>{
 const app=readFileSync('src/App.tsx','utf8');
 assert.equal((app.match(/await supabase.auth.signUp\(/g)||[]).length,3);
 assert.equal((app.match(/await requireCurrentLegalBundle\(supabase\)/g)||[]).length,3);
 assert.equal((app.match(/legal_acceptance: legalSignupMetadata\(/g)||[]).length,3);
 for(const context of ['standard','contractor_invitation','local_customer_claim']) assert.ok(app.includes(`'${context}', acceptedLegal)`));
 assert.equal((app.match(/<LegalConsent role=/g)||[]).length,3);
});
