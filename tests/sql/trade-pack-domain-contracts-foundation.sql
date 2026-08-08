do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

create schema if not exists auth authorization postgres;

create table public.contractor_profiles (
  id uuid primary key,
  owner_user_id uuid not null,
  business_name text not null
);

create table public.contractor_team_members (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  user_id uuid not null,
  role text not null,
  status text not null
);

create function auth.uid()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create function public.current_user_can_access_contractor(p_contractor_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select exists (
    select 1
      from public.contractor_profiles profile
     where profile.id = p_contractor_id
       and profile.owner_user_id = auth.uid()
  ) or exists (
    select 1
      from public.contractor_team_members member
     where member.contractor_id = p_contractor_id
       and member.user_id = auth.uid()
       and member.status = 'active'
  );
$$;

alter table public.contractor_profiles owner to postgres;
alter table public.contractor_team_members owner to postgres;
alter function auth.uid() owner to postgres;
alter function public.current_user_can_access_contractor(uuid) owner to postgres;

revoke all on table public.contractor_profiles from public, anon, authenticated, service_role;
revoke all on table public.contractor_team_members from public, anon, authenticated, service_role;
revoke all on function public.current_user_can_access_contractor(uuid) from public, anon, authenticated, service_role;
grant execute on function public.current_user_can_access_contractor(uuid) to authenticated;
grant execute on function auth.uid() to anon, authenticated, service_role;
