\set ON_ERROR_STOP on

insert into public.profiles (id, role, full_name) values
  ('10000000-0000-4000-8000-000000000001', 'platform_admin', 'Platform Admin'),
  ('10000000-0000-4000-8000-000000000002', 'contractor', 'Owner A'),
  ('10000000-0000-4000-8000-000000000003', 'contractor', 'Owner B'),
  ('10000000-0000-4000-8000-000000000004', 'contractor', 'Admin A'),
  ('10000000-0000-4000-8000-000000000005', 'contractor', 'Office A'),
  ('10000000-0000-4000-8000-000000000006', 'contractor', 'Field A'),
  ('10000000-0000-4000-8000-000000000007', 'contractor', 'Viewer A');

insert into public.contractor_profiles (id, owner_user_id, business_name, account_status) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Contractor A', 'active'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'Contractor B', 'active');

insert into public.contractor_team_members (contractor_id, user_id, role, status) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'admin', 'active'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'office', 'active'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'field_tech', 'active'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007', 'viewer', 'active');

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$
declare v_access jsonb;
begin
  v_access := public.servsync_get_marketing_workspace_access(null);
  if v_access ->> 'workspace_key' <> 'servsync_internal'
     or v_access ->> 'marketing_role' <> 'platform_admin' then
    raise exception 'Platform admin internal workspace access mismatch.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select public.servsync_ensure_contractor_marketing_workspace('20000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', false);
select public.servsync_ensure_contractor_marketing_workspace('20000000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$ begin
  begin
    perform public.servsync_get_marketing_workspace_access('20000000-0000-4000-8000-000000000001');
    raise exception 'Platform admin unexpectedly received contractor Marketing access.';
  exception when sqlstate '42501' then null; end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', false);
do $$
declare v_access jsonb;
begin
  v_access := public.servsync_get_marketing_workspace_access('20000000-0000-4000-8000-000000000001');
  if v_access ->> 'marketing_role' <> 'admin' then raise exception 'Admin Marketing role mismatch.'; end if;
end;
$$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', false);
do $$
declare v_access jsonb;
begin
  v_access := public.servsync_get_marketing_workspace_access('20000000-0000-4000-8000-000000000001');
  if v_access ->> 'marketing_role' <> 'office' then raise exception 'Office Marketing role mismatch.'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', false);
do $$ begin
  begin
    perform public.servsync_get_marketing_workspace_access('20000000-0000-4000-8000-000000000001');
    raise exception 'Field technician unexpectedly received Marketing access.';
  exception when sqlstate '42501' then null; end;
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', false);
do $$ begin
  begin
    perform public.servsync_get_marketing_workspace_access('20000000-0000-4000-8000-000000000001');
    raise exception 'Viewer unexpectedly received Marketing access.';
  exception when sqlstate '42501' then null; end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select public.servsync_create_marketing_content(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Contractor A content', 'social_post', 'Only Contractor A may manage this.', 'social'
);
do $$
begin
  if (select count(*) from public.servsync_list_marketing_content(
    '20000000-0000-4000-8000-000000000001', 'all'
  )) <> 1 then raise exception 'Contractor A content list mismatch.'; end if;
  begin
    perform public.servsync_list_marketing_content('20000000-0000-4000-8000-000000000002', 'all');
    raise exception 'Contractor A unexpectedly listed Contractor B Marketing content.';
  exception when sqlstate '42501' then null; end;
  begin
    perform 1 from public.marketing_content_items;
    raise exception 'Authenticated direct Marketing table read unexpectedly succeeded.';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', false);
select public.servsync_create_marketing_content(
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  'Contractor B content', 'social_post', 'Only Contractor B may manage this.', 'social'
);
do $$
declare v_a_content uuid;
begin
  select content_id into v_a_content from public.servsync_list_marketing_content(
    '20000000-0000-4000-8000-000000000002', 'all'
  ) where title = 'Contractor B content';
  begin
    perform public.servsync_update_marketing_content(
      '20000000-0000-4000-8000-000000000001', v_a_content, 1,
      'Cross tenant edit', 'social_post', 'Denied.', 'social'
    );
    raise exception 'Contractor B unexpectedly updated Contractor A context.';
  exception when sqlstate '42501' then null; end;
end;
$$;
reset role;

do $$
declare
  v_workspace_a uuid;
  v_workspace_b uuid;
  v_content_a uuid;
  v_connection_b uuid;
begin
  select id into v_workspace_a from public.marketing_workspaces
   where contractor_id = '20000000-0000-4000-8000-000000000001';
  select id into v_workspace_b from public.marketing_workspaces
   where contractor_id = '20000000-0000-4000-8000-000000000002';
  select id into v_content_a from public.marketing_content_items
   where workspace_id = v_workspace_a;
  insert into public.marketing_provider_connections (
    workspace_id, provider, priority, capabilities, readiness_note
  ) values (
    v_workspace_b, 'facebook', 1, '{"text":true,"media":false}', 'Setup remains required.'
  ) returning id into v_connection_b;

  begin
    insert into public.marketing_publications (
      workspace_id, content_id, content_revision, content_snapshot,
      provider_connection_id, provider, provider_destination_key,
      provider_destination_label, publication_mode, scheduled_at,
      client_request_id
    ) values (
      v_workspace_a, v_content_a, 1,
      '{"title":"Contractor A","body":"Denied cross-workspace provider.","content_type":"social_post","content_revision":1}',
      v_connection_b, 'facebook', 'fixture-page', 'Fixture Page',
      'publish_now', now(), '30000000-0000-4000-8000-000000000003'
    );
    raise exception 'Cross-workspace provider connection unexpectedly satisfied publication lineage.';
  exception when sqlstate '55000' then null; end;
end;
$$;

do $$
declare v_missing integer;
begin
  if (select count(*) from public.marketing_workspaces where workspace_kind = 'internal') <> 1
     or (select count(*) from public.marketing_workspaces where workspace_kind = 'contractor') <> 2 then
    raise exception 'Marketing workspace cardinality mismatch.';
  end if;
  if exists (
    select 1 from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relkind = 'r'
      and relation.relname like 'marketing_%'
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ) then raise exception 'A Marketing table does not have forced RLS.'; end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'marketing_%'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then raise exception 'A Marketing table has an unexpected direct grant.'; end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.marketing_publications'::regclass
      and conname = 'marketing_publications_workspace_connection'
      and contype = 'f'
      and convalidated
  ) then raise exception 'Validated publication/provider workspace constraint is missing.'; end if;

  select count(*) into v_missing
  from (values
    ('servsync_get_marketing_workspace_access', 's'),
    ('servsync_ensure_contractor_marketing_workspace', 'v'),
    ('servsync_list_marketing_content', 's'),
    ('servsync_create_marketing_content', 'v'),
    ('servsync_update_marketing_content', 'v'),
    ('servsync_transition_marketing_content', 'v')
  ) expected(name, volatility)
  where not exists (
    select 1 from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    join pg_roles owner on owner.oid = function.proowner
    where namespace.nspname = 'public'
      and function.proname = expected.name
      and function.prosecdef
      and function.provolatile::text = expected.volatility
      and owner.rolname = 'postgres'
      and function.proconfig @> array['search_path=pg_catalog, public, auth']
  );
  if v_missing <> 0 then raise exception 'Shared Marketing function security metadata mismatch.'; end if;

  if has_function_privilege('anon', 'public.servsync_private_require_marketing_workspace(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.servsync_private_require_marketing_workspace(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.servsync_get_marketing_workspace_access(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.servsync_get_marketing_workspace_access(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.servsync_get_marketing_workspace_access(uuid)', 'EXECUTE') then
    raise exception 'Shared Marketing function grants mismatch.';
  end if;
end;
$$;

select 'shared Marketing workspace security foundation validation passed' as result;
