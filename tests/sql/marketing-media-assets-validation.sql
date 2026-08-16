\set ON_ERROR_STOP on

insert into public.profiles (id, role, full_name) values
  ('65000000-0000-4000-8000-000000000001', 'platform_admin', 'Marketing Media Owner'),
  ('65000000-0000-4000-8000-000000000002', 'contractor', 'Marketing Media Contractor');

insert into public.marketing_content_items (
  id, workspace_id, client_request_id, title, content_type, body, channel_category,
  status, revision_number, created_by
) values (
  '65000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000037',
  '65000000-0000-4000-8000-000000000011', 'Home History post', 'social_post',
  'Open one home, enter Home History, and reopen its finalized report.', 'social',
  'approved', 3, '65000000-0000-4000-8000-000000000001'
);

insert into storage.objects (id, bucket_id, name, metadata) values (
  '65000000-0000-4000-8000-000000000020', 'marketing-assets',
  '00000000-0000-4000-8000-000000000037/65000000-0000-4000-8000-000000000021/servsync-homeowner-home-history-v1-2026-08-15T18-00-00-000Z.mp4',
  '{"mimetype":"video/mp4","size":"4096"}'::jsonb
);

do $$
declare v_function regprocedure;
begin
  if not exists (select 1 from storage.buckets where id='marketing-assets' and not public and file_size_limit=104857600)
     or exists (select 1 from public.marketing_media_assets)
     or exists (select 1 from public.marketing_content_media_pairings)
     or exists (select 1 from public.marketing_content_media_pairing_events) then
    raise exception 'Marketing media initial state mismatch.';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'marketing_media_assets','marketing_content_media_pairings','marketing_content_media_pairing_events'
    ) and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then raise exception 'Marketing media forced-RLS mismatch.'; end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name in (
      'marketing_media_assets','marketing_content_media_pairings','marketing_content_media_pairing_events'
    ) and grantee in ('PUBLIC','anon','authenticated','service_role')
  ) then raise exception 'Marketing media direct table privilege mismatch.'; end if;
  foreach v_function in array array[
    'public.servsync_register_and_pair_internal_marketing_media_asset(uuid,uuid,uuid,bigint,text,text,text,text,bigint,integer,integer,numeric,text,timestamptz,text)'::regprocedure,
    'public.servsync_review_internal_marketing_media_pairing(uuid,text)'::regprocedure,
    'public.servsync_get_internal_marketing_media()'::regprocedure
  ] loop
    if not has_function_privilege('authenticated', v_function, 'execute')
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'Marketing media RPC grant mismatch for %.', v_function;
    end if;
  end loop;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '65000000-0000-4000-8000-000000000002';
do $$ begin
  begin perform public.servsync_get_internal_marketing_media(); raise exception 'Contractor media read unexpectedly succeeded.'; exception when insufficient_privilege then null; end;
  begin perform public.servsync_register_and_pair_internal_marketing_media_asset(
    '65000000-0000-4000-8000-000000000021','65000000-0000-4000-8000-000000000030',
    '65000000-0000-4000-8000-000000000010',3,'homeowner-home-history',repeat('a',40),
    '00000000-0000-4000-8000-000000000037/65000000-0000-4000-8000-000000000021/servsync-homeowner-home-history-v1-2026-08-15T18-00-00-000Z.mp4',
    'video/mp4',4096,1440,900,23.4,repeat('b',64),now(),
    'Open one home, enter Home History, and reopen its finalized report.'
  ); raise exception 'Contractor media registration unexpectedly succeeded.'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '65000000-0000-4000-8000-000000000001';
do $$
declare v_state jsonb;
begin
  begin perform public.servsync_register_and_pair_internal_marketing_media_asset(
    '65000000-0000-4000-8000-000000000021','65000000-0000-4000-8000-000000000030',
    '65000000-0000-4000-8000-000000000010',2,'homeowner-home-history',repeat('a',40),
    '00000000-0000-4000-8000-000000000037/65000000-0000-4000-8000-000000000021/servsync-homeowner-home-history-v1-2026-08-15T18-00-00-000Z.mp4',
    'video/mp4',4096,1440,900,23.4,repeat('b',64),now(),
    'Open one home and reopen the report.'
  ); raise exception 'Stale content revision unexpectedly paired.'; exception when serialization_failure then null; end;
  v_state := public.servsync_get_internal_marketing_media();
  if jsonb_array_length(v_state->'assets') <> 0 or jsonb_array_length(v_state->'pairings') <> 0 then
    raise exception 'Failed exact-revision pairing left an orphaned asset.';
  end if;
  perform public.servsync_register_and_pair_internal_marketing_media_asset(
    '65000000-0000-4000-8000-000000000021','65000000-0000-4000-8000-000000000030',
    '65000000-0000-4000-8000-000000000010',3,'homeowner-home-history',repeat('a',40),
    '00000000-0000-4000-8000-000000000037/65000000-0000-4000-8000-000000000021/servsync-homeowner-home-history-v1-2026-08-15T18-00-00-000Z.mp4',
    'video/mp4',4096,1440,900,23.4,repeat('b',64),now(),
    'Open one home, enter Home History, and reopen its finalized report.'
  );
  perform public.servsync_review_internal_marketing_media_pairing('65000000-0000-4000-8000-000000000030','approved');
  v_state := public.servsync_get_internal_marketing_media();
  if jsonb_array_length(v_state->'assets') <> 1
     or jsonb_array_length(v_state->'pairings') <> 1
     or v_state->'pairings'->0->>'status' <> 'approved'
     or v_state->'pairings'->0->>'content_revision' <> '3'
     or v_state->'pairings'->0->>'asset_id' <> '65000000-0000-4000-8000-000000000021' then
    raise exception 'Marketing media exact pairing state mismatch: %', v_state;
  end if;
end;
$$;
reset role;

do $$
declare
  v_asset_blocked boolean := false;
  v_pairing_blocked boolean := false;
  v_event_blocked boolean := false;
  v_truncate_blocked boolean := false;
begin
  begin update public.marketing_media_assets set sha256=repeat('c',64); exception when raise_exception then v_asset_blocked := true; end;
  begin update public.marketing_content_media_pairings set asset_id=gen_random_uuid(); exception when raise_exception then v_pairing_blocked := true; end;
  begin delete from public.marketing_content_media_pairing_events; exception when raise_exception then v_event_blocked := true; end;
  begin truncate table public.marketing_content_media_pairing_events; exception when raise_exception then v_truncate_blocked := true; end;
  if not v_asset_blocked or not v_pairing_blocked or not v_event_blocked or not v_truncate_blocked then
    raise exception 'Marketing media immutability mismatch.';
  end if;
  if (select count(*) from public.marketing_content_media_pairing_events) <> 2 then raise exception 'Marketing media review history count mismatch.'; end if;
end;
$$;
