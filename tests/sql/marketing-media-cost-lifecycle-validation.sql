\set ON_ERROR_STOP on

insert into public.profiles (id, role, full_name) values
  ('10000000-0000-4000-8000-000000000001', 'platform_admin', 'Platform Admin'),
  ('10000000-0000-4000-8000-000000000002', 'contractor', 'Owner A'),
  ('10000000-0000-4000-8000-000000000003', 'contractor', 'Owner B'),
  ('10000000-0000-4000-8000-000000000004', 'contractor', 'Admin A'),
  ('10000000-0000-4000-8000-000000000005', 'contractor', 'Office A'),
  ('10000000-0000-4000-8000-000000000006', 'contractor', 'Field A'),
  ('10000000-0000-4000-8000-000000000007', 'contractor', 'Viewer A');

insert into public.contractor_profiles (id, owner_user_id, business_name, account_status) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Contractor A', 'active'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'Contractor B', 'active');

insert into public.contractor_team_members (contractor_id, user_id, role, status) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'admin', 'active'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'office', 'active'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'field_tech', 'active'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007', 'viewer', 'active');

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select public.servsync_ensure_contractor_marketing_workspace('20000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', false);
select public.servsync_ensure_contractor_marketing_workspace('20000000-0000-4000-8000-000000000002');
reset role;

do $$
begin
  if (select count(*) from public.marketing_workspace_entitlements) <> 3 then
    raise exception 'Every internal/contractor workspace must have one entitlement row.';
  end if;
  if not exists (
    select 1 from public.marketing_entitlement_plans where plan_key = 'free_beta'
      and active_media_slots = 3 and monthly_video_generations = 4
      and ready_scheduled_post_limit = 5 and max_generated_video_seconds = 75
      and published_media_retention_hours = 72 and abandoned_media_expiration_days = 30
  ) then raise exception 'Free-beta defaults mismatch.'; end if;
  if not exists (
    select 1 from public.marketing_media_lifecycles
    where asset_id = '15000000-0000-4000-8000-000000000099'
      and state = 'protected' and retained_permanently
  ) then raise exception 'Legacy Marketing asset was not protected.'; end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
do $$
declare v_summary jsonb; v_result jsonb; v_index integer;
begin
  v_summary := public.servsync_get_marketing_usage_summary('20000000-0000-4000-8000-000000000001');
  if (v_summary#>>'{entitlements,usage_period}') <> 'rolling_30_days'
     or (v_summary#>>'{entitlements,monthly_video_generations}')::integer <> 4
     or (v_summary#>>'{usage,active_media_slots}')::integer <> 0 then
    raise exception 'Contractor usage summary mismatch.';
  end if;
  for v_index in 1..4 loop
    v_result := public.servsync_reserve_marketing_generation(
      '20000000-0000-4000-8000-000000000001',
      ('30000000-0000-4000-8000-' || lpad(v_index::text, 12, '0'))::uuid,
      'video_composition', 30, 'OpenAI', 'configured-model'
    );
    if not (v_result->>'allowed')::boolean then raise exception 'Generation % unexpectedly denied.', v_index; end if;
  end loop;
  v_result := public.servsync_reserve_marketing_generation(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000010', 'video_composition', 30, 'OpenAI', 'configured-model'
  );
  if (v_result->>'allowed')::boolean or v_result->>'reason' <> 'rolling_30_day_generation_limit' then
    raise exception 'Rolling 30-day generation allowance did not fail closed.';
  end if;
  v_result := public.servsync_reserve_marketing_generation(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001', 'video_composition', 30, 'OpenAI', 'configured-model'
  );
  if not (v_result->>'allowed')::boolean or not (v_result->>'replayed')::boolean then
    raise exception 'Generation reservation replay was not idempotent.';
  end if;
end;
$$;

select reserved->>'source_path' as source_path, reserved->>'poster_path' as poster_path
from (select public.servsync_reserve_marketing_upload(
  '20000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'before-photo.jpg', 'image/jpeg', 24, true
) as reserved) response \gset reserved_

insert into storage.objects (id, bucket_id, name, metadata) values
  ('32000000-0000-4000-8000-000000000001', 'marketing-assets', :'reserved_source_path',
    '{"mimetype":"image/jpeg","size":"24"}'),
  ('32000000-0000-4000-8000-000000000002', 'marketing-assets', :'reserved_poster_path',
    '{"mimetype":"image/jpeg","size":"18"}');
reset role;

select id as intake_id from public.marketing_media_intakes
where client_request_id = '31000000-0000-4000-8000-000000000001' \gset upload_

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select public.servsync_finalize_marketing_upload(
  '20000000-0000-4000-8000-000000000001',
  :'upload_intake_id'::uuid,
  repeat('c',64), 1200, 800, null, repeat('d',64), 18
);
reset role;
select set_config('servsync_test.upload_asset_id', :'upload_intake_id', false);

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select reserved->>'source_path' as source_path, reserved->>'poster_path' as poster_path
from (select public.servsync_reserve_marketing_upload(
  '20000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000002',
  'abandoned-upload.jpg', 'image/jpeg', 21, true
) as reserved) response \gset abandoned_reserved_

insert into storage.objects (id, bucket_id, name, metadata) values
  ('32000000-0000-4000-8000-000000000003', 'marketing-assets', :'abandoned_reserved_source_path',
    '{"mimetype":"image/jpeg","size":"21"}'),
  ('32000000-0000-4000-8000-000000000004', 'marketing-assets', :'abandoned_reserved_poster_path',
    '{"mimetype":"image/jpeg","size":"17"}');
reset role;
update public.marketing_media_intakes set last_activity_at = now() - interval '31 days'
where client_request_id = '31000000-0000-4000-8000-000000000002';

set role service_role;
select public.servsync_claim_abandoned_marketing_upload_purges(5);
reset role;
select id as abandoned_intake_id, purge_claim_token as abandoned_claim_token,
  source_bucket as abandoned_source_bucket, source_path as abandoned_source_path,
  poster_bucket as abandoned_poster_bucket, poster_path as abandoned_poster_path
from public.marketing_media_intakes
where client_request_id = '31000000-0000-4000-8000-000000000002' \gset abandoned_

delete from storage.objects
 where (bucket_id = :'abandoned_abandoned_source_bucket' and name = :'abandoned_abandoned_source_path')
    or (bucket_id = :'abandoned_abandoned_poster_bucket' and name = :'abandoned_abandoned_poster_path');
set role service_role;
select public.servsync_complete_abandoned_marketing_upload_purge(
  :'abandoned_abandoned_intake_id'::uuid, :'abandoned_abandoned_claim_token'::uuid
);
select public.servsync_complete_abandoned_marketing_upload_purge(
  :'abandoned_abandoned_intake_id'::uuid, :'abandoned_abandoned_claim_token'::uuid
);
reset role;
do $$
begin
  if not exists (
    select 1 from public.marketing_media_intakes
    where client_request_id = '31000000-0000-4000-8000-000000000002' and status = 'purged'
  ) then raise exception 'Abandoned pre-finalization upload was not purged.'; end if;
  if (select count(*) from public.marketing_usage_events
      where metadata->>'intake_id' = (
        select id::text from public.marketing_media_intakes
        where client_request_id = '31000000-0000-4000-8000-000000000002'
      )) <> 1 then
    raise exception 'Abandoned-upload purge replay duplicated usage history.';
  end if;
end;
$$;

insert into public.inspections (id, contractor_id, rooms_with_findings) values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '[{"room":"Kitchen","findings":[{"title":"Fixture","photos":["20000000-0000-4000-8000-000000000001/jobs/40000000-0000-4000-8000-000000000001/after.jpg"]}]}]'
);
insert into storage.objects (id, bucket_id, name, metadata) values (
  '42000000-0000-4000-8000-000000000001', 'inspection-media',
  '20000000-0000-4000-8000-000000000001/jobs/40000000-0000-4000-8000-000000000001/after.jpg',
  '{"mimetype":"image/jpeg","size":"32"}'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select public.servsync_register_job_marketing_media(
  '20000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001/jobs/40000000-0000-4000-8000-000000000001/after.jpg',
  'image/jpeg', 32, repeat('e',64), true
);
do $$ begin
  begin
    perform public.servsync_register_job_marketing_media(
      '20000000-0000-4000-8000-000000000001', gen_random_uuid(),
      '40000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001/jobs/40000000-0000-4000-8000-000000000001/not-in-job.jpg',
      'image/jpeg', 32, repeat('f',64), true
    );
    raise exception 'Unregistered Job path unexpectedly entered Marketing.';
  exception when sqlstate '42501' then null; end;
end $$;
do $$ begin
  begin
    perform public.servsync_register_job_marketing_media(
      '20000000-0000-4000-8000-000000000001', gen_random_uuid(),
      '40000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001/jobs/40000000-0000-4000-8000-000000000001/after.jpg/substring',
      'image/jpeg', 32, repeat('f',64), true
    );
    raise exception 'Substring-only Job path unexpectedly entered Marketing.';
  exception when sqlstate '42501' then null; end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', false);
do $$ declare v_asset uuid := current_setting('servsync_test.upload_asset_id')::uuid;
begin
  begin
    perform public.servsync_get_marketing_media_access('20000000-0000-4000-8000-000000000002', v_asset);
    raise exception 'Contractor B unexpectedly read Contractor A media.';
  exception when no_data_found then null; end;
  begin
    perform public.servsync_get_marketing_usage_summary('20000000-0000-4000-8000-000000000001');
    raise exception 'Contractor B unexpectedly read Contractor A usage.';
  exception when sqlstate '42501' then null; end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', false);
do $$ begin
  begin
    perform public.servsync_get_marketing_usage_summary('20000000-0000-4000-8000-000000000001');
    raise exception 'Field technician unexpectedly read Marketing usage.';
  exception when sqlstate '42501' then null; end;
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', false);
do $$ begin
  begin
    perform public.servsync_reserve_marketing_upload(
      '20000000-0000-4000-8000-000000000001', gen_random_uuid(),
      'denied.jpg','image/jpeg',10,true
    );
    raise exception 'Viewer unexpectedly reserved Marketing media.';
  exception when sqlstate '42501' then null; end;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$ declare v_controls jsonb;
begin
  v_controls := public.servsync_update_marketing_cost_controls(true, 10000000, 80, 100, null);
  if (v_controls->>'monthly_budget_microusd')::bigint <> 10000000 then
    raise exception 'Platform cost controls did not persist.';
  end if;
  begin
    perform public.servsync_get_marketing_usage_summary('20000000-0000-4000-8000-000000000001');
    raise exception 'Platform admin unexpectedly read contractor usage.';
  exception when sqlstate '42501' then null; end;
end $$;
reset role;

do $$ declare v_asset uuid;
begin
  select consumed_asset_id into strict v_asset from public.marketing_media_intakes
   where client_request_id = '31000000-0000-4000-8000-000000000001';
  update public.marketing_media_lifecycles set state = 'abandoned',
    retention_started_at = now() - interval '31 days', purge_after = now() - interval '1 hour'
   where asset_id = v_asset;
end $$;

set role service_role;
select public.servsync_claim_marketing_media_purges(5);
reset role;

select purge_claim_token as claim_token,
  asset.storage_bucket as storage_bucket, asset.storage_path as storage_path,
  lifecycle.asset_id as purge_asset_id
from public.marketing_media_lifecycles lifecycle
join public.marketing_media_assets asset on asset.id = lifecycle.asset_id
where lifecycle.state = 'purging' \gset purge_

create temp table purge_dependency_guard_fixture (
  workspace_id uuid not null,
  media_snapshot jsonb not null
);
create trigger purge_dependency_guard_fixture_trigger
  before insert or update of workspace_id, media_snapshot
  on purge_dependency_guard_fixture for each row
  execute function public.servsync_private_guard_marketing_media_dependency();
do $$ begin
  begin
    insert into purge_dependency_guard_fixture (workspace_id, media_snapshot)
    select workspace_id, jsonb_build_object('asset_id', asset_id)
      from public.marketing_media_lifecycles
     where asset_id = current_setting('servsync_test.upload_asset_id')::uuid;
    raise exception 'A new dependency unexpectedly attached to purge-claimed media.';
  exception when sqlstate '55000' then null; end;
end $$;

delete from storage.objects where bucket_id = :'purge_storage_bucket' and name = :'purge_storage_path';

set role service_role;
select public.servsync_complete_marketing_media_purge(
  :'purge_purge_asset_id'::uuid, :'purge_claim_token'::uuid,
  :'purge_storage_bucket', :'purge_storage_path'
);
select public.servsync_complete_marketing_media_purge(
  :'purge_purge_asset_id'::uuid, :'purge_claim_token'::uuid,
  :'purge_storage_bucket', :'purge_storage_path'
);
reset role;
select set_config('servsync_test.purged_asset_id', :'purge_purge_asset_id', false);

do $$
declare v_asset public.marketing_media_assets; v_lifecycle public.marketing_media_lifecycles;
begin
  select * into strict v_asset from public.marketing_media_assets
   where id = current_setting('servsync_test.purged_asset_id')::uuid;
  select * into strict v_lifecycle from public.marketing_media_lifecycles where asset_id = v_asset.id;
  if v_lifecycle.state <> 'purged' or v_lifecycle.purged_at is null then raise exception 'Media was not purged.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = v_asset.poster_bucket and name = v_asset.poster_path) then
    raise exception 'Small poster was removed with large media.';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'inspection-media'
    and name like '%/after.jpg') then null; else raise exception 'Canonical Job source was removed.'; end if;
  if (select count(*) from public.marketing_media_lifecycle_events where asset_id = v_asset.id and to_state = 'purged') <> 1 then
    raise exception 'Purge replay duplicated lifecycle history.';
  end if;
end;
$$;

do $$
declare v_missing integer;
begin
  if exists (
    select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public' and relation.relkind='r' and relation.relname like 'marketing_%'
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ) then raise exception 'A Marketing table lacks forced RLS.'; end if;
  if exists (
    select 1 from information_schema.role_table_grants where table_schema='public'
      and table_name like 'marketing_%' and grantee in ('PUBLIC','anon','authenticated','service_role')
  ) then raise exception 'A Marketing table has an unexpected direct grant.'; end if;
  select count(*) into v_missing from (values
    ('servsync_get_marketing_usage_summary','s'),
    ('servsync_reserve_marketing_generation','v'),
    ('servsync_reserve_marketing_upload','v'),
    ('servsync_finalize_marketing_upload','v'),
    ('servsync_register_job_marketing_media','v'),
    ('servsync_claim_marketing_media_purges','v'),
    ('servsync_complete_marketing_media_purge','v')
  ) expected(name, volatility)
  where not exists (
    select 1 from pg_proc function join pg_namespace namespace on namespace.oid=function.pronamespace
    join pg_roles owner on owner.oid=function.proowner
    where namespace.nspname='public' and function.proname=expected.name
      and function.prosecdef and function.provolatile::text=expected.volatility
      and owner.rolname='postgres'
  );
  if v_missing <> 0 then raise exception 'Marketing media function security metadata mismatch.'; end if;
  if has_function_privilege('authenticated','public.servsync_claim_marketing_media_purges(integer)','EXECUTE')
     or not has_function_privilege('service_role','public.servsync_claim_marketing_media_purges(integer)','EXECUTE')
     or has_function_privilege('service_role','public.servsync_reserve_marketing_upload(uuid,uuid,text,text,bigint,boolean)','EXECUTE')
     or not has_function_privilege('authenticated','public.servsync_reserve_marketing_upload(uuid,uuid,text,text,bigint,boolean)','EXECUTE') then
    raise exception 'Marketing media function grants mismatch.';
  end if;
  if (select count(*) from public.marketing_usage_events where generation_consumed) <> 4
     or (select count(*) from public.marketing_usage_events where usage_category='generation_denied') <> 1 then
    raise exception 'Generation usage history mismatch.';
  end if;
end;
$$;

select 'Marketing media, entitlement, cost, and lifecycle validation passed' as result;
