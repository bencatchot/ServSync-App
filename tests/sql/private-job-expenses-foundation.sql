-- Fictional minimal schema with same authority and lineage columns used by the proposed migration.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
grant usage on schema auth to authenticated,anon;
create table public.contractor_profiles(id uuid primary key, owner_user_id uuid not null, account_status text not null default 'active');
create table public.contractor_team_members(id uuid primary key, contractor_id uuid not null, user_id uuid not null,
  role text not null, status text not null, display_name text not null default '', unique(contractor_id,user_id));
create table public.estimates(id uuid primary key, contractor_id uuid not null, inspection_id uuid, status text not null, subtotal_cents integer not null);
create table public.inspections(id uuid primary key, contractor_id uuid not null, estimate_id uuid, job_status text not null);
create function public.servsync_current_contractor_profile() returns table(id uuid)
language sql security definer set search_path = '' stable as $$
  select c.id from public.contractor_profiles c where c.owner_user_id=auth.uid()
  or (c.account_status='active' and exists (select from public.contractor_team_members m
    where m.contractor_id=c.id and m.user_id=auth.uid() and m.status='active'))
  order by (c.owner_user_id=auth.uid()) desc,c.id limit 1
$$;
create function public.uid(p int) returns uuid language sql immutable as
$$select ('10000000-0000-0000-0000-'||lpad(p::text,12,'0'))::uuid$$;
insert into public.contractor_profiles(id,owner_user_id,account_status)
values (uid(10),uid(1),'active'),(uid(20),uid(6),'active'),(uid(30),uid(9),'disabled');
insert into public.contractor_team_members(id,contractor_id,user_id,role,status,display_name)
values (uid(31),uid(10),uid(2),'field_tech','active','A Tech'),
       (uid(32),uid(10),uid(3),'field_tech','active','B Tech'),
       (uid(33),uid(10),uid(4),'office','active','Office'),
       (uid(34),uid(10),uid(5),'viewer','active','Viewer'),
       (uid(35),uid(20),uid(7),'field_tech','active','Other company'),
       (uid(36),uid(10),uid(8),'admin','active','Admin');
insert into public.estimates values (uid(110),uid(10),null,'accepted',150000), (uid(120),uid(10),null,'draft',250000);
insert into public.inspections values (uid(200),uid(10),null,'scheduled'),(uid(210),uid(10),null,'scheduled'),(uid(220),uid(20),null,'scheduled');
