-- ServSync Trade Pack Domain Contracts v1.
--
-- Hidden, default-deny foundation for immutable system work-type definitions
-- and contractor-scoped capability grants. This migration does not create
-- runtime Draft/Job sections, expose UI, map billing products, or grant a
-- capability to any contractor.

begin;

do $$
declare
  v_name text;
begin
  if to_regclass('public.contractor_profiles') is null then
    raise exception 'Missing required table public.contractor_profiles.';
  end if;

  if to_regprocedure('auth.uid()') is null then
    raise exception 'Missing required authentication helper auth.uid().';
  end if;

  if to_regprocedure('public.current_user_can_access_contractor(uuid)') is null then
    raise exception 'Missing required contractor access helper public.current_user_can_access_contractor(uuid).';
  end if;

  foreach v_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = v_name) then
      raise exception 'Missing required database role %.', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'trade_pack_workflow_families',
    'trade_pack_trades',
    'trade_pack_capabilities',
    'trade_pack_work_types',
    'trade_pack_work_type_versions',
    'contractor_trade_pack_capability_grants'
  ] loop
    if to_regclass('public.' || v_name) is not null then
      raise exception 'Trade Pack foundation target public.% already exists; refusing partial or repeated installation.', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'servsync_trade_pack_jsonb_has_exact_keys(jsonb,text[])',
    'servsync_trade_pack_definition_contract_is_valid(jsonb)',
    'servsync_trade_pack_touch_updated_at()',
    'servsync_trade_pack_guard_catalog_identity()',
    'servsync_trade_pack_guard_work_type_identity()',
    'servsync_trade_pack_guard_definition_version()',
    'servsync_trade_pack_guard_capability_grant()',
    'servsync_resolve_trade_pack_capability(uuid,text)',
    'servsync_list_available_trade_pack_work_types(uuid)',
    'servsync_get_trade_pack_work_type_version(uuid,text,integer)'
  ] loop
    if to_regprocedure('public.' || v_name) is not null then
      raise exception 'Trade Pack foundation target function public.% already exists; refusing partial installation.', v_name;
    end if;
  end loop;
end;
$$;

create function public.servsync_trade_pack_jsonb_has_exact_keys(
  p_value jsonb,
  p_keys text[]
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    jsonb_typeof(p_value) = 'object'
    and coalesce(
      (select array_agg(key order by key) from jsonb_object_keys(p_value) key),
      array[]::text[]
    ) = (
      select array_agg(key order by key)
        from unnest(p_keys) key
    );
$$;

create function public.servsync_trade_pack_definition_contract_is_valid(
  p_contract jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_option jsonb;
  v_key text;
  v_seen_keys text[] := array[]::text[];
  v_visibility text;
begin
  if not public.servsync_trade_pack_jsonb_has_exact_keys(
    p_contract,
    array['schema_version', 'section', 'readings', 'tests', 'findings', 'recommendations']
  ) then
    return false;
  end if;

  if jsonb_typeof(p_contract -> 'schema_version') <> 'number'
     or (p_contract ->> 'schema_version') <> '1' then
    return false;
  end if;

  if not public.servsync_trade_pack_jsonb_has_exact_keys(
    p_contract -> 'section',
    array['key', 'label', 'description', 'customer_visibility']
  ) then
    return false;
  end if;

  if coalesce(p_contract #>> '{section,key}', '') !~ '^[a-z][a-z0-9_]{0,79}$'
     or length(trim(coalesce(p_contract #>> '{section,label}', ''))) not between 1 and 120
     or jsonb_typeof(p_contract #> '{section,label}') <> 'string'
     or (
       jsonb_typeof(p_contract #> '{section,description}') not in ('string', 'null')
       or length(coalesce(p_contract #>> '{section,description}', '')) > 1000
     ) then
    return false;
  end if;

  v_visibility := p_contract #>> '{section,customer_visibility}';
  if v_visibility not in (
    'contractor_private',
    'customer_safe_summary',
    'customer_safe_evidence',
    'customer_safe_recommendation'
  ) then
    return false;
  end if;

  foreach v_key in array array['readings', 'tests', 'findings', 'recommendations'] loop
    if jsonb_typeof(p_contract -> v_key) <> 'array'
       or jsonb_array_length(p_contract -> v_key) > 100 then
      return false;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_contract -> 'readings') loop
    if not public.servsync_trade_pack_jsonb_has_exact_keys(
      v_item,
      array['key', 'label', 'description', 'value_type', 'unit', 'required', 'customer_visibility', 'options']
    ) then
      return false;
    end if;

    v_key := v_item ->> 'key';
    v_visibility := v_item ->> 'customer_visibility';
    if coalesce(v_key, '') !~ '^[a-z][a-z0-9_]{0,79}$'
       or v_key = any(v_seen_keys)
       or length(trim(coalesce(v_item ->> 'label', ''))) not between 1 and 120
       or jsonb_typeof(v_item -> 'label') <> 'string'
       or jsonb_typeof(v_item -> 'description') not in ('string', 'null')
       or length(coalesce(v_item ->> 'description', '')) > 1000
       or coalesce(v_item ->> 'value_type', '') not in ('number', 'text', 'boolean', 'choice')
       or jsonb_typeof(v_item -> 'unit') not in ('string', 'null')
       or length(coalesce(v_item ->> 'unit', '')) > 40
       or jsonb_typeof(v_item -> 'required') <> 'boolean'
       or v_visibility not in (
         'contractor_private',
         'customer_safe_summary',
         'customer_safe_evidence',
         'customer_safe_recommendation'
       )
       or jsonb_typeof(v_item -> 'options') <> 'array'
       or jsonb_array_length(v_item -> 'options') > 30 then
      return false;
    end if;

    if (v_item ->> 'value_type') = 'choice' and jsonb_array_length(v_item -> 'options') < 2 then
      return false;
    end if;
    if (v_item ->> 'value_type') <> 'choice' and jsonb_array_length(v_item -> 'options') <> 0 then
      return false;
    end if;

    for v_option in select value from jsonb_array_elements(v_item -> 'options') loop
      if jsonb_typeof(v_option) <> 'string'
         or length(trim(v_option #>> '{}')) not between 1 and 80 then
        return false;
      end if;
    end loop;

    if (
      select count(*) <> count(distinct value #>> '{}')
        from jsonb_array_elements(v_item -> 'options')
    ) then
      return false;
    end if;

    v_seen_keys := array_append(v_seen_keys, v_key);
  end loop;

  for v_item in select value from jsonb_array_elements(p_contract -> 'tests') loop
    if not public.servsync_trade_pack_jsonb_has_exact_keys(
      v_item,
      array['key', 'label', 'description', 'value_type', 'required', 'customer_visibility', 'options']
    ) then
      return false;
    end if;

    v_key := v_item ->> 'key';
    v_visibility := v_item ->> 'customer_visibility';
    if coalesce(v_key, '') !~ '^[a-z][a-z0-9_]{0,79}$'
       or v_key = any(v_seen_keys)
       or length(trim(coalesce(v_item ->> 'label', ''))) not between 1 and 120
       or jsonb_typeof(v_item -> 'label') <> 'string'
       or jsonb_typeof(v_item -> 'description') not in ('string', 'null')
       or length(coalesce(v_item ->> 'description', '')) > 1000
       or coalesce(v_item ->> 'value_type', '') not in ('text', 'boolean', 'choice')
       or jsonb_typeof(v_item -> 'required') <> 'boolean'
       or v_visibility not in (
         'contractor_private',
         'customer_safe_summary',
         'customer_safe_evidence',
         'customer_safe_recommendation'
       )
       or jsonb_typeof(v_item -> 'options') <> 'array'
       or jsonb_array_length(v_item -> 'options') > 30 then
      return false;
    end if;

    if (v_item ->> 'value_type') = 'choice' and jsonb_array_length(v_item -> 'options') < 2 then
      return false;
    end if;
    if (v_item ->> 'value_type') <> 'choice' and jsonb_array_length(v_item -> 'options') <> 0 then
      return false;
    end if;

    for v_option in select value from jsonb_array_elements(v_item -> 'options') loop
      if jsonb_typeof(v_option) <> 'string'
         or length(trim(v_option #>> '{}')) not between 1 and 80 then
        return false;
      end if;
    end loop;

    if (
      select count(*) <> count(distinct value #>> '{}')
        from jsonb_array_elements(v_item -> 'options')
    ) then
      return false;
    end if;

    v_seen_keys := array_append(v_seen_keys, v_key);
  end loop;

  for v_item in select value from jsonb_array_elements(p_contract -> 'findings') loop
    if not public.servsync_trade_pack_jsonb_has_exact_keys(
      v_item,
      array['key', 'label', 'description', 'severity_options', 'customer_visibility']
    ) then
      return false;
    end if;

    v_key := v_item ->> 'key';
    v_visibility := v_item ->> 'customer_visibility';
    if coalesce(v_key, '') !~ '^[a-z][a-z0-9_]{0,79}$'
       or v_key = any(v_seen_keys)
       or length(trim(coalesce(v_item ->> 'label', ''))) not between 1 and 120
       or jsonb_typeof(v_item -> 'label') <> 'string'
       or jsonb_typeof(v_item -> 'description') not in ('string', 'null')
       or length(coalesce(v_item ->> 'description', '')) > 1000
       or v_visibility not in (
         'contractor_private',
         'customer_safe_summary',
         'customer_safe_evidence',
         'customer_safe_recommendation'
       )
       or jsonb_typeof(v_item -> 'severity_options') <> 'array'
       or jsonb_array_length(v_item -> 'severity_options') not between 1 and 20 then
      return false;
    end if;

    for v_option in select value from jsonb_array_elements(v_item -> 'severity_options') loop
      if jsonb_typeof(v_option) <> 'string'
         or (v_option #>> '{}') !~ '^[a-z][a-z0-9_]{0,39}$' then
        return false;
      end if;
    end loop;

    if (
      select count(*) <> count(distinct value #>> '{}')
        from jsonb_array_elements(v_item -> 'severity_options')
    ) then
      return false;
    end if;

    v_seen_keys := array_append(v_seen_keys, v_key);
  end loop;

  for v_item in select value from jsonb_array_elements(p_contract -> 'recommendations') loop
    if not public.servsync_trade_pack_jsonb_has_exact_keys(
      v_item,
      array['key', 'label', 'description', 'customer_visibility']
    ) then
      return false;
    end if;

    v_key := v_item ->> 'key';
    v_visibility := v_item ->> 'customer_visibility';
    if coalesce(v_key, '') !~ '^[a-z][a-z0-9_]{0,79}$'
       or v_key = any(v_seen_keys)
       or length(trim(coalesce(v_item ->> 'label', ''))) not between 1 and 120
       or jsonb_typeof(v_item -> 'label') <> 'string'
       or jsonb_typeof(v_item -> 'description') not in ('string', 'null')
       or length(coalesce(v_item ->> 'description', '')) > 1000
       or v_visibility not in (
         'contractor_private',
         'customer_safe_summary',
         'customer_safe_evidence',
         'customer_safe_recommendation'
       ) then
      return false;
    end if;

    v_seen_keys := array_append(v_seen_keys, v_key);
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create table public.trade_pack_workflow_families (
  id uuid primary key default gen_random_uuid(),
  workflow_family_key text not null unique,
  display_name text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint trade_pack_workflow_family_key_valid
    check (workflow_family_key ~ '^[a-z][a-z0-9_]{0,79}$'),
  constraint trade_pack_workflow_family_name_valid
    check (length(trim(display_name)) between 1 and 120),
  constraint trade_pack_workflow_family_description_valid
    check (description is null or length(description) <= 1000)
);

create table public.trade_pack_trades (
  id uuid primary key default gen_random_uuid(),
  trade_key text not null unique,
  display_name text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint trade_pack_trade_key_valid
    check (trade_key ~ '^[a-z][a-z0-9_]{0,79}$'),
  constraint trade_pack_trade_name_valid
    check (length(trim(display_name)) between 1 and 120),
  constraint trade_pack_trade_description_valid
    check (description is null or length(description) <= 1000)
);

create table public.trade_pack_capabilities (
  id uuid primary key default gen_random_uuid(),
  capability_key text not null unique,
  display_name text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint trade_pack_capability_key_valid
    check (
      length(capability_key) <= 160
      and capability_key ~ '^trade\.[a-z][a-z0-9_]{0,39}(\.[a-z][a-z0-9_]{0,39})+$'
    ),
  constraint trade_pack_capability_name_valid
    check (length(trim(display_name)) between 1 and 120),
  constraint trade_pack_capability_description_valid
    check (description is null or length(description) <= 1000)
);

create table public.trade_pack_work_types (
  id uuid primary key default gen_random_uuid(),
  work_type_key text not null unique,
  trade_id uuid not null references public.trade_pack_trades(id) on delete restrict,
  workflow_family_id uuid not null references public.trade_pack_workflow_families(id) on delete restrict,
  required_capability_id uuid not null references public.trade_pack_capabilities(id) on delete restrict,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_pack_work_type_key_valid
    check (work_type_key ~ '^[a-z][a-z0-9_]{0,39}\.[a-z][a-z0-9_]{0,79}$')
);

create table public.trade_pack_work_type_versions (
  id uuid primary key default gen_random_uuid(),
  work_type_id uuid not null references public.trade_pack_work_types(id) on delete restrict,
  version_number integer not null,
  version_status text not null,
  display_name text not null,
  description text,
  definition_contract jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (work_type_id, version_number),
  constraint trade_pack_work_type_version_positive
    check (version_number > 0),
  constraint trade_pack_work_type_version_status_valid
    check (version_status in ('draft', 'published', 'retired')),
  constraint trade_pack_work_type_version_publish_state_valid
    check (
      (version_status = 'draft' and published_at is null)
      or (version_status in ('published', 'retired') and published_at is not null)
    ),
  constraint trade_pack_work_type_version_name_valid
    check (length(trim(display_name)) between 1 and 120),
  constraint trade_pack_work_type_version_description_valid
    check (description is null or length(description) <= 1000),
  constraint trade_pack_work_type_definition_contract_valid
    check (public.servsync_trade_pack_definition_contract_is_valid(definition_contract))
);

create table public.contractor_trade_pack_capability_grants (
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  capability_id uuid not null references public.trade_pack_capabilities(id) on delete restrict,
  access_mode text not null,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  updated_at timestamptz not null default now(),
  reason text,
  primary key (contractor_id, capability_id),
  constraint contractor_trade_pack_grant_mode_valid
    check (access_mode in ('active', 'completion_only', 'revoked')),
  constraint contractor_trade_pack_grant_reason_valid
    check (reason is null or length(reason) <= 500)
);

create index trade_pack_work_types_lookup_idx
  on public.trade_pack_work_types(trade_id, workflow_family_id, is_enabled, work_type_key);

create index trade_pack_work_type_versions_lookup_idx
  on public.trade_pack_work_type_versions(work_type_id, version_status, version_number desc);

create index contractor_trade_pack_grants_capability_idx
  on public.contractor_trade_pack_capability_grants(capability_id, access_mode, contractor_id);

create function public.servsync_trade_pack_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.servsync_trade_pack_guard_catalog_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Published Trade Pack identifier catalogs are immutable; add a new identifier instead.';
end;
$$;

create function public.servsync_trade_pack_guard_work_type_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Trade Pack work types cannot be deleted.';
  end if;

  if new.id <> old.id
     or new.work_type_key <> old.work_type_key
     or new.trade_id <> old.trade_id
     or new.workflow_family_id <> old.workflow_family_id
     or new.required_capability_id <> old.required_capability_id
     or new.created_at <> old.created_at then
    raise exception 'Trade Pack work-type identity is immutable.';
  end if;

  return new;
end;
$$;

create function public.servsync_trade_pack_guard_definition_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.version_status in ('published', 'retired') then
    raise exception 'Published or retired Trade Pack definition versions are immutable.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.id <> old.id
     or new.work_type_id <> old.work_type_id
     or new.version_number <> old.version_number
     or new.created_at <> old.created_at then
    raise exception 'Trade Pack definition-version identity is immutable.';
  end if;

  return new;
end;
$$;

create function public.servsync_trade_pack_guard_capability_grant()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Trade Pack capability grants retain their state history and cannot be deleted.';
  end if;

  if new.contractor_id <> old.contractor_id
     or new.capability_id <> old.capability_id
     or new.granted_at <> old.granted_at
     or new.granted_by is distinct from old.granted_by then
    raise exception 'Trade Pack capability grant identity and origin are immutable.';
  end if;

  return new;
end;
$$;

create trigger trade_pack_workflow_families_immutable
  before update or delete on public.trade_pack_workflow_families
  for each row execute function public.servsync_trade_pack_guard_catalog_identity();

create trigger trade_pack_trades_immutable
  before update or delete on public.trade_pack_trades
  for each row execute function public.servsync_trade_pack_guard_catalog_identity();

create trigger trade_pack_capabilities_immutable
  before update or delete on public.trade_pack_capabilities
  for each row execute function public.servsync_trade_pack_guard_catalog_identity();

create trigger trade_pack_work_types_guard_identity
  before update or delete on public.trade_pack_work_types
  for each row execute function public.servsync_trade_pack_guard_work_type_identity();

create trigger trade_pack_work_types_touch_updated_at
  before update on public.trade_pack_work_types
  for each row execute function public.servsync_trade_pack_touch_updated_at();

create trigger trade_pack_work_type_versions_guard
  before update or delete on public.trade_pack_work_type_versions
  for each row execute function public.servsync_trade_pack_guard_definition_version();

create trigger contractor_trade_pack_grants_guard
  before update or delete on public.contractor_trade_pack_capability_grants
  for each row execute function public.servsync_trade_pack_guard_capability_grant();

create trigger contractor_trade_pack_grants_touch_updated_at
  before update on public.contractor_trade_pack_capability_grants
  for each row execute function public.servsync_trade_pack_touch_updated_at();

insert into public.trade_pack_workflow_families (
  id,
  workflow_family_key,
  display_name,
  description
) values (
  'bf8d5386-8ddc-4cf3-90bf-658948b32a43',
  'service_call',
  'Service Call',
  'A bounded visit used to diagnose, maintain, or repair a customer-reported need inside the shared ServSync Work lifecycle.'
);

insert into public.trade_pack_trades (
  id,
  trade_key,
  display_name,
  description
) values (
  'f6724930-e5b1-4afb-b9be-9ff1ce80862f',
  'hvac',
  'HVAC',
  'Heating, ventilation, and air-conditioning classification. This identifier does not grant specialized capability.'
);

insert into public.trade_pack_capabilities (
  id,
  capability_key,
  display_name,
  description
) values (
  '9188050e-98b5-44ed-96f1-d3e0af66549c',
  'trade.hvac.workflow.no_cooling',
  'HVAC No Cooling Workflow',
  'Default-deny capability for creating the future specialized No Cooling workflow. Independent of products, prices, plans, trials, and billing providers.'
);

insert into public.trade_pack_work_types (
  id,
  work_type_key,
  trade_id,
  workflow_family_id,
  required_capability_id,
  is_enabled
) values (
  'e419ba51-b545-463b-91a1-e0d0b6710d84',
  'hvac.no_cooling_service_call',
  'f6724930-e5b1-4afb-b9be-9ff1ce80862f',
  'bf8d5386-8ddc-4cf3-90bf-658948b32a43',
  '9188050e-98b5-44ed-96f1-d3e0af66549c',
  false
);

insert into public.trade_pack_work_type_versions (
  id,
  work_type_id,
  version_number,
  version_status,
  display_name,
  description,
  definition_contract,
  published_at
) values (
  '02d0d4c9-d7a6-4fd1-b5ab-d1f44c96aa06',
  'e419ba51-b545-463b-91a1-e0d0b6710d84',
  1,
  'published',
  'No Cooling Service Call (Contract Validation Only)',
  'Disabled skeletal definition. It contains no diagnostic rules, readings, tests, findings, recommendations, safety instructions, or customer-facing HVAC guidance.',
  jsonb_build_object(
    'schema_version', 1,
    'section', jsonb_build_object(
      'key', 'no_cooling_service_call',
      'label', 'No Cooling Service Call',
      'description', 'Skeletal contract validation only. HVAC content requires qualified professional review.',
      'customer_visibility', 'contractor_private'
    ),
    'readings', jsonb_build_array(),
    'tests', jsonb_build_array(),
    'findings', jsonb_build_array(),
    'recommendations', jsonb_build_array()
  ),
  now()
);

create function public.servsync_resolve_trade_pack_capability(
  p_contractor_id uuid,
  p_capability_key text
)
returns table (
  contractor_id uuid,
  capability_key text,
  capability_known boolean,
  access_mode text,
  can_create_new boolean,
  can_continue_existing boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
     or p_contractor_id is null
     or not public.current_user_can_access_contractor(p_contractor_id) then
    raise exception using
      errcode = '42501',
      message = 'Trade Pack capability is unavailable.';
  end if;

  return query
  select
    p_contractor_id,
    lower(trim(coalesce(p_capability_key, ''))),
    capability.id is not null,
    coalesce(grant_row.access_mode, 'none'),
    coalesce(grant_row.access_mode = 'active', false),
    coalesce(grant_row.access_mode in ('active', 'completion_only'), false)
  from (select 1) seed
  left join public.trade_pack_capabilities capability
    on capability.capability_key = lower(trim(coalesce(p_capability_key, '')))
  left join public.contractor_trade_pack_capability_grants grant_row
    on grant_row.contractor_id = p_contractor_id
   and grant_row.capability_id = capability.id;
end;
$$;

create function public.servsync_list_available_trade_pack_work_types(
  p_contractor_id uuid
)
returns table (
  work_type_key text,
  trade_key text,
  workflow_family_key text,
  capability_key text,
  version_number integer,
  display_name text,
  description text,
  definition_contract jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
     or p_contractor_id is null
     or not public.current_user_can_access_contractor(p_contractor_id) then
    raise exception using
      errcode = '42501',
      message = 'Trade Pack work types are unavailable.';
  end if;

  return query
  select distinct on (work_type.id)
    work_type.work_type_key,
    trade.trade_key,
    family.workflow_family_key,
    capability.capability_key,
    version.version_number,
    version.display_name,
    version.description,
    version.definition_contract
  from public.trade_pack_work_types work_type
  join public.trade_pack_trades trade on trade.id = work_type.trade_id
  join public.trade_pack_workflow_families family on family.id = work_type.workflow_family_id
  join public.trade_pack_capabilities capability on capability.id = work_type.required_capability_id
  join public.contractor_trade_pack_capability_grants grant_row
    on grant_row.contractor_id = p_contractor_id
   and grant_row.capability_id = capability.id
   and grant_row.access_mode = 'active'
  join public.trade_pack_work_type_versions version
    on version.work_type_id = work_type.id
   and version.version_status = 'published'
  where work_type.is_enabled
  order by work_type.id, version.version_number desc;
end;
$$;

create function public.servsync_get_trade_pack_work_type_version(
  p_contractor_id uuid,
  p_work_type_key text,
  p_version_number integer
)
returns table (
  work_type_key text,
  trade_key text,
  workflow_family_key text,
  capability_key text,
  version_number integer,
  display_name text,
  description text,
  definition_contract jsonb,
  can_create_new boolean,
  can_continue_existing boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
     or p_contractor_id is null
     or not public.current_user_can_access_contractor(p_contractor_id) then
    raise exception using
      errcode = '42501',
      message = 'Trade Pack work type is unavailable.';
  end if;

  return query
  select
    work_type.work_type_key,
    trade.trade_key,
    family.workflow_family_key,
    capability.capability_key,
    version.version_number,
    version.display_name,
    version.description,
    version.definition_contract,
    grant_row.access_mode = 'active',
    grant_row.access_mode in ('active', 'completion_only')
  from public.trade_pack_work_types work_type
  join public.trade_pack_trades trade on trade.id = work_type.trade_id
  join public.trade_pack_workflow_families family on family.id = work_type.workflow_family_id
  join public.trade_pack_capabilities capability on capability.id = work_type.required_capability_id
  join public.contractor_trade_pack_capability_grants grant_row
    on grant_row.contractor_id = p_contractor_id
   and grant_row.capability_id = capability.id
   and grant_row.access_mode in ('active', 'completion_only')
  join public.trade_pack_work_type_versions version
    on version.work_type_id = work_type.id
   and version.version_status in ('published', 'retired')
  where work_type.is_enabled
    and work_type.work_type_key = lower(trim(coalesce(p_work_type_key, '')))
    and version.version_number = p_version_number;
end;
$$;

alter function public.servsync_trade_pack_jsonb_has_exact_keys(jsonb, text[]) owner to postgres;
alter function public.servsync_trade_pack_definition_contract_is_valid(jsonb) owner to postgres;
alter function public.servsync_trade_pack_touch_updated_at() owner to postgres;
alter function public.servsync_trade_pack_guard_catalog_identity() owner to postgres;
alter function public.servsync_trade_pack_guard_work_type_identity() owner to postgres;
alter function public.servsync_trade_pack_guard_definition_version() owner to postgres;
alter function public.servsync_trade_pack_guard_capability_grant() owner to postgres;
alter function public.servsync_resolve_trade_pack_capability(uuid, text) owner to postgres;
alter function public.servsync_list_available_trade_pack_work_types(uuid) owner to postgres;
alter function public.servsync_get_trade_pack_work_type_version(uuid, text, integer) owner to postgres;

alter table public.trade_pack_workflow_families owner to postgres;
alter table public.trade_pack_trades owner to postgres;
alter table public.trade_pack_capabilities owner to postgres;
alter table public.trade_pack_work_types owner to postgres;
alter table public.trade_pack_work_type_versions owner to postgres;
alter table public.contractor_trade_pack_capability_grants owner to postgres;

alter table public.trade_pack_workflow_families enable row level security;
alter table public.trade_pack_workflow_families force row level security;
alter table public.trade_pack_trades enable row level security;
alter table public.trade_pack_trades force row level security;
alter table public.trade_pack_capabilities enable row level security;
alter table public.trade_pack_capabilities force row level security;
alter table public.trade_pack_work_types enable row level security;
alter table public.trade_pack_work_types force row level security;
alter table public.trade_pack_work_type_versions enable row level security;
alter table public.trade_pack_work_type_versions force row level security;
alter table public.contractor_trade_pack_capability_grants enable row level security;
alter table public.contractor_trade_pack_capability_grants force row level security;

revoke all on table public.trade_pack_workflow_families from public, anon, authenticated, service_role;
revoke all on table public.trade_pack_trades from public, anon, authenticated, service_role;
revoke all on table public.trade_pack_capabilities from public, anon, authenticated, service_role;
revoke all on table public.trade_pack_work_types from public, anon, authenticated, service_role;
revoke all on table public.trade_pack_work_type_versions from public, anon, authenticated, service_role;
revoke all on table public.contractor_trade_pack_capability_grants from public, anon, authenticated, service_role;

revoke all on function public.servsync_trade_pack_jsonb_has_exact_keys(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function public.servsync_trade_pack_definition_contract_is_valid(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_trade_pack_touch_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.servsync_trade_pack_guard_catalog_identity() from public, anon, authenticated, service_role;
revoke all on function public.servsync_trade_pack_guard_work_type_identity() from public, anon, authenticated, service_role;
revoke all on function public.servsync_trade_pack_guard_definition_version() from public, anon, authenticated, service_role;
revoke all on function public.servsync_trade_pack_guard_capability_grant() from public, anon, authenticated, service_role;
revoke all on function public.servsync_resolve_trade_pack_capability(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_list_available_trade_pack_work_types(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_trade_pack_work_type_version(uuid, text, integer) from public, anon, authenticated, service_role;

grant execute on function public.servsync_resolve_trade_pack_capability(uuid, text) to authenticated;
grant execute on function public.servsync_list_available_trade_pack_work_types(uuid) to authenticated;
grant execute on function public.servsync_get_trade_pack_work_type_version(uuid, text, integer) to authenticated;

comment on table public.trade_pack_work_type_versions is
  'Immutable published Trade Pack definition versions. Runtime sections will retain the selected version and an independent snapshot so later definitions cannot rewrite historical work.';

comment on table public.contractor_trade_pack_capability_grants is
  'Provider- and price-neutral contractor capability state. active permits new specialized work; completion_only permits existing instantiated work to complete; revoked grants no specialized mutation authority. Historical record reads are authorized by their owning record, not this table.';

comment on function public.servsync_get_trade_pack_work_type_version(uuid, text, integer) is
  'Returns an enabled immutable version only for the exact contractor and an active or completion-only capability. Runtime records must still prove their own tenant and instance authorization.';

notify pgrst, 'reload schema';

commit;
