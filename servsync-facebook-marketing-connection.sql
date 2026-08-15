-- ServSync Facebook Marketing Connection v1.
--
-- Adds a platform-admin-only Meta OAuth/Page-selection workflow backed by
-- Supabase Vault. No provider token is stored in a public table and public
-- Facebook posting remains disabled.

begin;

do $$
declare v_name text;
begin
  if to_regclass('public.marketing_provider_connections') is null
     or to_regclass('public.marketing_publications') is null
     or to_regclass('vault.secrets') is null
     or to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('vault.create_secret(text,text,text,uuid)') is null then
    raise exception 'Missing Facebook Marketing connection prerequisite.';
  end if;
  foreach v_name in array array['marketing_provider_connection_secrets', 'marketing_facebook_oauth_sessions'] loop
    if to_regclass('public.' || v_name) is not null then
      raise exception 'Facebook Marketing connection target public.% already exists.', v_name;
    end if;
  end loop;
end;
$$;

alter table public.marketing_provider_connections
  add column readiness_status text not null default 'setup_required',
  add column provider_app_key text null,
  add column provider_account_key text null,
  add column granted_capabilities jsonb not null default '[]'::jsonb,
  add column token_expires_at timestamptz null,
  add column connected_by uuid null references public.profiles(id) on delete set null,
  add column last_validated_at timestamptz null,
  add column disconnected_at timestamptz null,
  add constraint marketing_provider_connections_readiness_check check (
    readiness_status in (
      'setup_required', 'authorization_pending', 'page_selection_required',
      'ready_except_live_post_verification', 'reconnect_required', 'disconnected', 'error'
    )
  ),
  add constraint marketing_provider_connections_app_key_check check (
    provider_app_key is null or provider_app_key ~ '^[0-9]{3,40}$'
  ),
  add constraint marketing_provider_connections_account_key_check check (
    provider_account_key is null or provider_account_key ~ '^[0-9]{3,80}$'
  ),
  add constraint marketing_provider_connections_grants_check check (jsonb_typeof(granted_capabilities) = 'array');

update public.marketing_provider_connections
set capabilities = capabilities || '{"publishing_enabled":false}'::jsonb;

create table public.marketing_provider_connection_secrets (
  connection_id uuid primary key references public.marketing_provider_connections(id) on delete cascade,
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  provider text not null,
  vault_secret_id uuid not null unique,
  token_kind text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_provider_connection_secrets_provider_check check (provider = 'facebook'),
  constraint marketing_provider_connection_secrets_kind_check check (token_kind = 'page_access_token')
);

create table public.marketing_facebook_oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  connection_id uuid not null references public.marketing_provider_connections(id) on delete cascade,
  state_hash bytea not null unique,
  authorization_code_hash bytea null unique,
  initiated_by uuid not null references public.profiles(id) on delete restrict,
  redirect_uri text not null,
  provider_app_key text not null,
  status text not null default 'pending',
  provider_user_key text null,
  granted_permissions jsonb not null default '[]'::jsonb,
  candidate_pages jsonb not null default '[]'::jsonb,
  user_token_vault_secret_id uuid null unique,
  token_expires_at timestamptz null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  completed_at timestamptz null,
  error_category text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_facebook_oauth_state_hash_check check (octet_length(state_hash) = 32),
  constraint marketing_facebook_oauth_code_hash_check check (authorization_code_hash is null or octet_length(authorization_code_hash) = 32),
  constraint marketing_facebook_oauth_redirect_check check (
    char_length(redirect_uri) between 12 and 500 and redirect_uri ~ '^https://[^[:space:]#]+$'
  ),
  constraint marketing_facebook_oauth_app_check check (provider_app_key ~ '^[0-9]{3,40}$'),
  constraint marketing_facebook_oauth_status_check check (
    status in ('pending', 'callback_received', 'page_selection_required', 'connected', 'failed', 'expired')
  ),
  constraint marketing_facebook_oauth_permissions_check check (jsonb_typeof(granted_permissions) = 'array'),
  constraint marketing_facebook_oauth_pages_check check (jsonb_typeof(candidate_pages) = 'array'),
  constraint marketing_facebook_oauth_expiry_check check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);

create index marketing_facebook_oauth_sessions_workspace_idx
  on public.marketing_facebook_oauth_sessions(workspace_id, created_at desc);

create function public.servsync_private_guard_marketing_provider_connection_secret()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' and (
    new.connection_id is distinct from old.connection_id
    or new.workspace_id is distinct from old.workspace_id
    or new.provider is distinct from old.provider
    or new.vault_secret_id is distinct from old.vault_secret_id
    or new.token_kind is distinct from old.token_kind
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Provider secret identity is immutable.';
  end if;
  return new;
end;
$$;

create trigger marketing_provider_connection_secret_identity
  before update on public.marketing_provider_connection_secrets
  for each row execute function public.servsync_private_guard_marketing_provider_connection_secret();

create function public.servsync_private_guard_marketing_publication_provider_enabled()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from public.marketing_provider_connections connection
    where connection.id = new.provider_connection_id
      and connection.workspace_id = new.workspace_id
      and connection.provider = new.provider
      and connection.connection_status = 'connected'
      and coalesce((connection.capabilities ->> 'publishing_enabled')::boolean, false)
  ) then
    raise exception 'Provider publishing is not enabled.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger marketing_publications_provider_enabled
  before insert on public.marketing_publications
  for each row execute function public.servsync_private_guard_marketing_publication_provider_enabled();

create or replace function public.servsync_claim_due_marketing_publications(p_limit integer default 5)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if p_limit not between 1 and 20 then raise exception 'Invalid worker claim limit.' using errcode='22023'; end if;
  with candidates as (
    select publication.id, publication.status as previous_status
    from public.marketing_publications publication
    join public.marketing_provider_connections connection on connection.id=publication.provider_connection_id
    where connection.connection_status='connected'
      and coalesce((connection.capabilities->>'publishing_enabled')::boolean,false)
      and (
        (publication.status='scheduled' and publication.scheduled_at <= now())
        or (publication.status='publishing' and publication.provider_request_started_at is null
          and publication.publishing_started_at < now() - interval '10 minutes')
      )
    order by publication.scheduled_at,publication.id
    for update of publication skip locked limit p_limit
  ), updated as (
    update public.marketing_publications publication set
      status='publishing', attempt_count=publication.attempt_count+1,
      publishing_started_at=now(), provider_request_started_at=null,
      retry_eligible=false, updated_at=now()
    from candidates where publication.id=candidates.id
    returning publication.*,candidates.previous_status
  ), events as (
    insert into public.marketing_publication_events(
      workspace_id,publication_id,event_sequence,from_status,to_status,
      reason_category,reason_message,attempt_number
    ) select updated.workspace_id,updated.id,
      (select coalesce(max(event_sequence),0)+1 from public.marketing_publication_events where publication_id=updated.id),
      updated.previous_status,'publishing',null,null,updated.attempt_count from updated
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'publication_id',updated.id,'attempt_number',updated.attempt_count,
    'provider',updated.provider,'provider_connection_id',updated.provider_connection_id,
    'destination_key',updated.provider_destination_key,'content_snapshot',updated.content_snapshot
  )),'[]'::jsonb) into v_result from updated;
  return v_result;
end;
$$;

create function public.servsync_begin_internal_marketing_facebook_oauth(
  p_state_hash bytea,
  p_redirect_uri text,
  p_provider_app_key text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth, vault
as $$
declare
  v_workspace_id uuid;
  v_connection public.marketing_provider_connections;
  v_session_id uuid;
  v_old_secret_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if octet_length(p_state_hash) <> 32
     or char_length(p_redirect_uri) not between 12 and 500
     or p_redirect_uri !~ '^https://[^[:space:]#]+$'
     or p_provider_app_key !~ '^[0-9]{3,40}$' then
    raise exception 'Invalid Facebook authorization request.' using errcode = '22023';
  end if;
  select id into v_workspace_id from public.marketing_workspaces
   where workspace_key='servsync_internal' and workspace_kind='internal' and contractor_id is null;
  select * into v_connection from public.marketing_provider_connections
   where workspace_id=v_workspace_id and provider='facebook' for update;
  if v_connection.id is null then raise exception 'Facebook connection is unavailable.' using errcode='P0002'; end if;
  if v_connection.connection_status='connected' then
    raise exception 'Disconnect Facebook before reconnecting or changing Pages.' using errcode='55000';
  end if;
  for v_old_secret_id in
    select user_token_vault_secret_id
    from public.marketing_facebook_oauth_sessions
    where workspace_id=v_workspace_id
      and status in ('pending','callback_received','page_selection_required')
      and user_token_vault_secret_id is not null
  loop
    delete from vault.secrets where id=v_old_secret_id;
  end loop;
  update public.marketing_facebook_oauth_sessions
     set status='expired', candidate_pages='[]'::jsonb,
         user_token_vault_secret_id=null, updated_at=now()
   where workspace_id=v_workspace_id
     and status in ('pending','callback_received','page_selection_required');
  insert into public.marketing_facebook_oauth_sessions(
    workspace_id, connection_id, state_hash, initiated_by, redirect_uri,
    provider_app_key, expires_at
  ) values (
    v_workspace_id, v_connection.id, p_state_hash, auth.uid(), p_redirect_uri,
    p_provider_app_key, now() + interval '10 minutes'
  ) returning id into v_session_id;
  update public.marketing_provider_connections set
    connection_status='setup_required', readiness_status='authorization_pending',
    provider_app_key=p_provider_app_key,
    readiness_note='Facebook authorization is waiting for owner consent.',
    disconnected_at=null, updated_at=now()
  where id=v_connection.id;
  return jsonb_build_object('session_id', v_session_id, 'expires_at', now() + interval '10 minutes');
end;
$$;

create function public.servsync_private_consume_marketing_facebook_oauth(
  p_state_hash bytea,
  p_authorization_code_hash bytea,
  p_provider_app_key text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_session public.marketing_facebook_oauth_sessions;
begin
  if octet_length(p_state_hash) <> 32 or octet_length(p_authorization_code_hash) <> 32 then
    raise exception 'Invalid Facebook callback.' using errcode='22023';
  end if;
  select * into v_session from public.marketing_facebook_oauth_sessions
   where state_hash=p_state_hash for update;
  if v_session.id is null or v_session.status <> 'pending' or v_session.used_at is not null
     or v_session.expires_at <= now() or v_session.provider_app_key <> p_provider_app_key then
    raise exception 'Facebook authorization state is invalid, expired, or already used.' using errcode='22023';
  end if;
  update public.marketing_facebook_oauth_sessions set
    authorization_code_hash=p_authorization_code_hash, status='callback_received',
    used_at=now(), updated_at=now()
  where id=v_session.id;
  return jsonb_build_object(
    'session_id', v_session.id, 'workspace_id', v_session.workspace_id,
    'connection_id', v_session.connection_id, 'redirect_uri', v_session.redirect_uri
  );
exception when unique_violation then
  raise exception 'Facebook authorization code was already used.' using errcode='23505';
end;
$$;

create function public.servsync_private_fail_marketing_facebook_oauth(
  p_state_hash bytea,
  p_error_category text
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_session public.marketing_facebook_oauth_sessions;
begin
  if p_error_category not in ('provider_denied','provider_auth','provider_permission','temporary_provider','invalid_callback') then
    raise exception 'Invalid Facebook authorization failure.' using errcode='22023';
  end if;
  select * into v_session from public.marketing_facebook_oauth_sessions
   where state_hash=p_state_hash and status='pending' and used_at is null and expires_at > now() for update;
  if v_session.id is null then raise exception 'Facebook authorization state is invalid, expired, or already used.' using errcode='22023'; end if;
  update public.marketing_facebook_oauth_sessions set status='failed', used_at=now(),
    error_category=p_error_category, updated_at=now() where id=v_session.id;
  update public.marketing_provider_connections set connection_status='error', readiness_status='error',
    readiness_note='Facebook authorization did not complete. Start a new connection attempt.', updated_at=now()
  where id=v_session.connection_id and connection_status <> 'connected';
end;
$$;

create function public.servsync_private_store_marketing_facebook_oauth_result(
  p_session_id uuid,
  p_user_access_token text,
  p_provider_user_key text,
  p_permissions jsonb,
  p_candidate_pages jsonb,
  p_token_expires_at timestamptz
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_session public.marketing_facebook_oauth_sessions;
  v_secret_id uuid;
  v_page jsonb;
  v_key text;
begin
  if char_length(coalesce(p_user_access_token,'')) < 20 or p_provider_user_key !~ '^[0-9]{3,80}$'
     or jsonb_typeof(p_permissions) <> 'array' or jsonb_typeof(p_candidate_pages) <> 'array'
     or jsonb_array_length(p_candidate_pages) > 100 then
    raise exception 'Invalid Facebook authorization result.' using errcode='22023';
  end if;
  for v_page in select value from jsonb_array_elements(p_candidate_pages) loop
    if jsonb_typeof(v_page) <> 'object'
       or (select count(*) from jsonb_object_keys(v_page)) <> 4
       or not (v_page ?& array['page_id','page_name','tasks','eligible'])
       or jsonb_typeof(v_page->'tasks') <> 'array'
       or jsonb_typeof(v_page->'eligible') <> 'boolean'
       or (v_page->>'page_id') !~ '^[0-9]{3,80}$'
       or char_length(btrim(v_page->>'page_name')) not between 1 and 200 then
      raise exception 'Invalid Facebook Page candidate.' using errcode='22023';
    end if;
    for v_key in select jsonb_object_keys(v_page) loop
      if v_key not in ('page_id','page_name','tasks','eligible') then
        raise exception 'Unsafe Facebook Page candidate.' using errcode='22023';
      end if;
    end loop;
  end loop;
  select * into v_session from public.marketing_facebook_oauth_sessions where id=p_session_id for update;
  if v_session.id is null or v_session.status <> 'callback_received'
     or v_session.expires_at <= now() or v_session.user_token_vault_secret_id is not null then
    raise exception 'Facebook authorization session cannot accept this result.' using errcode='55000';
  end if;
  v_secret_id := vault.create_secret(
    p_user_access_token,
    'servsync-marketing-facebook-user-' || v_session.id::text,
    'Transient ServSync Facebook owner token pending explicit Page selection.'
  );
  update public.marketing_facebook_oauth_sessions set
    status='page_selection_required', provider_user_key=p_provider_user_key,
    granted_permissions=p_permissions, candidate_pages=p_candidate_pages,
    user_token_vault_secret_id=v_secret_id, token_expires_at=p_token_expires_at,
    updated_at=now()
  where id=v_session.id;
  update public.marketing_provider_connections set
    connection_status='setup_required', readiness_status='page_selection_required',
    provider_account_key=p_provider_user_key, granted_capabilities=p_permissions,
    token_expires_at=p_token_expires_at,
    readiness_note='Authorization complete. Choose the ServSync Facebook Page.', updated_at=now()
  where id=v_session.connection_id;
  return jsonb_build_object('session_id',v_session.id,'candidate_count',jsonb_array_length(p_candidate_pages));
end;
$$;

create function public.servsync_private_fail_marketing_facebook_session(
  p_session_id uuid,
  p_error_category text
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, vault
as $$
declare v_session public.marketing_facebook_oauth_sessions;
begin
  if p_error_category not in (
    'provider_auth','provider_permission','rate_limit','content_validation',
    'temporary_provider','provider_uncertain','unsupported','internal'
  ) then raise exception 'Invalid Facebook session failure.' using errcode='22023'; end if;
  select * into v_session from public.marketing_facebook_oauth_sessions where id=p_session_id for update;
  if v_session.id is null or v_session.status not in ('callback_received','page_selection_required') then
    raise exception 'Facebook authorization session cannot be failed.' using errcode='55000';
  end if;
  if v_session.user_token_vault_secret_id is not null then
    delete from vault.secrets where id=v_session.user_token_vault_secret_id;
  end if;
  update public.marketing_facebook_oauth_sessions set
    status='failed', candidate_pages='[]'::jsonb, user_token_vault_secret_id=null,
    error_category=p_error_category, updated_at=now()
  where id=v_session.id;
  update public.marketing_provider_connections set
    connection_status='error', readiness_status=case when p_error_category='provider_auth' then 'reconnect_required' else 'error' end,
    readiness_note='Facebook authorization could not be validated. Start a new connection attempt.', updated_at=now()
  where id=v_session.connection_id and connection_status <> 'connected';
end;
$$;

create function public.servsync_authorize_internal_marketing_facebook_page_selection(
  p_session_id uuid,
  p_page_id text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_workspace_id uuid; v_session public.marketing_facebook_oauth_sessions; v_page jsonb;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Not authorized.' using errcode='42501'; end if;
  select id into v_workspace_id from public.marketing_workspaces where workspace_key='servsync_internal' and workspace_kind='internal' and contractor_id is null;
  select * into v_session from public.marketing_facebook_oauth_sessions
   where id=p_session_id and workspace_id=v_workspace_id and initiated_by=auth.uid()
     and status='page_selection_required' and expires_at > now() for share;
  if v_session.id is null then raise exception 'Facebook Page selection is unavailable.' using errcode='P0002'; end if;
  select value into v_page from jsonb_array_elements(v_session.candidate_pages) where value->>'page_id'=p_page_id;
  if v_page is null or coalesce((v_page->>'eligible')::boolean,false) is not true then
    raise exception 'Select an eligible Page returned by Facebook.' using errcode='22023';
  end if;
  return jsonb_build_object('session_id',v_session.id,'connection_id',v_session.connection_id,'page_id',p_page_id);
end;
$$;

create function public.servsync_private_get_marketing_facebook_session_token(p_session_id uuid)
returns text
language plpgsql security definer
set search_path = pg_catalog, public, vault stable
as $$
declare v_secret text;
begin
  select secret.decrypted_secret into v_secret
  from public.marketing_facebook_oauth_sessions session
  join vault.decrypted_secrets secret on secret.id=session.user_token_vault_secret_id
  where session.id=p_session_id and session.status='page_selection_required' and session.expires_at > now();
  if v_secret is null then raise exception 'Facebook authorization token is unavailable.' using errcode='P0002'; end if;
  return v_secret;
end;
$$;

create function public.servsync_private_complete_marketing_facebook_page(
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
begin
  if p_page_id !~ '^[0-9]{3,80}$' or char_length(btrim(p_page_name)) not between 1 and 200
     or jsonb_typeof(p_page_tasks) <> 'array' or not (p_page_tasks @> '["CREATE_CONTENT"]'::jsonb)
     or char_length(coalesce(p_page_access_token,'')) < 20 then
    raise exception 'Invalid Facebook Page selection result.' using errcode='22023';
  end if;
  select * into v_session from public.marketing_facebook_oauth_sessions where id=p_session_id for update;
  if v_session.id is null or v_session.status <> 'page_selection_required' or v_session.expires_at <= now() then
    raise exception 'Facebook Page selection is unavailable.' using errcode='55000';
  end if;
  select value into v_candidate from jsonb_array_elements(v_session.candidate_pages) where value->>'page_id'=p_page_id;
  if v_candidate is null or coalesce((v_candidate->>'eligible')::boolean,false) is not true then raise exception 'Facebook Page was not authorized.' using errcode='22023'; end if;
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

create function public.servsync_authorize_internal_marketing_facebook_recheck()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth stable
as $$
declare v_connection public.marketing_provider_connections;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Not authorized.' using errcode='42501'; end if;
  select connection.* into v_connection from public.marketing_provider_connections connection
  join public.marketing_workspaces workspace on workspace.id=connection.workspace_id
  where workspace.workspace_key='servsync_internal' and workspace.workspace_kind='internal'
    and connection.provider='facebook' and connection.connection_status='connected';
  if v_connection.id is null then raise exception 'Facebook is not connected.' using errcode='55000'; end if;
  return jsonb_build_object('connection_id',v_connection.id,'page_id',v_connection.destination_key,'page_name',v_connection.destination_label);
end;
$$;

create function public.servsync_private_get_marketing_facebook_page_token(p_connection_id uuid)
returns text
language plpgsql security definer
set search_path = pg_catalog, public, vault stable
as $$
declare v_secret text;
begin
  select secret.decrypted_secret into v_secret
  from public.marketing_provider_connection_secrets reference
  join public.marketing_provider_connections connection on connection.id=reference.connection_id
  join vault.decrypted_secrets secret on secret.id=reference.vault_secret_id
  where reference.connection_id=p_connection_id and connection.connection_status='connected' and reference.provider='facebook';
  if v_secret is null then raise exception 'Facebook Page token is unavailable.' using errcode='P0002'; end if;
  return v_secret;
end;
$$;

create function public.servsync_private_record_marketing_facebook_recheck(
  p_connection_id uuid,
  p_page_id text,
  p_page_name text,
  p_page_tasks jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if jsonb_typeof(p_page_tasks) <> 'array' or not (p_page_tasks @> '["CREATE_CONTENT"]'::jsonb) then
    raise exception 'Invalid Facebook Page capability result.' using errcode='22023';
  end if;
  update public.marketing_provider_connections set
    destination_label=btrim(p_page_name), readiness_status='ready_except_live_post_verification',
    readiness_note='Connected and validated without posting. First live post verification remains owner-gated.',
    last_validated_at=now(), updated_at=now()
  where id=p_connection_id and provider='facebook' and connection_status='connected' and destination_key=p_page_id;
  if not found then raise exception 'Facebook Page identity changed or is unavailable.' using errcode='55000'; end if;
  return jsonb_build_object('connection_id',p_connection_id,'readiness_status','ready_except_live_post_verification');
end;
$$;

create function public.servsync_private_fail_marketing_facebook_recheck(
  p_connection_id uuid,
  p_error_category text
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, vault
as $$
declare v_secret_id uuid;
begin
  if p_error_category not in ('provider_auth','provider_permission') then
    raise exception 'Invalid Facebook recheck failure.' using errcode='22023';
  end if;
  select reference.vault_secret_id into v_secret_id
  from public.marketing_provider_connection_secrets reference
  where reference.connection_id=p_connection_id and reference.provider='facebook'
  for update;
  if v_secret_id is null then raise exception 'Facebook Page token is unavailable.' using errcode='P0002'; end if;
  delete from public.marketing_provider_connection_secrets where connection_id=p_connection_id;
  delete from vault.secrets where id=v_secret_id;
  update public.marketing_provider_connections set
    connection_status='error', readiness_status='reconnect_required',
    destination_key=null, destination_label=null, provider_account_key=null,
    granted_capabilities='[]'::jsonb, token_expires_at=null, connected_by=null,
    connected_at=null, last_validated_at=now(), disconnected_at=now(),
    capabilities='{"text":true,"media":false,"publishing_enabled":false}'::jsonb,
    readiness_note='Facebook authorization is no longer valid. Connect again to authorize a Page.',
    updated_at=now()
  where id=p_connection_id and provider='facebook' and connection_status='connected';
  if not found then raise exception 'Facebook connection is unavailable.' using errcode='P0002'; end if;
end;
$$;

create function public.servsync_disconnect_internal_marketing_facebook()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth, vault
as $$
declare v_connection public.marketing_provider_connections; v_secret_id uuid; v_session_secret_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Not authorized.' using errcode='42501'; end if;
  select connection.* into v_connection from public.marketing_provider_connections connection
  join public.marketing_workspaces workspace on workspace.id=connection.workspace_id
  where workspace.workspace_key='servsync_internal' and workspace.workspace_kind='internal' and connection.provider='facebook'
  for update of connection;
  if v_connection.id is null then raise exception 'Facebook connection is unavailable.' using errcode='P0002'; end if;
  select vault_secret_id into v_secret_id from public.marketing_provider_connection_secrets where connection_id=v_connection.id;
  delete from public.marketing_provider_connection_secrets where connection_id=v_connection.id;
  if v_secret_id is not null then delete from vault.secrets where id=v_secret_id; end if;
  for v_session_secret_id in select user_token_vault_secret_id from public.marketing_facebook_oauth_sessions
    where connection_id=v_connection.id and user_token_vault_secret_id is not null loop
    delete from vault.secrets where id=v_session_secret_id;
  end loop;
  update public.marketing_facebook_oauth_sessions set status=case when status='connected' then status else 'expired' end,
    candidate_pages='[]'::jsonb, user_token_vault_secret_id=null, updated_at=now()
  where connection_id=v_connection.id and status not in ('failed','expired');
  update public.marketing_provider_connections set
    connection_status='disabled', readiness_status='disconnected', destination_key=null, destination_label=null,
    provider_account_key=null, granted_capabilities='[]'::jsonb, token_expires_at=null,
    connected_by=null, connected_at=null, last_validated_at=null, disconnected_at=now(),
    capabilities='{"text":true,"media":false,"publishing_enabled":false}'::jsonb,
    readiness_note='Facebook is disconnected. Connect again to authorize a Page.', updated_at=now()
  where id=v_connection.id;
  return jsonb_build_object('connection_id',v_connection.id,'readiness_status','disconnected');
end;
$$;

create or replace function public.servsync_get_internal_marketing_publishing()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth stable
as $$
declare v_workspace_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Not authorized.' using errcode='42501'; end if;
  select id into v_workspace_id from public.marketing_workspaces where workspace_key='servsync_internal' and workspace_kind='internal' and contractor_id is null;
  return jsonb_build_object(
    'providers', coalesce((select jsonb_agg(jsonb_build_object(
      'connection_id',connection.id,'provider',connection.provider,'priority',connection.priority,
      'connection_status',connection.connection_status,'readiness_status',connection.readiness_status,
      'destination_label',connection.destination_label,'capabilities',connection.capabilities,
      'readiness_note',connection.readiness_note,'connected_at',connection.connected_at,
      'last_validated_at',connection.last_validated_at,'token_expires_at',connection.token_expires_at
    ) order by connection.priority) from public.marketing_provider_connections connection where connection.workspace_id=v_workspace_id),'[]'::jsonb),
    'facebook_setup', coalesce((select jsonb_build_object(
      'session_id',session.id,'status',session.status,'candidate_pages',session.candidate_pages,'expires_at',session.expires_at
    ) from public.marketing_facebook_oauth_sessions session
      where session.workspace_id=v_workspace_id and session.status='page_selection_required' and session.expires_at > now()
      order by session.created_at desc limit 1), 'null'::jsonb),
    'publications', coalesce((select jsonb_agg(jsonb_build_object(
      'publication_id',publication.id,'content_id',publication.content_id,'content_revision',publication.content_revision,
      'content_snapshot',publication.content_snapshot,'provider',publication.provider,'destination_label',publication.provider_destination_label,
      'publication_mode',publication.publication_mode,'scheduled_at',publication.scheduled_at,'status',publication.status,
      'attempt_count',publication.attempt_count,'max_attempts',publication.max_attempts,'retry_eligible',publication.retry_eligible,
      'provider_publication_id',publication.provider_publication_id,'failure_category',publication.failure_category,
      'failure_message',publication.failure_message,'created_at',publication.created_at,
      'publishing_started_at',publication.publishing_started_at,'published_at',publication.published_at,'cancelled_at',publication.cancelled_at
    ) order by publication.created_at desc,publication.id) from public.marketing_publications publication where publication.workspace_id=v_workspace_id),'[]'::jsonb)
  );
end;
$$;

alter table public.marketing_provider_connection_secrets enable row level security;
alter table public.marketing_provider_connection_secrets force row level security;
alter table public.marketing_facebook_oauth_sessions enable row level security;
alter table public.marketing_facebook_oauth_sessions force row level security;

revoke all on table public.marketing_provider_connection_secrets from public, anon, authenticated, service_role;
revoke all on table public.marketing_facebook_oauth_sessions from public, anon, authenticated, service_role;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.servsync_begin_internal_marketing_facebook_oauth(bytea,text,text)',
    'public.servsync_authorize_internal_marketing_facebook_page_selection(uuid,text)',
    'public.servsync_authorize_internal_marketing_facebook_recheck()',
    'public.servsync_disconnect_internal_marketing_facebook()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role',v_signature);
    execute format('grant execute on function %s to authenticated',v_signature);
  end loop;
  foreach v_signature in array array[
    'public.servsync_private_consume_marketing_facebook_oauth(bytea,bytea,text)',
    'public.servsync_private_fail_marketing_facebook_oauth(bytea,text)',
    'public.servsync_private_store_marketing_facebook_oauth_result(uuid,text,text,jsonb,jsonb,timestamptz)',
    'public.servsync_private_fail_marketing_facebook_session(uuid,text)',
    'public.servsync_private_get_marketing_facebook_session_token(uuid)',
    'public.servsync_private_complete_marketing_facebook_page(uuid,text,text,jsonb,text,timestamptz)',
    'public.servsync_private_get_marketing_facebook_page_token(uuid)',
    'public.servsync_private_record_marketing_facebook_recheck(uuid,text,text,jsonb)',
    'public.servsync_private_fail_marketing_facebook_recheck(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role',v_signature);
    execute format('grant execute on function %s to service_role',v_signature);
  end loop;
end;
$$;

alter table public.marketing_provider_connection_secrets owner to postgres;
alter table public.marketing_facebook_oauth_sessions owner to postgres;

commit;
