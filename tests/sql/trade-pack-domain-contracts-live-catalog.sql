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
        from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
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
        from pg_catalog.pg_policy policy
       where policy.polrelid = format('public.%I', v_relation)::regclass
    ) then
      raise exception 'Relation public.% unexpectedly has an RLS policy.', v_relation;
    end if;

    if exists (
      select 1
        from information_schema.table_privileges privilege
       where privilege.table_schema = 'public'
         and privilege.table_name = v_relation
         and privilege.grantee <> 'postgres'
    ) or exists (
      select 1
        from information_schema.column_privileges privilege
       where privilege.table_schema = 'public'
         and privilege.table_name = v_relation
         and privilege.grantee <> 'postgres'
    ) then
      raise exception 'Relation public.% has a non-owner table or column grant.', v_relation;
    end if;
  end loop;

  foreach v_function in array array[
    'public.servsync_resolve_trade_pack_capability(uuid,text)'::regprocedure,
    'public.servsync_list_available_trade_pack_work_types(uuid)'::regprocedure,
    'public.servsync_get_trade_pack_work_type_version(uuid,text,integer)'::regprocedure
  ] loop
    select owner.rolname, procedure.prosecdef, procedure.proconfig
      into v_owner, v_security_definer, v_search_path
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_roles owner on owner.oid = procedure.proowner
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

  if (select count(*) from public.trade_pack_workflow_families) <> 1
     or (select count(*) from public.trade_pack_trades) <> 1
     or (select count(*) from public.trade_pack_capabilities) <> 1
     or (select count(*) from public.trade_pack_work_types) <> 1
     or (select count(*) from public.trade_pack_work_type_versions) <> 1
     or (select count(*) from public.contractor_trade_pack_capability_grants) <> 0 then
    raise exception 'Trade Pack seed or grant counts do not match the reviewed foundation.';
  end if;

  if not exists (
    select 1
      from public.trade_pack_work_types work_type
      join public.trade_pack_work_type_versions version on version.work_type_id = work_type.id
     where work_type.work_type_key = 'hvac.no_cooling_service_call'
       and not work_type.is_enabled
       and version.version_number = 1
       and version.version_status = 'published'
       and version.definition_contract -> 'readings' = '[]'::jsonb
       and version.definition_contract -> 'tests' = '[]'::jsonb
       and version.definition_contract -> 'findings' = '[]'::jsonb
       and version.definition_contract -> 'recommendations' = '[]'::jsonb
  ) then
    raise exception 'Disabled skeletal No Cooling definition does not match the reviewed contract.';
  end if;

  if exists (
    select 1
      from information_schema.columns column_definition
     where column_definition.table_schema = 'public'
       and column_definition.table_name in (
         'trade_pack_workflow_families',
         'trade_pack_trades',
         'trade_pack_capabilities',
         'trade_pack_work_types',
         'trade_pack_work_type_versions',
         'contractor_trade_pack_capability_grants'
       )
       and column_definition.column_name ~ '(stripe|billing|product|price|subscription|trial|discount)'
  ) then
    raise exception 'Trade Pack schema contains a provider or pricing column.';
  end if;
end;
$$;

select jsonb_build_object(
  'relations', 6,
  'functions', (
    select count(*)
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname = 'public'
       and procedure.proname like 'servsync%trade_pack%'
  ),
  'capability_grants', (select count(*) from public.contractor_trade_pack_capability_grants),
  'enabled_work_types', (select count(*) from public.trade_pack_work_types where is_enabled),
  'disabled_skeletal_work_types', (
    select count(*)
      from public.trade_pack_work_types
     where work_type_key = 'hvac.no_cooling_service_call'
       and not is_enabled
  )
) as trade_pack_catalog_summary;
