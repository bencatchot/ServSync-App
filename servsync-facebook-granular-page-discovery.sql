-- ServSync Facebook granular Page discovery correction v1.
--
-- Keeps Page selection bound to the exact provider-authorized candidate while
-- allowing current Meta direct Page resolution, which does not expose `tasks`.

begin;

do $$
declare
  v_complete_definition text;
  v_recheck_definition text;
begin
  if to_regclass('public.marketing_facebook_oauth_sessions') is null
     or to_regclass('public.marketing_provider_connection_secrets') is null
     or to_regprocedure('public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz)') is null
     or to_regprocedure('public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb)') is null then
    raise exception 'Facebook granular Page discovery requires the Facebook Marketing connection foundation.';
  end if;

  select pg_get_functiondef('public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz)'::regprocedure)
    into v_complete_definition;
  select pg_get_functiondef('public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb)'::regprocedure)
    into v_recheck_definition;

  if position('CREATE_CONTENT' in v_complete_definition) = 0
     or position('CREATE_CONTENT' in v_recheck_definition) = 0 then
    raise exception 'Facebook Page capability prerequisite differs or the correction is already installed.';
  end if;
end;
$$;

create or replace function public.servsync_private_complete_marketing_facebook_page(
  p_session_id uuid,
  p_page_id text,
  p_page_name text,
  p_page_tasks jsonb,
  p_page_access_token text,
  p_token_expires_at timestamptz
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_session public.marketing_facebook_oauth_sessions;
  v_candidate jsonb;
  v_secret_id uuid;
  v_old_secret_id uuid;
  v_task jsonb;
begin
  if p_page_id !~ '^[0-9]{3,80}$' or char_length(btrim(p_page_name)) not between 1 and 200
     or jsonb_typeof(p_page_tasks) <> 'array' or jsonb_array_length(p_page_tasks) > 30
     or char_length(coalesce(p_page_access_token,'')) < 20 then
    raise exception 'Invalid Facebook Page selection result.' using errcode='22023';
  end if;
  for v_task in select value from jsonb_array_elements(p_page_tasks) loop
    if jsonb_typeof(v_task) <> 'string' or char_length(v_task #>> '{}') not between 1 and 100 then
      raise exception 'Invalid Facebook Page task result.' using errcode='22023';
    end if;
  end loop;
  select * into v_session from public.marketing_facebook_oauth_sessions where id=p_session_id for update;
  if v_session.id is null or v_session.status <> 'page_selection_required' or v_session.expires_at <= now() then
    raise exception 'Facebook Page selection is unavailable.' using errcode='55000';
  end if;
  select value into v_candidate from jsonb_array_elements(v_session.candidate_pages) where value->>'page_id'=p_page_id;
  if v_candidate is null
     or coalesce((v_candidate->>'eligible')::boolean,false) is not true
     or p_page_tasks is distinct from v_candidate->'tasks' then
    raise exception 'Facebook Page was not authorized.' using errcode='22023';
  end if;
  v_secret_id := vault.create_secret(
    p_page_access_token,
    'servsync-marketing-facebook-page-' || v_session.connection_id::text,
    'ServSync internal Marketing Facebook Page access token.'
  );
  select vault_secret_id into v_old_secret_id from public.marketing_provider_connection_secrets where connection_id=v_session.connection_id;
  delete from public.marketing_provider_connection_secrets where connection_id=v_session.connection_id;
  if v_old_secret_id is not null then delete from vault.secrets where id=v_old_secret_id; end if;
  insert into public.marketing_provider_connection_secrets(connection_id,workspace_id,provider,vault_secret_id,token_kind)
  values(v_session.connection_id,v_session.workspace_id,'facebook',v_secret_id,'page_access_token');
  update public.marketing_provider_connections set
    connection_status='connected', readiness_status='ready_except_live_post_verification',
    destination_key=p_page_id, destination_label=btrim(p_page_name),
    capabilities='{"text":true,"media":false,"publishing_enabled":false}'::jsonb,
    readiness_note='Connected and validated without posting. First live post verification remains owner-gated.',
    token_expires_at=coalesce(p_token_expires_at,v_session.token_expires_at),
    connected_by=v_session.initiated_by, connected_at=now(), last_validated_at=now(),
    disconnected_at=null, updated_at=now()
  where id=v_session.connection_id;
  delete from vault.secrets where id=v_session.user_token_vault_secret_id;
  update public.marketing_facebook_oauth_sessions set
    status='connected', candidate_pages='[]'::jsonb, user_token_vault_secret_id=null,
    completed_at=now(), updated_at=now()
  where id=v_session.id;
  return jsonb_build_object('connection_id',v_session.connection_id,'page_id',p_page_id,'readiness_status','ready_except_live_post_verification');
exception when others then
  if v_secret_id is not null then delete from vault.secrets where id=v_secret_id; end if;
  raise;
end;
$$;

create or replace function public.servsync_private_record_marketing_facebook_recheck(
  p_connection_id uuid,
  p_page_id text,
  p_page_name text,
  p_page_tasks jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_task jsonb;
begin
  if jsonb_typeof(p_page_tasks) <> 'array' or jsonb_array_length(p_page_tasks) > 30 then
    raise exception 'Invalid Facebook Page capability result.' using errcode='22023';
  end if;
  for v_task in select value from jsonb_array_elements(p_page_tasks) loop
    if jsonb_typeof(v_task) <> 'string' or char_length(v_task #>> '{}') not between 1 and 100 then
      raise exception 'Invalid Facebook Page capability result.' using errcode='22023';
    end if;
  end loop;
  update public.marketing_provider_connections set
    destination_label=btrim(p_page_name), readiness_status='ready_except_live_post_verification',
    readiness_note='Connected and validated without posting. First live post verification remains owner-gated.',
    last_validated_at=now(), updated_at=now()
  where id=p_connection_id and provider='facebook' and connection_status='connected' and destination_key=p_page_id;
  if not found then raise exception 'Facebook Page identity changed or is unavailable.' using errcode='55000'; end if;
  return jsonb_build_object('connection_id',p_connection_id,'readiness_status','ready_except_live_post_verification');
end;
$$;

alter function public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz) owner to postgres;
alter function public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb) owner to postgres;

revoke all privileges on function public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz) to service_role;
grant execute on function public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb) to service_role;

do $$
declare
  v_complete_definition text;
  v_recheck_definition text;
begin
  select pg_get_functiondef('public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz)'::regprocedure)
    into v_complete_definition;
  select pg_get_functiondef('public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb)'::regprocedure)
    into v_recheck_definition;

  if position('p_page_tasks is distinct from v_candidate->''tasks''' in v_complete_definition) = 0
     or position('CREATE_CONTENT' in v_complete_definition) <> 0
     or position('CREATE_CONTENT' in v_recheck_definition) <> 0 then
    raise exception 'Facebook granular Page discovery postflight mismatch.';
  end if;
  if (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef
             or proconfig <> array['search_path=pg_catalog, public, vault']
        from pg_proc where oid='public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz)'::regprocedure)
     or (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef
             or proconfig <> array['search_path=pg_catalog, public']
        from pg_proc where oid='public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb)'::regprocedure)
     or has_function_privilege('anon','public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz)','execute')
     or has_function_privilege('authenticated','public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz)','execute')
     or not has_function_privilege('service_role','public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz)','execute')
     or has_function_privilege('anon','public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb)','execute')
     or has_function_privilege('authenticated','public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb)','execute')
     or not has_function_privilege('service_role','public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb)','execute') then
    raise exception 'Facebook granular Page discovery ownership, search path, or grants mismatch.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
