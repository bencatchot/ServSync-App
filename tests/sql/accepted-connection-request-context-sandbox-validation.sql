-- Sandbox-only authenticated lifecycle validation for accepted request context.
-- Every fictional fixture is isolated by fixed UUID and rolled back together.

begin;

insert into auth.users(id, email, raw_user_meta_data) values
  (
    '10000000-0000-0000-0000-000000000001',
    'context-contractor-one@example.invalid',
    '{"role":"contractor","full_name":"Fixture contractor one"}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'context-contractor-two@example.invalid',
    '{"role":"contractor","full_name":"Fixture contractor two"}'::jsonb
  ),
  (
    '30000000-0000-0000-0000-000000000001',
    'context-homeowner@example.invalid',
    '{"role":"homeowner","full_name":"Fixture homeowner"}'::jsonb
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    'context-homeowner-empty@example.invalid',
    '{"role":"homeowner","full_name":"Fixture homeowner empty"}'::jsonb
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    'context-homeowner-legacy@example.invalid',
    '{"role":"homeowner","full_name":"Fixture homeowner legacy"}'::jsonb
  );
insert into public.contractor_profiles(id, owner_user_id, slug) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'context-fixture-contractor-one'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'context-fixture-contractor-two');
insert into public.homeowner_profiles(user_id, display_name, phone, city, state, zip_code) values
  ('30000000-0000-0000-0000-000000000001', 'Fixture homeowner', '5555550100', 'Mobile', 'AL', '36602'),
  ('30000000-0000-0000-0000-000000000002', 'Fixture homeowner empty', '5555550101', 'Mobile', 'AL', '36602'),
  ('30000000-0000-0000-0000-000000000003', 'Fixture homeowner legacy', '5555550102', 'Mobile', 'AL', '36602');

insert into public.homeowner_contractor_connections(id, homeowner_user_id, contractor_id, status, created_at, updated_at) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'pending', '2026-08-22T14:30:00Z', '2026-08-22T14:30:00Z'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'active', '2026-08-21T14:30:00Z', '2026-08-21T14:30:00Z'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'active', '2026-08-20T14:30:00Z', '2026-08-20T14:30:00Z');
insert into public.connection_permissions(connection_id, share_contact) values
  ('40000000-0000-0000-0000-000000000001', true),
  ('40000000-0000-0000-0000-000000000002', true),
  ('40000000-0000-0000-0000-000000000003', true);
insert into public.connection_request_contexts(connection_id, message, created_at, updated_at) values
  ('40000000-0000-0000-0000-000000000001', E'  Fictional valve replacement\nPreserve this estimate note exactly.  ', '2026-08-22T14:30:00Z', '2026-08-22T14:30:00Z'),
  ('40000000-0000-0000-0000-000000000002', '', '2026-08-21T14:30:00Z', '2026-08-21T14:30:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_pending record;
begin
  select * into strict v_pending
    from public.servsync_contractor_pending_connection_requests()
   where connection_id = '40000000-0000-0000-0000-000000000001';
  if v_pending.request_context->>'message' is distinct from E'  Fictional valve replacement\nPreserve this estimate note exactly.  '
     or (v_pending.request_context->>'created_at')::timestamptz is distinct from '2026-08-22T14:30:00Z'::timestamptz then
    raise exception 'Pending reader did not expose the exact fictional message and timestamp.';
  end if;

  perform public.servsync_respond_to_connection_request(
    '40000000-0000-0000-0000-000000000001',
    'active'
  );

  if exists (
    select 1 from public.servsync_contractor_pending_connection_requests()
     where connection_id = '40000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Accepted request remained in the pending reader.';
  end if;
end;
$$;

reset role;

do $$
begin
  if (select count(*) from public.connection_request_contexts
       where connection_id = '40000000-0000-0000-0000-000000000001') <> 1
     or (select message from public.connection_request_contexts
          where connection_id = '40000000-0000-0000-0000-000000000001')
        is distinct from E'  Fictional valve replacement\nPreserve this estimate note exactly.  '
     or (select created_at from public.connection_request_contexts
          where connection_id = '40000000-0000-0000-0000-000000000001')
        is distinct from '2026-08-22T14:30:00Z'::timestamptz
     or (select updated_at from public.connection_request_contexts
          where connection_id = '40000000-0000-0000-0000-000000000001')
        is distinct from '2026-08-22T14:30:00Z'::timestamptz then
    raise exception 'Acceptance deleted or altered the fictional stored context.';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_active record;
begin
  select * into strict v_active
    from public.servsync_contractor_connected_homeowners()
   where connection_id = '40000000-0000-0000-0000-000000000001';
  if v_active.request_context->>'message' is distinct from E'  Fictional valve replacement\nPreserve this estimate note exactly.  '
     or (v_active.request_context->>'created_at')::timestamptz is distinct from '2026-08-22T14:30:00Z'::timestamptz then
    raise exception 'Active reader did not expose the exact fictional message and timestamp.';
  end if;

  if (select request_context->>'message' from public.servsync_contractor_connected_homeowners()
       where connection_id = '40000000-0000-0000-0000-000000000002') is distinct from '' then
    raise exception 'No-message context was not preserved.';
  end if;
  if (select request_context from public.servsync_contractor_connected_homeowners()
       where connection_id = '40000000-0000-0000-0000-000000000003') is not null then
    raise exception 'Legacy connection without context was not null-safe.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$
begin
  if exists (
    select 1 from public.servsync_contractor_connected_homeowners()
     where connection_id = '40000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Unrelated contractor could read the fictional accepted context.';
  end if;
end;
$$;

reset role;
rollback;
