-- Rollback-only authenticated behavior validation for the verified Sandbox.
-- All rows and catalog helpers created here are transaction-local and removed
-- by the final rollback.

begin;

do $sandbox$
declare
  v_contractor_id uuid;
  v_contractor_owner_id uuid;
  v_home_id uuid;
  v_homeowner_id uuid;
  v_connection_id uuid := gen_random_uuid();
  v_contact_id uuid := gen_random_uuid();
  v_local_home_id uuid := gen_random_uuid();
  v_asset_id uuid;
  v_result jsonb;
  v_team_users uuid[];
  v_count integer;
begin
  select contractor.id, contractor.owner_user_id
    into v_contractor_id, v_contractor_owner_id
    from public.contractor_profiles contractor
   where contractor.account_status = 'active'
     and exists (select 1 from auth.users actor where actor.id = contractor.owner_user_id)
   order by contractor.created_at
   limit 1;
  if v_contractor_id is null then raise exception 'Sandbox lacks an active contractor fixture for rollback-only validation.'; end if;

  select home.id, home.homeowner_user_id
    into v_home_id, v_homeowner_id
    from public.homes home
   where exists (select 1 from auth.users actor where actor.id = home.homeowner_user_id)
     and not exists (
       select 1 from public.homeowner_contractor_connections connection
        where connection.homeowner_user_id = home.homeowner_user_id
          and connection.contractor_id = v_contractor_id
     )
   order by home.created_at
   limit 1;
  if v_home_id is null then raise exception 'Sandbox lacks an isolated home/contractor pair for rollback-only validation.'; end if;

  select array_agg(candidate.id order by candidate.id)
    into v_team_users
    from (
      select profile.id
        from public.profiles profile
       where profile.id not in (v_contractor_owner_id, v_homeowner_id)
         and exists (select 1 from auth.users actor where actor.id = profile.id)
         and not exists (
           select 1 from public.contractor_team_members member
            where member.contractor_id = v_contractor_id and member.user_id = profile.id
         )
       order by profile.id
       limit 5
    ) candidate;
  if cardinality(v_team_users) <> 5 then raise exception 'Sandbox lacks five isolated role actors for rollback-only validation.'; end if;

  insert into public.contractor_team_members (contractor_id, user_id, role, status, email, display_name)
  values
    (v_contractor_id, v_team_users[1], 'admin', 'active', '', 'Property Asset test Admin'),
    (v_contractor_id, v_team_users[2], 'office', 'active', '', 'Property Asset test Office'),
    (v_contractor_id, v_team_users[3], 'field_tech', 'active', '', 'Property Asset test Field'),
    (v_contractor_id, v_team_users[4], 'viewer', 'active', '', 'Property Asset test Viewer'),
    (v_contractor_id, v_team_users[5], 'admin', 'disabled', '', 'Property Asset test Disabled');

  insert into public.homeowner_contractor_connections (id, homeowner_user_id, contractor_id, status)
  values (v_connection_id, v_homeowner_id, v_contractor_id, 'active');
  insert into public.connection_shared_properties (connection_id, home_id, share_home_overview)
  values (v_connection_id, v_home_id, true);
  insert into public.contractor_local_contacts (id, contractor_id, display_name)
  values (v_contact_id, v_contractor_id, 'Property Asset rollback-only customer');
  insert into public.contractor_local_homes (id, contractor_id, local_contact_id, nickname)
  values (v_local_home_id, v_contractor_id, v_contact_id, 'Property Asset rollback-only home');

  perform set_config('request.jwt.claim.sub', v_contractor_owner_id::text, true);
  v_result := public.servsync_create_property_asset(
    p_local_home_id => v_local_home_id,
    p_contractor_id => v_contractor_id,
    p_asset_kind => 'hvac',
    p_asset_type => 'Heat pump',
    p_name => 'Rollback-only heat pump',
    p_location_label => 'Exterior',
    p_serial_identifier => 'ROLLBACK-ONLY',
    p_approximate_age_years => 4::smallint,
    p_customer_safe_description => 'Rollback-only customer-safe fixture'
  );
  v_asset_id := (v_result->>'id')::uuid;
  if (v_result->>'revision_number')::bigint <> 1 then raise exception 'Sandbox create revision mismatch.'; end if;

  perform set_config('request.jwt.claim.sub', v_team_users[1]::text, true);
  v_result := public.servsync_update_property_asset(
    p_asset_id => v_asset_id, p_expected_revision => 1,
    p_contractor_id => v_contractor_id, p_asset_kind => 'hvac',
    p_asset_type => 'Heat pump', p_name => 'Rollback-only heat pump Admin update'
  );
  if (v_result->>'revision_number')::bigint <> 2 then raise exception 'Sandbox Admin update failed.'; end if;

  perform set_config('request.jwt.claim.sub', v_team_users[2]::text, true);
  v_result := public.servsync_update_property_asset(
    p_asset_id => v_asset_id, p_expected_revision => 2,
    p_contractor_id => v_contractor_id, p_asset_kind => 'hvac',
    p_asset_type => 'Heat pump', p_name => 'Rollback-only heat pump Office update'
  );
  if (v_result->>'revision_number')::bigint <> 3 then raise exception 'Sandbox Office update failed.'; end if;

  perform set_config('request.jwt.claim.sub', v_team_users[3]::text, true);
  select count(*) into v_count from public.servsync_list_property_assets(null, v_local_home_id, v_contractor_id, false);
  if v_count <> 1 then raise exception 'Sandbox Field Technician read failed.'; end if;
  begin
    perform public.servsync_update_property_asset(
      p_asset_id => v_asset_id, p_expected_revision => 3,
      p_contractor_id => v_contractor_id, p_asset_kind => 'hvac', p_name => 'Denied field update'
    );
    raise exception 'Sandbox Field Technician update unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox Field Technician update unexpectedly succeeded.' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_team_users[4]::text, true);
  begin
    perform 1 from public.servsync_list_property_assets(null, v_local_home_id, v_contractor_id, false);
    raise exception 'Sandbox Viewer local read unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox Viewer local read unexpectedly succeeded.' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_team_users[5]::text, true);
  begin
    perform 1 from public.servsync_list_property_assets(null, v_local_home_id, v_contractor_id, false);
    raise exception 'Sandbox disabled member read unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox disabled member read unexpectedly succeeded.' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_contractor_owner_id::text, true);
  update public.contractor_local_homes set archived_at = now(), archived_by = v_contractor_owner_id where id = v_local_home_id;
  begin
    perform 1 from public.servsync_list_property_assets(null, v_local_home_id, v_contractor_id, true);
    raise exception 'Sandbox archived local property read unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox archived local property read unexpectedly succeeded.' then raise; end if;
  end;
  update public.contractor_local_homes set archived_at = null, archived_by = null where id = v_local_home_id;

  perform set_config('request.jwt.claim.sub', v_homeowner_id::text, true);
  update public.contractor_local_homes set home_id = v_home_id, claimed_at = now() where id = v_local_home_id;
  update public.contractor_local_contacts set homeowner_user_id = v_homeowner_id, claimed_at = now() where id = v_contact_id;
  if not exists (select 1 from public.home_assets where id = v_asset_id and home_id = v_home_id and local_home_id = v_local_home_id and revision_number = 4) then
    raise exception 'Sandbox claim continuity failed.';
  end if;
  select count(*) into v_count from public.servsync_list_property_assets(v_home_id, null, null, false) where id = v_asset_id;
  if v_count <> 1 then raise exception 'Sandbox homeowner claimed-asset read failed.'; end if;

  perform set_config('request.jwt.claim.sub', v_contractor_owner_id::text, true);
  select count(*) into v_count from public.servsync_list_property_assets(v_home_id, null, v_contractor_id, false) where id = v_asset_id;
  if v_count <> 1 then raise exception 'Sandbox connected contractor claimed-asset read failed.'; end if;
  update public.homeowner_contractor_connections set status = 'revoked' where id = v_connection_id;
  begin
    perform 1 from public.servsync_list_property_assets(v_home_id, null, v_contractor_id, false);
    raise exception 'Sandbox disconnected contractor read unexpectedly succeeded.';
  exception when others then
    if sqlerrm = 'Sandbox disconnected contractor read unexpectedly succeeded.' then raise; end if;
  end;

  if (select count(*) from public.home_asset_revisions where asset_id = v_asset_id) <> 4 then
    raise exception 'Sandbox revision/provenance history count mismatch.';
  end if;
  raise notice 'Sandbox rollback-only Property Asset behavior validation passed.';
end;
$sandbox$;

rollback;

select jsonb_build_object(
  'result', 'passed',
  'persistent_test_assets', (select count(*) from public.home_assets where name like 'Rollback-only%'),
  'persistent_test_contacts', (select count(*) from public.contractor_local_contacts where display_name = 'Property Asset rollback-only customer')
);
