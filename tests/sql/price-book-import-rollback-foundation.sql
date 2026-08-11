create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table auth.users (id uuid primary key, email text);

create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.profiles (
  id uuid primary key references auth.users(id),
  app_role text not null default 'homeowner'
);

create table public.contractor_profiles (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id),
  account_status text not null default 'active'
);

create table public.contractor_team_members (
  contractor_id uuid not null references public.contractor_profiles(id),
  user_id uuid not null references auth.users(id),
  role text not null,
  status text not null default 'active',
  primary key (contractor_id, user_id)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;

create or replace function public.current_user_is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select false $$;

create or replace function public.current_user_can_manage_contractor_estimate_settings(p_contractor_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.contractor_profiles cp
     where cp.id = p_contractor_id and cp.owner_user_id = auth.uid() and cp.account_status = 'active'
  ) or exists (
    select 1 from public.contractor_team_members tm
    join public.contractor_profiles cp on cp.id = tm.contractor_id
     where tm.contractor_id = p_contractor_id and tm.user_id = auth.uid()
       and tm.status = 'active' and tm.role in ('admin', 'office') and cp.account_status = 'active'
  );
$$;

create or replace function public.servsync_current_contractor_profile()
returns table (id uuid)
language sql stable security definer set search_path = public
as $$
  select cp.id from public.contractor_profiles cp
   where cp.owner_user_id = auth.uid() and cp.account_status = 'active'
  union all
  select cp.id from public.contractor_team_members tm
  join public.contractor_profiles cp on cp.id = tm.contractor_id
   where tm.user_id = auth.uid() and tm.status = 'active' and cp.account_status = 'active'
  order by id limit 1
$$;

create table public.contractor_price_book_items (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  title text not null,
  customer_description text not null default '',
  internal_notes text not null default '',
  trade text not null default '',
  category text not null default '',
  subcategory text,
  line_type text not null default 'other' check (line_type in ('labor', 'material', 'fee', 'other')),
  unit text,
  default_unit_price_cents integer,
  taxable boolean not null default true,
  labor_hours numeric(8,2),
  sku text,
  source text,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger contractor_price_book_items_touch_updated_at before update on public.contractor_price_book_items
for each row execute function public.touch_updated_at();

create table public.external_object_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_account_id text not null,
  provider_object_type text not null,
  provider_object_id text not null,
  servsync_entity_type text not null,
  servsync_entity_id uuid not null,
  contractor_id uuid references public.contractor_profiles(id) on delete cascade,
  mapping_status text not null default 'active',
  sync_direction text not null default 'linked',
  last_synced_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_account_id, provider_object_type, provider_object_id),
  unique (provider, provider_account_id, servsync_entity_type, servsync_entity_id, provider_object_type)
);

create table public.estimate_line_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_price_book_item_id uuid,
  title text not null,
  unit_price_cents integer
);

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'owner@test.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'admin@test.invalid'),
  ('10000000-0000-0000-0000-000000000003', 'office@test.invalid'),
  ('10000000-0000-0000-0000-000000000004', 'field@test.invalid'),
  ('10000000-0000-0000-0000-000000000005', 'viewer@test.invalid'),
  ('10000000-0000-0000-0000-000000000006', 'inactive@test.invalid'),
  ('10000000-0000-0000-0000-000000000007', 'homeowner@test.invalid'),
  ('10000000-0000-0000-0000-000000000008', 'other-owner@test.invalid');

insert into public.profiles (id, app_role)
select id, case when email = 'homeowner@test.invalid' then 'homeowner' else 'contractor' end from auth.users;

insert into public.contractor_profiles (id, owner_user_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000008');

insert into public.contractor_team_members (contractor_id, user_id, role, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'office', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'field_technician', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'viewer', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'office', 'inactive');

grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function public.servsync_current_contractor_profile() to authenticated;
grant execute on function public.current_user_can_manage_contractor_estimate_settings(uuid) to authenticated;

create or replace function public.test_assert(p_condition boolean, p_message text)
returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception '%', p_message; end if; end $$;

create or replace function public.test_expect_rollback_conflict(p_batch_id uuid)
returns void language plpgsql
as $$
begin
  begin
    perform public.servsync_execute_price_book_import_rollback(p_batch_id, gen_random_uuid());
    raise exception 'Expected conflicted rollback denial.';
  exception when others then
    if sqlerrm not like '%rollback has conflicts%' then raise; end if;
  end;
end;
$$;

create or replace function public.test_expect_rollback_denied(p_batch_id uuid, p_user_id uuid)
returns void language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  begin
    perform public.servsync_preview_price_book_import_rollback(p_batch_id);
    raise exception 'Expected unauthorized rollback preview denial.';
  exception when others then
    if sqlerrm not like '%management is unavailable%' and sqlerrm not like '%batch is unavailable%' then raise; end if;
  end;
end;
$$;
