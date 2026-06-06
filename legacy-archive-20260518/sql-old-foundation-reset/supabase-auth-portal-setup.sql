-- Auth + role setup for Prevention Pros.
-- Run this in Supabase SQL Editor after enabling Email/Password Auth.
-- Safe to run more than once.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  role text not null default 'customer' check (role in ('admin', 'customer')),
  property_id uuid references public.properties(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Safe helper avoids recursive policies on public.profiles.
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Admins can manage profiles" on public.profiles;
drop policy if exists "Users and admins can read profiles" on public.profiles;
drop policy if exists "Admins can insert profiles" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Admins can delete profiles" on public.profiles;

create policy "Users and admins can read profiles"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or public.current_user_is_admin());

create policy "Admins can insert profiles"
  on public.profiles
  for insert
  to authenticated
  with check (public.current_user_is_admin());

create policy "Admins can update profiles"
  on public.profiles
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Admins can delete profiles"
  on public.profiles
  for delete
  to authenticated
  using (public.current_user_is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, property_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when new.raw_user_meta_data->>'role' = 'admin' then 'admin' else 'customer' end,
    nullif(new.raw_user_meta_data->>'property_id', '')::uuid
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      property_id = coalesce(public.profiles.property_id, excluded.property_id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- IMPORTANT ADMIN STEP:
-- update public.profiles set role = 'admin', full_name = 'Your Name' where email = 'you@example.com';

notify pgrst, 'reload schema';

-- Admin/customer access policies for core app tables.
-- Admins can manage everything. Customers can see their own property-related records.

create or replace function public.current_user_property_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select property_id from public.profiles where id = auth.uid();
$$;

-- PROPERTIES
drop policy if exists "Admins can manage properties" on public.properties;
drop policy if exists "Customers can read own property" on public.properties;
drop policy if exists "Customers can update own property" on public.properties;

create policy "Admins can manage properties"
  on public.properties
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Customers can read own property"
  on public.properties
  for select
  to authenticated
  using (id = public.current_user_property_id());

create policy "Customers can update own property"
  on public.properties
  for update
  to authenticated
  using (id = public.current_user_property_id())
  with check (id = public.current_user_property_id());

-- VENDORS
drop policy if exists "Admins can manage vendors" on public.vendors;
drop policy if exists "Customers can read own vendors" on public.vendors;
drop policy if exists "Customers can manage own vendors" on public.vendors;

create policy "Admins can manage vendors"
  on public.vendors
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Customers can read own vendors"
  on public.vendors
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create policy "Customers can manage own vendors"
  on public.vendors
  for all
  to authenticated
  using (property_id = public.current_user_property_id())
  with check (property_id = public.current_user_property_id());

-- ROOMS
drop policy if exists "Admins can manage rooms" on public.rooms;
drop policy if exists "Customers can read own rooms" on public.rooms;

create policy "Admins can manage rooms"
  on public.rooms
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Customers can read own rooms"
  on public.rooms
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

-- CHECKLIST ITEMS
drop policy if exists "Admins can manage checklist items" on public.checklist_items;
drop policy if exists "Customers can read own checklist items" on public.checklist_items;

create policy "Admins can manage checklist items"
  on public.checklist_items
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Customers can read own checklist items"
  on public.checklist_items
  for select
  to authenticated
  using (exists (
    select 1 from public.rooms r
    where r.id = checklist_items.room_id
      and r.property_id = public.current_user_property_id()
  ));

-- FINDINGS
drop policy if exists "Admins can manage findings" on public.findings;
drop policy if exists "Customers can read own findings" on public.findings;

create policy "Admins can manage findings"
  on public.findings
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Customers can read own findings"
  on public.findings
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

-- PHOTOS
drop policy if exists "Admins can manage photos" on public.photos;
drop policy if exists "Customers can read own photos" on public.photos;

create policy "Admins can manage photos"
  on public.photos
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Customers can read own photos"
  on public.photos
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

-- REQUESTS
drop policy if exists "Admins can manage requests" on public.requests;
drop policy if exists "Customers can manage own requests" on public.requests;

create policy "Admins can manage requests"
  on public.requests
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Customers can manage own requests"
  on public.requests
  for all
  to authenticated
  using (property_id = public.current_user_property_id())
  with check (property_id = public.current_user_property_id());

-- INVOICES
drop policy if exists "Admins can manage invoices" on public.invoices;
drop policy if exists "Customers can read own invoices" on public.invoices;

create policy "Admins can manage invoices"
  on public.invoices
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Customers can read own invoices"
  on public.invoices
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

-- REPORT LOGS
drop policy if exists "Admins can manage report logs" on public.report_logs;
drop policy if exists "Customers can read own report logs" on public.report_logs;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'report_logs') then
    create policy "Admins can manage report logs"
      on public.report_logs
      for all
      to authenticated
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());

    create policy "Customers can read own report logs"
      on public.report_logs
      for select
      to authenticated
      using (property_id = public.current_user_property_id());
  end if;
end $$;

notify pgrst, 'reload schema';

-- Active/inactive customer lifecycle.
alter table public.properties
  add column if not exists is_active boolean not null default true;

-- Replace customer property read/update policies so inactive customers cannot access portal data.
drop policy if exists "Customers can read own property" on public.properties;
drop policy if exists "Customers can update own property" on public.properties;

create policy "Customers can read own active property"
  on public.properties
  for select
  to authenticated
  using (id = public.current_user_property_id() and is_active = true);

create policy "Customers can update own active property"
  on public.properties
  for update
  to authenticated
  using (id = public.current_user_property_id() and is_active = true)
  with check (id = public.current_user_property_id() and is_active = true);

notify pgrst, 'reload schema';
