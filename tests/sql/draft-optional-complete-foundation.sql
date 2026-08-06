-- Non-Draft dependencies required to install the repository's canonical
-- Durable Draft migration chain in disposable PostgreSQL. Draft relations,
-- constraints, policies, functions, and grants are created only by the real
-- migrations included at the end of this file.

create table public.profiles (
  id uuid primary key references auth.users(id),
  full_name text,
  email text
);

create table public.homes (
  id uuid primary key default gen_random_uuid(),
  homeowner_user_id uuid not null references public.profiles(id),
  nickname text not null default '',
  address_line1 text not null default '',
  city text not null default '',
  state text not null default ''
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references public.contractor_profiles(id),
  homeowner_user_id uuid not null references public.profiles(id),
  home_id uuid references public.homes(id)
);

create table public.homeowner_contractor_connections (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  homeowner_user_id uuid not null references public.profiles(id),
  status text not null default 'active'
);

create table public.connection_shared_properties (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.homeowner_contractor_connections(id),
  home_id uuid not null references public.homes(id)
);

create table public.contractor_billing_accounts (
  contractor_id uuid primary key references public.contractor_profiles(id)
);

alter table public.inspection_templates
  add column homeowner_user_id uuid references public.profiles(id),
  add column home_id uuid references public.homes(id),
  add column scope text not null default '',
  add column rooms jsonb not null default '[]'::jsonb,
  add column updated_at timestamptz not null default now();

alter table public.inspections
  add column homeowner_user_id uuid references public.profiles(id),
  add column home_id uuid references public.homes(id),
  add column service_request_id uuid references public.service_requests(id),
  add column template_id uuid references public.inspection_templates(id),
  add column name text not null default '',
  add column summary text not null default '',
  add column status text not null default 'draft',
  add column job_origin text not null default 'direct',
  add column rooms_with_findings jsonb not null default '[]'::jsonb,
  add column draft_created_by uuid references public.profiles(id);

alter table public.estimates
  add column homeowner_user_id uuid references public.profiles(id),
  add column home_id uuid references public.homes(id),
  add column service_request_id uuid references public.service_requests(id),
  add column inspection_id uuid references public.inspections(id),
  add column title text not null default '',
  add column scope text not null default '',
  add column notes text not null default '',
  add column terms text not null default '',
  add column status text not null default 'draft',
  add column subtotal_cents integer not null default 0,
  add column total_cents integer not null default 0,
  add column labor_mode text,
  add column labor_rate_cents integer,
  add column job_labor_hours numeric,
  add column material_total_cents integer not null default 0,
  add column labor_total_cents integer not null default 0,
  add column fee_total_cents integer not null default 0,
  add column other_total_cents integer not null default 0,
  add column tax_rate_percent numeric,
  add column tax_cents integer not null default 0;

create table public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id),
  line_type text not null,
  description text not null default '',
  line_title text,
  customer_description text,
  quantity numeric not null default 1,
  unit text not null default 'each',
  unit_price_cents integer,
  labor_hours numeric,
  sort_order integer not null default 0
);

alter table public.invoices
  add column homeowner_user_id uuid references public.profiles(id),
  add column home_id uuid references public.homes(id),
  add column service_request_id uuid references public.service_requests(id),
  add column title text not null default '',
  add column scope text not null default '',
  add column notes text not null default '',
  add column terms text not null default '',
  add column invoice_type text not null default 'total',
  add column labor_mode text,
  add column labor_rate_cents integer,
  add column job_labor_hours numeric,
  add column material_total_cents integer not null default 0,
  add column labor_total_cents integer not null default 0,
  add column fee_total_cents integer not null default 0,
  add column other_total_cents integer not null default 0,
  add column subtotal_cents integer not null default 0,
  add column tax_rate_percent numeric not null default 0,
  add column tax_cents integer not null default 0,
  add column discount_cents integer not null default 0,
  add column discount_type text not null default 'amount',
  add column discount_value numeric not null default 0,
  add column discount_reason text not null default '',
  add column total_cents integer not null default 0,
  add column amount_paid_cents integer not null default 0;

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id),
  line_type text not null,
  description text not null default '',
  line_title text,
  customer_description text,
  labor_hours numeric,
  quantity numeric not null default 1,
  unit text not null default 'each',
  unit_price_cents integer not null default 0,
  sort_order integer not null default 0
);

create table public.job_work_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id),
  contractor_id uuid not null references public.contractor_profiles(id),
  source_type text not null,
  source_key text not null,
  title text not null,
  description text not null default '',
  customer_description text not null default '',
  internal_notes text not null default '',
  line_type text not null,
  quantity numeric not null default 1,
  unit text not null default 'each',
  unit_price_cents integer,
  labor_hours numeric,
  billable boolean not null default true,
  completion_status text not null default 'not_started',
  billing_status text not null default 'unbilled',
  work_state text not null default 'planned',
  approval_required boolean not null default false,
  approval_status text not null default 'not_required',
  room_id text,
  room_label text,
  location_label text,
  sort_order integer not null default 0
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.current_user_can_manage_contractor_billing(p_contractor_id uuid)
returns boolean language sql stable as $$
  select public.current_user_can_manage_contractor_customers(p_contractor_id);
$$;

create or replace function public.current_user_can_write_contractor_jobs(p_contractor_id uuid)
returns boolean language sql stable as $$
  select public.current_user_can_access_contractor(p_contractor_id);
$$;

-- Existing Supabase projects canonically grant Data API roles access to new
-- public objects through postgres default ACLs. The real Draft migrations below
-- revoke PUBLIC/anon, narrow authenticated tables to SELECT, and retain trusted
-- service_role CRUD/EXECUTE without grant options.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

set role postgres;
\ir ../../servsync-durable-draft-launch-foundation.sql
\ir ../../servsync-durable-draft-inspection-checklist-path.sql
\ir ../../servsync-durable-draft-cohort-entitlement.sql
\ir ../../servsync-durable-draft-invoice-launch-foundation.sql
reset role;
