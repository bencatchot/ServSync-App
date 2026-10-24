import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateGuidedReview, validateGuidedHelpSpec } from '../../scripts/help/prepare-guided-onboarding-source.mjs';

const evidence=JSON.parse(await readFile(new URL('../../docs/qa/GUIDED_ONBOARDING_REVIEW_RECORDING.json',import.meta.url)));
const script=evidence.scenes.filter(s=>s.text).map(s=>s.text).join('\n\n');
const recorderSha=createHash('sha256').update(await readFile(new URL('../../scripts/help/record-guided-onboarding-review.mjs',import.meta.url))).digest('hex');

test('accepts the reviewed read-only source with the exact approved script',()=>{
  assert.equal(validateGuidedReview(evidence,script,recorderSha),script.split('\n\n').join(' '));
});
test('refuses business-write attempts, changed producer and wrong environment',()=>{
  for (const patch of [{business_mutation_attempts:1},{recorder_sha256:'0'.repeat(64)},{environment:'Production'},{recorded_origin:'https://servsync.app'}]) {
    assert.throws(()=>validateGuidedReview({...evidence,...patch},script,recorderSha));
  }
});
test('refuses changed narration, mislabeled package and missing source provenance',()=>{
  assert.throws(()=>validateGuidedReview(evidence,script+' Send automatically.',recorderSha));
  for(const patch of [{local_review_only:false},{ingestible_help_package:true},{source_commit:'0'.repeat(40)},{mp4_sha256:null},{scenes:[]}]) {
    assert.throws(()=>validateGuidedReview({...evidence,...patch},script,recorderSha));
  }
});
test('job binding requires a valid exported identity and exact approved narration',()=>{
  const spec={schema_version:1,recording_job_id:'11111111-1111-4111-8111-111111111111',scenario:'contractor-create-estimate',pacing_profile:evidence.pacing_profile,narration_mode:'ai',talking_points:script.split('\n\n')};
  assert.equal(validateGuidedHelpSpec(spec),spec);
  for(const patch of [{recording_job_id:null},{scenario:'contractor-complete-work'},{talking_points:['Changed instructions.']},{narration_mode:'none'}]){
    assert.throws(()=>validateGuidedHelpSpec({...spec,...patch}));
  }
});
