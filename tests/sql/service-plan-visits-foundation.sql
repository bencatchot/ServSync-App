create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
create table public.contractor_profiles(id uuid primary key, owner_user_id uuid references auth.users(id));
create table public.contractor_team_members(contractor_id uuid, user_id uuid, status text, role text);
create table public.homes(id uuid primary key, homeowner_user_id uuid references auth.users(id));
create table public.homeowner_contractor_connections(id uuid primary key, contractor_id uuid, homeowner_user_id uuid, status text);
create table public.connection_shared_properties(connection_id uuid, home_id uuid);
create table public.inspections(id uuid primary key, contractor_id uuid, homeowner_user_id uuid, home_id uuid,
  name text, job_origin text, status text default 'draft', job_status text default 'draft');
create function public.current_user_is_platform_admin() returns boolean language sql stable as $$ select false $$;
create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create schema test;
create function test.id(n integer) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function test.assert(ok boolean, label text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label;
end $$;
create function test.denied(statement text, reason text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then
    if position(reason in sqlerrm) > 0 then return; end if;
    raise exception 'Unexpected error: %', sqlerrm;
  end;
  raise exception 'Expected denial: %', statement;
end $$;
grant usage on schema test to authenticated, anon;
grant execute on all functions in schema test to authenticated, anon;
insert into auth.users select test.id(n) from generate_series(1,6) n;
insert into public.contractor_profiles values(test.id(101),test.id(2)),(test.id(201),test.id(5));
insert into public.contractor_team_members values(test.id(101),test.id(3),'active','field_tech'),(test.id(101),test.id(4),'active','office');
insert into public.homes values(test.id(1001),test.id(1)),(test.id(1002),test.id(1)),(test.id(1003),test.id(6));
insert into public.homeowner_contractor_connections values(test.id(301),test.id(101),test.id(1),'active'),(test.id(302),test.id(201),test.id(6),'active');
insert into public.connection_shared_properties values(test.id(301),test.id(1001)),(test.id(302),test.id(1003));
insert into public.inspections(id, contractor_id, homeowner_user_id, home_id, name, job_origin) values
  (test.id(20001),test.id(101),test.id(1),test.id(1001),'Plan visit Job',null),
  (test.id(20002),test.id(101),test.id(1),test.id(1002),'Other property',null),
  (test.id(20003),test.id(201),test.id(6),test.id(1003),'Foreign Job',null),
  (test.id(20004),test.id(101),test.id(1),test.id(1001),'Private Draft','draft_composer'),
  (test.id(20005),test.id(101),test.id(1),test.id(1001),'Replacement Job',null);

create table public.test_entitlement(allowed boolean);
insert into public.test_entitlement values(true);
create function public.current_user_has_contractor_entitlement(uuid, text) returns boolean language sql security definer set search_path='' stable as $$ select allowed from public.test_entitlement $$;
