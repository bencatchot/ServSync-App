create extension if not exists pgcrypto;
create schema if not exists auth;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

grant usage on schema public, auth to anon, authenticated, service_role;

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.profiles (
  id uuid primary key,
  full_name text not null default '',
  role text not null default 'homeowner'
);

create table public.contractor_profiles (
  id uuid primary key,
  owner_user_id uuid not null references public.profiles(id),
  account_status text not null default 'active'
);

create table public.contractor_team_members (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  user_id uuid not null references public.profiles(id),
  role text not null,
  status text not null
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  homeowner_user_id uuid references public.profiles(id),
  local_contact_id uuid,
  local_home_id uuid,
  service_request_id uuid,
  inspection_id uuid,
  title text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  description text not null default ''
);

create table public.estimate_payment_schedule_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  label text not null default ''
);

create table public.contractor_work_draft_launches (
  id uuid primary key default gen_random_uuid(),
  requested_by_user_id uuid references public.profiles(id),
  launched_estimate_id uuid references public.estimates(id),
  launched_estimate_id_snapshot uuid,
  created_at timestamptz not null default now()
);

create table public.local_estimate_delivery_links (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.homeowner_contractor_connections (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  homeowner_user_id uuid not null references public.profiles(id),
  status text not null
);

create table public.workflow_activity_events (
  id uuid primary key default gen_random_uuid(),
  context_type text not null,
  service_request_id uuid,
  inspection_id uuid,
  estimate_id uuid references public.estimates(id),
  invoice_id uuid,
  appointment_id uuid,
  contractor_id uuid not null references public.contractor_profiles(id),
  homeowner_user_id uuid references public.profiles(id),
  event_type text not null,
  actor_user_id uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function public.current_user_is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles profile
     where profile.id = auth.uid() and profile.role = 'platform_admin'
  );
$$;

create function public.servsync_current_contractor_profile()
returns table (id uuid, account_status text)
language sql
security definer
set search_path = public
stable
as $$
  select contractor.id, contractor.account_status
    from public.contractor_profiles contractor
   where contractor.owner_user_id = auth.uid()
  union all
  select contractor.id, contractor.account_status
    from public.contractor_team_members member
    join public.contractor_profiles contractor on contractor.id = member.contractor_id
   where member.user_id = auth.uid() and member.status = 'active'
  limit 1;
$$;

create function public.servsync_append_workflow_activity_event(
  p_context_type text,
  p_event_type text,
  p_service_request_id uuid default null,
  p_inspection_id uuid default null,
  p_estimate_id uuid default null,
  p_invoice_id uuid default null,
  p_appointment_id uuid default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.workflow_activity_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.workflow_activity_events;
begin
  insert into public.workflow_activity_events (
    context_type, service_request_id, inspection_id, estimate_id, invoice_id,
    appointment_id, contractor_id, homeowner_user_id, event_type,
    actor_user_id, metadata
  )
  select p_context_type, p_service_request_id, p_inspection_id, p_estimate_id,
         p_invoice_id, p_appointment_id, estimate.contractor_id,
         estimate.homeowner_user_id, p_event_type, p_actor_user_id,
         coalesce(p_metadata, '{}'::jsonb)
    from public.estimates estimate
   where estimate.id = p_estimate_id
  returning * into v_event;
  return v_event;
end;
$$;

create function public.servsync_private_can_create_work_draft_estimate(uuid)
returns boolean language sql as $$ select false $$;
create function public.servsync_private_can_manage_local_estimate_delivery(uuid)
returns boolean language sql as $$ select false $$;

alter table public.estimates enable row level security;
alter table public.estimate_line_items enable row level security;
alter table public.estimate_payment_schedule_items enable row level security;

create policy "Estimates: contractor manages own"
  on public.estimates for all to authenticated using (false) with check (false);
create policy "Estimates: contractor team reads"
  on public.estimates for select to authenticated using (true);
create policy "Estimate lines: contractor manages own"
  on public.estimate_line_items for all to authenticated using (false) with check (false);
create policy "Estimate lines: contractor team reads"
  on public.estimate_line_items for select to authenticated using (true);
create policy "Estimate payment schedule: contractor team reads"
  on public.estimate_payment_schedule_items for select to authenticated using (true);
create policy "Estimate payment schedule: billing team creates draft schedule"
  on public.estimate_payment_schedule_items for insert to authenticated with check (false);
create policy "Estimate payment schedule: billing team updates draft schedule"
  on public.estimate_payment_schedule_items for update to authenticated using (false) with check (false);
create policy "Estimate payment schedule: billing team deletes draft schedule"
  on public.estimate_payment_schedule_items for delete to authenticated using (false);

grant select, insert, update, delete on public.estimates, public.estimate_line_items,
  public.estimate_payment_schedule_items to authenticated;

insert into public.profiles (id, full_name, role) values
  ('10000000-0000-0000-0000-000000000001', 'Owner One', 'contractor'),
  ('10000000-0000-0000-0000-000000000002', 'Admin One', 'contractor'),
  ('10000000-0000-0000-0000-000000000003', 'Office One', 'contractor'),
  ('10000000-0000-0000-0000-000000000004', 'Field One', 'contractor'),
  ('10000000-0000-0000-0000-000000000005', 'Viewer One', 'contractor'),
  ('10000000-0000-0000-0000-000000000006', 'Inactive Admin', 'contractor'),
  ('10000000-0000-0000-0000-000000000007', 'Other Admin', 'contractor'),
  ('10000000-0000-0000-0000-000000000008', 'Platform Admin', 'platform_admin'),
  ('10000000-0000-0000-0000-000000000009', 'Homeowner One', 'homeowner'),
  ('10000000-0000-0000-0000-000000000010', 'Other Owner', 'contractor'),
  ('10000000-0000-0000-0000-000000000011', 'Inactive Owner', 'contractor');

insert into public.contractor_profiles (id, owner_user_id, account_status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000010', 'active'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000011', 'inactive');

insert into public.contractor_team_members (contractor_id, user_id, role, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'office', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'field_tech', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'viewer', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'admin', 'disabled'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000007', 'admin', 'active');

insert into public.homeowner_contractor_connections (contractor_id, homeowner_user_id, status)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000009', 'active');

insert into public.estimates (id, contractor_id, homeowner_user_id, title, status)
values (
  '30000000-0000-0000-0000-000000000099',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000009',
  'Historical estimate',
  'sent'
);
