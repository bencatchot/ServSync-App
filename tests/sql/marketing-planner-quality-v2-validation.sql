do $$
declare
  v_function regprocedure := 'public.servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb,bigint)'::regprocedure;
  v_ingest regprocedure := 'public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)'::regprocedure;
begin
  if to_regprocedure('public.servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb)') is not null
     or pg_get_userbyid((select proowner from pg_proc where oid = v_function)) <> 'postgres'
     or not (select prosecdef from pg_proc where oid = v_function)
     or (select proconfig from pg_proc where oid = v_function) <> array['search_path=pg_catalog, public, auth']
     or not has_function_privilege('authenticated', v_function, 'execute')
     or has_function_privilege('anon', v_function, 'execute')
     or has_function_privilege('service_role', v_function, 'execute') then
    raise exception 'Planner v2 RPC security contract mismatch.';
  end if;

  if position('servsync-marketing-truth-v3' in pg_get_functiondef(v_ingest)) = 0
     or position('carpentry_contractors' in pg_get_functiondef(v_ingest)) = 0
     or position('handyman_contractors' in pg_get_constraintdef((
       select oid from pg_constraint
        where conrelid = 'public.marketing_content_items'::regclass
          and conname = 'marketing_content_items_audience_check'
     ))) = 0 then
    raise exception 'Marketing taxonomy v3 persistence contract mismatch.';
  end if;

  if (select count(*) from public.marketing_plans where client_request_id = '45000000-0000-4000-8000-000000000001') <> 1
     or (select recent_content_context ? 'recommendation_contract_version' from public.marketing_plans where client_request_id = '45000000-0000-4000-8000-000000000001')
     or (select count(*) from public.marketing_plan_revisions revision join public.marketing_plans plan on plan.id = revision.plan_id where plan.client_request_id = '45000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Historical planner v1 plan changed during migration.';
  end if;
end;
$$;

begin;

insert into public.profiles (id, role, full_name) values
  ('45000000-0000-4000-8000-000000000010', 'platform_admin', 'Planner v2 Owner'),
  ('45000000-0000-4000-8000-000000000011', 'contractor', 'Planner v2 Contractor'),
  ('45000000-0000-4000-8000-000000000012', 'homeowner', 'Planner v2 Homeowner');

select set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-000000000010', true);

do $$
declare
  v_items jsonb := '[{"audience":"HVAC contractors","topic":"Home History","direction":"Show HVAC contractors how eligible completed work can remain organized around the home.","rationale":"Supports an approved secondary goal; adds another Profile audience; fits an approved channel.","content_roles":["short_video_concept"]}]'::jsonb;
  v_receipt jsonb;
  v_plan_id uuid;
  v_package jsonb;
begin
  v_receipt := public.servsync_create_internal_marketing_plan(
    '45000000-0000-4000-8000-000000000020', 1, 'recommended', 'Planner v2 recommendation',
    current_date, current_date + 30, null, v_items, 2
  );
  v_plan_id := (v_receipt ->> 'plan_id')::uuid;

  if (select recent_content_context ->> 'recommendation_contract_version' from public.marketing_plans where id = v_plan_id) <> '2'
     or (select plan_snapshot #>> '{recent_content_context,recommendation_contract_version}' from public.marketing_plan_revisions where plan_id = v_plan_id) <> '2'
     or (public.servsync_create_internal_marketing_plan(
       '45000000-0000-4000-8000-000000000020', 1, 'recommended', 'Planner v2 recommendation',
       current_date, current_date + 30, null, v_items, 2
     ) ->> 'plan_id')::uuid <> v_plan_id then
    raise exception 'Planner v2 persistence or idempotency mismatch.';
  end if;

  begin
    perform public.servsync_create_internal_marketing_plan(
      '45000000-0000-4000-8000-000000000020', 1, 'recommended', 'Planner v2 recommendation',
      current_date, current_date + 30, null, v_items, 1
    );
    raise exception 'Recommendation-version replay conflict unexpectedly succeeded.';
  exception when unique_violation then null;
  end;

  v_receipt := public.servsync_create_internal_marketing_plan(
    '45000000-0000-4000-8000-000000000021', 1, 'recommended', 'Default historical recommendation',
    current_date, current_date + 30, null, v_items
  );
  if (select recent_content_context ->> 'recommendation_contract_version' from public.marketing_plans where id = (v_receipt ->> 'plan_id')::uuid) <> '1' then
    raise exception 'Omitted planner version did not preserve v1 compatibility.';
  end if;

  begin
    perform public.servsync_create_internal_marketing_plan(
      '45000000-0000-4000-8000-000000000022', 1, 'recommended', 'Unsupported planner version',
      current_date, current_date + 30, null, v_items, 3
    );
    raise exception 'Unsupported planner version unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.servsync_create_internal_marketing_plan(
      '45000000-0000-4000-8000-000000000023', 1, 'owner_directed', 'Owner plan with planner version',
      current_date, current_date + 30, 'Owner direction.', v_items, 2
    );
    raise exception 'Owner-directed plan accepted recommendation metadata.';
  exception when invalid_parameter_value then null;
  end;

  v_package := public.servsync_ingest_internal_marketing_package(
    '45000000-0000-4000-8000-000000000025',
    'contractor_acquisition',
    'servsync-marketing-truth-v3',
    'Introduce one current ServSync workflow to carpentry contractors.',
    '[{"title":"Keep the next carpentry job clear","content_type":"social_post","body":"ServSync can keep a customer request and the work that follows connected.","channel_category":"social","intended_audience":"carpentry_contractors","content_role":"facebook_instagram_post"}]'::jsonb
  );
  if v_package ->> 'item_count' <> '1'
     or not exists (
       select 1
         from public.marketing_content_items item
         join public.marketing_content_preparation_packages package on package.id = item.preparation_package_id
        where package.preparation_request_id = '45000000-0000-4000-8000-000000000025'
          and item.intended_audience = 'carpentry_contractors'
          and item.status = 'draft'
     ) then
    raise exception 'Truth Pack v3 expanded-audience ingestion mismatch.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-000000000011', true);

do $$
begin
  begin
    perform public.servsync_create_internal_marketing_plan(
      '45000000-0000-4000-8000-000000000024', 1, 'recommended', 'Forbidden contractor plan',
      current_date, current_date + 30, null,
      '[{"audience":"Homeowners","topic":"Maintenance","direction":"Explain maintenance clearly.","rationale":"Profile priority.","content_roles":["educational_post"]}]'::jsonb,
      2
    );
    raise exception 'Contractor planner v2 mutation unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;

do $$
begin
  if (select count(*) from public.marketing_plans) <> 1
     or (select count(*) from public.marketing_plan_revisions) <> 1
     or exists (select 1 from public.profiles where id::text like '45000000-%' and id <> '45000000-0000-4000-8000-000000000001') then
    raise exception 'Planner v2 rollback-only validation left residue.';
  end if;
end;
$$;
