\set ON_ERROR_STOP on

insert into public.profiles (id, role, full_name) values
  ('61000000-0000-4000-8000-000000000001', 'platform_admin', 'Publishing Owner'),
  ('61000000-0000-4000-8000-000000000002', 'contractor', 'Publishing Contractor'),
  ('61000000-0000-4000-8000-000000000003', 'homeowner', 'Publishing Homeowner');

insert into public.contractor_profiles (id) values ('61000000-0000-4000-8000-000000000004');
insert into public.marketing_workspaces (id, workspace_key, workspace_kind, contractor_id, display_name) values
  ('61000000-0000-4000-8000-000000000005', 'publishing_contract_test', 'contractor', '61000000-0000-4000-8000-000000000004', 'Publishing Contract Test');

do $$
declare v_function regprocedure;
begin
  if (select count(*) from public.marketing_provider_connections) <> 3
     or exists (select 1 from public.marketing_provider_connections where connection_status <> 'setup_required')
     or exists (select 1 from public.marketing_publications)
     or exists (select 1 from public.marketing_publication_events) then
    raise exception 'Publishing migration seeded false connection or publication state.';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname in ('marketing_provider_connections','marketing_publications','marketing_publication_events')
       and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then raise exception 'Publishing forced-RLS mismatch.'; end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema='public' and table_name in ('marketing_provider_connections','marketing_publications','marketing_publication_events')
       and grantee in ('PUBLIC','anon','authenticated','service_role')
  ) then raise exception 'Publishing direct table privilege mismatch.'; end if;
  foreach v_function in array array[
    'public.servsync_get_internal_marketing_publishing()'::regprocedure,
    'public.servsync_create_internal_marketing_publication(uuid,uuid,bigint,text,uuid,text,timestamptz)'::regprocedure,
    'public.servsync_cancel_internal_marketing_publication(uuid)'::regprocedure,
    'public.servsync_retry_internal_marketing_publication(uuid)'::regprocedure
  ] loop
    if not has_function_privilege('authenticated', v_function, 'execute')
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'Owner publication RPC grant mismatch for %.', v_function;
    end if;
  end loop;
  foreach v_function in array array[
    'public.servsync_claim_due_marketing_publications(integer)'::regprocedure,
    'public.servsync_mark_marketing_provider_request_started(uuid,integer)'::regprocedure,
    'public.servsync_complete_marketing_publication(uuid,integer,text,jsonb)'::regprocedure,
    'public.servsync_fail_marketing_publication(uuid,integer,text,text,boolean)'::regprocedure
  ] loop
    if not has_function_privilege('service_role', v_function, 'execute')
       or has_function_privilege('authenticated', v_function, 'execute')
       or has_function_privilege('anon', v_function, 'execute') then
      raise exception 'Worker publication RPC grant mismatch for %.', v_function;
    end if;
  end loop;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '61000000-0000-4000-8000-000000000002';
do $$ begin
  begin perform public.servsync_get_internal_marketing_publishing(); raise exception 'Contractor publishing read unexpectedly succeeded.'; exception when insufficient_privilege then null; end;
  begin perform public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000010','61000000-0000-4000-8000-000000000011',1,'facebook','00000000-0000-4000-8000-000000000061','publish_now',null); raise exception 'Contractor publication unexpectedly succeeded.'; exception when insufficient_privilege then null; end;
end $$;
reset role;

insert into public.marketing_content_items (
  id, workspace_id, client_request_id, title, content_type, body, channel_category,
  status, revision_number, created_by
) values
  ('61000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000037','61000000-0000-4000-8000-000000000012','Draft social','social_post','Draft copy.','social','draft',2,'61000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000037','61000000-0000-4000-8000-000000000014','Approved social','social_post','Exact approved copy.','social','approved',7,'61000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000037','61000000-0000-4000-8000-000000000016','Local path','social_post','Watch file:///Users/owner/video.mp4','social','approved',4,'61000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000017','00000000-0000-4000-8000-000000000037','61000000-0000-4000-8000-000000000018','Pending social','social_post','Pending copy.','social','needs_approval',3,'61000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000019','00000000-0000-4000-8000-000000000037','61000000-0000-4000-8000-000000000030','Rejected social','social_post','Rejected copy.','social','rejected',5,'61000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000031','61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000032','Other workspace','social_post','Other workspace copy.','social','approved',2,'61000000-0000-4000-8000-000000000001');

update public.marketing_provider_connections set connection_status='connected', destination_key='page_fixture', destination_label='ServSync Test Page', connected_at=now(), updated_at=now()
 where provider='facebook';

set role authenticated;
set request.jwt.claim.sub = '61000000-0000-4000-8000-000000000001';
do $$
declare v_receipt jsonb; v_replay jsonb; v_id uuid; v_schedule timestamptz := now() + interval '1 hour';
begin
  begin perform public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000020','61000000-0000-4000-8000-000000000011',2,'facebook','00000000-0000-4000-8000-000000000061','publish_now',null); raise exception 'Draft publication unexpectedly succeeded.'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000033','61000000-0000-4000-8000-000000000017',3,'facebook','00000000-0000-4000-8000-000000000061','publish_now',null); raise exception 'Needs-approval publication unexpectedly succeeded.'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000034','61000000-0000-4000-8000-000000000019',5,'facebook','00000000-0000-4000-8000-000000000061','publish_now',null); raise exception 'Rejected publication unexpectedly succeeded.'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000035','61000000-0000-4000-8000-000000000031',2,'facebook','00000000-0000-4000-8000-000000000061','publish_now',null); raise exception 'Cross-workspace publication unexpectedly succeeded.'; exception when no_data_found then null; end;
  begin perform public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000021','61000000-0000-4000-8000-000000000013',6,'facebook','00000000-0000-4000-8000-000000000061','publish_now',null); raise exception 'Stale approved revision unexpectedly succeeded.'; exception when serialization_failure then null; end;
  begin perform public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000022','61000000-0000-4000-8000-000000000015',4,'facebook','00000000-0000-4000-8000-000000000061','publish_now',null); raise exception 'Local path unexpectedly persisted.'; exception when invalid_parameter_value then null; end;
  begin perform public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000023','61000000-0000-4000-8000-000000000013',7,'instagram','00000000-0000-4000-8000-000000000062','publish_now',null); raise exception 'Unavailable Instagram publication unexpectedly succeeded.'; exception when object_not_in_prerequisite_state then null; end;

  v_receipt := public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000024','61000000-0000-4000-8000-000000000013',7,'facebook','00000000-0000-4000-8000-000000000061','scheduled',v_schedule);
  v_replay := public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000024','61000000-0000-4000-8000-000000000013',7,'facebook','00000000-0000-4000-8000-000000000061','scheduled',v_schedule);
  if (v_receipt->>'replayed')::boolean or not (v_replay->>'replayed')::boolean then raise exception 'Publication replay mismatch.'; end if;
  v_id := (v_receipt->>'publication_id')::uuid;
  perform public.servsync_cancel_internal_marketing_publication(v_id);
  begin perform public.servsync_cancel_internal_marketing_publication(v_id); raise exception 'Terminal cancellation repeated.'; exception when object_not_in_prerequisite_state then null; end;

  v_receipt := public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000025','61000000-0000-4000-8000-000000000013',7,'facebook','00000000-0000-4000-8000-000000000061','publish_now',null);
end;
$$;
reset role;

set role service_role;
do $$
declare v_claims jsonb; v_id uuid; v_attempt integer;
begin
  v_claims := public.servsync_claim_due_marketing_publications(5);
  if jsonb_array_length(v_claims) <> 1 then raise exception 'Worker claim count mismatch: %', v_claims; end if;
  v_id := (v_claims->0->>'publication_id')::uuid; v_attempt := (v_claims->0->>'attempt_number')::integer;
  if jsonb_array_length(public.servsync_claim_due_marketing_publications(5)) <> 0 then raise exception 'Duplicate worker delivery claimed a publishing row.'; end if;
  perform public.servsync_mark_marketing_provider_request_started(v_id, v_attempt);
  perform public.servsync_complete_marketing_publication(v_id, v_attempt, 'page_fixture_post_1', '{"verified":true}'::jsonb);
  begin perform public.servsync_complete_marketing_publication(v_id, v_attempt, 'duplicate', '{}'::jsonb); raise exception 'Published terminal completion repeated.'; exception when serialization_failure then null; end;
end;
$$;
reset role;

-- A separate due publication exercises bounded safe retry before a provider request starts.
set role authenticated;
set request.jwt.claim.sub = '61000000-0000-4000-8000-000000000001';
select public.servsync_create_internal_marketing_publication('61000000-0000-4000-8000-000000000026','61000000-0000-4000-8000-000000000013',7,'facebook','00000000-0000-4000-8000-000000000061','publish_now',null);
reset role;
set role service_role;
do $$
declare v_claim jsonb; v_id uuid; v_attempt integer;
begin
  v_claim := public.servsync_claim_due_marketing_publications(1)->0;
  v_id := (v_claim->>'publication_id')::uuid; v_attempt := (v_claim->>'attempt_number')::integer;
  perform public.servsync_fail_marketing_publication(v_id,v_attempt,'temporary_provider','Provider temporarily unavailable.',true);
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '61000000-0000-4000-8000-000000000001';
do $$ declare v_id uuid; v_state jsonb; begin
  v_state := public.servsync_get_internal_marketing_publishing();
  select (item->>'publication_id')::uuid into v_id from jsonb_array_elements(v_state->'publications') item where item->>'status'='failed' limit 1;
  perform public.servsync_retry_internal_marketing_publication(v_id);
  v_state := public.servsync_get_internal_marketing_publishing();
  if not exists (select 1 from jsonb_array_elements(v_state->'publications') item where (item->>'publication_id')::uuid=v_id and item->>'status'='scheduled') then raise exception 'Eligible retry did not reschedule.'; end if;
end $$;
reset role;

-- Attempts two and three prove that safe retries stop at the configured bound.
set role service_role;
do $$ declare v_claim jsonb; begin
  v_claim := public.servsync_claim_due_marketing_publications(1)->0;
  perform public.servsync_fail_marketing_publication((v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer,'temporary_provider','Provider temporarily unavailable.',true);
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '61000000-0000-4000-8000-000000000001';
do $$ declare v_id uuid; v_state jsonb; begin
  v_state := public.servsync_get_internal_marketing_publishing();
  select (item->>'publication_id')::uuid into v_id from jsonb_array_elements(v_state->'publications') item where item->>'status'='failed' limit 1;
  perform public.servsync_retry_internal_marketing_publication(v_id);
end $$;
reset role;
set role service_role;
do $$ declare v_claim jsonb; begin
  v_claim := public.servsync_claim_due_marketing_publications(1)->0;
  perform public.servsync_fail_marketing_publication((v_claim->>'publication_id')::uuid,(v_claim->>'attempt_number')::integer,'temporary_provider','Provider temporarily unavailable.',true);
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '61000000-0000-4000-8000-000000000001';
do $$ declare v_id uuid; v_state jsonb; begin
  v_state := public.servsync_get_internal_marketing_publishing();
  select (item->>'publication_id')::uuid into v_id from jsonb_array_elements(v_state->'publications') item where item->>'status'='failed' limit 1;
  begin perform public.servsync_retry_internal_marketing_publication(v_id); raise exception 'Retry beyond the third attempt unexpectedly succeeded.'; exception when object_not_in_prerequisite_state then null; end;
end $$;
reset role;

do $$
declare v_published uuid; v_snapshot_blocked boolean := false; v_history_blocked boolean := false;
begin
  if exists (select 1 from public.marketing_publications where content_revision <> 7 or content_snapshot->>'body' <> 'Exact approved copy.') then raise exception 'Approved snapshot mismatch.'; end if;
  select id into v_published from public.marketing_publications where status='published';
  begin update public.marketing_publications set content_snapshot='{"title":"Changed"}'::jsonb where id=v_published; exception when raise_exception then v_snapshot_blocked := true; end;
  if not v_snapshot_blocked then raise exception 'Published snapshot mutation unexpectedly succeeded.'; end if;
  begin delete from public.marketing_publication_events where publication_id=v_published; exception when raise_exception then v_history_blocked := true; end;
  if not v_history_blocked then raise exception 'Publication history deletion unexpectedly succeeded.'; end if;
  if (select count(*) from public.marketing_publications) <> 3
     or (select count(*) from public.marketing_publications where status='published') <> 1
     or (select count(*) from public.marketing_publications where status='cancelled') <> 1
     or (select count(*) from public.marketing_publications where status='failed' and attempt_count=3 and not retry_eligible) <> 1 then
    raise exception 'Final publication state mismatch.';
  end if;
end;
$$;
