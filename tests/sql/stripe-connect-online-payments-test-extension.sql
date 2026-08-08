alter table public.profiles add column email text not null default '';
alter table public.contractor_profiles
  add column business_name text not null default '',
  add column email text not null default '',
  add column account_status text not null default 'active';

create function public.current_user_can_access_contractor(p_contractor_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.contractor_profiles contractor
     where contractor.id = p_contractor_id and contractor.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.contractor_team_members member
     where member.contractor_id = p_contractor_id
       and member.user_id = auth.uid()
       and member.status = 'active'
  )
$$;
alter function public.current_user_can_access_contractor(uuid) owner to postgres;
grant execute on function public.current_user_can_access_contractor(uuid) to authenticated;

create table public.contractor_local_contacts (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id),
  display_name text not null,
  email text,
  homeowner_user_id uuid references public.profiles(id),
  claimed_at timestamptz,
  archived_at timestamptz
);

create table public.contractor_local_homes (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id),
  local_contact_id uuid not null references public.contractor_local_contacts(id),
  home_id uuid,
  claimed_at timestamptz,
  archived_at timestamptz
);

create table public.local_invoice_delivery_links (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id),
  invoice_id uuid not null references public.invoices(id),
  local_contact_id uuid not null references public.contractor_local_contacts(id),
  local_home_id uuid not null references public.contractor_local_homes(id),
  status text not null,
  expires_at timestamptz not null
);

create table public.local_invoice_delivery_sessions (
  session_hash bytea primary key,
  delivery_link_id uuid not null references public.local_invoice_delivery_links(id),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  contact_claimed_at_at_creation timestamptz,
  home_claimed_at_at_creation timestamptz
);

revoke all on all tables in schema public from public, anon, authenticated, service_role;

