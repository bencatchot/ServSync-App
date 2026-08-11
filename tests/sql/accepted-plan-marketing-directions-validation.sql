do $$
declare
  v_function regprocedure;
begin
  if not public.servsync_private_marketing_direction_audience_matches('Small contractors', 'small_contractors')
     or not public.servsync_private_marketing_direction_audience_matches('SMALL CONTRACTORS', 'small_contractors')
     or not public.servsync_private_marketing_direction_audience_matches('Homeowners', 'homeowners')
     or public.servsync_private_marketing_direction_audience_matches('Small contractors', 'homeowners')
     or public.servsync_private_marketing_direction_audience_matches('Unknown audience', 'small_contractors') then
    raise exception 'Marketing Direction audience identity mapping mismatch.';
  end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('marketing_directions', 'marketing_direction_revisions')) <> 2 then
    raise exception 'Marketing Direction relation count mismatch.';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('marketing_directions', 'marketing_direction_revisions')
       and (pg_get_userbyid(c.relowner) <> 'postgres' or not c.relrowsecurity or not c.relforcerowsecurity)
  ) or exists (
    select 1 from pg_policy
     where polrelid in (
       'public.marketing_directions'::regclass,
       'public.marketing_direction_revisions'::regclass
     )
  ) then
    raise exception 'Marketing Direction ownership/RLS contract mismatch.';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('marketing_directions', 'marketing_direction_revisions')
       and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Marketing Direction direct table grant mismatch.';
  end if;

  foreach v_function in array array[
    'public.servsync_get_internal_marketing_directions()'::regprocedure,
    'public.servsync_prepare_internal_marketing_directions(uuid,uuid,bigint,text,text,text,text,jsonb)'::regprocedure,
    'public.servsync_update_internal_marketing_direction(uuid,bigint,text,text,text,text[],text[],jsonb,text)'::regprocedure,
    'public.servsync_approve_internal_marketing_direction(uuid,bigint)'::regprocedure
  ] loop
    if (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef from pg_proc where oid = v_function)
       or not has_function_privilege('authenticated', v_function, 'execute')
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'Marketing Direction RPC security mismatch for %.', v_function;
    end if;
  end loop;

  if (select proconfig from pg_proc where oid = 'public.servsync_prepare_internal_marketing_directions(uuid,uuid,bigint,text,text,text,text,jsonb)'::regprocedure)
       <> array['search_path=pg_catalog, public, auth, extensions']
     or exists (
       select 1 from pg_proc
        where oid in (
          'public.servsync_get_internal_marketing_directions()'::regprocedure,
          'public.servsync_update_internal_marketing_direction(uuid,bigint,text,text,text,text[],text[],jsonb,text)'::regprocedure,
          'public.servsync_approve_internal_marketing_direction(uuid,bigint)'::regprocedure
        )
          and proconfig <> array['search_path=pg_catalog, public, auth']
     ) then
    raise exception 'Marketing Direction RPC search-path contract mismatch.';
  end if;
end;
$$;

begin;

insert into public.profiles (id, role, full_name) values
  ('47000000-0000-4000-8000-000000000001', 'platform_admin', 'Direction Owner'),
  ('47000000-0000-4000-8000-000000000002', 'contractor', 'Direction Contractor'),
  ('47000000-0000-4000-8000-000000000003', 'homeowner', 'Direction Homeowner');

insert into public.contractor_profiles (id)
values ('47000000-0000-4000-8000-000000000010');

insert into public.marketing_workspaces (
  id, workspace_key, workspace_kind, contractor_id, display_name
) values (
  '47000000-0000-4000-8000-000000000011',
  'contractor_direction_fixture',
  'contractor',
  '47000000-0000-4000-8000-000000000010',
  'Future Contractor Direction Fixture'
);

select set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
declare
  v_items jsonb := '[
    {"audience":"Small contractors","topic":"Invoices","direction":"Explain one clear invoice interaction for a completed service visit.","rationale":"Supports contractor growth through a current billing capability.","content_roles":["educational_post"]},
    {"audience":"Small contractors","topic":"Contractor discovery and profiles","direction":"Show one homeowner reviewing a contractor business profile before connecting.","rationale":"Supports contractor discovery without promising lead results.","content_roles":["contractor_benefit"]},
    {"audience":"Small contractors","topic":"Deposits and manual payments","direction":"Explain the deliberate deposit request after an accepted estimate.","rationale":"Highlights a specific current contractor billing action.","content_roles":["feature_highlight"]},
    {"audience":"Homeowners","topic":"Home History","direction":"Show one completed service record remaining organized around a home.","rationale":"Provides one strategically useful homeowner story.","content_roles":["homeowner_benefit"]},
    {"audience":"Small contractors","topic":"Jobs","direction":"Show accepted scope carrying into a job and finalized report.","rationale":"Explains continuity across a current contractor workflow.","content_roles":["problem_solution_post"]},
    {"audience":"Small contractors","topic":"Product demonstrations","direction":"Demonstrate one homeowner request arriving with customer and home context.","rationale":"Creates one narrow visual product demonstration.","content_roles":["short_video_concept"]}
  ]'::jsonb;
  v_directions jsonb;
  v_plan_id uuid;
  v_plan_revision bigint;
  v_receipt jsonb;
  v_direction_id uuid;
  v_state jsonb;
begin
  v_receipt := public.servsync_create_internal_marketing_plan_v3(
    '47000000-0000-4000-8000-000000000020', 1, 'recommended',
    'Accepted Direction source plan', current_date, current_date + 30,
    null, v_items, 3
  );
  v_plan_id := (v_receipt ->> 'plan_id')::uuid;
  v_receipt := public.servsync_accept_internal_marketing_plan(v_plan_id, 1);
  v_plan_revision := (v_receipt ->> 'revision_number')::bigint;

  select jsonb_agg(jsonb_build_object(
    'plan_item_index', ordinality,
    'audience_key', case when item ->> 'audience' = 'Homeowners' then 'homeowners' else 'small_contractors' end,
    'objective', 'Develop one precise, current ServSync story for ' || lower(item ->> 'audience') || ' about ' || lower(item ->> 'topic') || '.',
    'statement', 'Focus this Direction on the accepted ' || (item ->> 'topic') || ' plan item through one concrete current interaction. Keep the story bounded to the accepted intent and avoid expanding it into unrelated capabilities or outcomes.',
    'central_message', 'One clear ' || lower(item ->> 'topic') || ' interaction can make the ServSync story easier to understand.',
    'supporting_points', jsonb_build_array('Use one concrete interaction from the accepted Plan item.'),
    'cautions', jsonb_build_array('Do not add unsupported metrics, guarantees, integrations, or automated outcomes.'),
    'corrected_assumptions', '[]'::jsonb,
    'recommendation_rationale', 'This narrows the accepted Plan item into one grounded story without creating finished copy or repeating another Direction.',
    'truth_capability_keys', case ordinality
      when 1 then '["invoices"]'::jsonb
      when 2 then '["contractor_business_profile"]'::jsonb
      when 3 then '["deposit_and_manual_payments","estimates"]'::jsonb
      when 4 then '["home_history"]'::jsonb
      when 5 then '["estimates","jobs_and_reports"]'::jsonb
      else '["service_requests"]'::jsonb
    end
  ) order by ordinality) into v_directions
    from jsonb_array_elements(v_items) with ordinality as source(item, ordinality);

  v_receipt := public.servsync_prepare_internal_marketing_directions(
    '47000000-0000-4000-8000-000000000100', v_plan_id, v_plan_revision,
    'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null, v_directions
  );

  if v_receipt ->> 'direction_count' <> '6'
     or v_receipt ->> 'status' <> 'draft'
     or (v_receipt ->> 'replayed')::boolean then
    raise exception 'Atomic Marketing Direction preparation contract mismatch.';
  end if;
  v_direction_id := (v_receipt -> 'direction_ids' ->> 0)::uuid;
  v_state := public.servsync_get_internal_marketing_directions();
  if jsonb_array_length(v_state -> 'directions') <> 6
     or exists (
       select 1 from jsonb_array_elements(v_state -> 'directions') item
        where item ->> 'direction_status' <> 'draft'
           or item ->> 'preparation_source' <> 'codex_assisted'
           or (item ->> 'source_plan_id')::uuid <> v_plan_id
     ) then
    raise exception 'Marketing Direction active-plan read contract mismatch.';
  end if;

  v_receipt := public.servsync_prepare_internal_marketing_directions(
    '47000000-0000-4000-8000-000000000100', v_plan_id, v_plan_revision,
    'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null, v_directions
  );
  if not (v_receipt ->> 'replayed')::boolean
     or v_receipt ->> 'direction_count' <> '6' then
    raise exception 'Marketing Direction replay created duplicate state.';
  end if;

  begin
    perform public.servsync_prepare_internal_marketing_directions(
      '47000000-0000-4000-8000-000000000100', v_plan_id, v_plan_revision,
      'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null,
      jsonb_set(v_directions, '{0,central_message}', '"A conflicting replay must never overwrite the first durable Direction package."'::jsonb)
    );
    raise exception 'Conflicting Marketing Direction replay unexpectedly succeeded.';
  exception when unique_violation then null;
  end;

  begin
    perform public.servsync_prepare_internal_marketing_directions(
      '47000000-0000-4000-8000-000000000109', v_plan_id, v_plan_revision,
      'servsync-marketing-truth-v3', 'codex_assisted', 'owner_led',
      'Invented owner input that is not present on the accepted Plan.', v_directions
    );
    raise exception 'Recommended Plan accepted invented owner-led provenance.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.servsync_prepare_internal_marketing_directions(
      '47000000-0000-4000-8000-000000000110', v_plan_id, v_plan_revision,
      'servsync-marketing-truth-v3', 'runtime_ai', 'recommended', null, v_directions
    );
    raise exception 'Unavailable runtime-AI preparation source unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.servsync_prepare_internal_marketing_directions(
      '47000000-0000-4000-8000-000000000101', v_plan_id, v_plan_revision,
      'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null, v_directions
    );
    raise exception 'Second Direction package for one Plan unexpectedly succeeded.';
  exception when unique_violation then null;
  end;

  begin
    perform public.servsync_prepare_internal_marketing_directions(
      '47000000-0000-4000-8000-000000000102', v_plan_id, v_plan_revision - 1,
      'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null, v_directions
    );
    raise exception 'Stale accepted Plan revision unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;

  v_receipt := public.servsync_update_internal_marketing_direction(
    v_direction_id, 1,
    'Help small contractors understand one clear invoice interaction after completed service work.',
    'Focus on a completed service visit becoming an invoice tied to the same customer and work context, keeping the story narrow and avoiding promises about accounting integrations or automatic collections.',
    'The invoice remains connected to the customer and the service work it represents.',
    array['Show the completed service context before the invoice.'],
    array['Do not imply accounting integration or automatic collection.'],
    '[]'::jsonb,
    'This is the clearest bounded version of the accepted invoice idea for the current planning period.'
  );
  if v_receipt ->> 'revision_number' <> '2' then
    raise exception 'Marketing Direction draft revision mismatch.';
  end if;

  begin
    perform public.servsync_update_internal_marketing_direction(
      v_direction_id, 1, 'Stale objective still long enough to reach validation.',
      'This stale update must never overwrite the newer durable Marketing Direction revision in the internal workspace.',
      'A stale write must fail closed.', array[]::text[], array[]::text[], '[]'::jsonb,
      'This rationale exists only to exercise optimistic concurrency safely.'
    );
    raise exception 'Stale Direction update unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;

  v_receipt := public.servsync_approve_internal_marketing_direction(v_direction_id, 2);
  if v_receipt ->> 'status' <> 'approved'
     or v_receipt ->> 'revision_number' <> '3' then
    raise exception 'Marketing Direction approval mismatch.';
  end if;

  begin
    perform public.servsync_update_internal_marketing_direction(
      v_direction_id, 3, 'Approved Direction edit must remain impossible.',
      'An approved Marketing Direction must remain immutable and cannot be silently revised through the draft update RPC.',
      'Approved means immutable in this bounded workflow.', array[]::text[], array[]::text[], '[]'::jsonb,
      'This attempted edit exists only to verify terminal approval behavior.'
    );
    raise exception 'Approved Direction edit unexpectedly succeeded.';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    perform public.servsync_approve_internal_marketing_direction(v_direction_id, 3);
    raise exception 'Repeated Direction approval unexpectedly succeeded.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

do $$
begin
  begin
    perform 1 from public.marketing_directions limit 1;
    raise exception 'Authenticated direct Direction table read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if (select count(*) from public.marketing_directions) <> 6
     or (select count(*) from public.marketing_direction_revisions) <> 8
     or (select count(*) from public.marketing_directions where direction_status = 'approved') <> 1
     or (select count(*) from public.marketing_directions where direction_status = 'draft') <> 5
     or exists (select 1 from public.marketing_content_preparation_packages)
     or exists (select 1 from public.marketing_content_items)
     or exists (select 1 from public.marketing_content_status_events) then
    raise exception 'Marketing Direction workflow created or changed content state.';
  end if;
end;
$$;

insert into public.marketing_plans (
  id, workspace_id, client_request_id, profile_version, plan_mode, plan_status,
  title, planning_start, planning_end, owner_direction, recent_content_context,
  items, revision_number, created_by, accepted_by, accepted_at
) values (
  '47000000-0000-4000-8000-000000000120',
  '47000000-0000-4000-8000-000000000011',
  '47000000-0000-4000-8000-000000000121',
  1, 'recommended', 'accepted', 'Contractor-private accepted plan', current_date,
  current_date + 30, null,
  '{"window_limit":20,"items":[],"recommendation_contract_version":3}'::jsonb,
  '[{"audience":"Small contractors","topic":"Invoices","direction":"Explain one invoice interaction.","rationale":"Contractor-private strategy.","content_roles":["educational_post"]}]'::jsonb,
  2, '47000000-0000-4000-8000-000000000002',
  '47000000-0000-4000-8000-000000000002', now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-000000000002', true);

do $$
begin
  begin
    perform public.servsync_get_internal_marketing_directions();
    raise exception 'Contractor internal Direction read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.servsync_prepare_internal_marketing_directions(
      '47000000-0000-4000-8000-000000000122',
      '47000000-0000-4000-8000-000000000120', 2,
      'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null,
      '[{"plan_item_index":1,"audience_key":"small_contractors","objective":"A valid but forbidden contractor objective.","statement":"This valid but forbidden contractor Direction must never be written into the internal Marketing workspace through another tenant.","central_message":"Cross-workspace preparation remains forbidden.","supporting_points":[],"cautions":[],"corrected_assumptions":[],"recommendation_rationale":"The request exists only to test the cross-workspace authorization boundary.","truth_capability_keys":["invoices"]}]'::jsonb
    );
    raise exception 'Contractor Direction preparation unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-000000000003', true);

do $$
begin
  begin
    perform public.servsync_get_internal_marketing_directions();
    raise exception 'Homeowner internal Direction read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
declare
  v_direction_id uuid;
begin
  select id into v_direction_id from public.marketing_directions limit 1;
  begin
    delete from public.marketing_directions where id = v_direction_id;
    raise exception 'Direction hard delete unexpectedly succeeded.';
  exception when raise_exception then null;
  end;
  begin
    update public.marketing_direction_revisions set created_at = created_at where direction_id = v_direction_id;
    raise exception 'Direction revision mutation unexpectedly succeeded.';
  exception when raise_exception then null;
  end;
  begin
    delete from public.marketing_direction_revisions where direction_id = v_direction_id;
    raise exception 'Direction revision delete unexpectedly succeeded.';
  exception when raise_exception then null;
  end;
end;
$$;

rollback;

do $$
begin
  if exists (select 1 from public.marketing_directions)
     or exists (select 1 from public.marketing_direction_revisions)
     or exists (select 1 from public.profiles where id::text like '47000000-0000-4000-8000-%')
     or exists (select 1 from public.marketing_workspaces where workspace_key = 'contractor_direction_fixture') then
    raise exception 'Marketing Direction rollback-only validation left residue.';
  end if;
end;
$$;
