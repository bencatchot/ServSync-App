-- ServSync homeowner profile update RPC.
-- Paste this into Supabase SQL Editor before testing Homeowner Portal > Profile.
-- Safe to re-run.

create or replace function public.update_my_homeowner_profile(
  p_property_id uuid,
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
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to update your profile.';
  end if;

  if not public.current_user_owns_property(p_property_id) then
    raise exception 'You can only update a home profile you own.';
  end if;

  update public.properties
     set name = coalesce(nullif(p_name, ''), 'My Home'),
         address = coalesce(p_address, ''),
         owner = coalesce(p_owner, ''),
         phone = coalesce(p_phone, ''),
         email = coalesce(p_email, '')
   where id = p_property_id
   returning * into v_property;

  update public.profiles
     set full_name = coalesce(nullif(p_owner, ''), full_name),
         property_id = coalesce(property_id, p_property_id)
   where id = auth.uid();

  insert into public.homeowner_accounts (
    user_id,
    display_name,
    phone,
    default_property_id,
    updated_at
  ) values (
    auth.uid(),
    coalesce(p_owner, ''),
    coalesce(p_phone, ''),
    p_property_id,
    now()
  )
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      phone = excluded.phone,
      default_property_id = excluded.default_property_id,
      updated_at = now();

  insert into public.property_access_audit_events (
    actor_user_id,
    property_id,
    organization_id,
    event_type,
    metadata
  ) values (
    auth.uid(),
    p_property_id,
    v_property.organization_id,
    'homeowner_profile_updated',
    jsonb_build_object('updated_fields', array['name', 'address', 'owner', 'phone', 'email'])
  );

  return v_property;
end;
$$;

grant execute on function public.update_my_homeowner_profile(uuid, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
