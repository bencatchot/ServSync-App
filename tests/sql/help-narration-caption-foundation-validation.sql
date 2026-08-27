\set ON_ERROR_STOP on

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='help_walkthrough_revisions'
      and column_name='captions_vtt'
  ) or to_regprocedure('public.servsync_get_help_caption_track(uuid,uuid)') is null then
    raise exception 'Help narration/caption catalog is incomplete.';
  end if;
  if has_function_privilege('authenticated','public.servsync_private_help_protected_tutorial_slug(text)','execute')
     or has_function_privilege('service_role','public.servsync_get_help_caption_track(uuid,uuid)','execute') then
    raise exception 'Help narration/caption grants are broader than intended.';
  end if;
  if not has_function_privilege('authenticated','public.servsync_get_help_caption_track(uuid,uuid)','execute') then
    raise exception 'Authenticated role-aware caption lookup grant is missing.';
  end if;
  if not exists (
    select 1 from public.help_walkthroughs walkthrough
    join public.help_walkthrough_revisions revision
      on revision.walkthrough_id=walkthrough.id and revision.revision_number=walkthrough.published_revision
    where walkthrough.slug='how-to-create-an-estimate'
      and walkthrough.state='published'
      and revision.tutorial_media_standard='legacy_visual_v1'
  ) then
    raise exception 'Existing published legacy tutorial was not preserved.';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);

do $$
declare v_job jsonb; v_video jsonb; v_poster jsonb;
begin
  v_job := public.servsync_create_help_recording_job(jsonb_build_object(
    'target_walkthrough_id',null,
    'slug','how-to-handle-a-homeowner-service-request',
    'title','How to handle a homeowner service request',
    'summary','Review the homeowner request and begin an estimate without losing its context.',
    'purpose','support','feature_area','Service Requests',
    'route_contexts',jsonb_build_array('contractor.service_requests'),
    'audience_roles',jsonb_build_array('owner','admin','office'),
    'keywords',jsonb_build_array('service request','homeowner request','estimate'),
    'requested_goal','Show a contractor reviewing the request and starting the estimate.',
    'target_screen','Service Requests','required_starting_state','One fictional homeowner request is ready.',
    'scenario_key','contractor-service-request-intake',
    'action_steps',jsonb_build_array('Open the request.','Review the details.','Start the estimate.'),
    'expected_final_state','The estimate handoff remains linked to the request.',
    'desired_duration_seconds',30,'narration_mode','ai',
    'talking_points',jsonb_build_array('Open the homeowner request and review the original details.','Start the estimate from this request to preserve context.')
  ));
  perform set_config('servsync.test.caption_job_id',v_job->>'job_id',false);
  perform public.servsync_transition_help_recording_job((v_job->>'job_id')::uuid,'requested','start_preparing','{}');
  perform public.servsync_transition_help_recording_job((v_job->>'job_id')::uuid,'preparing','start_recording','{}');
  perform public.servsync_transition_help_recording_job((v_job->>'job_id')::uuid,'recording','start_processing','{}');

  v_video := public.servsync_reserve_help_recording_media_upload(
    (v_job->>'job_id')::uuid,'video','service-request-cedar.mp4','video/mp4',2100000,
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    '{"narration_provider":"OpenAI","narration_model":"gpt-4o-mini-tts","narration_voice":"cedar"}'::jsonb
  );
  v_poster := public.servsync_reserve_help_recording_media_upload(
    (v_job->>'job_id')::uuid,'poster','service-request-cedar.png','image/png',65000,
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','{"validation_status":"passed"}'::jsonb
  );
  perform set_config('servsync.test.caption_video_id',v_video->>'asset_id',false);
  perform set_config('servsync.test.caption_video_path',v_video->>'path',false);
  perform set_config('servsync.test.caption_poster_id',v_poster->>'asset_id',false);
  perform set_config('servsync.test.caption_poster_path',v_poster->>'path',false);
end;
$$;

reset role;
set role authenticated;
insert into storage.objects(bucket_id,name,metadata) values (
  'help-walkthroughs',current_setting('servsync.test.caption_video_path'),
  '{"size":2100000,"mimetype":"video/mp4"}'::jsonb
),(
  'help-walkthroughs',current_setting('servsync.test.caption_poster_path'),
  '{"size":65000,"mimetype":"image/png"}'::jsonb
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select public.servsync_finalize_help_media_upload(
  current_setting('servsync.test.caption_video_id')::uuid,
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',1440,900,30.000
);
select public.servsync_finalize_help_media_upload(
  current_setting('servsync.test.caption_poster_id')::uuid,
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',1440,900,null
);

do $$
declare
  v_script constant text := 'Open the homeowner request and review the original details. Start the estimate from this request to preserve context.';
  v_captions constant text := E'WEBVTT\n\n00:00:01.000 --> 00:00:08.000\nOpen the homeowner request and review the original details.\n\n00:00:08.000 --> 00:00:15.000\nStart the estimate from this request to preserve context.\n';
  v_metadata jsonb;
begin
  v_metadata := jsonb_build_object(
    'schema_version',2,
    'recording_job_id',current_setting('servsync.test.caption_job_id'),
    'scenario','contractor-service-request-intake','pacing_profile','servsync-human-paced-v1',
    'validation_status','passed','sensitive_data_check','passed','duration_seconds',30,
    'viewport',jsonb_build_object('width',1440,'height',900),
    'source_git_commit','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    'mp4_filename','service-request-cedar.mp4','poster_filename','service-request-cedar.png',
    'mp4_sha256','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    'poster_sha256','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    'canonical_output_provenance','validated_servsync_demo_recorder',
    'tutorial_media_standard','narrated_captioned_v1',
    'narration_provider','OpenAI','narration_model','gpt-4o-mini-tts','narration_voice','cedar',
    'narration_disclosure','AI-generated voiceover using OpenAI''s Cedar voice.',
    'narration_script',v_script,
    'narration_script_sha256',encode(public.digest(convert_to(v_script,'UTF8'),'sha256'),'hex'),
    'source_silent_sha256','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'caption_language','en','captions_vtt',v_captions,
    'captions_sha256',encode(public.digest(convert_to(v_captions,'UTF8'),'sha256'),'hex')
  );

  begin
    perform public.servsync_transition_help_recording_job(
      current_setting('servsync.test.caption_job_id')::uuid,'processing','complete',
      jsonb_build_object(
        'video_asset_id',current_setting('servsync.test.caption_video_id'),
        'poster_asset_id',current_setting('servsync.test.caption_poster_id'),
        'source_version','Demo Recorder + OpenAI Cedar',
        'recorder_metadata',jsonb_set(v_metadata,'{captions_sha256}',to_jsonb(repeat('0',64)))
      )
    );
    raise exception 'Forged caption checksum unexpectedly completed the job.';
  exception when sqlstate '22023' then null; end;

  perform public.servsync_transition_help_recording_job(
    current_setting('servsync.test.caption_job_id')::uuid,'processing','complete',
    jsonb_build_object(
      'video_asset_id',current_setting('servsync.test.caption_video_id'),
      'poster_asset_id',current_setting('servsync.test.caption_poster_id'),
      'source_version','Demo Recorder + OpenAI Cedar',
      'recorder_metadata',v_metadata
    )
  );
end;
$$;

select public.servsync_review_help_recording_job(
  current_setting('servsync.test.caption_job_id')::uuid,'approve',
  'Full picture, Cedar narration, captions, transcript, and sound-off review passed.'
);

select set_config(
  'servsync.test.caption_walkthrough_id',
  (select approved_walkthrough_id::text from public.servsync_list_help_recording_jobs()
    where job_id=current_setting('servsync.test.caption_job_id')::uuid),
  false
);

reset role;
do $$
declare v_revision record;
begin
  select revision.* into strict v_revision
  from public.help_walkthrough_revisions revision
  join public.help_walkthroughs walkthrough on walkthrough.id=revision.walkthrough_id
  where walkthrough.id=current_setting('servsync.test.caption_walkthrough_id')::uuid
    and revision.revision_number=walkthrough.current_revision;
  if v_revision.tutorial_media_standard <> 'narrated_captioned_v1'
     or v_revision.narration_provider <> 'OpenAI'
     or v_revision.narration_model <> 'gpt-4o-mini-tts'
     or v_revision.narration_voice <> 'cedar'
     or v_revision.caption_review <> 'passed'
     or v_revision.sound_off_review <> 'passed'
     or v_revision.captions_vtt !~ E'^WEBVTT(\\r?\\n)' then
    raise exception 'Approved narrated/captioned revision mismatch.';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select public.servsync_transition_help_walkthrough(
  current_setting('servsync.test.caption_walkthrough_id')::uuid,1,'publish'
);

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$
declare v_track jsonb;
begin
  v_track := public.servsync_get_help_caption_track(
    current_setting('servsync.test.caption_walkthrough_id')::uuid,
    '20000000-0000-4000-8000-000000000001'
  );
  if v_track->>'tutorial_media_standard' <> 'narrated_captioned_v1'
     or v_track->>'caption_language' <> 'en'
     or v_track->>'narration_voice' <> 'cedar'
     or v_track->>'captions_vtt' !~ E'^WEBVTT(\\r?\\n)' then
    raise exception 'Role-aware caption retrieval mismatch.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000008',false);
do $$
begin
  begin
    perform public.servsync_get_help_caption_track(
      current_setting('servsync.test.caption_walkthrough_id')::uuid,null
    );
    raise exception 'Unintended audience unexpectedly retrieved captions.';
  exception when sqlstate 'P0002' then null; end;
end;
$$;

reset role;
