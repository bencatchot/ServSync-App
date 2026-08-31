\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);

select reserved->>'source_path' as source_path,reserved->>'poster_path' as poster_path
from (select public.servsync_reserve_marketing_upload(
  '20000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001','retire-video.mp4','video/mp4',4096,true
) reserved) response \gset retirement_media_

reset role;
insert into storage.objects(id,bucket_id,name,metadata) values
  ('71000000-0000-4000-8000-000000000002','marketing-assets',:'retirement_media_source_path','{"mimetype":"video/mp4","size":"4096"}'),
  ('71000000-0000-4000-8000-000000000003','marketing-assets',:'retirement_media_poster_path','{"mimetype":"image/jpeg","size":"128"}');
select id as asset_id from public.marketing_media_intakes
where client_request_id='71000000-0000-4000-8000-000000000001' \gset retirement_media_

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select public.servsync_finalize_marketing_upload(
  '20000000-0000-4000-8000-000000000001',:'retirement_media_asset_id'::uuid,
  repeat('7',64),1440,900,30,repeat('6',64),128);

select created->>'content_id' as content_id
from (select public.servsync_create_marketing_content(
  '20000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000004',
  'Free ServSync beta retirement fixture','social_post',
  'The exact unpublished retirement fixture.','social'
) created) response \gset retirement_content_
select public.servsync_transition_marketing_content(
  '20000000-0000-4000-8000-000000000001',:'retirement_content_content_id'::uuid,1,'draft',null);
select public.servsync_transition_marketing_content(
  '20000000-0000-4000-8000-000000000001',:'retirement_content_content_id'::uuid,2,'needs_approval',null);
select public.servsync_transition_marketing_content(
  '20000000-0000-4000-8000-000000000001',:'retirement_content_content_id'::uuid,3,'approved',null);

select public.servsync_create_marketing_media_pairing(
  '20000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000005',:'retirement_content_content_id'::uuid,4,
  :'retirement_media_asset_id'::uuid,'Exact unpublished video selected for retirement validation.');
select public.servsync_review_marketing_media_pairing(
  '20000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000005','approved');

reset role;
select id as connection_id from public.marketing_provider_connections
where workspace_id=(select id from public.marketing_workspaces
  where contractor_id='20000000-0000-4000-8000-000000000001') and provider='facebook'
\gset retirement_connection_

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select prepared->>'package_id' as package_id,prepared->>'package_fingerprint' as fingerprint
from (select public.servsync_prepare_marketing_publication_package(
  '20000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000006',:'retirement_content_content_id'::uuid,4,
  '71000000-0000-4000-8000-000000000005','facebook',:'retirement_connection_connection_id'::uuid
) prepared) response \gset retirement_package_
select public.servsync_record_marketing_package_preview(
  '20000000-0000-4000-8000-000000000001',:'retirement_package_package_id'::uuid,:'retirement_package_fingerprint');
select public.servsync_approve_marketing_publication_package(
  '20000000-0000-4000-8000-000000000001',:'retirement_package_package_id'::uuid,:'retirement_package_fingerprint');

select (public.servsync_get_marketing_usage_summary(
  '20000000-0000-4000-8000-000000000001')->'usage'->>'active_media_slots')::integer as slots_before,
  (public.servsync_get_marketing_publishing(
  '20000000-0000-4000-8000-000000000001')->>'prepared_count')::integer as prepared_before
\gset retirement_before_

select set_config('servsync_test.retirement_asset_id',:'retirement_media_asset_id',false);
select set_config('servsync_test.retirement_package_id',:'retirement_package_package_id',false);
select set_config('servsync_test.retirement_fingerprint',:'retirement_package_fingerprint',false);
select set_config('servsync_test.retirement_slots_before',:'retirement_before_slots_before',false);
select set_config('servsync_test.retirement_prepared_before',:'retirement_before_prepared_before',false);

do $$
declare v_catalog jsonb;
begin
  v_catalog:=public.servsync_get_marketing_media_catalog('20000000-0000-4000-8000-000000000001');
  if not exists (
    select 1 from jsonb_array_elements(v_catalog->'assets') asset
    where asset->>'asset_id'=current_setting('servsync_test.retirement_asset_id')
      and asset->>'lifecycle_state'='ready'
      and (asset->>'retirement_eligible')::boolean
  ) then
    raise exception 'Ready unpublished media was not exposed as retirement eligible.';
  end if;
end;
$$;

select retired->>'state' as state,(retired->>'retired_package_count')::integer as package_count,
  (retired->>'replayed')::boolean as replayed
from (select public.servsync_abandon_marketing_media(
  '20000000-0000-4000-8000-000000000001',:'retirement_media_asset_id'::uuid
) retired) response \gset retirement_result_

select set_config('servsync_test.retirement_state',:'retirement_result_state',false);
select set_config('servsync_test.retirement_package_count',:'retirement_result_package_count',false);
select set_config('servsync_test.retirement_replayed',:'retirement_result_replayed',false);

reset role;

do $$
begin
  if current_setting('servsync_test.retirement_state')<>'abandoned'
     or current_setting('servsync_test.retirement_package_count')::integer<>1
     or current_setting('servsync_test.retirement_replayed')::boolean then
    raise exception 'Retirement receipt mismatch.';
  end if;
  if (select state from public.marketing_media_lifecycles
      where asset_id=current_setting('servsync_test.retirement_asset_id')::uuid)<>'abandoned' then
    raise exception 'Media lifecycle did not become abandoned.';
  end if;
  if (select status from public.marketing_publication_packages
      where id=current_setting('servsync_test.retirement_package_id')::uuid)<>'retired'
     or (select retired_reason from public.marketing_publication_packages
      where id=current_setting('servsync_test.retirement_package_id')::uuid)
        <>'Managed media retired before publication.' then
    raise exception 'Unpublished package was not retired with bounded evidence.';
  end if;
  if (select status from public.marketing_content_media_pairings
      where id='71000000-0000-4000-8000-000000000005')<>'rejected'
     or not exists (
       select 1 from public.marketing_content_media_pairing_events
       where pairing_id='71000000-0000-4000-8000-000000000005'
         and from_status='approved' and to_status='rejected'
     ) then
    raise exception 'Retirement did not invalidate the selected pairing with append-only evidence.';
  end if;
  if not exists (
    select 1 from public.marketing_media_lifecycle_events event
    where event.asset_id=current_setting('servsync_test.retirement_asset_id')::uuid and event.to_state='abandoned'
      and event.reason='Owner retired unpublished Marketing media.'
      and (event.metadata->>'retired_package_count')::integer=1
      and event.metadata->'retired_package_ids' @> to_jsonb(array[current_setting('servsync_test.retirement_package_id')::uuid])
  ) then
    raise exception 'Append-only retirement audit evidence is missing.';
  end if;
  if (public.servsync_get_marketing_usage_summary(
      '20000000-0000-4000-8000-000000000001')->'usage'->>'active_media_slots')::integer
      <> current_setting('servsync_test.retirement_slots_before')::integer-1 then
    raise exception 'Retirement did not release exactly one active media slot.';
  end if;
  if (public.servsync_get_marketing_publishing(
      '20000000-0000-4000-8000-000000000001')->>'prepared_count')::integer
      <> current_setting('servsync_test.retirement_prepared_before')::integer-1 then
    raise exception 'Retirement did not remove the stale Ready package from prepared usage.';
  end if;
end;
$$;

select set_config('servsync_test.retirement_events_before',(select count(*)::text
  from public.marketing_media_lifecycle_events
  where asset_id=current_setting('servsync_test.retirement_asset_id')::uuid and to_state='abandoned'),false);

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select replayed->>'retired_package_count' as package_count,(replayed->>'replayed')::boolean as replayed
from (select public.servsync_abandon_marketing_media(
  '20000000-0000-4000-8000-000000000001',current_setting('servsync_test.retirement_asset_id')::uuid
) replayed) response \gset retirement_replay_
select set_config('servsync_test.retirement_replay_count',:'retirement_replay_package_count',false);
select set_config('servsync_test.retirement_replay_replayed',:'retirement_replay_replayed',false);

do $$
begin
  begin
    perform public.servsync_authorize_marketing_publication(
      '20000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000007',current_setting('servsync_test.retirement_package_id')::uuid,
      current_setting('servsync_test.retirement_fingerprint'),'publish_now',null,'America/Chicago');
    raise exception 'Retired stale package unexpectedly authorized publication.';
  exception when sqlstate '55000' then null; end;
end;
$$;

reset role;
do $$
begin
  if not current_setting('servsync_test.retirement_replay_replayed')::boolean
     or current_setting('servsync_test.retirement_replay_count')::integer<>0 then
    raise exception 'Retirement replay was not idempotent.';
  end if;
  if (select count(*) from public.marketing_media_lifecycle_events
      where asset_id=current_setting('servsync_test.retirement_asset_id')::uuid and to_state='abandoned')
      <>current_setting('servsync_test.retirement_events_before')::integer then
    raise exception 'Retirement replay duplicated lifecycle evidence.';
  end if;
end;
$$;

select set_config('servsync_test.dependency_asset_id',(select pairing.asset_id::text
  from public.marketing_content_media_pairings pairing
  where pairing.id='51000000-0000-4000-8000-000000000001'),false);
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$
begin
  begin
    perform public.servsync_abandon_marketing_media(
      '20000000-0000-4000-8000-000000000001',current_setting('servsync_test.dependency_asset_id')::uuid);
    raise exception 'Publishing-dependent media unexpectedly retired.';
  exception when sqlstate '55000' then
    if sqlerrm not like '%publishing dependency%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',false);
  begin
    perform public.servsync_abandon_marketing_media(
      null,'15000000-0000-4000-8000-000000000099');
    raise exception 'Protected media unexpectedly retired.';
  exception when sqlstate '55000' then
    if sqlerrm not like '%protected or permanent%' then raise; end if;
  end;
end;
$$;

reset role;

do $$
begin
  if obj_description('public.servsync_abandon_marketing_media(uuid,uuid)'::regprocedure,'pg_proc')
      <>'servsync-marketing-media-retirement-control-v1' then
    raise exception 'Retirement installation marker is missing.';
  end if;
  if not has_function_privilege('authenticated','public.servsync_abandon_marketing_media(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.servsync_abandon_marketing_media(uuid,uuid)','EXECUTE')
     or has_function_privilege('service_role','public.servsync_abandon_marketing_media(uuid,uuid)','EXECUTE') then
    raise exception 'Retirement RPC grants mismatch.';
  end if;
end;
$$;

select 'Marketing media retirement control validation passed' as result;
