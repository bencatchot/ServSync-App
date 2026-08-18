begin;

do $$
begin
  if to_regprocedure('public.servsync_transition_help_recording_job(uuid,text,text,jsonb)') is null then
    raise exception 'Help Studio recording workflow must be installed before package validation.';
  end if;
  if coalesce(
    obj_description(
      'public.servsync_transition_help_recording_job(uuid,text,text,jsonb)'::regprocedure,
      'pg_proc'
    ),
    ''
  ) = 'servsync-help-studio-recording-package-validation-v1' then
    raise exception 'Help Studio recording package validation is already installed.';
  end if;
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
       and asset_kind='video' and upload_status='ready' and source_kind='recorder_generated'
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

    v_next := 'ready_for_review'; v_category := 'ready_for_review'; v_message := 'Recording is ready for normal-speed review.';
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

comment on function public.servsync_transition_help_recording_job(uuid,text,text,jsonb)
  is 'servsync-help-studio-recording-package-validation-v1';
alter function public.servsync_transition_help_recording_job(uuid,text,text,jsonb) owner to postgres;
revoke all on function public.servsync_transition_help_recording_job(uuid,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.servsync_transition_help_recording_job(uuid,text,text,jsonb) to authenticated;

commit;
