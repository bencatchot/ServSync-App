-- ServSync Durable Trade Section Instances v1.
--
-- Hidden Sandbox-only runtime foundation joining the canonical Trade Pack
-- catalog to ServSync's existing durable Draft/Job, property, and Property
-- Asset identities. This migration creates no UI, capability grant, enabled
-- work type, customer projection, or professional trade content.

begin;

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'contractor_profiles',
    'contractor_team_members',
    'contractor_work_drafts',
    'inspections',
    'estimates',
    'homes',
    'contractor_local_contacts',
    'contractor_local_homes',
    'home_assets',
    'home_asset_revisions',
    'trade_pack_workflow_families',
    'trade_pack_trades',
    'trade_pack_capabilities',
    'trade_pack_work_types',
    'trade_pack_work_type_versions',
    'contractor_trade_pack_capability_grants'
  ] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'Missing Durable Trade Section prerequisite public.%.', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'auth.uid()',
    'public.current_user_can_access_contractor(uuid)',
    'public.servsync_trade_pack_definition_contract_is_valid(jsonb)',
    'public.servsync_private_can_read_property_assets(uuid,uuid,uuid)',
    'public.servsync_private_can_manage_property_assets(uuid,uuid,uuid)'
  ] loop
    if to_regprocedure(v_name) is null then
      raise exception 'Missing Durable Trade Section prerequisite function %.', v_name;
    end if;
  end loop;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'contractor_local_homes'
       and column_name in ('home_id', 'claimed_at', 'archived_at')
     group by table_schema, table_name
    having count(*) = 3
  ) then
    raise exception 'Durable Trade Sections require the current local-property claim/archive contract.';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'contractor_work_drafts'
       and column_name in (
         'contractor_id', 'homeowner_user_id', 'home_id', 'local_contact_id',
         'local_home_id', 'status', 'launched_output_type',
         'launched_estimate_id_snapshot', 'launched_job_id_snapshot'
       )
     group by table_schema, table_name
    having count(*) = 9
  ) then
    raise exception 'Durable Trade Sections require the current durable Draft launch contract.';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'inspections'
       and column_name in (
         'contractor_id', 'homeowner_user_id', 'home_id', 'local_contact_id',
         'local_home_id', 'estimate_id', 'status', 'job_status'
       )
     group by table_schema, table_name
    having count(*) = 8
  ) then
    raise exception 'Durable Trade Sections require the current canonical Job contract.';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'estimates'
       and column_name in (
         'contractor_id', 'homeowner_user_id', 'home_id', 'local_contact_id', 'local_home_id'
       )
     group by table_schema, table_name
    having count(*) = 5
  ) then
    raise exception 'Durable Trade Sections require the current canonical Estimate property contract.';
  end if;

  if not (
    select relrowsecurity and relforcerowsecurity
      from pg_class
     where oid = 'public.home_assets'::regclass
  ) or not (
    select relrowsecurity and relforcerowsecurity
      from pg_class
     where oid = 'public.trade_pack_work_type_versions'::regclass
  ) then
    raise exception 'Durable Trade Sections require the forced-RLS Trade Pack and Property Asset foundations.';
  end if;

  foreach v_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_name) then
      raise exception 'Missing required database role %.', v_name;
    end if;
  end loop;

  if not exists (select 1 from pg_extension where extname = 'pgcrypto')
     or (
       to_regprocedure('extensions.digest(text,text)') is null
       and to_regprocedure('public.digest(text,text)') is null
     ) then
    raise exception 'Durable Trade Sections require the trusted pgcrypto digest function.';
  end if;

  foreach v_name in array array['trade_section_instances', 'trade_section_revisions'] loop
    if to_regclass('public.' || v_name) is not null then
      raise exception 'Durable Trade Section target public.% already exists; refusing partial or repeated installation.', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'servsync_trade_section_values_are_valid(jsonb,jsonb)',
    'servsync_private_trade_section_access_role(uuid)',
    'servsync_private_trade_section_instance_is_mutable(uuid)',
    'servsync_private_guard_trade_section_instance()',
    'servsync_private_record_trade_section_revision()',
    'servsync_private_guard_trade_section_revision()',
    'servsync_private_guard_trade_section_truncate()',
    'servsync_private_sync_trade_section_draft_lineage()',
    'servsync_private_sync_trade_section_job_lineage()',
    'servsync_private_map_claimed_trade_sections()',
    'servsync_list_trade_section_instances(uuid,uuid)',
    'servsync_create_trade_section_instance(uuid,uuid,text,integer,uuid,jsonb,integer,uuid)',
    'servsync_update_trade_section_values(uuid,bigint,jsonb)',
    'servsync_set_trade_section_lifecycle(uuid,bigint,text)',
    'servsync_list_trade_section_revisions(uuid)'
  ] loop
    if to_regprocedure('public.' || v_name) is not null then
      raise exception 'Durable Trade Section target function public.% already exists; refusing partial installation.', v_name;
    end if;
  end loop;
end;
$$;

create function public.servsync_trade_section_values_are_valid(
  p_values jsonb,
  p_definition jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_value jsonb;
  v_field jsonb;
  v_group text;
  v_type text;
  v_text text;
  v_numeric numeric;
begin
  if jsonb_typeof(p_values) <> 'object'
     or pg_column_size(p_values) > 65536
     or (select count(*) from jsonb_object_keys(p_values)) > 400
     or not public.servsync_trade_pack_definition_contract_is_valid(p_definition) then
    return false;
  end if;

  for v_group in select unnest(array['readings', 'tests']) loop
    for v_field in select value from jsonb_array_elements(p_definition -> v_group) loop
      if (v_field ->> 'required')::boolean
         and not (p_values ? (v_field ->> 'key')) then
        return false;
      end if;
    end loop;
  end loop;

  for v_key, v_value in select key, value from jsonb_each(p_values) loop
    if v_key !~ '^[a-z][a-z0-9_]{0,79}$'
       or v_key in ('__proto__', 'prototype', 'constructor') then
      return false;
    end if;

    v_field := null;
    v_group := null;
    for v_group in select unnest(array['readings', 'tests', 'findings', 'recommendations']) loop
      select item into v_field
        from jsonb_array_elements(p_definition -> v_group) item
       where item ->> 'key' = v_key;
      exit when v_field is not null;
    end loop;

    if v_field is null then
      return false;
    end if;

    if v_group in ('readings', 'tests') then
      v_type := v_field ->> 'value_type';
      if v_type = 'number' then
        if jsonb_typeof(v_value) <> 'number' then return false; end if;
        v_numeric := (v_value #>> '{}')::numeric;
        if abs(v_numeric) > 1000000000000 or scale(v_numeric) > 6 then return false; end if;
      elsif v_type = 'boolean' then
        if jsonb_typeof(v_value) <> 'boolean' then return false; end if;
      elsif v_type in ('text', 'choice') then
        if jsonb_typeof(v_value) <> 'string' then return false; end if;
        v_text := v_value #>> '{}';
        if length(v_text) > 2000 or v_text ~ '[[:cntrl:]]' then return false; end if;
        if (v_field ->> 'required')::boolean and length(btrim(v_text)) = 0 then return false; end if;
        if v_type = 'choice' and not exists (
          select 1 from jsonb_array_elements_text(v_field -> 'options') option_value
           where option_value = v_text
        ) then return false; end if;
      else
        return false;
      end if;
    elsif v_group = 'findings' then
      if not public.servsync_trade_pack_jsonb_has_exact_keys(v_value, array['severity', 'notes'])
         or jsonb_typeof(v_value -> 'severity') <> 'string'
         or jsonb_typeof(v_value -> 'notes') not in ('string', 'null') then
        return false;
      end if;
      v_text := v_value ->> 'severity';
      if not exists (
        select 1 from jsonb_array_elements_text(v_field -> 'severity_options') option_value
         where option_value = v_text
      ) then return false; end if;
      v_text := coalesce(v_value ->> 'notes', '');
      if length(v_text) > 4000 or v_text ~ '[[:cntrl:]]' then return false; end if;
    elsif v_group = 'recommendations' then
      if jsonb_typeof(v_value) <> 'string' then return false; end if;
      v_text := v_value #>> '{}';
      if length(v_text) > 4000 or v_text ~ '[[:cntrl:]]' then return false; end if;
    else
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create table public.trade_section_instances (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  work_draft_id uuid references public.contractor_work_drafts(id) on delete restrict,
  estimate_id uuid references public.estimates(id) on delete restrict,
  job_id uuid references public.inspections(id) on delete restrict,
  homeowner_user_id uuid,
  local_contact_id uuid,
  home_id uuid references public.homes(id) on delete restrict,
  local_home_id uuid references public.contractor_local_homes(id) on delete restrict,
  property_asset_id uuid references public.home_assets(id) on delete restrict,
  property_asset_revision_number bigint,
  workflow_family_id uuid not null references public.trade_pack_workflow_families(id) on delete restrict,
  workflow_family_key text not null,
  trade_id uuid not null references public.trade_pack_trades(id) on delete restrict,
  trade_key text not null,
  work_type_id uuid not null references public.trade_pack_work_types(id) on delete restrict,
  work_type_key text not null,
  capability_id uuid not null references public.trade_pack_capabilities(id) on delete restrict,
  capability_key text not null,
  definition_version_id uuid not null references public.trade_pack_work_type_versions(id) on delete restrict,
  definition_version_number integer not null,
  definition_schema_version integer not null,
  definition_snapshot jsonb not null,
  definition_snapshot_sha256 text not null,
  current_values jsonb not null default '{}'::jsonb,
  lifecycle_status text not null default 'active',
  current_revision_number bigint not null default 1,
  section_order integer not null default 0,
  origin_kind text not null,
  idempotency_key uuid not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lifecycle_changed_at timestamptz,
  constraint trade_section_instances_parent_check check (work_draft_id is not null or job_id is not null),
  constraint trade_section_instances_property_check check (home_id is not null or local_home_id is not null),
  constraint trade_section_instances_subject_check check (
    (homeowner_user_id is not null and local_contact_id is null and home_id is not null)
    or (local_contact_id is not null and local_home_id is not null)
  ),
  constraint trade_section_instances_asset_revision_check check (
    (property_asset_id is null and property_asset_revision_number is null)
    or (property_asset_id is not null and property_asset_revision_number > 0)
  ),
  constraint trade_section_instances_definition_version_check check (
    definition_version_number > 0 and definition_schema_version > 0
  ),
  constraint trade_section_instances_definition_hash_check check (
    definition_snapshot_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint trade_section_instances_lifecycle_check check (
    lifecycle_status in ('active', 'completed', 'abandoned', 'voided')
  ),
  constraint trade_section_instances_revision_check check (current_revision_number > 0),
  constraint trade_section_instances_order_check check (section_order between 0 and 999),
  constraint trade_section_instances_origin_check check (origin_kind in ('draft', 'job')),
  constraint trade_section_instances_values_check check (
    public.servsync_trade_section_values_are_valid(current_values, definition_snapshot)
  ),
  unique (contractor_id, idempotency_key)
);

create table public.trade_section_revisions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.trade_section_instances(id) on delete restrict,
  revision_number bigint not null,
  contractor_id uuid not null,
  work_draft_id uuid,
  estimate_id uuid,
  job_id uuid,
  homeowner_user_id uuid,
  local_contact_id uuid,
  home_id uuid,
  local_home_id uuid,
  property_asset_id uuid,
  property_asset_revision_number bigint,
  definition_version_id uuid not null,
  definition_version_number integer not null,
  definition_schema_version integer not null,
  definition_snapshot jsonb not null,
  definition_snapshot_sha256 text not null,
  values_snapshot jsonb not null,
  lifecycle_status text not null,
  section_order integer not null,
  change_kind text not null,
  source_kind text not null,
  actor_user_id uuid,
  recorded_at timestamptz not null default now(),
  unique (instance_id, revision_number),
  constraint trade_section_revisions_change_kind_check check (
    change_kind in ('created', 'values_updated', 'completed', 'abandoned', 'voided', 'draft_linked', 'estimate_linked', 'job_linked', 'claim_mapped')
  ),
  constraint trade_section_revisions_source_kind_check check (
    source_kind in ('authenticated_rpc', 'workflow_trigger', 'claim_trigger')
  )
);

create index trade_section_instances_draft_order_idx
  on public.trade_section_instances(work_draft_id, section_order, created_at, id)
  where work_draft_id is not null;
create index trade_section_instances_job_order_idx
  on public.trade_section_instances(job_id, section_order, created_at, id)
  where job_id is not null;
create index trade_section_instances_estimate_idx
  on public.trade_section_instances(estimate_id, created_at, id)
  where estimate_id is not null;
create index trade_section_instances_property_idx
  on public.trade_section_instances(contractor_id, home_id, local_home_id, created_at, id);
create index trade_section_instances_asset_idx
  on public.trade_section_instances(property_asset_id, created_at, id)
  where property_asset_id is not null;
create index trade_section_instances_capability_idx
  on public.trade_section_instances(contractor_id, capability_id, lifecycle_status, created_at, id);
create index trade_section_revisions_instance_idx
  on public.trade_section_revisions(instance_id, revision_number desc);
create index trade_section_revisions_contractor_idx
  on public.trade_section_revisions(contractor_id, recorded_at desc, id);

create function public.servsync_private_trade_section_access_role(p_contractor_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
begin
  if auth.uid() is null or p_contractor_id is null then return null; end if;

  select case
           when contractor.owner_user_id = auth.uid() then 'owner'
           else member.role
         end
    into v_role
    from public.contractor_profiles contractor
    left join public.contractor_team_members member
      on member.contractor_id = contractor.id
     and member.user_id = auth.uid()
     and member.status = 'active'
   where contractor.id = p_contractor_id
     and contractor.account_status = 'active'
     and (contractor.owner_user_id = auth.uid() or member.id is not null)
   limit 1;

  return v_role;
end;
$$;

create function public.servsync_private_trade_section_instance_is_mutable(p_instance_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_instance public.trade_section_instances;
  v_draft public.contractor_work_drafts;
  v_job public.inspections;
  v_connection_ok boolean := false;
  v_local_ok boolean := false;
begin
  select * into v_instance from public.trade_section_instances where id = p_instance_id;
  if v_instance.id is null or v_instance.lifecycle_status <> 'active' then return false; end if;

  if v_instance.job_id is not null then
    select * into v_job from public.inspections where id = v_instance.job_id;
    if v_job.id is null
       or v_job.contractor_id <> v_instance.contractor_id
       or v_job.job_status not in ('draft', 'scheduled', 'in_progress')
       or v_job.status = 'finalized'
       or (
         v_job.local_home_id is not null
         and (
           v_job.local_home_id is distinct from v_instance.local_home_id
           or v_job.local_contact_id is distinct from v_instance.local_contact_id
         )
       )
       or (
         v_job.local_home_id is null
         and (
           v_job.home_id is distinct from v_instance.home_id
           or v_job.homeowner_user_id is distinct from v_instance.homeowner_user_id
         )
       ) then
      return false;
    end if;
  elsif v_instance.work_draft_id is not null then
    select * into v_draft from public.contractor_work_drafts where id = v_instance.work_draft_id;
    if v_draft.id is null
       or v_draft.contractor_id <> v_instance.contractor_id
       or v_draft.status <> 'active'
       or (
         v_draft.local_home_id is not null
         and (
           v_draft.local_home_id is distinct from v_instance.local_home_id
           or v_draft.local_contact_id is distinct from v_instance.local_contact_id
         )
       )
       or (
         v_draft.local_home_id is null
         and (
           v_draft.home_id is distinct from v_instance.home_id
           or v_draft.homeowner_user_id is distinct from v_instance.homeowner_user_id
         )
       ) then
      return false;
    end if;
  else
    return false;
  end if;

  if v_instance.home_id is not null then
    select exists (
      select 1
        from public.homeowner_contractor_connections connection
        join public.connection_shared_properties shared on shared.connection_id = connection.id
       where connection.contractor_id = v_instance.contractor_id
         and connection.homeowner_user_id = v_instance.homeowner_user_id
         and connection.status = 'active'
         and shared.home_id = v_instance.home_id
         and shared.share_home_overview
    ) into v_connection_ok;
  end if;

  if v_instance.local_home_id is not null and v_instance.home_id is null then
    select exists (
      select 1
        from public.contractor_local_homes local_home
        join public.contractor_local_contacts contact on contact.id = local_home.local_contact_id
       where local_home.id = v_instance.local_home_id
         and local_home.contractor_id = v_instance.contractor_id
         and local_home.local_contact_id = v_instance.local_contact_id
         and local_home.home_id is null
         and local_home.claimed_at is null
         and local_home.archived_at is null
         and contact.contractor_id = v_instance.contractor_id
         and contact.homeowner_user_id is null
         and contact.claimed_at is null
         and contact.archived_at is null
    ) into v_local_ok;
  end if;

  return v_connection_ok or v_local_ok;
end;
$$;

create function public.servsync_private_guard_trade_section_instance()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_kind text := current_setting('servsync.trade_section_change_kind', true);
begin
  if current_user <> 'postgres' then
    raise exception 'Trade Section instances require the controlled mutation boundary.';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Trade Section instances cannot be hard-deleted.';
  end if;

  if tg_op = 'INSERT' then
    if v_kind <> 'created' or new.current_revision_number <> 1 then
      raise exception 'Trade Section instance creation requires the controlled mutation boundary.';
    end if;
    return new;
  end if;

  if new.id <> old.id
     or new.contractor_id <> old.contractor_id
     or new.work_draft_id is distinct from old.work_draft_id
     or new.local_contact_id is distinct from old.local_contact_id
     or new.local_home_id is distinct from old.local_home_id
     or new.property_asset_id is distinct from old.property_asset_id
     or new.property_asset_revision_number is distinct from old.property_asset_revision_number
     or new.workflow_family_id <> old.workflow_family_id
     or new.workflow_family_key <> old.workflow_family_key
     or new.trade_id <> old.trade_id
     or new.trade_key <> old.trade_key
     or new.work_type_id <> old.work_type_id
     or new.work_type_key <> old.work_type_key
     or new.capability_id <> old.capability_id
     or new.capability_key <> old.capability_key
     or new.definition_version_id <> old.definition_version_id
     or new.definition_version_number <> old.definition_version_number
     or new.definition_schema_version <> old.definition_schema_version
     or new.definition_snapshot <> old.definition_snapshot
     or new.definition_snapshot_sha256 <> old.definition_snapshot_sha256
     or new.section_order <> old.section_order
     or new.origin_kind <> old.origin_kind
     or new.idempotency_key <> old.idempotency_key
     or new.created_by_user_id <> old.created_by_user_id
     or new.created_at <> old.created_at then
    raise exception 'Trade Section identity, governing definition, property lineage, asset snapshot, and origin are immutable.';
  end if;

  if new.current_revision_number <> old.current_revision_number + 1 then
    raise exception 'Trade Section revision must advance exactly once.';
  end if;

  if v_kind in ('values_updated', 'completed', 'abandoned', 'voided') then
    if new.homeowner_user_id is distinct from old.homeowner_user_id
       or new.home_id is distinct from old.home_id
       or new.estimate_id is distinct from old.estimate_id
       or new.job_id is distinct from old.job_id then
      raise exception 'Trade Section workflow and property linkage cannot be caller-reassigned.';
    end if;
    if v_kind = 'values_updated' and (
      new.lifecycle_status <> old.lifecycle_status
      or new.lifecycle_changed_at is distinct from old.lifecycle_changed_at
    ) then raise exception 'Trade Section value updates cannot change lifecycle.'; end if;
    if v_kind in ('completed', 'abandoned', 'voided') and (
      old.lifecycle_status <> 'active'
      or new.lifecycle_status <> v_kind
      or new.current_values <> old.current_values
    ) then raise exception 'Trade Section lifecycle transition is invalid.'; end if;
  elsif v_kind = 'claim_mapped' then
    if old.home_id is not null or new.home_id is null
       or old.homeowner_user_id is not null or new.homeowner_user_id is null
       or new.estimate_id is distinct from old.estimate_id
       or new.job_id is distinct from old.job_id
       or new.current_values <> old.current_values
       or new.lifecycle_status <> old.lifecycle_status then
      raise exception 'Trade Section claim mapping is invalid.';
    end if;
  elsif v_kind = 'estimate_linked' then
    if old.estimate_id is not null or new.estimate_id is null
       or new.homeowner_user_id is distinct from old.homeowner_user_id
       or new.home_id is distinct from old.home_id
       or new.job_id is distinct from old.job_id
       or new.current_values <> old.current_values
       or new.lifecycle_status <> old.lifecycle_status then
      raise exception 'Trade Section Estimate linkage is invalid.';
    end if;
  elsif v_kind = 'job_linked' then
    if old.job_id is not null or new.job_id is null
       or new.homeowner_user_id is distinct from old.homeowner_user_id
       or new.home_id is distinct from old.home_id
       or new.current_values <> old.current_values
       or new.lifecycle_status <> old.lifecycle_status then
      raise exception 'Trade Section Job linkage is invalid.';
    end if;
  else
    raise exception 'Unknown Trade Section mutation provenance.';
  end if;

  return new;
end;
$$;

create function public.servsync_private_record_trade_section_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user <> 'postgres' then
    raise exception 'Trade Section revision recording requires the controlled mutation boundary.';
  end if;

  perform set_config('servsync.trade_section_revision_write', 'allowed', true);
  insert into public.trade_section_revisions (
    instance_id, revision_number, contractor_id, work_draft_id, estimate_id, job_id,
    homeowner_user_id, local_contact_id, home_id, local_home_id,
    property_asset_id, property_asset_revision_number,
    definition_version_id, definition_version_number, definition_schema_version,
    definition_snapshot, definition_snapshot_sha256, values_snapshot,
    lifecycle_status, section_order, change_kind, source_kind, actor_user_id
  ) values (
    new.id, new.current_revision_number, new.contractor_id, new.work_draft_id,
    new.estimate_id, new.job_id, new.homeowner_user_id, new.local_contact_id,
    new.home_id, new.local_home_id, new.property_asset_id,
    new.property_asset_revision_number, new.definition_version_id,
    new.definition_version_number, new.definition_schema_version,
    new.definition_snapshot, new.definition_snapshot_sha256, new.current_values,
    new.lifecycle_status, new.section_order,
    current_setting('servsync.trade_section_change_kind', true),
    current_setting('servsync.trade_section_source_kind', true),
    auth.uid()
  );
  return new;
end;
$$;

create function public.servsync_private_guard_trade_section_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT'
     and current_user = 'postgres'
     and current_setting('servsync.trade_section_revision_write', true) = 'allowed' then
    return new;
  end if;
  raise exception 'Trade Section revisions are append-only and immutable.';
end;
$$;

create function public.servsync_private_guard_trade_section_truncate()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Durable Trade Section history cannot be truncated.';
end;
$$;

create trigger trade_section_instances_guard
  before insert or update or delete on public.trade_section_instances
  for each row execute function public.servsync_private_guard_trade_section_instance();
create trigger trade_section_instances_record_revision
  after insert or update on public.trade_section_instances
  for each row execute function public.servsync_private_record_trade_section_revision();
create trigger trade_section_instances_guard_truncate
  before truncate on public.trade_section_instances
  for each statement execute function public.servsync_private_guard_trade_section_truncate();
create trigger trade_section_revisions_guard
  before insert or update or delete on public.trade_section_revisions
  for each row execute function public.servsync_private_guard_trade_section_revision();
create trigger trade_section_revisions_guard_truncate
  before truncate on public.trade_section_revisions
  for each statement execute function public.servsync_private_guard_trade_section_truncate();

create function public.servsync_private_sync_trade_section_draft_lineage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.trade_section_instances instance
     where instance.work_draft_id = new.id
       and (
         instance.contractor_id <> new.contractor_id
         or (
           instance.local_home_id is not null
           and (
             new.local_home_id is distinct from instance.local_home_id
             or new.local_contact_id is distinct from instance.local_contact_id
             or (new.home_id is not null and new.home_id is distinct from instance.home_id)
             or (new.homeowner_user_id is not null and new.homeowner_user_id is distinct from instance.homeowner_user_id)
           )
         )
         or (
           instance.local_home_id is null
           and (
             new.local_home_id is not null
             or new.local_contact_id is not null
             or new.home_id is distinct from instance.home_id
             or new.homeowner_user_id is distinct from instance.homeowner_user_id
           )
         )
       )
  ) then
    raise exception 'Trade Section Draft lineage is invalid.';
  end if;

  if old.launched_estimate_id_snapshot is not null
     and new.launched_estimate_id_snapshot is distinct from old.launched_estimate_id_snapshot
     and exists (
       select 1 from public.trade_section_instances instance
        where instance.work_draft_id = new.id
     ) then
    raise exception 'Trade Section Estimate lineage cannot be rewritten.';
  end if;

  if old.launched_job_id_snapshot is not null
     and new.launched_job_id_snapshot is distinct from old.launched_job_id_snapshot
     and exists (
       select 1 from public.trade_section_instances instance
        where instance.work_draft_id = new.id
     ) then
    raise exception 'Trade Section Job lineage cannot be rewritten.';
  end if;

  if old.launched_estimate_id_snapshot is null and new.launched_estimate_id_snapshot is not null then
    if exists (
      select 1
        from public.trade_section_instances instance
       where instance.work_draft_id = new.id
         and not exists (
           select 1
             from public.estimates estimate
            where estimate.id = new.launched_estimate_id_snapshot
              and estimate.contractor_id = instance.contractor_id
              and (
                (
                  instance.local_home_id is not null
                  and estimate.local_home_id = instance.local_home_id
                  and estimate.local_contact_id = instance.local_contact_id
                  and (estimate.home_id is null or estimate.home_id = instance.home_id)
                  and (estimate.homeowner_user_id is null or estimate.homeowner_user_id = instance.homeowner_user_id)
                )
                or (
                  instance.local_home_id is null
                  and estimate.local_home_id is null
                  and estimate.local_contact_id is null
                  and estimate.home_id = instance.home_id
                  and estimate.homeowner_user_id = instance.homeowner_user_id
                )
              )
         )
    ) then
      raise exception 'Trade Section Estimate lineage is invalid.';
    end if;

    perform set_config('servsync.trade_section_change_kind', 'estimate_linked', true);
    perform set_config('servsync.trade_section_source_kind', 'workflow_trigger', true);
    update public.trade_section_instances instance
       set estimate_id = new.launched_estimate_id_snapshot,
           current_revision_number = current_revision_number + 1,
           updated_at = now()
     where instance.work_draft_id = new.id
       and instance.contractor_id = new.contractor_id
       and instance.estimate_id is null
       and exists (
         select 1
           from public.estimates estimate
          where estimate.id = new.launched_estimate_id_snapshot
            and estimate.contractor_id = instance.contractor_id
            and (
              (
                instance.local_home_id is not null
                and estimate.local_home_id = instance.local_home_id
                and estimate.local_contact_id = instance.local_contact_id
                and (estimate.home_id is null or estimate.home_id = instance.home_id)
                and (estimate.homeowner_user_id is null or estimate.homeowner_user_id = instance.homeowner_user_id)
              )
              or (
                instance.local_home_id is null
                and estimate.local_home_id is null
                and estimate.local_contact_id is null
                and estimate.home_id = instance.home_id
                and estimate.homeowner_user_id = instance.homeowner_user_id
              )
            )
       );
  end if;

  if old.launched_job_id_snapshot is null and new.launched_job_id_snapshot is not null then
    if exists (
      select 1
        from public.trade_section_instances instance
       where instance.work_draft_id = new.id
         and not exists (
           select 1
             from public.inspections job
            where job.id = new.launched_job_id_snapshot
              and job.contractor_id = instance.contractor_id
              and job.estimate_id is not distinct from instance.estimate_id
              and (
                (
                  instance.local_home_id is not null
                  and job.local_home_id = instance.local_home_id
                  and job.local_contact_id = instance.local_contact_id
                  and (job.home_id is null or job.home_id = instance.home_id)
                  and (job.homeowner_user_id is null or job.homeowner_user_id = instance.homeowner_user_id)
                )
                or (
                  instance.local_home_id is null
                  and job.local_home_id is null
                  and job.local_contact_id is null
                  and job.home_id = instance.home_id
                  and job.homeowner_user_id = instance.homeowner_user_id
                )
              )
         )
    ) then
      raise exception 'Trade Section Job lineage is invalid.';
    end if;

    perform set_config('servsync.trade_section_change_kind', 'job_linked', true);
    perform set_config('servsync.trade_section_source_kind', 'workflow_trigger', true);
    update public.trade_section_instances instance
       set job_id = new.launched_job_id_snapshot,
           current_revision_number = current_revision_number + 1,
           updated_at = now()
     where instance.work_draft_id = new.id
       and instance.contractor_id = new.contractor_id
       and instance.job_id is null
       and exists (
         select 1
           from public.inspections job
          where job.id = new.launched_job_id_snapshot
            and job.contractor_id = instance.contractor_id
            and job.estimate_id is not distinct from instance.estimate_id
            and (
              (
                instance.local_home_id is not null
                and job.local_home_id = instance.local_home_id
                and job.local_contact_id = instance.local_contact_id
                and (job.home_id is null or job.home_id = instance.home_id)
                and (job.homeowner_user_id is null or job.homeowner_user_id = instance.homeowner_user_id)
              )
              or (
                instance.local_home_id is null
                and job.local_home_id is null
                and job.local_contact_id is null
                and job.home_id = instance.home_id
                and job.homeowner_user_id = instance.homeowner_user_id
              )
            )
       );
  end if;
  return new;
end;
$$;

create function public.servsync_private_sync_trade_section_job_lineage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.trade_section_instances instance
     where instance.job_id = new.id
       and (
         instance.contractor_id <> new.contractor_id
         or instance.estimate_id is distinct from new.estimate_id
         or (
           instance.local_home_id is not null
           and (
             new.local_home_id is distinct from instance.local_home_id
             or new.local_contact_id is distinct from instance.local_contact_id
             or (new.home_id is not null and new.home_id is distinct from instance.home_id)
             or (new.homeowner_user_id is not null and new.homeowner_user_id is distinct from instance.homeowner_user_id)
           )
         )
         or (
           instance.local_home_id is null
           and (
             new.local_home_id is not null
             or new.local_contact_id is not null
             or new.home_id is distinct from instance.home_id
             or new.homeowner_user_id is distinct from instance.homeowner_user_id
           )
         )
       )
  ) then
    raise exception 'Trade Section Job lineage cannot be rewritten.';
  end if;

  if new.estimate_id is not null then
    if not exists (
      select 1
        from public.estimates estimate
       where estimate.id = new.estimate_id
         and estimate.contractor_id = new.contractor_id
         and (
           (
             new.local_home_id is not null
             and estimate.local_home_id = new.local_home_id
             and estimate.local_contact_id = new.local_contact_id
             and (estimate.home_id is null or new.home_id is null or estimate.home_id = new.home_id)
             and (
               estimate.homeowner_user_id is null
               or new.homeowner_user_id is null
               or estimate.homeowner_user_id = new.homeowner_user_id
             )
           )
           or (
             new.local_home_id is null
             and estimate.local_home_id is null
             and estimate.local_contact_id is null
             and estimate.home_id = new.home_id
             and estimate.homeowner_user_id = new.homeowner_user_id
           )
         )
    ) then
      raise exception 'Trade Section Job lineage is invalid.';
    end if;

    if exists (
      select 1
        from public.trade_section_instances instance
       where instance.contractor_id = new.contractor_id
         and instance.estimate_id = new.estimate_id
         and instance.job_id is null
         and (
           (
             instance.local_home_id is not null
             and (
               new.local_home_id is distinct from instance.local_home_id
               or new.local_contact_id is distinct from instance.local_contact_id
               or (new.home_id is not null and new.home_id is distinct from instance.home_id)
               or (new.homeowner_user_id is not null and new.homeowner_user_id is distinct from instance.homeowner_user_id)
             )
           )
           or (
             instance.local_home_id is null
             and (
               new.local_home_id is not null
               or new.local_contact_id is not null
               or new.home_id is distinct from instance.home_id
               or new.homeowner_user_id is distinct from instance.homeowner_user_id
             )
           )
           or not exists (
             select 1
               from public.estimates estimate
              where estimate.id = new.estimate_id
                and estimate.contractor_id = instance.contractor_id
                and (
                  (
                    instance.local_home_id is not null
                    and estimate.local_home_id = instance.local_home_id
                    and estimate.local_contact_id = instance.local_contact_id
                    and (estimate.home_id is null or estimate.home_id = instance.home_id)
                    and (estimate.homeowner_user_id is null or estimate.homeowner_user_id = instance.homeowner_user_id)
                  )
                  or (
                    instance.local_home_id is null
                    and estimate.local_home_id is null
                    and estimate.local_contact_id is null
                    and estimate.home_id = instance.home_id
                    and estimate.homeowner_user_id = instance.homeowner_user_id
                  )
                )
           )
         )
    ) then
      raise exception 'Trade Section Job lineage is invalid.';
    end if;

    perform set_config('servsync.trade_section_change_kind', 'job_linked', true);
    perform set_config('servsync.trade_section_source_kind', 'workflow_trigger', true);
    update public.trade_section_instances instance
       set job_id = new.id,
           current_revision_number = current_revision_number + 1,
           updated_at = now()
     where instance.contractor_id = new.contractor_id
       and instance.estimate_id = new.estimate_id
       and instance.job_id is null
       and (
         (
           instance.local_home_id is not null
           and new.local_home_id = instance.local_home_id
           and new.local_contact_id = instance.local_contact_id
           and (new.home_id is null or new.home_id = instance.home_id)
           and (new.homeowner_user_id is null or new.homeowner_user_id = instance.homeowner_user_id)
         )
         or (
           instance.local_home_id is null
           and new.local_home_id is null
           and new.local_contact_id is null
           and new.home_id = instance.home_id
           and new.homeowner_user_id = instance.homeowner_user_id
         )
       )
       and exists (
         select 1
           from public.estimates estimate
          where estimate.id = new.estimate_id
            and estimate.contractor_id = instance.contractor_id
            and (
              (
                instance.local_home_id is not null
                and estimate.local_home_id = instance.local_home_id
                and estimate.local_contact_id = instance.local_contact_id
                and (estimate.home_id is null or estimate.home_id = instance.home_id)
                and (estimate.homeowner_user_id is null or estimate.homeowner_user_id = instance.homeowner_user_id)
              )
              or (
                instance.local_home_id is null
                and estimate.local_home_id is null
                and estimate.local_contact_id is null
                and estimate.home_id = instance.home_id
                and estimate.homeowner_user_id = instance.homeowner_user_id
              )
            )
       );
  end if;
  return new;
end;
$$;

create function public.servsync_private_map_claimed_trade_sections()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_homeowner_user_id uuid;
begin
  select home.homeowner_user_id into v_homeowner_user_id
    from public.homes home where home.id = new.home_id;
  if v_homeowner_user_id is null then
    raise exception 'Claimed Trade Section property was not found.';
  end if;

  perform set_config('servsync.trade_section_change_kind', 'claim_mapped', true);
  perform set_config('servsync.trade_section_source_kind', 'claim_trigger', true);
  update public.trade_section_instances instance
     set home_id = new.home_id,
         homeowner_user_id = v_homeowner_user_id,
         current_revision_number = current_revision_number + 1,
         updated_at = now()
   where instance.local_home_id = new.id
     and instance.contractor_id = new.contractor_id
     and instance.home_id is null;
  return new;
end;
$$;

create trigger contractor_work_drafts_sync_trade_sections
  after update of contractor_id, homeowner_user_id, home_id, local_contact_id, local_home_id,
    launched_estimate_id_snapshot, launched_job_id_snapshot on public.contractor_work_drafts
  for each row execute function public.servsync_private_sync_trade_section_draft_lineage();
create trigger inspections_sync_trade_sections
  after insert or update of contractor_id, homeowner_user_id, home_id, local_contact_id, local_home_id, estimate_id
  on public.inspections
  for each row execute function public.servsync_private_sync_trade_section_job_lineage();
create trigger contractor_local_homes_map_trade_sections
  after update of home_id on public.contractor_local_homes
  for each row
  when (old.home_id is null and new.home_id is not null)
  execute function public.servsync_private_map_claimed_trade_sections();

create function public.servsync_create_trade_section_instance(
  p_work_draft_id uuid default null,
  p_job_id uuid default null,
  p_work_type_key text default null,
  p_version_number integer default null,
  p_property_asset_id uuid default null,
  p_values jsonb default '{}'::jsonb,
  p_section_order integer default 0,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_draft public.contractor_work_drafts;
  v_job public.inspections;
  v_local_home public.contractor_local_homes;
  v_home public.homes;
  v_asset public.home_assets;
  v_version public.trade_pack_work_type_versions;
  v_work_type public.trade_pack_work_types;
  v_trade public.trade_pack_trades;
  v_family public.trade_pack_workflow_families;
  v_capability public.trade_pack_capabilities;
  v_grant public.contractor_trade_pack_capability_grants;
  v_instance public.trade_section_instances;
  v_contractor_id uuid;
  v_homeowner_user_id uuid;
  v_local_contact_id uuid;
  v_home_id uuid;
  v_local_home_id uuid;
  v_estimate_id uuid;
  v_origin_kind text;
  v_role text;
  v_snapshot_hash text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Trade Section is unavailable.'; end if;
  if (p_work_draft_id is null) = (p_job_id is null)
     or p_idempotency_key is null
     or p_version_number is null or p_version_number <= 0
     or p_section_order not between 0 and 999 then
    raise exception 'Trade Section request is invalid.';
  end if;

  if p_work_draft_id is not null then
    select * into v_draft from public.contractor_work_drafts where id = p_work_draft_id for share;
    if v_draft.id is null or v_draft.status <> 'active' then raise exception 'Trade Section work record is unavailable.'; end if;
    v_contractor_id := v_draft.contractor_id;
    v_homeowner_user_id := v_draft.homeowner_user_id;
    v_local_contact_id := v_draft.local_contact_id;
    v_home_id := v_draft.home_id;
    v_local_home_id := v_draft.local_home_id;
    v_origin_kind := 'draft';
  else
    select * into v_job from public.inspections where id = p_job_id for share;
    if v_job.id is null or v_job.job_status not in ('draft', 'scheduled', 'in_progress') or v_job.status = 'finalized' then
      raise exception 'Trade Section work record is unavailable.';
    end if;
    v_contractor_id := v_job.contractor_id;
    v_homeowner_user_id := v_job.homeowner_user_id;
    v_local_contact_id := v_job.local_contact_id;
    v_home_id := v_job.home_id;
    v_local_home_id := v_job.local_home_id;
    v_estimate_id := v_job.estimate_id;
    v_origin_kind := 'job';
  end if;

  v_role := public.servsync_private_trade_section_access_role(v_contractor_id);
  if coalesce(v_role, '') not in ('owner', 'admin', 'office') then raise exception using errcode = '42501', message = 'Trade Section is unavailable.'; end if;

  if v_local_home_id is not null then
    select * into v_local_home from public.contractor_local_homes where id = v_local_home_id;
    if v_local_home.id is null or v_local_home.contractor_id <> v_contractor_id
       or v_local_home.local_contact_id <> v_local_contact_id then
      raise exception 'Trade Section property is unavailable.';
    end if;
    if v_local_home.home_id is not null then
      v_home_id := coalesce(v_home_id, v_local_home.home_id);
      select * into v_home from public.homes where id = v_home_id;
      v_homeowner_user_id := v_home.homeowner_user_id;
    end if;
  end if;

  if v_home_id is null and v_local_home_id is null then raise exception 'Trade Section requires an exact property.'; end if;

  if v_home_id is not null then
    if not exists (
      select 1 from public.homeowner_contractor_connections connection
      join public.connection_shared_properties shared on shared.connection_id = connection.id
      where connection.contractor_id = v_contractor_id
        and connection.homeowner_user_id = v_homeowner_user_id
        and connection.status = 'active'
        and shared.home_id = v_home_id
        and shared.share_home_overview
    ) then raise exception 'Trade Section property is unavailable.'; end if;
  elsif v_local_home.archived_at is not null or v_local_home.claimed_at is not null
     or exists (
       select 1 from public.contractor_local_contacts contact
        where contact.id = v_local_contact_id
          and (contact.archived_at is not null or contact.claimed_at is not null or contact.homeowner_user_id is not null)
     ) then
    raise exception 'Trade Section property is unavailable.';
  end if;

  select version.* into v_version
    from public.trade_pack_work_type_versions version
    join public.trade_pack_work_types work_type on work_type.id = version.work_type_id
   where work_type.work_type_key = lower(btrim(coalesce(p_work_type_key, '')))
     and work_type.is_enabled
     and version.version_number = p_version_number
     and version.version_status = 'published';
  if v_version.id is null then raise exception 'Trade Section definition is unavailable.'; end if;

  select * into v_work_type
    from public.trade_pack_work_types
   where id = v_version.work_type_id;

  select * into v_trade from public.trade_pack_trades where id = v_work_type.trade_id;
  select * into v_family from public.trade_pack_workflow_families where id = v_work_type.workflow_family_id;
  select * into v_capability from public.trade_pack_capabilities where id = v_work_type.required_capability_id;
  select * into v_grant from public.contractor_trade_pack_capability_grants
   where contractor_id = v_contractor_id and capability_id = v_capability.id;
  if v_grant.access_mode is distinct from 'active' then raise exception 'Trade Section capability is unavailable.'; end if;

  if not public.servsync_trade_section_values_are_valid(p_values, v_version.definition_contract) then
    raise exception 'Trade Section values do not match the governing definition.';
  end if;

  if p_property_asset_id is not null then
    select * into v_asset from public.home_assets where id = p_property_asset_id;
    if v_asset.id is null or v_asset.lifecycle_status <> 'active'
       or not (
         (v_home_id is not null and v_asset.home_id = v_home_id)
         or (v_home_id is null and v_asset.home_id is null and v_asset.local_home_id = v_local_home_id)
       ) then raise exception 'Trade Section asset is unavailable.'; end if;
  end if;

  select * into v_instance from public.trade_section_instances
   where contractor_id = v_contractor_id and idempotency_key = p_idempotency_key;
  if v_instance.id is not null then
    if (
         p_work_draft_id is not null
         and (v_instance.origin_kind <> 'draft' or v_instance.work_draft_id is distinct from p_work_draft_id)
       )
       or (
         p_job_id is not null
         and (v_instance.origin_kind <> 'job' or v_instance.job_id is distinct from p_job_id)
       )
       or v_instance.work_type_id <> v_work_type.id
       or v_instance.definition_version_id <> v_version.id
       or v_instance.property_asset_id is distinct from p_property_asset_id
       or v_instance.section_order <> p_section_order then
      raise exception 'Trade Section idempotency key conflicts with another request.';
    end if;
    return to_jsonb(v_instance);
  end if;

  v_snapshot_hash := encode(digest(v_version.definition_contract::text, 'sha256'), 'hex');
  perform set_config('servsync.trade_section_change_kind', 'created', true);
  perform set_config('servsync.trade_section_source_kind', 'authenticated_rpc', true);
  insert into public.trade_section_instances (
    contractor_id, work_draft_id, estimate_id, job_id,
    homeowner_user_id, local_contact_id, home_id, local_home_id,
    property_asset_id, property_asset_revision_number,
    workflow_family_id, workflow_family_key, trade_id, trade_key,
    work_type_id, work_type_key, capability_id, capability_key,
    definition_version_id, definition_version_number, definition_schema_version,
    definition_snapshot, definition_snapshot_sha256, current_values,
    section_order, origin_kind, idempotency_key, created_by_user_id
  ) values (
    v_contractor_id, p_work_draft_id, v_estimate_id, p_job_id,
    v_homeowner_user_id, v_local_contact_id, v_home_id, v_local_home_id,
    v_asset.id, v_asset.revision_number,
    v_family.id, v_family.workflow_family_key, v_trade.id, v_trade.trade_key,
    v_work_type.id, v_work_type.work_type_key, v_capability.id, v_capability.capability_key,
    v_version.id, v_version.version_number,
    (v_version.definition_contract ->> 'schema_version')::integer,
    v_version.definition_contract, v_snapshot_hash, p_values,
    p_section_order, v_origin_kind, p_idempotency_key, auth.uid()
  ) returning * into v_instance;
  return to_jsonb(v_instance);
end;
$$;

create function public.servsync_update_trade_section_values(
  p_instance_id uuid,
  p_expected_revision bigint,
  p_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_instance public.trade_section_instances;
  v_mode text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Trade Section is unavailable.'; end if;
  select * into v_instance from public.trade_section_instances where id = p_instance_id for update;
  if v_instance.id is null
     or coalesce(public.servsync_private_trade_section_access_role(v_instance.contractor_id), '') not in ('owner', 'admin', 'office')
     or not public.servsync_private_trade_section_instance_is_mutable(v_instance.id) then
    raise exception using errcode = '42501', message = 'Trade Section is unavailable.';
  end if;
  if v_instance.current_revision_number <> p_expected_revision then raise exception 'Trade Section has changed; refresh and try again.'; end if;

  select access_mode into v_mode from public.contractor_trade_pack_capability_grants
   where contractor_id = v_instance.contractor_id and capability_id = v_instance.capability_id;
  if coalesce(v_mode, '') not in ('active', 'completion_only') then raise exception 'Trade Section capability is unavailable.'; end if;
  if v_mode = 'completion_only' and not exists (
    select 1 from public.contractor_trade_pack_capability_grants grant_row
     where grant_row.contractor_id = v_instance.contractor_id
       and grant_row.capability_id = v_instance.capability_id
       and v_instance.created_at <= grant_row.updated_at
  ) then raise exception 'Trade Section capability is unavailable.'; end if;
  if not public.servsync_trade_section_values_are_valid(p_values, v_instance.definition_snapshot) then
    raise exception 'Trade Section values do not match the governing definition.';
  end if;

  perform set_config('servsync.trade_section_change_kind', 'values_updated', true);
  perform set_config('servsync.trade_section_source_kind', 'authenticated_rpc', true);
  update public.trade_section_instances
     set current_values = p_values,
         current_revision_number = current_revision_number + 1,
         updated_at = now()
   where id = v_instance.id returning * into v_instance;
  return to_jsonb(v_instance);
end;
$$;

create function public.servsync_set_trade_section_lifecycle(
  p_instance_id uuid,
  p_expected_revision bigint,
  p_lifecycle_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_instance public.trade_section_instances;
  v_mode text;
  v_next text := lower(btrim(coalesce(p_lifecycle_status, '')));
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Trade Section is unavailable.'; end if;
  if v_next not in ('completed', 'abandoned', 'voided') then raise exception 'Trade Section lifecycle transition is invalid.'; end if;
  select * into v_instance from public.trade_section_instances where id = p_instance_id for update;
  if v_instance.id is null
     or coalesce(public.servsync_private_trade_section_access_role(v_instance.contractor_id), '') not in ('owner', 'admin', 'office')
     or not public.servsync_private_trade_section_instance_is_mutable(v_instance.id) then
    raise exception using errcode = '42501', message = 'Trade Section is unavailable.';
  end if;
  if v_instance.current_revision_number <> p_expected_revision then raise exception 'Trade Section has changed; refresh and try again.'; end if;

  select access_mode into v_mode from public.contractor_trade_pack_capability_grants
   where contractor_id = v_instance.contractor_id and capability_id = v_instance.capability_id;
  if coalesce(v_mode, '') not in ('active', 'completion_only')
     or (
       v_mode = 'completion_only'
       and (
         v_next = 'voided'
         or not exists (
           select 1 from public.contractor_trade_pack_capability_grants grant_row
            where grant_row.contractor_id = v_instance.contractor_id
              and grant_row.capability_id = v_instance.capability_id
              and v_instance.created_at <= grant_row.updated_at
         )
       )
     ) then
    raise exception 'Trade Section capability is unavailable.';
  end if;

  perform set_config('servsync.trade_section_change_kind', v_next, true);
  perform set_config('servsync.trade_section_source_kind', 'authenticated_rpc', true);
  update public.trade_section_instances
     set lifecycle_status = v_next,
         current_revision_number = current_revision_number + 1,
         lifecycle_changed_at = now(),
         updated_at = now()
   where id = v_instance.id returning * into v_instance;
  return to_jsonb(v_instance);
end;
$$;

create function public.servsync_list_trade_section_instances(
  p_work_draft_id uuid default null,
  p_job_id uuid default null
)
returns setof public.trade_section_instances
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_contractor_id uuid;
  v_role text;
begin
  if auth.uid() is null or (p_work_draft_id is null) = (p_job_id is null) then
    raise exception using errcode = '42501', message = 'Trade Section is unavailable.';
  end if;
  if p_work_draft_id is not null then
    select contractor_id into v_contractor_id from public.contractor_work_drafts where id = p_work_draft_id;
  else
    select contractor_id into v_contractor_id from public.inspections where id = p_job_id;
  end if;
  v_role := public.servsync_private_trade_section_access_role(v_contractor_id);
  if coalesce(v_role, '') not in ('owner', 'admin', 'office', 'viewer') then
    raise exception using errcode = '42501', message = 'Trade Section is unavailable.';
  end if;
  return query
  select instance.* from public.trade_section_instances instance
   where instance.contractor_id = v_contractor_id
     and (
       (p_work_draft_id is not null and instance.work_draft_id = p_work_draft_id)
       or (p_job_id is not null and instance.job_id = p_job_id)
     )
   order by instance.section_order, instance.created_at, instance.id;
end;
$$;

create function public.servsync_list_trade_section_revisions(p_instance_id uuid)
returns setof public.trade_section_revisions
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_contractor_id uuid;
  v_role text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Trade Section is unavailable.'; end if;
  select contractor_id into v_contractor_id from public.trade_section_instances where id = p_instance_id;
  v_role := public.servsync_private_trade_section_access_role(v_contractor_id);
  if coalesce(v_role, '') not in ('owner', 'admin', 'office', 'viewer') then
    raise exception using errcode = '42501', message = 'Trade Section is unavailable.';
  end if;
  return query select revision.* from public.trade_section_revisions revision
   where revision.instance_id = p_instance_id
     and revision.contractor_id = v_contractor_id
   order by revision.revision_number;
end;
$$;

alter table public.trade_section_instances owner to postgres;
alter table public.trade_section_revisions owner to postgres;
alter table public.trade_section_instances enable row level security;
alter table public.trade_section_instances force row level security;
alter table public.trade_section_revisions enable row level security;
alter table public.trade_section_revisions force row level security;

alter function public.servsync_trade_section_values_are_valid(jsonb,jsonb) owner to postgres;
alter function public.servsync_private_trade_section_access_role(uuid) owner to postgres;
alter function public.servsync_private_trade_section_instance_is_mutable(uuid) owner to postgres;
alter function public.servsync_private_guard_trade_section_instance() owner to postgres;
alter function public.servsync_private_record_trade_section_revision() owner to postgres;
alter function public.servsync_private_guard_trade_section_revision() owner to postgres;
alter function public.servsync_private_guard_trade_section_truncate() owner to postgres;
alter function public.servsync_private_sync_trade_section_draft_lineage() owner to postgres;
alter function public.servsync_private_sync_trade_section_job_lineage() owner to postgres;
alter function public.servsync_private_map_claimed_trade_sections() owner to postgres;
alter function public.servsync_list_trade_section_instances(uuid,uuid) owner to postgres;
alter function public.servsync_create_trade_section_instance(uuid,uuid,text,integer,uuid,jsonb,integer,uuid) owner to postgres;
alter function public.servsync_update_trade_section_values(uuid,bigint,jsonb) owner to postgres;
alter function public.servsync_set_trade_section_lifecycle(uuid,bigint,text) owner to postgres;
alter function public.servsync_list_trade_section_revisions(uuid) owner to postgres;

revoke all on table public.trade_section_instances from public, anon, authenticated, service_role;
revoke all on table public.trade_section_revisions from public, anon, authenticated, service_role;
grant select on table public.trade_section_instances, public.trade_section_revisions to service_role;

revoke all on function public.servsync_trade_section_values_are_valid(jsonb,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_trade_section_access_role(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_trade_section_instance_is_mutable(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_trade_section_instance() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_record_trade_section_revision() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_trade_section_revision() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_trade_section_truncate() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_sync_trade_section_draft_lineage() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_sync_trade_section_job_lineage() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_map_claimed_trade_sections() from public, anon, authenticated, service_role;
revoke all on function public.servsync_list_trade_section_instances(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_create_trade_section_instance(uuid,uuid,text,integer,uuid,jsonb,integer,uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_update_trade_section_values(uuid,bigint,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_set_trade_section_lifecycle(uuid,bigint,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_list_trade_section_revisions(uuid) from public, anon, authenticated, service_role;

grant execute on function public.servsync_list_trade_section_instances(uuid,uuid) to authenticated;
grant execute on function public.servsync_create_trade_section_instance(uuid,uuid,text,integer,uuid,jsonb,integer,uuid) to authenticated;
grant execute on function public.servsync_update_trade_section_values(uuid,bigint,jsonb) to authenticated;
grant execute on function public.servsync_set_trade_section_lifecycle(uuid,bigint,text) to authenticated;
grant execute on function public.servsync_list_trade_section_revisions(uuid) to authenticated;

comment on table public.trade_section_instances is
  'Contractor-private durable Trade Section identity bound to one exact immutable definition snapshot and the canonical ServSync Draft/Job/property lineage.';
comment on table public.trade_section_revisions is
  'Append-only full snapshots preserving Trade Section values, governing definition, actor, provenance, workflow/property lineage, and lifecycle at every revision.';
comment on function public.servsync_create_trade_section_instance(uuid,uuid,text,integer,uuid,jsonb,integer,uuid) is
  'Creates one idempotent contractor-private Trade Section for an active exact Draft or Job using an active provider-neutral capability and immutable published definition.';

notify pgrst, 'reload schema';

commit;
