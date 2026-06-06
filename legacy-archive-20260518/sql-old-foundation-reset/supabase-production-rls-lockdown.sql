-- Production RLS Lockdown for Prevention Pros LLC
-- Run this in Supabase SQL Editor before entering real customer data.
-- Safe to re-run.
--
-- IMPORTANT BEFORE RUNNING:
-- 1) Make sure your own user exists in Authentication.
-- 2) Make sure your profile row is marked admin:
--    update public.profiles set role = 'admin' where email = 'YOUR_ADMIN_EMAIL@example.com';
-- 3) After running, test admin login and customer login.

-- -----------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER avoids recursive profile-policy lookups.
-- -----------------------------------------------------------------------------

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

create or replace function public.current_user_property_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select property_id from public.profiles where id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Make sure required columns exist.
-- -----------------------------------------------------------------------------

alter table public.properties
  add column if not exists is_active boolean not null default true;

-- -----------------------------------------------------------------------------
-- Enable RLS on all app tables.
-- -----------------------------------------------------------------------------

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
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'report_logs') then
    alter table public.report_logs enable row level security;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Remove old/broad policies, including any previous "Allow all" policies.
-- This intentionally rebuilds policies from a known-safe baseline.
-- -----------------------------------------------------------------------------

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'properties', 'vendors', 'rooms', 'checklist_items',
        'findings', 'photos', 'requests', 'invoices', 'report_logs'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Profiles
-- Admins can manage all profiles. Users can read only their own profile.
-- -----------------------------------------------------------------------------

create policy "Profiles: users read own, admins read all"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or public.current_user_is_admin());

create policy "Profiles: admins insert"
  on public.profiles
  for insert
  to authenticated
  with check (public.current_user_is_admin());

create policy "Profiles: admins update"
  on public.profiles
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Profiles: admins delete"
  on public.profiles
  for delete
  to authenticated
  using (public.current_user_is_admin());

-- -----------------------------------------------------------------------------
-- Properties
-- Admins manage all. Customers can read/update only their own active property.
-- The update permission is needed for onboarding/home details.
-- -----------------------------------------------------------------------------

create policy "Properties: admins manage all"
  on public.properties
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Properties: customers read own active"
  on public.properties
  for select
  to authenticated
  using (id = public.current_user_property_id() and is_active = true);

create policy "Properties: customers update own active"
  on public.properties
  for update
  to authenticated
  using (id = public.current_user_property_id() and is_active = true)
  with check (id = public.current_user_property_id() and is_active = true);

-- -----------------------------------------------------------------------------
-- Vendors
-- Admins manage all. Customers can read/manage only their own vendors.
-- Customer manage is needed because onboarding saves preferred vendors.
-- -----------------------------------------------------------------------------

create policy "Vendors: admins manage all"
  on public.vendors
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Vendors: customers read own"
  on public.vendors
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create policy "Vendors: customers insert own"
  on public.vendors
  for insert
  to authenticated
  with check (property_id = public.current_user_property_id());

create policy "Vendors: customers update own"
  on public.vendors
  for update
  to authenticated
  using (property_id = public.current_user_property_id())
  with check (property_id = public.current_user_property_id());

-- Customers should not delete vendors from the portal currently.

-- -----------------------------------------------------------------------------
-- Rooms and Checklist Items
-- Admins manage. Customers can read only their own.
-- -----------------------------------------------------------------------------

create policy "Rooms: admins manage all"
  on public.rooms
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Rooms: customers read own"
  on public.rooms
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create policy "Checklist: admins manage all"
  on public.checklist_items
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Checklist: customers read own"
  on public.checklist_items
  for select
  to authenticated
  using (exists (
    select 1
    from public.rooms r
    where r.id = checklist_items.room_id
      and r.property_id = public.current_user_property_id()
  ));

-- -----------------------------------------------------------------------------
-- Findings and Photos table rows
-- Admins manage. Customers can read only their own.
-- -----------------------------------------------------------------------------

create policy "Findings: admins manage all"
  on public.findings
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Findings: customers read own"
  on public.findings
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create policy "Photos: admins manage all"
  on public.photos
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Photos: customers read own"
  on public.photos
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

-- -----------------------------------------------------------------------------
-- Requests
-- Admins manage all. Customers can read their own requests.
-- Customers create requests through public.create_customer_request RPC.
-- -----------------------------------------------------------------------------

create policy "Requests: admins manage all"
  on public.requests
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Requests: customers read own"
  on public.requests
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

-- Keep direct customer insert/update/delete closed. The secure RPC handles inserts.

-- -----------------------------------------------------------------------------
-- Invoices
-- Admins manage all. Customers can read their own invoices only.
-- -----------------------------------------------------------------------------

create policy "Invoices: admins manage all"
  on public.invoices
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Invoices: customers read own"
  on public.invoices
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

-- -----------------------------------------------------------------------------
-- Report Logs
-- Admins manage all. Customers can read their own PUBLISHED reports only.
-- Current app stores draft/private status in notes using [Internal Draft].
-- Existing older reports without this marker remain visible.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'report_logs') then
    create policy "Report logs: admins manage all"
      on public.report_logs
      for all
      to authenticated
      using (public.current_user_is_admin())
      with check (public.current_user_is_admin());

    create policy "Report logs: customers read own published"
      on public.report_logs
      for select
      to authenticated
      using (
        property_id = public.current_user_property_id()
        and coalesce(notes, '') not like '%[Internal Draft]%'
      );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Secure customer request RPC. Re-create in case it has not been installed yet.
-- -----------------------------------------------------------------------------

create or replace function public.create_customer_request(
  p_id uuid,
  p_property_id uuid,
  p_customer_name text,
  p_category text,
  p_room text,
  p_description text,
  p_priority text,
  p_photo_url text default null,
  p_status text default 'Pending',
  p_contractor_notes text default '',
  p_read boolean default false
)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_request public.requests;
begin
  select property_id
    into v_property_id
    from public.profiles
   where id = auth.uid();

  if v_property_id is null then
    raise exception 'No customer property is linked to this account.';
  end if;

  if p_property_id <> v_property_id then
    raise exception 'You can only submit requests for your own property.';
  end if;

  insert into public.requests (
    id,
    property_id,
    customer_name,
    category,
    room,
    description,
    priority,
    photo_url,
    status,
    contractor_notes,
    read
  ) values (
    p_id,
    p_property_id,
    coalesce(p_customer_name, ''),
    coalesce(p_category, 'Other'),
    coalesce(p_room, ''),
    coalesce(p_description, ''),
    coalesce(p_priority, 'Medium'),
    p_photo_url,
    coalesce(p_status, 'Pending'),
    coalesce(p_contractor_notes, ''),
    coalesce(p_read, false)
  )
  returning * into v_request;

  return v_request;
end;
$$;

grant execute on function public.create_customer_request(
  uuid, uuid, text, text, text, text, text, text, text, text, boolean
) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage policies for request photos.
-- Note: your photos/reports buckets may still be public for existing image/PDF URLs.
-- This locks authenticated Storage operations, but making buckets private requires app
-- changes to use signed URLs. Do that as a later privacy hardening step.
-- -----------------------------------------------------------------------------

drop policy if exists "Customers can upload own request photos" on storage.objects;
drop policy if exists "Customers can read own request photos" on storage.objects;
drop policy if exists "Allow all report PDF storage" on storage.objects;
drop policy if exists "Storage: admins manage photos" on storage.objects;
drop policy if exists "Storage: admins manage reports" on storage.objects;
drop policy if exists "Storage: customers upload own request photos" on storage.objects;
drop policy if exists "Storage: customers read own request photos" on storage.objects;

create policy "Storage: admins manage photos"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'photos' and public.current_user_is_admin())
  with check (bucket_id = 'photos' and public.current_user_is_admin());

create policy "Storage: admins manage reports"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'reports' and public.current_user_is_admin())
  with check (bucket_id = 'reports' and public.current_user_is_admin());

create policy "Storage: customers upload own request photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'customer-requests'
    and (storage.foldername(name))[2] = public.current_user_property_id()::text
  );

create policy "Storage: customers read own request photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'customer-requests'
    and (storage.foldername(name))[2] = public.current_user_property_id()::text
  );

-- -----------------------------------------------------------------------------
-- Helpful indexes for RLS lookups.
-- -----------------------------------------------------------------------------

create index if not exists profiles_property_id_idx on public.profiles(property_id);
create index if not exists vendors_property_id_idx on public.vendors(property_id);
create index if not exists rooms_property_id_idx on public.rooms(property_id);
create index if not exists findings_property_id_idx on public.findings(property_id);
create index if not exists photos_property_id_idx on public.photos(property_id);
create index if not exists requests_property_id_idx on public.requests(property_id);
create index if not exists invoices_property_id_idx on public.invoices(property_id);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'report_logs') then
    create index if not exists report_logs_property_created_idx
      on public.report_logs(property_id, created_at desc);
  end if;
end $$;

notify pgrst, 'reload schema';
