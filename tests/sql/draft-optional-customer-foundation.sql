create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'postgres') then create role postgres superuser; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end;
$$;

-- Supabase projects grant Data API roles access to new public objects through
-- postgres default ACLs. Individual migrations must narrow these grants.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

create schema if not exists auth;
create table auth.users (id uuid primary key);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.contractor_profiles (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id)
);

create table public.contractor_team_members (
  contractor_id uuid not null references public.contractor_profiles(id),
  user_id uuid not null references auth.users(id),
  role text not null,
  status text not null,
  primary key (contractor_id, user_id)
);

create table public.contractor_local_contacts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  homeowner_user_id uuid references auth.users(id),
  display_name text not null,
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contractor_local_homes (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  local_contact_id uuid not null references public.contractor_local_contacts(id),
  home_id uuid,
  claimed_at timestamptz,
  nickname text not null default '',
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

create table public.contractor_local_customer_claim_invites (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null,
  local_contact_id uuid not null,
  local_home_id uuid,
  status text not null default 'pending',
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.contractor_local_customer_claim_invite_homes (
  claim_invite_id uuid not null references public.contractor_local_customer_claim_invites(id),
  contractor_id uuid not null,
  local_contact_id uuid not null,
  local_home_id uuid not null
);

create table public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null,
  local_contact_id uuid,
  local_home_id uuid
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null,
  local_contact_id uuid,
  local_home_id uuid,
  estimate_id uuid,
  job_type text,
  job_status text,
  created_at timestamptz not null default now()
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null,
  local_contact_id uuid,
  local_home_id uuid,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null,
  local_contact_id uuid,
  local_home_id uuid,
  job_id uuid,
  estimate_id uuid,
  status text,
  created_at timestamptz not null default now()
);

create table public.contractor_visit_events (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null,
  inspection_id uuid not null,
  local_contact_id uuid
);

create table public.contractor_calendar_events (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null,
  local_contact_id uuid,
  starts_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.contractor_calendar_event_job_links (
  contractor_id uuid not null,
  calendar_event_id uuid not null,
  inspection_id uuid not null
);

create or replace function public.servsync_current_contractor_profile()
returns setof public.contractor_profiles
language sql
stable
security definer
set search_path = public
as $$
  select contractor.*
    from public.contractor_profiles contractor
   where contractor.owner_user_id = auth.uid()
      or exists (
        select 1
          from public.contractor_team_members member
         where member.contractor_id = contractor.id
           and member.user_id = auth.uid()
           and member.status = 'active'
      );
$$;

create or replace function public.current_user_can_manage_contractor_customers(p_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.contractor_profiles contractor
     where contractor.id = p_contractor_id and contractor.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.contractor_team_members member
     where member.contractor_id = p_contractor_id
       and member.user_id = auth.uid()
       and member.status = 'active'
       and member.role in ('admin', 'office')
  );
$$;

create or replace function public.current_user_can_access_contractor(p_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.contractor_profiles contractor
     where contractor.id = p_contractor_id
       and contractor.owner_user_id = auth.uid()
  ) or exists (
    select 1
      from public.contractor_team_members member
     where member.contractor_id = p_contractor_id
       and member.user_id = auth.uid()
       and member.status = 'active'
  );
$$;

create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

create function public.servsync_update_local_contact_profile(uuid, text, text, text, text)
returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.servsync_create_local_home(uuid, text, text, text, text, text, text, text)
returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.servsync_update_local_home(uuid, text, text, text, text, text, text, text)
returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.servsync_create_local_contact(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
)
returns jsonb language sql as $$ select '{}'::jsonb $$;

create function public.servsync_list_local_customer_claim_invites_v2(uuid)
returns jsonb language sql as $$ select '[]'::jsonb $$;
create function public.servsync_create_local_customer_claim_invite_v2(uuid, uuid[], integer)
returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.servsync_lookup_local_customer_claim(text)
returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.servsync_prepare_local_customer_claim_invite_delivery(uuid)
returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.servsync_accept_local_customer_claim_v2(text, jsonb, jsonb)
returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.servsync_decline_local_customer_claim(text)
returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.servsync_revoke_local_customer_claim_invite(uuid)
returns jsonb language sql as $$ select '{}'::jsonb $$;

grant select, insert, update, delete on public.contractor_local_contacts to service_role;
grant select, insert, update, delete on public.contractor_local_homes to service_role;

insert into auth.users(id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000006'),
  ('10000000-0000-0000-0000-000000000007'),
  ('10000000-0000-0000-0000-000000000008');

insert into public.contractor_profiles(id, owner_user_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000007');

insert into public.contractor_team_members(contractor_id, user_id, role, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'office', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'field_tech', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'viewer', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'admin', 'inactive'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000008', 'office', 'removed');

insert into public.contractor_local_contacts(id, contractor_id, display_name)
values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Compatibility Customer');
insert into public.contractor_local_contacts(id, contractor_id, display_name, phone, email, notes) values
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'No Work Customer',
    '555-0002',
    'private@example.invalid',
    'private note'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000002',
    'Foreign Customer',
    '555-0003',
    'foreign@example.invalid',
    'foreign note'
  );
insert into public.contractor_local_homes(id, contractor_id, local_contact_id, nickname, address_line1)
values (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Main',
  '1 Compatibility Way'
);
insert into public.contractor_local_homes(id, contractor_id, local_contact_id, nickname, address_line1) values
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    'No Work',
    '2 Compatibility Way'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000003',
    'Foreign',
    '3 Compatibility Way'
  );

insert into public.inspections(id, contractor_id, local_contact_id, local_home_id, job_type, job_status)
values (
  '70000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'Compatibility Job',
  'scheduled'
);
insert into public.contractor_local_customer_claim_invites(
  id, contractor_id, local_contact_id, local_home_id, status
) values (
  '60000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'pending'
);
insert into public.contractor_local_customer_claim_invite_homes(
  claim_invite_id, contractor_id, local_contact_id, local_home_id
) values (
  '60000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

alter table public.contractor_local_contacts owner to postgres;
alter table public.contractor_local_homes owner to postgres;
alter table public.contractor_local_contacts enable row level security;
alter table public.contractor_local_homes enable row level security;
