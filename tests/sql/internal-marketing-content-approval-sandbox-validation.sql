do $$
declare
  v_function regprocedure;
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in (
         'marketing_workspaces', 'marketing_content_items', 'marketing_content_status_events'
       )) <> 3 then
    raise exception 'Sandbox internal Marketing relation count mismatch.';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('marketing_workspaces', 'marketing_content_items', 'marketing_content_status_events')
       and (pg_get_userbyid(c.relowner) <> 'postgres' or not c.relrowsecurity or not c.relforcerowsecurity)
  ) or exists (
    select 1 from pg_policy
     where polrelid in (
       'public.marketing_workspaces'::regclass,
       'public.marketing_content_items'::regclass,
       'public.marketing_content_status_events'::regclass
     )
  ) then
    raise exception 'Sandbox internal Marketing ownership/RLS contract mismatch.';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('marketing_workspaces', 'marketing_content_items', 'marketing_content_status_events')
       and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Sandbox internal Marketing direct table grant mismatch.';
  end if;

  foreach v_function in array array[
    'public.servsync_list_internal_marketing_content(text)'::regprocedure,
    'public.servsync_create_internal_marketing_content(uuid,text,text,text,text)'::regprocedure,
    'public.servsync_update_internal_marketing_content(uuid,bigint,text,text,text,text)'::regprocedure,
    'public.servsync_transition_internal_marketing_content(uuid,bigint,text,text)'::regprocedure
  ] loop
    if (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef or proconfig <> array['search_path=pg_catalog, public, auth'] from pg_proc where oid = v_function)
       or not has_function_privilege('authenticated', v_function, 'execute')
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'Sandbox internal Marketing RPC security mismatch for %.', v_function;
    end if;
  end loop;

  if (select count(*) from public.marketing_workspaces) <> 1
     or not exists (
       select 1 from public.marketing_workspaces
        where id = '00000000-0000-4000-8000-000000000037'
          and workspace_key = 'servsync_internal'
          and workspace_kind = 'internal'
          and contractor_id is null
     )
     or exists (select 1 from public.marketing_content_items)
     or exists (select 1 from public.marketing_content_status_events) then
    raise exception 'Sandbox internal Marketing baseline is not empty and exact.';
  end if;
end;
$$;

begin;

do $$
declare v_user_id uuid;
begin
  select id into v_user_id from public.profiles where role = 'contractor' order by id limit 1;
  if v_user_id is null then raise exception 'Sandbox contractor validation identity is unavailable.'; end if;
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
end;
$$;
set local role authenticated;

do $$
begin
  begin
    perform public.servsync_list_internal_marketing_content('all');
    raise exception 'Sandbox contractor internal Marketing read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.servsync_create_internal_marketing_content(
      '50000000-0000-4000-8000-000000000001', 'Sandbox unauthorized', 'other', '', null
    );
    raise exception 'Sandbox contractor internal Marketing create unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*) from public.marketing_content_items';
    raise exception 'Sandbox contractor direct Marketing read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
do $$
declare v_user_id uuid;
begin
  select id into v_user_id from public.profiles where role = 'homeowner' order by id limit 1;
  if v_user_id is null then raise exception 'Sandbox homeowner validation identity is unavailable.'; end if;
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
end;
$$;
set local role authenticated;
do $$
begin
  begin
    perform public.servsync_list_internal_marketing_content('all');
    raise exception 'Sandbox homeowner internal Marketing read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
do $$
declare v_user_id uuid;
begin
  select id into v_user_id from public.profiles where role = 'platform_admin' order by id limit 1;
  if v_user_id is null then raise exception 'Sandbox platform-admin validation identity is unavailable.'; end if;
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
end;
$$;
set local role authenticated;

do $$
declare
  v_result jsonb;
  v_id uuid;
  v_revision bigint;
begin
  v_result := public.servsync_create_internal_marketing_content(
    '50000000-0000-4000-8000-000000000002',
    'Sandbox rollback-only content',
    'social_post',
    '',
    'social'
  );
  v_id := (v_result ->> 'content_id')::uuid;
  v_revision := (v_result ->> 'revision_number')::bigint;

  v_result := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'draft', null);
  v_revision := (v_result ->> 'revision_number')::bigint;
  v_result := public.servsync_update_internal_marketing_content(
    v_id, v_revision, 'Sandbox rollback-only content', 'social_post', 'Exact test content.', 'social'
  );
  v_revision := (v_result ->> 'revision_number')::bigint;

  begin
    perform public.servsync_update_internal_marketing_content(
      v_id, v_revision - 1, 'Stale content', 'social_post', 'Stale.', 'social'
    );
    raise exception 'Sandbox stale Marketing edit unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;

  v_result := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'needs_approval', null);
  v_revision := (v_result ->> 'revision_number')::bigint;
  v_result := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'draft', 'Revise the exact test message.');
  v_revision := (v_result ->> 'revision_number')::bigint;
  v_result := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'needs_approval', null);
  v_revision := (v_result ->> 'revision_number')::bigint;
  v_result := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'approved', null);

  if not exists (
    select 1 from public.servsync_list_internal_marketing_content('approved')
     where content_id = v_id
       and status = 'approved'
       and revision_number = (v_result ->> 'revision_number')::bigint
       and reviewed_at is not null
  ) then
    raise exception 'Sandbox approved Marketing read contract mismatch.';
  end if;
end;
$$;

rollback;

do $$
begin
  if exists (select 1 from public.marketing_content_items)
     or exists (select 1 from public.marketing_content_status_events) then
    raise exception 'Sandbox rollback-only Marketing validation left residue.';
  end if;
end;
$$;
