-- ServSync Help Studio recording workflow + human-paced recorder integration v1.
--
-- Adds an admin-only recording request/job lifecycle to the existing durable
-- Help Studio. Recorder output remains private Help media, immutable Help
-- revisions retain prior assets, and Marketing can continue to reuse only the
-- current published canonical Help source.

begin;

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'help_media_assets', 'help_walkthroughs', 'help_walkthrough_revisions',
    'help_walkthrough_contexts', 'marketing_workspaces', 'profiles', 'storage.objects'
  ] loop
    if to_regclass(v_name) is null and to_regclass('public.' || v_name) is null then
      raise exception 'Missing Help recording workflow prerequisite %.', v_name;
    end if;
  end loop;

  foreach v_name in array array['help_recording_jobs', 'help_recording_job_events'] loop
    if to_regclass('public.' || v_name) is not null then
      raise exception 'Help recording workflow target table public.% already exists.', v_name;
    end if;
  end loop;

  if not exists (
    select 1 from public.marketing_workspaces
     where id = '00000000-0000-4000-8000-000000000037'
       and workspace_key = 'servsync_internal'
       and workspace_kind = 'internal'
       and contractor_id is null
  ) then
    raise exception 'Canonical ServSync internal workspace is missing.';
  end if;
end;
$$;

alter table public.help_media_assets
  add constraint help_assets_source_kind_check
  check (source_kind in ('admin_upload', 'recorder_generated', 'provider_generated'));

create table public.help_recording_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  target_walkthrough_id uuid null,
  status text not null default 'requested',
  slug text not null,
  title text not null,
  summary text not null,
  purpose text not null,
  feature_area text not null,
  route_contexts text[] not null default '{}'::text[],
  audience_roles text[] not null,
  keywords text[] not null,
  requested_goal text not null,
  target_screen text not null,
  required_starting_state text not null,
  scenario_key text not null,
  action_steps text[] not null,
  expected_final_state text not null,
  desired_duration_seconds integer not null,
  narration_mode text not null default 'none',
  talking_points text[] not null default '{}'::text[],
  pacing_profile text not null default 'servsync-human-paced-v1',
  source_kind text not null default 'recorder_generated',
  source_commit text null,
  source_version text null,
  video_asset_id uuid null,
  poster_asset_id uuid null,
  recorder_metadata jsonb not null default '{}'::jsonb,
  failure_category text null,
  failure_message text null,
  review_notes text null,
  approved_walkthrough_id uuid null,
  approved_revision integer null,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  preparing_at timestamptz null,
  recording_at timestamptz null,
  processing_at timestamptz null,
  ready_for_review_at timestamptz null,
  reviewed_at timestamptz null,
  failed_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint help_recording_jobs_workspace_identity unique (workspace_id, id),
  constraint help_recording_jobs_target_parent foreign key (workspace_id, target_walkthrough_id)
    references public.help_walkthroughs(workspace_id, id) on delete restrict,
  constraint help_recording_jobs_approved_parent foreign key (workspace_id, approved_walkthrough_id)
    references public.help_walkthroughs(workspace_id, id) on delete restrict,
  constraint help_recording_jobs_video_parent foreign key (workspace_id, video_asset_id)
    references public.help_media_assets(workspace_id, id) on delete restrict,
  constraint help_recording_jobs_poster_parent foreign key (workspace_id, poster_asset_id)
    references public.help_media_assets(workspace_id, id) on delete restrict,
  constraint help_recording_jobs_status_check check (
    status in ('requested','preparing','recording','processing','ready_for_review','approved','failed')
  ),
  constraint help_recording_jobs_slug_check check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 100
  ),
  constraint help_recording_jobs_title_check check (char_length(btrim(title)) between 3 and 140),
  constraint help_recording_jobs_summary_check check (char_length(btrim(summary)) between 10 and 600),
  constraint help_recording_jobs_purpose_check check (purpose in ('support','marketing','both')),
  constraint help_recording_jobs_feature_check check (char_length(btrim(feature_area)) between 2 and 80),
  constraint help_recording_jobs_routes_check check (cardinality(route_contexts) between 1 and 12),
  constraint help_recording_jobs_audience_check check (
    cardinality(audience_roles) between 1 and 7
    and audience_roles <@ array['platform_admin','owner','admin','office','field_tech','viewer','homeowner']::text[]
  ),
  constraint help_recording_jobs_keywords_check check (cardinality(keywords) between 1 and 40),
  constraint help_recording_jobs_goal_check check (char_length(btrim(requested_goal)) between 10 and 800),
  constraint help_recording_jobs_screen_check check (char_length(btrim(target_screen)) between 2 and 160),
  constraint help_recording_jobs_start_check check (char_length(btrim(required_starting_state)) between 3 and 800),
  constraint help_recording_jobs_scenario_check check (
    scenario_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(scenario_key) between 3 and 100
  ),
  constraint help_recording_jobs_actions_check check (cardinality(action_steps) between 1 and 30),
  constraint help_recording_jobs_final_check check (char_length(btrim(expected_final_state)) between 3 and 800),
  constraint help_recording_jobs_duration_check check (desired_duration_seconds between 10 and 600),
  constraint help_recording_jobs_narration_check check (narration_mode in ('none','human','ai')),
  constraint help_recording_jobs_pacing_check check (pacing_profile = 'servsync-human-paced-v1'),
  constraint help_recording_jobs_source_kind_check check (source_kind in ('recorder_generated','provider_generated')),
  constraint help_recording_jobs_commit_check check (source_commit is null or source_commit ~ '^[a-f0-9]{40}$'),
  constraint help_recording_jobs_assets_check check (
    (video_asset_id is null and poster_asset_id is null)
    or (video_asset_id is not null and poster_asset_id is not null and video_asset_id <> poster_asset_id)
  ),
  constraint help_recording_jobs_approval_check check (
    (status = 'approved' and approved_walkthrough_id is not null and approved_revision is not null
      and reviewed_by is not null and reviewed_at is not null)
    or status <> 'approved'
  ),
  constraint help_recording_jobs_ready_check check (
    (status in ('ready_for_review','approved') and video_asset_id is not null and poster_asset_id is not null
      and ready_for_review_at is not null)
    or status not in ('ready_for_review','approved')
  ),
  constraint help_recording_jobs_failed_check check (
    (status = 'failed' and failure_category is not null and failure_message is not null and failed_at is not null)
    or status <> 'failed'
  )
);

create table public.help_recording_job_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  job_id uuid not null,
  event_sequence integer not null,
  from_status text null,
  to_status text not null,
  category text not null,
  message text null,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint help_recording_events_parent foreign key (workspace_id, job_id)
    references public.help_recording_jobs(workspace_id, id) on delete restrict,
  constraint help_recording_events_sequence_unique unique (job_id, event_sequence),
  constraint help_recording_events_sequence_check check (event_sequence >= 1),
  constraint help_recording_events_from_check check (
    from_status is null or from_status in ('requested','preparing','recording','processing','ready_for_review','approved','failed')
  ),
  constraint help_recording_events_to_check check (
    to_status in ('requested','preparing','recording','processing','ready_for_review','approved','failed')
  ),
  constraint help_recording_events_category_check check (
    category in ('requested','preparing','recording','processing','ready_for_review','approved','failed','review_returned')
  ),
  constraint help_recording_events_message_check check (message is null or char_length(btrim(message)) between 3 and 500)
);

create index help_recording_jobs_status_idx
  on public.help_recording_jobs (workspace_id, status, updated_at desc);
create index help_recording_events_job_idx
  on public.help_recording_job_events (job_id, event_sequence);

alter table public.help_recording_jobs enable row level security;
alter table public.help_recording_jobs force row level security;
alter table public.help_recording_job_events enable row level security;
alter table public.help_recording_job_events force row level security;

revoke all on table public.help_recording_jobs from public, anon, authenticated, service_role;
revoke all on table public.help_recording_job_events from public, anon, authenticated, service_role;

create function public.servsync_private_normalize_help_recording_spec(p_spec jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
immutable
as $$
declare
  v_allowed constant text[] := array[
    'target_walkthrough_id','slug','title','summary','purpose','feature_area','route_contexts',
    'audience_roles','keywords','requested_goal','target_screen','required_starting_state',
    'scenario_key','action_steps','expected_final_state','desired_duration_seconds',
    'narration_mode','talking_points'
  ];
  v_key text;
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    raise exception 'Invalid Help recording specification.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_spec) loop
    if not v_key = any(v_allowed) then
      raise exception 'Invalid Help recording specification field.' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_spec->'route_contexts') <> 'array'
     or jsonb_typeof(p_spec->'audience_roles') <> 'array'
     or jsonb_typeof(p_spec->'keywords') <> 'array'
     or jsonb_typeof(p_spec->'action_steps') <> 'array'
     or jsonb_typeof(p_spec->'talking_points') <> 'array' then
    raise exception 'Invalid Help recording specification lists.' using errcode = '22023';
  end if;
  return p_spec;
end;
$$;

create function public.servsync_private_append_help_recording_event(
  p_workspace_id uuid,
  p_job_id uuid,
  p_from_status text,
  p_to_status text,
  p_category text,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
begin
  insert into public.help_recording_job_events (
    workspace_id, job_id, event_sequence, from_status, to_status,
    category, message, actor_user_id
  ) values (
    p_workspace_id, p_job_id,
    coalesce((select max(event_sequence) from public.help_recording_job_events where job_id = p_job_id),0) + 1,
    p_from_status, p_to_status, p_category, nullif(btrim(p_message),''), auth.uid()
  );
end;
$$;

create function public.servsync_create_help_recording_job(p_spec jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_workspace_id uuid;
  v_spec jsonb;
  v_job public.help_recording_jobs;
  v_target uuid;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  v_spec := public.servsync_private_normalize_help_recording_spec(p_spec);
  v_target := nullif(v_spec->>'target_walkthrough_id','')::uuid;
  if v_target is not null and not exists (
    select 1 from public.help_walkthroughs
     where workspace_id = v_workspace_id and id = v_target and state <> 'archived'
  ) then
    raise exception 'Target Help walkthrough is unavailable.' using errcode = 'P0002';
  end if;

  insert into public.help_recording_jobs (
    workspace_id, target_walkthrough_id, slug, title, summary, purpose,
    feature_area, route_contexts, audience_roles, keywords, requested_goal,
    target_screen, required_starting_state, scenario_key, action_steps,
    expected_final_state, desired_duration_seconds, narration_mode,
    talking_points, requested_by
  ) values (
    v_workspace_id, v_target, lower(btrim(v_spec->>'slug')),
    btrim(v_spec->>'title'), btrim(v_spec->>'summary'), lower(btrim(v_spec->>'purpose')),
    btrim(v_spec->>'feature_area'),
    array(select distinct lower(btrim(value)) from jsonb_array_elements_text(v_spec->'route_contexts') value where btrim(value) <> ''),
    array(select distinct lower(btrim(value)) from jsonb_array_elements_text(v_spec->'audience_roles') value where btrim(value) <> ''),
    array(select distinct lower(btrim(value)) from jsonb_array_elements_text(v_spec->'keywords') value where btrim(value) <> ''),
    btrim(v_spec->>'requested_goal'), btrim(v_spec->>'target_screen'),
    btrim(v_spec->>'required_starting_state'), lower(btrim(v_spec->>'scenario_key')),
    array(select btrim(value) from jsonb_array_elements_text(v_spec->'action_steps') value where btrim(value) <> ''),
    btrim(v_spec->>'expected_final_state'), (v_spec->>'desired_duration_seconds')::integer,
    lower(btrim(v_spec->>'narration_mode')),
    array(select btrim(value) from jsonb_array_elements_text(v_spec->'talking_points') value where btrim(value) <> ''),
    auth.uid()
  ) returning * into v_job;

  perform public.servsync_private_append_help_recording_event(
    v_workspace_id, v_job.id, null, 'requested', 'requested', 'Recording requested.'
  );
  return jsonb_build_object('job_id',v_job.id,'status',v_job.status,'scenario_key',v_job.scenario_key);
end;
$$;

create function public.servsync_list_help_recording_jobs()
returns table (
  job_id uuid, target_walkthrough_id uuid, status text, slug text, title text,
  summary text, purpose text, feature_area text, route_contexts text[],
  audience_roles text[], keywords text[], requested_goal text, target_screen text,
  required_starting_state text, scenario_key text, action_steps text[],
  expected_final_state text, desired_duration_seconds integer, narration_mode text,
  talking_points text[], pacing_profile text, source_kind text, source_commit text,
  source_version text, video_asset_id uuid, poster_asset_id uuid,
  recorder_metadata jsonb, failure_category text, failure_message text,
  review_notes text, approved_walkthrough_id uuid, approved_revision integer,
  requested_at timestamptz, ready_for_review_at timestamptz,
  reviewed_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_workspace_id uuid;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  return query
  select job.id, job.target_walkthrough_id, job.status, job.slug, job.title,
    job.summary, job.purpose, job.feature_area, job.route_contexts,
    job.audience_roles, job.keywords, job.requested_goal, job.target_screen,
    job.required_starting_state, job.scenario_key, job.action_steps,
    job.expected_final_state, job.desired_duration_seconds, job.narration_mode,
    job.talking_points, job.pacing_profile, job.source_kind, job.source_commit,
    job.source_version, job.video_asset_id, job.poster_asset_id,
    job.recorder_metadata, job.failure_category, job.failure_message,
    job.review_notes, job.approved_walkthrough_id, job.approved_revision,
    job.requested_at, job.ready_for_review_at, job.reviewed_at, job.updated_at
  from public.help_recording_jobs job
  where job.workspace_id = v_workspace_id
  order by job.updated_at desc, job.id;
end;
$$;

create function public.servsync_get_help_recording_playback_grant(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_workspace_id uuid; v_job public.help_recording_jobs;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  select * into v_job from public.help_recording_jobs
   where workspace_id=v_workspace_id and id=p_job_id
     and status in ('ready_for_review','approved')
     and video_asset_id is not null;
  if v_job.id is null then raise exception 'Help recording is unavailable.' using errcode = 'P0002'; end if;
  return jsonb_build_object('recording_job_id',v_job.id,'video_asset_id',v_job.video_asset_id,
    'poster_asset_id',v_job.poster_asset_id,'title',v_job.title);
end;
$$;

create function public.servsync_transition_help_recording_job(
  p_job_id uuid,
  p_expected_status text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_workspace_id uuid;
  v_job public.help_recording_jobs;
  v_next text;
  v_category text;
  v_message text;
  v_video public.help_media_assets;
  v_poster public.help_media_assets;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  select * into v_job from public.help_recording_jobs
   where workspace_id = v_workspace_id and id = p_job_id for update;
  if v_job.id is null then raise exception 'Help recording job not found.' using errcode = 'P0002'; end if;
  if v_job.status <> p_expected_status then
    raise exception 'Help recording job changed; reload before continuing.' using errcode = '40001';
  end if;

  if p_action = 'start_preparing' and v_job.status = 'requested' then
    v_next := 'preparing'; v_category := 'preparing'; v_message := 'Demo state preparation started.';
    update public.help_recording_jobs set status=v_next, preparing_at=now(), updated_at=now() where id=v_job.id;
  elsif p_action = 'start_recording' and v_job.status = 'preparing' then
    v_next := 'recording'; v_category := 'recording'; v_message := 'Screen capture started.';
    update public.help_recording_jobs set status=v_next, recording_at=now(), updated_at=now() where id=v_job.id;
  elsif p_action = 'start_processing' and v_job.status = 'recording' then
    v_next := 'processing'; v_category := 'processing'; v_message := 'Validated media is being attached.';
    update public.help_recording_jobs set status=v_next, processing_at=now(), updated_at=now() where id=v_job.id;
  elsif p_action = 'complete' and v_job.status = 'processing' then
    select * into v_video from public.help_media_assets
     where workspace_id=v_workspace_id and id=(p_payload->>'video_asset_id')::uuid
       and asset_kind='video' and upload_status='ready' and source_kind='recorder_generated'
       and provenance->>'recording_job_id'=v_job.id::text;
    select * into v_poster from public.help_media_assets
     where workspace_id=v_workspace_id and id=(p_payload->>'poster_asset_id')::uuid
       and asset_kind='poster' and upload_status='ready' and source_kind='recorder_generated'
       and provenance->>'recording_job_id'=v_job.id::text;
    if v_video.id is null or v_poster.id is null then
      raise exception 'Validated recorder media is required.' using errcode = '22023';
    end if;
    if coalesce(p_payload->'recorder_metadata','{}'::jsonb)->>'scenario' is distinct from v_job.scenario_key
       or coalesce(p_payload->'recorder_metadata','{}'::jsonb)->>'pacing_profile' is distinct from v_job.pacing_profile
       or coalesce(p_payload->'recorder_metadata','{}'::jsonb)->>'validation_status' is distinct from 'passed'
       or coalesce(p_payload->'recorder_metadata','{}'::jsonb)->>'sensitive_data_check' is distinct from 'passed' then
      raise exception 'Recorder metadata does not satisfy the requested job.' using errcode = '22023';
    end if;
    v_next := 'ready_for_review'; v_category := 'ready_for_review'; v_message := 'Recording is ready for normal-speed review.';
    update public.help_recording_jobs set status=v_next, video_asset_id=v_video.id,
      poster_asset_id=v_poster.id, source_commit=v_video.source_commit,
      source_version=nullif(btrim(p_payload->>'source_version'),''),
      recorder_metadata=p_payload->'recorder_metadata', ready_for_review_at=now(), updated_at=now()
    where id=v_job.id;
  elsif p_action = 'fail' and v_job.status in ('requested','preparing','recording','processing') then
    v_message := nullif(btrim(p_payload->>'message'),'');
    if v_message is null or char_length(v_message) > 500 then
      raise exception 'A plain-language recording failure is required.' using errcode = '22023';
    end if;
    v_next := 'failed'; v_category := 'failed';
    update public.help_recording_jobs set status=v_next, failure_category='capture_failed',
      failure_message=v_message, failed_at=now(), updated_at=now() where id=v_job.id;
  else
    raise exception 'Invalid Help recording job transition.' using errcode = '22023';
  end if;

  perform public.servsync_private_append_help_recording_event(
    v_workspace_id, v_job.id, v_job.status, v_next, v_category, v_message
  );
  return jsonb_build_object('job_id',v_job.id,'status',v_next);
end;
$$;

create function public.servsync_reserve_help_recording_media_upload(
  p_job_id uuid,
  p_asset_kind text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_source_commit text,
  p_provenance jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_workspace_id uuid;
  v_job public.help_recording_jobs;
  v_asset public.help_media_assets;
  v_extension text;
  v_provenance jsonb;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  select * into v_job from public.help_recording_jobs
   where workspace_id=v_workspace_id and id=p_job_id and status='processing' for update;
  if v_job.id is null then raise exception 'Help recording job is not accepting media.' using errcode = '55000'; end if;
  if p_asset_kind not in ('video','poster')
     or p_file_size_bytes not between 1 and 104857600
     or char_length(coalesce(p_original_file_name,'')) not between 1 and 180
     or p_original_file_name ~ '[\\/]'
     or p_original_file_name ~ '[[:cntrl:]]'
     or (p_asset_kind='video' and p_mime_type<>'video/mp4')
     or (p_asset_kind='poster' and p_mime_type not in ('image/png','image/jpeg','image/webp'))
     or p_source_commit !~ '^[a-f0-9]{40}$' then
    raise exception 'Invalid Help recorder media upload.' using errcode = '22023';
  end if;
  v_extension := case p_mime_type when 'video/mp4' then 'mp4' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'jpg' end;
  v_provenance := coalesce(p_provenance,'{}'::jsonb) || jsonb_build_object(
    'recording_job_id',v_job.id,'scenario',v_job.scenario_key,
    'pacing_profile',v_job.pacing_profile,'canonical_product_output',true
  );
  insert into public.help_media_assets (
    workspace_id, asset_kind, storage_path, original_file_name, mime_type,
    file_size_bytes, source_kind, source_commit, provenance, created_by
  ) values (
    v_workspace_id,p_asset_kind,
    v_workspace_id::text || '/' || gen_random_uuid()::text || '/' || p_asset_kind || '.' || v_extension,
    p_original_file_name,p_mime_type,p_file_size_bytes,'recorder_generated',p_source_commit,
    v_provenance,auth.uid()
  ) returning * into v_asset;
  return jsonb_build_object('asset_id',v_asset.id,'bucket',v_asset.storage_bucket,'path',v_asset.storage_path);
end;
$$;

create function public.servsync_review_help_recording_job(
  p_job_id uuid,
  p_action text,
  p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_workspace_id uuid;
  v_job public.help_recording_jobs;
  v_walkthrough public.help_walkthroughs;
  v_result jsonb;
  v_revision integer;
  v_payload jsonb;
  v_notes text;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  select * into v_job from public.help_recording_jobs
   where workspace_id=v_workspace_id and id=p_job_id for update;
  if v_job.id is null then raise exception 'Help recording job not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'ready_for_review' then
    raise exception 'Recording is not ready for review.' using errcode = '55000';
  end if;
  v_notes := nullif(btrim(p_review_notes),'');
  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'Review notes are too long.' using errcode = '22023';
  end if;

  if p_action = 'return' then
    update public.help_recording_jobs set status='failed',failure_category='review_returned',
      failure_message=coalesce(v_notes,'Recording needs review.'),review_notes=v_notes,
      reviewed_by=auth.uid(),reviewed_at=now(),failed_at=now(),updated_at=now()
    where id=v_job.id;
    perform public.servsync_private_append_help_recording_event(
      v_workspace_id,v_job.id,'ready_for_review','failed','review_returned',
      coalesce(v_notes,'Recording needs review.')
    );
    return jsonb_build_object('job_id',v_job.id,'status','failed');
  elsif p_action <> 'approve' then
    raise exception 'Invalid Help recording review action.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'title',v_job.title,'summary',v_job.summary,'steps',to_jsonb(v_job.action_steps),
    'keywords',to_jsonb(v_job.keywords),'feature_area',v_job.feature_area,
    'route_contexts',to_jsonb(v_job.route_contexts),'audience_roles',to_jsonb(v_job.audience_roles),
    'purpose',v_job.purpose,'source_commit',v_job.source_commit,
    'source_version',coalesce(v_job.source_version,'Demo Recorder / servsync-human-paced-v1'),
    'video_asset_id',v_job.video_asset_id,'poster_asset_id',v_job.poster_asset_id,
    'human_paced_review','passed','sensitive_data_review','passed',
    'canonical_output_review','passed','validation_status','passed',
    'narration_provider',null,'narration_voice',null,'narration_disclosure',null,
    'transcript',nullif(array_to_string(v_job.talking_points,E'\n'),'')
  );

  if v_job.target_walkthrough_id is null then
    v_result := public.servsync_create_help_walkthrough(v_job.slug,v_payload);
    v_job.approved_walkthrough_id := (v_result->>'walkthrough_id')::uuid;
    v_revision := (v_result->>'revision')::integer;
  else
    select * into strict v_walkthrough from public.help_walkthroughs
     where workspace_id=v_workspace_id and id=v_job.target_walkthrough_id for update;
    v_result := public.servsync_update_help_walkthrough(v_walkthrough.id,v_walkthrough.current_revision,v_payload);
    v_job.approved_walkthrough_id := v_walkthrough.id;
    v_revision := (v_result->>'revision')::integer;
  end if;

  update public.help_walkthroughs
     set state='needs_review',updated_by=auth.uid(),updated_at=now()
   where workspace_id=v_workspace_id and id=v_job.approved_walkthrough_id;

  update public.help_recording_jobs set status='approved',review_notes=v_notes,
    approved_walkthrough_id=v_job.approved_walkthrough_id,approved_revision=v_revision,
    reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=v_job.id;
  perform public.servsync_private_append_help_recording_event(
    v_workspace_id,v_job.id,'ready_for_review','approved','approved',
    coalesce(v_notes,'Normal-speed pacing and product-truth review passed.')
  );
  return jsonb_build_object('job_id',v_job.id,'status','approved',
    'walkthrough_id',v_job.approved_walkthrough_id,'revision',v_revision);
end;
$$;

alter function public.servsync_private_normalize_help_recording_spec(jsonb) owner to postgres;
alter function public.servsync_private_append_help_recording_event(uuid,uuid,text,text,text,text) owner to postgres;
alter function public.servsync_create_help_recording_job(jsonb) owner to postgres;
alter function public.servsync_list_help_recording_jobs() owner to postgres;
alter function public.servsync_get_help_recording_playback_grant(uuid) owner to postgres;
alter function public.servsync_transition_help_recording_job(uuid,text,text,jsonb) owner to postgres;
alter function public.servsync_reserve_help_recording_media_upload(uuid,text,text,text,bigint,text,jsonb) owner to postgres;
alter function public.servsync_review_help_recording_job(uuid,text,text) owner to postgres;

revoke all on function public.servsync_private_normalize_help_recording_spec(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_append_help_recording_event(uuid,uuid,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_create_help_recording_job(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_list_help_recording_jobs() from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_help_recording_playback_grant(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_transition_help_recording_job(uuid,text,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_reserve_help_recording_media_upload(uuid,text,text,text,bigint,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_review_help_recording_job(uuid,text,text) from public, anon, authenticated, service_role;

grant execute on function public.servsync_create_help_recording_job(jsonb) to authenticated;
grant execute on function public.servsync_list_help_recording_jobs() to authenticated;
grant execute on function public.servsync_get_help_recording_playback_grant(uuid) to authenticated;
grant execute on function public.servsync_transition_help_recording_job(uuid,text,text,jsonb) to authenticated;
grant execute on function public.servsync_reserve_help_recording_media_upload(uuid,text,text,text,bigint,text,jsonb) to authenticated;
grant execute on function public.servsync_review_help_recording_job(uuid,text,text) to authenticated;

commit;
