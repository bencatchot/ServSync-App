do $$
declare
  v_v2_function regprocedure := 'public.servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb,bigint)'::regprocedure;
  v_v3_function regprocedure := 'public.servsync_create_internal_marketing_plan_v3(uuid,bigint,text,text,date,date,text,jsonb,bigint)'::regprocedure;
begin
  if pg_get_userbyid((select proowner from pg_proc where oid = v_v3_function)) <> 'postgres'
     or not (select prosecdef from pg_proc where oid = v_v3_function)
     or (select proconfig from pg_proc where oid = v_v3_function) <> array['search_path=pg_catalog, public, auth']
     or not has_function_privilege('authenticated', v_v3_function, 'execute')
     or has_function_privilege('anon', v_v3_function, 'execute')
     or has_function_privilege('service_role', v_v3_function, 'execute') then
    raise exception 'Planner v3 RPC security contract mismatch.';
  end if;

  if position('v_recommendation_version not between 1 and 2' in pg_get_functiondef(v_v2_function)) = 0
     or position('p_recommendation_contract_version <> 3' in pg_get_functiondef(v_v3_function)) = 0 then
    raise exception 'Planner version compatibility contract mismatch.';
  end if;

  if (select count(*) from public.marketing_plans) <> 2
     or (select count(*) from public.marketing_plan_revisions) <> 2
     or (select count(*) from public.marketing_plans where recent_content_context ->> 'recommendation_contract_version' = '2') <> 1
     or (select count(*) from public.marketing_plans where not recent_content_context ? 'recommendation_contract_version') <> 1 then
    raise exception 'Historical planner v1/v2 evidence changed during migration.';
  end if;
end;
$$;

begin;

insert into public.profiles (id, role, full_name) values
  ('45000000-0000-4000-8000-000000000030', 'platform_admin', 'Planner v3 Owner'),
  ('45000000-0000-4000-8000-000000000031', 'contractor', 'Planner v3 Contractor');

select set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-000000000030', true);

do $$
declare
  v_items jsonb := '[{"audience":"Small contractors","topic":"Customer requests","direction":"Show how one customer request stays connected to the service work that follows.","rationale":"Advances the primary contractor-growth goal through a specific Profile priority and a fresh treatment.","content_roles":["problem_solution_post"]}]'::jsonb;
  v_receipt jsonb;
  v_plan_id uuid;
begin
  v_receipt := public.servsync_create_internal_marketing_plan_v3(
    '45000000-0000-4000-8000-000000000040', 1, 'recommended', 'Planner v3 recommendation',
    current_date, current_date + 30, null, v_items, 3
  );
  v_plan_id := (v_receipt ->> 'plan_id')::uuid;

  if (select recent_content_context ->> 'recommendation_contract_version' from public.marketing_plans where id = v_plan_id) <> '3'
     or (select plan_status from public.marketing_plans where id = v_plan_id) <> 'draft'
     or (select accepted_at from public.marketing_plans where id = v_plan_id) is not null
     or (select plan_snapshot #>> '{recent_content_context,recommendation_contract_version}' from public.marketing_plan_revisions where plan_id = v_plan_id) <> '3'
     or (public.servsync_create_internal_marketing_plan_v3(
       '45000000-0000-4000-8000-000000000040', 1, 'recommended', 'Planner v3 recommendation',
       current_date, current_date + 30, null, v_items, 3
     ) ->> 'plan_id')::uuid <> v_plan_id then
    raise exception 'Planner v3 persistence or idempotency mismatch.';
  end if;

  begin
    perform public.servsync_create_internal_marketing_plan_v3(
      '45000000-0000-4000-8000-000000000040', 1, 'recommended', 'Conflicting planner v3 replay',
      current_date, current_date + 30, null, v_items, 3
    );
    raise exception 'Conflicting planner v3 replay unexpectedly succeeded.';
  exception when unique_violation then null;
  end;

  begin
    perform public.servsync_create_internal_marketing_plan_v3(
      '45000000-0000-4000-8000-000000000041', 1, 'recommended', 'Unsupported planner version',
      current_date, current_date + 30, null, v_items, 2
    );
    raise exception 'Planner v3 RPC accepted planner version 2.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.servsync_create_internal_marketing_plan_v3(
      '45000000-0000-4000-8000-000000000042', 1, 'owner_directed', 'Owner plan through v3 RPC',
      current_date, current_date + 30, 'Owner direction.', v_items, 3
    );
    raise exception 'Planner v3 RPC accepted an owner-directed plan.';
  exception when invalid_parameter_value then null;
  end;

  v_receipt := public.servsync_create_internal_marketing_plan(
    '45000000-0000-4000-8000-000000000043', 1, 'recommended', 'Planner v2 compatibility',
    current_date, current_date + 30, null, v_items, 2
  );
  if (select recent_content_context ->> 'recommendation_contract_version' from public.marketing_plans where id = (v_receipt ->> 'plan_id')::uuid) <> '2' then
    raise exception 'Planner v2 compatibility changed.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-000000000031', true);

do $$
begin
  begin
    perform public.servsync_create_internal_marketing_plan_v3(
      '45000000-0000-4000-8000-000000000044', 1, 'recommended', 'Forbidden contractor plan',
      current_date, current_date + 30, null,
      '[{"audience":"Small contractors","topic":"Customer requests","direction":"Explain one current request interaction.","rationale":"Specific planning evidence.","content_roles":["educational_post"]}]'::jsonb,
      3
    );
    raise exception 'Contractor planner v3 mutation unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;

do $$
begin
  if (select count(*) from public.marketing_plans) <> 2
     or (select count(*) from public.marketing_plan_revisions) <> 2
     or exists (select 1 from public.profiles where id in (
       '45000000-0000-4000-8000-000000000030'::uuid,
       '45000000-0000-4000-8000-000000000031'::uuid
     )) then
    raise exception 'Planner v3 rollback-only validation left residue.';
  end if;
end;
$$;
