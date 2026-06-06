-- ServSync homeowner-owned data foundation.
-- Paste this into Supabase SQL Editor after the tenant foundation.
-- Safe to re-run.
--
-- Goal:
-- - Homeowners can own their home record independently of a contractor.
-- - Contractors receive explicit, revocable access through connections.
-- - Sharing is permission-based and auditable.
-- - Referrals track only new account creation paths.

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- Homeowner identity and owned home records
-- --------------------------------------------------------------------------

create table if not exists public.homeowner_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text not null default '',
  default_property_id uuid references public.properties(id) on delete set null,
  referral_code text unique,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homeowner_accounts
  add column if not exists display_name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists default_property_id uuid references public.properties(id) on delete set null,
  add column if not exists referral_code text unique,
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.properties
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists homeowner_visible boolean not null default true;

update public.properties p
   set owner_user_id = pr.id
  from public.profiles pr
 where pr.property_id = p.id
   and pr.role = 'customer'
   and p.owner_user_id is null;

insert into public.homeowner_accounts (user_id, display_name, default_property_id)
select pr.id, coalesce(pr.full_name, ''), pr.property_id
  from public.profiles pr
 where pr.role = 'customer'
   and pr.property_id is not null
on conflict (user_id) do update
set display_name = coalesce(nullif(public.homeowner_accounts.display_name, ''), excluded.display_name),
    default_property_id = coalesce(public.homeowner_accounts.default_property_id, excluded.default_property_id);

create index if not exists properties_owner_user_id_idx on public.properties(owner_user_id);
create index if not exists homeowner_accounts_default_property_idx on public.homeowner_accounts(default_property_id);

-- --------------------------------------------------------------------------
-- Contractor referral codes and new-account referral tracking
-- --------------------------------------------------------------------------

create table if not exists public.contractor_referral_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  label text not null default 'Default referral code',
  is_active boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contractor_referral_codes_org_idx
  on public.contractor_referral_codes(organization_id);

create table if not exists public.account_referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code text,
  referrer_type text not null check (referrer_type in ('contractor', 'homeowner', 'servsync')),
  referrer_user_id uuid references auth.users(id) on delete set null,
  referrer_organization_id uuid references public.organizations(id) on delete set null,
  referred_account_type text not null check (referred_account_type in ('homeowner', 'contractor')),
  referred_user_id uuid references auth.users(id) on delete set null,
  referred_organization_id uuid references public.organizations(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'qualified', 'rewarded', 'void')),
  reward_note text not null default '',
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz
);

create index if not exists account_referrals_referral_code_idx on public.account_referrals(referral_code);
create index if not exists account_referrals_referred_user_idx on public.account_referrals(referred_user_id);
create index if not exists account_referrals_referrer_org_idx on public.account_referrals(referrer_organization_id);

-- --------------------------------------------------------------------------
-- Consent-based contractor/home connections
-- --------------------------------------------------------------------------

create table if not exists public.home_contractor_connections (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  homeowner_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'revoked')),
  source text not null default 'contractor_invite' check (source in ('direct_request', 'contractor_invite', 'homeowner_search', 'admin_created')),
  referral_code text,
  permissions jsonb not null default jsonb_build_object(
    'basic_profile', true,
    'property_details', false,
    'vendors', false,
    'maintenance', false,
    'service_requests', false,
    'reports', false,
    'photos', false,
    'appointments', false,
    'invoices', false
  ),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  revoked_at timestamptz,
  unique (property_id, organization_id)
);

create index if not exists home_contractor_connections_property_idx
  on public.home_contractor_connections(property_id);

create index if not exists home_contractor_connections_homeowner_idx
  on public.home_contractor_connections(homeowner_user_id);

create index if not exists home_contractor_connections_org_idx
  on public.home_contractor_connections(organization_id);

create index if not exists home_contractor_connections_status_idx
  on public.home_contractor_connections(status);

-- --------------------------------------------------------------------------
-- Access audit trail
-- --------------------------------------------------------------------------

create table if not exists public.property_access_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  property_id uuid references public.properties(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  event_type text not null,
  permission_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists property_access_audit_property_idx
  on public.property_access_audit_events(property_id, created_at desc);

create index if not exists property_access_audit_org_idx
  on public.property_access_audit_events(organization_id, created_at desc);

-- --------------------------------------------------------------------------
-- Security helpers
-- --------------------------------------------------------------------------

create or replace function public.current_user_owns_property(p_property_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
        from public.properties p
       where p.id = p_property_id
         and p.owner_user_id = auth.uid()
    )
    or exists (
      select 1
        from public.profiles pr
       where pr.id = auth.uid()
         and pr.property_id = p_property_id
    ),
    false
  );
$$;

create or replace function public.current_user_has_property_access(
  p_property_id uuid,
  p_permission_key text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.current_user_is_platform_admin()
    or public.current_user_owns_property(p_property_id)
    or exists (
      select 1
        from public.home_contractor_connections hcc
        join public.organization_members om
          on om.organization_id = hcc.organization_id
         and om.user_id = auth.uid()
       where hcc.property_id = p_property_id
         and hcc.status = 'active'
         and coalesce((hcc.permissions ->> p_permission_key)::boolean, false) = true
    ),
    false
  );
$$;

create or replace function public.current_user_can_manage_connection(p_connection_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.current_user_is_platform_admin()
    or exists (
      select 1
        from public.home_contractor_connections hcc
       where hcc.id = p_connection_id
         and hcc.homeowner_user_id = auth.uid()
    )
    or exists (
      select 1
        from public.home_contractor_connections hcc
        join public.organization_members om
          on om.organization_id = hcc.organization_id
         and om.user_id = auth.uid()
         and om.role in ('owner', 'admin')
       where hcc.id = p_connection_id
    ),
    false
  );
$$;

create or replace function public.log_property_access_event(
  p_property_id uuid,
  p_organization_id uuid,
  p_event_type text,
  p_permission_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (
    public.current_user_is_platform_admin()
    or public.current_user_owns_property(p_property_id)
    or public.current_user_has_property_access(p_property_id, coalesce(p_permission_key, 'basic_profile'))
  ) then
    raise exception 'Not allowed to audit access for this property.';
  end if;

  insert into public.property_access_audit_events (
    actor_user_id,
    property_id,
    organization_id,
    event_type,
    permission_key,
    metadata
  ) values (
    auth.uid(),
    p_property_id,
    p_organization_id,
    p_event_type,
    p_permission_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Keep homeowner account rows available for direct homeowner signups.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org_id uuid;
  v_referral_code text;
begin
  v_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'customer');
  if v_role not in ('customer', 'admin', 'contractor', 'platform_admin') then
    v_role := 'customer';
  end if;

  v_org_id := nullif(new.raw_user_meta_data->>'organization_id', '')::uuid;
  v_referral_code := nullif(new.raw_user_meta_data->>'referral_code', '');

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

  if v_role = 'customer' then
    insert into public.homeowner_accounts (user_id, display_name, default_property_id)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'property_id', '')::uuid
    )
    on conflict (user_id) do update
    set display_name = coalesce(nullif(excluded.display_name, ''), public.homeowner_accounts.display_name),
        default_property_id = coalesce(public.homeowner_accounts.default_property_id, excluded.default_property_id);
  end if;

  if v_org_id is not null and v_role in ('admin', 'contractor') then
    insert into public.organization_members (organization_id, user_id, role)
    values (v_org_id, new.id, coalesce(nullif(new.raw_user_meta_data->>'member_role', ''), 'owner'))
    on conflict (organization_id, user_id) do nothing;
  end if;

  if v_referral_code is not null then
    insert into public.account_referrals (
      referral_code,
      referrer_type,
      referrer_organization_id,
      referred_account_type,
      referred_user_id,
      status,
      reward_note
    )
    select
      crc.code,
      'contractor',
      crc.organization_id,
      case when v_role = 'customer' then 'homeowner' else 'contractor' end,
      new.id,
      'qualified',
      'Qualified because referral code was used during new account creation.'
    from public.contractor_referral_codes crc
    where crc.code = v_referral_code
      and crc.is_active = true
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------

alter table public.homeowner_accounts enable row level security;
alter table public.contractor_referral_codes enable row level security;
alter table public.account_referrals enable row level security;
alter table public.home_contractor_connections enable row level security;
alter table public.property_access_audit_events enable row level security;

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in (
        'homeowner_accounts',
        'contractor_referral_codes',
        'account_referrals',
        'home_contractor_connections',
        'property_access_audit_events'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy "Homeowner accounts: platform admins manage all"
  on public.homeowner_accounts
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Homeowner accounts: users manage own"
  on public.homeowner_accounts
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Contractor referral codes: public read active"
  on public.contractor_referral_codes
  for select
  to anon, authenticated
  using (is_active = true);

create policy "Contractor referral codes: platform admins manage all"
  on public.contractor_referral_codes
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Contractor referral codes: org managers manage own"
  on public.contractor_referral_codes
  for all
  to authenticated
  using (public.current_user_can_manage_organization(organization_id))
  with check (public.current_user_can_manage_organization(organization_id));

create policy "Account referrals: platform admins manage all"
  on public.account_referrals
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Account referrals: referrers read own"
  on public.account_referrals
  for select
  to authenticated
  using (
    referrer_user_id = auth.uid()
    or (
      referrer_organization_id is not null
      and public.current_user_can_manage_organization(referrer_organization_id)
    )
  );

create policy "Account referrals: referred users read own"
  on public.account_referrals
  for select
  to authenticated
  using (referred_user_id = auth.uid());

create policy "Home contractor connections: platform admins manage all"
  on public.home_contractor_connections
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Home contractor connections: homeowners manage own"
  on public.home_contractor_connections
  for all
  to authenticated
  using (homeowner_user_id = auth.uid())
  with check (
    homeowner_user_id = auth.uid()
    and public.current_user_owns_property(property_id)
  );

create policy "Home contractor connections: org managers read own"
  on public.home_contractor_connections
  for select
  to authenticated
  using (public.current_user_can_manage_organization(organization_id));

create policy "Home contractor connections: org managers request own"
  on public.home_contractor_connections
  for insert
  to authenticated
  with check (
    public.current_user_can_manage_organization(organization_id)
    and status = 'pending'
  );

create policy "Property access audit: platform admins read all"
  on public.property_access_audit_events
  for select
  to authenticated
  using (public.current_user_is_platform_admin());

create policy "Property access audit: homeowners read own property"
  on public.property_access_audit_events
  for select
  to authenticated
  using (public.current_user_owns_property(property_id));

create policy "Property access audit: org managers read own organization"
  on public.property_access_audit_events
  for select
  to authenticated
  using (
    organization_id is not null
    and public.current_user_can_manage_organization(organization_id)
  );

create policy "Property access audit: authenticated insert own events"
  on public.property_access_audit_events
  for insert
  to authenticated
  with check (actor_user_id = auth.uid());

-- Add homeowner-owned and connected-contractor read paths to existing app tables.
-- Existing organization policies remain in place for the current contractor workflow.

drop policy if exists "Properties: homeowners own property records" on public.properties;
create policy "Properties: homeowners own property records"
  on public.properties
  for all
  to authenticated
  using (public.current_user_owns_property(id))
  with check (owner_user_id = auth.uid() or public.current_user_owns_property(id));

drop policy if exists "Properties: connected contractors read shared basic profile" on public.properties;
create policy "Properties: connected contractors read shared basic profile"
  on public.properties
  for select
  to authenticated
  using (public.current_user_has_property_access(id, 'basic_profile'));

drop policy if exists "Vendors: connected contractors read shared vendors" on public.vendors;
create policy "Vendors: connected contractors read shared vendors"
  on public.vendors
  for select
  to authenticated
  using (public.current_user_has_property_access(property_id, 'vendors'));

drop policy if exists "Rooms: connected contractors read shared property details" on public.rooms;
create policy "Rooms: connected contractors read shared property details"
  on public.rooms
  for select
  to authenticated
  using (public.current_user_has_property_access(property_id, 'property_details'));

drop policy if exists "Checklist: connected contractors read shared property details" on public.checklist_items;
create policy "Checklist: connected contractors read shared property details"
  on public.checklist_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = checklist_items.room_id
        and public.current_user_has_property_access(r.property_id, 'property_details')
    )
  );

drop policy if exists "Findings: connected contractors read shared reports" on public.findings;
create policy "Findings: connected contractors read shared reports"
  on public.findings
  for select
  to authenticated
  using (public.current_user_has_property_access(property_id, 'reports'));

drop policy if exists "Photos: connected contractors read shared photos" on public.photos;
create policy "Photos: connected contractors read shared photos"
  on public.photos
  for select
  to authenticated
  using (public.current_user_has_property_access(property_id, 'photos'));

drop policy if exists "Requests: connected contractors read shared requests" on public.requests;
create policy "Requests: connected contractors read shared requests"
  on public.requests
  for select
  to authenticated
  using (public.current_user_has_property_access(property_id, 'service_requests'));

drop policy if exists "Invoices: connected contractors read shared invoices" on public.invoices;
create policy "Invoices: connected contractors read shared invoices"
  on public.invoices
  for select
  to authenticated
  using (public.current_user_has_property_access(property_id, 'invoices') and status <> 'Draft');

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'report_logs') then
    execute 'drop policy if exists "Report logs: connected contractors read shared reports" on public.report_logs';
    execute '
      create policy "Report logs: connected contractors read shared reports"
        on public.report_logs
        for select
        to authenticated
        using (
          public.current_user_has_property_access(property_id, ''reports'')
          and coalesce(notes, '''') like ''%[Published to Customer]%''
          and coalesce(notes, '''') not like ''%[Internal Draft]%''
        )
    ';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maintenance_schedule') then
    execute 'drop policy if exists "Maintenance schedule: connected contractors read shared maintenance" on public.maintenance_schedule';
    execute '
      create policy "Maintenance schedule: connected contractors read shared maintenance"
        on public.maintenance_schedule
        for select
        to authenticated
        using (public.current_user_has_property_access(property_id, ''maintenance''))
    ';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'appointments') then
    execute 'drop policy if exists "Appointments: connected contractors read shared appointments" on public.appointments';
    execute '
      create policy "Appointments: connected contractors read shared appointments"
        on public.appointments
        for select
        to authenticated
        using (public.current_user_has_property_access(property_id, ''appointments''))
    ';
  end if;
end $$;

grant select, insert, update, delete on public.homeowner_accounts to authenticated;
grant select, insert, update, delete on public.contractor_referral_codes to authenticated;
grant select on public.contractor_referral_codes to anon;
grant select, insert, update, delete on public.account_referrals to authenticated;
grant select, insert, update, delete on public.home_contractor_connections to authenticated;
grant select, insert on public.property_access_audit_events to authenticated;
grant execute on function public.log_property_access_event(uuid, uuid, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
