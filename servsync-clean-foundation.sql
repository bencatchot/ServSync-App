-- ServSync clean foundation reset.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- ██████████████████████████████████████████████████████████████████████████
-- ██  DANGER — ONE-TIME INITIAL SETUP ONLY  ████████████████████████████████
-- ██  Runs ONLY on a BLANK Supabase project before any data exists.        ██
-- ██  DO NOT re-run: deletes ALL auth users + ALL public tables.           ██
-- ██  If you already have accounts, run ONLY the numbered patch SQLs.      ██
-- ██████████████████████████████████████████████████████████████████████████

begin;

drop trigger if exists on_auth_user_created on auth.users;

do $$
declare
  r record;
begin
  for r in
    select tablename
      from pg_tables
     where schemaname = 'public'
  loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as function_signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('drop function if exists %s cascade', r.function_signature);
  end loop;
end $$;

delete from auth.users;

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  role text not null check (role in ('homeowner', 'contractor', 'platform_admin')),
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.homeowner_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null default '',
  phone text not null default '',
  city text not null default '',
  state text not null default '',
  zip_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.homes (
  id uuid primary key default gen_random_uuid(),
  homeowner_user_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null default 'My Home',
  address_line1 text not null default '',
  address_line2 text not null default '',
  city text not null default '',
  state text not null default '',
  zip_code text not null default '',
  home_type text not null default '',
  year_built text not null default '',
  square_feet text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contractor_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  business_name text not null default '',
  slug text not null unique,
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  website_url text not null default '',
  city text not null default '',
  state text not null default '',
  zip_code text not null default '',
  service_categories text[] not null default '{}'::text[],
  service_zip_codes text[] not null default '{}'::text[],
  license_number text not null default '',
  insurance_status text not null default '',
  bonded_status text not null default '',
  business_summary text not null default '',
  public_profile_enabled boolean not null default true,
  account_status text not null default 'active' check (account_status in ('active', 'inactive', 'paused')),
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid')),
  monthly_price_cents integer not null default 0,
  subscription_notes text not null default '',
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id)
);

create table public.contractor_invites (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  invite_code text not null unique,
  status text not null default 'active' check (status in ('active', 'used', 'revoked', 'expired')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  used_by_homeowner_id uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz,
  reward_status text not null default 'not_eligible'
    check (reward_status in ('not_eligible', 'pending_review', 'approved', 'denied', 'paid')),
  reward_notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.homeowner_contractor_connections (
  id uuid primary key default gen_random_uuid(),
  homeowner_user_id uuid not null references public.profiles(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  invite_id uuid references public.contractor_invites(id) on delete set null,
  status text not null default 'active' check (status in ('pending', 'active', 'declined', 'revoked')),
  source text not null default 'contractor_invite',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (homeowner_user_id, contractor_id)
);

create table public.connection_permissions (
  connection_id uuid primary key references public.homeowner_contractor_connections(id) on delete cascade,
  share_contact boolean not null default false,
  share_home_overview boolean not null default false,
  share_address boolean not null default false,
  share_preferred_vendors boolean not null default false,
  share_photos boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.connection_audit_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.homeowner_contractor_connections(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  event_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index homes_homeowner_idx on public.homes(homeowner_user_id);
create index contractor_profiles_owner_idx on public.contractor_profiles(owner_user_id);
create index contractor_invites_contractor_idx on public.contractor_invites(contractor_id);
create index connections_homeowner_idx on public.homeowner_contractor_connections(homeowner_user_id);
create index connections_contractor_idx on public.homeowner_contractor_connections(contractor_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger homeowner_profiles_touch_updated_at
  before update on public.homeowner_profiles
  for each row execute function public.touch_updated_at();

create trigger homes_touch_updated_at
  before update on public.homes
  for each row execute function public.touch_updated_at();

create trigger contractor_profiles_touch_updated_at
  before update on public.contractor_profiles
  for each row execute function public.touch_updated_at();

create trigger connections_touch_updated_at
  before update on public.homeowner_contractor_connections
  for each row execute function public.touch_updated_at();

create trigger connection_permissions_touch_updated_at
  before update on public.connection_permissions
  for each row execute function public.touch_updated_at();

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() = 'platform_admin', false);
$$;

create or replace function public.current_user_owns_contractor(p_contractor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.contractor_profiles cp
     where cp.id = p_contractor_id
       and cp.owner_user_id = auth.uid()
  );
$$;

create or replace function public.current_user_owns_connection_homeowner(p_connection_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.homeowner_contractor_connections c
     where c.id = p_connection_id
       and c.homeowner_user_id = auth.uid()
  );
$$;

create or replace function public.current_user_can_read_connection_as_contractor(p_connection_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.homeowner_contractor_connections c
      join public.contractor_profiles cp on cp.id = c.contractor_id
     where c.id = p_connection_id
       and cp.owner_user_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_referral_invite_code text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'homeowner');
  if v_role not in ('homeowner', 'contractor', 'platform_admin') then
    v_role := 'homeowner';
  end if;
  v_referral_invite_code := nullif(trim(coalesce(new.raw_user_meta_data->>'referral_invite_code', '')), '');

  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update
  set email = excluded.email,
      role = coalesce(public.profiles.role, excluded.role),
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name);

  -- Referral attribution only records who brought in a new homeowner.
  -- It does not create a contractor connection and does not share homeowner data.
  if v_role = 'homeowner' and v_referral_invite_code is not null then
    update public.contractor_invites
       set status = 'used',
           used_by_homeowner_id = new.id,
           used_at = now(),
           reward_status = 'pending_review',
           reward_notes = case
             when coalesce(reward_notes, '') = '' then 'Referral signup recorded automatically from contractor link.'
             else reward_notes
           end
     where invite_code = v_referral_invite_code
       and status = 'active'
       and used_by_homeowner_id is null
       and (expires_at is null or expires_at > now());
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.homeowner_profiles enable row level security;
alter table public.homes enable row level security;
alter table public.contractor_profiles enable row level security;
alter table public.contractor_invites enable row level security;
alter table public.homeowner_contractor_connections enable row level security;
alter table public.connection_permissions enable row level security;
alter table public.connection_audit_events enable row level security;

create policy "Profiles: users read own"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_user_is_platform_admin());

create policy "Profiles: users create own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "Profiles: users update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Homeowner profiles: homeowners manage own"
  on public.homeowner_profiles for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Homes: homeowners manage own"
  on public.homes for all to authenticated
  using (homeowner_user_id = auth.uid())
  with check (homeowner_user_id = auth.uid());

create policy "Contractor profiles: public read enabled"
  on public.contractor_profiles for select to authenticated
  using (
    public_profile_enabled = true
    or owner_user_id = auth.uid()
    or public.current_user_is_platform_admin()
  );

create policy "Contractor profiles: owners create own"
  on public.contractor_profiles for insert to authenticated
  with check (owner_user_id = auth.uid() or public.current_user_is_platform_admin());

create policy "Contractor profiles: owners update own"
  on public.contractor_profiles for update to authenticated
  using (owner_user_id = auth.uid() or public.current_user_is_platform_admin())
  with check (owner_user_id = auth.uid() or public.current_user_is_platform_admin());

create policy "Contractor invites: contractors read own"
  on public.contractor_invites for select to authenticated
  using (public.current_user_owns_contractor(contractor_id) or public.current_user_is_platform_admin());

create policy "Contractor invites: contractors create own"
  on public.contractor_invites for insert to authenticated
  with check (public.current_user_owns_contractor(contractor_id) or public.current_user_is_platform_admin());

create policy "Contractor invites: contractors update own"
  on public.contractor_invites for update to authenticated
  using (public.current_user_owns_contractor(contractor_id) or public.current_user_is_platform_admin())
  with check (public.current_user_owns_contractor(contractor_id) or public.current_user_is_platform_admin());

create policy "Connections: homeowners read own"
  on public.homeowner_contractor_connections for select to authenticated
  using (
    homeowner_user_id = auth.uid()
    or public.current_user_owns_contractor(contractor_id)
  );

create policy "Connections: homeowners create own"
  on public.homeowner_contractor_connections for insert to authenticated
  with check (homeowner_user_id = auth.uid());

create policy "Connections: homeowners update own"
  on public.homeowner_contractor_connections for update to authenticated
  using (homeowner_user_id = auth.uid())
  with check (homeowner_user_id = auth.uid());

create policy "Connections: contractors update own requests"
  on public.homeowner_contractor_connections for update to authenticated
  using (public.current_user_owns_contractor(contractor_id))
  with check (public.current_user_owns_contractor(contractor_id));

create policy "Connection permissions: homeowner manages own"
  on public.connection_permissions for all to authenticated
  using (public.current_user_owns_connection_homeowner(connection_id))
  with check (public.current_user_owns_connection_homeowner(connection_id));

create policy "Connection permissions: contractor reads connected"
  on public.connection_permissions for select to authenticated
  using (public.current_user_can_read_connection_as_contractor(connection_id));

create policy "Connection audit: connected parties read"
  on public.connection_audit_events for select to authenticated
  using (
    public.current_user_owns_connection_homeowner(connection_id)
    or public.current_user_can_read_connection_as_contractor(connection_id)
    or public.current_user_is_platform_admin()
  );

create policy "Connection audit: users create own event"
  on public.connection_audit_events for insert to authenticated
  with check (actor_user_id = auth.uid());

create or replace function public.servsync_lookup_invite(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_invite public.contractor_invites;
  v_contractor public.contractor_profiles;
begin
  select *
    into v_invite
    from public.contractor_invites
   where invite_code = trim(p_invite_code)
     and status = 'active'
     and (expires_at is null or expires_at > now())
   limit 1;

  if v_invite.id is null then
    raise exception 'Invite link not found or no longer active.';
  end if;

  select *
    into v_contractor
    from public.contractor_profiles
   where id = v_invite.contractor_id
     and account_status = 'active'
   limit 1;

  if v_contractor.id is null then
    raise exception 'Contractor account is not active.';
  end if;

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'contractor_id', v_contractor.id,
    'business_name', v_contractor.business_name,
    'city', v_contractor.city,
    'state', v_contractor.state
  );
end;
$$;

create or replace function public.servsync_accept_contractor_invite(
  p_invite_code text,
  p_share_contact boolean default false,
  p_share_home_overview boolean default false,
  p_share_address boolean default false,
  p_share_preferred_vendors boolean default false,
  p_share_photos boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.contractor_invites;
  v_connection_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if public.current_user_role() <> 'homeowner' then
    raise exception 'Only homeowners can approve contractor invites.';
  end if;

  select *
    into v_invite
    from public.contractor_invites
   where invite_code = trim(p_invite_code)
     and status = 'active'
     and (expires_at is null or expires_at > now())
   limit 1;

  if v_invite.id is null then
    raise exception 'Invite link not found or no longer active.';
  end if;

  insert into public.homeowner_contractor_connections (
    homeowner_user_id,
    contractor_id,
    invite_id,
    status,
    source
  ) values (
    auth.uid(),
    v_invite.contractor_id,
    v_invite.id,
    'active',
    'contractor_invite'
  )
  on conflict (homeowner_user_id, contractor_id) do update
  set status = 'active',
      invite_id = excluded.invite_id,
      updated_at = now()
  returning id into v_connection_id;

  insert into public.connection_permissions (
    connection_id,
    share_contact,
    share_home_overview,
    share_address,
    share_preferred_vendors,
    share_photos
  ) values (
    v_connection_id,
    coalesce(p_share_contact, false),
    coalesce(p_share_home_overview, false),
    coalesce(p_share_address, false),
    coalesce(p_share_preferred_vendors, false),
    coalesce(p_share_photos, false)
  )
  on conflict (connection_id) do update
  set share_contact = excluded.share_contact,
      share_home_overview = excluded.share_home_overview,
      share_address = excluded.share_address,
      share_preferred_vendors = excluded.share_preferred_vendors,
      share_photos = excluded.share_photos,
      updated_at = now();

  update public.contractor_invites
     set status = 'used',
         used_by_homeowner_id = auth.uid(),
         used_at = now()
   where id = v_invite.id;

  insert into public.connection_audit_events (connection_id, actor_user_id, event_type, event_details)
  values (v_connection_id, auth.uid(), 'connection_approved', jsonb_build_object('invite_id', v_invite.id));

  return jsonb_build_object('connection_id', v_connection_id, 'status', 'active');
end;
$$;

create or replace function public.servsync_create_contractor_invite(p_contractor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_invite_id uuid;
begin
  if not public.current_user_owns_contractor(p_contractor_id) and not public.current_user_is_platform_admin() then
    raise exception 'You do not own this contractor profile.';
  end if;

  v_code := upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 12));

  insert into public.contractor_invites (contractor_id, invite_code, created_by)
  values (p_contractor_id, v_code, auth.uid())
  returning id into v_invite_id;

  return jsonb_build_object('invite_id', v_invite_id, 'invite_code', v_code);
end;
$$;

create or replace function public.servsync_get_homeowner_connections()
returns table (
  connection_id uuid,
  contractor_id uuid,
  business_name text,
  contact_name text,
  email text,
  phone text,
  city text,
  state text,
  status text,
  source text,
  permissions jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    cp.id,
    cp.business_name,
    cp.contact_name,
    cp.email,
    cp.phone,
    cp.city,
    cp.state,
    c.status,
    c.source,
    jsonb_build_object(
      'share_contact', coalesce(p.share_contact, false),
      'share_home_overview', coalesce(p.share_home_overview, false),
      'share_address', coalesce(p.share_address, false),
      'share_preferred_vendors', coalesce(p.share_preferred_vendors, false),
      'share_photos', coalesce(p.share_photos, false)
    ) as permissions,
    c.created_at,
    c.updated_at
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.connection_permissions p on p.connection_id = c.id
  where c.homeowner_user_id = auth.uid()
  order by c.created_at desc;
$$;

create or replace function public.servsync_contractor_connected_homeowners()
returns table (
  connection_id uuid,
  homeowner_user_id uuid,
  display_name text,
  phone text,
  city text,
  state text,
  zip_code text,
  status text,
  permissions jsonb,
  home jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  source text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    c.homeowner_user_id,
    case when coalesce(p.share_contact, false) then hp.display_name else 'Homeowner' end as display_name,
    case when coalesce(p.share_contact, false) then hp.phone else '' end as phone,
    case when coalesce(p.share_contact, false) then hp.city else '' end as city,
    case when coalesce(p.share_contact, false) then hp.state else '' end as state,
    case when coalesce(p.share_contact, false) then hp.zip_code else '' end as zip_code,
    c.status,
    jsonb_build_object(
      'share_contact', coalesce(p.share_contact, false),
      'share_home_overview', coalesce(p.share_home_overview, false),
      'share_address', coalesce(p.share_address, false),
      'share_preferred_vendors', coalesce(p.share_preferred_vendors, false),
      'share_photos', coalesce(p.share_photos, false)
    ) as permissions,
    case
      when coalesce(p.share_home_overview, false) then jsonb_build_object(
        'nickname', h.nickname,
        'address_line1', case when coalesce(p.share_address, false) then h.address_line1 else '' end,
        'address_line2', case when coalesce(p.share_address, false) then h.address_line2 else '' end,
        'city', h.city,
        'state', h.state,
        'zip_code', h.zip_code,
        'home_type', h.home_type,
        'year_built', h.year_built,
        'square_feet', h.square_feet,
        'notes', h.notes
      )
      else null
    end as home,
    c.created_at,
    c.updated_at,
    c.source
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = c.homeowner_user_id
  left join public.connection_permissions p on p.connection_id = c.id
  left join lateral (
    select *
      from public.homes h
     where h.homeowner_user_id = c.homeowner_user_id
     order by h.created_at asc
     limit 1
  ) h on true
  where cp.owner_user_id = auth.uid()
    and c.status = 'active'
  order by c.created_at desc;
$$;

create or replace function public.servsync_admin_overview()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when not public.current_user_is_platform_admin() then
      jsonb_build_object(
        'homeowners', 0,
        'contractors', 0,
        'active_connections', 0,
        'pending_connections', 0,
        'active_invites', 0
      )
    else
      jsonb_build_object(
        'homeowners', (select count(*) from public.profiles where role = 'homeowner'),
        'contractors', (select count(*) from public.contractor_profiles),
        'active_connections', (select count(*) from public.homeowner_contractor_connections where status = 'active'),
        'pending_connections', (select count(*) from public.homeowner_contractor_connections where status = 'pending'),
        'active_invites', (select count(*) from public.contractor_invites where status = 'active')
      )
    end;
$$;

create or replace function public.servsync_admin_connection_overview()
returns table (
  connection_id uuid,
  contractor_id uuid,
  contractor_name text,
  status text,
  source text,
  event_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    cp.id,
    cp.business_name,
    c.status,
    c.source,
    count(a.id) as event_count,
    c.created_at,
    c.updated_at
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.connection_audit_events a on a.connection_id = c.id
  where public.current_user_is_platform_admin()
  group by c.id, cp.id, cp.business_name, c.status, c.source, c.created_at, c.updated_at
  order by c.updated_at desc;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.homeowner_profiles to authenticated;
grant select, insert, update, delete on public.homes to authenticated;
grant select, insert, update, delete on public.contractor_profiles to authenticated;
grant select, insert, update, delete on public.contractor_invites to authenticated;
grant select, insert, update, delete on public.homeowner_contractor_connections to authenticated;
grant select, insert, update, delete on public.connection_permissions to authenticated;
grant select, insert on public.connection_audit_events to authenticated;

grant execute on function public.servsync_lookup_invite(text) to authenticated;
grant execute on function public.servsync_accept_contractor_invite(text, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.servsync_create_contractor_invite(uuid) to authenticated;
grant execute on function public.servsync_get_homeowner_connections() to authenticated;
grant execute on function public.servsync_contractor_connected_homeowners() to authenticated;
grant execute on function public.servsync_admin_overview() to authenticated;
grant execute on function public.servsync_admin_connection_overview() to authenticated;

notify pgrst, 'reload schema';

commit;
