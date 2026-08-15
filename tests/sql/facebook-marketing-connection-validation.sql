\set ON_ERROR_STOP on

insert into public.profiles(id,role,full_name)
values('61000000-0000-4000-8000-000000000006','platform_admin','Second Publishing Owner');

create temporary table facebook_baseline as
select
  (select count(*) from public.marketing_publications) as publication_count,
  (select count(*) from public.marketing_publication_events) as event_count;

update public.marketing_provider_connections set
  connection_status='disabled', destination_key=null, destination_label=null,
  capabilities='{"text":true,"media":false,"publishing_enabled":false}'::jsonb,
  readiness_status='setup_required', provider_app_key=null, provider_account_key=null,
  granted_capabilities='[]'::jsonb, token_expires_at=null, connected_by=null,
  connected_at=null, last_validated_at=null, disconnected_at=null,
  readiness_note='Facebook Page setup and owner authorization are required.', updated_at=now()
where provider='facebook';

do $$
declare v_function regprocedure;
begin
  if exists (
    select 1 from pg_class class join pg_namespace namespace on namespace.oid=class.relnamespace
    where namespace.nspname='public'
      and class.relname in ('marketing_provider_connection_secrets','marketing_facebook_oauth_sessions')
      and (not class.relrowsecurity or not class.relforcerowsecurity)
  ) then raise exception 'Facebook connection forced-RLS mismatch.'; end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public'
      and table_name in ('marketing_provider_connection_secrets','marketing_facebook_oauth_sessions')
      and grantee in ('PUBLIC','anon','authenticated','service_role')
  ) then raise exception 'Facebook connection direct table privilege mismatch.'; end if;
  foreach v_function in array array[
    'public.servsync_begin_internal_marketing_facebook_oauth(bytea,text,text)'::regprocedure,
    'public.servsync_authorize_internal_marketing_facebook_page_selection(uuid,text)'::regprocedure,
    'public.servsync_authorize_internal_marketing_facebook_recheck()'::regprocedure,
    'public.servsync_disconnect_internal_marketing_facebook()'::regprocedure
  ] loop
    if not has_function_privilege('authenticated',v_function,'execute')
       or has_function_privilege('anon',v_function,'execute')
       or has_function_privilege('service_role',v_function,'execute') then
      raise exception 'Facebook owner RPC grant mismatch for %.',v_function;
    end if;
  end loop;
  foreach v_function in array array[
    'public.servsync_private_consume_marketing_facebook_oauth(bytea,bytea,text)'::regprocedure,
    'public.servsync_private_store_marketing_facebook_oauth_result(uuid,text,text,jsonb,jsonb,timestamptz)'::regprocedure,
    'public.servsync_private_get_marketing_facebook_session_token(uuid)'::regprocedure,
    'public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz)'::regprocedure,
    'public.servsync_private_get_marketing_facebook_page_token(uuid)'::regprocedure,
    'public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb)'::regprocedure,
    'public.servsync_private_fail_marketing_facebook_recheck(uuid,text)'::regprocedure
  ] loop
    if not has_function_privilege('service_role',v_function,'execute')
       or has_function_privilege('authenticated',v_function,'execute')
       or has_function_privilege('anon',v_function,'execute') then
      raise exception 'Facebook service RPC grant mismatch for %.',v_function;
    end if;
  end loop;
end;
$$;

set role authenticated;
set request.jwt.claim.sub='61000000-0000-4000-8000-000000000002';
do $$ begin
  begin
    perform public.servsync_begin_internal_marketing_facebook_oauth(
      decode(repeat('01',32),'hex'),'https://servsync.app/api/marketing-facebook-oauth-callback','123456789012345'
    );
    raise exception 'Contractor Facebook OAuth unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='61000000-0000-4000-8000-000000000001';
select public.servsync_begin_internal_marketing_facebook_oauth(
  decode(repeat('ab',32),'hex'),'https://servsync.app/api/marketing-facebook-oauth-callback','123456789012345'
);
reset role;

do $$ begin
  if (select count(*) from public.marketing_facebook_oauth_sessions where status='pending') <> 1
     or exists (select 1 from public.marketing_facebook_oauth_sessions where expires_at <= now() or expires_at > now()+interval '11 minutes') then
    raise exception 'Facebook OAuth session start mismatch.';
  end if;
  if (select readiness_status from public.marketing_provider_connections where provider='facebook') <> 'authorization_pending' then
    raise exception 'Facebook authorization-pending readiness mismatch.';
  end if;
end $$;

set role service_role;
select (public.servsync_private_consume_marketing_facebook_oauth(
  decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'),'123456789012345'
) ->> 'session_id') as first_session_id \gset
do $$ begin
  begin
    perform public.servsync_private_consume_marketing_facebook_oauth(
      decode(repeat('ab',32),'hex'),decode(repeat('ef',32),'hex'),'123456789012345'
    );
    raise exception 'Facebook OAuth state replay unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;
end $$;
select public.servsync_private_store_marketing_facebook_oauth_result(
  :'first_session_id'::uuid,
  'test-user-access-token-abcdefghijklmnopqrstuvwxyz',
  '9988776655443322',
  '["pages_manage_posts","pages_read_engagement","pages_show_list"]'::jsonb,
  '[{"page_id":"1122334455667788","page_name":"ServSync Test Page","tasks":[],"eligible":true},{"page_id":"8877665544332211","page_name":"Read Only Page","tasks":["MODERATE"],"eligible":false}]'::jsonb,
  now()+interval '60 days'
);
reset role;

do $$ begin
  if (select count(*) from vault.secrets) <> 1
     or (select count(*) from public.marketing_provider_connection_secrets) <> 0 then
    raise exception 'Transient Facebook Vault storage mismatch.';
  end if;
  if exists (
    select 1 from public.marketing_facebook_oauth_sessions
    where row_to_json(marketing_facebook_oauth_sessions)::text like '%test-user-access-token%'
  ) then raise exception 'Facebook token leaked into the OAuth ledger.'; end if;
end $$;

set role authenticated;
set request.jwt.claim.sub='61000000-0000-4000-8000-000000000006';
do $$ begin
  begin
    perform public.servsync_authorize_internal_marketing_facebook_page_selection(
      (public.servsync_get_internal_marketing_publishing()->'facebook_setup'->>'session_id')::uuid,
      '1122334455667788'
    );
    raise exception 'A different platform admin took over the Facebook Page selection session.';
  exception when no_data_found then null;
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='61000000-0000-4000-8000-000000000001';
do $$ begin
  begin
    perform public.servsync_authorize_internal_marketing_facebook_page_selection(
      (public.servsync_get_internal_marketing_publishing()->'facebook_setup'->>'session_id')::uuid,
      '8877665544332211'
    );
    raise exception 'Ineligible Facebook Page selection unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.servsync_authorize_internal_marketing_facebook_page_selection(
      (public.servsync_get_internal_marketing_publishing()->'facebook_setup'->>'session_id')::uuid,
      '9999999999999999'
    );
    raise exception 'Unreturned Facebook Page selection unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;
  perform public.servsync_authorize_internal_marketing_facebook_page_selection(
    (public.servsync_get_internal_marketing_publishing()->'facebook_setup'->>'session_id')::uuid,
    '1122334455667788'
  );
end $$;
reset role;

set role service_role;
select set_config('servsync.test_first_session_id', :'first_session_id', false);
do $$
declare v_token text;
begin
  v_token := public.servsync_private_get_marketing_facebook_session_token(current_setting('servsync.test_first_session_id')::uuid);
  if v_token <> 'test-user-access-token-abcdefghijklmnopqrstuvwxyz' then raise exception 'Transient Facebook Vault token mismatch.'; end if;
  perform public.servsync_private_complete_marketing_facebook_page(
    current_setting('servsync.test_first_session_id')::uuid,'1122334455667788','ServSync Test Page','[]'::jsonb,
    'test-page-access-token-abcdefghijklmnopqrstuvwxyz',now()+interval '60 days'
  );
end $$;
reset role;

do $$ begin
  if not exists (
    select 1 from public.marketing_provider_connections
    where provider='facebook' and connection_status='connected'
      and readiness_status='ready_except_live_post_verification'
      and destination_key='1122334455667788'
      and capabilities='{"text":true,"media":false,"publishing_enabled":false}'::jsonb
  ) then raise exception 'Facebook connected readiness mismatch.'; end if;
  if (select count(*) from vault.secrets) <> 1
     or (select count(*) from public.marketing_provider_connection_secrets) <> 1 then
    raise exception 'Final Facebook Page Vault storage mismatch.';
  end if;
end $$;

set role authenticated;
set request.jwt.claim.sub='61000000-0000-4000-8000-000000000001';
do $$
declare v_state jsonb;
begin
  v_state := public.servsync_get_internal_marketing_publishing();
  if v_state->'facebook_setup' <> 'null'::jsonb
     or not exists (
       select 1 from jsonb_array_elements(v_state->'providers') provider
       where provider->>'provider'='facebook'
         and provider->>'readiness_status'='ready_except_live_post_verification'
         and coalesce((provider->'capabilities'->>'publishing_enabled')::boolean,false)=false
     ) then raise exception 'Safe Facebook publishing read model mismatch.'; end if;
  begin
    perform public.servsync_create_internal_marketing_publication(
      '61000000-0000-4000-8000-000000000041','61000000-0000-4000-8000-000000000013',7,
      'facebook','00000000-0000-4000-8000-000000000061','publish_now',null
    );
    raise exception 'Facebook publication bypassed the live-post kill switch.';
  exception when object_not_in_prerequisite_state then null;
  end;
  perform public.servsync_authorize_internal_marketing_facebook_recheck();
end $$;
reset role;

set role service_role;
do $$
declare v_connection_id uuid := '00000000-0000-4000-8000-000000000061'; v_token text;
begin
  v_token := public.servsync_private_get_marketing_facebook_page_token(v_connection_id);
  if v_token <> 'test-page-access-token-abcdefghijklmnopqrstuvwxyz' then raise exception 'Facebook Page Vault token mismatch.'; end if;
  perform public.servsync_private_record_marketing_facebook_recheck(
    v_connection_id,'1122334455667788','ServSync Test Page','[]'::jsonb
  );
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='61000000-0000-4000-8000-000000000001';
select public.servsync_disconnect_internal_marketing_facebook();
reset role;

do $$ begin
  if exists (select 1 from public.marketing_provider_connection_secrets)
     or exists (select 1 from vault.secrets)
     or not exists (
       select 1 from public.marketing_provider_connections
       where provider='facebook' and connection_status='disabled' and readiness_status='disconnected'
         and destination_key is null and capabilities->>'publishing_enabled'='false'
     ) then raise exception 'Facebook disconnect cleanup mismatch.'; end if;
end $$;

-- A reused authorization code is denied even on a fresh state, and expired state stays unusable.
set role authenticated;
set request.jwt.claim.sub='61000000-0000-4000-8000-000000000001';
select public.servsync_begin_internal_marketing_facebook_oauth(
  decode(repeat('31',32),'hex'),'https://servsync.app/api/marketing-facebook-oauth-callback','123456789012345'
);
reset role;
set role service_role;
do $$ begin
  begin
    perform public.servsync_private_consume_marketing_facebook_oauth(
      decode(repeat('31',32),'hex'),decode(repeat('cd',32),'hex'),'123456789012345'
    );
    raise exception 'Facebook authorization-code replay unexpectedly succeeded.';
  exception when unique_violation then null;
  end;
end $$;
reset role;
update public.marketing_facebook_oauth_sessions
set created_at=now()-interval '20 minutes', expires_at=now()-interval '10 minutes'
where state_hash=decode(repeat('31',32),'hex');
set role service_role;
do $$ begin
  begin
    perform public.servsync_private_consume_marketing_facebook_oauth(
      decode(repeat('31',32),'hex'),decode(repeat('32',32),'hex'),'123456789012345'
    );
    raise exception 'Expired Facebook OAuth state unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

-- A restarted authorization invalidates earlier unfinished state and its transient token.
set role authenticated;
set request.jwt.claim.sub='61000000-0000-4000-8000-000000000001';
select public.servsync_begin_internal_marketing_facebook_oauth(
  decode(repeat('11',32),'hex'),'https://servsync.app/api/marketing-facebook-oauth-callback','123456789012345'
);
reset role;
set role service_role;
select (public.servsync_private_consume_marketing_facebook_oauth(
  decode(repeat('11',32),'hex'),decode(repeat('12',32),'hex'),'123456789012345'
) ->> 'session_id') as restart_session_id \gset
select public.servsync_private_store_marketing_facebook_oauth_result(
  :'restart_session_id'::uuid,
  'restart-user-access-token-abcdefghijklmnopqrstuvwxyz','9988776655443322',
  '["pages_manage_posts","pages_read_engagement","pages_show_list"]'::jsonb,
  '[{"page_id":"1122334455667788","page_name":"ServSync Test Page","tasks":["CREATE_CONTENT"],"eligible":true}]'::jsonb,
  now()+interval '60 days'
);
reset role;
set role authenticated;
set request.jwt.claim.sub='61000000-0000-4000-8000-000000000001';
select public.servsync_begin_internal_marketing_facebook_oauth(
  decode(repeat('21',32),'hex'),'https://servsync.app/api/marketing-facebook-oauth-callback','123456789012345'
);
reset role;

do $$ begin
  if exists (select 1 from vault.secrets)
     or not exists (select 1 from public.marketing_facebook_oauth_sessions where state_hash=decode(repeat('11',32),'hex') and status='expired') then
    raise exception 'Restarted Facebook OAuth did not clear prior transient authorization.';
  end if;
end $$;

-- Reconnect once more, then prove an invalid provider token is removed and marked honestly.
set role service_role;
select (public.servsync_private_consume_marketing_facebook_oauth(
  decode(repeat('21',32),'hex'),decode(repeat('22',32),'hex'),'123456789012345'
) ->> 'session_id') as final_session_id \gset
select public.servsync_private_store_marketing_facebook_oauth_result(
  :'final_session_id'::uuid,
  'final-user-access-token-abcdefghijklmnopqrstuvwxyz','9988776655443322',
  '["pages_manage_posts","pages_read_engagement","pages_show_list"]'::jsonb,
  '[{"page_id":"1122334455667788","page_name":"ServSync Test Page","tasks":["CREATE_CONTENT"],"eligible":true}]'::jsonb,
  now()+interval '60 days'
);
select public.servsync_private_complete_marketing_facebook_page(
  :'final_session_id'::uuid,
  '1122334455667788','ServSync Test Page','["CREATE_CONTENT"]'::jsonb,
  'final-page-access-token-abcdefghijklmnopqrstuvwxyz',now()+interval '60 days'
);
select public.servsync_private_fail_marketing_facebook_recheck(
  '00000000-0000-4000-8000-000000000061','provider_auth'
);
reset role;

do $$ begin
  if exists (select 1 from public.marketing_provider_connection_secrets)
     or exists (select 1 from vault.secrets)
     or not exists (
       select 1 from public.marketing_provider_connections
       where provider='facebook' and connection_status='error' and readiness_status='reconnect_required'
         and destination_key is null and capabilities->>'publishing_enabled'='false'
     ) then raise exception 'Facebook reconnect-required cleanup mismatch.'; end if;
  if (select count(*) from public.marketing_publications) <> (select publication_count from facebook_baseline)
     or (select count(*) from public.marketing_publication_events) <> (select event_count from facebook_baseline) then
    raise exception 'Facebook connection workflow changed historical publication state.';
  end if;
end $$;
