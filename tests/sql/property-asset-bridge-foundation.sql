do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

create extension if not exists pgcrypto;
create schema if not exists auth authorization postgres;

create table auth.users (id uuid primary key);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'homeowner',
  full_name text not null default ''
);
create table public.homes (
  id uuid primary key,
  homeowner_user_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null default 'Home'
);
create table public.home_memberships (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  status text not null default 'active'
);
create table public.home_rooms (
  id uuid primary key,
  home_id uuid not null references public.homes(id) on delete cascade,
  name text not null,
  archived_at timestamptz
);
create table public.contractor_profiles (
  id uuid primary key,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  business_name text not null,
  account_status text not null default 'active'
);
create table public.contractor_team_members (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  status text not null
);
create table public.homeowner_contractor_connections (
  id uuid primary key,
  homeowner_user_id uuid not null references public.profiles(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  status text not null
);
create table public.connection_shared_properties (
  id uuid primary key,
  connection_id uuid not null references public.homeowner_contractor_connections(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  share_home_overview boolean not null default false
);
create table public.contractor_local_contacts (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  display_name text not null,
  homeowner_user_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  archived_at timestamptz
);
create table public.contractor_local_homes (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  nickname text not null,
  home_id uuid references public.homes(id) on delete set null,
  claimed_at timestamptz,
  archived_at timestamptz
);

create function auth.uid()
returns uuid language sql stable set search_path = pg_catalog as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function public.touch_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
create function public.current_user_is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'platform_admin');
$$;
create function public.current_user_can_access_home(p_home_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.homes where id = p_home_id and homeowner_user_id = auth.uid())
    or exists (
      select 1 from public.home_memberships
       where home_id = p_home_id and user_id = auth.uid()
         and status = 'active' and role in ('owner', 'admin', 'member', 'viewer')
    );
$$;
create function public.current_user_can_manage_home(p_home_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.homes where id = p_home_id and homeowner_user_id = auth.uid())
    or exists (
      select 1 from public.home_memberships
       where home_id = p_home_id and user_id = auth.uid()
         and status = 'active' and role in ('owner', 'admin')
    );
$$;
create function public.current_user_can_access_contractor(p_contractor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.contractor_profiles where id = p_contractor_id and owner_user_id = auth.uid())
    or exists (
      select 1 from public.contractor_team_members
       where contractor_id = p_contractor_id and user_id = auth.uid() and status = 'active'
    ) or public.current_user_is_platform_admin();
$$;
create function public.current_user_can_manage_contractor_customers(p_contractor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.contractor_profiles where id = p_contractor_id and owner_user_id = auth.uid())
    or exists (
      select 1 from public.contractor_team_members
       where contractor_id = p_contractor_id and user_id = auth.uid()
         and status = 'active' and role in ('admin', 'office')
    );
$$;

alter table auth.users owner to postgres;
alter table public.profiles owner to postgres;
alter table public.homes owner to postgres;
alter table public.home_memberships owner to postgres;
alter table public.home_rooms owner to postgres;
alter table public.contractor_profiles owner to postgres;
alter table public.contractor_team_members owner to postgres;
alter table public.homeowner_contractor_connections owner to postgres;
alter table public.connection_shared_properties owner to postgres;
alter table public.contractor_local_contacts owner to postgres;
alter table public.contractor_local_homes owner to postgres;
alter function auth.uid() owner to postgres;
alter function public.touch_updated_at() owner to postgres;
alter function public.current_user_is_platform_admin() owner to postgres;
alter function public.current_user_can_access_home(uuid) owner to postgres;
alter function public.current_user_can_manage_home(uuid) owner to postgres;
alter function public.current_user_can_access_contractor(uuid) owner to postgres;
alter function public.current_user_can_manage_contractor_customers(uuid) owner to postgres;

grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function public.current_user_is_platform_admin() to authenticated;
grant execute on function public.current_user_can_access_home(uuid) to authenticated;
grant execute on function public.current_user_can_manage_home(uuid) to authenticated;
grant execute on function public.current_user_can_access_contractor(uuid) to authenticated;
grant execute on function public.current_user_can_manage_contractor_customers(uuid) to authenticated;
