begin;

do $$
declare
  v_relation text;
  v_function regprocedure;
  v_owner text;
  v_security_definer boolean;
  v_search_path text[];
begin
  foreach v_relation in array array[
    'trade_pack_workflow_families',
    'trade_pack_trades',
    'trade_pack_capabilities',
    'trade_pack_work_types',
    'trade_pack_work_type_versions',
    'contractor_trade_pack_capability_grants'
  ] loop
    if not exists (
      select 1
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public'
         and relation.relname = v_relation
         and relation.relowner = 'postgres'::regrole
         and relation.relrowsecurity
         and relation.relforcerowsecurity
    ) then
      raise exception 'Relation public.% is missing postgres ownership or forced RLS.', v_relation;
    end if;

    if exists (
      select 1
        from pg_policies
       where schemaname = 'public'
         and tablename = v_relation
    ) then
      raise exception 'Relation public.% unexpectedly has an RLS policy.', v_relation;
    end if;

    if has_table_privilege('anon', format('public.%I', v_relation), 'select')
       or has_table_privilege('authenticated', format('public.%I', v_relation), 'select')
       or has_table_privilege('service_role', format('public.%I', v_relation), 'select') then
      raise exception 'Relation public.% exposes a direct non-owner read grant.', v_relation;
    end if;
  end loop;

  foreach v_function in array array[
    'public.servsync_resolve_trade_pack_capability(uuid,text)'::regprocedure,
    'public.servsync_list_available_trade_pack_work_types(uuid)'::regprocedure,
    'public.servsync_get_trade_pack_work_type_version(uuid,text,integer)'::regprocedure
  ] loop
    select owner.rolname, procedure.prosecdef, procedure.proconfig
      into v_owner, v_security_definer, v_search_path
      from pg_proc procedure
      join pg_roles owner on owner.oid = procedure.proowner
     where procedure.oid = v_function;

    if v_owner <> 'postgres'
       or not v_security_definer
       or v_search_path <> array['search_path=pg_catalog, public'] then
      raise exception 'RPC % has an unsafe owner/security/search_path contract.', v_function;
    end if;

    if has_function_privilege('public', v_function, 'execute')
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute')
       or not has_function_privilege('authenticated', v_function, 'execute') then
      raise exception 'RPC % has an unexpected execution grant.', v_function;
    end if;
  end loop;

  if exists (
    select 1
      from information_schema.routine_privileges
     where specific_schema = 'public'
       and routine_name in (
         'servsync_resolve_trade_pack_capability',
         'servsync_list_available_trade_pack_work_types',
         'servsync_get_trade_pack_work_type_version'
       )
       and privilege_type = 'EXECUTE'
       and is_grantable = 'YES'
       and grantee <> 'postgres'
  ) then
    raise exception 'A non-owner Trade Pack RPC grant has WITH GRANT OPTION.';
  end if;
end;
$$;

do $$
declare
  v_contract jsonb;
begin
  select definition_contract
    into v_contract
    from public.trade_pack_work_type_versions
   where id = '02d0d4c9-d7a6-4fd1-b5ab-d1f44c96aa06';

  if not public.servsync_trade_pack_definition_contract_is_valid(v_contract) then
    raise exception 'The skeletal No Cooling definition contract is invalid.';
  end if;

  if (select is_enabled from public.trade_pack_work_types where id = 'e419ba51-b545-463b-91a1-e0d0b6710d84') then
    raise exception 'The skeletal No Cooling definition must remain disabled.';
  end if;

  if exists (select 1 from public.contractor_trade_pack_capability_grants) then
    raise exception 'The foundation must not activate a contractor capability.';
  end if;

  if v_contract #> '{readings}' <> '[]'::jsonb
     or v_contract #> '{tests}' <> '[]'::jsonb
     or v_contract #> '{findings}' <> '[]'::jsonb
     or v_contract #> '{recommendations}' <> '[]'::jsonb then
    raise exception 'The skeletal definition unexpectedly contains unreviewed HVAC content.';
  end if;
end;
$$;

insert into public.contractor_profiles (id, owner_user_id, business_name) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Trade Pack Test Contractor'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Other Contractor');

insert into public.contractor_team_members (id, contractor_id, user_id, role, status) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'admin', 'active'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', 'office', 'active'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', 'field_tech', 'active'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000006', 'viewer', 'active'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000007', 'admin', 'inactive');

insert into public.contractor_trade_pack_capability_grants (
  contractor_id,
  capability_id,
  access_mode,
  granted_by,
  reason
) values (
  '10000000-0000-4000-8000-000000000001',
  '9188050e-98b5-44ed-96f1-d3e0af66549c',
  'active',
  '20000000-0000-4000-8000-000000000001',
  'Disposable validation only'
);

do $$
begin
  begin
    insert into public.trade_pack_trades (trade_key, display_name)
    values ('HVAC', 'Invalid');
    raise exception 'Uppercase identifier was accepted.';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.trade_pack_capabilities (capability_key, display_name)
    values ('trade.hvac.bad..key', 'Invalid');
    raise exception 'Malformed capability identifier was accepted.';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.trade_pack_trades (trade_key, display_name)
    values ('hvac', 'Duplicate');
    raise exception 'Duplicate trade identifier was accepted.';
  exception when unique_violation then
    null;
  end;

  begin
    insert into public.trade_pack_work_type_versions (
      work_type_id,
      version_number,
      version_status,
      display_name,
      definition_contract,
      published_at
    ) values (
      'e419ba51-b545-463b-91a1-e0d0b6710d84',
      2,
      'published',
      'Invalid contract',
      '{"schema_version":1,"section":{"key":"bad","label":"Bad","description":null,"customer_visibility":"customer_safe_summary"},"readings":[{"key":"temperature","label":"Temperature","description":null,"value_type":"choice","unit":null,"required":false,"customer_visibility":"contractor_private","options":["same","same"]}],"tests":[],"findings":[],"recommendations":[]}'::jsonb,
      now()
    );
    raise exception 'Invalid duplicate choice options were accepted.';
  exception when check_violation then
    null;
  end;

  begin
    update public.trade_pack_work_type_versions
       set display_name = 'Changed published definition'
     where id = '02d0d4c9-d7a6-4fd1-b5ab-d1f44c96aa06';
    raise exception 'Published definition version was mutable.';
  exception when raise_exception then
    if sqlerrm = 'Published definition version was mutable.' then
      raise;
    end if;
  end;

  begin
    delete from public.trade_pack_work_type_versions
     where id = '02d0d4c9-d7a6-4fd1-b5ab-d1f44c96aa06';
    raise exception 'Published definition version was deletable.';
  exception when raise_exception then
    if sqlerrm = 'Published definition version was deletable.' then
      raise;
    end if;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_resolution record;
begin
  select * into v_resolution
    from public.servsync_resolve_trade_pack_capability(
      '10000000-0000-4000-8000-000000000001',
      'trade.hvac.workflow.no_cooling'
    );

  if not v_resolution.capability_known
     or v_resolution.access_mode <> 'active'
     or not v_resolution.can_create_new
     or not v_resolution.can_continue_existing then
    raise exception 'Owner active capability resolution failed.';
  end if;

  select * into v_resolution
    from public.servsync_resolve_trade_pack_capability(
      '10000000-0000-4000-8000-000000000001',
      'trade.hvac.workflow.unknown'
    );

  if v_resolution.capability_known
     or v_resolution.access_mode <> 'none'
     or v_resolution.can_create_new
     or v_resolution.can_continue_existing then
    raise exception 'Unknown capability did not fail closed.';
  end if;

  if exists (
    select 1
      from public.servsync_list_available_trade_pack_work_types(
        '10000000-0000-4000-8000-000000000001'
      )
  ) then
    raise exception 'Disabled work type was returned by list RPC.';
  end if;

  if exists (
    select 1
      from public.servsync_get_trade_pack_work_type_version(
        '10000000-0000-4000-8000-000000000001',
        'hvac.no_cooling_service_call',
        1
      )
  ) then
    raise exception 'Disabled work type was returned by version RPC.';
  end if;

  begin
    perform * from public.servsync_resolve_trade_pack_capability(
      '10000000-0000-4000-8000-000000000002',
      'trade.hvac.workflow.no_cooling'
    );
    raise exception 'Cross-tenant capability read was accepted.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform * from public.trade_pack_capabilities;
    raise exception 'Authenticated direct table read was accepted.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.contractor_trade_pack_capability_grants
       set access_mode = 'revoked';
    raise exception 'Authenticated direct grant mutation was accepted.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;

do $$
declare
  v_user_id uuid;
  v_role text;
  v_resolution record;
begin
  for v_user_id, v_role in
    select * from (values
      ('20000000-0000-4000-8000-000000000003'::uuid, 'admin'),
      ('20000000-0000-4000-8000-000000000004'::uuid, 'office'),
      ('20000000-0000-4000-8000-000000000005'::uuid, 'field_tech'),
      ('20000000-0000-4000-8000-000000000006'::uuid, 'viewer')
    ) roles(user_id, role_name)
  loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', v_user_id::text, true);
    select * into v_resolution
      from public.servsync_resolve_trade_pack_capability(
        '10000000-0000-4000-8000-000000000001',
        'trade.hvac.workflow.no_cooling'
      );
    if not v_resolution.can_create_new then
      raise exception '% role could not read the contractor capability.', v_role;
    end if;
    execute 'reset role';
  end loop;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000007', true);
  begin
    perform * from public.servsync_resolve_trade_pack_capability(
      '10000000-0000-4000-8000-000000000001',
      'trade.hvac.workflow.no_cooling'
    );
    raise exception 'Inactive team member was accepted.';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end;
$$;

update public.trade_pack_work_types
   set is_enabled = true
 where id = 'e419ba51-b545-463b-91a1-e0d0b6710d84';

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);

do $$
begin
  if (select count(*) from public.servsync_list_available_trade_pack_work_types(
    '10000000-0000-4000-8000-000000000001'
  )) <> 1 then
    raise exception 'Enabled granted work type was not listed exactly once.';
  end if;

  if (select count(*) from public.servsync_get_trade_pack_work_type_version(
    '10000000-0000-4000-8000-000000000001',
    'hvac.no_cooling_service_call',
    1
  )) <> 1 then
    raise exception 'Enabled granted version was not returned exactly once.';
  end if;
end;
$$;

reset role;

update public.contractor_trade_pack_capability_grants
   set access_mode = 'completion_only',
       reason = 'Downgrade validation'
 where contractor_id = '10000000-0000-4000-8000-000000000001'
   and capability_id = '9188050e-98b5-44ed-96f1-d3e0af66549c';

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_resolution record;
begin
  select * into v_resolution
    from public.servsync_resolve_trade_pack_capability(
      '10000000-0000-4000-8000-000000000001',
      'trade.hvac.workflow.no_cooling'
    );

  if v_resolution.can_create_new or not v_resolution.can_continue_existing then
    raise exception 'Completion-only downgrade behavior is incorrect.';
  end if;

  if exists (
    select 1 from public.servsync_list_available_trade_pack_work_types(
      '10000000-0000-4000-8000-000000000001'
    )
  ) then
    raise exception 'Completion-only capability still permits new work discovery.';
  end if;

  if (select count(*) from public.servsync_get_trade_pack_work_type_version(
    '10000000-0000-4000-8000-000000000001',
    'hvac.no_cooling_service_call',
    1
  )) <> 1 then
    raise exception 'Completion-only capability lost its immutable definition read contract.';
  end if;
end;
$$;

reset role;

update public.contractor_trade_pack_capability_grants
   set access_mode = 'revoked',
       reason = 'Revocation validation'
 where contractor_id = '10000000-0000-4000-8000-000000000001'
   and capability_id = '9188050e-98b5-44ed-96f1-d3e0af66549c';

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_resolution record;
begin
  select * into v_resolution
    from public.servsync_resolve_trade_pack_capability(
      '10000000-0000-4000-8000-000000000001',
      'trade.hvac.workflow.no_cooling'
    );

  if v_resolution.can_create_new or v_resolution.can_continue_existing then
    raise exception 'Revoked capability retained specialized mutation authority.';
  end if;

  if exists (
    select 1 from public.servsync_get_trade_pack_work_type_version(
      '10000000-0000-4000-8000-000000000001',
      'hvac.no_cooling_service_call',
      1
    )
  ) then
    raise exception 'Revoked capability retained definition resolution authority.';
  end if;
end;
$$;

reset role;

rollback;
