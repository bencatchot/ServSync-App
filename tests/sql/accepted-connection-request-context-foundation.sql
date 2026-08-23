create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.profiles (
  id uuid primary key,
  role text not null default 'homeowner'
);

create table public.contractor_profiles (
  id uuid primary key,
  owner_user_id uuid not null references public.profiles(id)
);

create table public.contractor_team_members (
  contractor_id uuid not null references public.contractor_profiles(id),
  user_id uuid not null references public.profiles(id),
  status text not null default 'active'
);

create function public.current_user_is_platform_admin()
returns boolean language sql stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'platform_admin');
$$;

create function public.current_user_can_access_contractor(p_contractor_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.contractor_profiles
     where id = p_contractor_id and owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.contractor_team_members
     where contractor_id = p_contractor_id and user_id = auth.uid() and status = 'active'
  ) or public.current_user_is_platform_admin();
$$;

create function public.current_user_can_manage_contractor_connections(p_contractor_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.contractor_profiles
     where id = p_contractor_id and owner_user_id = auth.uid()
  );
$$;

create table public.homeowner_profiles (
  user_id uuid primary key references public.profiles(id),
  display_name text not null default '',
  phone text not null default '',
  city text not null default '',
  state text not null default '',
  zip_code text not null default ''
);

create table public.homeowner_contractor_connections (
  id uuid primary key,
  homeowner_user_id uuid not null references public.profiles(id),
  contractor_id uuid not null references public.contractor_profiles(id),
  status text not null,
  source text not null default 'homeowner_request',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homeowner_contractor_connections enable row level security;
create policy "Connections: contractor reads own"
  on public.homeowner_contractor_connections for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id));
grant select on public.homeowner_contractor_connections to authenticated;

create table public.connection_permissions (
  connection_id uuid primary key references public.homeowner_contractor_connections(id),
  share_contact boolean not null default false,
  share_home_overview boolean not null default false,
  share_address boolean not null default false,
  share_preferred_vendors boolean not null default false,
  share_photos boolean not null default false
);

create table public.homes (
  id uuid primary key,
  homeowner_user_id uuid not null references public.profiles(id),
  nickname text not null default '',
  address_line1 text not null default '',
  address_line2 text not null default '',
  city text not null default '',
  state text not null default '',
  zip_code text not null default '',
  home_type text not null default '',
  year_built integer,
  square_feet integer,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.connection_shared_properties (
  id uuid primary key,
  connection_id uuid not null references public.homeowner_contractor_connections(id),
  home_id uuid not null references public.homes(id),
  share_home_overview boolean not null default false,
  share_address boolean not null default false,
  share_preferred_vendors boolean not null default false,
  share_photos boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.connection_request_contexts (
  connection_id uuid primary key references public.homeowner_contractor_connections(id),
  message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.connection_request_contexts enable row level security;
create policy "Request contexts: contractor reads pending or active"
  on public.connection_request_contexts for select to authenticated
  using (
    exists (
      select 1 from public.homeowner_contractor_connections c
       where c.id = connection_request_contexts.connection_id
         and c.status in ('pending', 'active')
         and public.current_user_can_access_contractor(c.contractor_id)
    )
  );
grant select on public.connection_request_contexts to authenticated;

create table public.connection_audit_events (
  connection_id uuid not null references public.homeowner_contractor_connections(id),
  actor_user_id uuid not null references public.profiles(id),
  event_type text not null,
  event_details jsonb not null default '{}'::jsonb
);

create function public.servsync_respond_to_connection_request(p_connection_id uuid, p_response text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_connection public.homeowner_contractor_connections;
  v_next_status text;
begin
  v_next_status := case lower(trim(coalesce(p_response, '')))
    when 'accept' then 'active'
    when 'active' then 'active'
    when 'decline' then 'declined'
    when 'declined' then 'declined'
    else null
  end;
  if v_next_status is null then raise exception 'Response must be accept or decline.'; end if;

  select * into v_connection from public.homeowner_contractor_connections
   where id = p_connection_id for update;
  if v_connection.id is null or v_connection.status <> 'pending' then
    raise exception 'Only pending connection requests can be updated.';
  end if;
  if not public.current_user_can_manage_contractor_connections(v_connection.contractor_id) then
    raise exception 'You do not have permission to respond to this connection request.';
  end if;

  update public.homeowner_contractor_connections
     set status = v_next_status, updated_at = now()
   where id = p_connection_id;
  insert into public.connection_audit_events(connection_id, actor_user_id, event_type, event_details)
  values (p_connection_id, auth.uid(), 'connection_request_accepted', jsonb_build_object('status', v_next_status));
  return jsonb_build_object('connection_id', p_connection_id, 'status', v_next_status);
end;
$$;

grant execute on function public.servsync_respond_to_connection_request(uuid, text) to authenticated;
