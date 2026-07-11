-- ServSync Demo Mode hidden foundation.
--
-- This foundation is for a dedicated demo Supabase project only. It creates a
-- private registry for demo-owned scenario records and narrow internal helper
-- functions that a server-side seed/reset runner can use. It does not seed data,
-- expose Demo Mode in the app, add user-facing reset controls, modify core RLS,
-- or authorize production application.

begin;

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.servsync_demo_reset_order(
  p_schema_name text,
  p_table_name text
)
returns integer
language sql
immutable
strict
set search_path = public
as $$
  select case
    when p_schema_name <> 'public' then null
    when p_table_name = 'workflow_activity_events' then 120
    when p_table_name = 'notifications' then 115
    when p_table_name = 'contractor_visit_events' then 112
    when p_table_name = 'job_work_items' then 110
    when p_table_name = 'estimate_payment_schedule_items' then 100
    when p_table_name = 'estimate_line_items' then 90
    when p_table_name = 'inspections' then 80
    when p_table_name = 'estimates' then 70
    when p_table_name = 'service_request_messages' then 60
    when p_table_name = 'service_requests' then 50
    when p_table_name = 'connection_audit_events' then 45
    when p_table_name = 'connection_permissions' then 42
    when p_table_name = 'homeowner_contractor_connections' then 40
    when p_table_name = 'home_assets' then 34
    when p_table_name = 'home_rooms' then 32
    when p_table_name = 'homes' then 30
    else null
  end;
$$;

comment on function public.servsync_demo_reset_order(text, text) is
  'Internal helper listing the only core tables the demo reset runner may remove from, with reverse dependency priority. This is not a browser API.';

create or replace function public.servsync_demo_reset_pk_column(
  p_schema_name text,
  p_table_name text
)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select case
    when public.servsync_demo_reset_order(p_schema_name, p_table_name) is null then null
    when p_table_name = 'connection_permissions' then 'connection_id'
    else 'id'
  end;
$$;

comment on function public.servsync_demo_reset_pk_column(text, text) is
  'Internal helper mapping demo reset allowlisted tables to their primary key column. This is not a browser API.';

create table if not exists public.demo_scenarios (
  id uuid primary key default gen_random_uuid(),
  scenario_key text not null unique,
  display_name text not null,
  description text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_scenarios_key_format_check
    check (scenario_key ~ '^[a-z0-9_]+$' and length(scenario_key) between 3 and 80),
  constraint demo_scenarios_display_name_not_blank
    check (length(trim(display_name)) > 0)
);

comment on table public.demo_scenarios is
  'Private catalog of ServSync demo scenario definitions for dedicated demo environments. Not visible to browser roles.';

create table if not exists public.demo_scenario_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.demo_scenarios(id) on delete restrict,
  scenario_key text not null,
  operation text not null default 'seed',
  checkpoint text not null default 'job_ready',
  anchor_timestamp timestamptz not null,
  target_project_ref text not null,
  status text not null default 'started',
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_scenario_runs_operation_check
    check (operation in ('seed', 'reset', 'verify')),
  constraint demo_scenario_runs_status_check
    check (status in ('started', 'succeeded', 'failed', 'reset')),
  constraint demo_scenario_runs_project_ref_check
    check (target_project_ref ~ '^[a-z0-9]{20}$'),
  constraint demo_scenario_runs_key_format_check
    check (scenario_key ~ '^[a-z0-9_]+$')
);

comment on table public.demo_scenario_runs is
  'Private registry of individual demo seed/reset/verify runs with a reset-time date anchor and safe metadata. No secrets are stored here.';

create table if not exists public.demo_scenario_records (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.demo_scenarios(id) on delete restrict,
  run_id uuid not null references public.demo_scenario_runs(id) on delete cascade,
  schema_name text not null default 'public',
  table_name text not null,
  primary_key_column text not null,
  record_id uuid not null,
  record_role text not null,
  checkpoint text not null default 'job_ready',
  reset_order integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint demo_scenario_records_allowed_target_check
    check (public.servsync_demo_reset_order(schema_name, table_name) is not null),
  constraint demo_scenario_records_pk_column_check
    check (primary_key_column = public.servsync_demo_reset_pk_column(schema_name, table_name)),
  constraint demo_scenario_records_reset_order_check
    check (reset_order = public.servsync_demo_reset_order(schema_name, table_name)),
  constraint demo_scenario_records_role_not_blank
    check (length(trim(record_role)) > 0)
);

comment on table public.demo_scenario_records is
  'Private registry of every demo-owned core record that a reset operation is allowed to delete. This prevents broad user-id or table-wide cleanup.';

create unique index if not exists demo_scenario_records_run_target_uidx
  on public.demo_scenario_records(run_id, schema_name, table_name, primary_key_column, record_id);

create index if not exists demo_scenarios_key_idx
  on public.demo_scenarios(scenario_key);

create index if not exists demo_scenario_runs_scenario_status_idx
  on public.demo_scenario_runs(scenario_id, status, started_at desc);

create index if not exists demo_scenario_records_run_reset_idx
  on public.demo_scenario_records(run_id, reset_order desc, created_at desc);

create index if not exists demo_scenario_records_target_idx
  on public.demo_scenario_records(schema_name, table_name, record_id);

drop trigger if exists demo_scenarios_touch_updated_at on public.demo_scenarios;
create trigger demo_scenarios_touch_updated_at
  before update on public.demo_scenarios
  for each row execute function public.touch_updated_at();

drop trigger if exists demo_scenario_runs_touch_updated_at on public.demo_scenario_runs;
create trigger demo_scenario_runs_touch_updated_at
  before update on public.demo_scenario_runs
  for each row execute function public.touch_updated_at();

alter table public.demo_scenarios enable row level security;
alter table public.demo_scenario_runs enable row level security;
alter table public.demo_scenario_records enable row level security;

revoke all on table public.demo_scenarios from public;
revoke all on table public.demo_scenarios from anon;
revoke all on table public.demo_scenarios from authenticated;

revoke all on table public.demo_scenario_runs from public;
revoke all on table public.demo_scenario_runs from anon;
revoke all on table public.demo_scenario_runs from authenticated;

revoke all on table public.demo_scenario_records from public;
revoke all on table public.demo_scenario_records from anon;
revoke all on table public.demo_scenario_records from authenticated;

create or replace function public.servsync_demo_start_run(
  p_scenario_key text,
  p_display_name text,
  p_description text,
  p_operation text,
  p_checkpoint text,
  p_anchor_timestamp timestamptz,
  p_target_project_ref text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scenario_id uuid;
  v_run_id uuid;
begin
  if p_operation not in ('seed', 'reset', 'verify') then
    raise exception 'Unsupported demo operation.';
  end if;

  if p_target_project_ref !~ '^[a-z0-9]{20}$' then
    raise exception 'Demo target project ref is invalid.';
  end if;

  insert into public.demo_scenarios (scenario_key, display_name, description)
  values (trim(p_scenario_key), trim(p_display_name), coalesce(trim(p_description), ''))
  on conflict (scenario_key) do update
    set display_name = excluded.display_name,
        description = excluded.description,
        updated_at = now()
  returning id into v_scenario_id;

  insert into public.demo_scenario_runs (
    scenario_id,
    scenario_key,
    operation,
    checkpoint,
    anchor_timestamp,
    target_project_ref,
    metadata
  )
  values (
    v_scenario_id,
    trim(p_scenario_key),
    p_operation,
    coalesce(nullif(trim(p_checkpoint), ''), 'job_ready'),
    p_anchor_timestamp,
    p_target_project_ref,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_run_id;

  return v_run_id;
end;
$$;

create or replace function public.servsync_demo_register_record(
  p_run_id uuid,
  p_schema_name text,
  p_table_name text,
  p_record_id uuid,
  p_record_role text,
  p_checkpoint text default 'job_ready',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.demo_scenario_runs;
  v_reset_order integer;
  v_pk_column text;
begin
  select *
    into v_run
    from public.demo_scenario_runs
   where id = p_run_id
   limit 1;

  if v_run.id is null then
    raise exception 'Demo scenario run was not found.';
  end if;

  v_reset_order := public.servsync_demo_reset_order(p_schema_name, p_table_name);
  v_pk_column := public.servsync_demo_reset_pk_column(p_schema_name, p_table_name);

  if v_reset_order is null or v_pk_column is null then
    raise exception 'Unsupported demo reset target %.%', p_schema_name, p_table_name;
  end if;

  insert into public.demo_scenario_records (
    scenario_id,
    run_id,
    schema_name,
    table_name,
    primary_key_column,
    record_id,
    record_role,
    checkpoint,
    reset_order,
    metadata
  )
  values (
    v_run.scenario_id,
    v_run.id,
    p_schema_name,
    p_table_name,
    v_pk_column,
    p_record_id,
    trim(p_record_role),
    coalesce(nullif(trim(p_checkpoint), ''), 'job_ready'),
    v_reset_order,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (run_id, schema_name, table_name, primary_key_column, record_id) do update
    set record_role = excluded.record_role,
        checkpoint = excluded.checkpoint,
        reset_order = excluded.reset_order,
        metadata = excluded.metadata;
end;
$$;

create or replace function public.servsync_demo_finish_run(
  p_run_id uuid,
  p_status text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('succeeded', 'failed', 'reset') then
    raise exception 'Unsupported demo run status.';
  end if;

  update public.demo_scenario_runs
     set status = p_status,
         metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
         completed_at = now(),
         updated_at = now()
   where id = p_run_id;

  if not found then
    raise exception 'Demo scenario run was not found.';
  end if;
end;
$$;

create or replace function public.servsync_demo_reset_registered_run(p_run_id uuid)
returns table (
  schema_name text,
  table_name text,
  record_role text,
  deleted_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.demo_scenario_runs;
  v_record record;
  v_deleted integer;
begin
  select *
    into v_run
    from public.demo_scenario_runs
   where id = p_run_id
   limit 1;

  if v_run.id is null then
    raise exception 'Demo scenario run was not found.';
  end if;

  for v_record in
    select *
      from public.demo_scenario_records
     where run_id = p_run_id
     order by reset_order desc, created_at desc
  loop
    if public.servsync_demo_reset_order(v_record.schema_name, v_record.table_name) is null
       or public.servsync_demo_reset_pk_column(v_record.schema_name, v_record.table_name) <> v_record.primary_key_column then
      raise exception 'Registered demo target %.% is no longer allowed.', v_record.schema_name, v_record.table_name;
    end if;

    execute format(
      'delete from %I.%I where %I = $1',
      v_record.schema_name,
      v_record.table_name,
      v_record.primary_key_column
    )
    using v_record.record_id;

    get diagnostics v_deleted = row_count;

    schema_name := v_record.schema_name;
    table_name := v_record.table_name;
    record_role := v_record.record_role;
    deleted_count := v_deleted;
    return next;
  end loop;

  delete from public.demo_scenario_records
   where run_id = p_run_id;

  update public.demo_scenario_runs
     set status = 'reset',
         completed_at = now(),
         updated_at = now()
   where id = p_run_id;
end;
$$;

comment on function public.servsync_demo_start_run(text, text, text, text, text, timestamptz, text, jsonb) is
  'Internal service-role helper for private demo seed/reset runners. Not granted to browser roles.';
comment on function public.servsync_demo_register_record(uuid, text, text, uuid, text, text, jsonb) is
  'Internal service-role helper that registers only allowlisted demo-owned records for later reset. Not granted to browser roles.';
comment on function public.servsync_demo_finish_run(uuid, text, jsonb) is
  'Internal service-role helper for private demo run status. Not granted to browser roles.';
comment on function public.servsync_demo_reset_registered_run(uuid) is
  'Internal service-role reset helper. Deletes only rows registered for a specific demo run from an explicit allowlist and never truncates core tables.';

revoke execute on function public.servsync_demo_reset_order(text, text) from public;
revoke execute on function public.servsync_demo_reset_order(text, text) from anon;
revoke execute on function public.servsync_demo_reset_order(text, text) from authenticated;

revoke execute on function public.servsync_demo_reset_pk_column(text, text) from public;
revoke execute on function public.servsync_demo_reset_pk_column(text, text) from anon;
revoke execute on function public.servsync_demo_reset_pk_column(text, text) from authenticated;

revoke execute on function public.servsync_demo_start_run(text, text, text, text, text, timestamptz, text, jsonb) from public;
revoke execute on function public.servsync_demo_start_run(text, text, text, text, text, timestamptz, text, jsonb) from anon;
revoke execute on function public.servsync_demo_start_run(text, text, text, text, text, timestamptz, text, jsonb) from authenticated;

revoke execute on function public.servsync_demo_register_record(uuid, text, text, uuid, text, text, jsonb) from public;
revoke execute on function public.servsync_demo_register_record(uuid, text, text, uuid, text, text, jsonb) from anon;
revoke execute on function public.servsync_demo_register_record(uuid, text, text, uuid, text, text, jsonb) from authenticated;

revoke execute on function public.servsync_demo_finish_run(uuid, text, jsonb) from public;
revoke execute on function public.servsync_demo_finish_run(uuid, text, jsonb) from anon;
revoke execute on function public.servsync_demo_finish_run(uuid, text, jsonb) from authenticated;

revoke execute on function public.servsync_demo_reset_registered_run(uuid) from public;
revoke execute on function public.servsync_demo_reset_registered_run(uuid) from anon;
revoke execute on function public.servsync_demo_reset_registered_run(uuid) from authenticated;

grant execute on function public.servsync_demo_reset_order(text, text) to service_role;
grant execute on function public.servsync_demo_reset_pk_column(text, text) to service_role;
grant execute on function public.servsync_demo_start_run(text, text, text, text, text, timestamptz, text, jsonb) to service_role;
grant execute on function public.servsync_demo_register_record(uuid, text, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.servsync_demo_finish_run(uuid, text, jsonb) to service_role;
grant execute on function public.servsync_demo_reset_registered_run(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
