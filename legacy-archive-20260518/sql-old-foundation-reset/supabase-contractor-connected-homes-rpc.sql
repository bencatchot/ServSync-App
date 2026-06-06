-- ServSync contractor connected homeowners RPC.
-- Paste this into Supabase SQL Editor before testing Contractor Workspace > Connected.
-- Safe to re-run.

create or replace function public.get_contractor_connected_homes()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'connection_id', hcc.id,
        'property_id', hcc.property_id,
        'homeowner_user_id', hcc.homeowner_user_id,
        'status', hcc.status,
        'source', hcc.source,
        'permissions', hcc.permissions,
        'created_at', hcc.created_at,
        'updated_at', hcc.updated_at,
        'property', jsonb_build_object(
          'name', p.name,
          'address', case
            when coalesce((hcc.permissions->>'property_details')::boolean, false) then p.address
            else ''
          end,
          'owner', case
            when coalesce((hcc.permissions->>'basic_profile')::boolean, false) then p.owner
            else ''
          end,
          'phone', case
            when coalesce((hcc.permissions->>'basic_profile')::boolean, false) then p.phone
            else ''
          end,
          'email', case
            when coalesce((hcc.permissions->>'basic_profile')::boolean, false) then p.email
            else ''
          end,
          'plan', p.plan,
          'home_sqft', case
            when coalesce((hcc.permissions->>'property_details')::boolean, false) then p.home_sqft
            else ''
          end,
          'home_year_built', case
            when coalesce((hcc.permissions->>'property_details')::boolean, false) then p.home_year_built
            else ''
          end,
          'home_hvac_type', case
            when coalesce((hcc.permissions->>'property_details')::boolean, false) then p.home_hvac_type
            else ''
          end,
          'home_roof_type', case
            when coalesce((hcc.permissions->>'property_details')::boolean, false) then p.home_roof_type
            else ''
          end
        )
      )
      order by hcc.created_at desc
    ),
    '[]'::jsonb
  )
  from public.home_contractor_connections hcc
  join public.properties p on p.id = hcc.property_id
  where hcc.organization_id = public.current_user_organization_id()
    and hcc.status = 'active'
    and public.current_user_can_manage_organization(hcc.organization_id);
$$;

grant execute on function public.get_contractor_connected_homes() to authenticated;

notify pgrst, 'reload schema';
