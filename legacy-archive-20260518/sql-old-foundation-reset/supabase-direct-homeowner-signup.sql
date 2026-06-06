-- ServSync direct homeowner signup support.
-- Paste this into Supabase SQL Editor after supabase-homeowner-ownership-foundation.sql.
-- Safe to re-run.

insert into public.organizations (
  name,
  slug,
  owner_email,
  support_email,
  website_url,
  plan_name,
  monthly_price_cents,
  account_status,
  subscription_status
)
values (
  'ServSync Homeowners',
  'servsync-homeowners',
  'support@servsync.app',
  'support@servsync.app',
  'https://servsync.app',
  'Homeowner Platform',
  0,
  'active',
  'active'
)
on conflict (slug) do update
set name = excluded.name,
    support_email = excluded.support_email,
    website_url = excluded.website_url,
    updated_at = now();

create or replace function public.servsync_homeowner_organization_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.organizations where slug = 'servsync-homeowners' limit 1;
$$;

create or replace function public.set_property_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.current_user_organization_id();
  end if;

  if new.organization_id is null
     and new.owner_user_id is not null
     and new.owner_user_id = auth.uid() then
    new.organization_id := public.servsync_homeowner_organization_id();
  end if;

  if new.organization_id is null then
    raise exception 'No organization is linked to this account.';
  end if;

  return new;
end;
$$;

create or replace function public.create_homeowner_owned_property(
  p_id uuid,
  p_name text,
  p_address text,
  p_owner text,
  p_phone text,
  p_email text
)
returns public.properties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property public.properties;
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create a home profile.';
  end if;

  v_org_id := public.servsync_homeowner_organization_id();
  if v_org_id is null then
    raise exception 'ServSync homeowner organization is not configured.';
  end if;

  insert into public.properties (
    id,
    organization_id,
    owner_user_id,
    name,
    address,
    owner,
    phone,
    email,
    plan,
    is_active,
    homeowner_visible
  ) values (
    p_id,
    v_org_id,
    auth.uid(),
    coalesce(nullif(p_name, ''), 'My Home'),
    coalesce(p_address, ''),
    coalesce(p_owner, ''),
    coalesce(p_phone, ''),
    coalesce(p_email, ''),
    'No active plan',
    true,
    true
  )
  returning * into v_property;

  update public.profiles
     set property_id = v_property.id
   where id = auth.uid();

  insert into public.homeowner_accounts (
    user_id,
    display_name,
    phone,
    default_property_id
  ) values (
    auth.uid(),
    coalesce(nullif(p_owner, ''), ''),
    coalesce(p_phone, ''),
    v_property.id
  )
  on conflict (user_id) do update
  set display_name = coalesce(nullif(excluded.display_name, ''), public.homeowner_accounts.display_name),
      phone = coalesce(nullif(excluded.phone, ''), public.homeowner_accounts.phone),
      default_property_id = excluded.default_property_id,
      updated_at = now();

  return v_property;
end;
$$;

grant execute on function public.create_homeowner_owned_property(uuid, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
