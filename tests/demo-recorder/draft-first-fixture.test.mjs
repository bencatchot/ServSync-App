import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSavedDraft, validateLaunchedEstimate } from '../../scripts/demo/recorder/draft-first-fixture.mjs';
import { contractorCreateEstimateScenario as scenario } from '../../scripts/demo/recorder/scenarios/contractor-create-estimate.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const identity={contractor_id:id(1),homeowner_user_id:id(2),home_id:id(3)};
const draft={...identity,id:id(4),status:'active',work_format:'standard',intended_output:'estimate',title:scenario.estimate.title,scope_description:scenario.estimate.scope};
const item={id:id(5),draft_id:id(4),contractor_id:id(1),quantity:1,unit:'each',line_type:'labor',title:scenario.estimate.line.line_title,unit_price_cents:189500};
const saved=()=>({draft:structuredClone(draft),items:[structuredClone(item)]});
const launched=()=>({draft:{...draft,status:'consumed',launched_output_type:'estimate',launched_estimate_id:id(6),launched_estimate_id_snapshot:id(6)},launches:[{id:id(7),draft_id:id(4),contractor_id:id(1),requested_output:'estimate',status:'succeeded',launched_estimate_id:id(6),launched_estimate_id_snapshot:id(6)}],estimate:{...identity,id:id(6),status:'draft',title:scenario.estimate.title,scope:scenario.estimate.scope,subtotal_cents:189500,total_cents:189500},items:[{id:id(8),estimate_id:id(6),unit_price_cents:189500,quantity:1}]});
test('save receipt verifies exact new Draft and work-item IDs, context and price',()=>{
 assert.deepEqual(validateSavedDraft(saved(),identity,scenario.estimate),{draftId:id(4),itemId:id(5)});
});
for(const [name,mutate] of [
 ['wrong customer',s=>s.draft.homeowner_user_id=id(9)],['wrong contractor',s=>s.items[0].contractor_id=id(9)],
 ['foreign Draft item',s=>s.items[0].draft_id=id(9)],['extra item',s=>s.items.push(item)],
 ['different price',s=>s.items[0].unit_price_cents=1],['linked request',s=>s.draft.service_request_id=id(9)],
]) test(`save refuses ${name}`,()=>{const s=saved();mutate(s);assert.throws(()=>validateSavedDraft(s,identity,scenario.estimate));});
test('recovery uses exact owned consumed Draft and checks unsent total',()=>{
 assert.deepEqual(validateLaunchedEstimate(launched(),identity,scenario.estimate,id(4)),{launchId:id(7),estimateId:id(6),estimateItemId:id(8)});
});
for(const [name,mutate] of [
 ['sent estimate',s=>s.estimate.status='sent'],['wrong total',s=>s.estimate.total_cents=1],
 ['foreign output',s=>s.launches[0].launched_estimate_id=id(9)],['snapshot mismatch',s=>s.draft.launched_estimate_id_snapshot=id(9)],
 ['extra launch',s=>s.launches.push(s.launches[0])],['job output',s=>s.draft.launched_job_id=id(9)],
 ['extra estimate item',s=>s.items.push(s.items[0])],['foreign estimate item',s=>s.items[0].estimate_id=id(9)],
]) test(`recovery refuses ${name}`,()=>{const s=launched();mutate(s);assert.throws(()=>validateLaunchedEstimate(s,identity,scenario.estimate,id(4)));});
