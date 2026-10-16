-- DRAFT ONLY. CLI-generated migration retained outside automatic migration discovery.
-- Target: Demo bdytwgejqnlblhrnqxkp. No hosted application is authorized.
-- Operator must independently verify the connection, then acknowledge this exact target.
-- The acknowledgement is a mistake guard, NOT proof of database identity.
begin;
do $$ begin
  if current_setting('servsync.reviewed_demo_target', true) is distinct from 'bdytwgejqnlblhrnqxkp'
    or to_regprocedure('auth.uid()') is null then
    raise exception 'Verified Demo target and explicit review acknowledgement required';
  end if;
end $$;
create role servsync_practice_demo_executor nologin noinherit nobypassrls;
create schema servsync_practice_demo;
revoke all on schema servsync_practice_demo from public, anon, authenticated, service_role;
grant usage on schema servsync_practice_demo to authenticated, servsync_practice_demo_executor;

-- PostgREST verifies the JWT signature/time claims before setting request.jwt.claims.
-- Read that documented transaction-local identity without access to managed auth objects.
-- This is NOT a JWT verifier: direct SQL credentials can set GUCs and are outside this
-- API trust boundary. Never expose a generic SQL/settings RPC or take identity arguments.
create function servsync_practice_demo.request_actor() returns uuid
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare claims jsonb;
begin
  claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  if jsonb_typeof(claims) is distinct from 'object'
    or claims->>'iss' is distinct from 'https://bdytwgejqnlblhrnqxkp.supabase.co/auth/v1'
    or claims->>'role' is distinct from 'authenticated'
    or claims->'is_anonymous' is distinct from 'false'::jsonb
    or jsonb_typeof(claims->'sub') is distinct from 'string' then return null; end if;
  return (claims->>'sub')::uuid;
exception when invalid_text_representation then return null;
end $$;

-- Empty by default. Only a separately approved operator can provision/revoke a pilot.
-- tenant_id is a synthetic namespace, never an FK to resettable Demo/business records.
create table servsync_practice_demo.pilots (
  user_id uuid primary key, tenant_id uuid unique not null,
  enabled boolean not null default false, access_until timestamptz not null
);
create table servsync_practice_demo.cycles (
  id uuid primary key default gen_random_uuid(), user_id uuid unique not null,
  tenant_id uuid unique not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '720 hours',
  fixture_version integer not null default 1 check(fixture_version=1)
);
create table servsync_practice_demo.drafts (
  id uuid not null, cycle_id uuid not null references servsync_practice_demo.cycles(id),
  revision integer not null default 1 check(revision>0), payload jsonb not null,
  primary key(cycle_id,id), check(octet_length(payload::text)<=1048576)
);
alter table servsync_practice_demo.pilots enable row level security;
alter table servsync_practice_demo.pilots force row level security;
alter table servsync_practice_demo.cycles enable row level security;
alter table servsync_practice_demo.cycles force row level security;
alter table servsync_practice_demo.drafts enable row level security;
alter table servsync_practice_demo.drafts force row level security;
create policy pilot_self on servsync_practice_demo.pilots to servsync_practice_demo_executor
  using(user_id=(select servsync_practice_demo.request_actor()) and enabled and access_until>clock_timestamp());
create policy cycle_self on servsync_practice_demo.cycles to servsync_practice_demo_executor
  using(user_id=(select servsync_practice_demo.request_actor()) and exists(select 1 from servsync_practice_demo.pilots p where p.tenant_id=cycles.tenant_id))
  with check(user_id=(select servsync_practice_demo.request_actor()) and exists(select 1 from servsync_practice_demo.pilots p where p.tenant_id=cycles.tenant_id));
create policy draft_active_self on servsync_practice_demo.drafts to servsync_practice_demo_executor
  using(exists(select 1 from servsync_practice_demo.cycles c where c.id=drafts.cycle_id and c.expires_at>clock_timestamp()))
  with check(exists(select 1 from servsync_practice_demo.cycles c where c.id=drafts.cycle_id and c.expires_at>clock_timestamp()));
revoke all on all tables in schema servsync_practice_demo from public, anon, authenticated, service_role;
grant select on servsync_practice_demo.pilots to servsync_practice_demo_executor;
grant select,insert,update on servsync_practice_demo.cycles,servsync_practice_demo.drafts to servsync_practice_demo_executor;

-- No business catalog query, input snapshot, customer identity, cost, credential or private note.
create function servsync_practice_demo.synthetic_snapshot() returns jsonb language sql immutable
set search_path=pg_catalog as $$
select '{"business":{"name":"Fictional Sample Service Co.","laborRate":"75"},"prices":[{"id":"sample-price-1","title":"Small repair","customer_description":"Example repair scope","line_type":"material","unit":"each","default_unit_price_cents":12500,"labor_hours":null}],"templates":[{"id":"sample-template-1","name":"Example repair","scope":"Inspect and complete the agreed small repair.","line_items":[{"line_type":"material","description":"Small repair","quantity":1,"unit":"each","unit_price_cents":12500,"sort_order":0}]}]}'::jsonb
$$;
create function servsync_practice_demo.valid_number(v jsonb, blank_ok boolean, positive boolean default false)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare s text;
begin
  if jsonb_typeof(v) is distinct from 'string' then return false; end if;
  s:=v#>>'{}';
  if blank_ok and s='' then return true; end if;
  if length(s)>24 or s!~'^[0-9]+(\.[0-9]{1,4})?$' then return false; end if;
  return s::numeric<=1000000 and (not positive or s::numeric>0);
end $$;
-- Match JavaScript string limits so direct RPC input remains reloadable in the composer.
create function servsync_practice_demo.utf16_length(v text) returns integer language sql immutable
set search_path=pg_catalog as $$
select length(v)+length(regexp_replace(v,U&'[\0001-\FFFF]','','g'))
$$;
create function servsync_practice_demo.validate_payload(v jsonb) returns void
language plpgsql set search_path=pg_catalog,servsync_practice_demo as $$
declare l jsonb;
begin
  if jsonb_typeof(v) is distinct from 'object' or octet_length(v::text)>1048576
    or (v-array['title','scope','labor_mode','labor_rate','job_labor_hours','line_items'])<>'{}'
    or not(v ?& array['title','scope','labor_mode','labor_rate','job_labor_hours','line_items'])
    or jsonb_typeof(v->'title') is distinct from 'string' or servsync_practice_demo.utf16_length(v->>'title')>200
    or jsonb_typeof(v->'scope') is distinct from 'string' or servsync_practice_demo.utf16_length(v->>'scope')>10000
    or jsonb_typeof(v->'labor_mode') is distinct from 'string'
    or (v->>'labor_mode') not in ('job_total','line_specific')
    or not servsync_practice_demo.valid_number(v->'labor_rate',true)
    or not servsync_practice_demo.valid_number(v->'job_labor_hours',true)
    or jsonb_typeof(v->'line_items') is distinct from 'array' then
    raise exception 'Invalid Practice payload';
  end if;
  if jsonb_array_length(v->'line_items')>100 then raise exception 'Too many Practice lines'; end if;
  for l in select value from jsonb_array_elements(v->'line_items') loop
    if jsonb_typeof(l) is distinct from 'object'
      or (l-array['line_type','line_title','customer_description','quantity','unit','unit_price','labor_hours'])<>'{}'
      or not(l ?& array['line_type','line_title','customer_description','quantity','unit','unit_price','labor_hours'])
      or jsonb_typeof(l->'line_type') is distinct from 'string'
      or (l->>'line_type') not in ('labor','material','fee','other')
      or jsonb_typeof(l->'line_title') is distinct from 'string' or servsync_practice_demo.utf16_length(l->>'line_title')>500
      or jsonb_typeof(l->'customer_description') is distinct from 'string' or servsync_practice_demo.utf16_length(l->>'customer_description')>2000
      or jsonb_typeof(l->'unit') is distinct from 'string' or servsync_practice_demo.utf16_length(l->>'unit')>40
      or not servsync_practice_demo.valid_number(l->'quantity',false,true)
      or not servsync_practice_demo.valid_number(l->'unit_price',true)
      or not servsync_practice_demo.valid_number(l->'labor_hours',true) then
      raise exception 'Invalid Practice line';
    end if;
  end loop;
end $$;

-- Private SECURITY DEFINER owned by a non-login, non-BYPASSRLS role, with narrow table grants.
create function servsync_practice_demo.dispatch(command text, arguments jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,servsync_practice_demo as $$
declare actor uuid:=servsync_practice_demo.request_actor(); p servsync_practice_demo.pilots;
  c servsync_practice_demo.cycles; d servsync_practice_demo.drafts; expected integer; captured_now timestamptz;
begin
  if actor is null then
    raise exception 'Demo pilot required' using errcode='42501';
  end if;
  select * into p from servsync_practice_demo.pilots where user_id=actor;
  if p.user_id is null then raise exception 'Demo pilot required' using errcode='42501'; end if;
  if command is null or command not in ('state','start','save') or jsonb_typeof(arguments) is distinct from 'object' then
    raise exception 'Unsupported Practice operation';
  end if;
  -- Serializes per-pilot starts and saves; the database rechecks the deadline after waiting.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,88421));
  if not exists(select 1 from servsync_practice_demo.pilots where user_id=actor) then
    raise exception 'Demo pilot required' using errcode='42501';
  end if;
  select * into c from servsync_practice_demo.cycles where user_id=actor;
  if command in ('state','start') and arguments<>'{}' then raise exception 'Unexpected Practice arguments'; end if;
  if command='start' and c.id is null then
    captured_now:=clock_timestamp();
    insert into servsync_practice_demo.cycles(user_id,tenant_id,created_at,expires_at)
      values(actor,p.tenant_id,captured_now,captured_now+interval '720 hours') returning * into c;
  end if;
  captured_now:=clock_timestamp();
  if command='start' and c.expires_at<=captured_now then
    raise exception 'Demo pilot cycle expired; renewal requires separate review';
  end if;
  if command='save' then
    if (arguments-array['workspace_id','draft_id','expected_revision','payload'])<>'{}'
      or not(arguments ?& array['workspace_id','draft_id','expected_revision','payload'])
      or jsonb_typeof(arguments->'expected_revision') is distinct from 'number'
      or (arguments->>'expected_revision')!~'^[0-9]+$' then raise exception 'Invalid save arguments'; end if;
    if c.id is null or c.id is distinct from (arguments->>'workspace_id')::uuid or c.expires_at<=clock_timestamp() then
      raise exception 'Active Practice cycle required' using errcode='42501';
    end if;
    perform servsync_practice_demo.validate_payload(arguments->'payload');
    expected:=(arguments->>'expected_revision')::integer;
    select * into d from servsync_practice_demo.drafts where cycle_id=c.id and id=(arguments->>'draft_id')::uuid;
    if d.id is null then
      if expected<>0 then raise exception 'Practice revision conflict' using errcode='PT409'; end if;
      if (select count(*) from servsync_practice_demo.drafts where cycle_id=c.id)>=50 then raise exception 'Practice Draft limit reached'; end if;
      insert into servsync_practice_demo.drafts(id,cycle_id,payload)
        values((arguments->>'draft_id')::uuid,c.id,arguments->'payload') returning * into d;
    elsif d.revision=expected+1 and d.payload=arguments->'payload' then
      null; -- Retry after a lost acknowledgement: identical payload and same revision only.
    else
      if d.revision<>expected then raise exception 'Practice revision conflict' using errcode='PT409'; end if;
      update servsync_practice_demo.drafts set payload=arguments->'payload',revision=revision+1
        where cycle_id=c.id and id=d.id returning * into d;
    end if;
    return jsonb_build_object('id',d.id,'workspace_id',d.cycle_id,'revision',d.revision,'payload',d.payload);
  end if;
  return jsonb_build_object('serverNow',captured_now,'status',case when c.id is null then 'not_started' when c.expires_at<=captured_now then 'expired' else 'active' end,
    'workspace',case when c.id is null then null else jsonb_build_object('id',c.id,'created_at',c.created_at,'expires_at',c.expires_at,'revision',1,
      'snapshot',case when c.expires_at>captured_now then servsync_practice_demo.synthetic_snapshot() else null end) end,
    'drafts',case when c.id is null or c.expires_at<=captured_now then '[]'::jsonb else
      coalesce((select jsonb_agg(jsonb_build_object('id',id,'workspace_id',cycle_id,'revision',revision,'payload',payload) order by id)
        from servsync_practice_demo.drafts where cycle_id=c.id),'[]') end);
end $$;
-- Public wrapper cannot elevate privileges itself; no generic SQL or caller-selected function.
create function public.servsync_practice_demo(command text, arguments jsonb default '{}') returns jsonb
language sql security invoker set search_path=pg_catalog as $$
select servsync_practice_demo.dispatch(command,arguments)
$$;
revoke all on all functions in schema servsync_practice_demo from public,anon,authenticated,service_role;
grant execute on all functions in schema servsync_practice_demo to servsync_practice_demo_executor;
grant execute on function servsync_practice_demo.dispatch(text,jsonb) to authenticated;
revoke all on function public.servsync_practice_demo(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.servsync_practice_demo(text,jsonb) to authenticated;
-- PostgreSQL 16/17 require temporary SET membership and CREATE for ownership transfer.
-- Keep the runtime role unable to create/replace functions after this transaction.
grant servsync_practice_demo_executor to current_user with set true;
grant create on schema servsync_practice_demo to servsync_practice_demo_executor;
alter function servsync_practice_demo.dispatch(text,jsonb) owner to servsync_practice_demo_executor;
revoke create on schema servsync_practice_demo from servsync_practice_demo_executor;
grant servsync_practice_demo_executor to current_user with set false, inherit false;
-- No pilot rows, provider hooks, storage buckets, scheduler, deletion/cleanup, grants to existing business tables,
-- real imports or transfers, settings changes, or automatic deployment are included.
commit;
