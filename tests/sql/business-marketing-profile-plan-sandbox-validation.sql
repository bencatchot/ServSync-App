do $$
declare
  v_function regprocedure;
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in (
         'marketing_business_profiles', 'marketing_business_profile_revisions',
         'marketing_plans', 'marketing_plan_revisions'
       )) <> 4 then
    raise exception 'Sandbox Business Marketing Profile relation count mismatch.';
  end if;

  if exists (
    select 1
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (
         'marketing_business_profiles', 'marketing_business_profile_revisions',
         'marketing_plans', 'marketing_plan_revisions'
       )
       and (pg_get_userbyid(c.relowner) <> 'postgres' or not c.relrowsecurity or not c.relforcerowsecurity)
  ) or exists (
    select 1 from pg_policy
     where polrelid in (
       'public.marketing_business_profiles'::regclass,
       'public.marketing_business_profile_revisions'::regclass,
       'public.marketing_plans'::regclass,
       'public.marketing_plan_revisions'::regclass
     )
  ) then
    raise exception 'Sandbox Business Marketing Profile ownership/RLS mismatch.';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in (
         'marketing_business_profiles', 'marketing_business_profile_revisions',
         'marketing_plans', 'marketing_plan_revisions'
       )
       and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Sandbox Business Marketing Profile direct-table grant mismatch.';
  end if;

  foreach v_function in array array[
    'public.servsync_get_internal_marketing_planning()'::regprocedure,
    'public.servsync_update_internal_marketing_profile(bigint,text,text[],text[],text,text[],text,text,text[],text[],text[],text[],text)'::regprocedure,
    'public.servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb)'::regprocedure,
    'public.servsync_update_internal_marketing_plan(uuid,bigint,text,date,date,text,jsonb)'::regprocedure,
    'public.servsync_accept_internal_marketing_plan(uuid,bigint)'::regprocedure
  ] loop
    if (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef or proconfig <> array['search_path=pg_catalog, public, auth'] from pg_proc where oid = v_function)
       or not has_function_privilege('authenticated', v_function, 'execute')
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'Sandbox Business Marketing Profile RPC security mismatch for %.', v_function;
    end if;
  end loop;

  if (select count(*) from public.marketing_business_profiles) <> 1
     or (select count(*) from public.marketing_business_profile_revisions) <> 1
     or exists (select 1 from public.marketing_plans)
     or exists (select 1 from public.marketing_plan_revisions)
     or not exists (
       select 1 from public.marketing_business_profiles
        where id = '00000000-0000-4000-8000-000000000038'
          and workspace_id = '00000000-0000-4000-8000-000000000037'
          and marketing_name = 'ServSync'
          and profile_status = 'ready'
          and profile_version = 1
     ) then
    raise exception 'Sandbox Business Marketing Profile baseline mismatch.';
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
    perform public.servsync_get_internal_marketing_planning();
    raise exception 'Sandbox contractor planning read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.servsync_accept_internal_marketing_plan('43000000-0000-4000-8000-000000000001', 1);
    raise exception 'Sandbox contractor planning mutation unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*) from public.marketing_business_profiles';
    raise exception 'Sandbox contractor direct profile read unexpectedly succeeded.';
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
    perform public.servsync_get_internal_marketing_planning();
    raise exception 'Sandbox homeowner planning read unexpectedly succeeded.';
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
  v_state jsonb;
  v_receipt jsonb;
  v_plan_id uuid;
  v_revision bigint;
  v_items jsonb := '[{"audience":"Small contractors","topic":"Customer requests","direction":"Explain customer requests in practical language.","rationale":"Profile priority with limited recent repetition.","content_roles":["educational_post"]}]'::jsonb;
begin
  v_state := public.servsync_get_internal_marketing_planning();
  if v_state #>> '{profile,workspace_key}' <> 'servsync_internal'
     or v_state #>> '{profile,profile_version}' <> '1'
     or v_state -> 'plan' <> 'null'::jsonb then
    raise exception 'Sandbox platform-admin planning read mismatch.';
  end if;

  v_receipt := public.servsync_update_internal_marketing_profile(
    1,
    v_state #>> '{profile,business_summary}',
    array(select jsonb_array_elements_text(v_state #> '{profile,audience_segments}')),
    array(select jsonb_array_elements_text(v_state #> '{profile,service_focus}')),
    v_state #>> '{profile,primary_goal}',
    array(select jsonb_array_elements_text(v_state #> '{profile,secondary_goals}')),
    v_state #>> '{profile,geographic_focus}',
    v_state #>> '{profile,tone_style}',
    array(select jsonb_array_elements_text(v_state #> '{profile,offers}')),
    array(select jsonb_array_elements_text(v_state #> '{profile,preferred_channels}')),
    array(select jsonb_array_elements_text(v_state #> '{profile,emphasized_topics}')),
    array(select jsonb_array_elements_text(v_state #> '{profile,avoided_topics}')),
    v_state #>> '{profile,owner_notes}'
  );
  if v_receipt ->> 'revision_number' <> '2' then raise exception 'Sandbox profile update mismatch.'; end if;

  begin
    perform public.servsync_update_internal_marketing_profile(
      1, 'Stale profile.', array['Small contractors'], array['Software'], 'Stale goal',
      array[]::text[], null, 'Plain.', array[]::text[], array['social'], array['Requests'],
      array[]::text[], ''
    );
    raise exception 'Sandbox stale profile update unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;

  v_receipt := public.servsync_create_internal_marketing_plan(
    '43000000-0000-4000-8000-000000000002', 2, 'recommended', 'Sandbox rollback-only plan',
    current_date, current_date + 30, null, v_items
  );
  v_plan_id := (v_receipt ->> 'plan_id')::uuid;
  v_revision := (v_receipt ->> 'revision_number')::bigint;

  if (public.servsync_create_internal_marketing_plan(
    '43000000-0000-4000-8000-000000000002', 2, 'recommended', 'Sandbox rollback-only plan',
    current_date, current_date + 30, null, v_items
  ) ->> 'plan_id')::uuid <> v_plan_id then
    raise exception 'Sandbox plan idempotency mismatch.';
  end if;

  v_receipt := public.servsync_update_internal_marketing_plan(
    v_plan_id, v_revision, 'Sandbox edited plan', current_date, current_date + 30, null,
    jsonb_set(v_items, '{0,direction}', '"Give small contractors a clear explanation of customer requests."'::jsonb)
  );
  v_revision := (v_receipt ->> 'revision_number')::bigint;

  begin
    perform public.servsync_update_internal_marketing_plan(
      v_plan_id, v_revision - 1, 'Sandbox stale plan', current_date, current_date + 30, null, v_items
    );
    raise exception 'Sandbox stale plan update unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;

  v_receipt := public.servsync_accept_internal_marketing_plan(v_plan_id, v_revision);
  v_state := public.servsync_get_internal_marketing_planning();
  if v_state #>> '{plan,plan_id}' <> v_plan_id::text
     or v_state #>> '{plan,plan_status}' <> 'accepted'
     or v_state #>> '{plan,revision_number}' <> '3' then
    raise exception 'Sandbox accepted plan read mismatch.';
  end if;
end;
$$;

rollback;

do $$
begin
  if (select count(*) from public.marketing_business_profiles) <> 1
     or (select count(*) from public.marketing_business_profile_revisions) <> 1
     or exists (select 1 from public.marketing_plans)
     or exists (select 1 from public.marketing_plan_revisions) then
    raise exception 'Sandbox rollback-only planning validation left residue.';
  end if;
end;
$$;
