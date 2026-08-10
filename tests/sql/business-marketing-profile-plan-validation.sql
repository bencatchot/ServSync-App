do $$
declare
  v_function regprocedure;
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in (
         'marketing_business_profiles', 'marketing_business_profile_revisions',
         'marketing_plans', 'marketing_plan_revisions'
       )) <> 4 then
    raise exception 'Business Marketing Profile relation count mismatch.';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
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
    raise exception 'Business Marketing Profile ownership/RLS contract mismatch.';
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
    raise exception 'Business Marketing Profile direct table grant mismatch.';
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
      raise exception 'Business Marketing Profile RPC security mismatch for %.', v_function;
    end if;
  end loop;

  if (select count(*) from public.marketing_business_profiles) <> 1
     or (select count(*) from public.marketing_business_profile_revisions) <> 1
     or exists (select 1 from public.marketing_plans)
     or exists (select 1 from public.marketing_plan_revisions)
     or not exists (
       select 1
         from public.marketing_business_profiles profile
        where profile.id = '00000000-0000-4000-8000-000000000038'
          and profile.workspace_id = '00000000-0000-4000-8000-000000000037'
          and profile.marketing_name = 'ServSync'
          and profile.profile_status = 'ready'
          and profile.profile_version = 1
          and profile.owner_notes like 'ServSync internal strategy is specific%'
     ) then
    raise exception 'Business Marketing Profile bootstrap mismatch.';
  end if;
end;
$$;

begin;

insert into public.profiles (id, role, full_name) values
  ('41000000-0000-4000-8000-000000000001', 'platform_admin', 'Marketing Owner'),
  ('41000000-0000-4000-8000-000000000002', 'contractor', 'Contractor User'),
  ('41000000-0000-4000-8000-000000000003', 'homeowner', 'Homeowner User');

insert into public.contractor_profiles (id) values ('41000000-0000-4000-8000-000000000010');

insert into public.marketing_workspaces (
  id, workspace_key, workspace_kind, contractor_id, display_name
) values (
  '41000000-0000-4000-8000-000000000011',
  'contractor_fixture',
  'contractor',
  '41000000-0000-4000-8000-000000000010',
  'Fixture HVAC'
);

insert into public.marketing_business_profiles (
  id, workspace_id, marketing_name, business_summary, audience_segments,
  service_focus, primary_goal, secondary_goals, geographic_focus, tone_style,
  offers, preferred_channels, emphasized_topics, avoided_topics, owner_notes,
  profile_status, profile_version
) values (
  '41000000-0000-4000-8000-000000000012',
  '41000000-0000-4000-8000-000000000011',
  null,
  'A local HVAC service business serving its own customers.',
  array['Local homeowners'],
  array['HVAC repair', 'Seasonal maintenance'],
  'Generate qualified local service leads.',
  array[]::text[],
  null,
  'Straightforward and local.',
  array[]::text[],
  array['social'],
  array['Seasonal maintenance', 'System replacement education'],
  array['Discount-heavy messaging'],
  '',
  'ready',
  1
);

do $$
begin
  if (select audience_segments from public.marketing_business_profiles where workspace_id = '41000000-0000-4000-8000-000000000011')
       && (select audience_segments from public.marketing_business_profiles where workspace_id = '00000000-0000-4000-8000-000000000037')
     or (select emphasized_topics from public.marketing_business_profiles where workspace_id = '41000000-0000-4000-8000-000000000011')
       && (select emphasized_topics from public.marketing_business_profiles where workspace_id = '00000000-0000-4000-8000-000000000037') then
    raise exception 'ServSync strategy leaked into the contractor profile fixture.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000002', true);
set local role authenticated;

do $$
begin
  begin
    perform public.servsync_get_internal_marketing_planning();
    raise exception 'Contractor internal Marketing planning read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.servsync_create_internal_marketing_plan(
      '41000000-0000-4000-8000-000000000020', 1, 'recommended', 'Forbidden plan',
      current_date, current_date + 30, null,
      '[{"audience":"Local homeowners","topic":"HVAC repair","direction":"Explain HVAC repair clearly.","rationale":"Profile priority.","content_roles":["educational_post"]}]'::jsonb
    );
    raise exception 'Contractor internal Marketing planning mutation unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*) from public.marketing_business_profiles';
    raise exception 'Contractor direct profile read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000003', true);
set local role authenticated;

do $$
begin
  begin
    perform public.servsync_get_internal_marketing_planning();
    raise exception 'Homeowner internal Marketing planning read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
declare
  v_state jsonb;
  v_receipt jsonb;
  v_plan_id uuid;
  v_revision bigint;
  v_items jsonb := '[
    {"audience":"Small contractors","topic":"Estimates and approvals","direction":"Explain estimates and approvals in practical language.","rationale":"This profile priority has not appeared in recent content.","content_roles":["educational_post"]},
    {"audience":"Homeowners","topic":"Home History","direction":"Explain Home History in practical language.","rationale":"Use a separate audience and topic.","content_roles":["homeowner_benefit"]}
  ]'::jsonb;
begin
  v_state := public.servsync_get_internal_marketing_planning();
  if v_state #>> '{profile,workspace_key}' <> 'servsync_internal'
     or v_state #>> '{profile,business_name}' <> 'ServSync'
     or v_state #>> '{profile,profile_version}' <> '1'
     or v_state -> 'plan' <> 'null'::jsonb
     or v_state #>> '{recent_content,item_count}' <> '0' then
    raise exception 'Initial planning read contract mismatch.';
  end if;

  v_receipt := public.servsync_update_internal_marketing_profile(
    1,
    'ServSync helps homeowners and small contractors keep service work organized.',
    array['Small contractors', 'Homeowners'],
    array['Contractor software', 'Homeowner connections'],
    'Increase qualified awareness of ServSync.',
    array['Educate current audiences'],
    null,
    'Practical and approachable.',
    array[]::text[],
    array['social', 'video'],
    array['Estimates and approvals', 'Home History'],
    array['Unsupported claims'],
    'Internal strategy only.'
  );

  if v_receipt ->> 'revision_number' <> '2' then
    raise exception 'Profile revision contract mismatch.';
  end if;

  begin
    perform public.servsync_update_internal_marketing_profile(
      1, 'Stale profile must not save.', array['Small contractors'], array['Software'],
      'Stale goal', array[]::text[], null, 'Plain.', array[]::text[], array['social'],
      array['Estimates'], array[]::text[], ''
    );
    raise exception 'Stale profile update unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;

  begin
    perform public.servsync_create_internal_marketing_plan(
      '41000000-0000-4000-8000-000000000020', 2, 'owner_directed', 'Missing direction',
      current_date, current_date + 30, null, v_items
    );
    raise exception 'Owner-directed plan without direction unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.servsync_create_internal_marketing_plan(
      '41000000-0000-4000-8000-000000000021', 2, 'recommended', 'Unsafe plan',
      current_date, current_date + 30, null,
      '[{"audience":"Small contractors","topic":"Estimates","direction":"ServSync guarantees 50% more leads.","rationale":"Unsafe claim.","content_roles":["educational_post"]}]'::jsonb
    );
    raise exception 'Unsafe plan item unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;

  v_receipt := public.servsync_create_internal_marketing_plan(
    '41000000-0000-4000-8000-000000000022', 2, 'recommended', 'Thirty-day Marketing Plan',
    current_date, current_date + 30, null, v_items
  );
  v_plan_id := (v_receipt ->> 'plan_id')::uuid;
  v_revision := (v_receipt ->> 'revision_number')::bigint;

  if v_revision <> 1 then
    raise exception 'Plan create/revision contract mismatch.';
  end if;

  v_receipt := public.servsync_create_internal_marketing_plan(
    '41000000-0000-4000-8000-000000000022', 2, 'recommended', 'Thirty-day Marketing Plan',
    current_date, current_date + 30, null, v_items
  );
  if (v_receipt ->> 'plan_id')::uuid <> v_plan_id then
    raise exception 'Plan idempotency contract mismatch.';
  end if;

  begin
    perform public.servsync_create_internal_marketing_plan(
      '41000000-0000-4000-8000-000000000022', 2, 'recommended', 'Conflicting replay',
      current_date, current_date + 30, null, v_items
    );
    raise exception 'Conflicting plan replay unexpectedly succeeded.';
  exception when unique_violation then null;
  end;

  v_receipt := public.servsync_update_internal_marketing_plan(
    v_plan_id, v_revision, 'Edited Thirty-day Marketing Plan', current_date, current_date + 30, null,
    jsonb_set(v_items, '{0,direction}', '"Give small contractors a concise explanation of estimates and approvals."'::jsonb)
  );
  v_revision := (v_receipt ->> 'revision_number')::bigint;
  if v_revision <> 2 then
    raise exception 'Plan edit revision contract mismatch.';
  end if;

  begin
    perform public.servsync_update_internal_marketing_plan(
      v_plan_id, 1, 'Stale edit', current_date, current_date + 30, null, v_items
    );
    raise exception 'Stale plan update unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;

  v_receipt := public.servsync_accept_internal_marketing_plan(v_plan_id, v_revision);
  v_revision := (v_receipt ->> 'revision_number')::bigint;
  if v_revision <> 3 then
    raise exception 'Plan acceptance contract mismatch.';
  end if;

  begin
    perform public.servsync_update_internal_marketing_plan(
      v_plan_id, v_revision, 'Accepted edit', current_date, current_date + 30, null, v_items
    );
    raise exception 'Accepted plan edit unexpectedly succeeded.';
  exception when sqlstate '55000' then null;
  end;

  v_state := public.servsync_get_internal_marketing_planning();
  if v_state #>> '{plan,plan_id}' <> v_plan_id::text
     or v_state #>> '{plan,plan_status}' <> 'accepted'
     or v_state #>> '{plan,profile_version}' <> '2'
     or jsonb_array_length(v_state #> '{plan,items}') <> 2 then
    raise exception 'Accepted plan read contract mismatch.';
  end if;
end;
$$;

reset role;

do $$
begin
  if (select count(*) from public.marketing_business_profile_revisions where profile_id = '00000000-0000-4000-8000-000000000038') <> 2
     or (select count(*) from public.marketing_plans where client_request_id = '41000000-0000-4000-8000-000000000022') <> 1
     or (select count(*)
           from public.marketing_plan_revisions revision
           join public.marketing_plans plan on plan.id = revision.plan_id
          where plan.client_request_id = '41000000-0000-4000-8000-000000000022') <> 3
     or not exists (
       select 1 from public.marketing_plans
        where client_request_id = '41000000-0000-4000-8000-000000000022'
          and plan_status = 'accepted'
          and accepted_at is not null
     ) then
    raise exception 'Marketing planning revision or acceptance persistence mismatch.';
  end if;

  begin
    update public.marketing_business_profile_revisions set profile_version = 99
     where profile_id = '00000000-0000-4000-8000-000000000038';
    raise exception 'Profile revision mutation unexpectedly succeeded.';
  exception when others then
    if sqlerrm not like 'Marketing planning revision history is append-only.%' then raise; end if;
  end;
  begin
    delete from public.marketing_plan_revisions;
    raise exception 'Plan revision deletion unexpectedly succeeded.';
  exception when others then
    if sqlerrm not like 'Marketing planning revision history is append-only.%' then raise; end if;
  end;
end;
$$;

rollback;

do $$
begin
  if (select count(*) from public.marketing_business_profiles) <> 1
     or (select count(*) from public.marketing_business_profile_revisions) <> 1
     or exists (select 1 from public.marketing_plans)
     or exists (select 1 from public.marketing_plan_revisions) then
    raise exception 'Business Marketing Profile rollback validation left residue.';
  end if;
end;
$$;
