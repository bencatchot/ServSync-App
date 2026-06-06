-- ServSync tenant isolation foundation.
-- Paste this into Supabase SQL Editor for the ServSync project.
-- Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_email text not null default '',
  support_email text not null default '',
  support_phone text not null default '',
  website_url text not null default '',
  logo_url text,
  brand_color text not null default '#2563eb',
  timezone text not null default 'America/Chicago',
  plan_name text not null default 'Starter',
  monthly_price_cents integer not null default 19900,
  account_status text not null default 'active',
  subscription_status text not null default 'trialing',
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations
  add column if not exists owner_email text not null default '',
  add column if not exists support_email text not null default '',
  add column if not exists support_phone text not null default '',
  add column if not exists website_url text not null default '',
  add column if not exists logo_url text,
  add column if not exists brand_color text not null default '#2563eb',
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists plan_name text not null default 'Starter',
  add column if not exists monthly_price_cents integer not null default 19900,
  add column if not exists account_status text not null default 'active',
  add column if not exists subscription_status text not null default 'trialing',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organizations'::regclass
      and conname = 'organizations_account_status_check'
  ) then
    alter table public.organizations
      add constraint organizations_account_status_check
      check (account_status in ('active', 'inactive', 'paused', 'deleted'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organizations'::regclass
      and conname = 'organizations_subscription_status_check'
  ) then
    alter table public.organizations
      add constraint organizations_subscription_status_check
      check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid'));
  end if;
end $$;

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_role_check'
  ) then
    alter table public.organization_members
      add constraint organization_members_role_check
      check (role in ('owner', 'admin', 'field', 'viewer'));
  end if;
end $$;

alter table public.profiles
  add column if not exists active_organization_id uuid references public.organizations(id) on delete set null;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('customer', 'admin', 'contractor', 'platform_admin'));

insert into public.organizations (
  name,
  slug,
  owner_email,
  support_email,
  website_url,
  plan_name,
  monthly_price_cents,
  account_status,
  subscription_status
)
values (
  'Prevention Pros',
  'prevention-pros',
  'ben@preventionprosllc.com',
  'ben@preventionprosllc.com',
  'https://preventionprosllc.com',
  'Internal Test',
  0,
  'active',
  'active'
)
on conflict (slug) do nothing;

alter table public.properties
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

do $$
declare
  v_org_id uuid;
begin
  select id into v_org_id from public.organizations where slug = 'prevention-pros';

  update public.properties
     set organization_id = coalesce(organization_id, v_org_id)
   where organization_id is null;

  update public.profiles
     set active_organization_id = coalesce(active_organization_id, v_org_id)
   where role in ('admin', 'contractor');

  insert into public.organization_members (organization_id, user_id, role)
  select v_org_id, id, 'owner'
    from public.profiles
   where role in ('admin', 'contractor')
  on conflict (organization_id, user_id) do nothing;
end $$;

alter table public.properties
  alter column organization_id set not null;

do $$
declare
  t text;
begin
  foreach t in array array[
    'vendors',
    'rooms',
    'findings',
    'photos',
    'requests',
    'invoices',
    'report_logs',
    'maintenance_schedule',
    'appointments'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete restrict',
        t
      );

      execute format(
        'update public.%I child set organization_id = p.organization_id from public.properties p where child.property_id = p.id and child.organization_id is null',
        t
      );

      execute format('alter table public.%I alter column organization_id set not null', t);
      execute format('create index if not exists %I on public.%I(organization_id)', t || '_organization_id_idx', t);
    end if;
  end loop;
end $$;

alter table public.checklist_items
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

update public.checklist_items ci
   set organization_id = r.organization_id
  from public.rooms r
 where ci.room_id = r.id
   and ci.organization_id is null;

alter table public.checklist_items
  alter column organization_id set not null;

create index if not exists profiles_active_organization_idx on public.profiles(active_organization_id);
create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists properties_organization_id_idx on public.properties(organization_id);
create index if not exists checklist_items_organization_id_idx on public.checklist_items(organization_id);

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

create or replace function public.current_user_organization_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select active_organization_id from public.profiles where id = auth.uid()),
    (select organization_id from public.organization_members where user_id = auth.uid() order by created_at limit 1)
  );
$$;

create or replace function public.current_user_property_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select property_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_customer_organization_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.organization_id
    from public.properties p
   where p.id = public.current_user_property_id();
$$;

create or replace function public.current_user_is_member_of(p_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_is_platform_admin()
    or exists (
      select 1
        from public.organization_members om
       where om.user_id = auth.uid()
         and om.organization_id = p_organization_id
    );
$$;

create or replace function public.current_user_can_manage_organization(p_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_is_platform_admin()
    or exists (
      select 1
        from public.organization_members om
       where om.user_id = auth.uid()
         and om.organization_id = p_organization_id
         and om.role in ('owner', 'admin')
    );
$$;

create or replace function public.current_user_can_manage_org()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_can_manage_organization(public.current_user_organization_id());
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.current_user_role() in ('admin', 'contractor', 'platform_admin'),
    false
  );
$$;

create or replace function public.profile_belongs_to_current_org(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_is_platform_admin()
    or exists (
      select 1
        from public.organization_members target
       where target.user_id = p_profile_id
         and target.organization_id = public.current_user_organization_id()
    )
    or exists (
      select 1
        from public.profiles pr
        join public.properties p on p.id = pr.property_id
       where pr.id = p_profile_id
         and p.organization_id = public.current_user_organization_id()
    );
$$;

create or replace function public.set_property_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.current_user_organization_id();
  end if;
  if new.organization_id is null then
    raise exception 'No organization is linked to this account.';
  end if;
  return new;
end;
$$;

drop trigger if exists set_property_organization_id_trigger on public.properties;
create trigger set_property_organization_id_trigger
  before insert or update on public.properties
  for each row execute function public.set_property_organization_id();

create or replace function public.set_child_organization_from_property()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.property_id is not null then
    select p.organization_id into new.organization_id
      from public.properties p
     where p.id = new.property_id;
  end if;
  return new;
end;
$$;

create or replace function public.set_checklist_organization_from_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select r.organization_id into new.organization_id
    from public.rooms r
   where r.id = new.room_id;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'vendors',
    'rooms',
    'findings',
    'photos',
    'requests',
    'invoices',
    'report_logs',
    'maintenance_schedule',
    'appointments'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('drop trigger if exists set_%I_organization_id_trigger on public.%I', t, t);
      execute format(
        'create trigger set_%I_organization_id_trigger before insert or update on public.%I for each row execute function public.set_child_organization_from_property()',
        t,
        t
      );
    end if;
  end loop;
end $$;

drop trigger if exists set_checklist_items_organization_id_trigger on public.checklist_items;
create trigger set_checklist_items_organization_id_trigger
  before insert or update on public.checklist_items
  for each row execute function public.set_checklist_organization_from_room();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org_id uuid;
begin
  v_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'customer');
  if v_role not in ('customer', 'admin', 'contractor', 'platform_admin') then
    v_role := 'customer';
  end if;

  v_org_id := nullif(new.raw_user_meta_data->>'organization_id', '')::uuid;

  insert into public.profiles (id, email, full_name, role, property_id, active_organization_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_role,
    nullif(new.raw_user_meta_data->>'property_id', '')::uuid,
    v_org_id
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = coalesce(nullif(public.profiles.role, ''), excluded.role),
      property_id = coalesce(public.profiles.property_id, excluded.property_id),
      active_organization_id = coalesce(public.profiles.active_organization_id, excluded.active_organization_id);

  if v_org_id is not null and v_role in ('admin', 'contractor') then
    insert into public.organization_members (organization_id, user_id, role)
    values (v_org_id, new.id, coalesce(nullif(new.raw_user_meta_data->>'member_role', ''), 'owner'))
    on conflict (organization_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.vendors enable row level security;
alter table public.rooms enable row level security;
alter table public.checklist_items enable row level security;
alter table public.findings enable row level security;
alter table public.photos enable row level security;
alter table public.requests enable row level security;
alter table public.invoices enable row level security;

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in (
        'organizations',
        'organization_members',
        'profiles',
        'properties',
        'vendors',
        'rooms',
        'checklist_items',
        'findings',
        'photos',
        'requests',
        'invoices',
        'report_logs',
        'maintenance_schedule',
        'appointments'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy "Organizations: platform admins manage all"
  on public.organizations
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Organizations: members read own"
  on public.organizations
  for select
  to authenticated
  using (public.current_user_is_member_of(id));

create policy "Organization members: platform admins manage all"
  on public.organization_members
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Organization members: members read own organization"
  on public.organization_members
  for select
  to authenticated
  using (public.current_user_is_member_of(organization_id));

create policy "Profiles: users read own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "Profiles: platform admins manage all"
  on public.profiles
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Profiles: org managers read organization profiles"
  on public.profiles
  for select
  to authenticated
  using (public.current_user_can_manage_org() and public.profile_belongs_to_current_org(id));

create policy "Profiles: org managers update organization profiles"
  on public.profiles
  for update
  to authenticated
  using (public.current_user_can_manage_org() and public.profile_belongs_to_current_org(id))
  with check (public.current_user_can_manage_org());

create policy "Properties: platform admins manage all"
  on public.properties
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Properties: contractors manage own organization"
  on public.properties
  for all
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
  with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

create policy "Properties: homeowners read own active"
  on public.properties
  for select
  to authenticated
  using (
    id = public.current_user_property_id()
    and organization_id = public.current_user_customer_organization_id()
    and coalesce(is_active, true) = true
  );

create policy "Properties: homeowners update own active"
  on public.properties
  for update
  to authenticated
  using (
    id = public.current_user_property_id()
    and organization_id = public.current_user_customer_organization_id()
    and coalesce(is_active, true) = true
  )
  with check (
    id = public.current_user_property_id()
    and organization_id = public.current_user_customer_organization_id()
    and coalesce(is_active, true) = true
  );

create policy "Vendors: platform admins manage all"
  on public.vendors
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Vendors: contractors manage own organization"
  on public.vendors
  for all
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
  with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

create policy "Vendors: homeowners read own property"
  on public.vendors
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create policy "Rooms: platform admins manage all"
  on public.rooms
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Rooms: contractors manage own organization"
  on public.rooms
  for all
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
  with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

create policy "Rooms: homeowners read own property"
  on public.rooms
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create policy "Checklist: platform admins manage all"
  on public.checklist_items
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Checklist: contractors manage own organization"
  on public.checklist_items
  for all
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
  with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

create policy "Checklist: homeowners read own property rooms"
  on public.checklist_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = checklist_items.room_id
        and r.property_id = public.current_user_property_id()
    )
  );

create policy "Findings: platform admins manage all"
  on public.findings
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Findings: contractors manage own organization"
  on public.findings
  for all
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
  with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

create policy "Findings: homeowners read own property"
  on public.findings
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create policy "Photos: platform admins manage all"
  on public.photos
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Photos: contractors manage own organization"
  on public.photos
  for all
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
  with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

create policy "Photos: homeowners read own property"
  on public.photos
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create policy "Requests: platform admins manage all"
  on public.requests
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Requests: contractors manage own organization"
  on public.requests
  for all
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
  with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

create policy "Requests: homeowners read own property"
  on public.requests
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create policy "Invoices: platform admins manage all"
  on public.invoices
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Invoices: contractors manage own organization"
  on public.invoices
  for all
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
  with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

create policy "Invoices: homeowners read own non-draft"
  on public.invoices
  for select
  to authenticated
  using (property_id = public.current_user_property_id() and status <> 'Draft');

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'report_logs') then
    execute 'alter table public.report_logs enable row level security';

    create policy "Report logs: platform admins manage all"
      on public.report_logs
      for all
      to authenticated
      using (public.current_user_is_platform_admin())
      with check (public.current_user_is_platform_admin());

    create policy "Report logs: contractors manage own organization"
      on public.report_logs
      for all
      to authenticated
      using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
      with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

    create policy "Report logs: homeowners read published own property"
      on public.report_logs
      for select
      to authenticated
      using (
        property_id = public.current_user_property_id()
        and coalesce(notes, '') like '%[Published to Customer]%'
        and coalesce(notes, '') not like '%[Internal Draft]%'
      );
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maintenance_schedule') then
    execute 'alter table public.maintenance_schedule enable row level security';

    create policy "Maintenance schedule: platform admins manage all"
      on public.maintenance_schedule
      for all
      to authenticated
      using (public.current_user_is_platform_admin())
      with check (public.current_user_is_platform_admin());

    create policy "Maintenance schedule: contractors manage own organization"
      on public.maintenance_schedule
      for all
      to authenticated
      using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
      with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

    create policy "Maintenance schedule: homeowners read own property"
      on public.maintenance_schedule
      for select
      to authenticated
      using (property_id = public.current_user_property_id());
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'appointments') then
    execute 'alter table public.appointments enable row level security';

    create policy "Appointments: platform admins manage all"
      on public.appointments
      for all
      to authenticated
      using (public.current_user_is_platform_admin())
      with check (public.current_user_is_platform_admin());

    create policy "Appointments: contractors manage own organization"
      on public.appointments
      for all
      to authenticated
      using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org())
      with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_org());

    create policy "Appointments: homeowners read visible own property"
      on public.appointments
      for select
      to authenticated
      using (property_id = public.current_user_property_id() and customer_visible = true);
  end if;
end $$;

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;

notify pgrst, 'reload schema';
