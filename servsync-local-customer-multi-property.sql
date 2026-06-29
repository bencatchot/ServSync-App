-- ServSync local customer multi-property foundation.
-- Adds a contractor-scoped RPC for appending another local property to an existing local customer.

begin;

create or replace function public.servsync_create_local_home(
  p_local_contact_id uuid,
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
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_contact
    from public.contractor_local_contacts
   where id = p_local_contact_id
   limit 1;

  if v_contact.id is null then
    raise exception 'Local customer not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_contact.contractor_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to add a property for this customer.';
  end if;

  if length(trim(coalesce(p_nickname, ''))) = 0
     and length(trim(coalesce(p_address_line1, ''))) = 0 then
    raise exception 'Enter a property label or street address.';
  end if;

  insert into public.contractor_local_homes (
    contractor_id,
    local_contact_id,
    nickname,
    address_line1,
    address_line2,
    city,
    state,
    zip_code,
    home_type,
    year_built,
    square_feet,
    notes
  ) values (
    v_contact.contractor_id,
    v_contact.id,
    coalesce(nullif(trim(coalesce(p_nickname, '')), ''), 'Property'),
    trim(coalesce(p_address_line1, '')),
    trim(coalesce(p_address_line2, '')),
    trim(coalesce(p_city, '')),
    trim(coalesce(p_state, '')),
    trim(coalesce(p_zip_code, '')),
    '',
    '',
    '',
    coalesce(p_notes, '')
  )
  returning * into v_home;

  return to_jsonb(v_home);
end;
$$;

revoke execute on function public.servsync_create_local_home(uuid, text, text, text, text, text, text, text) from public;
revoke execute on function public.servsync_create_local_home(uuid, text, text, text, text, text, text, text) from anon;
grant execute on function public.servsync_create_local_home(uuid, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
