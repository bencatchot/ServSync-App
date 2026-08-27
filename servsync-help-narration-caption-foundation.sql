-- ServSync Help narration + caption foundation v1.
--
-- Adds a backward-compatible narrated/captioned revision contract, keeps legacy
-- published walkthroughs readable, blocks protected tutorial publication until
-- Cedar narration/caption/sound-off evidence passes, and exposes exact WebVTT
-- only through the existing role-aware Help authorization boundary.

begin;

do $$
begin
  if to_regclass('public.help_walkthrough_revisions') is null
     or to_regclass('public.help_recording_jobs') is null
     or to_regprocedure('public.servsync_transition_help_walkthrough(uuid,integer,text)') is null
     or to_regprocedure('public.servsync_transition_help_recording_job(uuid,text,text,jsonb)') is null then
    raise exception 'Help Studio recording workflow must be installed before narration/captions.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='help_walkthrough_revisions'
      and column_name='tutorial_media_standard'
  ) then
    raise exception 'Help narration/caption foundation is already installed.';
  end if;
end;
$$;

alter table public.help_walkthrough_revisions
  add column tutorial_media_standard text not null default 'legacy_visual_v1',
  add column narration_model text null,
  add column narration_script_sha256 text null,
  add column source_silent_sha256 text null,
  add column captions_vtt text null,
  add column captions_sha256 text null,
  add column caption_language text null,
  add column caption_review text not null default 'not_applicable',
  add column sound_off_review text not null default 'not_applicable';

alter table public.help_walkthrough_revisions
  add constraint help_revisions_tutorial_media_standard_check
    check (tutorial_media_standard in ('legacy_visual_v1','narrated_captioned_v1')),
  add constraint help_revisions_caption_reviews_check
    check (caption_review in ('not_applicable','pending','passed','failed')
      and sound_off_review in ('not_applicable','pending','passed','failed')),
  add constraint help_revisions_narration_script_sha_check
    check (narration_script_sha256 is null or narration_script_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint help_revisions_source_silent_sha_check
    check (source_silent_sha256 is null or source_silent_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint help_revisions_captions_sha_check
    check (captions_sha256 is null or captions_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint help_revisions_narrated_captioned_contract_check
    check (
      tutorial_media_standard = 'legacy_visual_v1'
      or (
        tutorial_media_standard = 'narrated_captioned_v1'
        and narration_provider = 'OpenAI'
        and narration_model = 'gpt-4o-mini-tts'
        and narration_voice = 'cedar'
        and narration_disclosure = 'AI-generated voiceover using OpenAI''s Cedar voice.'
        and transcript is not null and char_length(btrim(transcript)) between 10 and 20000
        and narration_script_sha256 = encode(public.digest(convert_to(transcript,'UTF8'),'sha256'),'hex')
        and source_silent_sha256 is not null
        and captions_vtt is not null and char_length(captions_vtt) between 16 and 50000
        and captions_vtt ~ E'^WEBVTT(\\r?\\n)'
        and captions_sha256 = encode(public.digest(convert_to(captions_vtt,'UTF8'),'sha256'),'hex')
        and caption_language = 'en'
        and caption_review <> 'not_applicable'
        and sound_off_review <> 'not_applicable'
      )
    );

create function public.servsync_private_help_protected_tutorial_slug(p_slug text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
immutable
as $$
  select p_slug = any(array[
    'how-to-handle-a-homeowner-service-request',
    'how-to-create-an-estimate',
    'how-to-complete-work-and-save-the-service-record',
    'how-to-deliver-an-invoice-and-record-an-outside-payment',
    'how-to-connect-and-request-service',
    'how-to-review-work-and-keep-home-history'
  ]::text[]);
$$;

create or replace function public.servsync_private_normalize_help_payload(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
immutable
as $$
declare
  v_allowed constant text[] := array[
    'title','summary','steps','keywords','feature_area','route_contexts','audience_roles',
    'purpose','source_commit','source_version','video_asset_id','poster_asset_id',
    'human_paced_review','sensitive_data_review','canonical_output_review',
    'validation_status','narration_provider','narration_model','narration_voice',
    'narration_disclosure','transcript','tutorial_media_standard',
    'narration_script_sha256','source_silent_sha256','captions_vtt','captions_sha256',
    'caption_language','caption_review','sound_off_review'
  ];
  v_key text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid Help walkthrough payload.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_payload) loop
    if not v_key = any(v_allowed) then
      raise exception 'Invalid Help walkthrough field.' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_payload->'steps') <> 'array'
     or jsonb_typeof(p_payload->'keywords') <> 'array'
     or jsonb_typeof(p_payload->'route_contexts') <> 'array'
     or jsonb_typeof(p_payload->'audience_roles') <> 'array' then
    raise exception 'Invalid Help walkthrough lists.' using errcode = '22023';
  end if;
  return p_payload;
end;
$$;

create or replace function public.servsync_private_insert_help_revision(
  p_walkthrough_id uuid,
  p_revision integer,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare v_payload jsonb; v_workspace_id uuid; v_context text;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  v_payload := public.servsync_private_normalize_help_payload(p_payload);
  insert into public.help_walkthrough_revisions (
    workspace_id, walkthrough_id, revision_number, title, summary, steps, keywords,
    feature_area, audience_roles, purpose, source_commit, source_version,
    video_asset_id, poster_asset_id, human_paced_review, sensitive_data_review,
    canonical_output_review, validation_status, narration_provider, narration_model,
    narration_voice, narration_disclosure, transcript, tutorial_media_standard,
    narration_script_sha256, source_silent_sha256, captions_vtt, captions_sha256,
    caption_language, caption_review, sound_off_review, created_by
  ) values (
    v_workspace_id, p_walkthrough_id, p_revision,
    btrim(v_payload->>'title'), btrim(v_payload->>'summary'),
    array(select btrim(value) from jsonb_array_elements_text(v_payload->'steps') value where btrim(value) <> ''),
    array(select lower(btrim(value)) from jsonb_array_elements_text(v_payload->'keywords') value where btrim(value) <> ''),
    btrim(v_payload->>'feature_area'),
    array(select lower(btrim(value)) from jsonb_array_elements_text(v_payload->'audience_roles') value where btrim(value) <> ''),
    lower(btrim(v_payload->>'purpose')), nullif(v_payload->>'source_commit',''),
    nullif(btrim(v_payload->>'source_version'),''), nullif(v_payload->>'video_asset_id','')::uuid,
    nullif(v_payload->>'poster_asset_id','')::uuid,
    coalesce(nullif(v_payload->>'human_paced_review',''),'pending'),
    coalesce(nullif(v_payload->>'sensitive_data_review',''),'pending'),
    coalesce(nullif(v_payload->>'canonical_output_review',''),'pending'),
    coalesce(nullif(v_payload->>'validation_status',''),'draft'),
    nullif(btrim(v_payload->>'narration_provider'),''), nullif(btrim(v_payload->>'narration_model'),''),
    nullif(btrim(v_payload->>'narration_voice'),''), nullif(btrim(v_payload->>'narration_disclosure'),''),
    nullif(btrim(v_payload->>'transcript'),''),
    coalesce(nullif(btrim(v_payload->>'tutorial_media_standard'),''),'legacy_visual_v1'),
    nullif(btrim(v_payload->>'narration_script_sha256'),''),
    nullif(btrim(v_payload->>'source_silent_sha256'),''),
    nullif(v_payload->>'captions_vtt',''), nullif(btrim(v_payload->>'captions_sha256'),''),
    nullif(lower(btrim(v_payload->>'caption_language')),''),
    coalesce(nullif(lower(btrim(v_payload->>'caption_review')),''),'not_applicable'),
    coalesce(nullif(lower(btrim(v_payload->>'sound_off_review')),''),'not_applicable'),
    auth.uid()
  );
  for v_context in
    select distinct lower(btrim(value)) from jsonb_array_elements_text(v_payload->'route_contexts') value where btrim(value) <> ''
  loop
    insert into public.help_walkthrough_contexts (
      workspace_id, walkthrough_id, revision_number, route_context, created_by
    ) values (v_workspace_id, p_walkthrough_id, p_revision, v_context, auth.uid());
  end loop;
end;
$$;

create or replace function public.servsync_transition_help_walkthrough(
  p_walkthrough_id uuid,
  p_expected_revision integer,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare v_workspace_id uuid; v_walkthrough public.help_walkthroughs; v_revision public.help_walkthrough_revisions; v_state text;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  select * into v_walkthrough from public.help_walkthroughs
   where id = p_walkthrough_id and workspace_id = v_workspace_id for update;
  if v_walkthrough.id is null then raise exception 'Help walkthrough not found.' using errcode = 'P0002'; end if;
  if v_walkthrough.current_revision <> p_expected_revision then
    raise exception 'Help walkthrough changed; reload before continuing.' using errcode = '40001';
  end if;
  select * into v_revision from public.help_walkthrough_revisions
   where walkthrough_id = p_walkthrough_id and revision_number = p_expected_revision;

  if p_action = 'publish' then
    if v_revision.video_asset_id is null or v_revision.poster_asset_id is null
       or v_revision.human_paced_review <> 'passed'
       or v_revision.sensitive_data_review <> 'passed'
       or v_revision.canonical_output_review <> 'passed'
       or v_revision.validation_status <> 'passed'
       or (public.servsync_private_help_protected_tutorial_slug(v_walkthrough.slug)
         and v_revision.tutorial_media_standard <> 'narrated_captioned_v1')
       or (v_revision.tutorial_media_standard = 'narrated_captioned_v1'
         and (v_revision.caption_review <> 'passed' or v_revision.sound_off_review <> 'passed'))
       or not exists (
         select 1 from public.help_media_assets
          where id = v_revision.video_asset_id and workspace_id = v_workspace_id
            and asset_kind = 'video' and upload_status = 'ready'
       )
       or not exists (
         select 1 from public.help_media_assets
          where id = v_revision.poster_asset_id and workspace_id = v_workspace_id
            and asset_kind = 'poster' and upload_status = 'ready'
       ) then
      raise exception 'Walkthrough media, narration, captions, and quality reviews must pass before publication.' using errcode = '55000';
    end if;
    v_state := 'published';
    update public.help_walkthroughs set state = v_state, published_revision = current_revision,
      published_at = now(), archived_at = null, updated_by = auth.uid(), updated_at = now()
    where id = p_walkthrough_id;
  elsif p_action = 'unpublish' then
    v_state := 'draft';
    update public.help_walkthroughs set state = v_state, published_revision = null,
      published_at = null, updated_by = auth.uid(), updated_at = now()
    where id = p_walkthrough_id;
  elsif p_action = 'needs_review' then
    v_state := 'needs_review';
    update public.help_walkthroughs set state = v_state, updated_by = auth.uid(), updated_at = now()
    where id = p_walkthrough_id;
  elsif p_action = 'deprecate' then
    v_state := 'deprecated';
    update public.help_walkthroughs set state = v_state, updated_by = auth.uid(), updated_at = now()
    where id = p_walkthrough_id;
  elsif p_action = 'archive' then
    v_state := 'archived';
    update public.help_walkthroughs set state = v_state, published_revision = null,
      archived_at = now(), updated_by = auth.uid(), updated_at = now()
    where id = p_walkthrough_id;
  else
    raise exception 'Invalid Help walkthrough action.' using errcode = '22023';
  end if;
  return jsonb_build_object('walkthrough_id', p_walkthrough_id, 'revision', p_expected_revision, 'state', v_state);
end;
$$;

create or replace function public.servsync_reserve_help_recording_media_upload(
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
  v_source_kind text;
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
  v_source_kind := case when v_job.narration_mode='ai' and p_asset_kind='video' then 'provider_generated' else 'recorder_generated' end;
  v_provenance := coalesce(p_provenance,'{}'::jsonb) || jsonb_build_object(
    'recording_job_id',v_job.id,'scenario',v_job.scenario_key,
    'pacing_profile',v_job.pacing_profile,'canonical_product_output',true,
    'tutorial_media_standard',case when v_job.narration_mode='ai' then 'narrated_captioned_v1' else 'legacy_visual_v1' end
  );
  insert into public.help_media_assets (
    workspace_id, asset_kind, storage_path, original_file_name, mime_type,
    file_size_bytes, source_kind, source_commit, provenance, created_by
  ) values (
    v_workspace_id,p_asset_kind,
    v_workspace_id::text || '/' || gen_random_uuid()::text || '/' || p_asset_kind || '.' || v_extension,
    p_original_file_name,p_mime_type,p_file_size_bytes,v_source_kind,p_source_commit,
    v_provenance,auth.uid()
  ) returning * into v_asset;
  return jsonb_build_object('asset_id',v_asset.id,'bucket',v_asset.storage_bucket,'path',v_asset.storage_path);
end;
$$;

create or replace function public.servsync_transition_help_recording_job(
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
  v_metadata jsonb;
  v_viewport jsonb;
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
       and asset_kind='video' and upload_status='ready'
       and source_kind=case when v_job.narration_mode='ai' then 'provider_generated' else 'recorder_generated' end
       and provenance->>'recording_job_id'=v_job.id::text;
    select * into v_poster from public.help_media_assets
     where workspace_id=v_workspace_id and id=(p_payload->>'poster_asset_id')::uuid
       and asset_kind='poster' and upload_status='ready' and source_kind='recorder_generated'
       and provenance->>'recording_job_id'=v_job.id::text;
    if v_video.id is null or v_poster.id is null then
      raise exception 'Validated recorder media is required.' using errcode = '22023';
    end if;

    v_metadata := coalesce(p_payload->'recorder_metadata','{}'::jsonb);
    v_viewport := coalesce(v_metadata->'viewport','{}'::jsonb);
    if jsonb_typeof(v_metadata) is distinct from 'object'
       or jsonb_typeof(v_viewport) is distinct from 'object'
       or jsonb_typeof(v_metadata->'duration_seconds') is distinct from 'number'
       or jsonb_typeof(v_viewport->'width') is distinct from 'number'
       or jsonb_typeof(v_viewport->'height') is distinct from 'number'
       or v_metadata->>'recording_job_id' is distinct from v_job.id::text
       or v_metadata->>'scenario' is distinct from v_job.scenario_key
       or v_metadata->>'pacing_profile' is distinct from v_job.pacing_profile
       or v_metadata->>'validation_status' is distinct from 'passed'
       or v_metadata->>'sensitive_data_check' is distinct from 'passed'
       or v_metadata->>'canonical_output_provenance' is distinct from 'validated_servsync_demo_recorder'
       or v_metadata->>'source_git_commit' is distinct from v_video.source_commit
       or v_metadata->>'mp4_filename' is distinct from v_video.original_file_name
       or v_metadata->>'poster_filename' is distinct from v_poster.original_file_name
       or v_metadata->>'mp4_sha256' is distinct from v_video.sha256
       or v_metadata->>'poster_sha256' is distinct from v_poster.sha256
       or (v_viewport->>'width')::numeric <> v_video.width
       or (v_viewport->>'height')::numeric <> v_video.height
       or (v_viewport->>'width')::numeric <> v_poster.width
       or (v_viewport->>'height')::numeric <> v_poster.height
       or abs((v_metadata->>'duration_seconds')::numeric - v_video.duration_seconds) > 0.05 then
      raise exception 'Recorder metadata does not satisfy the requested job and finalized media.' using errcode = '22023';
    end if;

    if v_job.narration_mode='ai' and (
      v_metadata->>'schema_version' is distinct from '2'
      or v_metadata->>'tutorial_media_standard' is distinct from 'narrated_captioned_v1'
      or v_metadata->>'narration_provider' is distinct from 'OpenAI'
      or v_metadata->>'narration_model' is distinct from 'gpt-4o-mini-tts'
      or v_metadata->>'narration_voice' is distinct from 'cedar'
      or v_metadata->>'narration_disclosure' is distinct from 'AI-generated voiceover using OpenAI''s Cedar voice.'
      or coalesce(v_metadata->>'caption_language','') <> 'en'
      or coalesce(v_metadata->>'narration_script','') = ''
      or coalesce(v_metadata->>'captions_vtt','') !~ E'^WEBVTT(\\r?\\n)'
      or coalesce(v_metadata->>'narration_script_sha256','')
         <> encode(public.digest(convert_to(v_metadata->>'narration_script','UTF8'),'sha256'),'hex')
      or coalesce(v_metadata->>'captions_sha256','')
         <> encode(public.digest(convert_to(v_metadata->>'captions_vtt','UTF8'),'sha256'),'hex')
      or coalesce(v_metadata->>'source_silent_sha256','') !~ '^[a-f0-9]{64}$'
    ) then
      raise exception 'Cedar narration and exact WebVTT provenance are required.' using errcode = '22023';
    end if;

    v_next := 'ready_for_review'; v_category := 'ready_for_review';
    v_message := case when v_job.narration_mode='ai'
      then 'Narrated recording and captions are ready for normal-speed and sound-off review.'
      else 'Recording is ready for normal-speed review.' end;
    update public.help_recording_jobs set status=v_next, video_asset_id=v_video.id,
      poster_asset_id=v_poster.id, source_commit=v_video.source_commit,
      source_version=nullif(btrim(p_payload->>'source_version'),''),
      recorder_metadata=v_metadata, ready_for_review_at=now(), updated_at=now()
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

create or replace function public.servsync_review_help_recording_job(
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
  v_metadata jsonb;
  v_standard text;
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

  if public.servsync_private_help_protected_tutorial_slug(v_job.slug) and v_job.narration_mode <> 'ai' then
    raise exception 'Protected tutorials require a narrated and captioned replacement.' using errcode = '55000';
  end if;
  v_metadata := coalesce(v_job.recorder_metadata,'{}'::jsonb);
  v_standard := case when v_job.narration_mode='ai' then 'narrated_captioned_v1' else 'legacy_visual_v1' end;

  v_payload := jsonb_build_object(
    'title',v_job.title,'summary',v_job.summary,'steps',to_jsonb(v_job.action_steps),
    'keywords',to_jsonb(v_job.keywords),'feature_area',v_job.feature_area,
    'route_contexts',to_jsonb(v_job.route_contexts),'audience_roles',to_jsonb(v_job.audience_roles),
    'purpose',v_job.purpose,'source_commit',v_job.source_commit,
    'source_version',coalesce(v_job.source_version,'Demo Recorder / servsync-human-paced-v1'),
    'video_asset_id',v_job.video_asset_id,'poster_asset_id',v_job.poster_asset_id,
    'human_paced_review','passed','sensitive_data_review','passed',
    'canonical_output_review','passed','validation_status','passed',
    'tutorial_media_standard',v_standard,
    'narration_provider',case when v_job.narration_mode='ai' then v_metadata->>'narration_provider' end,
    'narration_model',case when v_job.narration_mode='ai' then v_metadata->>'narration_model' end,
    'narration_voice',case when v_job.narration_mode='ai' then v_metadata->>'narration_voice' end,
    'narration_disclosure',case when v_job.narration_mode='ai' then v_metadata->>'narration_disclosure' end,
    'transcript',case when v_job.narration_mode='ai' then v_metadata->>'narration_script'
      else nullif(array_to_string(v_job.talking_points,E'\n'),'') end,
    'narration_script_sha256',case when v_job.narration_mode='ai' then v_metadata->>'narration_script_sha256' end,
    'source_silent_sha256',case when v_job.narration_mode='ai' then v_metadata->>'source_silent_sha256' end,
    'captions_vtt',case when v_job.narration_mode='ai' then v_metadata->>'captions_vtt' end,
    'captions_sha256',case when v_job.narration_mode='ai' then v_metadata->>'captions_sha256' end,
    'caption_language',case when v_job.narration_mode='ai' then v_metadata->>'caption_language' end,
    'caption_review',case when v_job.narration_mode='ai' then 'passed' else 'not_applicable' end,
    'sound_off_review',case when v_job.narration_mode='ai' then 'passed' else 'not_applicable' end
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
    coalesce(v_notes,case when v_job.narration_mode='ai'
      then 'Picture, Cedar narration, captions, transcript, and sound-off review passed.'
      else 'Normal-speed pacing and product-truth review passed.' end)
  );
  return jsonb_build_object('job_id',v_job.id,'status','approved',
    'walkthrough_id',v_job.approved_walkthrough_id,'revision',v_revision);
end;
$$;

create function public.servsync_get_help_caption_track(
  p_walkthrough_id uuid,
  p_contractor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_role text; v_row record; v_is_admin boolean; v_target_revision integer;
begin
  v_role := public.servsync_private_help_actor_role(p_contractor_id);
  v_is_admin := v_role = 'platform_admin';
  select case when v_is_admin then current_revision else published_revision end
    into v_target_revision
    from public.help_walkthroughs where id = p_walkthrough_id;
  select walkthrough.id, revision.revision_number, revision.tutorial_media_standard,
    revision.captions_vtt, revision.captions_sha256, revision.caption_language,
    revision.transcript, revision.narration_provider, revision.narration_model,
    revision.narration_voice, revision.narration_disclosure
  into v_row
  from public.help_walkthroughs walkthrough
  join public.help_walkthrough_revisions revision
    on revision.walkthrough_id=walkthrough.id and revision.revision_number=v_target_revision
  where walkthrough.id=p_walkthrough_id
    and (v_is_admin or (walkthrough.state in ('published','needs_review') and walkthrough.published_revision is not null))
    and (v_is_admin or v_role=any(revision.audience_roles));
  if v_row.id is null then raise exception 'Published walkthrough not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'walkthrough_id',v_row.id,'revision',v_row.revision_number,
    'tutorial_media_standard',v_row.tutorial_media_standard,
    'captions_vtt',v_row.captions_vtt,'captions_sha256',v_row.captions_sha256,
    'caption_language',v_row.caption_language,'transcript',v_row.transcript,
    'narration_provider',v_row.narration_provider,'narration_model',v_row.narration_model,
    'narration_voice',v_row.narration_voice,'narration_disclosure',v_row.narration_disclosure
  );
end;
$$;

comment on function public.servsync_get_help_caption_track(uuid,uuid)
  is 'servsync-help-narration-caption-foundation-v1';

alter function public.servsync_private_help_protected_tutorial_slug(text) owner to postgres;
alter function public.servsync_private_normalize_help_payload(jsonb) owner to postgres;
alter function public.servsync_private_insert_help_revision(uuid,integer,jsonb) owner to postgres;
alter function public.servsync_transition_help_walkthrough(uuid,integer,text) owner to postgres;
alter function public.servsync_reserve_help_recording_media_upload(uuid,text,text,text,bigint,text,jsonb) owner to postgres;
alter function public.servsync_transition_help_recording_job(uuid,text,text,jsonb) owner to postgres;
alter function public.servsync_review_help_recording_job(uuid,text,text) owner to postgres;
alter function public.servsync_get_help_caption_track(uuid,uuid) owner to postgres;

revoke all on function public.servsync_private_help_protected_tutorial_slug(text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_normalize_help_payload(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_insert_help_revision(uuid,integer,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_transition_help_walkthrough(uuid,integer,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_reserve_help_recording_media_upload(uuid,text,text,text,bigint,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_transition_help_recording_job(uuid,text,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_review_help_recording_job(uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_help_caption_track(uuid,uuid) from public, anon, authenticated, service_role;

grant execute on function public.servsync_transition_help_walkthrough(uuid,integer,text) to authenticated;
grant execute on function public.servsync_reserve_help_recording_media_upload(uuid,text,text,text,bigint,text,jsonb) to authenticated;
grant execute on function public.servsync_transition_help_recording_job(uuid,text,text,jsonb) to authenticated;
grant execute on function public.servsync_review_help_recording_job(uuid,text,text) to authenticated;
grant execute on function public.servsync_get_help_caption_track(uuid,uuid) to authenticated;

commit;
