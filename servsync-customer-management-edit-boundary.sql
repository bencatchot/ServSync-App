-- ServSync Customer Management Edit Boundary Correction v1.
-- Separates contractor-created customer identity/property management from
-- operational Job-write authority without changing local-customer reads.
--
-- Run after:
--   - servsync-contractor-team-access.sql
--   - servsync-local-field-work.sql
--   - servsync-local-customer-multi-property.sql
--   - servsync-local-customer-profile-edit.sql
--   - servsync-local-property-edit.sql

begin;

do $$
begin
  if to_regclass('public.contractor_profiles') is null
     or to_regclass('public.contractor_team_members') is null
     or to_regclass('public.contractor_local_contacts') is null
     or to_regclass('public.contractor_local_homes') is null
     or to_regclass('public.contractor_local_customer_claim_invites') is null then
    raise exception 'Missing required customer-management tables.';
  end if;

  if to_regprocedure('public.servsync_update_local_contact_profile(uuid,text,text,text,text)') is null
     or to_regprocedure('public.servsync_create_local_home(uuid,text,text,text,text,text,text,text)') is null
     or to_regprocedure('public.servsync_update_local_home(uuid,text,text,text,text,text,text,text)') is null then
    raise exception 'Missing required local customer/property RPCs.';
  end if;
end;
$$;

create or replace function public.current_user_can_manage_contractor_customers(
  p_contractor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and p_contractor_id is not null
    and (
      exists (
        select 1
          from public.contractor_profiles contractor
         where contractor.id = p_contractor_id
           and contractor.owner_user_id = auth.uid()
      )
      or exists (
        select 1
          from public.contractor_team_members member
         where member.contractor_id = p_contractor_id
           and member.user_id = auth.uid()
           and member.status = 'active'
           and member.role in ('admin', 'office')
      )
    );
$$;

comment on function public.current_user_can_manage_contractor_customers(uuid) is
  'Returns whether the signed-in contractor owner or active admin/office member may manage contractor-created customer identity and property records.';

revoke all on function public.current_user_can_manage_contractor_customers(uuid) from public;
revoke all on function public.current_user_can_manage_contractor_customers(uuid) from anon;
revoke all on function public.current_user_can_manage_contractor_customers(uuid) from authenticated;
grant execute on function public.current_user_can_manage_contractor_customers(uuid) to authenticated;

create or replace function public.servsync_update_local_contact_profile(
  p_local_contact_id uuid,
  p_display_name text default '',
  p_phone text default '',
  p_email text default '',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contractor_local_contacts;
  v_has_claimed_home boolean := false;
  v_next_display_name text;
  v_next_phone text;
  v_next_email text;
  v_next_notes text;
  v_public_claim_fields_changed boolean := false;
  v_revoked_invite_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select contact.*
    into v_contact
    from public.contractor_local_contacts contact
   where contact.id = p_local_contact_id
     and public.current_user_can_manage_contractor_customers(contact.contractor_id)
   for update of contact;

  if v_contact.id is null then
    raise exception 'Local customer is unavailable.';
  end if;

  select exists (
    select 1
      from public.contractor_local_homes home
     where home.local_contact_id = v_contact.id
       and home.contractor_id = v_contact.contractor_id
       and (home.home_id is not null or home.claimed_at is not null)
  )
    into v_has_claimed_home;

  if v_contact.homeowner_user_id is not null
     or v_contact.claimed_at is not null
     or v_has_claimed_home then
    raise exception 'This customer is linked to a homeowner profile. Customer details are homeowner-controlled after claim.';
  end if;

  v_next_display_name := trim(coalesce(p_display_name, ''));
  if length(v_next_display_name) = 0 then
    raise exception 'Enter a customer name.';
  end if;

  v_next_phone := trim(coalesce(p_phone, ''));
  v_next_email := trim(coalesce(p_email, ''));
  v_next_notes := coalesce(p_notes, '');

  v_public_claim_fields_changed :=
    v_next_display_name is distinct from coalesce(v_contact.display_name, '')
    or v_next_phone is distinct from coalesce(v_contact.phone, '')
    or v_next_email is distinct from coalesce(v_contact.email, '');

  update public.contractor_local_contacts
     set display_name = v_next_display_name,
         phone = v_next_phone,
         email = v_next_email,
         notes = v_next_notes,
         updated_at = now()
   where id = v_contact.id
     and contractor_id = v_contact.contractor_id
   returning * into v_contact;

  if v_public_claim_fields_changed then
    update public.contractor_local_customer_claim_invites
       set status = 'revoked',
           revoked_at = coalesce(revoked_at, now()),
           updated_at = now()
     where contractor_id = v_contact.contractor_id
       and local_contact_id = v_contact.id
       and status = 'pending';

    get diagnostics v_revoked_invite_count = row_count;
  end if;

  return to_jsonb(v_contact)
    || jsonb_build_object('revoked_pending_claim_invite_count', v_revoked_invite_count);
end;
$$;

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

  select contact.*
    into v_contact
    from public.contractor_local_contacts contact
   where contact.id = p_local_contact_id
     and public.current_user_can_manage_contractor_customers(contact.contractor_id)
   for share of contact;

  if v_contact.id is null then
    raise exception 'Local customer is unavailable.';
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
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select home.*
    into v_home
    from public.contractor_local_homes home
    join public.contractor_local_contacts contact
      on contact.id = home.local_contact_id
     and contact.contractor_id = home.contractor_id
   where home.id = p_local_home_id
     and public.current_user_can_manage_contractor_customers(home.contractor_id)
   for update of home;

  if v_home.id is null then
    raise exception 'Local property is unavailable.';
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
     and contractor_id = v_home.contractor_id
   returning * into v_home;

  return to_jsonb(v_home);
end;
$$;

revoke all on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) from public;
revoke all on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) from anon;
revoke all on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) from authenticated;
grant execute on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) to authenticated;

revoke all on function public.servsync_create_local_home(uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.servsync_create_local_home(uuid, text, text, text, text, text, text, text) from anon;
revoke all on function public.servsync_create_local_home(uuid, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.servsync_create_local_home(uuid, text, text, text, text, text, text, text) to authenticated;

revoke all on function public.servsync_update_local_home(uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.servsync_update_local_home(uuid, text, text, text, text, text, text, text) from anon;
revoke all on function public.servsync_update_local_home(uuid, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.servsync_update_local_home(uuid, text, text, text, text, text, text, text) to authenticated;

comment on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) is
  'Updates an authorized contractor-created unclaimed customer profile; owner/admin/office only.';
comment on function public.servsync_create_local_home(uuid, text, text, text, text, text, text, text) is
  'Creates a contractor-managed property for an authorized local customer; owner/admin/office only.';
comment on function public.servsync_update_local_home(uuid, text, text, text, text, text, text, text) is
  'Updates an authorized unclaimed contractor-managed property; owner/admin/office only.';

notify pgrst, 'reload schema';

commit;
