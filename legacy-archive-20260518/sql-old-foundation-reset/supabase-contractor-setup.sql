-- ServSync contractor setup link support.
-- Paste into Supabase SQL Editor. Safe to re-run.

create or replace function public.get_contractor_setup_organization(p_organization_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug,
    'owner_email', o.owner_email,
    'support_email', o.support_email,
    'account_status', o.account_status,
    'subscription_status', o.subscription_status
  )
  from public.organizations o
  where o.id = p_organization_id
    and o.account_status in ('active', 'paused')
  limit 1;
$$;

revoke all on function public.get_contractor_setup_organization(uuid) from public;
grant execute on function public.get_contractor_setup_organization(uuid) to anon, authenticated;

create or replace function public.setup_contractor_account(
  p_organization_id uuid,
  p_full_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to finish contractor setup.';
  end if;

  select *
    into v_org
    from public.organizations
   where id = p_organization_id
     and account_status in ('active', 'paused')
   limit 1;

  if v_org.id is null then
    raise exception 'Contractor setup link not found or inactive.';
  end if;

  select email
    into v_email
    from auth.users
   where id = auth.uid();

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    property_id,
    active_organization_id
  ) values (
    auth.uid(),
    coalesce(v_email, ''),
    coalesce(p_full_name, ''),
    'contractor',
    null,
    p_organization_id
  )
  on conflict (id) do update
  set email = coalesce(excluded.email, public.profiles.email),
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      role = case
        when public.profiles.role = 'platform_admin' then public.profiles.role
        else 'contractor'
      end,
      property_id = null,
      active_organization_id = p_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (p_organization_id, auth.uid(), 'owner')
  on conflict (organization_id, user_id) do update
  set role = excluded.role;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'organization_name', v_org.name,
    'user_id', auth.uid(),
    'email', coalesce(v_email, '')
  );
end;
$$;

revoke all on function public.setup_contractor_account(uuid, text) from public;
grant execute on function public.setup_contractor_account(uuid, text) to authenticated;

notify pgrst, 'reload schema';
