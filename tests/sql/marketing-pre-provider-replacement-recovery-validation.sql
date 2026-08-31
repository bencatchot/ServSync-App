\set ON_ERROR_STOP on

select content.id as content_id, content.revision_number as content_revision
from public.marketing_content_items content
join public.marketing_workspaces workspace on workspace.id=content.workspace_id
where workspace.contractor_id='20000000-0000-4000-8000-000000000001'
  and content.title='Contractor A exact post'
\gset recovery_content_

select pairing.id as pairing_id
from public.marketing_content_media_pairings pairing
where pairing.content_id=:'recovery_content_content_id'::uuid and pairing.status='approved'
\gset recovery_pairing_

select connection.id as connection_id
from public.marketing_provider_connections connection
join public.marketing_workspaces workspace on workspace.id=connection.workspace_id
where workspace.contractor_id='20000000-0000-4000-8000-000000000001'
  and connection.provider='facebook'
\gset recovery_connection_

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);

select prepared->>'package_id' as package_id, prepared->>'package_fingerprint' as fingerprint
from (select public.servsync_prepare_marketing_publication_package(
  '20000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000004',
  :'recovery_content_content_id'::uuid,
  :'recovery_content_content_revision'::bigint,
  :'recovery_pairing_pairing_id'::uuid,
  'facebook',
  :'recovery_connection_connection_id'::uuid
) prepared) response
\gset recovery_package_

select public.servsync_record_marketing_package_preview(
  '20000000-0000-4000-8000-000000000001',
  :'recovery_package_package_id'::uuid,
  :'recovery_package_fingerprint'
);
select public.servsync_approve_marketing_publication_package(
  '20000000-0000-4000-8000-000000000001',
  :'recovery_package_package_id'::uuid,
  :'recovery_package_fingerprint'
);

select authorized->>'publication_id' as publication_id
from (select public.servsync_authorize_marketing_publication(
  '20000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000004',
  :'recovery_package_package_id'::uuid,
  :'recovery_package_fingerprint',
  'publish_now',null,'America/Chicago'
) authorized) response
\gset recovery_publication_
reset role;

select set_config('servsync_test.recovery_publication_id',:'recovery_publication_publication_id',false);
select set_config('servsync_test.recovery_package_id',:'recovery_package_package_id',false);
select set_config('servsync_test.recovery_package_fingerprint',:'recovery_package_fingerprint',false);

update public.marketing_publications
set status='publishing',attempt_count=attempt_count+1,publishing_started_at=now(),updated_at=now()
where id=:'recovery_publication_publication_id'::uuid;

set role service_role;
select public.servsync_fail_marketing_publication(
  :'recovery_publication_publication_id'::uuid,1,'content_validation',
  'Fixture failed before provider contact.',false
);
reset role;

do $$
begin
  if not public.servsync_private_marketing_pre_provider_replacement_eligible(
      current_setting('servsync_test.recovery_publication_id')::uuid) then
    raise exception 'Exact provider-free failure was not replacement eligible.';
  end if;
  if (select status from public.marketing_publication_packages
      where id=current_setting('servsync_test.recovery_package_id')::uuid)<>'needs_attention' then
    raise exception 'Provider-free failure did not retain Needs Attention package state.';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$
declare v_state jsonb; v_result jsonb; v_replay jsonb;
begin
  v_state:=public.servsync_get_marketing_publishing('20000000-0000-4000-8000-000000000001');
  if not exists(select 1 from jsonb_array_elements(v_state->'publications') publication
      where publication->>'publication_id'=current_setting('servsync_test.recovery_publication_id')
        and (publication->>'replacement_eligible')::boolean) then
    raise exception 'Publishing state did not expose exact replacement eligibility.';
  end if;
  v_result:=public.servsync_prepare_marketing_pre_provider_replacement(
    '20000000-0000-4000-8000-000000000001',
    current_setting('servsync_test.recovery_publication_id')::uuid,
    '54000000-0000-4000-8000-000000000001'
  );
  if v_result->>'status'<>'ready' or (v_result->>'replayed')::boolean then
    raise exception 'Provider-free replacement preparation mismatch.';
  end if;
  v_replay:=public.servsync_prepare_marketing_pre_provider_replacement(
    '20000000-0000-4000-8000-000000000001',
    current_setting('servsync_test.recovery_publication_id')::uuid,
    '54000000-0000-4000-8000-000000000001'
  );
  if not (v_replay->>'replayed')::boolean or v_replay->>'status'<>'ready' then
    raise exception 'Replacement preparation replay mismatch.';
  end if;
end;
$$;

select authorized->>'publication_id' as publication_id
from (select public.servsync_authorize_marketing_publication(
  '20000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000005',
  :'recovery_package_package_id'::uuid,
  :'recovery_package_fingerprint',
  'publish_now',null,'America/Chicago'
) authorized) response
\gset replacement_publication_
reset role;

select set_config('servsync_test.replacement_publication_id',:'replacement_publication_publication_id',false);

do $$
begin
  if (select status from public.marketing_publications
      where id=current_setting('servsync_test.recovery_publication_id')::uuid)<>'failed' then
    raise exception 'Original failed publication history was modified.';
  end if;
  if (select count(*) from public.marketing_publication_events
      where publication_id=current_setting('servsync_test.recovery_publication_id')::uuid
        and reason_category='pre_provider_replacement')<>1 then
    raise exception 'Replacement recovery audit event mismatch.';
  end if;
  if (select count(*) from public.marketing_publications
      where package_id=current_setting('servsync_test.recovery_package_id')::uuid)<>2 then
    raise exception 'Replacement did not preserve the failed attempt and create one new authorization.';
  end if;
  if exists(select 1 from public.marketing_publications
      where package_id=current_setting('servsync_test.recovery_package_id')::uuid
        and provider_request_started_at is not null) then
    raise exception 'Replacement preparation unexpectedly started a provider request.';
  end if;
end;
$$;

update public.marketing_publications
set status='publishing',attempt_count=attempt_count+1,publishing_started_at=now(),
    provider_request_started_at=now(),updated_at=now()
where id=:'replacement_publication_publication_id'::uuid;

set role service_role;
select public.servsync_fail_marketing_publication(
  :'replacement_publication_publication_id'::uuid,1,'temporary_provider',
  'Fixture ambiguous after provider contact.',false
);
reset role;

do $$
begin
  if public.servsync_private_marketing_pre_provider_replacement_eligible(
      current_setting('servsync_test.replacement_publication_id')::uuid) then
    raise exception 'Provider-started failure was incorrectly replacement eligible.';
  end if;
  if public.servsync_private_marketing_pre_provider_replacement_eligible(
      current_setting('servsync_test.recovery_publication_id')::uuid) then
    raise exception 'Original failure ignored a conflicting provider-started attempt.';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$ begin
  begin
    perform public.servsync_prepare_marketing_pre_provider_replacement(
      '20000000-0000-4000-8000-000000000001',
      current_setting('servsync_test.replacement_publication_id')::uuid,
      '54000000-0000-4000-8000-000000000002'
    );
    raise exception 'Provider-started failure unexpectedly prepared a replacement.';
  exception when sqlstate '55000' then null; end;
  begin
    perform public.servsync_prepare_marketing_pre_provider_replacement(
      '20000000-0000-4000-8000-000000000002',
      current_setting('servsync_test.replacement_publication_id')::uuid,
      '54000000-0000-4000-8000-000000000003'
    );
    raise exception 'Cross-tenant replacement recovery unexpectedly succeeded.';
  exception when sqlstate '42501' then null; end;
end;
$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',false);
do $$ begin
  begin
    perform public.servsync_prepare_marketing_pre_provider_replacement(
      '20000000-0000-4000-8000-000000000001',
      current_setting('servsync_test.replacement_publication_id')::uuid,
      '54000000-0000-4000-8000-000000000004'
    );
    raise exception 'Field technician replacement recovery unexpectedly succeeded.';
  exception when sqlstate '42501' then null; end;
end;
$$;
reset role;

do $$
begin
  if not has_function_privilege(
      'authenticated',
      'public.servsync_prepare_marketing_pre_provider_replacement(uuid,uuid,uuid)',
      'EXECUTE')
     or has_function_privilege(
      'service_role',
      'public.servsync_prepare_marketing_pre_provider_replacement(uuid,uuid,uuid)',
      'EXECUTE')
     or has_function_privilege(
      'authenticated',
      'public.servsync_private_marketing_pre_provider_replacement_eligible(uuid)',
      'EXECUTE') then
    raise exception 'Replacement recovery function grants mismatch.';
  end if;
  if exists(select 1 from pg_proc function
      join pg_namespace namespace on namespace.oid=function.pronamespace
      join pg_roles owner on owner.oid=function.proowner
      where namespace.nspname='public'
        and function.proname in (
          'servsync_private_marketing_pre_provider_replacement_eligible',
          'servsync_prepare_marketing_pre_provider_replacement'
        )
        and (owner.rolname<>'postgres' or not function.prosecdef
          or not exists(select 1 from unnest(function.proconfig) setting
            where setting like 'search_path=pg_catalog%'))) then
    raise exception 'Replacement recovery security metadata mismatch.';
  end if;
end;
$$;

select 'Guarded pre-provider Marketing replacement recovery validation passed' as result;
