-- Run after baseline cases in an isolated PostgreSQL database only.
truncate contractor_work_draft_launches,contractor_work_draft_items,contractor_work_drafts,
 estimate_actor_audit,estimate_line_items,unexpected_dependency,estimates,demo_scenario_records,demo_scenario_runs,demo_scenarios;
insert into contractor_profiles values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
create or replace function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
select public.servsync_demo_start_run('draft_first_estimate','test','isolated','seed','draft_ready',now(),'bdytwgejqnlblhrnqxkp', '{"contractor_user_id":"00000000-0000-4000-8000-000000000001","contractor_id":"00000000-0000-4000-8000-000000000001","homeowner_user_id":"00000000-0000-4000-8000-000000000002","home_id":"00000000-0000-4000-8000-000000000003"}') as run_id \gset
insert into estimates values ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','draft',189500);
insert into contractor_work_drafts(id,contractor_id,homeowner_user_id,home_id,status,work_format,intended_output,launched_output_type,launched_estimate_id,launched_estimate_id_snapshot) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','consumed','standard','estimate','estimate','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000010');
insert into contractor_work_draft_items values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011');
insert into contractor_work_draft_launches values ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','estimate','succeeded','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000010');
insert into estimate_line_items values ('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000010');
select servsync_demo_register_record(:'run_id','public','estimates','00000000-0000-4000-8000-000000000010','draft_first_estimates','estimate_draft');
select servsync_demo_register_record(:'run_id','public','contractor_work_drafts','00000000-0000-4000-8000-000000000011','draft_first_contractor_work_drafts','estimate_draft');
select servsync_demo_register_record(:'run_id','public','contractor_work_draft_items','00000000-0000-4000-8000-000000000012','draft_first_contractor_work_draft_items','estimate_draft');
select servsync_demo_register_record(:'run_id','public','contractor_work_draft_launches','00000000-0000-4000-8000-000000000013','draft_first_contractor_work_draft_launches','estimate_draft');
select servsync_demo_register_record(:'run_id','public','estimate_line_items','00000000-0000-4000-8000-000000000014','draft_first_estimate_line_items','estimate_draft');
insert into estimate_actor_audit(estimate_id,contractor_id,created_by_user_id)
 select id,contractor_id,'00000000-0000-4000-8000-000000000001' from estimates;
select servsync_demo_register_record(:'run_id','public','estimate_actor_audit','00000000-0000-4000-8000-000000000010','draft_first_estimate_actor_audit','estimate_draft');
create or replace function pg_temp.refuse_reset(run_id uuid) returns void language plpgsql as $$
declare before_count int;
begin
 select count(*) into before_count from demo_scenario_records where demo_scenario_records.run_id = refuse_reset.run_id;
 begin
  perform servsync_demo_reset_registered_run(run_id);
  raise exception 'TEST: unsafe reset succeeded';
 exception when others then
  if sqlerrm = 'TEST: unsafe reset succeeded' then raise; end if;
  if sqlerrm not like 'Draft-first%' then raise; end if;
 end;
 perform pg_temp.assert((select count(*) from demo_scenario_records where demo_scenario_records.run_id = refuse_reset.run_id) = before_count,'Registry changed on rejected cleanup');
 perform pg_temp.assert((select count(*) from estimates) >= 1,'Estimate deleted before validation');
end $$;
begin;
insert into contractor_work_draft_items values('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011');
select pg_temp.refuse_reset(:'run_id');
rollback; -- extra draft item
begin;
insert into contractor_work_draft_launches values('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','estimate','succeeded','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000010');
select pg_temp.refuse_reset(:'run_id');
rollback; -- extra launch
begin;
insert into estimate_line_items values('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010');
select pg_temp.refuse_reset(:'run_id');
rollback; -- extra estimate item
begin;
insert into unexpected_dependency values('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010',null);
select pg_temp.refuse_reset(:'run_id');
rollback; -- SET NULL dependent
begin;
insert into unexpected_dependency values('00000000-0000-4000-8000-000000000021',null,'00000000-0000-4000-8000-000000000011');
select pg_temp.refuse_reset(:'run_id');
rollback; -- CASCADE dependent
begin;
update estimates set status='sent';
select pg_temp.refuse_reset(:'run_id');
rollback; -- sent output
begin;
update estimates set contractor_id='00000000-0000-4000-8000-000000000099';
select pg_temp.refuse_reset(:'run_id');
rollback; -- wrong contractor
begin;
update contractor_work_drafts set home_id='00000000-0000-4000-8000-000000000099';
select pg_temp.refuse_reset(:'run_id');
rollback; -- wrong property
begin;
update contractor_work_drafts set intended_output='job';
select pg_temp.refuse_reset(:'run_id');
rollback; -- non estimate
begin;
update contractor_work_drafts set launched_estimate_id_snapshot='00000000-0000-4000-8000-000000000099';
select pg_temp.refuse_reset(:'run_id');
rollback; -- output snapshot
begin;
update demo_scenario_runs set scenario_key='water_heater_core_loop';
select pg_temp.refuse_reset(:'run_id');
rollback; -- wrong scenario
begin;
update demo_scenario_runs set target_project_ref='uqgtheclhxqlnjpfmheq';
select pg_temp.refuse_reset(:'run_id');
rollback; -- wrong target
begin;
update demo_scenario_records set record_role='other';
select pg_temp.refuse_reset(:'run_id');
rollback; -- wrong role
begin;
insert into contractor_work_drafts(id,contractor_id,status) values('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001','active'); update contractor_work_draft_items set draft_id='00000000-0000-4000-8000-000000000022';
select pg_temp.refuse_reset(:'run_id');
rollback; -- child foreign draft
begin;
delete from demo_scenario_records where table_name='estimate_actor_audit';
select pg_temp.refuse_reset(:'run_id');
rollback; -- missing audit registration
begin;
select public.servsync_demo_start_run('draft_first_estimate','other run','isolated','seed','draft_ready',now(),'bdytwgejqnlblhrnqxkp','{}') as other_run \gset
select servsync_demo_register_record(:'other_run','public','estimates','00000000-0000-4000-8000-000000000010','draft_first_estimates','estimate_draft');
select pg_temp.refuse_reset(:'run_id');
rollback; -- even a second registered run cannot share deletion ownership
begin;
delete from contractor_work_draft_launches;
delete from estimate_line_items;
update contractor_work_drafts set status='active',launched_output_type=null,launched_estimate_id=null,launched_estimate_id_snapshot=null;
delete from estimate_actor_audit;
delete from estimates;
delete from demo_scenario_records where table_name in ('contractor_work_draft_launches','estimates','estimate_line_items','estimate_actor_audit');
select * from servsync_demo_reset_registered_run(:'run_id');
select pg_temp.assert((select count(*) from contractor_work_drafts)=0,'Saved-only Draft recovery failed');
rollback; -- save succeeded, launch never began: exact active Draft/item cleanup
begin;
update estimate_actor_audit set created_by_user_id='00000000-0000-4000-8000-000000000099';
select pg_temp.refuse_reset(:'run_id');
rollback;
begin;
update estimate_actor_audit set last_edited_by_user_id='00000000-0000-4000-8000-000000000099';
select pg_temp.refuse_reset(:'run_id');
rollback;
begin;
update estimate_actor_audit set sent_at=now();
select pg_temp.refuse_reset(:'run_id');
rollback;
begin;
update estimate_actor_audit set created_at=now()-interval '1 day';
select pg_temp.refuse_reset(:'run_id');
rollback;
begin;
update estimate_actor_audit set contractor_id='00000000-0000-4000-8000-000000000099';
select pg_temp.refuse_reset(:'run_id');
rollback;
begin;
update contractor_profiles set owner_user_id='00000000-0000-4000-8000-000000000099';
select pg_temp.refuse_reset(:'run_id');
rollback;
select pg_temp.assert(not has_function_privilege('anon','servsync_demo_reset_registered_run(uuid)','execute'),'anon allowed');
select pg_temp.assert(not has_function_privilege('authenticated','servsync_demo_reset_registered_run(uuid)','execute'),'authenticated allowed');
insert into estimates values('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','draft',100);
select * from servsync_demo_reset_registered_run(:'run_id');
select pg_temp.assert((select count(*) from estimates)=1,'Unrelated Estimate changed');
select pg_temp.assert((select count(*) from contractor_work_drafts)=0,'Owned Draft remains');
select pg_temp.assert((select count(*) from demo_scenario_records)=0,'Owned registry remains');
select pg_temp.assert(servsync_demo_reset_order('public','estimates')=70,'Existing priority changed');
select pg_temp.assert(servsync_demo_reset_order('other','contractor_work_drafts') is null,'Other schema allowed');
select pg_temp.assert((select count(*) from estimate_actor_audit)=0,'Owned audit remains');
select pg_temp.assert(not has_table_privilege('service_role','estimate_actor_audit','SELECT'),'Private audit table exposed');
select pg_temp.assert(servsync_demo_reset_pk_column('public','estimate_actor_audit')='estimate_id','Wrong audit key');
