import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';
import { assertSafeRecorderEnvironment } from './lib.mjs';

export const DRAFT_FIRST_TABLES = Object.freeze([
  'contractor_work_drafts', 'contractor_work_draft_items', 'contractor_work_draft_launches',
  'estimates', 'estimate_line_items',
]);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function requireCondition(ok, message) { if (!ok) throw new Error(`Draft-first fixture: ${message}`); }
async function data(query) {
  const result = await query;
  if (result.error) throw new Error(`Draft-first fixture database operation failed (${result.error.code || 'unknown'}).`);
  return result.data;
}

export function validateSavedDraft(envelope, identity, estimate) {
  const d = envelope?.draft;
  requireCondition(uuid(d?.id) && d.status === 'active' && d.work_format === 'standard' && d.intended_output === 'estimate', 'unexpected saved Draft.');
  for (const key of ['contractor_id', 'homeowner_user_id', 'home_id']) requireCondition(d[key] === identity[key], `${key} mismatch.`);
  requireCondition(!d.service_request_id && !d.local_contact_id && !d.local_home_id && d.title === estimate.title && d.scope_description === estimate.scope, 'unexpected Draft context.');
  requireCondition(envelope.items?.length === 1, 'expected exactly one work item.');
  const item = envelope.items[0];
  requireCondition(uuid(item.id) && item.draft_id === d.id && item.contractor_id === identity.contractor_id, 'item lineage mismatch.');
  requireCondition(item.unit_price_cents === estimate.line.unit_price_cents && Number(item.quantity) === 1 && item.unit === 'each'
    && item.line_type === estimate.line.line_type && item.title === estimate.line.line_title, 'work item pricing/scope mismatch.');
  return { draftId: d.id, itemId: item.id };
}

export function validateLaunchedEstimate({ draft, launches, estimate, items }, identity, expected, draftId) {
  requireCondition(draft.id === draftId && draft.status === 'consumed' && draft.launched_output_type === 'estimate', 'Draft not consumed into Estimate.');
  requireCondition(launches.length === 1 && launches[0].requested_output === 'estimate' && launches[0].status === 'succeeded', 'unexpected launch count/type.');
  const launch = launches[0];
  requireCondition(uuid(estimate?.id) && estimate.id === draft.launched_estimate_id && estimate.id === launch.launched_estimate_id
    && estimate.id === draft.launched_estimate_id_snapshot && estimate.id === launch.launched_estimate_id_snapshot
    && launch.draft_id === draftId && launch.contractor_id === identity.contractor_id, 'output lineage mismatch.');
  for (const key of ['contractor_id', 'homeowner_user_id', 'home_id']) requireCondition(estimate[key] === identity[key] && draft[key] === identity[key], `${key} mismatch.`);
  requireCondition(!launch.launched_job_id && !launch.launched_invoice_id && !draft.launched_job_id && !draft.launched_invoice_id, 'non-Estimate output.');
  requireCondition(estimate.status === 'draft' && !estimate.service_request_id && !estimate.inspection_id && !estimate.local_contact_id
    && estimate.title === expected.title && estimate.scope === expected.scope && estimate.subtotal_cents === 189500 && estimate.total_cents === 189500, 'Estimate must remain unsent with exact scope and total.');
  requireCondition(items.length === 1 && uuid(items[0].id) && items[0].estimate_id === estimate.id
    && items[0].unit_price_cents === 189500 && Number(items[0].quantity) === 1, 'Estimate item mismatch.');
  return { launchId: launch.id, estimateId: estimate.id, estimateItemId: items[0].id };
}

export async function startDraftFirstFixture(env, scenario, journalPath) {
  const target = assertSafeRecorderEnvironment(env, scenario);
  requireCondition(env.DEMO_SUPABASE_SERVICE_ROLE_KEY, 'missing private operator credential.');
  const service = createClient(target.supabaseUrl, env.DEMO_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const [table, order] of [['contractor_work_drafts',128],['contractor_work_draft_items',129],['contractor_work_draft_launches',130]]) {
    requireCondition(await data(service.rpc('servsync_demo_reset_order', { p_schema_name: 'public', p_table_name: table })) === order, 'approved Demo support is not installed.');
  }
  // Estimate creation also writes a private actor-attribution row. Do not create
  // fixtures until separately approved exact-key audit cleanup is available.
  const auditOrder = await data(service.rpc('servsync_demo_reset_order', {p_schema_name:'public',p_table_name:'estimate_actor_audit'}));
  requireCondition(DRAFT_FIRST_TABLES.includes('estimate_actor_audit') && auditOrder !== null, 'Estimate actor-audit cleanup is not approved/installed; recording is blocked before any fixture writes.');
  const source = await data(service.from('demo_scenario_runs').select('id,metadata').eq('scenario_key','water_heater_core_loop').eq('status','succeeded').order('started_at',{ascending:false}).limit(1).single());
  const identity = Object.fromEntries(['contractor_id','homeowner_user_id','home_id'].map(key => [key, source.metadata[key]]));
  requireCondition(Object.values(identity).every(uuid), 'shared fictional fixture identity missing.');
  const home = await data(service.from('homes').select('id,homeowner_user_id,nickname').eq('id', identity.home_id).single());
  requireCondition(home.homeowner_user_id === identity.homeowner_user_id && home.nickname === scenario.property.nickname, 'shared property changed.');
  // Unresolved runs are never automatically swept. An operator must inspect their receipts.
  const unresolved = await data(service.from('demo_scenario_runs').select('id').eq('scenario_key','draft_first_estimate').neq('status','reset'));
  requireCondition(unresolved.length === 0, 'an earlier isolated run needs receipt-based recovery before recording again.');
  const baseline = {};
  for (const table of DRAFT_FIRST_TABLES) baseline[table] = new Set((await data(service.from(table).select('id'))).map(row => row.id));
  const runId = await data(service.rpc('servsync_demo_start_run', {
    p_scenario_key:'draft_first_estimate', p_display_name:'Draft-first Estimate tutorial',
    p_description:'Isolated ordinary Work → Draft → unsent Estimate recording. Shared customer/property are read-only.',
    p_operation:'seed', p_checkpoint:'draft_ready', p_anchor_timestamp:new Date().toISOString(),
    p_target_project_ref:target.projectRef, p_metadata:{...identity, source_run_id:source.id, recorder_scenario:scenario.key},
  }));
  const journal = { runId, identity, sourceRunId:source.id, records:[], draftId:null, status:'started' };
  const persist = () => writeFile(journalPath, `${JSON.stringify(journal,null,2)}\n`, {mode:0o600});
  await persist();
  async function register(table,id) {
    requireCondition(DRAFT_FIRST_TABLES.includes(table) && uuid(id) && !baseline[table].has(id), 'refused to adopt a pre-existing or unsupported record.');
    if (!journal.records.some(r=>r.table===table && r.id===id)) { journal.records.push({table,id}); await persist(); }
    await data(service.rpc('servsync_demo_register_record', {p_run_id:runId,p_schema_name:'public',p_table_name:table,p_record_id:id,p_record_role:`draft_first_${table}`,p_checkpoint:'estimate_draft'}));
  }
  async function adoptSaved(envelope) {
    const ids = validateSavedDraft(envelope,identity,scenario.estimate);
    requireCondition(!journal.draftId || journal.draftId === ids.draftId, 'a second Draft cannot be adopted.');
    journal.draftId = ids.draftId; await persist();
    await register('contractor_work_drafts',ids.draftId);
    await register('contractor_work_draft_items',ids.itemId);
    return ids;
  }
  async function adoptLaunched() {
    requireCondition(uuid(journal.draftId), 'no exact saved Draft receipt for recovery.');
    const draft = await data(service.from('contractor_work_drafts').select('*').eq('id',journal.draftId).single());
    if (draft.status === 'active') return null;
    const launches = await data(service.from('contractor_work_draft_launches').select('*').eq('draft_id',journal.draftId));
    const estimate = await data(service.from('estimates').select('*').eq('id',draft.launched_estimate_id).single());
    const items = await data(service.from('estimate_line_items').select('*').eq('estimate_id',estimate.id));
    const ids = validateLaunchedEstimate({draft,launches,estimate,items},identity,scenario.estimate,journal.draftId);
    await register('estimates',ids.estimateId);
    await register('estimate_line_items',ids.estimateItemId);
    await register('contractor_work_draft_launches',ids.launchId);
    journal.result=ids; await persist();
    return ids;
  }
  async function cleanup() {
    // Re-register durable receipts if an earlier registration request was interrupted.
    for (const row of [...journal.records]) await register(row.table,row.id);
    if (journal.draftId) await adoptLaunched();
    const removed = await data(service.rpc('servsync_demo_reset_registered_run',{p_run_id:runId}));
    journal.status='reset'; journal.cleanup=removed; await persist();
    return removed;
  }
  return {runId,identity,adoptSaved,adoptLaunched,cleanup,journal};
}
