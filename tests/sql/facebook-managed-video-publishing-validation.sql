\set ON_ERROR_STOP on

begin;

insert into public.profiles(id,role,full_name) values
  ('67000000-0000-4000-8000-000000000001','platform_admin','Managed Video Owner');

insert into public.marketing_content_items(
  id,workspace_id,client_request_id,title,content_type,body,channel_category,
  status,revision_number,created_by
) values (
  '67000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000037',
  '67000000-0000-4000-8000-000000000011','Managed video post','social_post',
  E'Exact approved copy.\n\nAI-generated voiceover using OpenAI''s Cedar voice.',
  'social','approved',9,'67000000-0000-4000-8000-000000000001'
);

insert into storage.objects(id,bucket_id,name,metadata) values (
  '67000000-0000-4000-8000-000000000020','marketing-assets',
  '00000000-0000-4000-8000-000000000037/67000000-0000-4000-8000-000000000021/servsync-platform-introduction-v1-2026-08-16T12-00-00Z.mp4',
  '{"mimetype":"video/mp4","size":"12"}'::jsonb
);

insert into public.marketing_media_assets(
  id,workspace_id,asset_type,source,recorder_scenario,source_commit,
  storage_path,mime_type,file_size_bytes,width,height,duration_seconds,sha256,
  validation_status,sensitive_data_check,pacing_review,pacing_reviewed_at,
  media_variant,source_silent_filename,source_silent_sha256,narration_provider,
  narration_model,narration_voice,narration_script,narration_script_version,
  narration_audio_duration_seconds,narration_start_seconds,narration_end_seconds,
  ai_narration_disclosure_required,ai_narration_disclosure_text,created_by
) values (
  '67000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000037',
  'video','demo_recorder','servsync-platform-introduction',repeat('a',40),
  '00000000-0000-4000-8000-000000000037/67000000-0000-4000-8000-000000000021/servsync-platform-introduction-v1-2026-08-16T12-00-00Z.mp4',
  'video/mp4',12,1440,900,71,repeat('b',64),'passed','passed','passed',now(),
  'narrated_marketing_derivative','servsync-platform-introduction-v1-2026-08-16T11-00-00Z.mp4',repeat('c',64),
  'OpenAI','gpt-4o-mini-tts','cedar','One complete narration script.',1,61,0.75,61.75,
  true,'AI-generated voiceover using OpenAI''s Cedar voice.','67000000-0000-4000-8000-000000000001'
);

insert into public.marketing_content_media_pairings(
  id,workspace_id,content_id,content_revision,asset_id,recorder_scenario,
  claim_demonstrated,status,created_by,reviewed_by,reviewed_at
) values (
  '67000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000037',
  '67000000-0000-4000-8000-000000000010',9,'67000000-0000-4000-8000-000000000021',
  'servsync-platform-introduction','Show the approved ServSync flagship workflow.','approved',
  '67000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001',now()
);

do $$
begin
  if (select capabilities->>'media' from public.marketing_provider_connections where provider='facebook')<>'true'
     or (select capabilities->>'publishing_enabled' from public.marketing_provider_connections where provider='facebook')<>'false' then
    raise exception 'Facebook media capability or public-post gate mismatch.';
  end if;
end;
$$;

update public.marketing_provider_connections set
  connection_status='connected',readiness_status='ready_except_live_post_verification',
  destination_key='1199023349954773',destination_label='ServSync',connected_at=now(),
  capabilities=capabilities||'{"publishing_enabled":true}'::jsonb
where provider='facebook';

set role authenticated;
set request.jwt.claim.sub='67000000-0000-4000-8000-000000000001';
select public.servsync_create_internal_marketing_publication(
  '67000000-0000-4000-8000-000000000040','67000000-0000-4000-8000-000000000010',9,
  'facebook','00000000-0000-4000-8000-000000000061','publish_now',null
);
reset role;

set role service_role;
do $$
declare v_claim jsonb; v_media jsonb;
begin
  v_claim:=public.servsync_claim_due_marketing_publications(1)->0;
  if v_claim->>'operation'<>'publish' or v_claim->>'attempt_number'<>'1'
     or v_claim->'content_snapshot'->>'body'<>E'Exact approved copy.\n\nAI-generated voiceover using OpenAI''s Cedar voice.'
     or v_claim->'media_snapshot'->>'asset_id'<>'67000000-0000-4000-8000-000000000021'
     or v_claim->'media_snapshot'->>'sha256'<>repeat('b',64) then
    raise exception 'Exact managed-video claim mismatch: %',v_claim;
  end if;
  v_media:=public.servsync_prepare_marketing_publication_media(
    (v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer
  );
  if v_media->>'pairing_id'<>'67000000-0000-4000-8000-000000000030'
     or v_media->>'file_size_bytes'<>'12' then
    raise exception 'Managed-media authorization mismatch: %',v_media;
  end if;
  perform public.servsync_mark_marketing_provider_request_started(
    (v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer
  );
  perform public.servsync_record_marketing_provider_acceptance(
    (v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer,
    '4455667788990011','{"provider_state":"accepted","asset_id":"67000000-0000-4000-8000-000000000021"}'::jsonb
  );
  v_claim:=public.servsync_claim_due_marketing_publications(1)->0;
  if v_claim->>'operation'<>'reconcile' or v_claim->>'provider_publication_id'<>'4455667788990011'
     or v_claim->>'attempt_number'<>'1' then
    raise exception 'Known-ID reconciliation claim mismatch: %',v_claim;
  end if;
  perform public.servsync_defer_marketing_provider_reconciliation(
    (v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer,
    '{"provider_state":"processing"}'::jsonb
  );
  if jsonb_array_length(public.servsync_claim_due_marketing_publications(1))<>0 then
    raise exception 'Deferred reconciliation was claimed too early.';
  end if;
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.marketing_publications
    where status='publishing' and provider_publication_id='4455667788990011'
      and provider_operation_state='processing' and provider_reconciliation_count=1
  ) then raise exception 'Provider acceptance/processing state was not persisted.'; end if;
  update public.marketing_publications set provider_reconcile_after=now()-interval '1 second'
   where provider_publication_id='4455667788990011';
end;
$$;

set role service_role;
do $$
declare v_claim jsonb;
begin
  v_claim:=public.servsync_claim_due_marketing_publications(1)->0;
  perform public.servsync_complete_marketing_publication(
    (v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer,
    '4455667788990011','{"provider_state":"confirmed"}'::jsonb
  );
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.marketing_publications
    where status='published' and provider_operation_state='confirmed'
      and provider_publication_id='4455667788990011' and provider_reconciliation_count=1
  ) then raise exception 'Confirmed managed-video publication state mismatch.'; end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub='67000000-0000-4000-8000-000000000001';
select public.servsync_create_internal_marketing_publication(
  '67000000-0000-4000-8000-000000000041','67000000-0000-4000-8000-000000000010',9,
  'facebook','00000000-0000-4000-8000-000000000061','publish_now',null
);
reset role;

set role service_role;
do $$
declare v_claim jsonb;
begin
  v_claim:=public.servsync_claim_due_marketing_publications(1)->0;
  perform public.servsync_mark_marketing_provider_request_started(
    (v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer
  );
  perform public.servsync_record_marketing_provider_acceptance(
    (v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer,
    '4455667788990022','{"provider_state":"accepted"}'::jsonb
  );
  perform public.servsync_fail_marketing_publication(
    (v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer,
    'provider_uncertain','Known Facebook Video ID could not be publicly confirmed.',false
  );
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.marketing_publications
    where status='failed' and provider_publication_id='4455667788990022' and not retry_eligible
  ) then raise exception 'Uncertain known-ID failure lost duplicate-safety evidence.'; end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub='67000000-0000-4000-8000-000000000001';
select public.servsync_create_internal_marketing_publication(
  '67000000-0000-4000-8000-000000000042','67000000-0000-4000-8000-000000000010',9,
  'facebook','00000000-0000-4000-8000-000000000061','publish_now',null
);
reset role;

select set_config('servsync.test_rejected_publication_id',id::text,false)
from public.marketing_publications
where client_request_id='67000000-0000-4000-8000-000000000042';

set role service_role;
select public.servsync_claim_due_marketing_publications(1);
reset role;

update public.marketing_content_media_pairings set status='rejected',reviewed_at=now()
where id='67000000-0000-4000-8000-000000000030';

set role service_role;
do $$
declare v_blocked boolean:=false;
begin
  begin
    perform public.servsync_prepare_marketing_publication_media(
      current_setting('servsync.test_rejected_publication_id')::uuid,1
    );
  exception when others then v_blocked:=true; end;
  if not v_blocked then raise exception 'Rejected pairing remained media-authorized.'; end if;
end;
$$;
reset role;

rollback;
