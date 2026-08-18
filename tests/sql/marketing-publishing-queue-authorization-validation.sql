\set ON_ERROR_STOP on

do $$
begin
  if (select provider_submissions_enabled from public.marketing_publishing_controls where singleton) then
    raise exception 'Provider submissions must start disabled.';
  end if;
  if (select count(*) from public.marketing_provider_connections connection
      join public.marketing_workspaces workspace on workspace.id=connection.workspace_id
      where workspace.workspace_kind='contractor') <> 6 then
    raise exception 'Contractor provider connection seeds mismatch.';
  end if;
end;
$$;

update public.marketing_provider_connections connection
set connection_status='connected', readiness_status='ready', destination_key=case
      when workspace.contractor_id='20000000-0000-4000-8000-000000000001' then '111111111111111'
      else '222222222222222' end,
    destination_label=case when workspace.contractor_id='20000000-0000-4000-8000-000000000001'
      then 'Contractor A Page' else 'Contractor B Page' end,
    connected_at=now(), readiness_note='Fixture Page is ready for an exact local authorization.',
    capabilities='{"text":true,"media":true,"publishing_enabled":true}'::jsonb
from public.marketing_workspaces workspace
where workspace.id=connection.workspace_id and workspace.workspace_kind='contractor'
  and connection.provider='facebook';

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select reserved->>'source_path' as source_path,reserved->>'poster_path' as poster_path
from (select public.servsync_reserve_marketing_upload(
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000099','queue-photo.jpg','image/jpeg',24,true
) reserved) response \gset queue_media_
insert into storage.objects(id,bucket_id,name,metadata) values
  ('50000000-0000-4000-8000-000000000098','marketing-assets',:'queue_media_source_path','{"mimetype":"image/jpeg","size":"24"}'),
  ('50000000-0000-4000-8000-000000000097','marketing-assets',:'queue_media_poster_path','{"mimetype":"image/jpeg","size":"18"}');
reset role;
select id as asset_id from public.marketing_media_intakes
where client_request_id='50000000-0000-4000-8000-000000000099' \gset queue_media_
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select public.servsync_finalize_marketing_upload(
  '20000000-0000-4000-8000-000000000001',:'queue_media_asset_id'::uuid,
  repeat('9',64),1200,800,null,repeat('8',64),18);

select created->>'content_id' as content_id
from (select public.servsync_create_marketing_content(
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'Contractor A exact post','social_post','A clear local service update.','social'
) created) response \gset content_a_
select public.servsync_transition_marketing_content(
  '20000000-0000-4000-8000-000000000001',:'content_a_content_id'::uuid,1,'draft',null);
select public.servsync_transition_marketing_content(
  '20000000-0000-4000-8000-000000000001',:'content_a_content_id'::uuid,2,'needs_approval',null);
select public.servsync_transition_marketing_content(
  '20000000-0000-4000-8000-000000000001',:'content_a_content_id'::uuid,3,'approved',null);

select public.servsync_create_marketing_media_pairing(
  '20000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',:'content_a_content_id'::uuid,4,
  :'queue_media_asset_id'::uuid,'Exact Marketing media selected for this approved post.');
select public.servsync_review_marketing_media_pairing(
  '20000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001','approved');

reset role;
select id as connection_id from public.marketing_provider_connections
where workspace_id=(select id from public.marketing_workspaces
  where contractor_id='20000000-0000-4000-8000-000000000001') and provider='facebook'
\gset connection_a_
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);

select prepared->>'package_id' as package_id, prepared->>'package_fingerprint' as fingerprint
from (select public.servsync_prepare_marketing_publication_package(
  '20000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',:'content_a_content_id'::uuid,4,
  '51000000-0000-4000-8000-000000000001','facebook',:'connection_a_connection_id'::uuid
) prepared) response \gset package_a_
select public.servsync_record_marketing_package_preview(
  '20000000-0000-4000-8000-000000000001',:'package_a_package_id'::uuid,:'package_a_fingerprint');
select public.servsync_approve_marketing_publication_package(
  '20000000-0000-4000-8000-000000000001',:'package_a_package_id'::uuid,:'package_a_fingerprint');

select authorized->>'publication_id' as publication_id
from (select public.servsync_authorize_marketing_publication(
  '20000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',:'package_a_package_id'::uuid,:'package_a_fingerprint',
  'scheduled',now()+interval '2 hours','America/Chicago'
) authorized) response \gset publication_a_
select set_config('servsync_test.package_a_id',:'package_a_package_id',false);
select set_config('servsync_test.package_a_fingerprint',:'package_a_fingerprint',false);
select set_config('servsync_test.publication_a_id',:'publication_a_publication_id',false);

do $$
declare v_replay jsonb;
begin
  v_replay:=public.servsync_authorize_marketing_publication(
    '20000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    current_setting('servsync_test.package_a_id')::uuid,
    current_setting('servsync_test.package_a_fingerprint'),'scheduled',now()+interval '2 hours','America/Chicago');
  if not (v_replay->>'replayed')::boolean
     or v_replay->>'publication_id'<>current_setting('servsync_test.publication_a_id') then
    raise exception 'Publication authorization replay mismatch.';
  end if;
end;
$$;

do $$
begin
  if (public.servsync_get_marketing_publishing('20000000-0000-4000-8000-000000000001')->>'prepared_count')::integer<>1 then
    raise exception 'Prepared/scheduled count mismatch.';
  end if;
  begin
    perform public.servsync_get_marketing_publishing('20000000-0000-4000-8000-000000000002');
    raise exception 'Contractor A unexpectedly read Contractor B queue.';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.servsync_record_marketing_package_preview(
      '20000000-0000-4000-8000-000000000002',
      current_setting('servsync_test.package_a_id')::uuid,
      current_setting('servsync_test.package_a_fingerprint'));
    raise exception 'Contractor A unexpectedly mutated Contractor B package context.';
  exception when sqlstate '42501' then null; end;
end;
$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',false);
do $$ begin
  begin
    perform public.servsync_get_marketing_publishing('20000000-0000-4000-8000-000000000001');
    raise exception 'Field technician unexpectedly read Marketing publishing.';
  exception when sqlstate '42501' then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',false);
do $$ begin
  begin
    perform public.servsync_get_marketing_publishing('20000000-0000-4000-8000-000000000001');
    raise exception 'Viewer unexpectedly read Marketing publishing.';
  exception when sqlstate '42501' then null; end;
end $$;
reset role;

set role service_role;
do $$ declare v_claims jsonb;
begin
  v_claims:=public.servsync_claim_due_marketing_publications(5);
  if jsonb_array_length(v_claims)<>0 then raise exception 'Disabled global gate unexpectedly claimed a publication.'; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select public.servsync_reschedule_marketing_publication(
  '20000000-0000-4000-8000-000000000001',:'publication_a_publication_id'::uuid,
  '53000000-0000-4000-8000-000000000002',now()+interval '3 hours','America/Chicago');
reset role;
select id as publication_id from public.marketing_publications
where authorization_request_id='53000000-0000-4000-8000-000000000002' \gset publication_a2_
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select public.servsync_cancel_marketing_publication(
  '20000000-0000-4000-8000-000000000001',:'publication_a2_publication_id'::uuid);
reset role;

do $$
begin
  if (select count(*) from public.marketing_publications where workspace_id=(select id
      from public.marketing_workspaces where contractor_id='20000000-0000-4000-8000-000000000001'))<>2 then
    raise exception 'Schedule change did not preserve two immutable authorization records.';
  end if;
  if (select status from public.marketing_publication_packages
      where id=current_setting('servsync_test.package_a_id')::uuid)<>'ready' then
    raise exception 'Cancelled schedule did not return the package to Ready.';
  end if;
end;
$$;

update public.marketing_provider_connections set destination_key='111111111111112',updated_at=now()
where id=:'connection_a_connection_id'::uuid;

do $$
begin
  if (select status from public.marketing_publication_packages
      where id=current_setting('servsync_test.package_a_id')::uuid)<>'retired' then
    raise exception 'Destination identity change did not retire the stale package.';
  end if;
  if exists(select 1 from public.marketing_publication_packages
    where id=current_setting('servsync_test.package_a_id')::uuid and retired_reason is null) then
    raise exception 'Stale package retirement reason is missing.';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select prepared->>'package_id' as package_id, prepared->>'package_fingerprint' as fingerprint
from (select public.servsync_prepare_marketing_publication_package(
  '20000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000003',:'content_a_content_id'::uuid,4,
  '51000000-0000-4000-8000-000000000001','facebook',:'connection_a_connection_id'::uuid
) prepared) response \gset destination_package_
select public.servsync_record_marketing_package_preview(
  '20000000-0000-4000-8000-000000000001',:'destination_package_package_id'::uuid,:'destination_package_fingerprint');
select public.servsync_approve_marketing_publication_package(
  '20000000-0000-4000-8000-000000000001',:'destination_package_package_id'::uuid,:'destination_package_fingerprint');
select authorized->>'publication_id' as publication_id
from (select public.servsync_authorize_marketing_publication(
  '20000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000003',:'destination_package_package_id'::uuid,:'destination_package_fingerprint',
  'scheduled',now()+interval '4 hours','America/Chicago'
) authorized) response \gset destination_publication_
reset role;
select set_config('servsync_test.destination_package_id',:'destination_package_package_id',false);
select set_config('servsync_test.destination_publication_id',:'destination_publication_publication_id',false);

update public.marketing_provider_connections set destination_key='111111111111113',updated_at=now()
where id=:'connection_a_connection_id'::uuid;

do $$
begin
  if (select status from public.marketing_publications
      where id=current_setting('servsync_test.destination_publication_id')::uuid)<>'failed'
     or (select failure_category from public.marketing_publications
      where id=current_setting('servsync_test.destination_publication_id')::uuid)<>'provider_auth' then
    raise exception 'Destination identity change did not stop the scheduled publication.';
  end if;
  if (select status from public.marketing_publication_packages
      where id=current_setting('servsync_test.destination_package_id')::uuid)<>'needs_attention' then
    raise exception 'Destination identity change did not move the package to Needs Attention.';
  end if;
end;
$$;

do $$
declare v_missing integer;
begin
  if exists(select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public' and relation.relkind='r' and relation.relname like 'marketing_%'
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)) then
    raise exception 'A Marketing queue table lacks forced RLS.';
  end if;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public'
    and table_name in ('marketing_publication_packages','marketing_publishing_controls')
    and grantee in ('PUBLIC','anon','authenticated','service_role')) then
    raise exception 'A Marketing queue table has an unexpected direct grant.';
  end if;
  select count(*) into v_missing from (values
    ('servsync_get_marketing_publishing','s'),
    ('servsync_get_marketing_media_catalog','s'),
    ('servsync_create_marketing_media_pairing','v'),
    ('servsync_review_marketing_media_pairing','v'),
    ('servsync_prepare_marketing_publication_package','v'),
    ('servsync_record_marketing_package_preview','v'),
    ('servsync_approve_marketing_publication_package','v'),
    ('servsync_authorize_marketing_publication','v'),
    ('servsync_cancel_marketing_publication','v'),
    ('servsync_reschedule_marketing_publication','v'),
    ('servsync_retry_marketing_publication','v'),
    ('servsync_claim_due_marketing_publications','v')
  ) expected(name,volatility)
  where not exists(select 1 from pg_proc function
    join pg_namespace namespace on namespace.oid=function.pronamespace
    join pg_roles owner on owner.oid=function.proowner
    where namespace.nspname='public' and function.proname=expected.name
      and function.prosecdef and function.provolatile::text=expected.volatility
      and owner.rolname='postgres');
  if v_missing<>0 then
    raise exception 'Marketing queue function security metadata mismatch (%).',v_missing;
  end if;
  if exists(select 1 from pg_proc function join pg_namespace namespace on namespace.oid=function.pronamespace
    where namespace.nspname='public' and function.proname like 'servsync%marketing%'
      and function.prosecdef and not exists(select 1 from unnest(function.proconfig) setting
        where setting like 'search_path=pg_catalog%')) then
    raise exception 'A Marketing security-definer function has an unsafe search_path.';
  end if;
  if has_function_privilege('authenticated','public.servsync_claim_due_marketing_publications(integer)','EXECUTE')
     or not has_function_privilege('service_role','public.servsync_claim_due_marketing_publications(integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.servsync_authorize_marketing_publication(uuid,uuid,uuid,text,text,timestamptz,text)','EXECUTE') then
    raise exception 'Marketing queue function grants mismatch.';
  end if;
end;
$$;

select 'Shared Marketing publishing queue and authorization validation passed' as result;
