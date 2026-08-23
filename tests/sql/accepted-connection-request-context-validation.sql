insert into public.profiles(id, role) values
  ('10000000-0000-0000-0000-000000000001', 'contractor'),
  ('10000000-0000-0000-0000-000000000002', 'contractor'),
  ('30000000-0000-0000-0000-000000000001', 'homeowner');
insert into public.contractor_profiles(id, owner_user_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
insert into public.homeowner_profiles(user_id, display_name, phone, city, state, zip_code)
values ('30000000-0000-0000-0000-000000000001', 'Fixture homeowner', '5555550100', 'Mobile', 'AL', '36602');

insert into public.homeowner_contractor_connections(id, homeowner_user_id, contractor_id, status, created_at, updated_at) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'pending', '2026-08-22T14:30:00Z', '2026-08-22T14:30:00Z'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active', '2026-08-21T14:30:00Z', '2026-08-21T14:30:00Z'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active', '2026-08-20T14:30:00Z', '2026-08-20T14:30:00Z');
insert into public.connection_permissions(connection_id, share_contact) values
  ('40000000-0000-0000-0000-000000000001', true),
  ('40000000-0000-0000-0000-000000000002', true),
  ('40000000-0000-0000-0000-000000000003', true);
insert into public.connection_request_contexts(connection_id, message, created_at, updated_at) values
  ('40000000-0000-0000-0000-000000000001', E'  Replace valve\nPlease estimate unchanged.  ', '2026-08-22T14:30:00Z', '2026-08-22T14:30:00Z'),
  ('40000000-0000-0000-0000-000000000002', '', '2026-08-21T14:30:00Z', '2026-08-21T14:30:00Z');

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

do $$
declare
  v_pending record;
  v_before jsonb;
  v_after jsonb;
  v_active record;
begin
  select * into strict v_pending
    from public.servsync_contractor_pending_connection_requests()
   where connection_id = '40000000-0000-0000-0000-000000000001';
  if v_pending.request_context->>'message' is distinct from E'  Replace valve\nPlease estimate unchanged.  ' then
    raise exception 'Pending request did not expose the exact stored message.';
  end if;

  select to_jsonb(ctx) into v_before
    from public.connection_request_contexts ctx
   where connection_id = '40000000-0000-0000-0000-000000000001';

  perform public.servsync_respond_to_connection_request(
    '40000000-0000-0000-0000-000000000001',
    'active'
  );

  select to_jsonb(ctx) into v_after
    from public.connection_request_contexts ctx
   where connection_id = '40000000-0000-0000-0000-000000000001';
  if v_after is distinct from v_before then
    raise exception 'Acceptance deleted or altered stored request context.';
  end if;

  if exists (
    select 1 from public.servsync_contractor_pending_connection_requests()
     where connection_id = '40000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Accepted request remained in the pending reader.';
  end if;

  select * into strict v_active
    from public.servsync_contractor_connected_homeowners()
   where connection_id = '40000000-0000-0000-0000-000000000001';
  if v_active.request_context->>'message' is distinct from E'  Replace valve\nPlease estimate unchanged.  '
     or (v_active.request_context->>'created_at')::timestamptz is distinct from '2026-08-22T14:30:00Z'::timestamptz then
    raise exception 'Active reader did not expose the exact message and submitted timestamp.';
  end if;

  if (select request_context->>'message' from public.servsync_contractor_connected_homeowners()
       where connection_id = '40000000-0000-0000-0000-000000000002') is distinct from '' then
    raise exception 'No-message connection context was not preserved.';
  end if;
  if (select request_context from public.servsync_contractor_connected_homeowners()
       where connection_id = '40000000-0000-0000-0000-000000000003') is not null then
    raise exception 'Legacy connection without context did not remain null-safe.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', false);
do $$
begin
  if exists (
    select 1 from public.servsync_contractor_connected_homeowners()
     where connection_id = '40000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Unrelated contractor could read accepted request context.';
  end if;
end;
$$;

reset role;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.servsync_contractor_connected_homeowners()'::regprocedure)
    into v_definition;
  if v_definition not like '%SECURITY DEFINER%'
     or v_definition not like '%SET search_path TO %public%'
     or v_definition not like '%current_user_can_access_contractor%'
     or v_definition not like '%c.status = ''active''%'
     or v_definition not like '%connection_request_contexts%' then
    raise exception 'Active reader security/visibility definition is incomplete.';
  end if;
  if has_function_privilege('anon', 'public.servsync_contractor_connected_homeowners()', 'EXECUTE') then
    raise exception 'Anonymous role unexpectedly has execute privilege.';
  end if;
  if not has_function_privilege('authenticated', 'public.servsync_contractor_connected_homeowners()', 'EXECUTE') then
    raise exception 'Authenticated role is missing execute privilege.';
  end if;
end;
$$;
