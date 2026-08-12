create extension if not exists pgcrypto;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.contractor_profiles (
  id uuid primary key,
  owner_user_id uuid not null
);
create table public.contractor_team_members (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  user_id uuid not null,
  status text not null,
  role text not null
);

create or replace function public.current_user_is_platform_admin()
returns boolean language sql stable as $$ select false $$;
create or replace function public.current_user_can_access_contractor(p_contractor_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.contractor_profiles where id = p_contractor_id and owner_user_id = auth.uid())
$$;
create or replace function public.current_user_can_manage_contractor_estimate_settings(p_contractor_id uuid)
returns boolean language sql stable as $$ select public.current_user_can_access_contractor(p_contractor_id) $$;
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.contractor_saved_estimate_charges (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  name text not null,
  description text not null default '',
  line_type text not null,
  charge_type text not null,
  amount_cents integer,
  default_quantity numeric(12,2) not null,
  unit text,
  active boolean not null,
  sort_order integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create trigger contractor_saved_estimate_charges_touch_updated_at before update
on public.contractor_saved_estimate_charges for each row execute function public.touch_updated_at();
alter table public.contractor_saved_estimate_charges enable row level security;
create policy "Saved estimate charges: contractor account reads" on public.contractor_saved_estimate_charges for select to authenticated using (true);
create policy "Saved estimate charges: estimate settings managers create" on public.contractor_saved_estimate_charges for insert to authenticated with check (true);
create policy "Saved estimate charges: estimate settings managers update" on public.contractor_saved_estimate_charges for update to authenticated using (true);
create policy "Saved estimate charges: estimate settings managers delete" on public.contractor_saved_estimate_charges for delete to authenticated using (true);
grant select, insert, update, delete on public.contractor_saved_estimate_charges to authenticated;

create table public.contractor_price_book_items (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  title text not null,
  customer_description text not null default '',
  internal_notes text not null default '',
  trade text not null default '',
  category text not null default '',
  subcategory text,
  line_type text not null,
  unit text,
  default_unit_price_cents integer,
  taxable boolean not null default true,
  labor_hours numeric(8,2),
  sku text,
  source text,
  active boolean not null,
  archived_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
alter table public.contractor_price_book_items enable row level security;
create policy price_book_read on public.contractor_price_book_items for select to authenticated using (true);
grant select, insert, update on public.contractor_price_book_items to authenticated;

create table public.estimates (id uuid primary key, payload jsonb not null);
create table public.invoices (id uuid primary key, payload jsonb not null);
