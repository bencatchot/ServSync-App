create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table public.profiles (
  id uuid primary key,
  full_name text not null default ''
);

create table public.contractor_profiles (
  id uuid primary key,
  owner_user_id uuid not null references public.profiles(id)
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
  home_id uuid,
  local_contact_id uuid,
  local_home_id uuid,
  service_request_id uuid,
  inspection_id uuid,
  title text not null default '',
  scope text not null default '',
  notes text not null default '',
  terms text not null default '',
  status text not null default 'draft',
  total_cents integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  homeowner_user_id uuid references public.profiles(id),
  home_id uuid,
  local_contact_id uuid,
  local_home_id uuid,
  service_request_id uuid,
  job_id uuid,
  estimate_id uuid references public.estimates(id),
  invoice_type text not null default 'total',
  invoice_sequence integer,
  invoice_number text not null default '',
  title text not null default '',
  scope text not null default '',
  notes text not null default '',
  terms text not null default '',
  status text not null default 'draft',
  subtotal_cents integer not null default 0,
  material_total_cents integer not null default 0,
  labor_total_cents integer not null default 0,
  fee_total_cents integer not null default 0,
  other_total_cents integer not null default 0,
  tax_cents integer not null default 0,
  discount_cents integer not null default 0,
  total_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  line_type text not null,
  description text not null,
  line_title text,
  customer_description text,
  quantity numeric(12,2) not null,
  unit text not null,
  unit_price_cents integer not null,
  sort_order integer not null
);

create table public.estimate_payment_schedule_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  invoice_type text not null,
  label text not null default '',
  amount_type text not null,
  amount_value numeric(12,2) not null,
  calculated_amount_cents integer not null default 0,
  due_trigger text not null default '',
  sort_order integer not null default 0,
  linked_invoice_id uuid references public.invoices(id) on delete set null
);

create table public.workflow_activity_events (
  id uuid primary key default gen_random_uuid(),
  context_type text not null,
  event_type text not null,
  service_request_id uuid,
  inspection_id uuid,
  estimate_id uuid,
  invoice_id uuid,
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.current_user_can_manage_contractor_billing(p_contractor_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.contractor_profiles contractor
     where contractor.id = p_contractor_id and contractor.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.contractor_team_members member
     where member.contractor_id = p_contractor_id
       and member.user_id = auth.uid()
       and member.status = 'active'
       and member.role in ('admin', 'office')
  )
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
) returns public.workflow_activity_events language plpgsql security definer set search_path = public as $$
declare
  result public.workflow_activity_events;
begin
  insert into public.workflow_activity_events (
    context_type, event_type, service_request_id, inspection_id, estimate_id, invoice_id, actor_user_id, metadata
  ) values (
    p_context_type, p_event_type, p_service_request_id, p_inspection_id, p_estimate_id, p_invoice_id, p_actor_user_id, p_metadata
  ) returning * into result;
  return result;
end;
$$;

create function public.servsync_create_invoice_from_estimate_schedule_item(uuid)
returns jsonb language sql security definer set search_path = public as $$ select '{}'::jsonb $$;
create function public.servsync_mark_invoice_paid(uuid)
returns jsonb language sql security definer set search_path = public as $$ select '{}'::jsonb $$;
create function public.servsync_void_invoice(uuid)
returns jsonb language sql security definer set search_path = public as $$ select '{}'::jsonb $$;
create function public.servsync_create_job_from_estimate(uuid)
returns jsonb language sql security definer set search_path = public as $$ select '{"job_allowed":true}'::jsonb $$;

alter function public.current_user_can_manage_contractor_billing(uuid) owner to postgres;
alter function public.servsync_append_workflow_activity_event(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb) owner to postgres;
alter function public.servsync_create_invoice_from_estimate_schedule_item(uuid) owner to postgres;
alter function public.servsync_mark_invoice_paid(uuid) owner to postgres;
alter function public.servsync_void_invoice(uuid) owner to postgres;
alter function public.servsync_create_job_from_estimate(uuid) owner to postgres;

revoke all on all tables in schema public from public, anon, authenticated, service_role;
revoke all on all functions in schema public from public, anon, authenticated, service_role;
grant execute on function auth.uid() to authenticated;
grant execute on function public.current_user_can_manage_contractor_billing(uuid) to authenticated;
grant execute on function public.servsync_create_invoice_from_estimate_schedule_item(uuid) to authenticated;
grant execute on function public.servsync_mark_invoice_paid(uuid) to authenticated;
grant execute on function public.servsync_void_invoice(uuid) to authenticated;
grant execute on function public.servsync_create_job_from_estimate(uuid) to authenticated;
