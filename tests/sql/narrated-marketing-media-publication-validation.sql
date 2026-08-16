\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regclass('auth.users') is not null then
    execute $users$
      insert into auth.users (id,email,raw_user_meta_data) values
        ('66000000-0000-4000-8000-000000000001','narrated-owner@servsync.invalid','{"full_name":"Narrated Media Owner"}'::jsonb),
        ('66000000-0000-4000-8000-000000000002','narrated-contractor@servsync.invalid','{"full_name":"Narrated Media Contractor"}'::jsonb)
    $users$;
  end if;
end;
$$;

insert into public.profiles (id,role,full_name) values
  ('66000000-0000-4000-8000-000000000001','platform_admin','Narrated Media Owner'),
  ('66000000-0000-4000-8000-000000000002','contractor','Narrated Media Contractor')
on conflict (id) do update set
  role=excluded.role,
  full_name=excluded.full_name;

insert into public.marketing_content_items (
  id,workspace_id,client_request_id,title,content_type,body,channel_category,
  status,revision_number,created_by
) values (
  '66000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000037',
  '66000000-0000-4000-8000-000000000011','Flagship post','social_post',
  E'One exact owner-review message.\n\nAI-generated voiceover using OpenAI''s Cedar voice.',
  'social','needs_approval',3,'66000000-0000-4000-8000-000000000001'
);

insert into storage.objects (id,bucket_id,name,metadata) values (
  '66000000-0000-4000-8000-000000000020','marketing-assets',
  '00000000-0000-4000-8000-000000000037/66000000-0000-4000-8000-000000000021/servsync-platform-introduction-narrated-v2-2026-08-16T20-32-44Z.mp4',
  '{"mimetype":"video/mp4","size":"4988093"}'::jsonb
);

update public.marketing_provider_connections set
  connection_status='connected',readiness_status='ready_except_live_post_verification',
  destination_key='1122334455667788',destination_label='ServSync',connected_at=now(),
  capabilities='{"text":true,"media":true,"publishing_enabled":true}'::jsonb
where provider='facebook';

set role authenticated;
set request.jwt.claim.sub='66000000-0000-4000-8000-000000000002';
do $$ begin
  begin perform public.servsync_register_narrated_marketing_media(
    '66000000-0000-4000-8000-000000000021','66000000-0000-4000-8000-000000000030',
    '66000000-0000-4000-8000-000000000010',3,'servsync-platform-introduction',repeat('a',40),
    '00000000-0000-4000-8000-000000000037/66000000-0000-4000-8000-000000000021/servsync-platform-introduction-narrated-v2-2026-08-16T20-32-44Z.mp4',
    'video/mp4',4988093,1440,900,71,repeat('b',64),now(),'Introduce the two-sided ServSync relationship.',
    'servsync-platform-introduction-v2-2026-08-16T20-27-35-848Z.mp4',repeat('c',64),
    'OpenAI','gpt-4o-mini-tts','cedar','One complete narration script.',1,61.056,0.75,61.806,
    'AI-generated voiceover using OpenAI''s Cedar voice.'
  ); raise exception 'Contractor narrated media registration unexpectedly succeeded.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='66000000-0000-4000-8000-000000000001';
do $$
declare v_state jsonb; v_receipt jsonb;
begin
  perform public.servsync_register_narrated_marketing_media(
    '66000000-0000-4000-8000-000000000021','66000000-0000-4000-8000-000000000030',
    '66000000-0000-4000-8000-000000000010',3,'servsync-platform-introduction',repeat('a',40),
    '00000000-0000-4000-8000-000000000037/66000000-0000-4000-8000-000000000021/servsync-platform-introduction-narrated-v2-2026-08-16T20-32-44Z.mp4',
    'video/mp4',4988093,1440,900,71,repeat('b',64),now(),'Introduce the two-sided ServSync relationship.',
    'servsync-platform-introduction-v2-2026-08-16T20-27-35-848Z.mp4',repeat('c',64),
    'OpenAI','gpt-4o-mini-tts','cedar','One complete narration script.',1,61.056,0.75,61.806,
    'AI-generated voiceover using OpenAI''s Cedar voice.'
  );
  perform public.servsync_review_internal_marketing_media_pairing(
    '66000000-0000-4000-8000-000000000030','approved'
  );
  v_state := public.servsync_get_internal_marketing_media();
  if v_state->'assets'->0->>'media_variant' <> 'narrated_marketing_derivative'
     or v_state->'assets'->0->>'narration_provider' <> 'OpenAI'
     or v_state->'assets'->0->>'narration_voice' <> 'cedar'
     or v_state->'assets'->0->>'ai_narration_disclosure_required' <> 'true'
     or v_state->'pairings'->0->>'status' <> 'approved' then
    raise exception 'Narrated media state mismatch: %',v_state;
  end if;

  perform public.servsync_transition_internal_marketing_content(
    '66000000-0000-4000-8000-000000000010',3,'approved',null
  );
  v_state := public.servsync_get_internal_marketing_media();
  if not exists (
    select 1 from jsonb_array_elements(v_state->'pairings') pairing
    where pairing->>'content_id'='66000000-0000-4000-8000-000000000010'
      and pairing->>'content_revision'='4'
      and pairing->>'asset_id'='66000000-0000-4000-8000-000000000021'
      and pairing->>'status'='approved'
  ) then raise exception 'Status-only text approval did not preserve approved media pairing.'; end if;

  v_receipt := public.servsync_create_internal_marketing_publication(
    '66000000-0000-4000-8000-000000000040','66000000-0000-4000-8000-000000000010',4,
    'facebook','00000000-0000-4000-8000-000000000061','publish_now',null
  );
  if v_receipt->>'status' <> 'scheduled' then raise exception 'Media publication creation failed.'; end if;
  v_state := public.servsync_get_internal_marketing_publishing();
  if v_state->'publications'->0->'content_snapshot'->>'body'
       <> E'One exact owner-review message.\n\nAI-generated voiceover using OpenAI''s Cedar voice.'
     or v_state->'publications'->0->'media_snapshot'->>'asset_id'
       <> '66000000-0000-4000-8000-000000000021'
     or v_state->'publications'->0->'media_snapshot'->>'sha256' <> repeat('b',64)
     or v_state->'publications'->0->'media_snapshot'->>'narration_voice' <> 'cedar' then
    raise exception 'Immutable text/media publication snapshot mismatch.';
  end if;

end;
$$;
reset role;

set role service_role;
do $$
declare v_claim jsonb;
begin
  v_claim := public.servsync_claim_due_marketing_publications(1)->0;
  if v_claim->>'media_pairing_id' is null
     or v_claim->'media_snapshot'->>'asset_id' <> '66000000-0000-4000-8000-000000000021'
     or v_claim->'content_snapshot'->>'body' <> E'One exact owner-review message.\n\nAI-generated voiceover using OpenAI''s Cedar voice.' then
    raise exception 'Worker text/media claim parity mismatch: %',v_claim;
  end if;
end;
$$;
reset role;

do $$
declare v_blocked boolean := false;
begin
  begin update public.marketing_publications set media_snapshot='{}'::jsonb;
  exception when raise_exception then v_blocked := true; end;
  if not v_blocked then raise exception 'Publication media snapshot mutation unexpectedly succeeded.'; end if;
end;
$$;

rollback;
