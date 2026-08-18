\set ON_ERROR_STOP on

insert into public.profiles (id,role,full_name) values
  ('10000000-0000-4000-8000-000000000001','platform_admin','Platform Admin'),
  ('10000000-0000-4000-8000-000000000002','contractor','Owner A'),
  ('10000000-0000-4000-8000-000000000003','contractor','Owner B'),
  ('10000000-0000-4000-8000-000000000004','contractor','Admin A'),
  ('10000000-0000-4000-8000-000000000005','contractor','Office A'),
  ('10000000-0000-4000-8000-000000000006','contractor','Field A'),
  ('10000000-0000-4000-8000-000000000007','contractor','Viewer A'),
  ('10000000-0000-4000-8000-000000000008','homeowner','Homeowner');
insert into public.contractor_profiles(id,owner_user_id,business_name,account_status) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Contractor A','active'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','Contractor B','active');
insert into public.contractor_team_members(contractor_id,user_id,role,status) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','admin','active'),
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','office','active'),
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006','field_tech','active'),
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','viewer','active');

do $$
declare v_name text;
begin
  foreach v_name in array array['help_media_assets','help_walkthroughs','help_walkthrough_revisions','help_walkthrough_contexts','help_support_gaps','help_marketing_derivatives'] loop
    if not exists (
      select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public' and relation.relname=v_name and relation.relrowsecurity and relation.relforcerowsecurity
    ) then raise exception 'Forced RLS missing for %.', v_name; end if;
  end loop;
  if not exists (select 1 from storage.buckets where id='help-walkthroughs' and not public
    and file_size_limit=104857600 and allowed_mime_types @> array['video/mp4']::text[]) then
    raise exception 'Private bounded Help bucket mismatch.';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name like 'help_%' and grantee in ('anon','authenticated','service_role')
  ) then raise exception 'Direct Help table grants must remain absent.'; end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$ begin
  begin
    perform public.servsync_create_help_walkthrough('denied', '{}'::jsonb);
    raise exception 'Contractor unexpectedly authored Help Studio content.';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.servsync_list_help_walkthroughs(null);
    raise exception 'Contractor unexpectedly listed Help Studio drafts.';
  exception when sqlstate '42501' then null; end;
  begin
    perform 1 from public.help_walkthroughs;
    raise exception 'Contractor unexpectedly read Help tables directly.';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$
declare v_reservation jsonb; v_poster jsonb;
begin
  v_reservation := public.servsync_reserve_help_media_upload(
    'video','servsync-contractor-create-estimate.mp4','video/mp4',1401657,
    '5058d65043eb4d14fe29e84c7262fec1267e9e19',
    '{"canonical_product_output":true,"environment":"Demo"}'::jsonb
  );
  perform set_config('servsync.test.video_asset_id',v_reservation->>'asset_id',false);
  perform set_config('servsync.test.video_path',v_reservation->>'path',false);
  v_poster := public.servsync_reserve_help_media_upload(
    'poster','servsync-contractor-create-estimate.jpg','image/jpeg',50000,
    '5058d65043eb4d14fe29e84c7262fec1267e9e19',
    '{"canonical_product_output":true,"environment":"Demo"}'::jsonb
  );
  perform set_config('servsync.test.poster_asset_id',v_poster->>'asset_id',false);
  perform set_config('servsync.test.poster_path',v_poster->>'path',false);
end;
$$;
reset role;
set role authenticated;
insert into storage.objects(bucket_id,name,metadata) values (
  'help-walkthroughs',current_setting('servsync.test.video_path'),
  '{"size":1401657,"mimetype":"video/mp4"}'::jsonb
),(
  'help-walkthroughs',current_setting('servsync.test.poster_path'),
  '{"size":50000,"mimetype":"image/jpeg"}'::jsonb
);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select public.servsync_finalize_help_media_upload(
  current_setting('servsync.test.video_asset_id')::uuid,
  '441aff3a678595eec7d297e7d6820ce7338950dd66618c8c52911c93a0e1b7df',
  1440,900,23.000
);
select public.servsync_finalize_help_media_upload(
  current_setting('servsync.test.poster_asset_id')::uuid,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  1440,900,null
);

do $$
declare v_created jsonb; v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'title','How to create an estimate',
    'summary','Start a contractor draft, add the agreed work, and create an estimate for review.',
    'steps',jsonb_build_array('Open Drafts and start a new draft.','Choose Estimate and add the work.','Review the total and create the estimate.'),
    'keywords',jsonb_build_array('create estimate','quote','draft pricing','price book'),
    'feature_area','Estimates',
    'route_contexts',jsonb_build_array('contractor.drafts'),
    'audience_roles',jsonb_build_array('owner','admin','office'),
    'purpose','both',
    'source_commit','5058d65043eb4d14fe29e84c7262fec1267e9e19',
    'source_version','Demo recorder v1',
    'video_asset_id',current_setting('servsync.test.video_asset_id'),
    'poster_asset_id',current_setting('servsync.test.poster_asset_id'),
    'human_paced_review','passed',
    'sensitive_data_review','passed',
    'canonical_output_review','passed',
    'validation_status','passed',
    'narration_provider',null,'narration_voice',null,'narration_disclosure',null,
    'transcript','Create an Estimate Draft, add the work and price, then create the estimate.'
  );
  v_created := public.servsync_create_help_walkthrough('how-to-create-an-estimate',v_payload);
  perform set_config('servsync.test.walkthrough_id',v_created->>'walkthrough_id',false);
  perform public.servsync_transition_help_walkthrough((v_created->>'walkthrough_id')::uuid,1,'publish');
  v_payload := jsonb_set(v_payload,'{title}','"How to create an estimate - revised"'::jsonb);
  perform public.servsync_update_help_walkthrough((v_created->>'walkthrough_id')::uuid,1,v_payload);
end;
$$;

reset role;
insert into public.marketing_media_assets (
  id,workspace_id,asset_type,source,ephemeral,storage_bucket,storage_path,mime_type,file_size_bytes,sha256
) values (
  '30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000037',
  'video','marketing_upload',true,'marketing-assets','temporary/help-derivative.mp4','video/mp4',1401657,
  '441aff3a678595eec7d297e7d6820ce7338950dd66618c8c52911c93a0e1b7df'
);
insert into public.marketing_media_lifecycles(asset_id,workspace_id,state) values (
  '30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000037','uploaded'
);
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$ begin
  if (public.servsync_register_help_marketing_derivative(
    current_setting('servsync.test.walkthrough_id')::uuid,1,
    current_setting('servsync.test.video_asset_id')::uuid,
    '30000000-0000-4000-8000-000000000001',
    '441aff3a678595eec7d297e7d6820ce7338950dd66618c8c52911c93a0e1b7df'
  )->>'marketing_asset_id')::uuid <> '30000000-0000-4000-8000-000000000001' then
    raise exception 'Canonical Help Marketing derivative registration mismatch.';
  end if;
end $$;

do $$
begin
  if (select count(*) from public.servsync_list_help_walkthroughs(null)) <> 1 then
    raise exception 'Admin Help list mismatch.';
  end if;
  if (select count(*) from public.servsync_list_help_marketing_sources()) <> 1 then
    raise exception 'Canonical Help Marketing source mismatch.';
  end if;
  if not exists (
    select 1 from public.servsync_list_help_walkthroughs(null)
     where walkthrough_id = current_setting('servsync.test.walkthrough_id')::uuid
       and current_revision = 2 and published_revision = 1 and state = 'needs_review'
  ) then
    raise exception 'Published revision was not preserved while the edit awaits review.';
  end if;
  if (public.servsync_get_help_media_usage()->>'total_bytes')::bigint <> 1451657 then
    raise exception 'Help usage bytes mismatch.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$ begin
  if (select count(*) from public.servsync_find_help('create estimate',null,'20000000-0000-4000-8000-000000000001',10)) <> 1
     or (select count(*) from public.servsync_find_help('quote',null,'20000000-0000-4000-8000-000000000001',10)) <> 1
     or (select count(*) from public.servsync_find_help('draft pricing',null,'20000000-0000-4000-8000-000000000001',10)) <> 1
     or (select count(*) from public.servsync_find_help(null,'contractor.drafts','20000000-0000-4000-8000-000000000001',10)) <> 1 then
    raise exception 'Deterministic Help retrieval mismatch.';
  end if;
  if (public.servsync_get_help_playback_grant(current_setting('servsync.test.walkthrough_id')::uuid,'20000000-0000-4000-8000-000000000001')->>'video_asset_id')::uuid
     <> current_setting('servsync.test.video_asset_id')::uuid then raise exception 'Playback grant mismatch.'; end if;
  if (select count(*) from storage.objects where bucket_id='help-walkthroughs') <> 0 then
    raise exception 'Published Help media unexpectedly allowed direct private-bucket reads.';
  end if;
  begin
    perform public.servsync_find_help('quote',null,'20000000-0000-4000-8000-000000000002',10);
    raise exception 'Contractor A unexpectedly used Contractor B context.';
  exception when sqlstate '42501' then null; end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',false);
do $$ begin
  if (select count(*) from public.servsync_find_help('quote',null,'20000000-0000-4000-8000-000000000001',10)) <> 0 then
    raise exception 'Field technician unexpectedly received excluded Help content.';
  end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000008',false);
do $$ begin
  if (select count(*) from public.servsync_find_help('quote',null,null,10)) <> 0 then
    raise exception 'Homeowner unexpectedly received contractor Help content.';
  end if;
  perform public.servsync_record_help_gap('How do I upload an estimate?',null,null);
  perform public.servsync_record_help_gap('How   do I upload an estimate?',null,null);
end $$;
reset role;

do $$
declare v_proc record;
begin
  if (select count(*) from public.help_marketing_derivatives) <> 1 then
    raise exception 'Canonical Help Marketing derivative lineage mismatch.';
  end if;
  if (select occurrence_count from public.help_support_gaps) <> 2 then raise exception 'Support-gap frequency mismatch.'; end if;
  for v_proc in
    select routine.proname, routine.provolatile, routine.prosecdef,
      pg_get_userbyid(routine.proowner) owner_name,
      routine.proconfig
    from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace
    where namespace.nspname='public' and routine.proname like 'servsync%help%'
  loop
    if v_proc.owner_name <> 'postgres' or not v_proc.prosecdef
       or not ('search_path=pg_catalog, public, auth' = any(v_proc.proconfig)
         or 'search_path=pg_catalog, public, auth, storage' = any(v_proc.proconfig)) then
      raise exception 'Unsafe Help function metadata for %.',v_proc.proname;
    end if;
    if v_proc.proname in ('servsync_reserve_help_media_upload','servsync_finalize_help_media_upload',
      'servsync_create_help_walkthrough','servsync_update_help_walkthrough','servsync_transition_help_walkthrough',
      'servsync_register_help_marketing_derivative','servsync_record_help_gap',
      'servsync_private_insert_help_revision') and v_proc.provolatile <> 'v' then
      raise exception 'Mutating Help function % is not VOLATILE.',v_proc.proname;
    end if;
  end loop;
  if has_function_privilege('public','public.servsync_private_require_help_admin()','execute')
     or has_function_privilege('anon','public.servsync_find_help(text,text,uuid,integer)','execute')
     or has_function_privilege('authenticated','public.servsync_get_help_media_for_service(uuid)','execute') then
    raise exception 'Help function grants are too broad.';
  end if;
end;
$$;
