\set ON_ERROR_STOP on

insert into public.profiles (id, role, full_name) values
  ('10000000-0000-4000-8000-000000000001', 'platform_admin', 'Platform Owner'),
  ('10000000-0000-4000-8000-000000000002', 'contractor', 'Contractor User'),
  ('10000000-0000-4000-8000-000000000003', 'homeowner', 'Homeowner User');

do $$
declare
  v_function regprocedure;
  v_grant_count integer;
begin
  if (select count(*) from public.marketing_workspaces) <> 1
     or not exists (
       select 1 from public.marketing_workspaces
        where id = '00000000-0000-4000-8000-000000000037'
          and workspace_key = 'servsync_internal'
          and workspace_kind = 'internal'
          and contractor_id is null
     ) then
    raise exception 'Internal Marketing workspace seed mismatch.';
  end if;

  if exists (select 1 from public.marketing_content_items)
     or exists (select 1 from public.marketing_content_status_events) then
    raise exception 'Migration created fake Marketing content or activity.';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('marketing_workspaces', 'marketing_content_items', 'marketing_content_status_events')
       and (
         pg_get_userbyid(c.relowner) <> 'postgres'
         or not c.relrowsecurity
         or not c.relforcerowsecurity
       )
  ) then
    raise exception 'Marketing table ownership or forced-RLS mismatch.';
  end if;

  if exists (
    select 1 from pg_policy
     where polrelid in (
       'public.marketing_workspaces'::regclass,
       'public.marketing_content_items'::regclass,
       'public.marketing_content_status_events'::regclass
     )
  ) then
    raise exception 'Private Marketing tables unexpectedly have RLS policies.';
  end if;

  if exists (
    select 1
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('marketing_workspaces', 'marketing_content_items', 'marketing_content_status_events')
       and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Browser or service role has direct Marketing table privileges.';
  end if;

  foreach v_function in array array[
    'public.servsync_list_internal_marketing_content(text)'::regprocedure,
    'public.servsync_create_internal_marketing_content(uuid,text,text,text,text)'::regprocedure,
    'public.servsync_update_internal_marketing_content(uuid,bigint,text,text,text,text)'::regprocedure,
    'public.servsync_transition_internal_marketing_content(uuid,bigint,text,text)'::regprocedure
  ] loop
    if (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef or proconfig <> array['search_path=pg_catalog, public, auth'] from pg_proc where oid = v_function) then
      raise exception 'Marketing RPC security configuration mismatch for %.', v_function;
    end if;
    select count(*) into v_grant_count
      from aclexplode((select proacl from pg_proc where oid = v_function)) acl
     where acl.privilege_type = 'EXECUTE'
       and acl.grantee = (select oid from pg_roles where rolname = 'authenticated');
    if v_grant_count <> 1
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'Marketing RPC grant mismatch for %.', v_function;
    end if;
  end loop;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform public.servsync_list_internal_marketing_content('all');
    raise exception 'Contractor list unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.servsync_create_internal_marketing_content(
      '20000000-0000-4000-8000-000000000001', 'Unauthorized', 'other', '', null
    );
    raise exception 'Contractor create unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*) from public.marketing_content_items';
    raise exception 'Contractor direct table read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
do $$
begin
  begin
    perform public.servsync_list_internal_marketing_content('all');
    raise exception 'Homeowner list unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

do $$
declare
  v_created jsonb;
  v_repeated jsonb;
  v_id uuid;
  v_revision bigint;
begin
  if exists (select 1 from public.servsync_list_internal_marketing_content('all')) then
    raise exception 'Empty Marketing queue is not truthful.';
  end if;

  v_created := public.servsync_create_internal_marketing_content(
    '20000000-0000-4000-8000-000000000001',
    'First content idea',
    'social_post',
    '',
    'social'
  );
  v_repeated := public.servsync_create_internal_marketing_content(
    '20000000-0000-4000-8000-000000000001',
    'First content idea',
    'social_post',
    '',
    'social'
  );
  if v_created <> v_repeated then
    raise exception 'Idempotent create returned a different receipt.';
  end if;

  v_id := (v_created ->> 'content_id')::uuid;
  v_revision := (v_created ->> 'revision_number')::bigint;
  if (v_created ->> 'status') <> 'idea' or v_revision <> 1 then
    raise exception 'Create receipt mismatch.';
  end if;

  begin
    perform public.servsync_create_internal_marketing_content(
      '20000000-0000-4000-8000-000000000001', 'Conflicting retry', 'other', '', null
    );
    raise exception 'Conflicting idempotency retry unexpectedly succeeded.';
  exception when unique_violation then null;
  end;

  begin
    perform public.servsync_transition_internal_marketing_content(v_id, v_revision, 'approved', null);
    raise exception 'Invalid idea-to-approved transition unexpectedly succeeded.';
  exception when object_not_in_prerequisite_state then null;
  end;

  v_created := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'draft', null);
  v_revision := (v_created ->> 'revision_number')::bigint;

  begin
    perform public.servsync_transition_internal_marketing_content(v_id, v_revision, 'needs_approval', null);
    raise exception 'Blank content unexpectedly reached approval.';
  exception when invalid_parameter_value then null;
  end;

  v_created := public.servsync_update_internal_marketing_content(
    v_id, v_revision, 'First content draft', 'social_post', 'Real draft copy.', 'social'
  );
  v_revision := (v_created ->> 'revision_number')::bigint;

  begin
    perform public.servsync_update_internal_marketing_content(
      v_id, v_revision - 1, 'Stale overwrite', 'social_post', 'Stale.', 'social'
    );
    raise exception 'Stale edit unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;

  v_created := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'needs_approval', null);
  v_revision := (v_created ->> 'revision_number')::bigint;

  begin
    perform public.servsync_transition_internal_marketing_content(v_id, v_revision, 'draft', 'x');
    raise exception 'Short return reason unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;

  v_created := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'draft', 'Clarify the opening sentence.');
  v_revision := (v_created ->> 'revision_number')::bigint;
  v_created := public.servsync_update_internal_marketing_content(
    v_id, v_revision, 'First content draft', 'social_post', 'Revised real draft copy.', 'social'
  );
  v_revision := (v_created ->> 'revision_number')::bigint;
  v_created := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'needs_approval', null);
  v_revision := (v_created ->> 'revision_number')::bigint;
  v_created := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'approved', null);
  v_revision := (v_created ->> 'revision_number')::bigint;

  begin
    perform public.servsync_update_internal_marketing_content(
      v_id, v_revision, 'Rewrite approved copy', 'social_post', 'Changed.', 'social'
    );
    raise exception 'Approved content edit unexpectedly succeeded.';
  exception when object_not_in_prerequisite_state then null;
  end;

  if not exists (
    select 1 from public.servsync_list_internal_marketing_content('approved')
     where content_id = v_id
       and title = 'First content draft'
       and body = 'Revised real draft copy.'
       and status = 'approved'
       and reviewed_at is not null
       and reviewed_by = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Approved item read contract mismatch.';
  end if;
end;
$$;

do $$
declare
  v_created jsonb;
  v_id uuid;
  v_revision bigint;
begin
  v_created := public.servsync_create_internal_marketing_content(
    '20000000-0000-4000-8000-000000000002', 'Rejected path', 'website_copy', 'Candidate website copy.', 'website'
  );
  v_id := (v_created ->> 'content_id')::uuid;
  v_revision := (v_created ->> 'revision_number')::bigint;
  v_created := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'draft', null);
  v_revision := (v_created ->> 'revision_number')::bigint;
  v_created := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'needs_approval', null);
  v_revision := (v_created ->> 'revision_number')::bigint;
  v_created := public.servsync_transition_internal_marketing_content(v_id, v_revision, 'rejected', 'Not aligned with the current message.');

  if not exists (
    select 1 from public.servsync_list_internal_marketing_content('rejected')
     where content_id = v_id
       and review_note = 'Not aligned with the current message.'
  ) then
    raise exception 'Rejected item read contract mismatch.';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.servsync_list_internal_marketing_content('published');
    raise exception 'Unknown status filter unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.servsync_create_internal_marketing_content(
      '20000000-0000-4000-8000-000000000003', repeat('x', 161), 'other', '', null
    );
    raise exception 'Oversized title unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.servsync_create_internal_marketing_content(
      '20000000-0000-4000-8000-000000000004', 'Unknown type', 'video', '', null
    );
    raise exception 'Unknown content type unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

reset role;

insert into public.contractor_profiles (id)
values ('30000000-0000-4000-8000-000000000002');

insert into public.marketing_workspaces (
  id, workspace_key, workspace_kind, contractor_id, display_name
) values (
  '30000000-0000-4000-8000-000000000001',
  'contractor_future_test',
  'contractor',
  '30000000-0000-4000-8000-000000000002',
  'Future Contractor Workspace'
);

insert into public.marketing_content_items (
  id, workspace_id, client_request_id, title, content_type, body, status, created_by
) values (
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  'Contractor-private future item',
  'other',
  'Not an internal item.',
  'draft',
  '10000000-0000-4000-8000-000000000002'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

do $$
begin
  if exists (
    select 1 from public.servsync_list_internal_marketing_content('all')
     where title = 'Contractor-private future item'
  ) then
    raise exception 'Cross-workspace item leaked into internal list.';
  end if;

  begin
    perform public.servsync_update_internal_marketing_content(
      '30000000-0000-4000-8000-000000000004', 1, 'Cross-workspace edit', 'other', 'No.', null
    );
    raise exception 'Cross-workspace mutation unexpectedly succeeded.';
  exception when no_data_found then null;
  end;
end;
$$;

reset role;

do $$
begin
  begin
    update public.marketing_content_status_events set reason = 'Rewritten history';
    raise exception 'Status history update unexpectedly succeeded.';
  exception when raise_exception then
    if sqlerrm <> 'Marketing content status history is append-only.' then raise; end if;
  end;
  begin
    delete from public.marketing_content_status_events;
    raise exception 'Status history delete unexpectedly succeeded.';
  exception when raise_exception then
    if sqlerrm <> 'Marketing content status history is append-only.' then raise; end if;
  end;

  if (select count(*) from public.marketing_content_status_events) <> 10 then
    raise exception 'Unexpected immutable status-event count: %.', (select count(*) from public.marketing_content_status_events);
  end if;
end;
$$;

set role service_role;
do $$
begin
  begin
    execute 'select count(*) from public.marketing_content_items';
    raise exception 'service_role direct Marketing read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
