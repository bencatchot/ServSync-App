do $$
declare
  v_function regprocedure;
begin
  if (select pg_get_userbyid(c.relowner) <> 'postgres' or not c.relrowsecurity or not c.relforcerowsecurity
        from pg_class c where c.oid = 'public.marketing_content_preparation_packages'::regclass)
     or (select pg_get_userbyid(c.relowner) <> 'postgres' or not c.relrowsecurity or not c.relforcerowsecurity
        from pg_class c where c.oid = 'public.marketing_content_items'::regclass)
     or exists (
       select 1 from pg_policy
        where polrelid in (
          'public.marketing_content_preparation_packages'::regclass,
          'public.marketing_content_items'::regclass
        )
     ) then
    raise exception 'Approved-Direction ownership/RLS contract mismatch.';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('marketing_content_preparation_packages', 'marketing_content_items')
       and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Approved-Direction direct table grant mismatch.';
  end if;

  foreach v_function in array array[
    'public.servsync_list_internal_marketing_content(text)'::regprocedure,
    'public.servsync_ingest_internal_marketing_direction_package(uuid,uuid,bigint,text,text,jsonb)'::regprocedure
  ] loop
    if (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef from pg_proc where oid = v_function)
       or not has_function_privilege('authenticated', v_function, 'execute')
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'Approved-Direction RPC security mismatch for %.', v_function;
    end if;
  end loop;

  if (select proconfig from pg_proc where oid = 'public.servsync_ingest_internal_marketing_direction_package(uuid,uuid,bigint,text,text,jsonb)'::regprocedure)
       <> array['search_path=pg_catalog, public, auth, extensions']
     or (select proconfig from pg_proc where oid = 'public.servsync_list_internal_marketing_content(text)'::regprocedure)
       <> array['search_path=pg_catalog, public, auth'] then
    raise exception 'Approved-Direction fixed search-path contract mismatch.';
  end if;

  if (select count(*) from public.marketing_content_preparation_packages where strategic_source is not null) <> 0
     or (select count(*) from public.marketing_content_items where source_direction_id is not null) <> 0
     or (select count(*) from public.marketing_content_preparation_packages) <> 1
     or (select count(*) from public.marketing_content_items) <> 1
     or (select count(*) from public.marketing_content_status_events) <> 1 then
    raise exception 'Historical package compatibility baseline mismatch.';
  end if;
end;
$$;

begin;

insert into public.contractor_profiles (id)
values ('52000000-0000-4000-8000-000000000020');
insert into public.marketing_workspaces (
  id, workspace_key, workspace_kind, contractor_id, display_name
) values (
  '52000000-0000-4000-8000-000000000021',
  'contractor_direction_content_fixture', 'contractor',
  '52000000-0000-4000-8000-000000000020', 'Contractor Direction Content Fixture'
);

select set_config('request.jwt.claim.sub', '52000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_plan_items jsonb := '[
    {"audience":"Small contractors","topic":"Invoices","direction":"Explain one invoice interaction after completed work.","rationale":"A precise contractor-growth story.","content_roles":["contractor_benefit"]},
    {"audience":"Homeowners","topic":"Contractor discovery and profiles","direction":"Show useful profile details before a connection request.","rationale":"A grounded homeowner discovery story.","content_roles":["local_contractor_connection"]},
    {"audience":"Small contractors","topic":"Deposits and manual payments","direction":"Explain the deliberate deposit request and offline payment record.","rationale":"A bounded billing interaction.","content_roles":["feature_highlight"]},
    {"audience":"Homeowners","topic":"Home History","direction":"Show a homeowner reopening one finalized report later.","rationale":"One useful homeowner record story.","content_roles":["homeowner_benefit"]},
    {"audience":"Small contractors","topic":"Jobs","direction":"Show agreed scope becoming a job and finalized work documentation.","rationale":"A concrete contractor continuity story.","content_roles":["problem_solution_post"]},
    {"audience":"Small contractors","topic":"Product demonstrations","direction":"Show one service request tied to the relevant customer and home.","rationale":"A deliberately bounded product demo.","content_roles":["short_video_concept"]}
  ]'::jsonb;
  v_direction_input jsonb;
  v_content_input jsonb;
  v_plan_id uuid;
  v_plan_revision bigint;
  v_receipt jsonb;
  v_package_id uuid;
  v_direction_ids jsonb;
  v_content_ids jsonb;
  v_direction_fingerprint text;
  v_historical_fingerprint text;
  v_cross_direction uuid;
  v_draft_plan_id uuid;
  v_draft_plan_revision bigint;
  v_draft_direction_ids jsonb;
begin
  v_receipt := public.servsync_create_internal_marketing_plan_v3(
    '52000000-0000-4000-8000-000000000100', 1, 'recommended',
    'Approved Direction content source plan', current_date, current_date + 30,
    null, v_plan_items, 3
  );
  v_plan_id := (v_receipt ->> 'plan_id')::uuid;
  v_receipt := public.servsync_accept_internal_marketing_plan(v_plan_id, 1);
  v_plan_revision := (v_receipt ->> 'revision_number')::bigint;

  select jsonb_agg(jsonb_build_object(
    'plan_item_index', ordinality,
    'audience_key', case when item ->> 'audience' = 'Homeowners' then 'homeowners' else 'small_contractors' end,
    'objective', 'Develop one precise current ServSync story about ' || lower(item ->> 'topic') || ' for the accepted audience.',
    'statement', 'Focus this approved Direction on the accepted ' || (item ->> 'topic') || ' item through one concrete current interaction, keeping the story bounded and avoiding unrelated capabilities, unsupported outcomes, metrics, integrations, or automation.',
    'central_message', 'Use one clear ' || lower(item ->> 'topic') || ' interaction that matches current ServSync behavior.',
    'supporting_points', jsonb_build_array('Use one concrete interaction from the accepted Plan item.'),
    'cautions', jsonb_build_array('Do not add unsupported metrics, integrations, or automated outcomes.'),
    'corrected_assumptions', '[]'::jsonb,
    'recommendation_rationale', 'This narrows the accepted Plan item into one grounded story and preserves its planned content role.',
    'truth_capability_keys', case ordinality
      when 1 then '["invoices"]'::jsonb
      when 2 then '["contractor_business_profile"]'::jsonb
      when 3 then '["deposit_and_manual_payments","estimates"]'::jsonb
      when 4 then '["home_history"]'::jsonb
      when 5 then '["jobs_and_reports","estimates"]'::jsonb
      else '["service_requests"]'::jsonb
    end
  ) order by ordinality) into v_direction_input
    from jsonb_array_elements(v_plan_items) with ordinality source(item, ordinality);

  v_receipt := public.servsync_prepare_internal_marketing_directions(
    '52000000-0000-4000-8000-000000000110', v_plan_id, v_plan_revision,
    'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null, v_direction_input
  );
  v_direction_ids := v_receipt -> 'direction_ids';

  for v_direction_ids in select jsonb_array_elements(v_direction_ids) loop
    select public.servsync_approve_internal_marketing_direction(
      (v_direction_ids #>> '{}')::uuid, 1
    ) into v_receipt;
  end loop;

  select md5(jsonb_agg(to_jsonb(direction) order by direction.source_plan_item_index)::text)
    into v_direction_fingerprint
    from public.marketing_directions direction
   where direction.source_plan_id = v_plan_id;
  select md5(concat_ws('|',
    (select md5(jsonb_agg(to_jsonb(package) order by package.id)::text)
       from public.marketing_content_preparation_packages package
      where package.preparation_request_id = '52000000-0000-4000-8000-000000000010'),
    (select md5(jsonb_agg(to_jsonb(item) order by item.id)::text)
       from public.marketing_content_items item
      where item.preparation_package_id = (
        select id from public.marketing_content_preparation_packages
         where preparation_request_id = '52000000-0000-4000-8000-000000000010'
      ))
  )) into v_historical_fingerprint;

  select jsonb_agg(jsonb_build_object(
    'direction_id', direction.id,
    'direction_revision', direction.revision_number,
    'title', case direction.source_plan_item_index
      when 1 then 'An invoice with the work still in view'
      when 2 then 'Useful business details before connecting'
      when 3 then 'Request the deposit when you are ready'
      when 4 then 'The finalized report is there months later'
      when 5 then 'Keep the agreed work with the job'
      else 'Demo: one request, one customer, one home'
    end,
    'content_type', case when direction.content_role = 'short_video_concept' then 'other' else 'social_post' end,
    'body', case direction.source_plan_item_index
      when 1 then 'After the service visit, the invoice remains tied to the customer and the billed work so the charge has clear context.'
      when 2 then 'A homeowner can open a contractor profile, see listed service categories and city and state, then decide whether to request a connection.'
      when 3 then 'After an estimate is accepted, an authorized contractor can deliberately request a deposit, review the draft invoice, and record an offline payment.'
      when 4 then 'Months after completed service work, a homeowner can return to the same home and open an available finalized report to remember what was documented.'
      when 5 then 'Move the agreed scope into the job, complete the work, and finish with the resulting service documentation attached to that job.'
      else 'Show a homeowner choosing one home and sending a service request. Cut to the contractor seeing that request with the relevant customer and home. End there.'
    end,
    'channel_category', 'social',
    'intended_audience', direction.audience_key,
    'content_role', direction.content_role
  ) order by direction.source_plan_item_index) into v_content_input
    from public.marketing_directions direction
   where direction.source_plan_id = v_plan_id;

  v_receipt := public.servsync_ingest_internal_marketing_direction_package(
    '52000000-0000-4000-8000-000000000120', v_plan_id, v_plan_revision,
    'servsync-marketing-truth-v3', 'approved_direction_plan_v1', v_content_input
  );
  v_package_id := (v_receipt ->> 'package_id')::uuid;
  v_content_ids := v_receipt -> 'content_ids';

  if v_receipt ->> 'status' <> 'draft'
     or v_receipt ->> 'strategic_source' <> 'approved_direction'
     or v_receipt ->> 'generator_source' <> 'codex_assisted'
     or v_receipt ->> 'item_count' <> '6'
     or (v_receipt ->> 'replayed')::boolean
     or jsonb_array_length(v_content_ids) <> 6 then
    raise exception 'Approved-Direction package receipt mismatch.';
  end if;

  if (select count(*) from public.marketing_content_items item
       join public.marketing_directions direction on direction.id = item.source_direction_id
      where item.preparation_package_id = v_package_id
        and item.status = 'draft'
        and item.revision_number = 1
        and item.preparation_source = 'codex_assisted'
        and item.source_plan_id = v_plan_id
        and item.source_plan_revision = v_plan_revision
        and item.source_plan_item_index = item.preparation_sequence
        and item.source_direction_revision = direction.revision_number
        and item.content_role = direction.content_role
        and item.intended_audience = direction.audience_key) <> 6
     or (select count(*) from public.marketing_content_status_events event
          where event.content_id in (select jsonb_array_elements_text(v_content_ids)::uuid)
            and event.from_status is null and event.to_status = 'draft' and event.content_revision = 1) <> 6 then
    raise exception 'Approved-Direction draft lineage or initial status history mismatch.';
  end if;

  if exists (
    select 1 from public.servsync_list_internal_marketing_content('draft') item
     where item.content_id in (select jsonb_array_elements_text(v_content_ids)::uuid)
       and (
         item.strategic_source <> 'approved_direction'
         or item.source_plan_id <> v_plan_id
         or item.source_direction_status <> 'approved'
         or item.source_direction_topic is null
       )
  ) or (select count(*) from public.servsync_list_internal_marketing_content('draft') item
         where item.content_id in (select jsonb_array_elements_text(v_content_ids)::uuid)) <> 6 then
    raise exception 'Approved-Direction owner read contract mismatch.';
  end if;

  v_receipt := public.servsync_ingest_internal_marketing_direction_package(
    '52000000-0000-4000-8000-000000000120', v_plan_id, v_plan_revision,
    'servsync-marketing-truth-v3', 'approved_direction_plan_v1', v_content_input
  );
  if not (v_receipt ->> 'replayed')::boolean or v_receipt -> 'content_ids' <> v_content_ids then
    raise exception 'Approved-Direction exact replay is not idempotent.';
  end if;

  begin
    perform public.servsync_ingest_internal_marketing_direction_package(
      '52000000-0000-4000-8000-000000000125', v_plan_id, v_plan_revision,
      'servsync-marketing-truth-v3', 'approved_direction_plan_v1', v_content_input
    );
    raise exception 'Second primary package for the same accepted Plan unexpectedly succeeded.';
  exception when unique_violation then null;
  end;

  begin
    perform public.servsync_ingest_internal_marketing_direction_package(
      '52000000-0000-4000-8000-000000000120', v_plan_id, v_plan_revision,
      'servsync-marketing-truth-v3', 'approved_direction_plan_v1',
      jsonb_set(v_content_input, '{0,title}', '"Conflicting replay title"'::jsonb)
    );
    raise exception 'Conflicting approved-Direction replay unexpectedly succeeded.';
  exception when unique_violation then null;
  end;

  begin
    perform public.servsync_ingest_internal_marketing_direction_package(
      '52000000-0000-4000-8000-000000000121', v_plan_id, v_plan_revision,
      'servsync-marketing-truth-v3', 'approved_direction_plan_v1',
      jsonb_set(v_content_input, '{0,direction_revision}', '1'::jsonb)
    );
    raise exception 'Stale approved Direction revision unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;

  begin
    perform public.servsync_ingest_internal_marketing_direction_package(
      '52000000-0000-4000-8000-000000000122', v_plan_id, v_plan_revision,
      'servsync-marketing-truth-v3', 'approved_direction_plan_v1',
      jsonb_set(v_content_input, '{0,content_role}', '"feature_highlight"'::jsonb)
    );
    raise exception 'Role substitution unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.servsync_ingest_internal_marketing_direction_package(
      '52000000-0000-4000-8000-000000000123', v_plan_id, v_plan_revision,
      'servsync-marketing-truth-v3', 'approved_direction_plan_v1',
      jsonb_set(v_content_input, '{0,body}', '"Guaranteed results for every contractor."'::jsonb)
    );
    raise exception 'Unsafe claim unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;

  if exists (select 1 from public.marketing_content_preparation_packages where preparation_request_id in (
    '52000000-0000-4000-8000-000000000121',
    '52000000-0000-4000-8000-000000000122',
    '52000000-0000-4000-8000-000000000123'
  )) then
    raise exception 'Failed approved-Direction validation left a partial package.';
  end if;

  v_receipt := public.servsync_create_internal_marketing_plan_v3(
    '52000000-0000-4000-8000-000000000130', 1, 'recommended',
    'Draft Direction denial plan', current_date, current_date + 30, null,
    '[{"audience":"Small contractors","topic":"Invoices","direction":"Explain one current invoice interaction.","rationale":"A bounded draft-Direction denial fixture.","content_roles":["educational_post"]}]'::jsonb,
    3
  );
  v_draft_plan_id := (v_receipt ->> 'plan_id')::uuid;
  v_receipt := public.servsync_accept_internal_marketing_plan(v_draft_plan_id, 1);
  v_draft_plan_revision := (v_receipt ->> 'revision_number')::bigint;
  v_receipt := public.servsync_prepare_internal_marketing_directions(
    '52000000-0000-4000-8000-000000000131', v_draft_plan_id, v_draft_plan_revision,
    'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null,
    '[{"plan_item_index":1,"audience_key":"small_contractors","objective":"Explain one current invoice interaction for a small contractor audience.","statement":"Focus this Direction on one invoice tied to the customer and billed work after completed service, without expanding the story into accounting integration, automatic collection, metrics, or unrelated capabilities.","central_message":"The invoice keeps the billed work understandable for the contractor.","supporting_points":["Use one completed-service invoice moment."],"cautions":["Do not imply accounting integration or automatic collection."],"corrected_assumptions":[],"recommendation_rationale":"This is a bounded fixture for proving draft Directions cannot create content.","truth_capability_keys":["invoices"]}]'::jsonb
  );
  v_draft_direction_ids := v_receipt -> 'direction_ids';
  begin
    perform public.servsync_ingest_internal_marketing_direction_package(
      '52000000-0000-4000-8000-000000000132', v_draft_plan_id, v_draft_plan_revision,
      'servsync-marketing-truth-v3', 'approved_direction_plan_v1',
      jsonb_build_array(jsonb_build_object(
        'direction_id', v_draft_direction_ids ->> 0,
        'direction_revision', 1,
        'title', 'A draft Direction is not content authority',
        'content_type', 'social_post',
        'body', 'This fixture must never persist because its source Direction has not been approved.',
        'channel_category', 'social',
        'intended_audience', 'small_contractors',
        'content_role', 'educational_post'
      ))
    );
    raise exception 'Draft Marketing Direction unexpectedly prepared content.';
  exception when object_not_in_prerequisite_state then null;
  end;
  if exists (
    select 1 from public.marketing_content_preparation_packages
     where preparation_request_id = '52000000-0000-4000-8000-000000000132'
  ) then
    raise exception 'Draft-Direction denial left a partial package.';
  end if;

  -- A cross-workspace Direction with otherwise plausible identity must not be usable.
  select gen_random_uuid() into v_cross_direction;
  insert into public.marketing_directions (
    id, workspace_id, preparation_request_id, request_fingerprint_sha256,
    source_plan_id, source_plan_revision, source_plan_item_index, source_plan_item_snapshot,
    direction_mode, owner_input, audience_key, topic, content_role, objective,
    statement, central_message, supporting_points, cautions, corrected_assumptions,
    recommendation_rationale, truth_pack_version, truth_capability_keys,
    preparation_source, direction_status, revision_number, created_by, updated_by,
    approved_by, approved_at
  ) select
    v_cross_direction, '52000000-0000-4000-8000-000000000021', gen_random_uuid(), request_fingerprint_sha256,
    source_plan_id, source_plan_revision, source_plan_item_index, source_plan_item_snapshot,
    direction_mode, owner_input, audience_key, topic, content_role, objective,
    statement, central_message, supporting_points, cautions, corrected_assumptions,
    recommendation_rationale, truth_pack_version, truth_capability_keys,
    preparation_source, direction_status, revision_number, created_by, updated_by,
    approved_by, approved_at
  from public.marketing_directions
  where source_plan_id = v_plan_id and source_plan_item_index = 1;

  begin
    perform public.servsync_ingest_internal_marketing_direction_package(
      '52000000-0000-4000-8000-000000000124', v_plan_id, v_plan_revision,
      'servsync-marketing-truth-v3', 'approved_direction_plan_v1',
      jsonb_set(v_content_input, '{0,direction_id}', to_jsonb(v_cross_direction::text))
    );
    raise exception 'Cross-workspace Direction unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;

  if (select md5(jsonb_agg(to_jsonb(direction) order by direction.source_plan_item_index)::text)
        from public.marketing_directions direction
       where direction.source_plan_id = v_plan_id and direction.workspace_id = (
         select id from public.marketing_workspaces where workspace_key = 'servsync_internal'
       )) <> v_direction_fingerprint then
    raise exception 'Content preparation mutated approved Directions.';
  end if;
  if (select md5(concat_ws('|',
      (select md5(jsonb_agg(to_jsonb(package) order by package.id)::text)
         from public.marketing_content_preparation_packages package
        where package.preparation_request_id = '52000000-0000-4000-8000-000000000010'),
      (select md5(jsonb_agg(to_jsonb(item) order by item.id)::text)
         from public.marketing_content_items item
        where item.preparation_package_id = (
          select id from public.marketing_content_preparation_packages
           where preparation_request_id = '52000000-0000-4000-8000-000000000010'
        ))
    ))) <> v_historical_fingerprint then
    raise exception 'Approved-Direction preparation changed historical package state.';
  end if;

  begin
    update public.marketing_content_items
       set source_direction_revision = source_direction_revision + 1
     where id = (v_content_ids ->> 0)::uuid;
    raise exception 'Prepared content lineage was mutable.';
  exception when raise_exception then
    if sqlerrm <> 'Marketing content preparation lineage is immutable.' then raise; end if;
  end;
end;
$$;

-- Contractor, homeowner, and anonymous callers all fail before any lookup detail.
reset role;
select set_config('request.jwt.claim.sub', '52000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$ begin
  begin
    perform public.servsync_ingest_internal_marketing_direction_package(
      gen_random_uuid(), gen_random_uuid(), 1, 'servsync-marketing-truth-v3',
      'approved_direction_plan_v1', '[]'::jsonb
    );
    raise exception 'Contractor unexpectedly prepared internal Marketing content.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '52000000-0000-4000-8000-000000000003', true);
set local role authenticated;
do $$ begin
  begin
    perform public.servsync_list_internal_marketing_content('all');
    raise exception 'Homeowner unexpectedly read internal Marketing content.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ begin
  begin
    perform public.servsync_ingest_internal_marketing_direction_package(
      gen_random_uuid(), gen_random_uuid(), 1, 'servsync-marketing-truth-v3',
      'approved_direction_plan_v1', '[]'::jsonb
    );
    raise exception 'Anonymous caller unexpectedly prepared internal Marketing content.';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
