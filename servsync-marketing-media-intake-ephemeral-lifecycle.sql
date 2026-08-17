-- ServSync Marketing media intake and ephemeral lifecycle v1.
--
-- Extends the shared Marketing workspace with rights-acknowledged Job media
-- references, exact private Marketing uploads, replay-safe generation quota,
-- protected legacy assets, and bounded exact-object purge claims. It does not
-- generate media, enable publishing, or call a public provider.

begin;

do $$
declare v_name text;
begin
  foreach v_name in array array[
    'marketing_workspaces', 'marketing_workspace_entitlements',
    'marketing_global_cost_controls', 'marketing_usage_events',
    'marketing_media_assets', 'marketing_content_media_pairings',
    'marketing_publications', 'inspections', 'profiles'
  ] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'Missing Marketing media lifecycle prerequisite public.%.', v_name;
    end if;
  end loop;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
     or to_regprocedure('public.servsync_private_effective_marketing_entitlements(uuid)') is null
     or to_regprocedure('public.servsync_private_marketing_workspace_for_context(uuid,text)') is null then
    raise exception 'Missing Marketing media lifecycle authority/storage prerequisite.';
  end if;
  if to_regclass('public.marketing_media_intakes') is not null
     or to_regclass('public.marketing_media_lifecycles') is not null
     or to_regclass('public.marketing_media_lifecycle_events') is not null then
    raise exception 'Marketing media intake/lifecycle target already exists.';
  end if;
end;
$$;

update storage.buckets set
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4']::text[]
where id = 'marketing-assets';
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'marketing-assets' and not public) then
    raise exception 'Private marketing-assets bucket is missing.';
  end if;
end $$;

create table public.marketing_media_intakes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  client_request_id uuid not null,
  source_kind text not null,
  source_job_id uuid null references public.inspections(id) on delete restrict,
  source_bucket text not null,
  source_path text not null,
  original_file_name text null,
  mime_type text not null,
  file_size_bytes bigint not null,
  sha256 text null,
  width integer null,
  height integer null,
  duration_seconds numeric(10,3) null,
  poster_bucket text null,
  poster_path text null,
  poster_sha256 text null,
  poster_file_size_bytes bigint null,
  rights_acknowledgement_version text not null,
  acknowledged_by uuid not null references public.profiles(id) on delete restrict,
  acknowledged_at timestamptz not null,
  status text not null,
  consumed_asset_id uuid null,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_media_intakes_request_unique unique (workspace_id, client_request_id),
  constraint marketing_media_intakes_workspace_identity unique (workspace_id, id),
  constraint marketing_media_intakes_source_check check (source_kind in ('job_media','marketing_upload')),
  constraint marketing_media_intakes_source_shape_check check (
    (source_kind = 'job_media' and source_job_id is not null and source_bucket = 'inspection-media')
    or (source_kind = 'marketing_upload' and source_job_id is null and source_bucket = 'marketing-assets')
  ),
  constraint marketing_media_intakes_path_check check (
    char_length(source_path) between 3 and 1000
    and source_path !~ '(^|/)(\.\.|~)(/|$)'
  ),
  constraint marketing_media_intakes_mime_check check (
    mime_type in ('image/jpeg','image/png','image/webp','video/mp4')
  ),
  constraint marketing_media_intakes_size_check check (file_size_bytes between 1 and 104857600),
  constraint marketing_media_intakes_sha_check check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint marketing_media_intakes_dimensions_check check (
    (width is null and height is null)
    or (width between 1 and 8192 and height between 1 and 8192)
  ),
  constraint marketing_media_intakes_duration_check check (
    (mime_type like 'image/%' and duration_seconds is null)
    or (mime_type = 'video/mp4' and (duration_seconds is null or duration_seconds > 0))
  ),
  constraint marketing_media_intakes_poster_check check (
    (poster_bucket is null and poster_path is null and poster_sha256 is null and poster_file_size_bytes is null)
    or (poster_bucket = 'marketing-assets' and char_length(poster_path) between 3 and 1000
      and (poster_sha256 is null or poster_sha256 ~ '^[a-f0-9]{64}$')
      and (poster_file_size_bytes is null or poster_file_size_bytes between 1 and 1048576))
  ),
  constraint marketing_media_intakes_ack_check check (
    rights_acknowledgement_version = 'marketing_media_rights_v1'
    and acknowledged_at <= now() + interval '1 minute'
  ),
  constraint marketing_media_intakes_status_check check (
    status in ('upload_pending','selected','consumed','abandoned','purging','purged')
  ),
  constraint marketing_media_intakes_consumed_check check (
    (status = 'consumed' and consumed_asset_id is not null)
    or (status <> 'consumed' and consumed_asset_id is null)
  )
);

-- Generalize the original Demo-recorder-only asset contract while preserving
-- all historical columns and exact narrated flagship provenance.
alter table public.marketing_media_assets
  drop constraint marketing_media_assets_type_check,
  drop constraint marketing_media_assets_source_check,
  drop constraint marketing_media_assets_scenario_check,
  drop constraint marketing_media_assets_commit_check,
  drop constraint marketing_media_assets_path_check,
  drop constraint marketing_media_assets_mime_check,
  drop constraint marketing_media_assets_size_check,
  drop constraint marketing_media_assets_dimensions_check,
  drop constraint marketing_media_assets_duration_check,
  drop constraint marketing_media_assets_validation_check,
  drop constraint marketing_media_assets_sensitive_check,
  drop constraint marketing_media_assets_pacing_check,
  drop constraint marketing_media_assets_variant_check,
  drop constraint marketing_media_assets_narration_shape_check;

alter table public.marketing_media_assets
  alter column recorder_scenario drop not null,
  alter column source_commit drop not null,
  alter column width drop not null,
  alter column height drop not null,
  alter column duration_seconds drop not null,
  alter column pacing_reviewed_at drop not null,
  add column source_intake_id uuid null,
  add column derivative_of_asset_id uuid null,
  add column ephemeral boolean not null default false,
  add column poster_bucket text null,
  add column poster_path text null,
  add column poster_sha256 text null,
  add column poster_file_size_bytes bigint null,
  add constraint marketing_assets_workspace_intake foreign key (workspace_id, source_intake_id)
    references public.marketing_media_intakes(workspace_id, id) on delete restrict,
  add constraint marketing_assets_workspace_derivative foreign key (workspace_id, derivative_of_asset_id)
    references public.marketing_media_assets(workspace_id, id) on delete restrict,
  add constraint marketing_media_assets_type_check check (asset_type in ('image','video')),
  add constraint marketing_media_assets_source_check check (
    source in ('demo_recorder','marketing_upload','job_media_derivative','media_composition')
  ),
  add constraint marketing_media_assets_source_shape_check check (
    (source = 'demo_recorder' and source_intake_id is null
      and recorder_scenario ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and source_commit ~ '^[a-f0-9]{40}$')
    or (source <> 'demo_recorder' and source_intake_id is not null
      and recorder_scenario is null and source_commit is null)
  ),
  add constraint marketing_media_assets_path_check check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(mp4|jpg|jpeg|png|webp)$'
  ),
  add constraint marketing_media_assets_mime_check check (
    mime_type in ('image/jpeg','image/png','image/webp','video/mp4')
  ),
  add constraint marketing_media_assets_shape_check check (
    width between 1 and 8192 and height between 1 and 8192
    and file_size_bytes between 1 and 104857600
    and (
      (asset_type = 'image' and mime_type like 'image/%' and duration_seconds is null)
      or (asset_type = 'video' and mime_type = 'video/mp4' and duration_seconds > 0 and duration_seconds <= 300)
    )
  ),
  add constraint marketing_media_assets_validation_check check (validation_status = 'passed'),
  add constraint marketing_media_assets_sensitive_check check (sensitive_data_check in ('passed','user_acknowledged')),
  add constraint marketing_media_assets_pacing_check check (pacing_review in ('passed','not_required')),
  add constraint marketing_media_assets_pacing_date_check check (
    (pacing_review = 'passed' and pacing_reviewed_at is not null)
    or (pacing_review = 'not_required' and pacing_reviewed_at is null)
  ),
  add constraint marketing_media_assets_variant_check check (media_variant in (
    'silent_product_demo_master','narrated_marketing_derivative',
    'uploaded_marketing_source','job_media_derivative','marketing_composition'
  )),
  add constraint marketing_media_assets_narration_shape_check check (
    (
      media_variant = 'narrated_marketing_derivative'
      and source_silent_filename ~ '^servsync-[a-z0-9-]+-v[0-9]+-[0-9TZ-]+\.mp4$'
      and source_silent_sha256 ~ '^[a-f0-9]{64}$'
      and narration_provider = 'OpenAI'
      and char_length(narration_model) between 3 and 100
      and narration_voice ~ '^[a-z0-9_-]{2,40}$'
      and char_length(narration_script) between 10 and 5000
      and narration_script_version between 1 and 100
      and narration_audio_duration_seconds > 0
      and narration_start_seconds >= 0
      and narration_end_seconds > narration_start_seconds
      and narration_end_seconds <= duration_seconds
      and ai_narration_disclosure_required
      and char_length(ai_narration_disclosure_text) between 10 and 200
    )
    or (
      media_variant <> 'narrated_marketing_derivative'
      and source_silent_filename is null and source_silent_sha256 is null
      and narration_provider is null and narration_model is null and narration_voice is null
      and narration_script is null and narration_script_version is null
      and narration_audio_duration_seconds is null and narration_start_seconds is null
      and narration_end_seconds is null and not ai_narration_disclosure_required
      and ai_narration_disclosure_text is null
    )
  ),
  add constraint marketing_media_assets_poster_check check (
    (poster_bucket is null and poster_path is null and poster_sha256 is null and poster_file_size_bytes is null)
    or (poster_bucket = 'marketing-assets' and char_length(poster_path) between 3 and 1000
      and poster_sha256 ~ '^[a-f0-9]{64}$' and poster_file_size_bytes between 1 and 1048576)
  );

alter table public.marketing_media_intakes
  add constraint marketing_media_intakes_consumed_asset
  foreign key (workspace_id, consumed_asset_id)
  references public.marketing_media_assets(workspace_id, id) on delete restrict;

create table public.marketing_media_lifecycles (
  asset_id uuid primary key,
  workspace_id uuid not null,
  state text not null,
  retained_permanently boolean not null default false,
  retention_policy_version text not null default 'free_beta_ephemeral_v1',
  retention_started_at timestamptz null,
  purge_after timestamptz null,
  purge_claimed_at timestamptz null,
  purge_claim_token uuid null,
  purge_previous_state text null,
  purged_at timestamptz null,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_media_lifecycles_workspace_asset foreign key (workspace_id, asset_id)
    references public.marketing_media_assets(workspace_id, id) on delete restrict,
  constraint marketing_media_lifecycles_state_check check (state in (
    'uploaded','preparing','generating','needs_review','ready','scheduled',
    'publishing','provider_processing','retention','abandoned','purging','purged','protected'
  )),
  constraint marketing_media_lifecycles_retention_check check (
    (retention_started_at is null and purge_after is null)
    or (retention_started_at is not null and purge_after is not null and purge_after >= retention_started_at)
  ),
  constraint marketing_media_lifecycles_claim_check check (
    (state = 'purging' and purge_claimed_at is not null and purge_claim_token is not null
      and purge_previous_state in ('uploaded','retention','abandoned'))
    or (state <> 'purging' and purge_claimed_at is null and purge_claim_token is null and purge_previous_state is null)
  ),
  constraint marketing_media_lifecycles_purge_check check (
    (state = 'purged' and purged_at is not null)
    or (state <> 'purged' and purged_at is null)
  )
);

create index marketing_media_lifecycles_purge_idx
  on public.marketing_media_lifecycles(state, purge_after, asset_id)
  where state in ('uploaded','retention','abandoned');

create table public.marketing_media_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  asset_id uuid not null,
  from_state text null,
  to_state text not null,
  reason text not null,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint marketing_media_lifecycle_events_workspace_parent foreign key (workspace_id, asset_id)
    references public.marketing_media_assets(workspace_id, id) on delete restrict,
  constraint marketing_media_lifecycle_events_reason_check check (char_length(btrim(reason)) between 3 and 500),
  constraint marketing_media_lifecycle_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create trigger marketing_media_lifecycle_events_immutable before update or delete
  on public.marketing_media_lifecycle_events for each row
  execute function public.servsync_private_marketing_audit_append_only();
create trigger marketing_media_lifecycle_events_no_truncate before truncate
  on public.marketing_media_lifecycle_events for each statement
  execute function public.servsync_private_marketing_audit_append_only();

-- Every pre-G-B asset is deliberately protected. No age/status inference is
-- allowed to opt historical ServSync media into automatic deletion.
insert into public.marketing_media_lifecycles (
  asset_id, workspace_id, state, retained_permanently, retention_policy_version,
  last_activity_at, created_at, updated_at
)
select id, workspace_id, 'protected', true, 'legacy_protected_v1',
  created_at, created_at, now()
from public.marketing_media_assets;

create function public.servsync_private_create_marketing_media_lifecycle()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_state text; v_protected boolean;
begin
  v_protected := new.source = 'demo_recorder' and not new.ephemeral;
  v_state := case when v_protected then 'protected'
    when new.source = 'media_composition' or new.source = 'job_media_derivative' then 'needs_review'
    else 'uploaded' end;
  insert into public.marketing_media_lifecycles (
    asset_id, workspace_id, state, retained_permanently, retention_policy_version
  ) values (
    new.id, new.workspace_id, v_state, v_protected,
    case when v_protected then 'internal_protected_v1' else 'free_beta_ephemeral_v1' end
  );
  insert into public.marketing_media_lifecycle_events (
    workspace_id, asset_id, from_state, to_state, reason, actor_user_id
  ) values (
    new.workspace_id, new.id, null, v_state,
    case when v_protected then 'ServSync internal media is protected by default.' else 'Managed Marketing media registered.' end,
    new.created_by
  );
  return new;
end;
$$;

create trigger marketing_media_assets_lifecycle after insert
  on public.marketing_media_assets for each row
  execute function public.servsync_private_create_marketing_media_lifecycle();

create function public.servsync_private_marketing_active_media_count(p_workspace_id uuid)
returns integer language sql security definer
set search_path = pg_catalog, public stable as $$
  select count(*)::integer from public.marketing_media_lifecycles
  where workspace_id = p_workspace_id and not retained_permanently
    and state in ('uploaded','preparing','generating','needs_review','ready','scheduled','publishing','provider_processing','retention');
$$;

create function public.servsync_reserve_marketing_generation(
  p_contractor_id uuid,
  p_client_request_id uuid,
  p_generation_kind text,
  p_expected_duration_seconds numeric,
  p_provider text default null,
  p_model text default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare
  v_workspace_id uuid; v_entitlement jsonb; v_global public.marketing_global_cost_controls;
  v_allowed_event public.marketing_usage_events; v_denied_event public.marketing_usage_events;
  v_generation_count integer; v_active_count integer; v_global_spend bigint; v_workspace_spend bigint;
  v_reason text; v_monthly integer; v_slots integer; v_max_duration integer;
begin
  if p_client_request_id is null or p_generation_kind not in ('video_composition','video_regeneration','tts_video_composition')
     or p_expected_duration_seconds is null or p_expected_duration_seconds <= 0 then
    raise exception 'Invalid Marketing generation reservation.' using errcode = '22023';
  end if;
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'create_edit');
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 37037));
  select * into v_allowed_event from public.marketing_usage_events
   where workspace_id = v_workspace_id and client_request_id = p_client_request_id
     and usage_category = 'generation_reservation';
  if v_allowed_event.id is not null then
    return jsonb_build_object('allowed', true, 'usage_event_id', v_allowed_event.id, 'replayed', true);
  end if;
  select * into v_denied_event from public.marketing_usage_events
   where workspace_id = v_workspace_id and client_request_id = p_client_request_id
     and usage_category = 'generation_denied';
  if v_denied_event.id is not null then
    return jsonb_build_object('allowed', false, 'usage_event_id', v_denied_event.id,
      'replayed', true, 'reason', v_denied_event.metadata->>'reason');
  end if;
  v_entitlement := public.servsync_private_effective_marketing_entitlements(v_workspace_id);
  select * into strict v_global from public.marketing_global_cost_controls where singleton;
  v_monthly := (v_entitlement->>'monthly_video_generations')::integer;
  v_slots := (v_entitlement->>'active_media_slots')::integer;
  v_max_duration := (v_entitlement->>'max_generated_video_seconds')::integer;
  select count(*) into v_generation_count from public.marketing_usage_events
   where workspace_id = v_workspace_id and generation_consumed
     and occurred_at >= now() - interval '30 days';
  v_active_count := public.servsync_private_marketing_active_media_count(v_workspace_id);
  v_global_spend := public.servsync_private_current_marketing_spend(null);
  v_workspace_spend := public.servsync_private_current_marketing_spend(v_workspace_id);
  if not v_global.generation_enabled then v_reason := 'global_generation_stop';
  elsif v_global.monthly_budget_microusd is not null
    and v_global_spend * 100 >= v_global.monthly_budget_microusd * v_global.hard_stop_percent then v_reason := 'global_budget_hard_stop';
  elsif not coalesce((v_entitlement->>'generation_enabled')::boolean, false) then v_reason := 'workspace_generation_stop';
  elsif (v_entitlement->>'generation_spend_ceiling_microusd') is not null
    and v_workspace_spend >= (v_entitlement->>'generation_spend_ceiling_microusd')::bigint then v_reason := 'workspace_spend_stop';
  elsif v_generation_count >= v_monthly then v_reason := 'rolling_30_day_generation_limit';
  elsif v_active_count >= v_slots then v_reason := 'active_media_slot_limit';
  elsif p_expected_duration_seconds > v_max_duration then v_reason := 'generated_duration_limit';
  end if;
  insert into public.marketing_usage_events (
    workspace_id, client_request_id, usage_category, generation_consumed,
    provider, model, purpose, output_duration_seconds, cost_status, outcome, metadata
  ) values (
    v_workspace_id, p_client_request_id,
    case when v_reason is null then 'generation_reservation' else 'generation_denied' end,
    v_reason is null, nullif(btrim(coalesce(p_provider,'')),''),
    nullif(btrim(coalesce(p_model,'')),''), p_generation_kind,
    p_expected_duration_seconds, 'pending',
    case when v_reason is null then 'recorded' else 'denied' end,
    jsonb_strip_nulls(jsonb_build_object('reason', v_reason, 'usage_period', 'rolling_30_days'))
  ) returning * into v_allowed_event;
  return jsonb_strip_nulls(jsonb_build_object(
    'allowed', v_reason is null, 'usage_event_id', v_allowed_event.id,
    'replayed', false, 'reason', v_reason,
    'usage', jsonb_build_object('generations', v_generation_count, 'active_media', v_active_count),
    'limits', jsonb_build_object('generations', v_monthly, 'active_media', v_slots, 'duration_seconds', v_max_duration)
  ));
end;
$$;

create function public.servsync_reserve_marketing_upload(
  p_contractor_id uuid,
  p_client_request_id uuid,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_rights_acknowledged boolean
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare
  v_workspace_id uuid; v_intake public.marketing_media_intakes;
  v_entitlement jsonb; v_extension text; v_active integer;
begin
  if p_client_request_id is null or not coalesce(p_rights_acknowledged, false)
     or p_mime_type not in ('image/jpeg','image/png','image/webp','video/mp4')
     or p_file_size_bytes not between 1 and 104857600
     or char_length(btrim(coalesce(p_original_file_name,''))) not between 1 and 255 then
    raise exception 'Invalid Marketing media upload.' using errcode = '22023';
  end if;
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'create_edit');
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 37038));
  select * into v_intake from public.marketing_media_intakes
   where workspace_id = v_workspace_id and client_request_id = p_client_request_id;
  if v_intake.id is not null then
    return jsonb_build_object('intake_id', v_intake.id, 'source_path', v_intake.source_path,
      'poster_path', v_intake.poster_path, 'replayed', true);
  end if;
  v_entitlement := public.servsync_private_effective_marketing_entitlements(v_workspace_id);
  v_active := public.servsync_private_marketing_active_media_count(v_workspace_id);
  if v_active >= (v_entitlement->>'active_media_slots')::integer then
    raise exception 'The beta active-media allowance is full.' using errcode = '54000';
  end if;
  v_extension := case p_mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' else 'mp4' end;
  v_intake.id := gen_random_uuid();
  insert into public.marketing_media_intakes (
    id, workspace_id, client_request_id, source_kind, source_bucket, source_path,
    original_file_name, mime_type, file_size_bytes, poster_bucket, poster_path,
    rights_acknowledgement_version, acknowledged_by, acknowledged_at, status
  ) values (
    v_intake.id, v_workspace_id, p_client_request_id, 'marketing_upload', 'marketing-assets',
    v_workspace_id::text || '/' || v_intake.id::text || '/media.' || v_extension,
    btrim(p_original_file_name), p_mime_type, p_file_size_bytes, 'marketing-assets',
    v_workspace_id::text || '/' || v_intake.id::text || '/poster.jpg',
    'marketing_media_rights_v1', auth.uid(), now(), 'upload_pending'
  ) returning * into v_intake;
  return jsonb_build_object('intake_id', v_intake.id, 'workspace_id', v_workspace_id,
    'storage_bucket', v_intake.source_bucket, 'source_path', v_intake.source_path,
    'poster_bucket', v_intake.poster_bucket, 'poster_path', v_intake.poster_path,
    'rights_acknowledgement_version', v_intake.rights_acknowledgement_version, 'replayed', false);
end;
$$;

create function public.servsync_finalize_marketing_upload(
  p_contractor_id uuid,
  p_intake_id uuid,
  p_sha256 text,
  p_width integer,
  p_height integer,
  p_duration_seconds numeric,
  p_poster_sha256 text,
  p_poster_file_size_bytes bigint
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth, storage volatile as $$
declare
  v_workspace_id uuid; v_intake public.marketing_media_intakes; v_source storage.objects;
  v_poster storage.objects; v_asset public.marketing_media_assets; v_max_duration integer;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'create_edit');
  select * into strict v_intake from public.marketing_media_intakes
   where id = p_intake_id and workspace_id = v_workspace_id for update;
  if v_intake.status = 'consumed' then
    return jsonb_build_object('intake_id', v_intake.id, 'asset_id', v_intake.consumed_asset_id, 'replayed', true);
  end if;
  if v_intake.status <> 'upload_pending' or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_poster_sha256 !~ '^[a-f0-9]{64}$' or p_poster_file_size_bytes not between 1 and 1048576
     or p_width not between 1 and 8192 or p_height not between 1 and 8192 then
    raise exception 'Invalid Marketing media finalization.' using errcode = '22023';
  end if;
  v_max_duration := (public.servsync_private_effective_marketing_entitlements(v_workspace_id)->>'max_generated_video_seconds')::integer;
  if (v_intake.mime_type like 'image/%' and p_duration_seconds is not null)
     or (v_intake.mime_type = 'video/mp4' and (p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > v_max_duration)) then
    raise exception 'Marketing video duration exceeds the beta media limit.' using errcode = '22023';
  end if;
  select * into strict v_source from storage.objects
   where bucket_id = v_intake.source_bucket and name = v_intake.source_path;
  select * into strict v_poster from storage.objects
   where bucket_id = v_intake.poster_bucket and name = v_intake.poster_path;
  if coalesce(v_source.metadata->>'mimetype','') <> v_intake.mime_type
     or (case when coalesce(v_source.metadata->>'size','') ~ '^\d+$' then (v_source.metadata->>'size')::bigint else -1 end) <> v_intake.file_size_bytes
     or coalesce(v_poster.metadata->>'mimetype','') <> 'image/jpeg'
     or (case when coalesce(v_poster.metadata->>'size','') ~ '^\d+$' then (v_poster.metadata->>'size')::bigint else -1 end) <> p_poster_file_size_bytes then
    raise exception 'Marketing media Storage metadata mismatch.' using errcode = '22023';
  end if;
  insert into public.marketing_media_assets (
    id, workspace_id, asset_type, source, recorder_scenario, source_commit,
    storage_bucket, storage_path, mime_type, file_size_bytes, width, height,
    duration_seconds, sha256, validation_status, sensitive_data_check,
    pacing_review, pacing_reviewed_at, media_variant, created_by,
    source_intake_id, ephemeral, poster_bucket, poster_path, poster_sha256,
    poster_file_size_bytes
  ) values (
    v_intake.id, v_workspace_id, case when v_intake.mime_type like 'image/%' then 'image' else 'video' end,
    'marketing_upload', null, null, v_intake.source_bucket, v_intake.source_path,
    v_intake.mime_type, v_intake.file_size_bytes, p_width, p_height,
    p_duration_seconds, p_sha256, 'passed', 'user_acknowledged',
    'not_required', null, 'uploaded_marketing_source', auth.uid(),
    v_intake.id, true, v_intake.poster_bucket, v_intake.poster_path,
    p_poster_sha256, p_poster_file_size_bytes
  ) returning * into v_asset;
  update public.marketing_media_intakes set
    sha256 = p_sha256, width = p_width, height = p_height,
    duration_seconds = p_duration_seconds, poster_sha256 = p_poster_sha256,
    poster_file_size_bytes = p_poster_file_size_bytes, status = 'consumed',
    consumed_asset_id = v_asset.id, last_activity_at = now(), updated_at = now()
  where id = v_intake.id;
  return jsonb_build_object('intake_id', v_intake.id, 'asset_id', v_asset.id,
    'lifecycle_state', 'uploaded', 'replayed', false);
end;
$$;

create function public.servsync_register_job_marketing_media(
  p_contractor_id uuid,
  p_client_request_id uuid,
  p_job_id uuid,
  p_source_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256 text,
  p_rights_acknowledged boolean
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth, storage volatile as $$
declare v_workspace_id uuid; v_job public.inspections; v_object storage.objects; v_intake public.marketing_media_intakes;
begin
  if p_client_request_id is null or p_job_id is null or not coalesce(p_rights_acknowledged,false)
     or p_mime_type not in ('image/jpeg','image/png','image/webp','video/mp4')
     or p_file_size_bytes not between 1 and 104857600 or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_source_path is null or p_source_path ~ '(^|/)(\.\.|~)(/|$)' then
    raise exception 'Invalid Job media selection.' using errcode = '22023';
  end if;
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'create_edit');
  select * into strict v_job from public.inspections
   where id = p_job_id and contractor_id = p_contractor_id for share;
  if split_part(p_source_path,'/',1) <> p_contractor_id::text
     or not jsonb_path_exists(
       coalesce(v_job.rooms_with_findings, '[]'::jsonb),
       '$.** ? (@.type() == "string" && @ == $path)',
       jsonb_build_object('path', p_source_path)
     ) then
    raise exception 'The selected object is not registered to this Job.' using errcode = '42501';
  end if;
  select * into strict v_object from storage.objects
   where bucket_id = 'inspection-media' and name = p_source_path;
  if coalesce(v_object.metadata->>'mimetype','') <> p_mime_type
     or (case when coalesce(v_object.metadata->>'size','') ~ '^\d+$' then (v_object.metadata->>'size')::bigint else -1 end) <> p_file_size_bytes then
    raise exception 'Job media Storage metadata mismatch.' using errcode = '22023';
  end if;
  insert into public.marketing_media_intakes (
    workspace_id, client_request_id, source_kind, source_job_id, source_bucket,
    source_path, mime_type, file_size_bytes, sha256,
    rights_acknowledgement_version, acknowledged_by, acknowledged_at, status
  ) values (
    v_workspace_id, p_client_request_id, 'job_media', p_job_id, 'inspection-media',
    p_source_path, p_mime_type, p_file_size_bytes, p_sha256,
    'marketing_media_rights_v1', auth.uid(), now(), 'selected'
  ) on conflict (workspace_id, client_request_id) do nothing returning * into v_intake;
  if v_intake.id is null then
    select * into strict v_intake from public.marketing_media_intakes
     where workspace_id = v_workspace_id and client_request_id = p_client_request_id;
  end if;
  return jsonb_build_object('intake_id', v_intake.id, 'source_kind', v_intake.source_kind,
    'source_job_id', v_intake.source_job_id, 'status', v_intake.status,
    'rights_acknowledgement_version', v_intake.rights_acknowledgement_version);
end;
$$;

create function public.servsync_get_marketing_media_access(
  p_contractor_id uuid,
  p_asset_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth stable as $$
declare v_workspace_id uuid; v_asset public.marketing_media_assets; v_lifecycle public.marketing_media_lifecycles;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'read');
  select * into strict v_asset from public.marketing_media_assets
   where id = p_asset_id and workspace_id = v_workspace_id;
  select * into strict v_lifecycle from public.marketing_media_lifecycles
   where asset_id = v_asset.id and workspace_id = v_workspace_id;
  if v_lifecycle.state = 'purged' then
    return jsonb_build_object('asset_id', v_asset.id, 'state', 'purged',
      'poster_bucket', v_asset.poster_bucket, 'poster_path', v_asset.poster_path);
  end if;
  return jsonb_strip_nulls(jsonb_build_object('asset_id', v_asset.id,
    'state', v_lifecycle.state, 'storage_bucket', v_asset.storage_bucket,
    'storage_path', v_asset.storage_path, 'mime_type', v_asset.mime_type,
    'sha256', v_asset.sha256, 'poster_bucket', v_asset.poster_bucket,
    'poster_path', v_asset.poster_path));
end;
$$;

create function public.servsync_private_can_access_marketing_storage_object(p_bucket text, p_name text)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, auth stable as $$
declare v_workspace_id uuid;
begin
  if auth.uid() is null or p_bucket <> 'marketing-assets' then return false; end if;
  select asset.workspace_id into v_workspace_id from public.marketing_media_assets asset
   where (asset.storage_bucket = p_bucket and asset.storage_path = p_name)
      or (asset.poster_bucket = p_bucket and asset.poster_path = p_name)
   limit 1;
  if v_workspace_id is null then
    select intake.workspace_id into v_workspace_id from public.marketing_media_intakes intake
     where intake.status = 'upload_pending'
       and ((intake.source_bucket = p_bucket and intake.source_path = p_name)
         or (intake.poster_bucket = p_bucket and intake.poster_path = p_name))
       and intake.acknowledged_by = auth.uid() limit 1;
  end if;
  if v_workspace_id is null then return false; end if;
  perform public.servsync_private_require_marketing_workspace(v_workspace_id, 'read');
  return true;
exception when others then return false;
end;
$$;

create function public.servsync_private_can_upload_marketing_storage_object(p_name text)
returns boolean language sql security definer
set search_path = pg_catalog, public, auth stable as $$
  select auth.uid() is not null and exists (
    select 1 from public.marketing_media_intakes intake
    where intake.status = 'upload_pending' and intake.acknowledged_by = auth.uid()
      and ((intake.source_bucket = 'marketing-assets' and intake.source_path = p_name)
        or (intake.poster_bucket = 'marketing-assets' and intake.poster_path = p_name))
      and (public.servsync_private_require_marketing_workspace(intake.workspace_id, 'create_edit')->>'workspace_id')::uuid = intake.workspace_id
  );
$$;

drop policy if exists marketing_assets_platform_admin_read on storage.objects;
drop policy if exists marketing_assets_platform_admin_upload on storage.objects;
drop policy if exists marketing_assets_platform_admin_cleanup on storage.objects;
drop policy if exists marketing_assets_workspace_read on storage.objects;
drop policy if exists marketing_assets_workspace_upload on storage.objects;
create policy marketing_assets_workspace_read on storage.objects for select to authenticated
  using (bucket_id = 'marketing-assets' and public.servsync_private_can_access_marketing_storage_object(bucket_id, name));
create policy marketing_assets_workspace_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'marketing-assets' and public.servsync_private_can_upload_marketing_storage_object(name));

-- A purge claim deliberately blocks new provider dependencies before the
-- worker removes bytes. The row lock closes the claim/publication race.
create function public.servsync_private_guard_marketing_media_dependency()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_asset_id uuid; v_state text;
begin
  v_asset_id := nullif(coalesce(new.media_snapshot->>'asset_id',''),'')::uuid;
  if v_asset_id is null then return new; end if;
  select lifecycle.state into strict v_state
    from public.marketing_media_lifecycles lifecycle
   where lifecycle.workspace_id = new.workspace_id
     and lifecycle.asset_id = v_asset_id
   for share;
  if v_state in ('purging','purged') then
    raise exception 'Marketing media is no longer available for publication.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger marketing_publications_media_dependency_guard
  before insert or update of workspace_id, media_snapshot
  on public.marketing_publications for each row
  execute function public.servsync_private_guard_marketing_media_dependency();

create function public.servsync_private_sync_marketing_media_lifecycle()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_asset_id uuid; v_lifecycle public.marketing_media_lifecycles; v_next text; v_reason text; v_hours integer;
begin
  v_asset_id := nullif(coalesce(new.media_snapshot->>'asset_id',''),'')::uuid;
  if v_asset_id is null then return new; end if;
  select * into v_lifecycle from public.marketing_media_lifecycles
   where asset_id = v_asset_id and workspace_id = new.workspace_id for update;
  if v_lifecycle.asset_id is null or v_lifecycle.retained_permanently or v_lifecycle.state in ('purging','purged','protected') then return new; end if;
  if exists (select 1 from public.marketing_publications p where p.workspace_id = new.workspace_id
      and p.media_snapshot->>'asset_id' = v_asset_id::text and p.status = 'publishing'
      and p.provider_publication_id is not null and coalesce(p.provider_operation_state,'') <> 'confirmed') then
    v_next := 'provider_processing'; v_reason := 'A provider is still processing this media.';
  elsif exists (select 1 from public.marketing_publications p where p.workspace_id = new.workspace_id
      and p.media_snapshot->>'asset_id' = v_asset_id::text and p.status = 'publishing') then
    v_next := 'publishing'; v_reason := 'A provider submission still requires this media.';
  elsif exists (select 1 from public.marketing_publications p where p.workspace_id = new.workspace_id
      and p.media_snapshot->>'asset_id' = v_asset_id::text and p.status = 'scheduled') then
    v_next := 'scheduled'; v_reason := 'A scheduled destination still requires this media.';
  elsif exists (select 1 from public.marketing_publications p where p.workspace_id = new.workspace_id
      and p.media_snapshot->>'asset_id' = v_asset_id::text and p.status = 'failed'
      and p.provider_publication_id is not null) then
    v_next := 'provider_processing'; v_reason := 'Provider outcome requires reconciliation before purge.';
  elsif exists (select 1 from public.marketing_publications p where p.workspace_id = new.workspace_id
      and p.media_snapshot->>'asset_id' = v_asset_id::text and p.status = 'published'
      and (p.media_pairing_id is null or p.provider_operation_state = 'confirmed')) then
    v_next := 'retention'; v_reason := 'All known destinations are terminal; verified-publication retention started.';
  else return new;
  end if;
  if v_next <> v_lifecycle.state then
    v_hours := (public.servsync_private_effective_marketing_entitlements(new.workspace_id)->>'published_media_retention_hours')::integer;
    update public.marketing_media_lifecycles set state = v_next,
      retention_started_at = case when v_next = 'retention' then now() else null end,
      purge_after = case when v_next = 'retention' then now() + make_interval(hours => v_hours) else null end,
      last_activity_at = now(), updated_at = now() where asset_id = v_asset_id;
    insert into public.marketing_media_lifecycle_events (workspace_id, asset_id, from_state, to_state, reason)
    values (new.workspace_id, v_asset_id, v_lifecycle.state, v_next, v_reason);
  end if;
  return new;
end;
$$;

create trigger marketing_publications_media_lifecycle after insert or update of status, provider_publication_id, provider_operation_state
  on public.marketing_publications for each row
  execute function public.servsync_private_sync_marketing_media_lifecycle();

create function public.servsync_private_pairing_ready_media_lifecycle()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_state text;
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    select state into v_state from public.marketing_media_lifecycles where asset_id = new.asset_id for update;
    if v_state in ('uploaded','needs_review') then
      update public.marketing_media_lifecycles set state = 'ready', last_activity_at = now(), updated_at = now()
       where asset_id = new.asset_id;
      insert into public.marketing_media_lifecycle_events (workspace_id, asset_id, from_state, to_state, reason, actor_user_id)
      values (new.workspace_id, new.asset_id, v_state, 'ready', 'Media pairing approved.', new.reviewed_by);
    end if;
  end if;
  return new;
end;
$$;

create trigger marketing_pairing_ready_media_lifecycle after update of status
  on public.marketing_content_media_pairings for each row
  execute function public.servsync_private_pairing_ready_media_lifecycle();

create function public.servsync_abandon_marketing_media(p_contractor_id uuid, p_asset_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare v_workspace_id uuid; v_lifecycle public.marketing_media_lifecycles; v_days integer;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'create_edit');
  select * into strict v_lifecycle from public.marketing_media_lifecycles
   where asset_id = p_asset_id and workspace_id = v_workspace_id for update;
  if v_lifecycle.retained_permanently or v_lifecycle.state not in ('uploaded','needs_review','ready')
     or exists (select 1 from public.marketing_publications p where p.workspace_id = v_workspace_id
       and p.media_snapshot->>'asset_id' = p_asset_id::text and p.status in ('scheduled','publishing')) then
    raise exception 'Marketing media cannot be abandoned in its current state.' using errcode = '55000';
  end if;
  v_days := (public.servsync_private_effective_marketing_entitlements(v_workspace_id)->>'abandoned_media_expiration_days')::integer;
  update public.marketing_media_lifecycles set state = 'abandoned', retention_started_at = now(),
    purge_after = now() + make_interval(days => v_days), last_activity_at = now(), updated_at = now()
   where asset_id = p_asset_id;
  insert into public.marketing_media_lifecycle_events (workspace_id, asset_id, from_state, to_state, reason, actor_user_id)
  values (v_workspace_id, p_asset_id, v_lifecycle.state, 'abandoned', 'Owner abandoned the Marketing media.', auth.uid());
  return jsonb_build_object('asset_id', p_asset_id, 'state', 'abandoned');
end;
$$;

create function public.servsync_claim_marketing_media_purges(p_limit integer default 5)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public volatile as $$
declare v_result jsonb;
begin
  if p_limit not between 1 and 20 then raise exception 'Invalid Marketing media purge limit.' using errcode = '22023'; end if;
  with eligible as (
    select lifecycle.asset_id, lifecycle.workspace_id, lifecycle.state as previous_state, gen_random_uuid() as claim_token
    from public.marketing_media_lifecycles lifecycle
    join public.marketing_media_assets asset on asset.id = lifecycle.asset_id and asset.workspace_id = lifecycle.workspace_id
    where not lifecycle.retained_permanently
      and (
        (lifecycle.state in ('retention','abandoned') and lifecycle.purge_after <= now())
        or (lifecycle.state = 'uploaded' and lifecycle.last_activity_at <= now() - make_interval(days =>
          (public.servsync_private_effective_marketing_entitlements(lifecycle.workspace_id)->>'abandoned_media_expiration_days')::integer))
      )
      and not exists (select 1 from public.marketing_publications publication
        where publication.workspace_id = lifecycle.workspace_id
          and publication.media_snapshot->>'asset_id' = lifecycle.asset_id::text
          and (publication.status in ('scheduled','publishing')
            or (publication.status = 'failed' and publication.provider_publication_id is not null)))
    order by coalesce(lifecycle.purge_after, lifecycle.last_activity_at), lifecycle.asset_id
    for update of lifecycle skip locked limit p_limit
  ), updated as (
    update public.marketing_media_lifecycles lifecycle set state = 'purging',
      purge_claimed_at = now(), purge_claim_token = eligible.claim_token,
      purge_previous_state = eligible.previous_state, updated_at = now()
    from eligible where lifecycle.asset_id = eligible.asset_id
    returning lifecycle.*, eligible.previous_state
  ), events as (
    insert into public.marketing_media_lifecycle_events (workspace_id, asset_id, from_state, to_state, reason, metadata)
    select workspace_id, asset_id, previous_state, 'purging', 'Exact managed-media purge claimed.',
      jsonb_build_object('claim_token', purge_claim_token) from updated
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'workspace_id', updated.workspace_id, 'asset_id', updated.asset_id,
    'claim_token', updated.purge_claim_token, 'storage_bucket', asset.storage_bucket,
    'storage_path', asset.storage_path, 'sha256', asset.sha256,
    'file_size_bytes', asset.file_size_bytes, 'poster_bucket', asset.poster_bucket,
    'poster_path', asset.poster_path, 'source_kind', intake.source_kind,
    'source_bucket', intake.source_bucket, 'source_path', intake.source_path,
    'delete_source_with_asset', intake.source_kind = 'marketing_upload' and intake.source_path = asset.storage_path,
    'previous_state', updated.previous_state
  ) order by updated.asset_id), '[]'::jsonb) into v_result
  from updated join public.marketing_media_assets asset on asset.id = updated.asset_id
  left join public.marketing_media_intakes intake on intake.id = asset.source_intake_id;
  return v_result;
end;
$$;

create function public.servsync_complete_marketing_media_purge(
  p_asset_id uuid, p_claim_token uuid, p_storage_bucket text, p_storage_path text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, storage volatile as $$
declare v_lifecycle public.marketing_media_lifecycles; v_asset public.marketing_media_assets;
begin
  select * into strict v_lifecycle from public.marketing_media_lifecycles where asset_id = p_asset_id for update;
  select * into strict v_asset from public.marketing_media_assets where id = p_asset_id and workspace_id = v_lifecycle.workspace_id;
  if v_lifecycle.state = 'purged' then return jsonb_build_object('asset_id', p_asset_id, 'state', 'purged', 'replayed', true); end if;
  if v_lifecycle.state <> 'purging' or v_lifecycle.purge_claim_token <> p_claim_token
     or v_asset.storage_bucket <> p_storage_bucket or v_asset.storage_path <> p_storage_path then
    raise exception 'Marketing media purge claim is stale.' using errcode = '40001';
  end if;
  if exists (select 1 from storage.objects where bucket_id = p_storage_bucket and name = p_storage_path) then
    raise exception 'Managed Marketing media still exists.' using errcode = '55000';
  end if;
  if exists (select 1 from public.marketing_publications publication
      where publication.workspace_id = v_lifecycle.workspace_id
        and publication.media_snapshot->>'asset_id' = p_asset_id::text
        and (publication.status in ('scheduled','publishing')
          or (publication.status = 'failed' and publication.provider_publication_id is not null))) then
    raise exception 'A publication still requires this media.' using errcode = '55000';
  end if;
  update public.marketing_media_lifecycles set state = 'purged', purged_at = now(),
    purge_claimed_at = null, purge_claim_token = null, purge_previous_state = null,
    last_activity_at = now(), updated_at = now() where asset_id = p_asset_id;
  update public.marketing_media_intakes set status = 'purged', consumed_asset_id = null,
    last_activity_at = now(), updated_at = now()
   where consumed_asset_id = p_asset_id and source_kind = 'marketing_upload';
  insert into public.marketing_media_lifecycle_events (workspace_id, asset_id, from_state, to_state, reason, metadata)
  values (v_lifecycle.workspace_id, p_asset_id, 'purging', 'purged',
    'Large managed media removed; poster and lightweight history retained.',
    jsonb_build_object('bytes_purged', v_asset.file_size_bytes, 'sha256', v_asset.sha256));
  insert into public.marketing_usage_events (
    workspace_id, client_request_id, usage_category, bytes_processed, cost_status, outcome, metadata
  ) values (
    v_lifecycle.workspace_id, p_claim_token, 'storage_purge', v_asset.file_size_bytes,
    'unavailable', 'succeeded', jsonb_build_object('asset_id', p_asset_id)
  ) on conflict (workspace_id, client_request_id, usage_category) do nothing;
  return jsonb_build_object('asset_id', p_asset_id, 'state', 'purged', 'replayed', false);
end;
$$;

create function public.servsync_fail_marketing_media_purge(p_asset_id uuid, p_claim_token uuid, p_reason text)
returns void language plpgsql security definer
set search_path = pg_catalog, public volatile as $$
declare v_lifecycle public.marketing_media_lifecycles; v_reason text := btrim(coalesce(p_reason,''));
begin
  if char_length(v_reason) not between 3 and 500 then raise exception 'Invalid purge failure.' using errcode = '22023'; end if;
  select * into strict v_lifecycle from public.marketing_media_lifecycles where asset_id = p_asset_id for update;
  if v_lifecycle.state <> 'purging' or v_lifecycle.purge_claim_token <> p_claim_token then
    raise exception 'Marketing media purge claim is stale.' using errcode = '40001';
  end if;
  update public.marketing_media_lifecycles set state = v_lifecycle.purge_previous_state,
    purge_after = now() + interval '1 hour', purge_claimed_at = null,
    purge_claim_token = null, purge_previous_state = null, updated_at = now()
   where asset_id = p_asset_id;
  insert into public.marketing_media_lifecycle_events (workspace_id, asset_id, from_state, to_state, reason)
  values (v_lifecycle.workspace_id, p_asset_id, 'purging', v_lifecycle.purge_previous_state, v_reason);
end;
$$;

create or replace function public.servsync_get_marketing_usage_summary(p_contractor_id uuid default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth stable as $$
declare
  v_workspace_id uuid; v_workspace public.marketing_workspaces; v_entitlements jsonb;
  v_global public.marketing_global_cost_controls; v_generations integer; v_active integer;
  v_ready integer; v_workspace_spend bigint; v_global_spend bigint; v_active_bytes bigint;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'read');
  select * into strict v_workspace from public.marketing_workspaces where id = v_workspace_id;
  v_entitlements := public.servsync_private_effective_marketing_entitlements(v_workspace_id);
  select * into strict v_global from public.marketing_global_cost_controls where singleton;
  select count(*) into v_generations from public.marketing_usage_events where workspace_id = v_workspace_id
    and generation_consumed and occurred_at >= now() - interval '30 days';
  v_active := public.servsync_private_marketing_active_media_count(v_workspace_id);
  select count(*) into v_ready from public.marketing_publications where workspace_id = v_workspace_id and status in ('scheduled','publishing');
  select coalesce(sum(asset.file_size_bytes),0)::bigint into v_active_bytes
    from public.marketing_media_lifecycles lifecycle join public.marketing_media_assets asset on asset.id = lifecycle.asset_id
    where lifecycle.workspace_id = v_workspace_id and not lifecycle.retained_permanently
      and lifecycle.state in ('uploaded','preparing','generating','needs_review','ready','scheduled','publishing','provider_processing','retention');
  v_workspace_spend := public.servsync_private_current_marketing_spend(v_workspace_id);
  v_global_spend := public.servsync_private_current_marketing_spend(null);
  return jsonb_build_object(
    'workspace', jsonb_build_object('workspace_id',v_workspace.id,'workspace_kind',v_workspace.workspace_kind,'display_name',v_workspace.display_name),
    'entitlements', v_entitlements,
    'usage', jsonb_build_object('video_generations_rolling_30_days',v_generations,
      'active_media_slots',v_active,'active_media_bytes',v_active_bytes,
      'ready_scheduled_posts',v_ready,'workspace_cost_microusd_month',v_workspace_spend),
    'generation', jsonb_build_object('enabled',v_global.generation_enabled and coalesce((v_entitlements->>'generation_enabled')::boolean,false),
      'global_budget_configured',v_global.monthly_budget_microusd is not null,
      'global_warning',v_global.monthly_budget_microusd is not null and v_global_spend*100 >= v_global.monthly_budget_microusd*v_global.warning_percent,
      'global_hard_stop',v_global.monthly_budget_microusd is not null and v_global_spend*100 >= v_global.monthly_budget_microusd*v_global.hard_stop_percent),
    'recent_media', coalesce((select jsonb_agg(jsonb_build_object('asset_id',asset.id,'asset_type',asset.asset_type,
      'source',asset.source,'state',lifecycle.state,'mime_type',asset.mime_type,'file_size_bytes',asset.file_size_bytes,
      'poster_path',asset.poster_path,'purged_at',lifecycle.purged_at) order by lifecycle.created_at desc)
      from public.marketing_media_lifecycles lifecycle join public.marketing_media_assets asset on asset.id=lifecycle.asset_id
      where lifecycle.workspace_id=v_workspace_id),'[]'::jsonb)
  );
end;
$$;

do $$ declare v_table text; begin
  foreach v_table in array array['marketing_media_intakes','marketing_media_lifecycles','marketing_media_lifecycle_events'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated, service_role', v_table);
  end loop;
end $$;

alter function public.servsync_private_create_marketing_media_lifecycle() owner to postgres;
alter function public.servsync_private_marketing_active_media_count(uuid) owner to postgres;
alter function public.servsync_reserve_marketing_generation(uuid,uuid,text,numeric,text,text) owner to postgres;
alter function public.servsync_reserve_marketing_upload(uuid,uuid,text,text,bigint,boolean) owner to postgres;
alter function public.servsync_finalize_marketing_upload(uuid,uuid,text,integer,integer,numeric,text,bigint) owner to postgres;
alter function public.servsync_register_job_marketing_media(uuid,uuid,uuid,text,text,bigint,text,boolean) owner to postgres;
alter function public.servsync_get_marketing_media_access(uuid,uuid) owner to postgres;
alter function public.servsync_private_can_access_marketing_storage_object(text,text) owner to postgres;
alter function public.servsync_private_can_upload_marketing_storage_object(text) owner to postgres;
alter function public.servsync_private_guard_marketing_media_dependency() owner to postgres;
alter function public.servsync_private_sync_marketing_media_lifecycle() owner to postgres;
alter function public.servsync_private_pairing_ready_media_lifecycle() owner to postgres;
alter function public.servsync_abandon_marketing_media(uuid,uuid) owner to postgres;
alter function public.servsync_claim_marketing_media_purges(integer) owner to postgres;
alter function public.servsync_complete_marketing_media_purge(uuid,uuid,text,text) owner to postgres;
alter function public.servsync_fail_marketing_media_purge(uuid,uuid,text) owner to postgres;
alter function public.servsync_get_marketing_usage_summary(uuid) owner to postgres;

revoke all on function public.servsync_private_create_marketing_media_lifecycle() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_marketing_active_media_count(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_reserve_marketing_generation(uuid,uuid,text,numeric,text,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_reserve_marketing_upload(uuid,uuid,text,text,bigint,boolean) from public, anon, authenticated, service_role;
revoke all on function public.servsync_finalize_marketing_upload(uuid,uuid,text,integer,integer,numeric,text,bigint) from public, anon, authenticated, service_role;
revoke all on function public.servsync_register_job_marketing_media(uuid,uuid,uuid,text,text,bigint,text,boolean) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_marketing_media_access(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_can_access_marketing_storage_object(text,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_can_upload_marketing_storage_object(text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_marketing_media_dependency() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_sync_marketing_media_lifecycle() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_pairing_ready_media_lifecycle() from public, anon, authenticated, service_role;
revoke all on function public.servsync_abandon_marketing_media(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_claim_marketing_media_purges(integer) from public, anon, authenticated, service_role;
revoke all on function public.servsync_complete_marketing_media_purge(uuid,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_fail_marketing_media_purge(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_marketing_usage_summary(uuid) from public, anon, authenticated, service_role;

grant execute on function public.servsync_reserve_marketing_generation(uuid,uuid,text,numeric,text,text) to authenticated;
grant execute on function public.servsync_reserve_marketing_upload(uuid,uuid,text,text,bigint,boolean) to authenticated;
grant execute on function public.servsync_finalize_marketing_upload(uuid,uuid,text,integer,integer,numeric,text,bigint) to authenticated;
grant execute on function public.servsync_register_job_marketing_media(uuid,uuid,uuid,text,text,bigint,text,boolean) to authenticated;
grant execute on function public.servsync_get_marketing_media_access(uuid,uuid) to authenticated;
grant execute on function public.servsync_abandon_marketing_media(uuid,uuid) to authenticated;
grant execute on function public.servsync_claim_marketing_media_purges(integer) to service_role;
grant execute on function public.servsync_complete_marketing_media_purge(uuid,uuid,text,text) to service_role;
grant execute on function public.servsync_fail_marketing_media_purge(uuid,uuid,text) to service_role;
grant execute on function public.servsync_get_marketing_usage_summary(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
