-- ServSync local customer property edit foundation.
-- Adds a contractor-scoped RPC for editing unclaimed contractor-created local properties.

begin;

create or replace function public.servsync_update_local_home(
  p_local_home_id uuid,
  p_nickname text default '',
  p_address_line1 text default '',
  p_address_line2 text default '',
  p_city text default '',
  p_state text default '',
  p_zip_code text default '',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_home public.contractor_local_homes;
  v_contact public.contractor_local_contacts;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_home
    from public.contractor_local_homes
   where id = p_local_home_id
   for update;

  if v_home.id is null then
    raise exception 'Local property not found.';
  end if;

  select *
    into v_contact
    from public.contractor_local_contacts
   where id = v_home.local_contact_id
     and contractor_id = v_home.contractor_id
   limit 1;

  if v_contact.id is null then
    raise exception 'Local customer not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_home.contractor_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to edit this property.';
  end if;

  if v_home.home_id is not null or v_home.claimed_at is not null then
    raise exception 'This property is linked to a homeowner profile. Property details are homeowner-controlled after claim.';
  end if;

  if length(trim(coalesce(p_nickname, ''))) = 0
     and length(trim(coalesce(p_address_line1, ''))) = 0 then
    raise exception 'Enter a property label or street address.';
  end if;

  update public.contractor_local_homes
     set nickname = coalesce(nullif(trim(coalesce(p_nickname, '')), ''), 'Property'),
         address_line1 = trim(coalesce(p_address_line1, '')),
         address_line2 = trim(coalesce(p_address_line2, '')),
         city = trim(coalesce(p_city, '')),
         state = trim(coalesce(p_state, '')),
         zip_code = trim(coalesce(p_zip_code, '')),
         notes = coalesce(p_notes, ''),
         updated_at = now()
   where id = v_home.id
   returning * into v_home;

  return to_jsonb(v_home);
end;
$$;

revoke execute on function public.servsync_update_local_home(uuid, text, text, text, text, text, text, text) from public;
revoke execute on function public.servsync_update_local_home(uuid, text, text, text, text, text, text, text) from anon;
grant execute on function public.servsync_update_local_home(uuid, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
