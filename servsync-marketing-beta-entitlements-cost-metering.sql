-- ServSync Marketing beta entitlements and cost metering v1.
--
-- Adds configurable free-beta limits, append-only per-workspace usage/cost
-- evidence, and platform-only generation budget controls. This migration does
-- not call an AI/media provider, authorize publishing, or create public media.

begin;

do $$
declare v_name text;
begin
  foreach v_name in array array[
    'marketing_workspaces', 'profiles', 'marketing_publications'
  ] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'Missing Marketing entitlement prerequisite public.%.', v_name;
    end if;
  end loop;
  if to_regprocedure('public.servsync_private_require_marketing_workspace(uuid,text)') is null
     or to_regprocedure('public.servsync_private_marketing_workspace_for_context(uuid,text)') is null
     or to_regprocedure('public.current_user_is_platform_admin()') is null then
    raise exception 'Missing shared Marketing workspace authority prerequisite.';
  end if;
  if to_regclass('public.marketing_entitlement_plans') is not null
     or to_regclass('public.marketing_workspace_entitlements') is not null
     or to_regclass('public.marketing_global_cost_controls') is not null
     or to_regclass('public.marketing_usage_events') is not null
     or to_regclass('public.marketing_usage_cost_events') is not null then
    raise exception 'Marketing entitlement/cost target already exists.';
  end if;
end;
$$;

create table public.marketing_entitlement_plans (
  plan_key text primary key,
  plan_version integer not null default 1,
  active_media_slots integer not null,
  monthly_video_generations integer not null,
  ready_scheduled_post_limit integer not null,
  max_generated_video_seconds integer not null,
  published_media_retention_hours integer not null,
  abandoned_media_expiration_days integer not null,
  permanent_media_library boolean not null default false,
  ai_generated_creative_enabled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_entitlement_plans_key_check check (plan_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint marketing_entitlement_plans_version_check check (plan_version between 1 and 1000000),
  constraint marketing_entitlement_plans_limits_check check (
    active_media_slots between 0 and 1000
    and monthly_video_generations between 0 and 10000
    and ready_scheduled_post_limit between 0 and 10000
    and max_generated_video_seconds between 1 and 3600
    and published_media_retention_hours between 0 and 8760
    and abandoned_media_expiration_days between 1 and 3650
  )
);

insert into public.marketing_entitlement_plans (
  plan_key, active_media_slots, monthly_video_generations,
  ready_scheduled_post_limit, max_generated_video_seconds,
  published_media_retention_hours, abandoned_media_expiration_days
) values ('free_beta', 3, 4, 5, 75, 72, 30);

create table public.marketing_workspace_entitlements (
  workspace_id uuid primary key references public.marketing_workspaces(id) on delete restrict,
  plan_key text not null references public.marketing_entitlement_plans(plan_key) on delete restrict,
  overrides jsonb not null default '{}'::jsonb,
  generation_enabled boolean not null default true,
  generation_spend_ceiling_microusd bigint null,
  stop_reason text null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_workspace_entitlements_overrides_check check (
    jsonb_typeof(overrides) = 'object'
    and overrides - array[
      'active_media_slots', 'monthly_video_generations',
      'ready_scheduled_post_limit', 'max_generated_video_seconds',
      'published_media_retention_hours', 'abandoned_media_expiration_days',
      'permanent_media_library', 'ai_generated_creative_enabled'
    ]::text[] = '{}'::jsonb
  ),
  constraint marketing_workspace_entitlements_spend_check check (
    generation_spend_ceiling_microusd is null or generation_spend_ceiling_microusd >= 0
  ),
  constraint marketing_workspace_entitlements_stop_check check (
    (generation_enabled and stop_reason is null)
    or (not generation_enabled and char_length(btrim(coalesce(stop_reason, ''))) between 3 and 500)
  )
);

insert into public.marketing_workspace_entitlements (workspace_id, plan_key)
select id, 'free_beta' from public.marketing_workspaces;

create table public.marketing_global_cost_controls (
  singleton boolean primary key default true check (singleton),
  generation_enabled boolean not null default true,
  monthly_budget_microusd bigint null,
  warning_percent integer not null default 80,
  hard_stop_percent integer not null default 100,
  stop_reason text null,
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint marketing_global_cost_budget_check check (
    monthly_budget_microusd is null or monthly_budget_microusd >= 0
  ),
  constraint marketing_global_cost_threshold_check check (
    warning_percent between 1 and 99
    and hard_stop_percent between warning_percent + 1 and 100
  ),
  constraint marketing_global_cost_stop_check check (
    (generation_enabled and stop_reason is null)
    or (not generation_enabled and char_length(btrim(coalesce(stop_reason, ''))) between 3 and 500)
  )
);

insert into public.marketing_global_cost_controls (singleton) values (true);

create table public.marketing_usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  client_request_id uuid not null,
  usage_category text not null,
  generation_consumed boolean not null default false,
  provider text null,
  model text null,
  voice text null,
  purpose text null,
  content_id uuid null,
  publication_id uuid null,
  input_tokens bigint null,
  output_tokens bigint null,
  audio_duration_seconds numeric(12,3) null,
  render_duration_seconds numeric(12,3) null,
  output_duration_seconds numeric(12,3) null,
  source_asset_count integer null,
  bytes_processed bigint null,
  bytes_generated bigint null,
  cost_status text not null,
  known_cost_microusd bigint null,
  estimated_cost_microusd bigint null,
  estimation_method text null,
  estimation_version text null,
  outcome text not null default 'recorded',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint marketing_usage_events_request_unique unique (
    workspace_id, client_request_id, usage_category
  ),
  constraint marketing_usage_events_workspace_identity unique (workspace_id, id),
  constraint marketing_usage_events_workspace_content foreign key (workspace_id, content_id)
    references public.marketing_content_items(workspace_id, id) on delete restrict,
  constraint marketing_usage_events_workspace_publication foreign key (workspace_id, publication_id)
    references public.marketing_publications(workspace_id, id) on delete restrict,
  constraint marketing_usage_events_category_check check (usage_category in (
    'generation_reservation', 'generation_denied', 'ai_text_generation',
    'tts_generation', 'media_composition', 'storage_write', 'storage_purge',
    'provider_publication'
  )),
  constraint marketing_usage_events_generation_shape_check check (
    (usage_category = 'generation_reservation' and generation_consumed)
    or (usage_category <> 'generation_reservation' and not generation_consumed)
  ),
  constraint marketing_usage_events_counts_check check (
    coalesce(input_tokens, 0) >= 0 and coalesce(output_tokens, 0) >= 0
    and coalesce(audio_duration_seconds, 0) >= 0
    and coalesce(render_duration_seconds, 0) >= 0
    and coalesce(output_duration_seconds, 0) >= 0
    and coalesce(source_asset_count, 0) >= 0
    and coalesce(bytes_processed, 0) >= 0
    and coalesce(bytes_generated, 0) >= 0
    and coalesce(known_cost_microusd, 0) >= 0
    and coalesce(estimated_cost_microusd, 0) >= 0
  ),
  constraint marketing_usage_events_cost_check check (
    (cost_status = 'known' and known_cost_microusd is not null and estimated_cost_microusd is null
      and estimation_method is null and estimation_version is null)
    or (cost_status = 'estimated' and known_cost_microusd is null and estimated_cost_microusd is not null
      and char_length(btrim(estimation_method)) between 3 and 120
      and char_length(btrim(estimation_version)) between 1 and 80)
    or (cost_status in ('pending', 'unavailable') and known_cost_microusd is null
      and estimated_cost_microusd is null and estimation_method is null and estimation_version is null)
  ),
  constraint marketing_usage_events_outcome_check check (
    outcome in ('recorded', 'succeeded', 'failed', 'uncertain', 'denied')
  ),
  constraint marketing_usage_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index marketing_usage_events_workspace_period_idx
  on public.marketing_usage_events(workspace_id, occurred_at desc, id);

create table public.marketing_usage_cost_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  usage_event_id uuid not null,
  cost_status text not null,
  known_cost_microusd bigint null,
  estimated_cost_microusd bigint null,
  estimation_method text null,
  estimation_version text null,
  evidence_source text not null,
  recorded_at timestamptz not null default now(),
  constraint marketing_usage_cost_events_workspace_parent foreign key (workspace_id, usage_event_id)
    references public.marketing_usage_events(workspace_id, id) on delete restrict,
  constraint marketing_usage_cost_events_cost_check check (
    (cost_status = 'known' and known_cost_microusd is not null and estimated_cost_microusd is null
      and estimation_method is null and estimation_version is null)
    or (cost_status = 'estimated' and known_cost_microusd is null and estimated_cost_microusd is not null
      and char_length(btrim(estimation_method)) between 3 and 120
      and char_length(btrim(estimation_version)) between 1 and 80)
    or (cost_status in ('pending', 'unavailable') and known_cost_microusd is null
      and estimated_cost_microusd is null and estimation_method is null and estimation_version is null)
  ),
  constraint marketing_usage_cost_events_source_check check (
    char_length(btrim(evidence_source)) between 3 and 160
  )
);

create index marketing_usage_cost_events_latest_idx
  on public.marketing_usage_cost_events(usage_event_id, recorded_at desc, id desc);

create function public.servsync_private_marketing_audit_append_only()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Marketing usage and cost history is append-only.';
end;
$$;

create trigger marketing_usage_events_immutable before update or delete
  on public.marketing_usage_events for each row
  execute function public.servsync_private_marketing_audit_append_only();
create trigger marketing_usage_events_no_truncate before truncate
  on public.marketing_usage_events for each statement
  execute function public.servsync_private_marketing_audit_append_only();
create trigger marketing_usage_cost_events_immutable before update or delete
  on public.marketing_usage_cost_events for each row
  execute function public.servsync_private_marketing_audit_append_only();
create trigger marketing_usage_cost_events_no_truncate before truncate
  on public.marketing_usage_cost_events for each statement
  execute function public.servsync_private_marketing_audit_append_only();

create function public.servsync_private_seed_marketing_entitlement()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  insert into public.marketing_workspace_entitlements (workspace_id, plan_key)
  values (new.id, 'free_beta') on conflict (workspace_id) do nothing;
  return new;
end;
$$;

create trigger marketing_workspace_seed_entitlement after insert
  on public.marketing_workspaces for each row
  execute function public.servsync_private_seed_marketing_entitlement();

create function public.servsync_private_effective_marketing_entitlements(p_workspace_id uuid)
returns jsonb language sql security definer
set search_path = pg_catalog, public stable as $$
  select jsonb_build_object(
    'plan_key', plan.plan_key,
    'plan_version', plan.plan_version,
    'active_media_slots', coalesce((entitlement.overrides->>'active_media_slots')::integer, plan.active_media_slots),
    'monthly_video_generations', coalesce((entitlement.overrides->>'monthly_video_generations')::integer, plan.monthly_video_generations),
    'ready_scheduled_post_limit', coalesce((entitlement.overrides->>'ready_scheduled_post_limit')::integer, plan.ready_scheduled_post_limit),
    'max_generated_video_seconds', coalesce((entitlement.overrides->>'max_generated_video_seconds')::integer, plan.max_generated_video_seconds),
    'published_media_retention_hours', coalesce((entitlement.overrides->>'published_media_retention_hours')::integer, plan.published_media_retention_hours),
    'abandoned_media_expiration_days', coalesce((entitlement.overrides->>'abandoned_media_expiration_days')::integer, plan.abandoned_media_expiration_days),
    'permanent_media_library', coalesce((entitlement.overrides->>'permanent_media_library')::boolean, plan.permanent_media_library),
    'ai_generated_creative_enabled', coalesce((entitlement.overrides->>'ai_generated_creative_enabled')::boolean, plan.ai_generated_creative_enabled),
    'generation_enabled', entitlement.generation_enabled,
    'generation_spend_ceiling_microusd', entitlement.generation_spend_ceiling_microusd,
    'stop_reason', entitlement.stop_reason,
    'usage_period', 'rolling_30_days'
  )
  from public.marketing_workspace_entitlements entitlement
  join public.marketing_entitlement_plans plan on plan.plan_key = entitlement.plan_key and plan.active
  where entitlement.workspace_id = p_workspace_id;
$$;

create function public.servsync_private_current_marketing_spend(
  p_workspace_id uuid default null,
  p_period_start timestamptz default date_trunc('month', now())
)
returns bigint language sql security definer
set search_path = pg_catalog, public stable as $$
  with events as (
    select usage.id, usage.workspace_id, usage.cost_status,
      usage.known_cost_microusd, usage.estimated_cost_microusd,
      usage.occurred_at
    from public.marketing_usage_events usage
    where usage.occurred_at >= p_period_start
      and (p_workspace_id is null or usage.workspace_id = p_workspace_id)
  ), current_cost as (
    select event.id,
      coalesce(reconciled.known_cost_microusd, reconciled.estimated_cost_microusd,
        event.known_cost_microusd, event.estimated_cost_microusd, 0) as cost_microusd
    from events event
    left join lateral (
      select cost.known_cost_microusd, cost.estimated_cost_microusd
      from public.marketing_usage_cost_events cost
      where cost.usage_event_id = event.id
      order by cost.recorded_at desc, cost.id desc limit 1
    ) reconciled on true
  )
  select coalesce(sum(cost_microusd), 0)::bigint from current_cost;
$$;

create function public.servsync_get_marketing_usage_summary(p_contractor_id uuid default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth stable as $$
declare
  v_workspace_id uuid;
  v_workspace public.marketing_workspaces;
  v_entitlements jsonb;
  v_global public.marketing_global_cost_controls;
  v_generations integer;
  v_ready integer;
  v_workspace_spend bigint;
  v_global_spend bigint;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'read');
  select * into strict v_workspace from public.marketing_workspaces where id = v_workspace_id;
  v_entitlements := public.servsync_private_effective_marketing_entitlements(v_workspace_id);
  if v_entitlements is null then raise exception 'Marketing entitlements are unavailable.' using errcode = '55000'; end if;
  select * into strict v_global from public.marketing_global_cost_controls where singleton;
  select count(*) into v_generations from public.marketing_usage_events
   where workspace_id = v_workspace_id and generation_consumed
     and occurred_at >= now() - interval '30 days';
  select count(*) into v_ready from public.marketing_publications
   where workspace_id = v_workspace_id and status in ('scheduled', 'publishing');
  v_workspace_spend := public.servsync_private_current_marketing_spend(v_workspace_id);
  v_global_spend := public.servsync_private_current_marketing_spend(null);
  return jsonb_build_object(
    'workspace', jsonb_build_object('workspace_id', v_workspace.id,
      'workspace_kind', v_workspace.workspace_kind, 'display_name', v_workspace.display_name),
    'entitlements', v_entitlements,
    'usage', jsonb_build_object(
      'video_generations_rolling_30_days', v_generations,
      'ready_scheduled_posts', v_ready,
      'workspace_cost_microusd_month', v_workspace_spend
    ),
    'generation', jsonb_build_object(
      'enabled', v_global.generation_enabled and coalesce((v_entitlements->>'generation_enabled')::boolean, false),
      'global_budget_configured', v_global.monthly_budget_microusd is not null,
      'global_warning', v_global.monthly_budget_microusd is not null and v_global_spend * 100 >= v_global.monthly_budget_microusd * v_global.warning_percent,
      'global_hard_stop', v_global.monthly_budget_microusd is not null and v_global_spend * 100 >= v_global.monthly_budget_microusd * v_global.hard_stop_percent
    )
  );
end;
$$;

create function public.servsync_check_marketing_ready_scheduled_capacity(p_contractor_id uuid default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth stable as $$
declare v_workspace_id uuid; v_limit integer; v_count integer;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'create_edit');
  v_limit := (public.servsync_private_effective_marketing_entitlements(v_workspace_id)->>'ready_scheduled_post_limit')::integer;
  select count(*) into v_count from public.marketing_publications
   where workspace_id = v_workspace_id and status in ('scheduled', 'publishing');
  return jsonb_build_object('allowed', v_count < v_limit, 'used', v_count, 'limit', v_limit);
end;
$$;

create function public.servsync_get_marketing_cost_controls()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth stable as $$
declare v_control public.marketing_global_cost_controls; v_spend bigint;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select * into strict v_control from public.marketing_global_cost_controls where singleton;
  v_spend := public.servsync_private_current_marketing_spend(null);
  return jsonb_build_object(
    'generation_enabled', v_control.generation_enabled,
    'monthly_budget_microusd', v_control.monthly_budget_microusd,
    'warning_percent', v_control.warning_percent,
    'hard_stop_percent', v_control.hard_stop_percent,
    'stop_reason', v_control.stop_reason,
    'current_spend_microusd', v_spend,
    'updated_at', v_control.updated_at
  );
end;
$$;

create function public.servsync_update_marketing_cost_controls(
  p_generation_enabled boolean,
  p_monthly_budget_microusd bigint,
  p_warning_percent integer,
  p_hard_stop_percent integer,
  p_stop_reason text default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if p_monthly_budget_microusd is not null and p_monthly_budget_microusd < 0
     or p_warning_percent not between 1 and 99
     or p_hard_stop_percent not between p_warning_percent + 1 and 100
     or (not p_generation_enabled and char_length(btrim(coalesce(p_stop_reason, ''))) not between 3 and 500)
     or (p_generation_enabled and p_stop_reason is not null) then
    raise exception 'Invalid Marketing cost controls.' using errcode = '22023';
  end if;
  update public.marketing_global_cost_controls set
    generation_enabled = p_generation_enabled,
    monthly_budget_microusd = p_monthly_budget_microusd,
    warning_percent = p_warning_percent,
    hard_stop_percent = p_hard_stop_percent,
    stop_reason = case when p_generation_enabled then null else btrim(p_stop_reason) end,
    updated_by = auth.uid(), updated_at = now()
  where singleton;
  return public.servsync_get_marketing_cost_controls();
end;
$$;

create function public.servsync_record_marketing_usage(
  p_workspace_id uuid,
  p_client_request_id uuid,
  p_usage_category text,
  p_provider text default null,
  p_model text default null,
  p_voice text default null,
  p_purpose text default null,
  p_content_id uuid default null,
  p_publication_id uuid default null,
  p_input_tokens bigint default null,
  p_output_tokens bigint default null,
  p_audio_duration_seconds numeric default null,
  p_render_duration_seconds numeric default null,
  p_output_duration_seconds numeric default null,
  p_source_asset_count integer default null,
  p_bytes_processed bigint default null,
  p_bytes_generated bigint default null,
  p_cost_status text default 'pending',
  p_known_cost_microusd bigint default null,
  p_estimated_cost_microusd bigint default null,
  p_estimation_method text default null,
  p_estimation_version text default null,
  p_outcome text default 'recorded',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public volatile as $$
declare v_event public.marketing_usage_events; v_replayed boolean := false;
begin
  if p_workspace_id is null or p_client_request_id is null
     or p_usage_category not in ('ai_text_generation','tts_generation','media_composition','storage_write','storage_purge','provider_publication')
     or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid Marketing usage evidence.' using errcode = '22023';
  end if;
  insert into public.marketing_usage_events (
    workspace_id, client_request_id, usage_category, provider, model, voice,
    purpose, content_id, publication_id, input_tokens, output_tokens,
    audio_duration_seconds, render_duration_seconds, output_duration_seconds,
    source_asset_count, bytes_processed, bytes_generated, cost_status,
    known_cost_microusd, estimated_cost_microusd, estimation_method,
    estimation_version, outcome, metadata
  ) values (
    p_workspace_id, p_client_request_id, p_usage_category,
    nullif(btrim(coalesce(p_provider,'')),''), nullif(btrim(coalesce(p_model,'')),''),
    nullif(btrim(coalesce(p_voice,'')),''), nullif(btrim(coalesce(p_purpose,'')),''),
    p_content_id, p_publication_id, p_input_tokens, p_output_tokens,
    p_audio_duration_seconds, p_render_duration_seconds, p_output_duration_seconds,
    p_source_asset_count, p_bytes_processed, p_bytes_generated, p_cost_status,
    p_known_cost_microusd, p_estimated_cost_microusd,
    nullif(btrim(coalesce(p_estimation_method,'')),''),
    nullif(btrim(coalesce(p_estimation_version,'')),''), p_outcome,
    coalesce(p_metadata, '{}'::jsonb)
  ) on conflict (workspace_id, client_request_id, usage_category) do nothing
  returning * into v_event;
  if v_event.id is null then
    v_replayed := true;
    select * into strict v_event from public.marketing_usage_events
     where workspace_id = p_workspace_id and client_request_id = p_client_request_id
       and usage_category = p_usage_category;
  end if;
  return jsonb_build_object('usage_event_id', v_event.id, 'replayed', v_replayed);
end;
$$;

create function public.servsync_reconcile_marketing_usage_cost(
  p_workspace_id uuid,
  p_usage_event_id uuid,
  p_cost_status text,
  p_known_cost_microusd bigint default null,
  p_estimated_cost_microusd bigint default null,
  p_estimation_method text default null,
  p_estimation_version text default null,
  p_evidence_source text default 'provider_reconciliation'
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public volatile as $$
declare v_id uuid;
begin
  insert into public.marketing_usage_cost_events (
    workspace_id, usage_event_id, cost_status, known_cost_microusd,
    estimated_cost_microusd, estimation_method, estimation_version, evidence_source
  ) values (
    p_workspace_id, p_usage_event_id, p_cost_status, p_known_cost_microusd,
    p_estimated_cost_microusd, nullif(btrim(coalesce(p_estimation_method,'')),''),
    nullif(btrim(coalesce(p_estimation_version,'')),''), btrim(p_evidence_source)
  ) returning id into v_id;
  return v_id;
end;
$$;

do $$ declare v_table text; begin
  foreach v_table in array array[
    'marketing_entitlement_plans', 'marketing_workspace_entitlements',
    'marketing_global_cost_controls', 'marketing_usage_events',
    'marketing_usage_cost_events'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated, service_role', v_table);
  end loop;
end $$;

alter function public.servsync_private_marketing_audit_append_only() owner to postgres;
alter function public.servsync_private_seed_marketing_entitlement() owner to postgres;
alter function public.servsync_private_effective_marketing_entitlements(uuid) owner to postgres;
alter function public.servsync_private_current_marketing_spend(uuid,timestamptz) owner to postgres;
alter function public.servsync_get_marketing_usage_summary(uuid) owner to postgres;
alter function public.servsync_check_marketing_ready_scheduled_capacity(uuid) owner to postgres;
alter function public.servsync_get_marketing_cost_controls() owner to postgres;
alter function public.servsync_update_marketing_cost_controls(boolean,bigint,integer,integer,text) owner to postgres;
alter function public.servsync_record_marketing_usage(uuid,uuid,text,text,text,text,text,uuid,uuid,bigint,bigint,numeric,numeric,numeric,integer,bigint,bigint,text,bigint,bigint,text,text,text,jsonb) owner to postgres;
alter function public.servsync_reconcile_marketing_usage_cost(uuid,uuid,text,bigint,bigint,text,text,text) owner to postgres;

revoke all on function public.servsync_private_marketing_audit_append_only() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_seed_marketing_entitlement() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_effective_marketing_entitlements(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_current_marketing_spend(uuid,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_marketing_usage_summary(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_check_marketing_ready_scheduled_capacity(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_marketing_cost_controls() from public, anon, authenticated, service_role;
revoke all on function public.servsync_update_marketing_cost_controls(boolean,bigint,integer,integer,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_record_marketing_usage(uuid,uuid,text,text,text,text,text,uuid,uuid,bigint,bigint,numeric,numeric,numeric,integer,bigint,bigint,text,bigint,bigint,text,text,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_reconcile_marketing_usage_cost(uuid,uuid,text,bigint,bigint,text,text,text) from public, anon, authenticated, service_role;

grant execute on function public.servsync_get_marketing_usage_summary(uuid) to authenticated;
grant execute on function public.servsync_check_marketing_ready_scheduled_capacity(uuid) to authenticated;
grant execute on function public.servsync_get_marketing_cost_controls() to authenticated;
grant execute on function public.servsync_update_marketing_cost_controls(boolean,bigint,integer,integer,text) to authenticated;
grant execute on function public.servsync_record_marketing_usage(uuid,uuid,text,text,text,text,text,uuid,uuid,bigint,bigint,numeric,numeric,numeric,integer,bigint,bigint,text,bigint,bigint,text,text,text,jsonb) to service_role;
grant execute on function public.servsync_reconcile_marketing_usage_cost(uuid,uuid,text,bigint,bigint,text,text,text) to service_role;

notify pgrst, 'reload schema';

commit;
