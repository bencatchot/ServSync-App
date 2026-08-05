-- ServSync Admin/Office Customer Creation Parity v1.
-- Extends the existing atomic local customer + initial property RPC to the
-- contractor owner and active admin/office members without changing table RLS.
--
-- Apply after:
--   - servsync-customer-management-edit-boundary.sql
--   - servsync-contractor-local-customer-read-list-parity.sql

begin;

do $$
begin
  if to_regclass('public.contractor_local_contacts') is null
     or to_regclass('public.contractor_local_homes') is null then
    raise exception 'Missing required local customer tables.';
  end if;

  if to_regprocedure('public.servsync_current_contractor_profile()') is null
     or to_regprocedure('public.current_user_can_manage_contractor_customers(uuid)') is null
     or to_regprocedure('public.servsync_create_local_contact(text,text,text,text,text,text,text,text,text,text,text,text,text,text)') is null then
    raise exception 'Missing required contractor identity, customer-management, or creation functions.';
  end if;
end;
$$;

create or replace function public.servsync_create_local_contact(
  p_display_name   text default '',
  p_phone          text default '',
  p_email          text default '',
  p_notes          text default '',
  p_home_nickname  text default 'Home',
  p_address_line1  text default '',
  p_address_line2  text default '',
  p_city           text default '',
  p_state          text default '',
  p_zip_code       text default '',
  p_home_type      text default '',
  p_year_built     text default '',
  p_square_feet    text default '',
  p_home_notes     text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'Customer creation is unavailable.';
  end if;

  select contractor.id
    into v_contractor_id
    from public.servsync_current_contractor_profile() contractor
   where public.current_user_can_manage_contractor_customers(contractor.id)
   limit 1;

  if v_contractor_id is null then
    raise insufficient_privilege using message = 'Customer creation is unavailable.';
  end if;

  if length(trim(coalesce(p_display_name, ''))) = 0 then
    raise exception 'Local customer name is required.';
  end if;

  insert into public.contractor_local_contacts (
    contractor_id,
    display_name,
    phone,
    email,
    notes
  ) values (
    v_contractor_id,
    trim(coalesce(p_display_name, '')),
    trim(coalesce(p_phone, '')),
    trim(coalesce(p_email, '')),
    coalesce(p_notes, '')
  )
  returning * into v_contact;

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
    v_contractor_id,
    v_contact.id,
    coalesce(nullif(trim(coalesce(p_home_nickname, '')), ''), 'Home'),
    trim(coalesce(p_address_line1, '')),
    trim(coalesce(p_address_line2, '')),
    trim(coalesce(p_city, '')),
    trim(coalesce(p_state, '')),
    trim(coalesce(p_zip_code, '')),
    trim(coalesce(p_home_type, '')),
    trim(coalesce(p_year_built, '')),
    trim(coalesce(p_square_feet, '')),
    coalesce(p_home_notes, '')
  )
  returning * into v_home;

  return jsonb_build_object(
    'contact', jsonb_build_object(
      'id', v_contact.id,
      'contractor_id', v_contact.contractor_id,
      'display_name', v_contact.display_name,
      'phone', v_contact.phone,
      'email', v_contact.email,
      'notes', v_contact.notes,
      'created_at', v_contact.created_at,
      'updated_at', v_contact.updated_at
    ),
    'home', jsonb_build_object(
      'id', v_home.id,
      'contractor_id', v_home.contractor_id,
      'local_contact_id', v_home.local_contact_id,
      'nickname', v_home.nickname,
      'address_line1', v_home.address_line1,
      'address_line2', v_home.address_line2,
      'city', v_home.city,
      'state', v_home.state,
      'zip_code', v_home.zip_code,
      'home_type', v_home.home_type,
      'year_built', v_home.year_built,
      'square_feet', v_home.square_feet,
      'notes', v_home.notes,
      'created_at', v_home.created_at,
      'updated_at', v_home.updated_at
    )
  );
end;
$$;

alter function public.servsync_create_local_contact(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) owner to postgres;

revoke all on function public.servsync_create_local_contact(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.servsync_create_local_contact(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from anon;
revoke all on function public.servsync_create_local_contact(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from authenticated;
grant execute on function public.servsync_create_local_contact(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

comment on function public.servsync_create_local_contact(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) is 'Atomically creates a contractor-managed local customer and initial property for the current contractor owner or active admin/office member.';

notify pgrst, 'reload schema';

commit;
