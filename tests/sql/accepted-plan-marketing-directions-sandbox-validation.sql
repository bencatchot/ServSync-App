do $$
declare
  v_function regprocedure;
begin
  if (select count(*) from public.marketing_directions) <> 0
     or (select count(*) from public.marketing_direction_revisions) <> 0 then
    raise exception 'Sandbox Marketing Direction baseline is not empty.';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('marketing_directions', 'marketing_direction_revisions')
       and (pg_get_userbyid(c.relowner) <> 'postgres' or not c.relrowsecurity or not c.relforcerowsecurity)
  ) or exists (
    select 1 from pg_policy where polrelid in (
      'public.marketing_directions'::regclass,
      'public.marketing_direction_revisions'::regclass
    )
  ) or exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('marketing_directions', 'marketing_direction_revisions')
       and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Sandbox Marketing Direction table security mismatch.';
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
      raise exception 'Sandbox Marketing Direction RPC security mismatch for %.', v_function;
    end if;
  end loop;
end;
$$;

begin;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where role = 'platform_admin' order by id limit 1),
  true
);
set local role authenticated;

do $$
declare
  v_profile_version bigint;
  v_plan_receipt jsonb;
  v_plan_id uuid;
  v_plan_revision bigint;
  v_direction_receipt jsonb;
  v_direction_id uuid;
  v_state jsonb;
begin
  v_state := public.servsync_get_internal_marketing_planning();
  v_profile_version := (v_state #>> '{profile,profile_version}')::bigint;
  v_plan_receipt := public.servsync_create_internal_marketing_plan_v3(
    '49000000-0000-4000-8000-000000000001', v_profile_version, 'recommended',
    'Rollback-only Direction validation', current_date, current_date + 7, null,
    '[{"audience":"Small contractors","topic":"Invoices","direction":"Explain one invoice interaction after completed service work.","rationale":"Rollback-only current capability validation.","content_roles":["educational_post"]}]'::jsonb,
    3
  );
  v_plan_id := (v_plan_receipt ->> 'plan_id')::uuid;
  v_plan_receipt := public.servsync_accept_internal_marketing_plan(v_plan_id, 1);
  v_plan_revision := (v_plan_receipt ->> 'revision_number')::bigint;

  v_direction_receipt := public.servsync_prepare_internal_marketing_directions(
    '49000000-0000-4000-8000-000000000002', v_plan_id, v_plan_revision,
    'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null,
    '[{"plan_item_index":1,"audience_key":"small_contractors","objective":"Help small contractors understand one current invoice interaction.","statement":"Focus on completed service work becoming an invoice tied to the same customer and service context without promising accounting integration or collection automation.","central_message":"The invoice stays connected to the work it represents.","supporting_points":["Show one completed service visit before the invoice."],"cautions":["Do not imply accounting integration, online processing, or automatic collection."],"corrected_assumptions":[],"recommendation_rationale":"This narrows the accepted invoice item into one grounded and useful contractor story.","truth_capability_keys":["invoices"]}]'::jsonb
  );
  v_direction_id := (v_direction_receipt -> 'direction_ids' ->> 0)::uuid;
  if v_direction_receipt ->> 'direction_count' <> '1'
     or v_direction_receipt ->> 'status' <> 'draft'
     or (v_direction_receipt ->> 'replayed')::boolean then
    raise exception 'Sandbox Marketing Direction preparation mismatch.';
  end if;

  if not (public.servsync_prepare_internal_marketing_directions(
    '49000000-0000-4000-8000-000000000002', v_plan_id, v_plan_revision,
    'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null,
    '[{"plan_item_index":1,"audience_key":"small_contractors","objective":"Help small contractors understand one current invoice interaction.","statement":"Focus on completed service work becoming an invoice tied to the same customer and service context without promising accounting integration or collection automation.","central_message":"The invoice stays connected to the work it represents.","supporting_points":["Show one completed service visit before the invoice."],"cautions":["Do not imply accounting integration, online processing, or automatic collection."],"corrected_assumptions":[],"recommendation_rationale":"This narrows the accepted invoice item into one grounded and useful contractor story.","truth_capability_keys":["invoices"]}]'::jsonb
  ) ->> 'replayed')::boolean then
    raise exception 'Sandbox Marketing Direction replay mismatch.';
  end if;

  perform public.servsync_update_internal_marketing_direction(
    v_direction_id, 1,
    'Help small contractors review one current invoice interaction clearly.',
    'Show completed service work becoming an invoice tied to the same customer and service context, while keeping online processing and accounting integration outside this Direction.',
    'The invoice remains connected to its customer and service context.',
    array['Show one recognizable completed service visit.'],
    array['Do not imply accounting integration or online payment processing.'],
    '[]'::jsonb,
    'This revision stays grounded in the accepted invoice Plan item and the current Truth Pack.'
  );
  perform public.servsync_approve_internal_marketing_direction(v_direction_id, 2);

  v_state := public.servsync_get_internal_marketing_directions();
  if v_state #>> '{accepted_plan,plan_id}' <> v_plan_id::text
     or jsonb_array_length(v_state -> 'directions') <> 1
     or v_state #>> '{directions,0,direction_status}' <> 'approved'
     or v_state #>> '{directions,0,revision_number}' <> '3'
     or v_state #>> '{directions,0,preparation_source}' <> 'codex_assisted' then
    raise exception 'Sandbox Marketing Direction read/approval mismatch.';
  end if;

  begin
    perform public.servsync_update_internal_marketing_direction(
      v_direction_id, 3, 'Approved Directions cannot be changed.',
      'This mutation must fail because approved Marketing Directions are immutable in the bounded v1 workflow.',
      'Approved Directions remain immutable.', array[]::text[], array[]::text[], '[]'::jsonb,
      'This rationale exists only to validate terminal approval behavior.'
    );
    raise exception 'Sandbox approved Direction edit unexpectedly succeeded.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

do $$
begin
  begin
    perform 1 from public.marketing_directions limit 1;
    raise exception 'Sandbox authenticated direct Direction read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;

do $$
begin
  if exists (select 1 from public.marketing_directions)
     or exists (select 1 from public.marketing_direction_revisions)
     or exists (select 1 from public.marketing_plans where client_request_id = '49000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.marketing_plan_revisions revision
       join public.marketing_plans plan on plan.id = revision.plan_id
       where plan.client_request_id = '49000000-0000-4000-8000-000000000001') then
    raise exception 'Sandbox rollback-only Direction validation left residue.';
  end if;
end;
$$;
