create schema if not exists trade_section_test;

create function trade_section_test.assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'ASSERTION FAILED: %', p_message; end if;
end;
$$;

create function trade_section_test.expect_error(p_sql text, p_fragment text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Expected statement to fail: %', p_sql;
  exception when others then
    if sqlerrm = 'Expected statement to fail: ' || p_sql then raise; end if;
    if position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'Expected error containing "%", got "%".', p_fragment, sqlerrm;
    end if;
  end;
end;
$$;

create function trade_section_test.set_user(p_user_id uuid)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), false);
$$;

grant usage on schema trade_section_test to service_role;
grant execute on all functions in schema trade_section_test to service_role;

do $test$
declare
  v_definition jsonb;
  v_result jsonb;
  v_retry jsonb;
  v_instance_id uuid;
  v_initial_definition jsonb;
  v_initial_hash text;
  v_asset_b uuid;
begin
  perform trade_section_test.assert(
    not exists (select 1 from public.trade_section_instances)
      and not exists (select 1 from public.trade_section_revisions),
    'migration creates no runtime rows'
  );

  select definition_contract into v_definition
    from public.trade_pack_work_type_versions
   where id = '63000000-0000-0000-0000-000000000001';

  perform trade_section_test.assert(
    public.servsync_trade_section_values_are_valid(
      '{"measurement":0,"verified":false,"condition":"ok"}'::jsonb,
      v_definition
    ),
    'zero, false, and absent optional values remain valid'
  );
  perform trade_section_test.assert(
    public.servsync_trade_section_values_are_valid(
      '{"measurement":1.25,"verified":true,"observation":"safe","condition":"review","finding":{"severity":"low","notes":null},"recommendation":"monitor"}'::jsonb,
      v_definition
    ),
    'all supported value families validate'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid('{"verified":true}'::jsonb, v_definition),
    'required values fail closed'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid('{"measurement":"1","verified":true}'::jsonb, v_definition),
    'wrong scalar types fail closed'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid('{"measurement":1,"verified":true,"condition":"unknown"}'::jsonb, v_definition),
    'unknown choice values fail closed'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid('{"measurement":1,"verified":true,"unknown":1}'::jsonb, v_definition),
    'unknown field keys fail closed'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid('{"measurement":1,"verified":true,"__proto__":"x"}'::jsonb, v_definition),
    'unsafe field keys fail closed'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid('{"measurement":1000000000001,"verified":true}'::jsonb, v_definition),
    'oversized numbers fail closed'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid('{"measurement":1.1234567,"verified":true}'::jsonb, v_definition),
    'excess numeric scale fails closed'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid(
      jsonb_build_object('measurement', 1, 'verified', true, 'observation', repeat('x', 2001)),
      v_definition
    ),
    'oversized text fails closed'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid(
      jsonb_build_object('measurement', 1, 'verified', true, 'observation', E'unsafe\ntext'),
      v_definition
    ),
    'control characters fail closed'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid(
      '{"measurement":1,"verified":true,"finding":{"severity":"low","notes":"ok","extra":true}}'::jsonb,
      v_definition
    ),
    'malformed findings fail closed'
  );
  perform trade_section_test.assert(
    not public.servsync_trade_section_values_are_valid(
      jsonb_build_object('measurement', 1, 'verified', true, 'recommendation', repeat('x', 70000)),
      v_definition
    ),
    'oversized payloads fail closed'
  );

  perform trade_section_test.set_user('00000000-0000-0000-0000-000000000005');
  v_result := public.servsync_create_trade_section_instance(
    p_work_draft_id => '70000000-0000-0000-0000-000000000001',
    p_work_type_key => 'fixturetrade.fixture_service',
    p_version_number => 1,
    p_property_asset_id => '50000000-0000-0000-0000-000000000001',
    p_values => '{"measurement":0,"verified":false,"condition":"ok"}'::jsonb,
    p_section_order => 1,
    p_idempotency_key => '80000000-0000-0000-0000-000000000001'
  );
  v_instance_id := (v_result ->> 'id')::uuid;
  v_initial_definition := v_result -> 'definition_snapshot';
  v_initial_hash := v_result ->> 'definition_snapshot_sha256';
  perform trade_section_test.assert((v_result ->> 'current_revision_number')::bigint = 1, 'owner create returns revision one');
  perform trade_section_test.assert(v_result -> 'current_values' -> 'measurement' = '0'::jsonb, 'zero is stored exactly');
  perform trade_section_test.assert(v_result -> 'current_values' -> 'verified' = 'false'::jsonb, 'false is stored exactly');
  perform trade_section_test.assert(not (v_result -> 'current_values' ? 'observation'), 'absent optional values stay absent');
  perform trade_section_test.assert((select count(*) = 1 from public.trade_section_revisions where instance_id = v_instance_id), 'create records an initial full revision');

  v_retry := public.servsync_create_trade_section_instance(
    p_work_draft_id => '70000000-0000-0000-0000-000000000001',
    p_work_type_key => 'fixturetrade.fixture_service',
    p_version_number => 1,
    p_property_asset_id => '50000000-0000-0000-0000-000000000001',
    p_values => '{"measurement":999,"verified":true}'::jsonb,
    p_section_order => 1,
    p_idempotency_key => '80000000-0000-0000-0000-000000000001'
  );
  perform trade_section_test.assert((v_retry ->> 'id')::uuid = v_instance_id, 'idempotent retry returns the original identity');
  perform trade_section_test.assert(v_retry -> 'current_values' -> 'measurement' = '0'::jsonb, 'idempotent retry cannot rewrite values');
  perform trade_section_test.expect_error(
    $$select public.servsync_create_trade_section_instance('70000000-0000-0000-0000-000000000001',null,'fixturetrade.fixture_service',1,'50000000-0000-0000-0000-000000000001','{"measurement":1,"verified":true}'::jsonb,2,'80000000-0000-0000-0000-000000000001')$$,
    'idempotency key conflicts'
  );

  select id into v_asset_b from public.home_assets where name = 'Fixture second-property asset';
  perform trade_section_test.expect_error(
    format($sql$select public.servsync_create_trade_section_instance('70000000-0000-0000-0000-000000000001',null,'fixturetrade.fixture_service',1,%L,'{"measurement":1,"verified":true}'::jsonb,2,'80000000-0000-0000-0000-000000000090')$sql$, v_asset_b),
    'asset is unavailable'
  );
  perform trade_section_test.expect_error(
    $$select public.servsync_create_trade_section_instance('70000000-0000-0000-0000-000000000002',null,'fixturetrade.fixture_service',1,null,'{"measurement":1,"verified":true}'::jsonb,2,'80000000-0000-0000-0000-000000000091')$$,
    'unavailable'
  );
  perform trade_section_test.expect_error(
    $$select public.servsync_create_trade_section_instance('70000000-0000-0000-0000-000000000001',null,'missing.work_type',1,null,'{"measurement":1,"verified":true}'::jsonb,2,'80000000-0000-0000-0000-000000000092')$$,
    'definition is unavailable'
  );
  perform trade_section_test.expect_error(
    $$select public.servsync_create_trade_section_instance('70000000-0000-0000-0000-000000000001',null,'hvac.no_cooling',1,null,'{}'::jsonb,2,'80000000-0000-0000-0000-000000000093')$$,
    'definition is unavailable'
  );

  v_result := public.servsync_update_trade_section_values(
    v_instance_id, 1,
    '{"measurement":2.5,"verified":true,"observation":"checked","condition":"review","finding":{"severity":"high","notes":"reviewed"},"recommendation":"follow up"}'::jsonb
  );
  perform trade_section_test.assert((v_result ->> 'current_revision_number')::bigint = 2, 'value update advances exactly one revision');
  perform trade_section_test.assert(v_result -> 'definition_snapshot' = v_initial_definition, 'definition snapshot remains immutable');
  perform trade_section_test.assert(v_result ->> 'definition_snapshot_sha256' = v_initial_hash, 'definition fingerprint remains immutable');
  perform trade_section_test.expect_error(
    format($sql$select public.servsync_update_trade_section_values(%L,1,'{"measurement":3,"verified":true}'::jsonb)$sql$, v_instance_id),
    'has changed'
  );
  perform trade_section_test.assert(
    (select count(*) = 2 and max(revision_number) = 2 from public.trade_section_revisions where instance_id = v_instance_id),
    'value history is append-only and complete'
  );

  perform trade_section_test.expect_error(
    format('update public.trade_section_instances set current_values = %L::jsonb where id = %L', '{"measurement":4,"verified":true}', v_instance_id),
    'revision must advance exactly once'
  );
  perform trade_section_test.expect_error(
    format('delete from public.trade_section_instances where id = %L', v_instance_id),
    'cannot be hard-deleted'
  );
  perform trade_section_test.expect_error(
    format('update public.trade_section_revisions set values_snapshot = %L::jsonb where instance_id = %L and revision_number = 1', '{}', v_instance_id),
    'append-only and immutable'
  );
  perform trade_section_test.expect_error(
    format('delete from public.trade_section_revisions where instance_id = %L and revision_number = 1', v_instance_id),
    'append-only and immutable'
  );
end;
$test$;

do $roles$
declare
  v_result jsonb;
  v_count bigint;
begin
  perform trade_section_test.set_user('00000000-0000-0000-0000-000000000006');
  v_result := public.servsync_create_trade_section_instance(
    '70000000-0000-0000-0000-000000000001', null, 'fixturetrade.fixture_service', 1, null,
    '{"measurement":6,"verified":true}'::jsonb, 6, '80000000-0000-0000-0000-000000000006'
  );
  perform trade_section_test.assert(v_result ->> 'created_by_user_id' = '00000000-0000-0000-0000-000000000006', 'active admin may create');

  perform trade_section_test.set_user('00000000-0000-0000-0000-000000000007');
  v_result := public.servsync_create_trade_section_instance(
    null, '71000000-0000-0000-0000-000000000004', 'fixturetrade.fixture_service', 1, null,
    '{"measurement":7,"verified":true}'::jsonb, 7, '80000000-0000-0000-0000-000000000007'
  );
  perform trade_section_test.assert(v_result ->> 'created_by_user_id' = '00000000-0000-0000-0000-000000000007', 'office may create');

  perform trade_section_test.set_user('00000000-0000-0000-0000-000000000009');
  select count(*) into v_count from public.servsync_list_trade_section_instances('70000000-0000-0000-0000-000000000001', null);
  perform trade_section_test.assert(v_count >= 2, 'viewer may read exact contractor work history');
  perform trade_section_test.expect_error(
    $$select public.servsync_create_trade_section_instance('70000000-0000-0000-0000-000000000001',null,'fixturetrade.fixture_service',1,null,'{"measurement":9,"verified":true}'::jsonb,9,'80000000-0000-0000-0000-000000000009')$$,
    'unavailable'
  );

  perform trade_section_test.set_user('00000000-0000-0000-0000-000000000008');
  perform trade_section_test.expect_error(
    $$select count(*) from public.servsync_list_trade_section_instances('70000000-0000-0000-0000-000000000001',null)$$,
    'unavailable'
  );
  perform trade_section_test.expect_error(
    $$select public.servsync_create_trade_section_instance('70000000-0000-0000-0000-000000000001',null,'fixturetrade.fixture_service',1,null,'{"measurement":8,"verified":true}'::jsonb,8,'80000000-0000-0000-0000-000000000008')$$,
    'unavailable'
  );

  perform trade_section_test.set_user('00000000-0000-0000-0000-000000000011');
  perform trade_section_test.expect_error(
    $$select count(*) from public.servsync_list_trade_section_instances('70000000-0000-0000-0000-000000000001',null)$$,
    'unavailable'
  );

  perform trade_section_test.set_user('00000000-0000-0000-0000-000000000001');
  perform trade_section_test.expect_error(
    $$select count(*) from public.servsync_list_trade_section_instances('70000000-0000-0000-0000-000000000001',null)$$,
    'unavailable'
  );

  perform trade_section_test.set_user('00000000-0000-0000-0000-000000000010');
  perform trade_section_test.expect_error(
    $$select count(*) from public.servsync_list_trade_section_instances('70000000-0000-0000-0000-000000000001',null)$$,
    'unavailable'
  );
end;
$roles$;

do $lineage$
declare
  v_local_asset_id uuid;
  v_local_instance_id uuid;
  v_local_asset_revision bigint;
  v_result jsonb;
  v_main_id uuid;
begin
  perform trade_section_test.set_user('00000000-0000-0000-0000-000000000005');
  select id, revision_number into v_local_asset_id, v_local_asset_revision
    from public.home_assets where name = 'Fixture local asset';
  v_result := public.servsync_create_trade_section_instance(
    '70000000-0000-0000-0000-000000000003', null, 'fixturetrade.fixture_service', 1,
    v_local_asset_id, '{"measurement":10,"verified":true}'::jsonb, 10,
    '80000000-0000-0000-0000-000000000010'
  );
  v_local_instance_id := (v_result ->> 'id')::uuid;

  update public.contractor_local_contacts
     set homeowner_user_id = '00000000-0000-0000-0000-000000000001', claimed_at = now()
   where id = '40000000-0000-0000-0000-000000000001';
  update public.contractor_local_homes
     set home_id = '10000000-0000-0000-0000-000000000001', claimed_at = now()
   where id = '41000000-0000-0000-0000-000000000001';

  perform trade_section_test.assert(
    (select id = v_local_instance_id
       and home_id = '10000000-0000-0000-0000-000000000001'
       and homeowner_user_id = '00000000-0000-0000-0000-000000000001'
       and property_asset_id = v_local_asset_id
       and property_asset_revision_number = v_local_asset_revision
       and current_revision_number = 2
       from public.trade_section_instances where id = v_local_instance_id),
    'claim maps canonical identity without replacing section or asset snapshot'
  );
  perform trade_section_test.assert(
    (select count(*) = 2 and bool_or(change_kind = 'claim_mapped')
       from public.trade_section_revisions where instance_id = v_local_instance_id),
    'claim mapping appends exact history'
  );
  v_result := public.servsync_update_trade_section_values(
    v_local_instance_id, 2, '{"measurement":11,"verified":true}'::jsonb
  );
  perform trade_section_test.assert((v_result ->> 'current_revision_number')::bigint = 3, 'claimed local lineage remains mutable through canonical access');

  select id into v_main_id from public.trade_section_instances
   where idempotency_key = '80000000-0000-0000-0000-000000000001';

  execute 'set local role service_role';
  perform trade_section_test.expect_error(
    $$update public.contractor_work_drafts
         set launched_estimate_id_snapshot = '72000000-0000-0000-0000-000000000002'
       where id = '70000000-0000-0000-0000-000000000001'$$,
    'Estimate lineage is invalid'
  );
  perform trade_section_test.expect_error(
    $$update public.contractor_work_drafts
         set launched_estimate_id_snapshot = '72000000-0000-0000-0000-000000000003'
       where id = '70000000-0000-0000-0000-000000000001'$$,
    'Estimate lineage is invalid'
  );
  perform trade_section_test.expect_error(
    $$update public.contractor_work_drafts
         set launched_job_id_snapshot = '71000000-0000-0000-0000-000000000002'
       where id = '70000000-0000-0000-0000-000000000001'$$,
    'Job lineage is invalid'
  );
  perform trade_section_test.expect_error(
    $$update public.contractor_work_drafts
         set launched_job_id_snapshot = '71000000-0000-0000-0000-000000000003'
       where id = '70000000-0000-0000-0000-000000000001'$$,
    'Job lineage is invalid'
  );
  execute 'reset role';
  perform trade_section_test.assert(
    (select estimate_id is null and job_id is null from public.trade_section_instances where id = v_main_id),
    'service-role and malformed workflow references cannot link unrelated lineage'
  );

  update public.contractor_work_drafts
     set launched_estimate_id_snapshot = '72000000-0000-0000-0000-000000000001'
   where id = '70000000-0000-0000-0000-000000000001';
  perform trade_section_test.assert(
    (select estimate_id = '72000000-0000-0000-0000-000000000001' from public.trade_section_instances where id = v_main_id),
    'Draft launch preserves section UUID and adds Estimate lineage'
  );
  perform trade_section_test.expect_error(
    $$update public.contractor_work_drafts
         set launched_estimate_id_snapshot = '72000000-0000-0000-0000-000000000004'
       where id = '70000000-0000-0000-0000-000000000001'$$,
    'cannot be rewritten'
  );
  perform trade_section_test.expect_error(
    $$update public.inspections
         set estimate_id = '72000000-0000-0000-0000-000000000001'
       where id = '71000000-0000-0000-0000-000000000002'$$,
    'Job lineage is invalid'
  );
  perform trade_section_test.expect_error(
    $$update public.inspections
         set estimate_id = '72000000-0000-0000-0000-000000000001'
       where id = '71000000-0000-0000-0000-000000000003'$$,
    'Job lineage is invalid'
  );
  update public.inspections
     set estimate_id = '72000000-0000-0000-0000-000000000001'
   where id = '71000000-0000-0000-0000-000000000001';
  perform trade_section_test.assert(
    (select job_id = '71000000-0000-0000-0000-000000000001' from public.trade_section_instances where id = v_main_id),
    'accepted Estimate to Job preserves section UUID and history'
  );
  update public.inspections
     set estimate_id = '72000000-0000-0000-0000-000000000001'
   where id = '71000000-0000-0000-0000-000000000001';
  perform trade_section_test.expect_error(
    $$update public.inspections
         set estimate_id = '72000000-0000-0000-0000-000000000004'
       where id = '71000000-0000-0000-0000-000000000001'$$,
    'cannot be rewritten'
  );
  perform trade_section_test.assert(
    (select bool_and(count_for_kind = 1) from (
      select change_kind, count(*) count_for_kind
        from public.trade_section_revisions
       where instance_id = v_main_id and change_kind in ('estimate_linked', 'job_linked')
       group by change_kind
    ) kinds),
    'workflow links append one revision per transition'
  );
  v_result := public.servsync_create_trade_section_instance(
    '70000000-0000-0000-0000-000000000001', null, 'fixturetrade.fixture_service', 1,
    '50000000-0000-0000-0000-000000000001', '{"measurement":999,"verified":true}'::jsonb,
    1, '80000000-0000-0000-0000-000000000001'
  );
  perform trade_section_test.assert(
    (v_result ->> 'id')::uuid = v_main_id
      and (v_result ->> 'job_id')::uuid = '71000000-0000-0000-0000-000000000001',
    'origin-Draft idempotent retry remains stable after Estimate and Job lineage is added'
  );

  update public.homeowner_contractor_connections set status = 'disconnected'
   where id = '30000000-0000-0000-0000-000000000001';
  perform trade_section_test.expect_error(
    format($sql$select public.servsync_update_trade_section_values(%L,(select current_revision_number from public.trade_section_instances where id=%L),'{"measurement":12,"verified":true}'::jsonb)$sql$, v_local_instance_id, v_local_instance_id),
    'unavailable'
  );
  perform trade_section_test.assert(
    (select count(*) > 0 from public.servsync_list_trade_section_instances('70000000-0000-0000-0000-000000000003', null)),
    'historical exact-work reads survive disconnection'
  );
  update public.homeowner_contractor_connections set status = 'active'
   where id = '30000000-0000-0000-0000-000000000001';

  perform public.servsync_set_property_asset_lifecycle(v_local_asset_id, 2, 'retired', '20000000-0000-0000-0000-000000000001');
  perform trade_section_test.assert(
    (select property_asset_revision_number = v_local_asset_revision from public.trade_section_instances where id = v_local_instance_id),
    'later asset retirement does not rewrite accepted asset revision snapshot'
  );
end;
$lineage$;

do $lifecycle_and_capability$
declare
  v_instance_id uuid;
  v_revision bigint;
  v_result jsonb;
begin
  perform trade_section_test.set_user('00000000-0000-0000-0000-000000000005');
  v_result := public.servsync_create_trade_section_instance(
    null, '71000000-0000-0000-0000-000000000004', 'fixturetrade.fixture_service', 1, null,
    '{"measurement":20,"verified":true}'::jsonb, 20, '80000000-0000-0000-0000-000000000020'
  );
  v_instance_id := (v_result ->> 'id')::uuid;
  v_result := public.servsync_set_trade_section_lifecycle(v_instance_id, 1, 'completed');
  perform trade_section_test.assert(v_result ->> 'lifecycle_status' = 'completed', 'active section may complete');
  perform trade_section_test.expect_error(
    format($sql$select public.servsync_update_trade_section_values(%L,2,'{"measurement":21,"verified":true}'::jsonb)$sql$, v_instance_id),
    'unavailable'
  );
  perform trade_section_test.expect_error(
    format($sql$select public.servsync_set_trade_section_lifecycle(%L,2,'abandoned')$sql$, v_instance_id),
    'unavailable'
  );

  select id, current_revision_number into v_instance_id, v_revision
    from public.trade_section_instances
   where idempotency_key = '80000000-0000-0000-0000-000000000001';
  update public.contractor_trade_pack_capability_grants
     set access_mode = 'completion_only', reason = 'Disposable downgrade test'
   where contractor_id = '20000000-0000-0000-0000-000000000001'
     and capability_id = '61000000-0000-0000-0000-000000000001';
  perform trade_section_test.expect_error(
    $$select public.servsync_create_trade_section_instance(null,'71000000-0000-0000-0000-000000000004','fixturetrade.fixture_service',1,null,'{"measurement":30,"verified":true}'::jsonb,30,'80000000-0000-0000-0000-000000000030')$$,
    'capability is unavailable'
  );
  v_result := public.servsync_update_trade_section_values(v_instance_id, v_revision, '{"measurement":31,"verified":true}'::jsonb);
  perform trade_section_test.assert(v_result -> 'current_values' -> 'measurement' = '31'::jsonb, 'completion-only permits pre-existing active work to continue');
  v_result := public.servsync_set_trade_section_lifecycle(v_instance_id, (v_result ->> 'current_revision_number')::bigint, 'completed');
  perform trade_section_test.assert(v_result ->> 'lifecycle_status' = 'completed', 'completion-only permits existing work to complete');

  update public.contractor_trade_pack_capability_grants
     set access_mode = 'revoked', reason = 'Disposable revocation test'
   where contractor_id = '20000000-0000-0000-0000-000000000001'
     and capability_id = '61000000-0000-0000-0000-000000000001';
  perform trade_section_test.assert(
    (select count(*) > 0 from public.servsync_list_trade_section_instances('70000000-0000-0000-0000-000000000001', null)),
    'revocation does not erase authorized historical reads'
  );
  perform trade_section_test.expect_error(
    $$select public.servsync_create_trade_section_instance(null,'71000000-0000-0000-0000-000000000004','fixturetrade.fixture_service',1,null,'{"measurement":32,"verified":true}'::jsonb,32,'80000000-0000-0000-0000-000000000032')$$,
    'capability is unavailable'
  );
end;
$lifecycle_and_capability$;

do $catalog_security$
declare
  v_authenticated_rpc_count integer;
begin
  perform trade_section_test.assert(
    (select bool_and(relowner = 'postgres'::regrole and relrowsecurity and relforcerowsecurity)
       from pg_class where oid in ('public.trade_section_instances'::regclass, 'public.trade_section_revisions'::regclass)),
    'both durable tables are postgres-owned forced-RLS relations'
  );
  perform trade_section_test.assert(
    not exists (select 1 from pg_policy where polrelid in ('public.trade_section_instances'::regclass, 'public.trade_section_revisions'::regclass)),
    'private durable tables remain policy-free'
  );
  perform trade_section_test.assert(
    not has_table_privilege('anon', 'public.trade_section_instances', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      and not has_table_privilege('authenticated', 'public.trade_section_instances', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      and not has_table_privilege('service_role', 'public.trade_section_instances', 'INSERT,UPDATE,DELETE,TRUNCATE')
      and has_table_privilege('service_role', 'public.trade_section_instances', 'SELECT')
      and not has_table_privilege('service_role', 'public.trade_section_revisions', 'INSERT,UPDATE,DELETE,TRUNCATE')
      and has_table_privilege('service_role', 'public.trade_section_revisions', 'SELECT'),
    'browser roles have no table ACL and canonical service role is read-only'
  );
  perform trade_section_test.assert(
    not exists (
      select 1 from information_schema.column_privileges
       where table_schema = 'public'
         and table_name in ('trade_section_instances', 'trade_section_revisions')
         and grantee in ('anon', 'authenticated')
    ),
    'browser roles have no column grants'
  );
  select count(*) into v_authenticated_rpc_count
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public'
     and procedure.proname like 'servsync%trade_section%'
     and has_function_privilege('authenticated', procedure.oid, 'EXECUTE');
  perform trade_section_test.assert(v_authenticated_rpc_count = 5, 'only five intended Trade Section RPCs are browser-callable');
  perform trade_section_test.assert(
    not exists (
      select 1 from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
       where namespace.nspname = 'public'
         and procedure.proname in (
           'servsync_create_trade_section_instance', 'servsync_update_trade_section_values',
           'servsync_set_trade_section_lifecycle', 'servsync_list_trade_section_instances',
           'servsync_list_trade_section_revisions'
         )
         and (
           procedure.proowner <> 'postgres'::regrole
           or not procedure.prosecdef
           or not (
             procedure.proconfig @> array[
               case
                 when procedure.proname = 'servsync_create_trade_section_instance'
                   then 'search_path=pg_catalog, public, extensions'
                 else 'search_path=pg_catalog, public'
               end
             ]
           )
         )
    ),
    'all five RPCs are postgres-owned SECURITY DEFINER with fixed search paths'
  );
  perform trade_section_test.assert(
    not exists (
      select 1 from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
       where namespace.nspname = 'public'
         and procedure.proname like 'servsync_private%trade_section%'
         and (
           has_function_privilege('anon', procedure.oid, 'EXECUTE')
           or has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
           or has_function_privilege('service_role', procedure.oid, 'EXECUTE')
         )
    ),
    'private helpers and workflow triggers are non-delegable'
  );
  perform trade_section_test.assert(
    not exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name in ('trade_section_instances', 'trade_section_revisions')
         and column_name ilike '%stripe%'
    ),
    'durable identity is provider-neutral and independent of Stripe'
  );
end;
$catalog_security$;

reset request.jwt.claim.sub;
