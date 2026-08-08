begin;

do $$
declare
  v_contractor_id uuid;
  v_owner_user_id uuid;
  v_other_contractor_id uuid;
  v_disabled_user_id uuid;
  v_member record;
  v_resolution record;
begin
  if (select count(*) from public.contractor_trade_pack_capability_grants) <> 0 then
    raise exception 'Sandbox contains an unexpected Trade Pack capability grant.';
  end if;

  if not exists (
    select 1
      from public.trade_pack_work_types
     where work_type_key = 'hvac.no_cooling_service_call'
       and not is_enabled
  ) then
    raise exception 'Sandbox skeletal No Cooling definition is not disabled.';
  end if;

  select profile.id, profile.owner_user_id
    into v_contractor_id, v_owner_user_id
    from public.contractor_profiles profile
   where exists (
     select 1
       from public.contractor_team_members member
      where member.contractor_id = profile.id
        and member.status = 'active'
        and member.role = 'admin'
   )
     and exists (
       select 1
         from public.contractor_team_members member
        where member.contractor_id = profile.id
          and member.status = 'active'
          and member.role = 'office'
     )
     and exists (
       select 1
         from public.contractor_team_members member
        where member.contractor_id = profile.id
          and member.status = 'active'
          and member.role = 'field_tech'
     )
     and exists (
       select 1
         from public.contractor_team_members member
        where member.contractor_id = profile.id
          and member.status = 'active'
          and member.role = 'viewer'
     )
   limit 1;

  if v_contractor_id is null then
    raise exception 'Sandbox lacks the established complete role fixture for Trade Pack validation.';
  end if;

  select profile.id
    into v_other_contractor_id
    from public.contractor_profiles profile
   where profile.id <> v_contractor_id
   limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  select * into v_resolution
    from public.servsync_resolve_trade_pack_capability(
      v_contractor_id,
      'trade.hvac.workflow.no_cooling'
    );
  if not v_resolution.capability_known
     or v_resolution.access_mode <> 'none'
     or v_resolution.can_create_new
     or v_resolution.can_continue_existing then
    raise exception 'Sandbox Owner default-deny resolution failed.';
  end if;

  begin
    perform * from public.servsync_resolve_trade_pack_capability(
      v_other_contractor_id,
      'trade.hvac.workflow.no_cooling'
    );
    raise exception 'Sandbox cross-tenant resolution was accepted.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform * from public.trade_pack_capabilities;
    raise exception 'Sandbox authenticated direct catalog read was accepted.';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';

  for v_member in
    select member.user_id, member.role
      from public.contractor_team_members member
     where member.contractor_id = v_contractor_id
       and member.status = 'active'
       and member.role in ('admin', 'office', 'field_tech', 'viewer')
  loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', v_member.user_id::text, true);
    select * into v_resolution
      from public.servsync_resolve_trade_pack_capability(
        v_contractor_id,
        'trade.hvac.workflow.no_cooling'
      );
    if not v_resolution.capability_known
       or v_resolution.access_mode <> 'none'
       or v_resolution.can_create_new
       or v_resolution.can_continue_existing then
      raise exception 'Sandbox % default-deny resolution failed.', v_member.role;
    end if;
    execute 'reset role';
  end loop;

  select member.user_id
    into v_disabled_user_id
    from public.contractor_team_members member
   where member.contractor_id = v_contractor_id
     and member.status <> 'active'
   limit 1;

  if v_disabled_user_id is not null then
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', v_disabled_user_id::text, true);
    begin
      perform * from public.servsync_resolve_trade_pack_capability(
        v_contractor_id,
        'trade.hvac.workflow.no_cooling'
      );
      raise exception 'Sandbox disabled member was accepted.';
    exception when insufficient_privilege then
      null;
    end;
    execute 'reset role';
  end if;

  insert into public.contractor_trade_pack_capability_grants (
    contractor_id,
    capability_id,
    access_mode,
    granted_by,
    reason
  ) values (
    v_contractor_id,
    '9188050e-98b5-44ed-96f1-d3e0af66549c',
    'active',
    v_owner_user_id,
    'Rollback-only Sandbox validation'
  );

  update public.trade_pack_work_types
     set is_enabled = true
   where id = 'e419ba51-b545-463b-91a1-e0d0b6710d84';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  if (select count(*) from public.servsync_list_available_trade_pack_work_types(v_contractor_id)) <> 1 then
    raise exception 'Sandbox active capability did not expose the enabled definition exactly once.';
  end if;
  execute 'reset role';

  update public.contractor_trade_pack_capability_grants
     set access_mode = 'completion_only',
         reason = 'Rollback-only Sandbox downgrade validation'
   where contractor_id = v_contractor_id
     and capability_id = '9188050e-98b5-44ed-96f1-d3e0af66549c';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  select * into v_resolution
    from public.servsync_resolve_trade_pack_capability(
      v_contractor_id,
      'trade.hvac.workflow.no_cooling'
    );
  if v_resolution.can_create_new or not v_resolution.can_continue_existing then
    raise exception 'Sandbox completion-only downgrade resolution failed.';
  end if;
  if exists (select 1 from public.servsync_list_available_trade_pack_work_types(v_contractor_id)) then
    raise exception 'Sandbox completion-only grant still exposes new work discovery.';
  end if;
  if (select count(*) from public.servsync_get_trade_pack_work_type_version(
    v_contractor_id,
    'hvac.no_cooling_service_call',
    1
  )) <> 1 then
    raise exception 'Sandbox completion-only grant lost immutable version access.';
  end if;
  execute 'reset role';
end;
$$;

rollback;

do $$
begin
  if (select count(*) from public.contractor_trade_pack_capability_grants) <> 0
     or (select count(*) from public.trade_pack_work_types where is_enabled) <> 0 then
    raise exception 'Sandbox rollback-only validation left capability or enablement residue.';
  end if;
end;
$$;
