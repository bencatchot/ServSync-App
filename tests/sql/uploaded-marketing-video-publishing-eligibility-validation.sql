\set ON_ERROR_STOP on

begin;

insert into public.profiles(id,role,full_name) values
  ('68000000-0000-4000-8000-000000000001','platform_admin','Uploaded Video Owner');

insert into public.marketing_content_items(
  id,workspace_id,client_request_id,title,content_type,body,channel_category,
  status,revision_number,created_by
) values (
  '68000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000037',
  '68000000-0000-4000-8000-000000000011','Approved upload','social_post',
  'Exact approved open-beta copy.','social','approved',1,
  '68000000-0000-4000-8000-000000000001'
);

insert into public.marketing_media_intakes(
  id,workspace_id,client_request_id,source_kind,source_bucket,source_path,
  original_file_name,mime_type,file_size_bytes,sha256,width,height,duration_seconds,
  poster_bucket,poster_path,poster_sha256,poster_file_size_bytes,
  rights_acknowledgement_version,acknowledged_by,acknowledged_at,status,
  consumed_asset_id
) values (
  '68000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000037',
  '68000000-0000-4000-8000-000000000021','marketing_upload','marketing-assets',
  '00000000-0000-4000-8000-000000000037/68000000-0000-4000-8000-000000000020/open-beta-commercial.mp4',
  'open-beta-commercial.mp4','video/mp4',12,repeat('d',64),1080,1920,28.9,
  'marketing-assets',
  '00000000-0000-4000-8000-000000000037/intakes/68000000-0000-4000-8000-000000000020/poster.jpg',
  repeat('e',64),10,'marketing_media_rights_v1',
  '68000000-0000-4000-8000-000000000001',now(),'upload_pending',null
);

insert into storage.objects(id,bucket_id,name,metadata) values
  (
    '68000000-0000-4000-8000-000000000030','marketing-assets',
    '00000000-0000-4000-8000-000000000037/68000000-0000-4000-8000-000000000020/open-beta-commercial.mp4',
    '{"mimetype":"video/mp4","size":"12"}'::jsonb
  );

insert into public.marketing_media_assets(
  id,workspace_id,asset_type,source,storage_bucket,storage_path,mime_type,
  file_size_bytes,width,height,duration_seconds,sha256,validation_status,
  sensitive_data_check,pacing_review,media_variant,created_by,source_intake_id,
  ephemeral,poster_bucket,poster_path,poster_sha256,poster_file_size_bytes
) values (
  '68000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000037',
  'video','marketing_upload','marketing-assets',
  '00000000-0000-4000-8000-000000000037/68000000-0000-4000-8000-000000000020/open-beta-commercial.mp4',
  'video/mp4',12,1080,1920,28.9,repeat('d',64),'passed','user_acknowledged',
  'not_required','uploaded_marketing_source','68000000-0000-4000-8000-000000000001',
  '68000000-0000-4000-8000-000000000020',true,'marketing-assets',
  '00000000-0000-4000-8000-000000000037/intakes/68000000-0000-4000-8000-000000000020/poster.jpg',
  repeat('e',64),10
);

update public.marketing_media_intakes
set status='consumed',consumed_asset_id='68000000-0000-4000-8000-000000000020'
where id='68000000-0000-4000-8000-000000000020';

insert into public.marketing_content_media_pairings(
  id,workspace_id,content_id,content_revision,asset_id,recorder_scenario,claim_demonstrated,
  status,created_by,reviewed_by,reviewed_at
) values (
  '68000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000037',
  '68000000-0000-4000-8000-000000000010',1,'68000000-0000-4000-8000-000000000020',
  'uploaded-marketing-source','Publish the approved uploaded commercial.','approved',
  '68000000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001',now()
);

update public.marketing_provider_connections set
  connection_status='connected',readiness_status='ready_except_live_post_verification',
  destination_key='1199023349954773',destination_label='ServSync',connected_at=now(),
  capabilities=capabilities||'{"publishing_enabled":true}'::jsonb
where provider='facebook';

set role authenticated;
set request.jwt.claim.sub='68000000-0000-4000-8000-000000000001';
select public.servsync_create_internal_marketing_publication(
  '68000000-0000-4000-8000-000000000050','68000000-0000-4000-8000-000000000010',1,
  'facebook','00000000-0000-4000-8000-000000000061','publish_now',null
);
reset role;

set role service_role;
do $$
declare v_claim jsonb; v_media jsonb;
begin
  v_claim:=public.servsync_claim_due_marketing_publications(1)->0;
  if v_claim->'media_snapshot'->>'media_variant'<>'uploaded_marketing_source' then
    raise exception 'Uploaded media variant was not preserved in the immutable claim: %',v_claim;
  end if;
  v_media:=public.servsync_prepare_marketing_publication_media(
    (v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer
  );
  if v_media->>'asset_id'<>'68000000-0000-4000-8000-000000000020'
     or v_media->>'sha256'<>repeat('d',64) then
    raise exception 'Approved uploaded MP4 was not authorized exactly: %',v_media;
  end if;
end;
$$;
reset role;

-- The rights/intake lineage remains part of authorization after approval.
update public.marketing_media_intakes
set status='selected',consumed_asset_id=null
where id='68000000-0000-4000-8000-000000000020';

set role service_role;
do $$
declare v_blocked boolean:=false;
begin
  begin
    perform public.servsync_prepare_marketing_publication_media(
      (select id from public.marketing_publications
        where client_request_id='68000000-0000-4000-8000-000000000050'),1
    );
  exception when others then v_blocked:=true; end;
  if not v_blocked then
    raise exception 'Uploaded MP4 remained authorized without its exact rights acknowledgement.';
  end if;
end;
$$;
reset role;

rollback;
