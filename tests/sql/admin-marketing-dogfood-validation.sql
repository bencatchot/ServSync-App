\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',false);
do $$ declare v_context jsonb;
begin
  v_context:=public.servsync_get_marketing_creation_context(null);
  if jsonb_array_length(v_context->'product_media')<>1
     or v_context#>>'{product_media,0,label}'<>'Legacy Demo'
     or v_context#>>'{product_media,0,asset_type}'<>'video'
     or v_context::text like '%storage_path%'
     or v_context::text like '%source_commit%' then
    raise exception 'Internal product-media context is not bounded and operator-friendly.';
  end if;
end;
$$;

select reserved->>'request_id' as request_id from (select public.servsync_reserve_marketing_content_creation(
  null,'74000000-0000-4000-8000-000000000001','managed_asset',null,
  '15000000-0000-4000-8000-000000000099',
  'Explain how a homeowner can reopen a finalized ServSync report.','openai','gpt-4o-mini'
) reserved) response \gset dogfood_
reset role;

set role service_role;
select claimed->>'claim_token' as claim_token from (select public.servsync_claim_marketing_content_creation(
  :'dogfood_request_id'::uuid) claimed) response \gset dogfood_
select completed->>'content_id' as content_id from (select public.servsync_complete_marketing_content_creation(
  :'dogfood_request_id'::uuid,:'dogfood_claim_token'::uuid,'Reopen the record when you need it',
  'Home History keeps the finalized ServSync report with the home, so it can be reopened when the homeowner needs the details.',140,35
) completed) response \gset dogfood_
reset role;

select set_config('servsync_test.dogfood_content_id',:'dogfood_content_id',false);

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',false);
do $$ declare v_usage jsonb;
begin
  v_usage:=public.servsync_get_marketing_usage_summary(null);
  if (v_usage#>>'{usage,ai_text_drafts_rolling_30_days}')::integer<1
     or v_usage#>>'{generation,recent_text_draft,provider}'<>'openai'
     or v_usage#>>'{generation,recent_text_draft,model}'<>'gpt-4o-mini'
     or v_usage#>>'{generation,recent_text_draft,cost_status}'<>'unavailable'
     or v_usage#>>'{generation,recent_text_draft,outcome}'<>'succeeded' then
    raise exception 'AI text usage evidence is incomplete.';
  end if;
end;
$$;
reset role;
do $$ declare v_workspace_id uuid; v_package_id uuid;
begin
  select id into strict v_workspace_id from public.marketing_workspaces
    where contractor_id='20000000-0000-4000-8000-000000000001';
  select id into strict v_package_id from public.marketing_publication_packages
    where workspace_id=v_workspace_id and status='needs_attention' and approved_by is not null limit 1;
  update public.marketing_publication_packages set status='ready' where id=v_package_id;
  perform set_config('servsync_test.prepared_usage_package_id',v_package_id::text,false);
end;
$$;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$ declare v_usage jsonb;
begin
  v_usage:=public.servsync_get_marketing_usage_summary('20000000-0000-4000-8000-000000000001');
  if (v_usage#>>'{usage,ready_scheduled_posts}')::integer<1 then
    raise exception 'Prepared-post usage does not include Ready packages.';
  end if;
end;
$$;
reset role;
update public.marketing_publication_packages set status='needs_attention'
where id=current_setting('servsync_test.prepared_usage_package_id')::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',false);
select public.servsync_transition_marketing_content(null,:'dogfood_content_id'::uuid,1,'needs_approval',null);
select public.servsync_transition_marketing_content(null,:'dogfood_content_id'::uuid,2,'approved',null);
reset role;

do $$
begin
  if not exists(select 1 from public.marketing_content_source_assets
      where content_id=current_setting('servsync_test.dogfood_content_id')::uuid
        and asset_id='15000000-0000-4000-8000-000000000099'
        and source_kind='managed_asset' and source_job_id is null) then
    raise exception 'Managed product-media source lineage mismatch.';
  end if;
  if not exists(select 1 from public.marketing_content_media_pairings
      where content_id=current_setting('servsync_test.dogfood_content_id')::uuid and content_revision=3
        and asset_id='15000000-0000-4000-8000-000000000099'
        and recorder_scenario='legacy-demo' and status='candidate') then
    raise exception 'Managed product media did not enter the candidate-review contract.';
  end if;
  if exists(select 1 from public.marketing_publications publication
      where publication.content_id=current_setting('servsync_test.dogfood_content_id')::uuid) then
    raise exception 'Dogfood content unexpectedly created a publication.';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$ begin
  begin
    perform public.servsync_reserve_marketing_content_creation(
      '20000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002',
      'managed_asset',null,'15000000-0000-4000-8000-000000000099','Try another workspace asset.','openai','gpt-4o-mini');
    raise exception 'Contractor unexpectedly used internal product media.';
  exception when sqlstate '42501' then null;
  end;
end;
$$;
reset role;

do $$
begin
  if has_function_privilege('anon','public.servsync_get_marketing_creation_context(uuid)','execute')
     or has_function_privilege('public','public.servsync_get_marketing_usage_summary(uuid)','execute')
     or not has_function_privilege('authenticated','public.servsync_get_marketing_creation_context(uuid)','execute')
     or not has_function_privilege('authenticated','public.servsync_get_marketing_usage_summary(uuid)','execute') then
    raise exception 'FB-037I function grant boundary mismatch.';
  end if;
  if (select provolatile from pg_proc where oid='public.servsync_reserve_marketing_content_creation(uuid,uuid,text,uuid,uuid,text,text,text)'::regprocedure)<>'v'
     or (select provolatile from pg_proc where oid='public.servsync_get_marketing_creation_context(uuid)'::regprocedure)<>'s' then
    raise exception 'FB-037I function volatility mismatch.';
  end if;
  if (select provider_submissions_enabled from public.marketing_publishing_controls where singleton) then
    raise exception 'FB-037I changed the public-post gate.';
  end if;
end;
$$;
