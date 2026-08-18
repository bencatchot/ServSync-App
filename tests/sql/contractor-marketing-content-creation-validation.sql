\set ON_ERROR_STOP on

do $$
begin
  if (select count(*) from public.marketing_business_profiles profile
      join public.marketing_workspaces workspace on workspace.id=profile.workspace_id
      where workspace.workspace_kind='contractor' and profile.profile_status='ready')<>2 then
    raise exception 'Contractor Marketing profiles were not deterministically backfilled.';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.marketing_content_creation_requests'::regclass)
     or not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.marketing_content_source_assets'::regclass) then
    raise exception 'FB-037H private tables must use forced RLS.';
  end if;
  if has_table_privilege('authenticated','public.marketing_content_creation_requests','select')
     or has_table_privilege('service_role','public.marketing_content_creation_requests','select') then
    raise exception 'FB-037H request table has direct browser/service privileges.';
  end if;
end;
$$;

update public.inspections set name='Kitchen repair visit',summary='Replaced the worn shutoff valve.',
  job_status='completed',completed_at=now() where id='40000000-0000-4000-8000-000000000001';
insert into public.job_work_items(inspection_id,title,customer_description,internal_notes,completion_status)
values('40000000-0000-4000-8000-000000000001','Replace shutoff valve','Replaced the worn kitchen shutoff valve.','Private supplier note.','completed');

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$ declare v_context jsonb;
begin
  v_context:=public.servsync_get_marketing_creation_context('20000000-0000-4000-8000-000000000001');
  if jsonb_array_length(v_context->'jobs')<>1
     or v_context#>>'{jobs,0,title}'<>'Kitchen repair visit'
     or v_context#>>'{jobs,0,work_items,0,customer_description}'<>'Replaced the worn kitchen shutoff valve.'
     or v_context::text like '%Private supplier note%' then
    raise exception 'Customer-safe Job creation context mismatch.';
  end if;
end $$;

select prepared->>'intake_id' as intake_id,prepared->>'derivative_path' as derivative_path,
  prepared->>'poster_path' as poster_path
from (select public.servsync_prepare_job_marketing_derivative(
  '20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001/jobs/40000000-0000-4000-8000-000000000001/after.jpg',
  'image/jpeg',32,repeat('e',64),true) prepared) response \gset derivative_

insert into storage.objects(id,bucket_id,name,metadata) values
  ('72000000-0000-4000-8000-000000000001','marketing-assets',:'derivative_derivative_path','{"mimetype":"image/jpeg","size":"32"}'),
  ('72000000-0000-4000-8000-000000000002','marketing-assets',:'derivative_poster_path','{"mimetype":"image/jpeg","size":"18"}');
select finalized->>'asset_id' as asset_id from (select public.servsync_finalize_job_marketing_derivative(
  '20000000-0000-4000-8000-000000000001',:'derivative_intake_id'::uuid,repeat('e',64),1200,800,null,repeat('f',64),18
) finalized) response \gset derivative_

select reserved->>'request_id' as request_id from (select public.servsync_reserve_marketing_content_creation(
  '20000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','job',
  '40000000-0000-4000-8000-000000000001',:'derivative_asset_id'::uuid,
  'Share a practical update about the completed valve replacement.','openai','gpt-4o-mini'
) reserved) response \gset creation_
reset role;

set role service_role;
select claimed->>'claim_token' as claim_token from (select public.servsync_claim_marketing_content_creation(
  :'creation_request_id'::uuid) claimed) response \gset creation_
select completed->>'content_id' as content_id from (select public.servsync_complete_marketing_content_creation(
  :'creation_request_id'::uuid,:'creation_claim_token'::uuid,'A small repair worth documenting',
  'The worn kitchen shutoff valve was replaced during this completed visit. Keeping a clear record helps the homeowner remember what was done.',120,38
) completed) response \gset creation_
reset role;
select set_config('servsync_test.creation_content_id',:'creation_content_id',false);
select set_config('servsync_test.derivative_asset_id',:'derivative_asset_id',false);

do $$
begin
  if not exists(select 1 from public.marketing_content_items where id=current_setting('servsync_test.creation_content_id')::uuid
      and status='draft' and preparation_source='runtime_ai' and content_role='educational_post') then
    raise exception 'Runtime Marketing draft was not created through immutable Content.';
  end if;
  if not exists(select 1 from public.marketing_content_source_assets where content_id=current_setting('servsync_test.creation_content_id')::uuid
      and asset_id=current_setting('servsync_test.derivative_asset_id')::uuid and source_kind='job') then
    raise exception 'Selected Job media lineage was not bound to the draft.';
  end if;
  if not exists(select 1 from public.marketing_usage_events where content_id=current_setting('servsync_test.creation_content_id')::uuid
      and usage_category='ai_text_generation' and not generation_consumed and input_tokens=120 and output_tokens=38) then
    raise exception 'Text-generation usage evidence mismatch.';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='inspection-media'
      and name='20000000-0000-4000-8000-000000000001/jobs/40000000-0000-4000-8000-000000000001/after.jpg') then
    raise exception 'Canonical Job media was modified or removed.';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select public.servsync_transition_marketing_content('20000000-0000-4000-8000-000000000001',:'creation_content_id'::uuid,1,'needs_approval',null);
select public.servsync_transition_marketing_content('20000000-0000-4000-8000-000000000001',:'creation_content_id'::uuid,2,'approved',null);
reset role;

do $$
begin
  if not exists(select 1 from public.marketing_content_media_pairings where content_id=current_setting('servsync_test.creation_content_id')::uuid
      and content_revision=3 and asset_id=current_setting('servsync_test.derivative_asset_id')::uuid and status='candidate') then
    raise exception 'Approved draft did not enter G-C with an explicit candidate media review.';
  end if;
  if (select provider_submissions_enabled from public.marketing_publishing_controls where singleton) then
    raise exception 'Content creation changed the public-post gate.';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',false);
select public.servsync_get_marketing_creation_context('20000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',false);
select public.servsync_get_marketing_creation_context('20000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',false);
do $$ begin begin perform public.servsync_get_marketing_creation_context('20000000-0000-4000-8000-000000000001');
  raise exception 'Field technician unexpectedly entered Marketing creation.'; exception when sqlstate '42501' then null; end; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',false);
do $$ begin begin perform public.servsync_get_marketing_creation_context('20000000-0000-4000-8000-000000000001');
  raise exception 'Viewer unexpectedly entered Marketing creation.'; exception when sqlstate '42501' then null; end; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$ begin begin perform public.servsync_get_marketing_creation_context('20000000-0000-4000-8000-000000000002');
  raise exception 'Contractor A unexpectedly read Contractor B creation context.'; exception when sqlstate '42501' then null; end; end $$;
reset role;

do $$
begin
  if has_function_privilege('authenticated','public.servsync_claim_marketing_content_creation(uuid)','execute')
     or not has_function_privilege('service_role','public.servsync_claim_marketing_content_creation(uuid)','execute') then
    raise exception 'Service-only AI claim grants mismatch.';
  end if;
  if exists(select 1 from public.marketing_publication_events event
      where event.created_at > now()-interval '1 minute' and event.to_status='publishing') then
    raise exception 'Content creation emitted a provider-publication event.';
  end if;
end;
$$;
