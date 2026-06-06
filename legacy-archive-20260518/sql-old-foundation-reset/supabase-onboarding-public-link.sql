-- Public onboarding link reader for Prevention Pros.
-- Allows the onboarding form to load the one customer record from the emailed link
-- without opening the full customer database to anonymous visitors.

create or replace function public.get_onboarding_customer(p_property_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'address', p.address,
    'owner', p.owner,
    'phone', p.phone,
    'email', p.email,
    'plan', p.plan,
    'home_sqft', p.home_sqft,
    'home_year_built', p.home_year_built,
    'home_stories', p.home_stories,
    'home_garage', p.home_garage,
    'home_pool', p.home_pool,
    'home_roof_type', p.home_roof_type,
    'home_roof_age', p.home_roof_age,
    'home_hvac_type', p.home_hvac_type,
    'home_hvac_age', p.home_hvac_age,
    'home_notes', p.home_notes,
    'is_active', p.is_active,
    'vendors', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', v.id,
          'type', v.type,
          'company', v.company,
          'phone', v.phone,
          'account', v.account,
          'notes', v.notes
        ) order by v.created_at)
        from public.vendors v
        where v.property_id = p.id
      ),
      '[]'::jsonb
    )
  )
  from public.properties p
  where p.id = p_property_id
    and coalesce(p.is_active, true) = true
  limit 1;
$$;

revoke all on function public.get_onboarding_customer(uuid) from public;
grant execute on function public.get_onboarding_customer(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
