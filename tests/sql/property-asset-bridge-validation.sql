create schema if not exists property_asset_test;

create or replace function property_asset_test.assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'ASSERTION FAILED: %', p_message; end if;
end;
$$;

create or replace function property_asset_test.expect_error(p_sql text, p_fragment text)
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

do $test$
declare
  v_home_asset_id uuid;
  v_local_asset_id uuid;
  v_result jsonb;
  v_revision bigint;
  v_count integer;
begin
  perform property_asset_test.assert(
    (select count(*) = 1 from public.home_asset_revisions where asset_id = '50000000-0000-0000-0000-000000000001'),
    'legacy asset receives one baseline revision'
  );
  perform property_asset_test.assert(
    (select asset_kind = 'hvac' and revision_number = 1 and lifecycle_status = 'active'
       from public.home_assets where id = '50000000-0000-0000-0000-000000000001'),
    'legacy asset is backfilled without identity loss'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  v_result := public.servsync_create_property_asset(
    p_home_id => '10000000-0000-0000-0000-000000000001',
    p_home_room_id => '11000000-0000-0000-0000-000000000001',
    p_asset_kind => 'plumbing', p_asset_type => 'Water heater',
    p_name => 'Main water heater', p_location_label => 'Utility room',
    p_manufacturer => 'Example', p_model => 'WH-1',
    p_serial_identifier => 'SERIAL-REDACTED-FIXTURE',
    p_install_date => date '2020-01-02', p_approximate_age_years => 6::smallint,
    p_customer_safe_description => 'Customer-safe description',
    p_notes => 'Private homeowner note'
  );
  v_home_asset_id := (v_result->>'id')::uuid;
  v_revision := (v_result->>'revision_number')::bigint;
  perform property_asset_test.assert(v_revision = 1, 'created asset starts at revision 1');

  perform property_asset_test.expect_error(
    $$select public.servsync_create_property_asset(
      p_home_id => '10000000-0000-0000-0000-000000000001',
      p_asset_kind => 'unknown-kind', p_name => 'Unknown')$$,
    'Unknown property asset kind'
  );
  perform property_asset_test.expect_error(
    $$select public.servsync_create_property_asset(
      p_home_id => '10000000-0000-0000-0000-000000000001',
      p_asset_kind => 'hvac', p_name => repeat('x', 161))$$,
    'too long'
  );
  perform property_asset_test.expect_error(
    $$select public.servsync_create_property_asset(
      p_home_id => '10000000-0000-0000-0000-000000000001',
      p_home_room_id => '11000000-0000-0000-0000-000000000002',
      p_asset_kind => 'hvac', p_name => 'Wrong room')$$,
    'same home'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  perform property_asset_test.assert(
    (select count(*) = 2 and bool_and(notes is null)
       from public.servsync_list_property_assets('10000000-0000-0000-0000-000000000001', null, null, false)),
    'home member reads customer-safe assets with notes redacted'
  );
  perform property_asset_test.expect_error(
    format($sql$select public.servsync_update_property_asset(
      p_asset_id => %L, p_expected_revision => 1,
      p_asset_kind => 'plumbing', p_name => 'Member edit')$sql$, v_home_asset_id),
    'management is unavailable'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
  perform property_asset_test.assert(
    (select count(*) = 2 and bool_and(notes is null)
       from public.servsync_list_property_assets('10000000-0000-0000-0000-000000000001', null, null, false)),
    'home viewer reads only customer-safe fields'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
  perform property_asset_test.assert(
    (select count(*) = 2 and bool_and(notes is null)
       from public.servsync_list_property_assets(
         '10000000-0000-0000-0000-000000000001', null,
         '20000000-0000-0000-0000-000000000001', false)),
    'active contractor Admin reads shared canonical assets without private notes'
  );
  v_result := public.servsync_update_property_asset(
    p_asset_id => v_home_asset_id, p_expected_revision => 1,
    p_contractor_id => '20000000-0000-0000-0000-000000000001',
    p_home_room_id => '11000000-0000-0000-0000-000000000001',
    p_asset_kind => 'plumbing', p_asset_type => 'Water heater',
    p_name => 'Main water heater revised', p_location_label => 'Utility room',
    p_manufacturer => 'Example', p_model => 'WH-1',
    p_serial_identifier => 'SERIAL-REDACTED-FIXTURE',
    p_install_date => date '2020-01-02', p_approximate_age_years => 6::smallint,
    p_customer_safe_description => 'Contractor supplied safe identification'
  );
  perform property_asset_test.assert((v_result->>'revision_number')::bigint = 2, 'contractor update advances revision');
  perform property_asset_test.assert(
    (select notes = 'Private homeowner note' from public.home_assets where id = v_home_asset_id),
    'contractor update preserves homeowner-private note'
  );
  perform property_asset_test.expect_error(
    format($sql$select public.servsync_update_property_asset(
      p_asset_id => %L, p_expected_revision => 1,
      p_contractor_id => '20000000-0000-0000-0000-000000000001',
      p_asset_kind => 'plumbing', p_name => 'Stale write')$sql$, v_home_asset_id),
    'has changed'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', true);
  perform property_asset_test.assert(
    (select count(*) = 2 from public.servsync_list_property_assets(
      '10000000-0000-0000-0000-000000000001', null,
      '20000000-0000-0000-0000-000000000001', false)),
    'Field Technician can read an explicitly shared connected property'
  );
  perform property_asset_test.expect_error(
    format($sql$select public.servsync_update_property_asset(
      p_asset_id => %L, p_expected_revision => 2,
      p_contractor_id => '20000000-0000-0000-0000-000000000001',
      p_asset_kind => 'plumbing', p_name => 'Field edit')$sql$, v_home_asset_id),
    'management is unavailable'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000009', true);
  perform property_asset_test.assert(
    (select count(*) = 2 from public.servsync_list_property_assets(
      '10000000-0000-0000-0000-000000000001', null,
      '20000000-0000-0000-0000-000000000001', false)),
    'Viewer can read an explicitly shared connected property'
  );
  perform property_asset_test.expect_error(
    format($sql$select public.servsync_update_property_asset(
      p_asset_id => %L, p_expected_revision => 2,
      p_contractor_id => '20000000-0000-0000-0000-000000000001',
      p_asset_kind => 'plumbing', p_name => 'Viewer edit')$sql$, v_home_asset_id),
    'management is unavailable'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
  perform property_asset_test.expect_error(
    $$select * from public.servsync_list_property_assets(
      '10000000-0000-0000-0000-000000000001', null,
      '20000000-0000-0000-0000-000000000001', false)$$,
    'unavailable'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true);
  v_result := public.servsync_update_property_asset(
    p_asset_id => v_home_asset_id, p_expected_revision => 2,
    p_contractor_id => '20000000-0000-0000-0000-000000000002',
    p_home_room_id => '11000000-0000-0000-0000-000000000001',
    p_asset_kind => 'plumbing', p_asset_type => 'Water heater',
    p_name => 'Shared water heater update'
  );
  perform property_asset_test.assert((v_result->>'revision_number')::bigint = 3, 'second authorized contractor updates canonical asset');
  perform property_asset_test.expect_error(
    $$select * from public.servsync_list_property_assets(
      '10000000-0000-0000-0000-000000000002', null,
      '20000000-0000-0000-0000-000000000002', false)$$,
    'unavailable'
  );
  perform property_asset_test.expect_error(
    $$select * from public.servsync_list_property_assets(
      null, '41000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002', false)$$,
    'unavailable'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
  perform property_asset_test.assert(
    (select source_contractor_id is null and source_business_name is null
       from public.servsync_list_property_asset_revisions(v_home_asset_id, '20000000-0000-0000-0000-000000000001')
      where revision_number = 3),
    'one contractor cannot identify another contractor through shared revision provenance'
  );

  v_result := public.servsync_create_property_asset(
    p_local_home_id => '41000000-0000-0000-0000-000000000001',
    p_contractor_id => '20000000-0000-0000-0000-000000000001',
    p_asset_kind => 'hvac', p_asset_type => 'Heat pump', p_name => 'Local heat pump'
  );
  v_local_asset_id := (v_result->>'id')::uuid;
  perform property_asset_test.assert(
    (select home_id is null and local_home_id = '41000000-0000-0000-0000-000000000001'
       from public.home_assets where id = v_local_asset_id),
    'local asset starts on stable local property identity'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', true);
  v_result := public.servsync_update_property_asset(
    p_asset_id => v_local_asset_id, p_expected_revision => 1,
    p_contractor_id => '20000000-0000-0000-0000-000000000001',
    p_asset_kind => 'hvac', p_asset_type => 'Heat pump', p_name => 'Local heat pump updated'
  );
  perform property_asset_test.assert((v_result->>'revision_number')::bigint = 2, 'Office may update local asset');

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', true);
  perform property_asset_test.assert(
    (select count(*) = 1 from public.servsync_list_property_assets(
      null, '41000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', false)),
    'Field Technician retains established tenant-wide redacted local-property read'
  );
  perform property_asset_test.expect_error(
    format($sql$select public.servsync_update_property_asset(
      p_asset_id => %L, p_expected_revision => 2,
      p_contractor_id => '20000000-0000-0000-0000-000000000001',
      p_asset_kind => 'hvac', p_name => 'Field local edit')$sql$, v_local_asset_id),
    'management is unavailable'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000009', true);
  perform property_asset_test.expect_error(
    $$select * from public.servsync_list_property_assets(
      null, '41000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', false)$$,
    'unavailable'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
  v_result := public.servsync_set_property_asset_lifecycle(
    v_local_asset_id, 2, 'retired', '20000000-0000-0000-0000-000000000001'
  );
  perform property_asset_test.assert((v_result->>'lifecycle_status') = 'retired', 'asset can be retired without deletion');
  perform property_asset_test.expect_error(
    format($sql$select public.servsync_update_property_asset(
      p_asset_id => %L, p_expected_revision => 3,
      p_contractor_id => '20000000-0000-0000-0000-000000000001',
      p_asset_kind => 'hvac', p_name => 'Edit retired')$sql$, v_local_asset_id),
    'must be restored'
  );
  v_result := public.servsync_set_property_asset_lifecycle(
    v_local_asset_id, 3, 'active', '20000000-0000-0000-0000-000000000001'
  );
  perform property_asset_test.assert((v_result->>'revision_number')::bigint = 4, 'restore is revisioned');

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  update public.contractor_local_homes
     set home_id = '10000000-0000-0000-0000-000000000001', claimed_at = now()
   where id = '41000000-0000-0000-0000-000000000001';
  update public.contractor_local_contacts
     set homeowner_user_id = '00000000-0000-0000-0000-000000000001', claimed_at = now()
   where id = '40000000-0000-0000-0000-000000000001';
  perform property_asset_test.assert(
    (select id = v_local_asset_id and home_id = '10000000-0000-0000-0000-000000000001' and revision_number = 5
       from public.home_assets where id = v_local_asset_id),
    'claim maps the same asset identity to canonical home and records a revision'
  );
  perform property_asset_test.assert(
    (select count(*) = 3 from public.servsync_list_property_assets(
      '10000000-0000-0000-0000-000000000001', null, null, false)),
    'homeowner sees claimed local asset through canonical home'
  );

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
  update public.homeowner_contractor_connections set status = 'revoked'
   where id = '30000000-0000-0000-0000-000000000001';
  perform property_asset_test.expect_error(
    $$select * from public.servsync_list_property_assets(
      '10000000-0000-0000-0000-000000000001', null,
      '20000000-0000-0000-0000-000000000001', true)$$,
    'unavailable'
  );
  update public.homeowner_contractor_connections set status = 'active'
   where id = '30000000-0000-0000-0000-000000000001';

  select count(*) into v_count from public.home_asset_revisions where asset_id = v_local_asset_id;
  perform property_asset_test.assert(v_count = 5, 'every local asset mutation has an immutable snapshot');
  perform property_asset_test.expect_error(
    format('update public.home_asset_revisions set name = %L where asset_id = %L', 'tampered', v_local_asset_id),
    'immutable'
  );
  perform property_asset_test.expect_error(
    format('delete from public.home_asset_revisions where asset_id = %L', v_local_asset_id),
    'immutable'
  );
  perform property_asset_test.expect_error(
    format('delete from public.home_assets where id = %L', v_local_asset_id),
    'foreign key'
  );

  perform property_asset_test.assert(
    not exists (
      select 1 from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name in ('home_assets', 'home_asset_revisions')
         and grantee in ('PUBLIC', 'anon', 'authenticated')
    ),
    'browser roles have no direct asset table grants'
  );
  perform property_asset_test.assert(
    has_table_privilege('service_role', 'public.home_assets', 'select,insert,update,delete')
      and has_table_privilege('service_role', 'public.home_asset_revisions', 'select,insert,update,delete'),
    'trusted service_role retains the canonical Supabase table ACL'
  );
  perform property_asset_test.assert(
    (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.home_assets'::regclass),
    'home_assets uses forced RLS'
  );
  perform property_asset_test.assert(
    (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.home_asset_revisions'::regclass),
    'revisions use forced RLS'
  );
  perform property_asset_test.assert(
    not exists (select 1 from pg_policy where polrelid in ('public.home_assets'::regclass, 'public.home_asset_revisions'::regclass)),
    'private tables have no browser RLS policies'
  );
end;
$test$;

do $$
declare
  v_expected text[] := array[
    'servsync_create_property_asset(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,date,smallint,date,text,text)',
    'servsync_list_property_asset_revisions(uuid,uuid)',
    'servsync_list_property_assets(uuid,uuid,uuid,boolean)',
    'servsync_set_property_asset_lifecycle(uuid,bigint,text,uuid)',
    'servsync_update_property_asset(uuid,bigint,uuid,uuid,text,text,text,text,text,text,text,date,smallint,date,text,text)'
  ];
  v_signature text;
begin
  foreach v_signature in array v_expected loop
    perform property_asset_test.assert(
      (select count(*) = 1 from pg_proc where oid = ('public.' || v_signature)::regprocedure),
      'expected one RPC overload for ' || v_signature
    );
    perform property_asset_test.assert(
      (select prosecdef and proconfig = array['search_path=public']
         from pg_proc where oid = ('public.' || v_signature)::regprocedure),
      'RPC must be SECURITY DEFINER with fixed search_path: ' || v_signature
    );
  end loop;

  perform property_asset_test.assert(
    not exists (
      select 1
        from information_schema.routine_privileges
       where specific_schema = 'public'
         and routine_name like 'servsync_private%property_asset%'
         and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
    ),
    'private helpers have no direct execution grants'
  );
end;
$$;

drop schema property_asset_test cascade;
