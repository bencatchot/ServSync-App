\set ON_ERROR_STOP on

do $$
declare v_name text;
begin
  foreach v_name in array array['help_recording_jobs','help_recording_job_events'] loop
    if not exists (
      select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public' and relation.relname=v_name
        and relation.relrowsecurity and relation.relforcerowsecurity
    ) then raise exception 'Forced RLS missing for %.',v_name; end if;
  end loop;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name in ('help_recording_jobs','help_recording_job_events')
      and grantee in ('anon','authenticated','service_role')
  ) then raise exception 'Direct Help recording table grants must remain absent.'; end if;
end;
$$;

select set_config(
  'servsync.test.walkthrough_id',
  (select id::text from public.help_walkthroughs where slug='how-to-create-an-estimate'),
  false
);
select set_config(
  'servsync.test.video_asset_id',
  (
    select revision.video_asset_id::text
      from public.help_walkthrough_revisions revision
      join public.help_walkthroughs walkthrough on walkthrough.id=revision.walkthrough_id
     where walkthrough.slug='how-to-create-an-estimate' and revision.revision_number=1
  ),
  false
);

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$ begin
  begin
    perform public.servsync_create_help_recording_job('{}'::jsonb);
    raise exception 'Contractor unexpectedly created a Help recording job.';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.servsync_list_help_recording_jobs();
    raise exception 'Contractor unexpectedly listed Help recording jobs.';
  exception when sqlstate '42501' then null; end;
  begin
    perform 1 from public.help_recording_jobs;
    raise exception 'Contractor unexpectedly read Help recording jobs directly.';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$
declare v_job jsonb; v_video jsonb; v_poster jsonb;
begin
  v_job := public.servsync_create_help_recording_job(jsonb_build_object(
    'target_walkthrough_id',current_setting('servsync.test.walkthrough_id'),
    'slug','how-to-create-an-estimate','title','How to create an estimate',
    'summary','Create an estimate from a service request with calm, readable pacing.',
    'purpose','both','feature_area','Estimates',
    'route_contexts',jsonb_build_array('contractor.drafts'),
    'audience_roles',jsonb_build_array('owner','admin','office'),
    'keywords',jsonb_build_array('create estimate','quote','draft pricing'),
    'requested_goal','Show a contractor creating one estimate at a human pace.',
    'target_screen','Drafts','required_starting_state','One fictional Demo request is ready.',
    'scenario_key','contractor-create-estimate',
    'action_steps',jsonb_build_array('Open the service request.','Create the estimate.','Save the draft.'),
    'expected_final_state','The saved estimate draft remains visible.',
    'desired_duration_seconds',30,'narration_mode','none',
    'talking_points',jsonb_build_array('Start from the request.','Review the saved result.')
  ));
  perform set_config('servsync.test.recording_job_id',v_job->>'job_id',false);
  perform public.servsync_transition_help_recording_job((v_job->>'job_id')::uuid,'requested','start_preparing','{}');
  perform public.servsync_transition_help_recording_job((v_job->>'job_id')::uuid,'preparing','start_recording','{}');
  perform public.servsync_transition_help_recording_job((v_job->>'job_id')::uuid,'recording','start_processing','{}');

  v_video := public.servsync_reserve_help_recording_media_upload(
    (v_job->>'job_id')::uuid,'video','estimate-human-paced.mp4','video/mp4',2000000,
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','{"validation_status":"passed"}'::jsonb
  );
  v_poster := public.servsync_reserve_help_recording_media_upload(
    (v_job->>'job_id')::uuid,'poster','estimate-human-paced.png','image/png',60000,
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','{"validation_status":"passed"}'::jsonb
  );
  perform set_config('servsync.test.recording_video_id',v_video->>'asset_id',false);
  perform set_config('servsync.test.recording_video_path',v_video->>'path',false);
  perform set_config('servsync.test.recording_poster_id',v_poster->>'asset_id',false);
  perform set_config('servsync.test.recording_poster_path',v_poster->>'path',false);
end;
$$;

reset role;
set role authenticated;
insert into storage.objects(bucket_id,name,metadata) values (
  'help-walkthroughs',current_setting('servsync.test.recording_video_path'),
  '{"size":2000000,"mimetype":"video/mp4"}'::jsonb
),(
  'help-walkthroughs',current_setting('servsync.test.recording_poster_path'),
  '{"size":60000,"mimetype":"image/png"}'::jsonb
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select public.servsync_finalize_help_media_upload(
  current_setting('servsync.test.recording_video_id')::uuid,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',1440,900,30.000
);
select public.servsync_finalize_help_media_upload(
  current_setting('servsync.test.recording_poster_id')::uuid,
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',1440,900,null
);

select public.servsync_transition_help_recording_job(
  current_setting('servsync.test.recording_job_id')::uuid,'processing','complete',
  jsonb_build_object(
    'video_asset_id',current_setting('servsync.test.recording_video_id'),
    'poster_asset_id',current_setting('servsync.test.recording_poster_id'),
    'source_version','Demo Recorder / servsync-human-paced-v1',
    'recorder_metadata',jsonb_build_object(
      'scenario','contractor-create-estimate','pacing_profile','servsync-human-paced-v1',
      'validation_status','passed','sensitive_data_check','passed','duration_seconds',30,
      'canonical_output_provenance','validated_servsync_demo_recorder'
    )
  )
);

do $$
declare v_grant jsonb;
begin
  v_grant := public.servsync_get_help_recording_playback_grant(current_setting('servsync.test.recording_job_id')::uuid);
  if (v_grant->>'video_asset_id')::uuid <> current_setting('servsync.test.recording_video_id')::uuid then
    raise exception 'Recording review playback grant mismatch.';
  end if;
  perform public.servsync_review_help_recording_job(
    current_setting('servsync.test.recording_job_id')::uuid,'approve',
    'Normal-speed review confirmed readable cursor, transitions, and final hold.'
  );
end;
$$;

do $$
declare v_job record;
begin
  select * into strict v_job from public.servsync_list_help_recording_jobs()
   where job_id=current_setting('servsync.test.recording_job_id')::uuid;
  if v_job.status <> 'approved' or v_job.approved_revision <> 3
     or v_job.pacing_profile <> 'servsync-human-paced-v1'
     or v_job.video_asset_id <> current_setting('servsync.test.recording_video_id')::uuid then
    raise exception 'Approved recording job mismatch.';
  end if;
end;
$$;

reset role;

do $$
declare v_walkthrough record;
begin
  select * into strict v_walkthrough from public.help_walkthroughs
   where id=current_setting('servsync.test.walkthrough_id')::uuid;
  if v_walkthrough.current_revision <> 3 or v_walkthrough.published_revision <> 1
     or v_walkthrough.state <> 'needs_review' then
    raise exception 'Old published revision was not preserved before replacement publication.';
  end if;
  if not exists (
    select 1 from public.help_walkthrough_revisions
     where walkthrough_id=v_walkthrough.id and revision_number=1
       and video_asset_id=current_setting('servsync.test.video_asset_id')::uuid
  ) then raise exception 'Original Help revision/media provenance was lost.'; end if;
  if not exists (
    select 1 from public.help_walkthrough_revisions
     where walkthrough_id=v_walkthrough.id and revision_number=3
       and video_asset_id=current_setting('servsync.test.recording_video_id')::uuid
       and human_paced_review='passed' and sensitive_data_review='passed'
       and canonical_output_review='passed' and validation_status='passed'
  ) then raise exception 'Approved human-paced revision mismatch.'; end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select public.servsync_transition_help_walkthrough(
  current_setting('servsync.test.walkthrough_id')::uuid,3,'publish'
);

reset role;

do $$
begin
  if (select count(*) from public.help_recording_job_events
       where job_id=current_setting('servsync.test.recording_job_id')::uuid) <> 6 then
    raise exception 'Recording lifecycle event count mismatch.';
  end if;
  if (select string_agg(to_status,',' order by event_sequence) from public.help_recording_job_events
       where job_id=current_setting('servsync.test.recording_job_id')::uuid)
     <> 'requested,preparing,recording,processing,ready_for_review,approved' then
    raise exception 'Recording lifecycle event order mismatch.';
  end if;
  if (select count(*) from public.help_marketing_derivatives) <> 1
     or (select count(*) from public.marketing_media_assets) <> 1 then
    raise exception 'Recording approval created an unexpected permanent Marketing duplicate.';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);

do $$
begin
  if (select video_asset_id from public.servsync_find_help('create estimate',null,'20000000-0000-4000-8000-000000000001',10))
     <> current_setting('servsync.test.recording_video_id')::uuid then
    raise exception 'Contextual Help did not resolve the current approved revision.';
  end if;
  if (select video_asset_id from public.servsync_list_help_marketing_sources()
       where walkthrough_id=current_setting('servsync.test.walkthrough_id')::uuid)
     <> current_setting('servsync.test.recording_video_id')::uuid then
    raise exception 'Marketing did not reuse the current canonical Help source.';
  end if;
end;
$$;

do $$
declare v_failed jsonb;
begin
  v_failed := public.servsync_create_help_recording_job(jsonb_build_object(
    'target_walkthrough_id',current_setting('servsync.test.walkthrough_id'),
    'slug','how-to-create-an-estimate','title','How to create an estimate',
    'summary','Create another test recording request that will fail safely.',
    'purpose','support','feature_area','Estimates','route_contexts',jsonb_build_array('contractor.drafts'),
    'audience_roles',jsonb_build_array('owner'),'keywords',jsonb_build_array('estimate'),
    'requested_goal','Prove a failed capture has a plain-language terminal state.',
    'target_screen','Drafts','required_starting_state','One Demo request is ready.',
    'scenario_key','contractor-create-estimate','action_steps',jsonb_build_array('Open Drafts.'),
    'expected_final_state','No media is attached.','desired_duration_seconds',30,
    'narration_mode','none','talking_points',jsonb_build_array()
  ));
  perform public.servsync_transition_help_recording_job(
    (v_failed->>'job_id')::uuid,'requested','fail',
    '{"message":"Demo state could not be prepared."}'::jsonb
  );
  if not exists (
    select 1 from public.servsync_list_help_recording_jobs() where job_id=(v_failed->>'job_id')::uuid
      and status='failed' and failure_category='capture_failed'
      and failure_message='Demo state could not be prepared.'
  ) then raise exception 'Recording failure UX state mismatch.'; end if;
end;
$$;

reset role;

do $$
declare v_proc record;
begin
  for v_proc in
    select routine.proname,routine.provolatile,routine.prosecdef,
      pg_get_userbyid(routine.proowner) owner_name,routine.proconfig
    from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace
    where namespace.nspname='public' and routine.proname like 'servsync%help%recording%'
  loop
    if v_proc.owner_name <> 'postgres' or not v_proc.prosecdef
       or not ('search_path=pg_catalog, public, auth' = any(v_proc.proconfig)) then
      raise exception 'Unsafe Help recording function metadata for %.',v_proc.proname;
    end if;
    if v_proc.proname in ('servsync_create_help_recording_job','servsync_transition_help_recording_job',
      'servsync_reserve_help_recording_media_upload','servsync_review_help_recording_job',
      'servsync_private_append_help_recording_event') and v_proc.provolatile <> 'v' then
      raise exception 'Mutating Help recording function % is not VOLATILE.',v_proc.proname;
    end if;
  end loop;
  if has_function_privilege('public','public.servsync_private_normalize_help_recording_spec(jsonb)','execute')
     or has_function_privilege('anon','public.servsync_create_help_recording_job(jsonb)','execute')
     or has_function_privilege('service_role','public.servsync_list_help_recording_jobs()','execute') then
    raise exception 'Help recording function grants are too broad.';
  end if;
end;
$$;
