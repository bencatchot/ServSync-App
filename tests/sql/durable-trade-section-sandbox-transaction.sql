-- Rollback-only behavior validation for verified ServSync Sandbox.
-- Fictional catalog/runtime rows and capability state are removed at rollback.

begin;

do $sandbox$
declare
  v_draft_id uuid;
  v_contractor_id uuid;
  v_owner_id uuid;
  v_admin_id uuid;
  v_office_id uuid;
  v_field_id uuid;
  v_viewer_id uuid;
  v_other_owner_id uuid;
  v_trade_id uuid := gen_random_uuid();
  v_capability_id uuid := gen_random_uuid();
  v_work_type_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_instance_id uuid;
  v_result jsonb;
  v_revision bigint;
  v_count integer;
begin
  select draft.id, draft.contractor_id, contractor.owner_user_id
    into v_draft_id, v_contractor_id, v_owner_id
    from public.contractor_work_drafts draft
    join public.contractor_profiles contractor on contractor.id = draft.contractor_id
   where draft.status = 'active'
     and draft.home_id is not null
     and contractor.account_status = 'active'
     and exists (select 1 from auth.users actor where actor.id = contractor.owner_user_id)
     and exists (
       select 1 from public.homeowner_contractor_connections connection
       join public.connection_shared_properties shared on shared.connection_id = connection.id
        where connection.contractor_id = draft.contractor_id
          and connection.homeowner_user_id = draft.homeowner_user_id
          and connection.status = 'active'
          and shared.home_id = draft.home_id
          and shared.share_home_overview
     )
     and exists (select 1 from public.contractor_team_members member where member.contractor_id = draft.contractor_id and member.status = 'active' and member.role = 'admin')
     and exists (select 1 from public.contractor_team_members member where member.contractor_id = draft.contractor_id and member.status = 'active' and member.role = 'office')
     and exists (select 1 from public.contractor_team_members member where member.contractor_id = draft.contractor_id and member.status = 'active' and member.role = 'field_tech')
     and exists (select 1 from public.contractor_team_members member where member.contractor_id = draft.contractor_id and member.status = 'active' and member.role = 'viewer')
   order by draft.created_at, draft.id
   limit 1;
  if v_draft_id is null then raise exception 'Sandbox lacks an eligible exact-work role fixture.'; end if;

  select user_id into v_admin_id from public.contractor_team_members where contractor_id = v_contractor_id and status = 'active' and role = 'admin' order by created_at, id limit 1;
  select user_id into v_office_id from public.contractor_team_members where contractor_id = v_contractor_id and status = 'active' and role = 'office' order by created_at, id limit 1;
  select user_id into v_field_id from public.contractor_team_members where contractor_id = v_contractor_id and status = 'active' and role = 'field_tech' order by created_at, id limit 1;
  select user_id into v_viewer_id from public.contractor_team_members where contractor_id = v_contractor_id and status = 'active' and role = 'viewer' order by created_at, id limit 1;
  select owner_user_id into v_other_owner_id from public.contractor_profiles where id <> v_contractor_id and account_status = 'active' order by id limit 1;

  insert into public.trade_pack_trades (id, trade_key, display_name, description)
  values (v_trade_id, 'rollbackfixture', 'Rollback Fixture', 'Transaction-only validation trade.');
  insert into public.trade_pack_capabilities (id, capability_key, display_name, description)
  values (v_capability_id, 'trade.rollbackfixture.workflow.service', 'Rollback Fixture', 'Transaction-only provider-neutral capability.');
  insert into public.trade_pack_work_types (id, work_type_key, trade_id, workflow_family_id, required_capability_id, is_enabled)
  values (v_work_type_id, 'rollbackfixture.service', v_trade_id, 'bf8d5386-8ddc-4cf3-90bf-658948b32a43', v_capability_id, true);
  insert into public.trade_pack_work_type_versions (
    id, work_type_id, version_number, version_status, display_name, description, definition_contract, published_at
  ) values (
    v_version_id, v_work_type_id, 1, 'published', 'Rollback Fixture v1', 'Transaction-only definition.',
    jsonb_build_object(
      'schema_version', 1,
      'section', jsonb_build_object('key','rollback_fixture','label','Rollback Fixture','description',null,'customer_visibility','contractor_private'),
      'readings', jsonb_build_array(jsonb_build_object('key','measurement','label','Measurement','description',null,'value_type','number','unit','units','required',true,'customer_visibility','contractor_private','options',jsonb_build_array())),
      'tests', jsonb_build_array(jsonb_build_object('key','verified','label','Verified','description',null,'value_type','boolean','required',true,'customer_visibility','contractor_private','options',jsonb_build_array())),
      'findings', jsonb_build_array(),
      'recommendations', jsonb_build_array()
    ),
    now()
  );
  insert into public.contractor_trade_pack_capability_grants (contractor_id, capability_id, access_mode, granted_by, reason)
  values (v_contractor_id, v_capability_id, 'active', v_owner_id, 'Rollback-only Durable Trade Section validation');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  v_result := public.servsync_create_trade_section_instance(
    v_draft_id, null, 'rollbackfixture.service', 1, null,
    '{"measurement":0,"verified":false}'::jsonb, 1, gen_random_uuid()
  );
  v_instance_id := (v_result ->> 'id')::uuid;
  if (v_result ->> 'current_revision_number')::bigint <> 1 then raise exception 'Sandbox Owner create failed.'; end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_result := public.servsync_update_trade_section_values(v_instance_id, 1, '{"measurement":1,"verified":true}'::jsonb);
  if (v_result ->> 'current_revision_number')::bigint <> 2 then raise exception 'Sandbox Admin update failed.'; end if;
  v_revision := (v_result ->> 'current_revision_number')::bigint;

  perform set_config('request.jwt.claim.sub', v_office_id::text, true);
  select count(*) into v_count from public.servsync_list_trade_section_revisions(v_instance_id);
  if v_count <> 2 then raise exception 'Sandbox Office history read failed.'; end if;

  perform set_config('request.jwt.claim.sub', v_viewer_id::text, true);
  select count(*) into v_count from public.servsync_list_trade_section_instances(v_draft_id, null) where id = v_instance_id;
  if v_count <> 1 then raise exception 'Sandbox Viewer exact-work read failed.'; end if;
  begin
    perform public.servsync_update_trade_section_values(v_instance_id, 2, '{"measurement":2,"verified":true}'::jsonb);
    raise exception 'Sandbox Viewer mutation unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox Viewer mutation unexpectedly succeeded.' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_field_id::text, true);
  begin
    perform 1 from public.servsync_list_trade_section_instances(v_draft_id, null);
    raise exception 'Sandbox Field Technician read unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox Field Technician read unexpectedly succeeded.' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_other_owner_id::text, true);
  begin
    perform 1 from public.servsync_list_trade_section_instances(v_draft_id, null);
    raise exception 'Sandbox cross-contractor read unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox cross-contractor read unexpectedly succeeded.' then raise; end if;
  end;
  execute 'reset role';

  update public.contractor_trade_pack_capability_grants
     set access_mode = 'completion_only', reason = 'Rollback-only completion test'
   where contractor_id = v_contractor_id and capability_id = v_capability_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  begin
    perform public.servsync_create_trade_section_instance(v_draft_id, null, 'rollbackfixture.service', 1, null, '{"measurement":3,"verified":true}'::jsonb, 2, gen_random_uuid());
    raise exception 'Sandbox completion-only creation unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox completion-only creation unexpectedly succeeded.' then raise; end if;
  end;
  v_result := public.servsync_update_trade_section_values(v_instance_id, v_revision, '{"measurement":4,"verified":true}'::jsonb);
  begin
    perform public.servsync_update_trade_section_values(v_instance_id, v_revision, '{"measurement":5,"verified":true}'::jsonb);
    raise exception 'Sandbox stale update unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox stale update unexpectedly succeeded.' then raise; end if;
  end;
  v_result := public.servsync_set_trade_section_lifecycle(v_instance_id, (v_result ->> 'current_revision_number')::bigint, 'completed');
  if v_result ->> 'lifecycle_status' <> 'completed' then raise exception 'Sandbox completion-only completion failed.'; end if;
  execute 'reset role';

  update public.contractor_trade_pack_capability_grants
     set access_mode = 'revoked', reason = 'Rollback-only revocation test'
   where contractor_id = v_contractor_id and capability_id = v_capability_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  select count(*) into v_count from public.servsync_list_trade_section_instances(v_draft_id, null) where id = v_instance_id;
  if v_count <> 1 then raise exception 'Sandbox revoked history read failed.'; end if;
  execute 'reset role';

  if (select count(*) from public.trade_section_revisions where instance_id = v_instance_id) <> 4 then
    raise exception 'Sandbox revision history count mismatch.';
  end if;
  raise notice 'Sandbox rollback-only Durable Trade Section validation passed.';
end;
$sandbox$;

grant insert, update, delete, truncate on public.trade_section_instances to service_role;
grant insert, update, delete, truncate on public.trade_section_revisions to service_role;
set role service_role;
select set_config('servsync.trade_section_change_kind', 'created', true);
select set_config('servsync.trade_section_source_kind', 'authenticated_rpc', true);
select set_config('servsync.trade_section_revision_write', 'allowed', true);

do $service_role_guard$
begin
  begin
    insert into public.trade_section_instances default values;
    raise exception 'Sandbox forged service_role instance insert unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox forged service_role instance insert unexpectedly succeeded.' then raise; end if;
    if position('controlled mutation boundary' in lower(sqlerrm)) = 0 then raise; end if;
  end;
  begin
    update public.trade_section_instances set updated_at = updated_at;
    raise exception 'Sandbox forged service_role instance update unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox forged service_role instance update unexpectedly succeeded.' then raise; end if;
    if position('controlled mutation boundary' in lower(sqlerrm)) = 0 then raise; end if;
  end;
  begin
    delete from public.trade_section_instances;
    raise exception 'Sandbox forged service_role instance delete unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox forged service_role instance delete unexpectedly succeeded.' then raise; end if;
    if position('controlled mutation boundary' in lower(sqlerrm)) = 0 then raise; end if;
  end;
  begin
    update public.trade_section_revisions set recorded_at = recorded_at;
    raise exception 'Sandbox forged service_role revision update unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox forged service_role revision update unexpectedly succeeded.' then raise; end if;
    if position('append-only and immutable' in lower(sqlerrm)) = 0 then raise; end if;
  end;
  begin
    truncate public.trade_section_revisions, public.trade_section_instances;
    raise exception 'Sandbox forged service_role truncate unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox forged service_role truncate unexpectedly succeeded.' then raise; end if;
    if position('cannot be truncated' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end;
$service_role_guard$;

reset role;
rollback;

select jsonb_build_object(
  'result', 'passed',
  'instances', (select count(*) from public.trade_section_instances),
  'revisions', (select count(*) from public.trade_section_revisions),
  'capability_grants', (select count(*) from public.contractor_trade_pack_capability_grants),
  'enabled_work_types', (select count(*) from public.trade_pack_work_types where is_enabled),
  'no_cooling_disabled', exists(select 1 from public.trade_pack_work_types where work_type_key='hvac.no_cooling_service_call' and not is_enabled)
) final_state;
